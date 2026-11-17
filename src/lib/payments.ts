"use client";

import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  type Timestamp,
} from "firebase/firestore";
import { useEffect, useState } from "react";

import { auth, db } from "@/lib/firebase";
import { localISODate } from "@/lib/format";

/**
 * A Cashfree payment as the `cashfreeWebhook` Cloud Function saves it
 * (hey-nanny/functions/src/payments/model.ts). One document per payment attempt,
 * covering website checkouts and payment links sent by hand. Admin-only (Firestore rules).
 */
export type PaymentStatus = "SUCCESS" | "FAILED" | "USER_DROPPED";

export type Payment = {
  id: string;
  cf_payment_id: string;
  order_id: string;
  payment_amount: number;
  payment_currency: string;
  payment_status: PaymentStatus;
  /** ISO 8601 from Cashfree. */
  payment_time: string | null;
  payment_method: string | null;
  customer_details: {
    customer_id: string | null;
    customer_name: string | null;
    customer_email: string | null;
    customer_phone: string | null;
  };
  booking_id: string | null;
  failure_reason: string | null;
  environment: "production" | "sandbox";
  created_at?: Timestamp | null;
  /** Set once the payment is in a servicing case (null = couldn't be, e.g. no phone). */
  servicing_case_id?: string | null;
};

export const PAYMENT_STATUS_META: Record<
  PaymentStatus,
  { label: string; tone: string }
> = {
  SUCCESS: { label: "Paid", tone: "bg-[#dcefe1] text-success" },
  FAILED: { label: "Failed", tone: "bg-red-50 text-red-700" },
  USER_DROPPED: { label: "Abandoned", tone: "bg-beige text-muted" },
};

/** When the payment happened: Cashfree's payment_time, else when we received it. */
export function paidAt(p: Payment): Date | null {
  if (p.payment_time) {
    const d = new Date(p.payment_time);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return p.created_at ? p.created_at.toDate() : null;
}

/** "upi" → "UPI", "credit_card" → "Credit card" */
export function methodLabel(m: string | null) {
  if (!m) return "—";
  if (m.toLowerCase() === "upi") return "UPI";
  const s = m.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const MAX_PAYMENTS = 5000;

export type PaymentsState = {
  payments: Payment[];
  loading: boolean;
  error: string | null;
};

/** Live list of Cashfree payments, newest first. Sandbox (test) payments are included; filter them in the UI. */
export function usePayments(demo?: Payment[]): PaymentsState {
  const [state, setState] = useState<PaymentsState>(
    demo
      ? { payments: demo, loading: false, error: null }
      : { payments: [], loading: true, error: null },
  );
  useEffect(() => {
    if (demo) return;
    const q = query(
      collection(db(), "cashfreePayments"),
      orderBy("created_at", "desc"),
      limit(MAX_PAYMENTS),
    );
    return onSnapshot(
      q,
      (snap) =>
        setState({
          payments: snap.docs.map((d) => ({
            ...(d.data() as Omit<Payment, "id">),
            id: d.id,
          })),
          loading: false,
          error: null,
        }),
      (err) =>
        setState({
          payments: [],
          loading: false,
          error:
            err.code === "permission-denied"
              ? "Only admins can see payments. If you are an admin, check that the latest Firestore rules are deployed."
              : "Couldn't load payments. Check your connection.",
        }),
    );
  }, [demo]);
  return state;
}

/* ---------------- periods ---------------- */

export type PeriodId =
  "today" | "yesterday" | "last7" | "last30" | "month" | "lastMonth" | "custom";

/** Same choices as the Cashfree dashboard's date filter. */
export const PERIODS: { id: PeriodId; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "last7", label: "Last 7 days" },
  { id: "last30", label: "Last 30 days" },
  { id: "month", label: "This month" },
  { id: "lastMonth", label: "Last month" },
  { id: "custom", label: "Custom range" },
];

/** [start, end) in local time (IST), plus the previous period of the same length for comparison. */
export type Range = {
  start: Date;
  end: Date;
  prevStart: Date;
  prevEnd: Date;
  compareLabel: string;
};

const day = (d: Date, add = 0) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate() + add);

