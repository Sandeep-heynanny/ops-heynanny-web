import { Timestamp } from "firebase-admin/firestore";

import { adminDb, HttpError } from "@/lib/server/admin";
import { CashfreeError, createOrderRefund, fetchOrderRefund, fetchOrderRefunds } from "@/lib/server/cashfree";
import { saveApiRefund } from "@/lib/server/refunds";
import type { CasePayment, CaseCfRefund, CaseCfRefundStatus, Refund } from "@/lib/servicing";

/**
 * Refunds for cancelled servicing cases, started by an admin from the dashboard.
 *
 * Each refund is first written to the case as CREATING with a refund ID that's
 * fixed before Cashfree is called (RF-<case>-<n>). If Cashfree doesn't answer,
 * "Check status" looks that ID up instead of sending a second refund, so a
 * retry can never pay the customer twice. The case's refund status follows the
 * Cashfree refunds: initiated once the amount owed is covered, processed once
 * Cashfree reports them all as SUCCESS.
 */

const round2 = (n: number) => Math.round(n * 100) / 100;
const LIVE = (e: CaseCfRefund) => e.status !== "CANCELLED" && e.status !== "NOT_CREATED";
const OPEN: CaseCfRefundStatus[] = ["CREATING", "PENDING", "ONHOLD"];

const str = (v: unknown, max = 200) => (v === null || v === undefined || v === "" ? null : String(v).slice(0, max));

function cfStatus(v: unknown): CaseCfRefundStatus {
  const s = String(v ?? "").toUpperCase();
  if (s === "SUCCESS") return "SUCCESS";
  if (s === "CANCELLED" || s === "FAILED") return "CANCELLED";
  if (s === "ONHOLD") return "ONHOLD";
  return "PENDING";
}

/** The case's refund status, worked out from its Cashfree refunds. */
function withDerivedStatus(r: Refund, owed: number, by: string): Refund {
  const list = r.cashfree ?? [];
  if (!list.length) return r;
  const live = list.filter(LIVE);
  const covered = round2(live.reduce((t, e) => t + e.amount, 0));
  const allPaid = live.length > 0 && live.every((e) => e.status === "SUCCESS");
  if (covered >= owed - 0.009 && allPaid) {
    return {
      ...r,
      status: "processed",
      // Admin and browser Timestamps are stored the same way; only their TS types differ.
      refundedAt: r.status === "processed" && r.refundedAt ? r.refundedAt : (Timestamp.now() as unknown as Refund["refundedAt"]),
      reference: live.map((e) => e.cfRefundId ?? e.refundId).join(", ").slice(0, 200),
      updatedBy: by,
    };
  }
  return { ...r, status: covered >= owed - 0.009 ? "initiated" : "pending", refundedAt: null, updatedBy: by };
}

type CaseData = {
  stage?: string;
  payments?: CasePayment[];
  totalPaid?: number;
  cancellation?: { refund?: Refund } | null;
};

const owedOf = (d: CaseData) => round2(d.cancellation?.refund?.amount ?? d.totalPaid ?? 0);

/** Update entries by refund ID and re-derive the case's refund status. */
async function saveEntries(caseId: string, patch: Map<string, Partial<CaseCfRefund>>, by: string) {
  const db = adminDb();
  const ref = db.collection("servicing").doc(caseId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const d = snap.data() as CaseData | undefined;
    const r = d?.cancellation?.refund;
    if (!d || !r) return;
    const now = new Date().toISOString();
    const cashfree = (r.cashfree ?? []).map((e) => (patch.has(e.refundId) ? { ...e, ...patch.get(e.refundId), updatedAt: now } : e));
    tx.update(ref, {
      "cancellation.refund": withDerivedStatus({ ...r, cashfree }, owedOf(d), by),
      updatedAt: Timestamp.now(),
      updatedBy: by,
    });
  });
}

function fromCashfree(r: Record<string, unknown>): Partial<CaseCfRefund> {
  return {
    status: cfStatus(r.refund_status),
    cfRefundId: str(r.cf_refund_id, 64),
    arn: str(r.refund_arn, 64),
    error: cfStatus(r.refund_status) === "CANCELLED" ? str(r.status_description) ?? "Cashfree cancelled the refund." : null,
  };
}

