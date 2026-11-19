import { Timestamp } from "firebase-admin/firestore";

import { adminDb } from "@/lib/server/admin";
import { CashfreeError, fetchOrderRefunds, fetchRefundsByDate, type ReconRefund } from "@/lib/server/cashfree";

/**
 * Import refunds from Cashfree into Firestore `cashfreeRefunds`, alongside the
 * ones the cashfreeWebhook function saves. Same document shape and rules as the
 * function (hey-nanny/functions/src/refunds/model.ts): a final status (SUCCESS /
 * CANCELLED) is never downgraded, and a refund that's already saved under another
 * ID (same payment and amount) is updated instead of duplicated.
 */
const STATUSES = ["SUCCESS", "PENDING", "CANCELLED", "ONHOLD"] as const;
type Status = (typeof STATUSES)[number];
const FINAL = ["SUCCESS", "CANCELLED"];
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

const text = (v: unknown, max = 200) => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
};

type RefundDoc = {
  cf_refund_id: string;
  cf_payment_id: string | null;
  refund_id: string | null;
  order_id: string | null;
  refund_amount: number;
  refund_currency: string;
  refund_status: Status;
  refund_type: string | null;
  refund_note: string | null;
  refund_arn: string | null;
  status_description: string | null;
  refund_created_at: string | null;
  refund_processed_at: string | null;
  source: "import";
  environment: "production";
};

const toStatus = (v: unknown): Status | null => {
  const s = String(v ?? "").toUpperCase();
  if (s === "FAILED") return "CANCELLED";
  return STATUSES.find((x) => x === s) ?? null;
};

/** A refund from GET /orders/{id}/refunds. */
function fromOrderApi(r: Record<string, unknown>, orderId: string): RefundDoc | null {
  const id = text(r.cf_refund_id, 64);
  const amount = Number(r.refund_amount);
  const status = toStatus(r.refund_status);
  if (!id || !ID_RE.test(id) || !Number.isFinite(amount) || amount < 0 || !status) return null;
  return {
    cf_refund_id: id,
    cf_payment_id: text(r.cf_payment_id, 64),
    refund_id: text(r.refund_id, 100),
    order_id: text(r.order_id, 100) ?? orderId,
    refund_amount: Math.round(amount * 100) / 100,
    refund_currency: (text(r.refund_currency, 3) ?? "INR").toUpperCase(),
    refund_status: status,
    refund_type: text(r.refund_type, 40),
    refund_note: text(r.refund_note, 200),
    refund_arn: text(r.refund_arn, 64),
    status_description: text(r.status_description, 200),
    refund_created_at: text(r.created_at, 40),
    refund_processed_at: text(r.processed_at, 40),
    source: "import",
    environment: "production",
  };
}

/** A REFUND event from settlement reconciliation. */
function fromRecon(r: ReconRefund): RefundDoc | null {
  const id = r.cfRefundId && ID_RE.test(r.cfRefundId) ? r.cfRefundId : null;
  const status = toStatus(r.status) ?? "SUCCESS";
  if (!id || !Number.isFinite(r.amount) || r.amount < 0) return null;
  return {
    cf_refund_id: id,
    cf_payment_id: r.cfPaymentId,
    refund_id: r.refundId,
    order_id: r.orderId,
    refund_amount: Math.round(Math.abs(r.amount) * 100) / 100,
    refund_currency: r.currency || "INR",
    refund_status: status,
    refund_type: null,
    refund_note: r.note,
    refund_arn: r.arn,
    status_description: null,
    refund_created_at: r.eventTime,
    refund_processed_at: r.processedAt,
    source: "import",
    environment: "production",
  };
}

type Outcome = "created" | "updated" | "same";

/** Create or update one refund, matching an existing doc by ID, or by payment + amount. */
async function upsert(r: RefundDoc): Promise<Outcome> {
  const db = adminDb();
  const col = db.collection("cashfreeRefunds");
  let ref = col.doc(r.cf_refund_id);
  if (!(await ref.get()).exists && r.cf_payment_id) {
    const twin = await col.where("cf_payment_id", "==", r.cf_payment_id).where("refund_amount", "==", r.refund_amount).limit(1).get();
    if (!twin.empty) ref = twin.docs[0]!.ref;
  }
  const now = new Date();
  return db.runTransaction(async (tx) => {
    const cur = await tx.get(ref);
    if (!cur.exists) {
      tx.create(ref, { ...r, created_at: now, updated_at: now });
      return "created";
    }
    const existing = cur.data()!;
    if (FINAL.includes(existing.refund_status) && !FINAL.includes(r.refund_status)) return "same";
    const patch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(r)) {
      if (k === "source" || k === "cf_refund_id" || v === null) continue;
      // Keep what the webhook saved; only fill gaps (and status upgrades).
      if (existing[k] === null || existing[k] === undefined || (k === "refund_status" && existing[k] !== v)) patch[k] = v;
    }
    if (!Object.keys(patch).length) return "same";
    tx.update(ref, { ...patch, updated_at: now });
    return "updated";
  });
}

