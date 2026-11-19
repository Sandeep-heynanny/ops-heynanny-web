import { adminDb } from "@/lib/server/admin";
import { CashfreeError, fetchOrderPayments, fetchPaymentsByDate, cashfreeRequest, type ReconPayment } from "@/lib/server/cashfree";

/**
 * Backfill `cashfreePayments` with payments made before the cashfreeWebhook
 * function went live (11 Nov 2026), or any the webhook missed.
 *
 * 1. Find order IDs: Cashfree settlement reconciliation (every settled payment) and
 *    PG reconciliation (by date), in 30-day windows.
 * 2. For each order, read its payment attempts (GET /orders/{id}/payments) and the
 *    order (customer details, booking tag).
 * 3. Save each attempt in the same shape the webhook function writes
 *    (hey-nanny/functions/src/payments/model.ts). A payment that's already saved is
 *    never changed, except a failed one that Cashfree now reports as successful.
 *    Successful imports are queued for the Payments Google Sheet like webhook ones.
 */

type Status = "SUCCESS" | "FAILED" | "USER_DROPPED";
const STATUSES: Status[] = ["SUCCESS", "FAILED", "USER_DROPPED"];
const PAYMENT_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const ORDER_ID_RE = /^HN-([A-Za-z0-9]{10,40})-[a-z0-9]+$/;
const BOOKING_ID_RE = /^[A-Za-z0-9]{10,40}$/;
const MAX_ORDERS = 800;

const text = (v: unknown, max = 200) => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
};
const obj = (v: unknown) => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});

function bookingIdFor(orderId: string, tags: unknown): string | null {
  const tagged = obj(tags).bookingId;
  if (typeof tagged === "string" && BOOKING_ID_RE.test(tagged)) return tagged;
  return ORDER_ID_RE.exec(orderId)?.[1] ?? null;
}

type Customer = { customer_id: string | null; customer_name: string | null; customer_email: string | null; customer_phone: string | null };

export type PaymentFields = {
  cf_payment_id: string;
  order_id: string;
  payment_amount: number;
  payment_currency: string;
  payment_status: Status;
  payment_time: string | null;
  payment_method: string | null;
  customer_details: Customer;
  booking_id: string | null;
  failure_reason: string | null;
  event_type: string;
  event_time: string | null;
  environment: "production";
};

/** One attempt from GET /orders/{id}/payments → the stored fields, or null if it isn't final. */
export function fromOrderPayment(p: Record<string, unknown>, orderId: string, order: Record<string, unknown>, recon: ReconPayment | undefined): PaymentFields | null {
  const id = text(p.cf_payment_id, 64);
  const status = String(p.payment_status ?? "").toUpperCase() as Status;
  const amount = Number(p.payment_amount ?? order.order_amount);
  if (!id || !PAYMENT_ID_RE.test(id) || !STATUSES.includes(status) || !Number.isFinite(amount) || amount < 0) return null;
  const c = obj(order.customer_details);
  const method = text(p.payment_group, 40) ?? text(Object.keys(obj(p.payment_method))[0], 40);
  return {
    cf_payment_id: id,
    order_id: text(p.order_id, 100) ?? orderId,
    payment_amount: Math.round(amount * 100) / 100,
    payment_currency: (text(p.payment_currency ?? order.order_currency, 3) ?? "INR").toUpperCase(),
    payment_status: status,
    payment_time: text(p.payment_completion_time ?? p.payment_time, 40),
    payment_method: method,
    customer_details: {
      customer_id: text(c.customer_id, 100),
      customer_name: text(c.customer_name, 120) ?? recon?.customerName ?? null,
      customer_email: text(c.customer_email, 120) ?? recon?.customerEmail ?? null,
      customer_phone: text(c.customer_phone, 20) ?? recon?.customerPhone ?? null,
    },
    booking_id: bookingIdFor(orderId, order.order_tags),
    failure_reason: status === "SUCCESS" ? null : text(obj(p.error_details).error_reason ?? obj(p.error_details).error_description, 200),
    event_type: "IMPORT",
    event_time: null,
    environment: "production",
  };
}

type Outcome = "created" | "upgraded" | "same";

