"use client";

import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { useEffect, useState } from "react";

import { db } from "@/lib/firebase";
import { nannySnapshot, type Nanny, type NannySnapshot } from "@/lib/nannies";
import type { ServicingFormValue } from "@/lib/servicing-form";

/**
 * Servicing cases (Firestore `servicing`): one per paying customer, from payment
 * to nanny placement. Created automatically by the `linkPaymentsToServicing`
 * Cloud Function when a payment succeeds (website repo, functions/src/servicing),
 * or by hand here. The customer can read their case in the app (by phone), so
 * internal notes live in `servicing/{id}/internal/notes`.
 */
/**
 * From this moment, marking an enquiry Converted sends it to servicing by itself
 * (and the payments Cloud Function creates cases for new payments). Enquiries
 * converted earlier get a "Send to servicing" button instead.
 * Keep in step with SERVICING_START in the website repo's functions/.env.hey-nanny-web.
 */
export const SERVICING_START = new Date(
  process.env.NEXT_PUBLIC_SERVICING_START || "2026-11-18T00:00:00+05:30",
);

export type Stage =
  | "new"
  | "profiles_shared"
  | "interviews"
  | "approved"
  | "placed"
  | "on_hold"
  | "cancelled";

export const STAGE_META: Record<
  Stage,
  { label: string; short: string; tone: string; dot: string }
> = {
  new: {
    label: "New: match nannies",
    short: "New",
    tone: "bg-blush text-rose-deep",
    dot: "bg-rose",
  },
  profiles_shared: {
    label: "Profiles shared",
    short: "Profiles shared",
    tone: "bg-[#e3edfd] text-[#1a56c4]",
    dot: "bg-[#4a7fe0]",
  },
  interviews: {
    label: "Interviews",
    short: "Interviews",
    tone: "bg-[#fbecc8] text-[#7a5410]",
    dot: "bg-[#d9a23a]",
  },
  approved: {
    label: "Approved: ready to place",
    short: "Approved",
    tone: "bg-[#ece6fb] text-[#5b3cc4]",
    dot: "bg-[#7a5ce0]",
  },
  placed: {
    label: "Placed",
    short: "Placed",
    tone: "bg-[#dcefe1] text-success",
    dot: "bg-success",
  },
  on_hold: {
    label: "On hold",
    short: "On hold",
    tone: "bg-beige text-muted",
    dot: "bg-muted/60",
  },
  cancelled: {
    label: "Cancelled",
    short: "Cancelled",
    tone: "bg-beige text-muted",
    dot: "bg-muted/40",
  },
};

/**
 * List buckets: the stored stage, with "placed" split by step 4 into placed
 * (travel not started), travel (on her way) and joined (based at the customer's).
 */
export type Bucket = Stage | "form_pending" | "travel" | "joined";

export const BUCKET_META: Record<
  "form_pending" | "travel" | "joined",
  { label: string; short: string; tone: string; dot: string }
> = {
  form_pending: {
    label: "Waiting for the Servicing form",
    short: "Form pending",
    tone: "bg-[#fbecc8] text-[#7a5410]",
    dot: "bg-[#d9a23a]",
  },
  travel: {
    label: "Travelling to the family",
    short: "Travel",
    tone: "bg-[#e0f2f1] text-[#0f6b63]",
    dot: "bg-[#1f9d8f]",
  },
  joined: {
    label: "Joined at customer location",
    short: "Joined",
    tone: "bg-success text-white",
    dot: "bg-white",
  },
};

/** A new case with no Servicing form yet: the servicing steps stay locked. */
export const needsForm = (
  c: Pick<ServicingCase, "stage" | "intake" | "proposals" | "placement">,
) => c.stage === "new" && !c.intake && !c.proposals.length && !c.placement;

export function caseBucket(
  c: Pick<
    ServicingCase,
    "stage" | "travel" | "intake" | "proposals" | "placement"
  >,
): Bucket {
  if (needsForm(c)) return "form_pending";
  if (c.stage !== "placed") return c.stage;
  if (c.travel?.reachedSiteAt) return "joined";
  if (c.travel?.scope) return "travel";
  return "placed";
}

export const bucketMeta = (b: Bucket) =>
  b === "form_pending" || b === "travel" || b === "joined"
    ? BUCKET_META[b]
    : STAGE_META[b];