export function periodRange(
  id: PeriodId,
  now: Date,
  custom?: { from: string; to: string },
): Range {
  const today = day(now);
  const tomorrow = day(now, 1);
  switch (id) {
    case "today":
      return {
        start: today,
        end: tomorrow,
        prevStart: day(now, -1),
        prevEnd: today,
        compareLabel: "yesterday",
      };
    case "yesterday":
      return {
        start: day(now, -1),
        end: today,
        prevStart: day(now, -2),
        prevEnd: day(now, -1),
        compareLabel: "the day before",
      };
    case "last7":
      // Includes today, like Cashfree ("11th Nov – 17th Nov" on the 17th).
      return {
        start: day(now, -6),
        end: tomorrow,
        prevStart: day(now, -13),
        prevEnd: day(now, -6),
        compareLabel: "previous 7 days",
      };
    case "last30":
      return {
        start: day(now, -29),
        end: tomorrow,
        prevStart: day(now, -59),
        prevEnd: day(now, -29),
        compareLabel: "previous 30 days",
      };
    case "month": {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      // Same number of days into last month (capped at its length).
      const prevEnd = new Date(
        Math.min(day(prevStart, now.getDate()).getTime(), start.getTime()),
      );
      return {
        start,
        end: tomorrow,
        prevStart,
        prevEnd,
        compareLabel: "same days last month",
      };
    }
    case "lastMonth": {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 1);
      return {
        start,
        end,
        prevStart: new Date(now.getFullYear(), now.getMonth() - 2, 1),
        prevEnd: start,
        compareLabel: "the month before",
      };
    }
    case "custom": {
      // "2026-11-01" (whole day) or "2026-11-01T09:30" (exact minute, inclusive).
      const parse = (v: string | undefined, isEnd: boolean) => {
        if (!v) return isEnd ? tomorrow : today;
        if (v.includes("T")) {
          const d = new Date(v);
          return isEnd ? new Date(d.getTime() + 60_000) : d;
        }
        const d = new Date(`${v}T00:00:00`);
        return isEnd ? day(d, 1) : d;
      };
      let start = parse(custom?.from, false);
      let end = parse(custom?.to, true);
      if (end <= start)
        [start, end] = [parse(custom?.to, false), parse(custom?.from, true)];
      const len = end.getTime() - start.getTime();
      return {
        start,
        end,
        prevStart: new Date(start.getTime() - len),
        prevEnd: start,
        compareLabel: "previous period",
      };
    }
  }
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const ordinal = (n: number) =>
  `${n}${n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th"}`;

/** "11th Nov – 17th Nov", as Cashfree shows it (with times when the range isn't whole days). */
export function rangeLabel(r: Pick<Range, "start" | "end">) {
  const last = new Date(r.end.getTime() - 1);
  const wholeDays =
    r.start.getHours() === 0 &&
    r.start.getMinutes() === 0 &&
    r.end.getHours() === 0 &&
    r.end.getMinutes() === 0;
  const time = (d: Date) =>
    d
      .toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })
      .toLowerCase();
  const f = (d: Date) =>
    `${ordinal(d.getDate())} ${MONTHS[d.getMonth()]}${d.getFullYear() !== new Date().getFullYear() ? ` ${d.getFullYear()}` : ""}`;
  if (!wholeDays)
    return `${f(r.start)}, ${time(r.start)} – ${f(last)}, ${time(last)}`;
  return r.start.toDateString() === last.toDateString()
    ? f(r.start)
    : `${f(r.start)} – ${f(last)}`;
}

export const inRange = (d: Date | null, start: Date, end: Date) =>
  !!d && d >= start && d < end;

export type Summary = {
  revenue: number;
  paid: number;
  failed: number;
  abandoned: number;
  avg: number;
};

export function summarize(list: Payment[], start: Date, end: Date): Summary {
  let revenue = 0;
  let paid = 0;
  let failed = 0;
  let abandoned = 0;
  for (const p of list) {
    if (!inRange(paidAt(p), start, end)) continue;
    if (p.payment_status === "SUCCESS") {
      revenue += Number(p.payment_amount) || 0;
      paid++;
    } else if (p.payment_status === "FAILED") failed++;
    else abandoned++;
  }
  return { revenue, paid, failed, abandoned, avg: paid ? revenue / paid : 0 };
}