async function save(p: PaymentFields): Promise<Outcome> {
  const db = adminDb();
  const ref = db.collection("cashfreePayments").doc(p.cf_payment_id);
  const now = new Date();
  const paid = p.payment_time ? new Date(p.payment_time) : null;
  // created_at = when the payment happened, so lists and the refund import's date window stay right.
  const createdAt = paid && !Number.isNaN(paid.getTime()) ? paid : now;
  const queued = {
    sheet_sync_status: p.payment_status === "SUCCESS" ? "PENDING" : "NOT_REQUIRED",
    sheet_sync_attempts: 0,
    sheet_sync_error: null,
    sheet_next_attempt_at: null,
    sheet_lease_id: null,
    sheet_lease_until: null,
  };
  return db.runTransaction(async (tx) => {
    const cur = await tx.get(ref);
    if (!cur.exists) {
      tx.create(ref, { ...p, ...queued, sheet_row_range: null, sheet_synced_at: null, source: "import", created_at: createdAt, updated_at: now });
      return "created";
    }
    const existing = cur.data()!;
    if (existing.payment_status !== "SUCCESS" && p.payment_status === "SUCCESS") {
      tx.update(ref, { ...p, ...queued, updated_at: now });
      return "upgraded";
    }
    return "same";
  });
}

export type ImportPaymentsResult = {
  orders: number;
  payments: number;
  created: number;
  upgraded: number;
  alreadySaved: number;
  failedOrders: number;
  recon: { settlement: number; pg: number; types: Record<string, number>; error: string | null };
  errors: { status: number; message: string; orderId: string; count: number }[];
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
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

export async function importPayments(days: number): Promise<ImportPaymentsResult> {
  const result: ImportPaymentsResult = {
    orders: 0,
    payments: 0,
    created: 0,
    upgraded: 0,
    alreadySaved: 0,
    failedOrders: 0,
    recon: { settlement: 0, pg: 0, types: {}, error: null },
    errors: [],
  };

  // 1. Order IDs from both reconciliation reports.
  const orders = new Map<string, ReconPayment>();
  const end = new Date();
  const start = new Date(end.getTime() - days * 86_400_000);
  for (const path of ["/settlement/recon", "/recon"] as const) {
    for (let from = start; from < end; from = new Date(from.getTime() + 30 * 86_400_000)) {
      const to = new Date(Math.min(from.getTime() + 30 * 86_400_000, end.getTime()));
      try {
        const scan = await fetchPaymentsByDate(from, to, path);
        for (const [k, v] of Object.entries(scan.types)) result.recon.types[k] = (result.recon.types[k] ?? 0) + v;
        for (const p of scan.payments) {
          if (path === "/recon") result.recon.pg++;
          else result.recon.settlement++;
          if (!orders.has(p.orderId)) orders.set(p.orderId, p);
        }
      } catch (err) {
        result.recon.error = `${path}: ${(err as Error).message.slice(0, 200)}`;
        console.error("[payments import]", result.recon.error);
        break;
      }
    }
  }

  const orderIds = [...orders.keys()].slice(0, MAX_ORDERS);
  result.orders = orderIds.length;

  const noteError = (orderId: string, err: unknown) => {
    const status = err instanceof CashfreeError ? err.status : 0;
    const message = (err as Error).message.slice(0, 200);
    const same = result.errors.find((e) => e.status === status && e.message === message);
    if (same) same.count++;
    else if (result.errors.length < 5) result.errors.push({ status, message, orderId, count: 1 });
  };

  // 2 + 3. Read each order's attempts and save them. Two at a time (Cashfree rate limits).
  const queue = [...orderIds];
  const worker = async () => {
    for (let orderId = queue.shift(); orderId; orderId = queue.shift()) {
      try {
        const [order, attempts] = await Promise.all([
          withRetry(() => cashfreeRequest<Record<string, unknown>>("GET", `/orders/${encodeURIComponent(orderId)}`)),
          withRetry(() => fetchOrderPayments(orderId)),
        ]);
        for (const raw of attempts) {
          const p = fromOrderPayment(raw, orderId, order, orders.get(orderId));
          if (!p) continue;
          result.payments++;
          const outcome = await save(p);
          if (outcome === "created") result.created++;
          else if (outcome === "upgraded") result.upgraded++;
          else result.alreadySaved++;
        }
      } catch (err) {
        result.failedOrders++;
        noteError(orderId, err);
        console.error("[payments import]", orderId, (err as Error).message);
      }
    }
  };
  await Promise.all(Array.from({ length: 2 }, worker));
  return result;
}
