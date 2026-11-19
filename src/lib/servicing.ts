"use client";

import {
  FieldPath,
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

import { auth, db } from "@/lib/firebase";
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

/* ---------------- aging (days in servicing) ---------------- */

/** Cases still waiting for a nanny (from the moment they arrive): these age. */
const AGING_BUCKETS: Bucket[] = ["form_pending", "new", "profiles_shared", "interviews", "approved"];

export type AgingId = "priority" | "two" | "one" | "today";
export const AGING_META: Record<
  AgingId,
  { label: string; tile: string; text: string; edge: string }
> = {
  priority: {
    label: "Priority · 3+ days",
    tile: "border-red-300 bg-red-50",
    text: "text-red-700",
    edge: "border-l-4 border-l-red-500",
  },
  two: { label: "2 days", tile: "border-[#f1d9a6] bg-[#fff6e5]", text: "text-[#9a6417]", edge: "" },
  one: { label: "1 day", tile: "border-[#c9d6f2] bg-[#eef3fd]", text: "text-[#24456e]", edge: "" },
  today: { label: "Today", tile: "border-line bg-paper", text: "text-muted", edge: "" },
};
export const AGING_ORDER: AgingId[] = ["priority", "two", "one", "today"];

/** When the case arrived in servicing (created), else when its Servicing form came in. */
function servicingSince(c: Pick<ServicingCase, "intake" | "createdAt">): Date | null {
  const v = c.createdAt ?? c.intake?.submittedAt;
  if (!v) return null;
  return v instanceof Date ? v : typeof (v as Timestamp).toDate === "function" ? (v as Timestamp).toDate() : null;
}

/** Whole days since the case arrived, or null once it's placed, on hold or cancelled. */
export function caseAgeDays(c: ServicingCase, now: Date): number | null {
  if (!AGING_BUCKETS.includes(caseBucket(c))) return null;
  const since = servicingSince(c);
  if (!since) return null;
  return Math.max(0, Math.floor((now.getTime() - since.getTime()) / 86_400_000));
}

export function agingOf(days: number | null): AgingId | null {
  if (days === null) return null;
  return days >= 3 ? "priority" : days === 2 ? "two" : days === 1 ? "one" : "today";
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

/** A nanny who was placed on this case and later replaced. */
export type PastPlacement = Placement & {
  endedAt: Timestamp | null;
  endedBy: string | null;
  endReason: string | null;
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

export type RefundStatus = "pending" | "initiated" | "processed" | "not_needed";
export const REFUND_META: Record<
  RefundStatus,
  { label: string; tone: string }
> = {
  pending: { label: "Refund due", tone: "bg-[#fbecc8] text-[#7a5410]" },
  initiated: { label: "Refund initiated", tone: "bg-[#e3ecf7] text-[#24456e]" },
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
  /** Refunds an admin started from the dashboard through Cashfree (server-written). */
  cashfree?: CaseCfRefund[];
};

/**
 * One Cashfree refund started from a case. CREATING: being sent (or Cashfree
 * didn't answer, so "Check status" finds out); NOT_CREATED: Cashfree refused it.
 */
export type CaseCfRefundStatus =
  "CREATING" | "PENDING" | "ONHOLD" | "SUCCESS" | "CANCELLED" | "NOT_CREATED";
export type CaseCfRefund = {
  refundId: string;
  orderId: string;
  cfRefundId: string | null;
  amount: number;
  status: CaseCfRefundStatus;
  arn: string | null;
  error: string | null;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
};

export const CF_REFUND_META: Record<
  CaseCfRefundStatus,
  { label: string; tone: string }
> = {
  CREATING: { label: "Sending to Cashfree", tone: "bg-beige text-muted" },
  PENDING: { label: "Processing", tone: "bg-[#e3ecf7] text-[#24456e]" },
  ONHOLD: { label: "On hold at Cashfree", tone: "bg-[#fbecc8] text-[#7a5410]" },
  SUCCESS: { label: "Refunded", tone: "bg-[#dcefe1] text-success" },
  CANCELLED: { label: "Failed", tone: "bg-red-50 text-red-700" },
  NOT_CREATED: { label: "Not started", tone: "bg-red-50 text-red-700" },
};

/** Cashfree refunds that still count towards the amount owed. */
export const liveCfRefunds = (r: Refund) =>
  (r.cashfree ?? []).filter(
    (e) => e.status !== "CANCELLED" && e.status !== "NOT_CREATED",
  );

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
  c.stage === "cancelled" &&
  (c.cancellation?.refund.status === "pending" ||
    c.cancellation?.refund.status === "initiated");

/** The Servicing form (sales team, at conversion). Servicing steps start once it's on the case. */
export type Intake = ServicingFormValue & {
  submittedAt: Timestamp | Date | null;
  submittedBy: string | null;
  /** Last edit after the first submission (sales or servicing). */
  editedAt?: Timestamp | Date | null;
  editedBy?: string | null;
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
  /** Earlier placements on this case, oldest first (each replaced by the next). */
  placementHistory: PastPlacement[];
  intake: Intake | null;
  assignedTo: string | null;
  source: "payment" | "lead" | "manual";
  /** How a hand-made case came to us (Referral by default). */
  leadSource: string | null;
  /** Times the family suggested in the app to meet a nanny, by nanny id. */
  interviewRequests: Record<string, InterviewRequest>;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
  updatedBy: string | null;
};

/* ---------------- interview requests (from the customer app) ---------------- */

export type InterviewRequestStatus =
  "new" | "checking" | "unavailable" | "confirmed";

/**
 * Written by the website (POST /api/app/interview-request) when the family
 * suggests a time to meet a shared nanny. Sending again replaces it.
 */
export type InterviewRequest = {
  at: Timestamp;
  sentAt: Timestamp | null;
  status: InterviewRequestStatus;
  nannyName: string;
  handledBy: string | null;
  handledAt: Timestamp | null;
};

export const REQUEST_META: Record<
  InterviewRequestStatus,
  { label: string; tone: string }
> = {
  new: { label: "New", tone: "bg-[#f7e6c4] text-[#9a6417]" },
  checking: {
    label: "Checking with nanny",
    tone: "bg-[#dde3f3] text-[#3a55a8]",
  },
  unavailable: {
    label: "Nanny unavailable",
    tone: "bg-[#f6d9d6] text-[#93525a]",
  },
  confirmed: { label: "Confirmed", tone: "bg-[#dcefe1] text-success" },
};

export type OpenRequest = {
  nannyId: string;
  proposal: Proposal;
  req: InterviewRequest;
};

/**
 * Requests the team still has to act on: not confirmed, for a nanny still on
 * the case, and not already covered by an interview booked for her since.
 */
export function openRequests(c: ServicingCase): OpenRequest[] {
  if (c.stage === "cancelled" || c.placement) return [];
  const out: OpenRequest[] = [];
  for (const [nannyId, req] of Object.entries(c.interviewRequests)) {
    if (!req?.at || req.status === "confirmed") continue;
    const proposal = c.proposals.find((p) => p.nannyId === nannyId);
    if (!proposal || proposal.outcome) continue;
    const booked =
      proposal.interviewAt &&
      proposal.interviewStatus !== "cancelled" &&
      proposal.interviewAt.toMillis() >= (req.sentAt?.toMillis() ?? 0);
    if (booked) continue;
    out.push({ nannyId, proposal, req });
  }
  return out.sort(
    (a, b) => (b.req.sentAt?.toMillis() ?? 0) - (a.req.sentAt?.toMillis() ?? 0),
  );
}

/** "Fri, 20 Nov · 11:00 AM" */
export function requestWhen(d: Date) {
  const day = d.toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  const time = d
    .toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })
    .toUpperCase();
  return `${day} · ${time}`;
}

/** "Checking with nanny" / "Nanny unavailable" / back to "New". */
export async function setRequestStatus(
  c: ServicingCase,
  nannyId: string,
  status: Exclude<InterviewRequestStatus, "confirmed">,
  by: string,
) {
  await updateDoc(
    doc(db(), "servicing", c.id),
    new FieldPath("interviewRequests", nannyId, "status"),
    status,
    new FieldPath("interviewRequests", nannyId, "handledBy"),
    by,
    new FieldPath("interviewRequests", nannyId, "handledAt"),
    serverTimestamp(),
    "updatedAt",
    serverTimestamp(),
    "updatedBy",
    by,
  );
}

/** Books the interview at the family's suggested time and marks the request confirmed. */
export async function confirmRequest(
  c: ServicingCase,
  nannyId: string,
  by: string,
) {
  const req = c.interviewRequests[nannyId];
  if (!req) return;
  const proposals = c.proposals.map((p) =>
    p.nannyId === nannyId
      ? {
          ...p,
          interviewAt: req.at,
          interviewStatus: "scheduled" as const,
          shortlisted: true,
        }
      : p,
  );
  await updateDoc(
    doc(db(), "servicing", c.id),
    "proposals",
    proposals,
    "stage",
    derivedStage({ ...c, proposals }),
    new FieldPath("interviewRequests", nannyId, "status"),
    "confirmed",
    new FieldPath("interviewRequests", nannyId, "handledBy"),
    by,
    new FieldPath("interviewRequests", nannyId, "handledAt"),
    serverTimestamp(),
    "updatedAt",
    serverTimestamp(),
    "updatedBy",
    by,
  );
}

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
    placementHistory: Array.isArray(d.placementHistory)
      ? (d.placementHistory as PastPlacement[])
      : [],
    intake: (d.intake as Intake) ?? null,
    assignedTo: (d.assignedTo as string) ?? null,
    source:
      d.source === "manual"
        ? "manual"
        : d.source === "lead"
          ? "lead"
          : "payment",
    leadSource: typeof d.leadSource === "string" ? d.leadSource : null,
    interviewRequests:
      d.interviewRequests && typeof d.interviewRequests === "object"
        ? (d.interviewRequests as Record<string, InterviewRequest>)
        : {},
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

/** One case, live (the enquiry drawer shows it to sales, read-only). */
export function useServicingCase(caseId: string | null | undefined) {
  const [state, setState] = useState<{
    c: ServicingCase | null;
    loading: boolean;
    error: string | null;
  }>({ c: null, loading: !!caseId, error: null });
  useEffect(() => {
    if (!caseId) return;
    return onSnapshot(
      doc(db(), "servicing", caseId),
      (snap) =>
        setState({
          c: snap.exists() ? normaliseCase(snap.id, snap.data()) : null,
          loading: false,
          error: snap.exists() ? null : "The servicing case was deleted.",
        }),
      (err) =>
        setState({
          c: null,
          loading: false,
          error:
            err.code === "permission-denied"
              ? "No permission to read the servicing case. Check that the latest Firestore rules are deployed."
              : "Couldn't load the servicing case.",
        }),
    );
  }, [caseId]);
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
  /** Why the current nanny is being replaced (kept on the case's history). */
  replaceReason = "",
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
  // Replacing: the current nanny moves to the case's history.
  const history: PastPlacement[] =
    c.placement && !sameNanny
      ? [
          ...c.placementHistory,
          {
            ...c.placement,
            endedAt: Timestamp.now(),
            endedBy: by,
            endReason: replaceReason.trim() || null,
          },
        ]
      : c.placementHistory;
  batch.update(doc(db(), "servicing", c.id), {
    placement,
    placementHistory: history,
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
 * Replace the placed nanny: she moves to the case's history (with the reason),
 * becomes available again and leaves the shortlist, and the case goes back to
 * step 2 so the team can interview and place someone new.
 */
export async function replacePlacement(
  c: ServicingCase,
  reason: string,
  by: string,
) {
  if (!c.placement) return;
  const pl = c.placement;
  const proposals = c.proposals.filter((p) => p.nannyId !== pl.nannyId);
  const history: PastPlacement[] = [
    ...c.placementHistory,
    {
      ...pl,
      endedAt: Timestamp.now(),
      endedBy: by,
      endReason: reason.trim() || null,
    },
  ];
  const batch = writeBatch(db());
  batch.update(doc(db(), "servicing", c.id), {
    placement: null,
    placementHistory: history,
    travel: null,
    proposals,
    stage: derivedStage({ stage: "new", proposals, placement: null }),
    updatedAt: serverTimestamp(),
    updatedBy: by,
  });
  batch.update(doc(db(), "nannies", pl.nannyId), {
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
    leadSource: string;
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
    leadSource: input.leadSource || "Referral",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    updatedBy: by,
  });
  return ref.id;
}

/** Servicing fills in the form on a case that came without one (e.g. from a payment). */
/**
 * Saves the Servicing form on a case through the server, which also updates
 * the enquiry's copy (so sales sees the same answers) and records who edited it.
 */
export async function saveIntake(
  c: Pick<ServicingCase, "id">,
  form: ServicingFormValue,
) {
  const user = auth().currentUser;
  if (!user) throw new Error("Not signed in");
  const res = await fetch("/api/servicing/intake", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${await user.getIdToken()}`,
    },
    body: JSON.stringify({ caseId: c.id, form }),
  });
  const body = (await res.json().catch(() => null)) as {
    error?: string;
  } | null;
  if (!res.ok) throw new Error(body?.error ?? "Couldn't save the form.");
}

/** Admins: refund a cancelled case through Cashfree, from one of its payments. */
export async function initiateCaseRefund(
  c: Pick<ServicingCase, "id">,
  input: { orderId: string; amount: number; note: string },
) {
  return refundAction({ action: "initiate", caseId: c.id, ...input });
}

/** Admins: ask Cashfree for the latest status of a case's refunds. */
export async function syncCaseRefund(c: Pick<ServicingCase, "id">) {
  return refundAction({ action: "sync", caseId: c.id });
}

async function refundAction(payload: Record<string, unknown>) {
  const user = auth().currentUser;
  if (!user) throw new Error("Not signed in");
  const res = await fetch("/api/servicing/refund", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${await user.getIdToken()}`,
    },
    body: JSON.stringify(payload),
  });
  const body = (await res.json().catch(() => null)) as {
    error?: string;
    message?: string;
  } | null;
  if (!res.ok)
    throw new Error(body?.error ?? "Couldn't reach Cashfree. Try again.");
  return body?.message ?? null;
}

/* ---------------- internal notes (staff only) ---------------- */

export async function readNotes(caseId: string): Promise<{
  notes: string;
  updatedBy: string | null;
  updatedAt: Date | null;
}> {
  const snap = await getDoc(
    doc(db(), "servicing", caseId, "internal", "notes"),
  );
  const d = snap.data();
  return {
    notes: (d?.notes as string) ?? "",
    updatedBy: (d?.updatedBy as string) ?? null,
    updatedAt: (d?.updatedAt as Timestamp | undefined)?.toDate?.() ?? null,
  };
}

export async function saveNotes(caseId: string, notes: string, by: string) {
  await setDoc(doc(db(), "servicing", caseId, "internal", "notes"), {
    notes,
    updatedAt: serverTimestamp(),
    updatedBy: by,
  });
}

/* ---------------- timeline (case list) ---------------- */

export type TimelineState = "done" | "now" | "todo";
export type TimelineStep = {
  key:
    | "form"
    | "profiles"
    | "interview"
    | "approved"
    | "placed"
    | "travel"
    | "joined";
  label: string;
  state: TimelineState;
  /** Short date or detail under the label. */
  detail: string | null;
  /** Lines for the hover card. */
  tip: string[];
};

const asDate = (v: Timestamp | Date | null | undefined) =>
  !v
    ? null
    : v instanceof Date
      ? v
      : typeof (v as Timestamp).toDate === "function"
        ? (v as Timestamp).toDate()
        : null;

const shortDate = (d: Date | null) =>
  d ? d.toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : null;

const dateTime = (d: Date | null) =>
  d
    ? d.toLocaleString("en-IN", {
        day: "numeric",
        month: "short",
        hour: "numeric",
        minute: "2-digit",
      })
    : null;

/** "ravi@heynanny.in" → "ravi" */
const who = (email: string | null | undefined) =>
  email ? email.split("@")[0]! : null;

const firstName = (n: string) => n.split(/\s+/)[0] ?? n;

const TRAVEL_LABEL: Record<string, string> = {
  train: "Train",
  bus: "Bus",
  flight: "Flight",
  auto: "Auto",
  uber: "Uber",
  ola: "Ola",
  rapido: "Rapido",
  cab: "Cab",
  other: "Other",
};

/**
 * The seven steps of a case for the list's timeline: done, the current one
 * ("now"), then the rest, each with lines for a hover card. On-hold and
 * cancelled cases keep their progress; the step they stopped at is "now".
 */
export function caseTimeline(
  c: Pick<
    ServicingCase,
    "stage" | "intake" | "proposals" | "placement" | "travel"
  > & { placementHistory?: PastPlacement[] },
  now: Date = new Date(),
): TimelineStep[] {
  const shared = c.proposals.filter((p) => p.sharedAt);
  const firstShare =
    shared
      .map((p) => p.sharedAt!.toDate())
      .sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
  const approved = c.proposals.filter((p) => p.outcome === "approved");
  const interviews = c.proposals
    .filter((p) => p.interviewAt)
    .sort((a, b) => a.interviewAt!.toMillis() - b.interviewAt!.toMillis());
  const upcoming = interviews.find((p) => p.interviewStatus === "scheduled");
  const doneInterviews = interviews.filter(
    (p) => p.interviewStatus === "done",
  ).length;
  const placed = !!c.placement;
  const t = c.travel;
  const joined = !!t?.reachedSiteAt;
  const intake = c.intake;

  const steps: Omit<TimelineStep, "state">[] = [];
  const done: boolean[] = [];
  const add = (s: Omit<TimelineStep, "state">, isDone: boolean) => {
    steps.push(s);
    done.push(isDone);
  };

  // 1. Servicing form
  const submitted = asDate(intake?.submittedAt);
  add(
    {
      key: "form",
      label: "Form",
      detail:
        shortDate(submitted) ??
        (intake || c.proposals.length || c.placement ? null : "Pending"),
      tip: intake
        ? [
            `Submitted ${dateTime(submitted) ?? ""}${intake.submittedBy ? ` by ${who(intake.submittedBy)}` : ""}`.trim(),
            ...(intake.editedAt
              ? [
                  `Edited ${dateTime(asDate(intake.editedAt)) ?? ""}${intake.editedBy ? ` by ${who(intake.editedBy)}` : ""}`,
                ]
              : []),
            `${intake.careType} · joins ${intake.joiningDate}`,
          ]
        : ["Waiting for the sales team to fill the Servicing form"],
    },
    !!intake || c.proposals.length > 0 || placed,
  );

  // 2. Profiles shared
  add(
    {
      key: "profiles",
      label: "Profiles",
      detail: shared.length
        ? `${shortDate(firstShare)} · ${shared.length}`
        : c.proposals.length
          ? `${c.proposals.length} picked`
          : null,
      tip: c.proposals.length
        ? c.proposals.map(
            (p) =>
              `${p.nanny.name} · ${p.sharedAt ? `shared ${shortDate(p.sharedAt.toDate())}` : "not sent yet"}${p.shortlisted ? " · shortlisted" : ""}`,
          )
        : ["No profiles picked yet"],
    },
    shared.length > 0 || placed,
  );

  // 3. Interviews
  add(
    {
      key: "interview",
      label: "Interview",
      detail: upcoming
        ? `${upcoming.interviewAt!.toDate() < now ? "Update · " : ""}${shortDate(upcoming.interviewAt!.toDate())}`
        : doneInterviews
          ? `${doneInterviews} done`
          : null,
      tip: interviews.length
        ? interviews.map((p) => {
            const status =
              p.outcome === "approved"
                ? "approved"
                : p.outcome === "rejected"
                  ? "rejected"
                  : p.interviewStatus === "cancelled"
                    ? "cancelled"
                    : p.interviewStatus === "done"
                      ? "done, no decision"
                      : p.interviewAt!.toDate() < now
                        ? "to update"
                        : "scheduled";
            return `${p.nanny.name} · ${dateTime(p.interviewAt!.toDate())} · ${status}`;
          })
        : ["No interviews scheduled"],
    },
    approved.length > 0 || placed,
  );

  // 4. Approved by the customer
  add(
    {
      key: "approved",
      label: "Approved",
      detail: approved.length ? firstName(approved[0]!.nanny.name) : null,
      tip: approved.length
        ? approved.map(
            (p) =>
              `${p.nanny.name}${p.outcomeNote ? ` · ${p.outcomeNote}` : ""}`,
          )
        : ["No nanny approved yet"],
    },
    approved.length > 0 || placed,
  );

  // 5. Placement (and any nannies replaced before her)
  const pl = c.placement;
  const past = c.placementHistory ?? [];
  const ordinal = (n: number) => (n === 2 ? "2nd" : n === 3 ? "3rd" : `${n}th`);
  add(
    {
      key: "placed",
      label: "Placed",
      detail: pl
        ? `${firstName(pl.nanny.name)}${past.length ? ` (${ordinal(past.length + 1)})` : ""}`
        : null,
      tip: [
        ...(pl
          ? [
              pl.nanny.name + (pl.nanny.phone ? ` · ${pl.nanny.phone}` : ""),
              `Starts ${pl.startDate}`,
              ...(pl.siteAddress ? [pl.siteAddress] : []),
              ...(pl.placedAt
                ? [
                    `Placed ${dateTime(pl.placedAt.toDate())}${pl.placedBy ? ` by ${who(pl.placedBy)}` : ""}`,
                  ]
                : []),
            ]
          : ["Not placed yet"]),
        ...[...past]
          .reverse()
          .map(
            (h) =>
              `Earlier: ${h.nanny.name} · from ${h.startDate}${h.endedAt ? `, replaced ${shortDate(h.endedAt.toDate())}` : ""}${h.endReason ? ` (${h.endReason})` : ""}`,
          ),
      ],
    },
    placed,
  );

  // 6. Travel
  const travelTip: string[] = [];
  if (t) {
    if (t.scope)
      travelTip.push(
        `${t.scope === "inter_city" ? "Inter-city" : "Within the city"}${t.mode ? ` · ${TRAVEL_LABEL[t.mode] ?? t.mode}` : ""}${t.fromCity ? ` from ${t.fromCity}` : ""}`,
      );
    else if (!t.travelling) travelTip.push("Not travelling");
    if (t.ticketNumber) travelTip.push(`Ticket / booking ${t.ticketNumber}`);
    if (t.departAt) travelTip.push(`Leaves ${dateTime(t.departAt.toDate())}`);
    if (t.arriveAt) travelTip.push(`Arrives ${dateTime(t.arriveAt.toDate())}`);
    if (t.reachedPgAt)
      travelTip.push(`Reached PG ${dateTime(t.reachedPgAt.toDate())}`);
    if (t.ticketNote) travelTip.push(t.ticketNote);
  }
  add(
    {
      key: "travel",
      label: "Travel",
      detail: !t
        ? null
        : t.scope === "inter_city"
          ? t.reachedPgAt
            ? "Reached PG"
            : t.ticketNumber
              ? "Ticket booked"
              : "Inter-city"
          : t.scope === "intra_city"
            ? t.departAt
              ? "Ride booked"
              : "Within city"
            : null,
      tip: travelTip.length
        ? travelTip
        : [placed ? "Add travel details" : "After placement"],
    },
    joined,
  );

  // 7. Joined at the customer's
  add(
    {
      key: "joined",
      label: "Joined",
      detail: shortDate(asDate(t?.reachedSiteAt)),
      tip: joined
        ? [
            `Based at the customer's since ${dateTime(asDate(t!.reachedSiteAt))}`,
          ]
        : ["Not joined yet"],
    },
    joined,
  );

  // The current step is the first one not done.
  const current = done.indexOf(false);
  return steps.map((s, i) => ({
    ...s,
    state: done[i] ? "done" : i === current ? "now" : "todo",
    detail: done[i] || i === current ? s.detail : null,
  }));
}