export type Bucket = {
  key: string;
  label: string;
  tooltip: string;
  amount: number;
  count: number;
};

/**
 * Amount and count per bucket: per hour for a single day, per day up to ~2
 * months, per month beyond that. Every bucket in the range is included.
 */
export function bucketize(
  points: { at: Date | null; amount: number }[],
  start: Date,
  end: Date,
): Bucket[] {
  const days = Math.round((end.getTime() - start.getTime()) / 86400000);
  const mode: "hour" | "day" | "month" =
    days <= 1 ? "hour" : days <= 62 ? "day" : "month";
  const buckets = new Map<string, Bucket>();
  const keyOf = (d: Date) =>
    mode === "hour"
      ? String(d.getHours())
      : mode === "day"
        ? localISODate(d)
        : `${d.getFullYear()}-${d.getMonth()}`;
  const hourLabel = (h: number) =>
    `${h % 12 === 0 ? 12 : h % 12} ${h % 24 < 12 ? "AM" : "PM"}`;

  if (mode === "hour") {
    for (let h = 0; h < 24; h++)
      buckets.set(String(h), {
        key: String(h),
        label: hourLabel(h),
        tooltip: `${hourLabel(h)} – ${hourLabel(h + 1)}`,
        amount: 0,
        count: 0,
      });
  } else if (mode === "day") {
    for (let d = new Date(start); d < end; d = day(d, 1)) {
      buckets.set(keyOf(d), {
        key: keyOf(d),
        label: `${d.getDate()} ${MONTHS[d.getMonth()]}`,
        tooltip: d.toLocaleDateString("en-IN", {
          weekday: "short",
          day: "numeric",
          month: "short",
          year: "numeric",
        }),
        amount: 0,
        count: 0,
      });
    }
  } else {
    for (
      let d = new Date(start.getFullYear(), start.getMonth(), 1);
      d < end;
      d = new Date(d.getFullYear(), d.getMonth() + 1, 1)
    ) {
      buckets.set(keyOf(d), {
        key: keyOf(d),
        label: `${MONTHS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`,
        tooltip: `${MONTHS[d.getMonth()]} ${d.getFullYear()}`,
        amount: 0,
        count: 0,
      });
    }
  }
  for (const p of points) {
    if (!inRange(p.at, start, end)) continue;
    const b = buckets.get(keyOf(p.at!));
    if (!b) continue;
    b.amount += p.amount;
    b.count += 1;
  }
  return [...buckets.values()];
}

/** Successful payments per bucket. */
export const revenueBuckets = (list: Payment[], start: Date, end: Date) =>
  bucketize(
    list
      .filter((p) => p.payment_status === "SUCCESS")
      .map((p) => ({ at: paidAt(p), amount: Number(p.payment_amount) || 0 })),
    start,
    end,
  );

/** +12% / -5% vs the previous period; null when there's nothing to compare with. */
export function change(current: number, previous: number): number | null {
  if (!previous) return current ? null : 0;
  return ((current - previous) / previous) * 100;
}

/* ---------------- refunds (Firestore cashfreeRefunds) ---------------- */

export type RefundStatus = "SUCCESS" | "PENDING" | "CANCELLED" | "ONHOLD";

export type Refund = {
  id: string;
  cf_refund_id: string;
  cf_payment_id: string | null;
  refund_id: string | null;
  order_id: string | null;
  refund_amount: number;
  refund_currency: string;
  refund_status: RefundStatus;
  refund_type: string | null;
  refund_note: string | null;
  refund_arn: string | null;
  status_description: string | null;
  refund_created_at: string | null;
  refund_processed_at: string | null;
  source: "webhook" | "import";
  environment: "production" | "sandbox";
  created_at?: Timestamp | null;
};

export const REFUND_STATUS_META: Record<
  RefundStatus,
  { label: string; tone: string }
> = {
  SUCCESS: { label: "Refunded", tone: "bg-[#dcefe1] text-success" },
  PENDING: { label: "Pending", tone: "bg-[#fbecc8] text-[#7a5410]" },
  ONHOLD: { label: "On hold", tone: "bg-[#fbecc8] text-[#7a5410]" },
  CANCELLED: { label: "Cancelled", tone: "bg-beige text-muted" },
};