export const STAGE_ORDER: Stage[] = [
  "new",
  "profiles_shared",
  "interviews",
  "approved",
  "placed",
  "on_hold",
  "cancelled",
];

export type Proposal = {
  nannyId: string;
  nanny: NannySnapshot;
  sharedAt: Timestamp | null;
  sharedBy: string | null;
  shortlisted: boolean;
  interviewAt: Timestamp | null;
  interviewStatus: "scheduled" | "done" | "cancelled" | null;
  outcome: "approved" | "rejected" | null;
  outcomeNote: string | null;
};

export type Placement = {
  nannyId: string;
  /** Includes her phone, so the family can reach her. */
  nanny: NannySnapshot & { phone: string | null };
  startDate: string; // YYYY-MM-DD
  siteAddress: string | null;
  placedAt: Timestamp | null;
  placedBy: string | null;
};

/**
 * Step 4: getting the placed nanny to the family. If she's travelling (from
 * another city, or across Bengaluru) the team records the ticket, then ticks
 * off when she reaches the HeyNanny PG and when she's based at the customer's.
 * Kept on the case so the customer app can show "on her way / arrived".
 */
export type TravelMode =
  | "train"
  | "bus"
  | "flight"
  | "auto"
  | "uber"
  | "ola"
  | "rapido"
  | "cab"
  | "other";
/** Another city: a ticket. Within Bengaluru: an auto / app cab booking. */
export const TRAVEL_MODES: Record<
  "inter_city" | "intra_city",
  { id: TravelMode; label: string }[]
> = {
  inter_city: [
    { id: "train", label: "Train" },
    { id: "bus", label: "Bus" },
    { id: "flight", label: "Flight" },
    { id: "other", label: "Other" },
  ],
  intra_city: [
    { id: "auto", label: "Auto" },
    { id: "uber", label: "Uber" },
    { id: "ola", label: "Ola" },
    { id: "rapido", label: "Rapido" },
    { id: "cab", label: "Other cab" },
    { id: "other", label: "Other" },
  ],
};
export type Travel = {
  travelling: boolean;
  scope: "inter_city" | "intra_city" | null;
  mode: TravelMode | null;
  /** PNR / booking reference. */
  ticketNumber: string | null;
  fromCity: string | null;
  departAt: Timestamp | null;
  arriveAt: Timestamp | null;
  ticketNote: string | null;
  reachedPgAt: Timestamp | null;
  reachedSiteAt: Timestamp | null;
  updatedBy: string | null;
};

export const emptyTravel = (travelling: boolean, by: string): Travel => ({
  travelling,
  scope: null,
  mode: null,
  ticketNumber: null,
  fromCity: null,
  departAt: null,
  arriveAt: null,
  ticketNote: null,
  reachedPgAt: null,
  reachedSiteAt: null,
  updatedBy: by,
});

/** Short travel status for the list, or null before step 4 starts. */
export function travelStatus(t: Travel | null): string | null {
  if (!t) return null;
  if (t.reachedSiteAt) return "At customer location";
  if (t.reachedPgAt && t.scope === "inter_city") return "Reached PG";
  if (!t.travelling) return "Not travelling, heading to customer";
  if (t.scope === "intra_city")
    return t.departAt
      ? `Ride booked, pickup ${t.departAt.toDate().toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}`
      : "Travelling within Bengaluru, add ride";
  if (t.arriveAt)
    return `Travelling, arrives ${t.arriveAt.toDate().toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}`;
  return t.ticketNumber ? "Ticket booked" : "Travelling, add ticket";
}

/** Why a case was cancelled, and the refund owed to the customer (paid out in Cashfree by an admin). */
export const CANCEL_REASONS = [
  "Customer changed their mind",
  "Couldn't find a suitable nanny",
  "Customer not responding",
  "Unhappy with the nanny",
  "Price / budget",
  "Unserviceable area",
  "Other",
] as const;

export type RefundStatus = "pending" | "processed" | "not_needed";
export const REFUND_META: Record<
  RefundStatus,
  { label: string; tone: string }
> = {
  pending: { label: "Refund due", tone: "bg-[#fbecc8] text-[#7a5410]" },
  processed: { label: "Refunded", tone: "bg-[#dcefe1] text-success" },
  not_needed: { label: "No refund", tone: "bg-beige text-muted" },
};

