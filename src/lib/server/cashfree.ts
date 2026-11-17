
/**
 * Cashfree Payment Gateway REST calls from the ops server. Uses the same keys as
 * the website (Secret Manager: CASHFREE_CLIENT_ID / CASHFREE_CLIENT_SECRET),
 * which never reach the browser.
 */
const API_VERSION = "2025-01-01";

function base() {
  return process.env.CASHFREE_ENV === "sandbox" ? "https://sandbox.cashfree.com/pg" : "https://api.cashfree.com/pg";
}

export function cashfreeConfigured() {
  return Boolean(process.env.CASHFREE_CLIENT_ID && process.env.CASHFREE_CLIENT_SECRET);
}

export class CashfreeError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function cashfreeRequest<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const id = process.env.CASHFREE_CLIENT_ID;
  const secret = process.env.CASHFREE_CLIENT_SECRET;
  if (!id || !secret) throw new CashfreeError(500, "Cashfree keys aren't set for the ops dashboard (CASHFREE_CLIENT_ID / CASHFREE_CLIENT_SECRET).");
  const res = await fetch(`${base()}${path}`, {
    method,
    headers: {
      "x-api-version": API_VERSION,
      "x-client-id": id,
      "x-client-secret": secret,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  const json = (await res.json().catch(() => null)) as (T & { message?: string; code?: string }) | null;
  if (!res.ok || json === null) {
    throw new CashfreeError(res.status, `Cashfree ${res.status}: ${json?.message ?? json?.code ?? "no response"}`.slice(0, 300));
  }
  return json;
}

/** "2026-11-17T00:00:00+05:30": Cashfree date filters in IST. */
export function istIso(d: Date) {
  const ist = new Date(d.getTime() + 330 * 60_000);
  return `${ist.toISOString().slice(0, 19)}+05:30`;
}

/* ---------------- settlements ---------------- */

export type Settlement = {
  id: string;
  status: string;
  statusDescription: string | null;
  utr: string | null;
  paymentFrom: string | null;
  paymentTill: string | null;
  initiatedOn: string | null;
  processedOn: string | null;
  /** Net transactions in this settlement. */
  paymentAmount: number;
  /** PG + settlement + split charges and taxes. */
  charges: number;
  adjustment: number;
  /** Credited to the bank account. */
  amountSettled: number;
  type: string | null;
};

const num = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) || 0 : 0);
const str = (v: unknown) => (v === null || v === undefined || v === "" ? null : String(v));

/** POST /pg/settlements for a date range, following the cursor. */
export async function fetchSettlements(start: Date, end: Date): Promise<Settlement[]> {
  const out: Settlement[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < 20; page++) {
    const res: { cursor?: string | null; data?: Record<string, unknown>[] } = await cashfreeRequest("POST", "/settlements", {
      pagination: { limit: 1000, cursor },
      filters: { start_date: istIso(start), end_date: istIso(new Date(end.getTime() - 1000)) },
    });
    for (const s of res.data ?? []) {
      out.push({
        id: String(s.cf_settlement_id ?? s.settlement_id ?? ""),
        status: String(s.status ?? s.settlement_status ?? "UNKNOWN"),
        statusDescription: str(s.status_description),
        utr: str(s.settlement_utr ?? s.utr ?? s.transfer_utr),
        paymentFrom: str(s.payment_from),
        paymentTill: str(s.payment_till),
        initiatedOn: str(s.settlement_initiated_on ?? s.settlement_date),
        processedOn: str(s.settlement_processed_on ?? s.transfer_time),
        paymentAmount: num(s.payment_amount),
        charges:
          num(s.pg_service_charge) + num(s.pg_service_tax) + num(s.settlement_charge) + num(s.settlement_tax) + num(s.split_service_charge) + num(s.split_service_tax) + num(s.vendor_commission) ||
          num(s.service_charge) + num(s.service_tax),
        adjustment: num(s.adjustment),
        amountSettled: num(s.amount_settled ?? s.settlement_amount),
        type: str(s.settlement_type),
      });
    }
    cursor = res.cursor ?? null;
    if (!cursor) break;
  }
  return out;
}

/* ---------------- refunds ---------------- */

/** GET /pg/orders/{order_id}/refunds */
export async function fetchOrderRefunds(orderId: string): Promise<Record<string, unknown>[]> {
  const res = await cashfreeRequest<Record<string, unknown>[] | { data?: Record<string, unknown>[] }>("GET", `/orders/${encodeURIComponent(orderId)}/refunds`);
  return Array.isArray(res) ? res : (res.data ?? []);
}

/* ---------------- refunds by date (PG reconciliation) ---------------- */