/** Save one refund from the Cashfree order API (e.g. one just started from a servicing case). */
export async function saveApiRefund(r: Record<string, unknown>, orderId: string): Promise<void> {
  const doc = fromOrderApi(r, orderId);
  if (doc) await upsert(doc);
}

export type ImportResult = {
  orders: number;
  refunds: number;
  created: number;
  updated: number;
  failedOrders: number;
  settlementRecon: { scanned: number; types: Record<string, number>; refunds: number; error: string | null };
  /** Up to 5 distinct Cashfree errors from order lookups, with an example order ID. */
  errors: { status: number; message: string; orderId: string; count: number }[];
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function refundsWithRetry(orderId: string) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fetchOrderRefunds(orderId);
    } catch (err) {
      const status = err instanceof CashfreeError ? err.status : 0;
      if (attempt < 4 && (status === 429 || status >= 500 || status === 0)) {
        await sleep(800 * 2 ** attempt);
        continue;
      }
      throw err;
    }
  }
}

/**
 * 1. Settlement reconciliation for the last `days` days: every refund deducted in a
 *    settlement, whatever the payment date.
 * 2. GET /orders/{id}/refunds for successful payments received in the last `days` days
 *    (catches refunds not yet in a settlement).
 */
export async function importRefunds(days: number): Promise<ImportResult> {
  const result: ImportResult = {
    orders: 0,
    refunds: 0,
    created: 0,
    updated: 0,
    failedOrders: 0,
    settlementRecon: { scanned: 0, types: {}, refunds: 0, error: null },
    errors: [],
  };
  const tally = (o: Outcome) => {
    result.refunds++;
    if (o === "created") result.created++;
    if (o === "updated") result.updated++;
  };

  // 1. Settlement reconciliation, in 30-day windows.
  const end = new Date();
  for (let from = new Date(end.getTime() - days * 86_400_000); from < end; from = new Date(from.getTime() + 30 * 86_400_000)) {
    const to = new Date(Math.min(from.getTime() + 30 * 86_400_000, end.getTime()));
    try {
      const scan = await fetchRefundsByDate(from, to, "/settlement/recon");
      result.settlementRecon.scanned += scan.scanned;
      for (const [k, v] of Object.entries(scan.types)) result.settlementRecon.types[k] = (result.settlementRecon.types[k] ?? 0) + v;
      for (const raw of scan.refunds) {
        const r = fromRecon(raw);
        if (!r) continue;
        result.settlementRecon.refunds++;
        tally(await upsert(r));
      }
    } catch (err) {
      result.settlementRecon.error = (err as Error).message.slice(0, 200);
      console.error("[refunds import] settlement recon", result.settlementRecon.error);
      break;
    }
  }

  // 2. Order lookups for recent payments.
  const since = Timestamp.fromDate(new Date(Date.now() - days * 86_400_000));
  const snap = await adminDb().collection("cashfreePayments").where("created_at", ">=", since).get();
  const orderIds = [
    ...new Set(
      snap.docs
        .map((d) => d.data())
        .filter((p) => p.payment_status === "SUCCESS" && p.environment !== "sandbox" && typeof p.order_id === "string")
        .map((p) => p.order_id as string),
    ),
  ].slice(0, 600);
  result.orders = orderIds.length;

  const noteError = (orderId: string, err: unknown) => {
    const status = err instanceof CashfreeError ? err.status : 0;
    const message = (err as Error).message.slice(0, 200);
    const same = result.errors.find((e) => e.status === status && e.message === message);
    if (same) same.count++;
    else if (result.errors.length < 5) result.errors.push({ status, message, orderId, count: 1 });
  };

  const queue = [...orderIds];
  const worker = async () => {
    for (let orderId = queue.shift(); orderId; orderId = queue.shift()) {
      let list: Record<string, unknown>[];
      try {
        list = await refundsWithRetry(orderId);
      } catch (err) {
        result.failedOrders++;
        noteError(orderId, err);
        console.error("[refunds import]", orderId, (err as Error).message);
        continue;
      }
      for (const raw of list) {
        const r = fromOrderApi(raw, orderId);
        if (r) tally(await upsert(r));
      }
    }
  };
  // Two at a time, to stay inside Cashfree's rate limits.
  await Promise.all(Array.from({ length: 2 }, worker));
  return result;
}