export type Refund = {
  status: RefundStatus;
  amount: number | null;
  refundedAt: Timestamp | null;
  /** Cashfree refund ID or bank UTR. */
  reference: string | null;
  note: string | null;
  updatedBy: string | null;
};

export type Cancellation = {
  reason: string;
  note: string | null;
  cancelledAt: Timestamp | null;
  cancelledBy: string | null;
  /** The nanny who was placed when the case was cancelled (she's freed). */
  placedNanny: string | null;
  refund: Refund;
};

export const refundDue = (c: Pick<ServicingCase, "stage" | "cancellation">) =>
  c.stage === "cancelled" && c.cancellation?.refund.status === "pending";

/** The Servicing form (sales team, at conversion). Servicing steps start once it's on the case. */
export type Intake = ServicingFormValue & {
  submittedAt: Timestamp | Date | null;
  submittedBy: string | null;
  leadId?: string | null;
};

export type CasePayment = {
  cfPaymentId: string;
  orderId: string;
  amount: number;
  paidAt: string | null;
};

export type ServicingCase = {
  id: string;
  customer: { name: string | null; phone: string; email: string | null };
  stage: Stage;
  careType: string | null;
  area: string | null;
  leadId: string | null;
  bookingId: string | null;
  payments: CasePayment[];
  totalPaid: number;
  proposals: Proposal[];
  placement: Placement | null;
  travel: Travel | null;
  cancellation: Cancellation | null;
  intake: Intake | null;
  assignedTo: string | null;
  source: "payment" | "lead" | "manual";
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
  updatedBy: string | null;
};

/** The stage that follows from what's been recorded (on hold / cancelled are set by hand and stick). */
export function derivedStage(
  c: Pick<ServicingCase, "stage" | "proposals" | "placement">,
): Stage {
  if (c.stage === "on_hold" || c.stage === "cancelled") return c.stage;
  if (c.placement) return "placed";
  if (c.proposals.some((p) => p.outcome === "approved")) return "approved";
  if (
    c.proposals.some((p) => p.interviewAt && p.interviewStatus !== "cancelled")
  )
    return "interviews";
  if (c.proposals.length) return "profiles_shared";
  return "new";
}

export function caseRef(c: Pick<ServicingCase, "id">) {
  return `SRV-${c.id.slice(0, 6).toUpperCase()}`;
}

function normaliseCase(id: string, d: Record<string, unknown>): ServicingCase {
  const customer = (d.customer ?? {}) as ServicingCase["customer"];
  return {
    id,
    customer: {
      name: customer.name ?? null,
      phone: customer.phone ?? "",
      email: customer.email ?? null,
    },
    stage: (STAGE_ORDER.includes(d.stage as Stage) ? d.stage : "new") as Stage,
    careType: (d.careType as string) ?? null,
    area: (d.area as string) ?? null,
    leadId: (d.leadId as string) ?? null,
    bookingId: (d.bookingId as string) ?? null,
    payments: Array.isArray(d.payments) ? (d.payments as CasePayment[]) : [],
    totalPaid: typeof d.totalPaid === "number" ? d.totalPaid : 0,
    proposals: Array.isArray(d.proposals) ? (d.proposals as Proposal[]) : [],
    placement: (d.placement as Placement) ?? null,
    travel: (d.travel as Travel) ?? null,
    cancellation: (d.cancellation as Cancellation) ?? null,
    intake: (d.intake as Intake) ?? null,
    assignedTo: (d.assignedTo as string) ?? null,
    source:
      d.source === "manual"
        ? "manual"
        : d.source === "lead"
          ? "lead"
          : "payment",
    createdAt: (d.createdAt as Timestamp) ?? null,
    updatedAt: (d.updatedAt as Timestamp) ?? null,
    updatedBy: (d.updatedBy as string) ?? null,
  };
}

export function useServicingCases(enabled: boolean, demo?: ServicingCase[]) {
  const [state, setState] = useState<{
    cases: ServicingCase[];
    loading: boolean;
    error: string | null;
  }>(
    demo
      ? { cases: demo, loading: false, error: null }
      : { cases: [], loading: true, error: null },
  );
  useEffect(() => {
    if (!enabled || demo) return;
    return onSnapshot(
      collection(db(), "servicing"),
      (snap) =>
        setState({
          cases: snap.docs
            .map((d) => normaliseCase(d.id, d.data()))
            .sort(
              (a, b) =>
                (b.createdAt?.toMillis() ?? Date.now()) -
                (a.createdAt?.toMillis() ?? Date.now()),
            ),
          loading: false,
          error: null,
        }),
      (err) =>
        setState({
          cases: [],
          loading: false,
          error:
            err.code === "permission-denied"
              ? "No permission to read servicing cases. Check that the latest Firestore rules are deployed."
              : "Couldn't load servicing cases.",
        }),
    );
  }, [enabled, demo]);
  return state;
}