/** When the refund was created (what Cashfree's overview counts by). */
export function refundedAt(r: Refund): Date | null {
  for (const v of [r.refund_created_at, r.refund_processed_at]) {
    if (!v) continue;
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return r.created_at ? r.created_at.toDate() : null;
}

export function useRefunds(demo?: Refund[]): {
  refunds: Refund[];
  loading: boolean;
  error: string | null;
} {
  const [state, setState] = useState<{
    refunds: Refund[];
    loading: boolean;
    error: string | null;
  }>(
    demo
      ? { refunds: demo, loading: false, error: null }
      : { refunds: [], loading: true, error: null },
  );
  useEffect(() => {
    if (demo) return;
    const q = query(
      collection(db(), "cashfreeRefunds"),
      orderBy("created_at", "desc"),
      limit(MAX_PAYMENTS),
    );
    return onSnapshot(
      q,
      (snap) =>
        setState({
          refunds: snap.docs.map((d) => ({
            ...(d.data() as Omit<Refund, "id">),
            id: d.id,
          })),
          loading: false,
          error: null,
        }),
      (err) =>
        setState({
          refunds: [],
          loading: false,
          error:
            err.code === "permission-denied"
              ? "Only admins can see refunds. Check that the latest Firestore rules are deployed."
              : "Couldn't load refunds.",
        }),
    );
  }, [demo]);
  return state;
}

/** Refunds that count towards totals (Cashfree doesn't count cancelled ones as refunded). */
export const countsAsRefund = (r: Refund) => r.refund_status !== "CANCELLED";

/* ---------------- settlements (live from Cashfree via /api/cashfree/settlements) ---------------- */

export type Settlement = {
  id: string;
  status: string;
  statusDescription: string | null;
  utr: string | null;
  paymentFrom: string | null;
  paymentTill: string | null;
  initiatedOn: string | null;
  processedOn: string | null;
  paymentAmount: number;
  charges: number;
  adjustment: number;
  amountSettled: number;
  type: string | null;
};

export function settledAt(s: Settlement): Date | null {
  for (const v of [s.processedOn, s.initiatedOn]) {
    if (!v) continue;
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

export const SETTLEMENT_STATUS_META: Record<
  string,
  { label: string; tone: string }
> = {
  SUCCESS: { label: "Settled", tone: "bg-[#dcefe1] text-success" },
  PENDING: { label: "Pending", tone: "bg-[#fbecc8] text-[#7a5410]" },
  PENDING_WITH_CASHFREE: {
    label: "With Cashfree",
    tone: "bg-[#fbecc8] text-[#7a5410]",
  },
  PENDING_WITH_BANK: {
    label: "With bank",
    tone: "bg-[#fbecc8] text-[#7a5410]",
  },
  FAILED: { label: "Failed", tone: "bg-red-50 text-red-700" },
};

async function adminFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const user = auth().currentUser;
  if (!user) throw new Error("Not signed in");
  const token = await user.getIdToken();
  const res = await fetch(path, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
  const body = (await res.json().catch(() => null)) as
    (T & { error?: string }) | null;
  if (!res.ok || !body)
    throw new Error(body?.error ?? `Request failed (${res.status})`);
  return body;
}

/** Data for [start, end) fetched live from Cashfree through the ops server (admins only). */
function useCashfreeRange<T>(
  path: string,
  field: string,
  start: Date,
  end: Date,
  enabled: boolean,
  demo?: T[],
  demoAt?: (t: T) => Date | null,
) {
  const key = `${path}:${start.getTime()}-${end.getTime()}`;
  const [state, setState] = useState<{
    key: string;
    items: T[];
    error: string | null;
    at: Date | null;
    raw: Record<string, unknown> | null;
  }>({ key: "", items: [], error: null, at: null, raw: null });
  const [reload, setReload] = useState(0);
  useEffect(() => {
    if (!enabled || demo) return;
    let cancelled = false;
    adminFetch<Record<string, T[]>>(
      `${path}?from=${start.getTime()}&to=${end.getTime()}`,
    )
      .then(
        (r) =>
          !cancelled &&
          setState({
            key,
            items: r[field] ?? [],
            error: null,
            at: new Date(),
            raw: r as unknown as Record<string, unknown>,
          }),
      )
      .catch(
        (e: Error) =>
          !cancelled &&
          setState({ key, items: [], error: e.message, at: null, raw: null }),
      );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled, demo, reload]);
  if (demo)
    return {
      items: demo.filter((x) => inRange(demoAt?.(x) ?? null, start, end)),
      loading: false,
      error: null,
      updatedAt: new Date(),
      refresh: () => {},
      raw: null,
    };
  return {
    items: state.key === key ? state.items : [],
    loading: enabled && state.key !== key,
    error: state.key === key ? state.error : null,
    updatedAt: state.at,
    refresh: () => setReload((n) => n + 1),
    raw: state.key === key ? state.raw : null,
  };
}

/** Settlements for [start, end), fetched from Cashfree through the ops server. */
export function useSettlements(
  start: Date,
  end: Date,
  enabled: boolean,
  demo?: Settlement[],
) {
  const r = useCashfreeRange<Settlement>(
    "/api/cashfree/settlements",
    "settlements",
    start,
    end,
    enabled,
    demo,
    settledAt,
  );
  return {
    settlements: r.items,
    loading: r.loading,
    error: r.error,
    updatedAt: r.updatedAt,
    refresh: r.refresh,
  };
}

/** A refund event from Cashfree's PG reconciliation (what Cashfree's refund totals are built from). */
export type LiveRefund = {
  id: string;
  cfRefundId: string | null;
  refundId: string | null;
  orderId: string | null;
  cfPaymentId: string | null;
  amount: number;
  currency: string;
  status: string;
  eventTime: string | null;
  processedAt: string | null;
  arn: string | null;
  note: string | null;
  customerName: string | null;
  customerPhone: string | null;
  settled: boolean;
};

export function liveRefundAt(r: LiveRefund): Date | null {
  for (const v of [r.eventTime, r.processedAt]) {
    if (!v) continue;
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

/** Failed and cancelled refunds aren't counted in totals. */
export const liveRefundCounts = (r: LiveRefund) =>
  r.status !== "FAILED" && r.status !== "CANCELLED";

export const LIVE_REFUND_STATUS: Record<
  string,
  { label: string; tone: string }
> = {
  SUCCESS: { label: "Refunded", tone: "bg-[#dcefe1] text-success" },
  PENDING: { label: "Pending", tone: "bg-[#fbecc8] text-[#7a5410]" },
  ONHOLD: { label: "On hold", tone: "bg-[#fbecc8] text-[#7a5410]" },
  FAILED: { label: "Failed", tone: "bg-red-50 text-red-700" },
  CANCELLED: { label: "Cancelled", tone: "bg-beige text-muted" },
};

/** Refunds for [start, end), live from Cashfree. */
export function useLiveRefunds(
  start: Date,
  end: Date,
  enabled: boolean,
  demo?: LiveRefund[],
) {
  const r = useCashfreeRange<LiveRefund>(
    "/api/cashfree/refunds",
    "refunds",
    start,
    end,
    enabled,
    demo,
    liveRefundAt,
  );
  const raw = r.raw as {
    scanned?: number;
    types?: Record<string, number>;
    sampleKeys?: string[] | null;
  } | null;
  return {
    refunds: r.items,
    loading: r.loading,
    error: r.error,
    updatedAt: r.updatedAt,
    refresh: r.refresh,
    scan: raw,
  };
}

export type ImportRefundsResult = {
  orders: number;
  refunds: number;
  created: number;
  updated: number;
  failedOrders: number;
  settlementRecon?: {
    scanned: number;
    types: Record<string, number>;
    refunds: number;
    error: string | null;
  };
  errors?: {
    status: number;
    message: string;
    orderId: string;
    count: number;
  }[];
};

export const importRefunds = (days = 120) =>
  adminFetch<ImportRefundsResult>("/api/cashfree/refunds/import", {
    method: "POST",
    body: JSON.stringify({ days }),
  });