export type ReconRefund = {
  id: string;
  cfRefundId: string | null;
  refundId: string | null;
  orderId: string | null;
  cfPaymentId: string | null;
  amount: number;
  currency: string;
  /** SUCCESS / PENDING / FAILED / CANCELLED, as Cashfree reports the event. */
  status: string;
  eventTime: string | null;
  processedAt: string | null;
  arn: string | null;
  note: string | null;
  customerName: string | null;
  customerPhone: string | null;
  settled: boolean;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type RefundScan = {
  refunds: ReconRefund[];
  /** How many events Cashfree returned, by event_type, to diagnose empty results. */
  scanned: number;
  types: Record<string, number>;
  /** Field names of the first event, when nothing matched (no values, so no customer data). */
  sampleKeys: string[] | null;
};

type Item = Record<string, unknown>;
const GROUPS = ["event_details", "order_details", "payment_details", "refund_details", "customer_details", "settlement_details"] as const;

/** Reads a field whether Cashfree nests it in a group (latest API) or puts it at the top level (older versions). */
function field(item: Item, group: (typeof GROUPS)[number], ...keys: string[]): unknown {
  const g = item[group];
  for (const k of keys) {
    if (g && typeof g === "object" && (g as Item)[k] !== undefined && (g as Item)[k] !== null) return (g as Item)[k];
    if (item[k] !== undefined && item[k] !== null) return item[k];
  }
  return undefined;
}

/**
 * POST /pg/recon or /pg/settlement/recon for [start, end), keeping only REFUND events.
 * Settlement recon lists every refund deducted in a settlement in that period,
 * whatever the payment date. (/pg/recon turned out to return only some events.)
 */
export async function fetchRefundsByDate(start: Date, end: Date, path: "/recon" | "/settlement/recon" = "/recon"): Promise<RefundScan> {
  const out: ReconRefund[] = [];
  const types: Record<string, number> = {};
  let scanned = 0;
  let sampleKeys: string[] | null = null;
  // Cashfree rejects end dates in the future.
  const until = new Date(Math.min(end.getTime() - 1000, Date.now() - 60_000));
  let cursor: string | null = null;
  for (let page = 0; page < 60; page++) {
    let res: { cursor?: string | null; data?: Item[] } | null = null;
    for (let attempt = 0; ; attempt++) {
      try {
        res = await cashfreeRequest("POST", path, {
          pagination: { limit: 100, cursor },
          filters: { start_date: istIso(start), end_date: istIso(until) },
        });
        break;
      } catch (err) {
        if (attempt < 4 && err instanceof CashfreeError && (err.status === 429 || err.status >= 500)) {
          await sleep(800 * 2 ** attempt);
          continue;
        }
        throw err;
      }
    }
    const data = Array.isArray(res?.data) ? res!.data : [];
    for (const item of data) {
      scanned++;
      sampleKeys ??= [...Object.keys(item), ...GROUPS.flatMap((g) => (item[g] && typeof item[g] === "object" ? Object.keys(item[g] as Item).map((k) => `${g}.${k}`) : []))].slice(0, 60);
      const type = String(field(item, "event_details", "event_type") ?? "UNKNOWN").toUpperCase();
      types[type] = (types[type] ?? 0) + 1;
      if (type !== "REFUND") continue;
      const eventId = str(field(item, "event_details", "event_id"));
      const orderId = str(field(item, "order_details", "order_id"));
      const eventTime = str(field(item, "event_details", "event_time"));
      out.push({
        id: eventId ?? `${orderId}-${eventTime}`,
        cfRefundId: eventId,
        refundId: str(field(item, "refund_details", "refund_id")),
        orderId,
        cfPaymentId: str(field(item, "payment_details", "cf_payment_id")),
        amount: num(field(item, "event_details", "event_amount", "amount")),
        currency: String(field(item, "event_details", "event_currency", "currency") ?? "INR"),
        status: String(field(item, "event_details", "event_status", "status") ?? "UNKNOWN").toUpperCase(),
        eventTime,
        processedAt: str(field(item, "refund_details", "refund_processed_at")),
        arn: str(field(item, "refund_details", "refund_arn")),
        note: str(field(item, "refund_details", "refund_note") ?? field(item, "event_details", "event_remarks", "remarks")),
        customerName: str(field(item, "customer_details", "customer_name")),
        customerPhone: str(field(item, "customer_details", "customer_phone")),
        settled: !!str(field(item, "settlement_details", "cf_settlement_id")),
      });
    }
    cursor = res?.cursor ?? null;
    if (!cursor || !data.length) break;
  }
  return { refunds: out, scanned, types, sampleKeys: out.length ? null : sampleKeys };
}