/* ---------------- writes ---------------- */

type CaseUpdate = Partial<
  Pick<
    ServicingCase,
    | "stage"
    | "proposals"
    | "placement"
    | "travel"
    | "intake"
    | "assignedTo"
    | "careType"
    | "area"
    | "customer"
  >
>;

/** Saves changes and moves the stage to match (unless it's on hold / cancelled). */
export async function updateCase(
  c: ServicingCase,
  change: CaseUpdate,
  by: string,
) {
  const next = { ...c, ...change };
  const stage = change.stage ?? derivedStage(next);
  await updateDoc(doc(db(), "servicing", c.id), {
    ...change,
    stage,
    updatedAt: serverTimestamp(),
    updatedBy: by,
  });
}

export function newProposal(n: Nanny, by: string): Proposal {
  return {
    nannyId: n.id,
    nanny: nannySnapshot(n),
    sharedAt: Timestamp.now(),
    sharedBy: by,
    shortlisted: false,
    interviewAt: null,
    interviewStatus: null,
    outcome: null,
    outcomeNote: null,
  };
}

/**
 * Place a nanny: the case becomes "placed", the nanny is marked placed (so she
 * drops out of the available list), a previously placed nanny is freed, and, if
 * the case came from a website booking, the customer app's `assignment` is set.
 */
export async function placeNanny(
  c: ServicingCase,
  n: Nanny,
  startDate: string,
  siteAddress: string,
  by: string,
) {
  const batch = writeBatch(db());
  const placement: Placement = {
    nannyId: n.id,
    nanny: { ...nannySnapshot(n), phone: n.phone },
    startDate,
    siteAddress: siteAddress.trim() || null,
    placedAt: Timestamp.now(),
    placedBy: by,
  };
  const sameNanny = c.placement?.nannyId === n.id;
  batch.update(doc(db(), "servicing", c.id), {
    placement,
    ...(sameNanny ? {} : { travel: null }),
    stage: "placed",
    updatedAt: serverTimestamp(),
    updatedBy: by,
  });
  batch.update(doc(db(), "nannies", n.id), {
    status: "placed",
    placement: {
      caseId: c.id,
      customerName: c.customer.name,
      since: startDate,
    },
    updatedAt: serverTimestamp(),
    updatedBy: by,
  });
  if (c.placement && c.placement.nannyId !== n.id) {
    batch.update(doc(db(), "nannies", c.placement.nannyId), {
      status: "available",
      placement: null,
      updatedAt: serverTimestamp(),
      updatedBy: by,
    });
  }
  if (c.bookingId) {
    batch.update(doc(db(), "bookings", c.bookingId), {
      assignment: {
        nanny: {
          name: n.name,
          ...(n.phone ? { phone: n.phone } : {}),
          ...(n.photoUrl ? { photoUrl: n.photoUrl } : {}),
          ...(n.role ? { role: n.role } : {}),
          languages: n.languages,
          ...(n.experienceYears !== null
            ? { experienceYears: n.experienceYears }
            : {}),
        },
        replacement: null,
        updatedAt: serverTimestamp(),
      },
      updatedAt: serverTimestamp(),
    });
  }
  await batch.commit();
}

/** Undo a placement: the case goes back to "approved" and the nanny becomes available. */
export async function unplace(c: ServicingCase, by: string) {
  if (!c.placement) return;
  const batch = writeBatch(db());
  const next = {
    ...c,
    placement: null,
    stage: c.stage === "placed" ? ("approved" as Stage) : c.stage,
  };
  batch.update(doc(db(), "servicing", c.id), {
    placement: null,
    travel: null,
    stage: derivedStage(next),
    updatedAt: serverTimestamp(),
    updatedBy: by,
  });
  batch.update(doc(db(), "nannies", c.placement.nannyId), {
    status: "available",
    placement: null,
    updatedAt: serverTimestamp(),
    updatedBy: by,
  });
  await batch.commit();
}

