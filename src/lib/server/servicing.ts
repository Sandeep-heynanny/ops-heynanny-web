import { FieldValue, Timestamp } from "firebase-admin/firestore";

import { adminDb } from "@/lib/server/admin";
import type { ServicingFormValue } from "@/lib/servicing-form";

/**
 * Send a converted enquiry to servicing with the sales team's Servicing form.
 * Only a submitted form moves a customer to servicing: the form is stored on the
 * case as `intake` (the servicing steps unlock), and on the enquiry as
 * `ops.servicingFormAt` (the "Form pending" pill becomes "In servicing").
 * Submitting again replaces the form on the same case.
 *
 * Same rules as the payments Cloud Function (website repo, functions/src/servicing):
 * one open case per customer phone. If the customer already has an open case, the
 * enquiry is linked to it; otherwise a case is created. Live payments from the same
 * phone that aren't in servicing yet are added to the case. The enquiry records
 * `ops.servicingCaseId`, so sending twice does nothing.
 */
export type FromLeadOutcome =
  "created" | "linked" | "already" | "not_converted" | "no_phone" | "not_found";

const toDate = (v: unknown) =>
  v instanceof Timestamp ? v.toDate() : v instanceof Date ? v : new Date(0);

/** The ways Cashfree stores the same phone on payments. */
const phoneVariants = (ten: string) => [
  ten,
  `+91${ten}`,
  `91${ten}`,
  `0${ten}`,
  `+91 ${ten}`,
];

export async function sendLeadToServicing(
  leadId: string,
  by: string,
  form: ServicingFormValue,
): Promise<{ outcome: FromLeadOutcome; caseId: string | null }> {
  const db = adminDb();
  const leadRef = db.collection("leads").doc(leadId);
  const first = await leadRef.get();
  if (!first.exists) return { outcome: "not_found", caseId: null };
  // The form's number wins (sales may have corrected it).
  const ten = form.customerPhone.replace(/\D/g, "").slice(-10);
  if (!/^[6-9]\d{9}$/.test(ten)) return { outcome: "no_phone", caseId: null };
  const phone = `+91${ten}`;

  // Payments from this customer that aren't in servicing yet (read outside the transaction, re-checked inside).
  const paySnap = await db
    .collection("cashfreePayments")
    .where("customer_details.customer_phone", "in", phoneVariants(ten))
    .get();
  const payRefs = paySnap.docs
    .filter(
      (d) =>
        d.get("payment_status") === "SUCCESS" &&
        d.get("environment") === "production" &&
        typeof d.get("servicing_case_id") !== "string",
    )
    .map((d) => d.ref);
  const now = new Date();

  return db.runTransaction(async (tx) => {
    // Every read before any write.
    const lead = await tx.get(leadRef);
    const l = lead.data();
    if (!l) return { outcome: "not_found" as const, caseId: null };
    if (l.status !== "converted")
      return { outcome: "not_converted" as const, caseId: null };
    const linkedId =
      typeof l.ops?.servicingCaseId === "string"
        ? (l.ops.servicingCaseId as string)
        : null;
    const linked = linkedId
      ? await tx.get(db.collection("servicing").doc(linkedId))
      : null;
    const casesSnap = await tx.get(
      db.collection("servicing").where("customer.phone", "==", phone),
    );
    const pays = await Promise.all(payRefs.map((r) => tx.get(r)));

    const newPayments = pays
      .filter((p) => p.exists && typeof p.get("servicing_case_id") !== "string")
      .map((p) => ({
        ref: p.ref,
        entry: {
          cfPaymentId: String(p.get("cf_payment_id")),
          orderId: String(p.get("order_id")),
          amount: Number(p.get("payment_amount")) || 0,
          paidAt: (p.get("payment_time") as string) ?? null,
        },
      }));

    // The case this enquiry already went to (e.g. linked by a payment), else the customer's open case.
    const open =
      linked?.exists && linked.get("stage") !== "cancelled"
        ? linked
        : casesSnap.docs
            .filter((d) => d.get("stage") !== "cancelled")
            .sort(
              (a, b) =>
                toDate(b.get("createdAt")).getTime() -
                toDate(a.get("createdAt")).getTime(),
            )[0];
    const intake = { ...form, submittedAt: now, submittedBy: by, leadId };

    let caseId: string;
    let outcome: FromLeadOutcome;
    if (open) {
      caseId = open.id;
      outcome = open.get("intake") ? "already" : "linked";
      const existing = (open.get("payments") ?? []) as {
        cfPaymentId: string;
      }[];
      const add = newPayments
        .filter(
          (p) => !existing.some((e) => e.cfPaymentId === p.entry.cfPaymentId),
        )
        .map((p) => p.entry);
      tx.update(open.ref, {
        ...(open.get("leadId") ? {} : { leadId }),
        intake,
        "customer.name": form.customerName,
        careType: form.careType,
        ...(open.get("area")
          ? {}
          : { area: l.area && l.area !== "Not specified" ? l.area : null }),
        ...(add.length
          ? {
              payments: [...existing, ...add],
              totalPaid: FieldValue.increment(
                add.reduce((t, p) => t + p.amount, 0),
              ),
            }
          : {}),
        updatedAt: now,
        updatedBy: by,
      });
    } else {
      const ref = db.collection("servicing").doc();
      caseId = ref.id;
      outcome = "created";
      tx.create(ref, {
        customer: { name: form.customerName, phone, email: l.email ?? null },
        stage: "new",
        careType: form.careType,
        intake,
        area: l.area && l.area !== "Not specified" ? l.area : null,
        leadId,
        bookingId: null,
        payments: newPayments.map((p) => p.entry),
        totalPaid: newPayments.reduce((t, p) => t + p.entry.amount, 0),
        proposals: [],
        placement: null,
        assignedTo: null,
        source: "lead",
        createdAt: now,
        updatedAt: now,
        updatedBy: by,
      });
    }
    for (const p of newPayments)
      tx.update(p.ref, {
        servicing_case_id: caseId,
        servicing_linked_at: now,
        servicing_linked_by: by,
      });
    tx.update(leadRef, {
      "ops.servicingCaseId": caseId,
      ...(linkedId === caseId ? {} : { "ops.servicingAt": now }),
      "ops.servicingForm": form,
      "ops.servicingFormAt": now,
      "ops.servicingFormBy": by,
    });
    return { outcome, caseId };
  });
}