export async function initiateCaseRefund(
  caseId: string,
  input: { orderId: string; amount: number; note: string },
  by: string,
): Promise<string> {
  const db = adminDb();
  const ref = db.collection("servicing").doc(caseId);
  const amount = round2(input.amount);
  if (!(amount > 0)) throw new HttpError(400, "Enter an amount above ₹0.");

  // 1. Claim the next refund ID on the case before Cashfree hears about it.
  const entry = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const d = snap.data() as CaseData | undefined;
    if (!d) throw new HttpError(404, "Case not found.");
    const r = d.cancellation?.refund;
    if (d.stage !== "cancelled" || !r) throw new HttpError(409, "Only cancelled cases can be refunded.");
    if (r.status !== "pending") throw new HttpError(409, "This case has no refund due.");
    const list = r.cashfree ?? [];
    if (list.some((e) => e.status === "CREATING"))
      throw new HttpError(409, "A refund is still being sent. Press Check status first.");
    const payment = (d.payments ?? []).find((p) => p.orderId === input.orderId && p.orderId !== "manual");
    if (!payment) throw new HttpError(400, "That payment isn't on this case, or wasn't made through Cashfree.");
    const live = list.filter(LIVE);
    const remaining = round2(owedOf(d) - live.reduce((t, e) => t + e.amount, 0));
    if (amount > remaining + 0.009) throw new HttpError(422, `Only ₹${remaining} is still owed on this case.`);
    const fromThisOrder = round2(payment.amount - live.filter((e) => e.orderId === payment.orderId).reduce((t, e) => t + e.amount, 0));
    if (amount > fromThisOrder + 0.009) throw new HttpError(422, `Only ₹${fromThisOrder} can be refunded from this payment.`);
    const now = new Date().toISOString();
    const e: CaseCfRefund = {
      refundId: `RF-${caseId}-${list.length + 1}`.slice(0, 40),
      orderId: payment.orderId,
      cfRefundId: null,
      amount,
      status: "CREATING",
      arn: null,
      error: null,
      createdAt: now,
      createdBy: by,
      updatedAt: now,
    };
    tx.update(ref, {
      "cancellation.refund.cashfree": [...list, e],
      updatedAt: Timestamp.now(),
      updatedBy: by,
    });
    return e;
  });

  const fail = async (message: string, status = 422): Promise<never> => {
    await saveEntries(caseId, new Map([[entry.refundId, { status: "NOT_CREATED", error: message.slice(0, 200) }]]), by);
    throw new HttpError(status, message);
  };

  // 2. Refunds already made in Cashfree directly (e.g. from its dashboard) count too.
  let cfRefunded = 0;
  try {
    cfRefunded = (await fetchOrderRefunds(entry.orderId))
      .filter((r) => cfStatus(r.refund_status) !== "CANCELLED")
      .reduce((t, r) => t + (Number(r.refund_amount) || 0), 0);
  } catch (err) {
    const msg = err instanceof CashfreeError ? err.message : "Couldn't reach Cashfree.";
    return fail(`${msg} Nothing was refunded.`, 502);
  }
  const payment = await ref.get().then((s) => ((s.get("payments") ?? []) as CasePayment[]).find((p) => p.orderId === entry.orderId));
  const refundable = round2((payment?.amount ?? 0) - cfRefunded);
  if (entry.amount > refundable + 0.009)
    return fail(`Cashfree shows ₹${round2(cfRefunded)} already refunded on this payment, so at most ₹${Math.max(refundable, 0)} is left.`);

  // 3. Send it.
  try {
    const res = await createOrderRefund(entry.orderId, { refundId: entry.refundId, amount: entry.amount, note: input.note });
    await saveEntries(caseId, new Map([[entry.refundId, fromCashfree(res)]]), by);
    await saveApiRefund(res, entry.orderId).catch((e) => console.error("[case-refund] save", (e as Error).message));
    return `Refund of ₹${entry.amount} started in Cashfree (${entry.refundId}).`;
  } catch (err) {
    // A clear refusal: nothing happened. Anything else (timeout, 5xx): Cashfree may have it, so leave
    // it as CREATING for "Check status" to find out. Never send a second one.
    if (err instanceof CashfreeError && err.status >= 400 && err.status < 500 && err.status !== 408 && err.status !== 429)
      return fail(err.message);
    console.error("[case-refund] create", (err as Error).message);
    throw new HttpError(502, "Cashfree didn't confirm the refund. Press Check status in a minute before trying again.");
  }
}

/** Ask Cashfree about every refund on the case that isn't final yet. */
export async function syncCaseRefund(caseId: string, by: string): Promise<string> {
  const snap = await adminDb().collection("servicing").doc(caseId).get();
  const d = snap.data() as CaseData | undefined;
  if (!d) throw new HttpError(404, "Case not found.");
  const open = (d.cancellation?.refund?.cashfree ?? []).filter((e) => OPEN.includes(e.status));
  if (!open.length) return "Nothing to check.";
  const patch = new Map<string, Partial<CaseCfRefund>>();
  for (const e of open) {
    const r = await fetchOrderRefund(e.orderId, e.refundId);
    if (r) {
      patch.set(e.refundId, fromCashfree(r));
      await saveApiRefund(r, e.orderId).catch(() => undefined);
    } else if (e.status === "CREATING" && Date.now() - Date.parse(e.createdAt) > 60_000) {
      patch.set(e.refundId, { status: "NOT_CREATED", error: "Cashfree never received this refund." });
    }
  }
  if (patch.size) await saveEntries(caseId, patch, by);
  return "Updated from Cashfree.";
}