/**
 * Cancel a case and record the refund owed. A placed nanny is freed (her
 * placement and travel are cleared from the case; her name is kept on the
 * cancellation record).
 */
export async function cancelCase(
  c: ServicingCase,
  input: {
    reason: string;
    note: string;
    refund: "pending" | "not_needed";
    amount: number | null;
  },
  by: string,
) {
  const batch = writeBatch(db());
  const cancellation: Cancellation = {
    reason: input.reason,
    note: input.note.trim() || null,
    cancelledAt: Timestamp.now(),
    cancelledBy: by,
    placedNanny: c.placement?.nanny.name ?? null,
    refund: {
      status: input.refund,
      amount: input.refund === "pending" ? input.amount : null,
      refundedAt: null,
      reference: null,
      note: null,
      updatedBy: by,
    },
  };
  batch.update(doc(db(), "servicing", c.id), {
    stage: "cancelled",
    cancellation,
    ...(c.placement ? { placement: null, travel: null } : {}),
    updatedAt: serverTimestamp(),
    updatedBy: by,
  });
  if (c.placement)
    batch.update(doc(db(), "nannies", c.placement.nannyId), {
      status: "available",
      placement: null,
      updatedAt: serverTimestamp(),
      updatedBy: by,
    });
  await batch.commit();
}

export async function updateRefund(
  c: ServicingCase,
  refund: Omit<Refund, "updatedBy">,
  by: string,
) {
  if (!c.cancellation) return;
  await updateDoc(doc(db(), "servicing", c.id), {
    "cancellation.refund": { ...refund, updatedBy: by },
    updatedAt: serverTimestamp(),
    updatedBy: by,
  });
}

/** Reopen a cancelled or on-hold case; the cancellation record is cleared. */
export async function reopenCase(c: ServicingCase, by: string) {
  const stage = derivedStage({ ...c, stage: "new" });
  await updateDoc(doc(db(), "servicing", c.id), {
    stage,
    cancellation: null,
    updatedAt: serverTimestamp(),
    updatedBy: by,
  });
}

/** For customers who paid before automatic cases were switched on, or paid outside Cashfree. */
export async function createCase(
  input: {
    form: ServicingFormValue;
    email: string;
    area: string;
    amount: number | null;
  },
  by: string,
) {
  const { form } = input;
  const ref = await addDoc(collection(db(), "servicing"), {
    customer: {
      name: form.customerName,
      phone: form.customerPhone,
      email: input.email.trim() || null,
    },
    stage: "new",
    careType: form.careType,
    area: input.area.trim() || null,
    leadId: null,
    bookingId: null,
    payments: input.amount
      ? [
          {
            cfPaymentId: `manual-${Date.now()}`,
            orderId: "manual",
            amount: input.amount,
            paidAt: new Date().toISOString(),
          },
        ]
      : [],
    totalPaid: input.amount ?? 0,
    proposals: [],
    placement: null,
    travel: null,
    cancellation: null,
    intake: {
      ...form,
      submittedAt: Timestamp.now(),
      submittedBy: by,
      leadId: null,
    },
    assignedTo: by,
    source: "manual",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    updatedBy: by,
  });
  return ref.id;
}

/** Servicing fills in the form on a case that came without one (e.g. from a payment). */
export async function saveIntake(
  c: ServicingCase,
  form: ServicingFormValue,
  by: string,
) {
  await updateDoc(doc(db(), "servicing", c.id), {
    intake: {
      ...form,
      submittedAt: Timestamp.now(),
      submittedBy: by,
      leadId: c.leadId,
    },
    "customer.name": form.customerName,
    "customer.phone": form.customerPhone,
    careType: form.careType,
    updatedAt: serverTimestamp(),
    updatedBy: by,
  });
}

/* ---------------- internal notes (staff only) ---------------- */

export async function readNotes(caseId: string): Promise<string> {
  const snap = await getDoc(
    doc(db(), "servicing", caseId, "internal", "notes"),
  );
  return (snap.data()?.notes as string) ?? "";
}

export async function saveNotes(caseId: string, notes: string, by: string) {
  await setDoc(doc(db(), "servicing", caseId, "internal", "notes"), {
    notes,
    updatedAt: serverTimestamp(),
    updatedBy: by,
  });
}
