"use client";

import {
  ArrowDownRight,
  ArrowUpRight,
  ChevronDown,
  Download,
  Filter,
  RefreshCw,
  RotateCcw,
  Search,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { AppHeader } from "@/components/AppHeader";
import { ComboChart } from "@/components/ComboChart";
import type { Staff } from "@/lib/auth";
import { downloadRows } from "@/lib/csv";
import {
  formatDateTime,
  formatINRExact,
  formatINRShort,
  localISODate,
} from "@/lib/format";
import {
  bucketize,
  change,
  countsAsRefund,
  importRefunds,
  inRange,
  methodLabel,
  paidAt,
  PAYMENT_STATUS_META,
  periodRange,
  PERIODS,
  rangeLabel,
  REFUND_STATUS_META,
  refundedAt,
  revenueBuckets,
  SETTLEMENT_STATUS_META,
  settledAt,
  summarize,
  usePayments,
  useRefunds,
  useSettlements,
  type Payment,
  type PaymentStatus,
  type PeriodId,
  type Refund,
  type RefundStatus,
  type Settlement,
} from "@/lib/payments";
import { displayPhone } from "@/lib/types";

type Tab = "transactions" | "refunds" | "settlements";
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

type Demo = {
  payments: Payment[];
  refunds: Refund[];
  settlements: Settlement[];
};

/** Admin page: Cashfree transactions, refunds and settlements, with the same date filters as Cashfree. */
export function PaymentsDashboard({
  staff,
  demo,
}: {
  staff: Staff;
  demo?: Demo;
}) {
  const { payments, loading, error } = usePayments(demo?.payments);
  const {
    refunds,
    loading: refundsLoading,
    error: refundsError,
  } = useRefunds(demo?.refunds);

  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(t);
  }, []);
  useEffect(() => {
    document.title = "Payments · HeyNanny Ops";
  }, []);

  // The page opens with the saved defaults (filter icon → Dashboard defaults).
  const [defaults, setDefaults] = useState<Defaults>(readDefaults);
  const [tab, setTab] = useState<Tab>(defaults.tab);
  const [period, setPeriod] = useState<PeriodId>(defaults.period);
  const [custom, setCustom] = useState(defaultCustom);
  const [includeTest, setIncludeTest] = useState(defaults.includeTest);
  const [panelOpen, setPanelOpen] = useState(false);
  const saveDefaults = (next: Defaults) => {
    setDefaults(next);
    setTab(next.tab);
    setPeriod(next.period);
    setIncludeTest(next.includeTest);
    try {
      window.localStorage.setItem(DEFAULTS_KEY, JSON.stringify(next));
    } catch {
      // Private mode or storage blocked: the defaults just won't be remembered.
    }
    setPanelOpen(false);
  };
  const customDate = (part: "from" | "to", date: string, time: string) =>
    setCustom((c) => ({ ...c, [part]: `${date}T${time}` }));
  const [cFromDate, cFromTime = "00:00"] = custom.from.split("T") as [
    string,
    string?,
  ];
  const [cToDate, cToTime = "23:59"] = custom.to.split("T") as [
    string,
    string?,
  ];

  const live = useMemo(
    () =>
      includeTest
        ? payments
        : payments.filter((p) => p.environment !== "sandbox"),
    [payments, includeTest],
  );
  const savedRefunds = useMemo(
    () =>
      includeTest
        ? refunds
        : refunds.filter((r) => r.environment !== "sandbox"),
    [refunds, includeTest],
  );
  // Stable range (recomputed only when the day, period or custom dates change).
  const dayKey = localISODate(now);
  const range = useMemo(
    () => periodRange(period, new Date(`${dayKey}T12:00:00`), custom),
    [period, dayKey, custom],
  );

  const headline = useMemo(
    () =>
      (["today", "last7", "month"] as const).map((id) => {
        const r = periodRange(id, now);
        return {
          id,
          label: PERIODS.find((p) => p.id === id)!.label,
          cur: summarize(live, r.start, r.end),
          prev: summarize(live, r.prevStart, r.prevEnd),
          compareLabel: r.compareLabel,
        };
      }),
    [live, now],
  );

  const earliest = useMemo(() => {
    const ds = payments.map(paidAt).filter((d): d is Date => !!d);
    return ds.length ? new Date(Math.min(...ds.map((d) => d.getTime()))) : null;
  }, [payments]);

  return (
    <div className="min-h-dvh">
      <AppHeader staff={staff} active="payments" />

      <main className="mx-auto max-w-[1400px] px-4 pb-16 pt-6 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-[1.9rem] leading-tight text-plum">
              Payments
            </h1>
            <p className="mt-0.5 text-sm text-muted">
              Cashfree transactions, refunds and settlements.
              {earliest
                ? ` Transactions recorded since ${earliest.getDate()} ${MONTHS[earliest.getMonth()]} ${earliest.getFullYear()}.`
                : ""}
            </p>
          </div>
        </div>

        {error && <Alert>{error}</Alert>}

        {/* Today / last 7 days / this month */}
        <section
          aria-label="Revenue"
          className="mt-5 grid gap-3 md:grid-cols-3"
        >
          {headline.map((h, i) => (
            <button
              key={h.id}
              type="button"
              onClick={() => {
                setPeriod(h.id);
                setTab("transactions");
              }}
              aria-pressed={period === h.id}
              className={`rounded-[20px] p-4 text-left transition-[transform,box-shadow] duration-200 hover:-translate-y-[2px] hover:shadow-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-plum ${
                i === 0
                  ? "bg-plum text-milk"
                  : "border border-line bg-paper text-plum"
              } ${period === h.id ? (i === 0 ? "ring-2 ring-rose ring-offset-2 ring-offset-milk" : "ring-2 ring-plum") : ""}`}
            >
              <p
                className={`text-xs font-semibold uppercase tracking-wider ${i === 0 ? "text-blush" : "text-muted"}`}
              >
                {h.label}
              </p>
              <p
                className="mt-1 font-display text-[2.2rem] leading-none tabular-nums"
                title={formatINRExact(h.cur.revenue)}
              >
                {loading ? "…" : formatINRShort(h.cur.revenue)}
              </p>
              <p
                className={`mt-2 flex flex-wrap items-center gap-x-2 text-xs ${i === 0 ? "text-blush/90" : "text-muted"}`}
              >
                <span>
                  {h.cur.paid} transaction{h.cur.paid === 1 ? "" : "s"}
                </span>
                <Change
                  value={change(h.cur.revenue, h.prev.revenue)}
                  label={`vs ${h.compareLabel}`}
                  onDark={i === 0}
                />
              </p>
            </button>
          ))}
        </section>

        {/* Tabs + period (same choices as Cashfree) */}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <div
            role="tablist"
            aria-label="Section"
            className="flex gap-1 rounded-full bg-paper p-1 ring-1 ring-line"
          >
            {(
              [
                ["transactions", "Transactions"],
                ["refunds", "Refunds"],
                ["settlements", "Settlements"],
              ] as [Tab, string][]
            ).map(([id, label]) => (
              <button
                key={id}
                role="tab"
                type="button"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                className={`h-9 rounded-full px-4 text-sm font-semibold transition-colors ${tab === id ? "bg-plum text-milk" : "text-plum hover:bg-plum/5"}`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <PeriodPicker
              value={period}
              onChange={setPeriod}
              range={range}
              today={dayKey}
              note={includeTest ? "incl. test" : null}
            />
            {period === "custom" && (
              <div className="flex flex-wrap items-center gap-1.5 text-sm text-muted">
                <input
                  type="date"
                  aria-label="From date"
                  value={cFromDate}
                  max={cToDate}
                  onChange={(e) =>
                    customDate("from", e.target.value, cFromTime)
                  }
                  className="h-12 rounded-xl border border-line bg-white px-2.5 text-plum focus:border-plum focus:outline-none"
                />
                <input
                  type="time"
                  aria-label="From time"
                  value={cFromTime}
                  onChange={(e) =>
                    customDate("from", cFromDate, e.target.value || "00:00")
                  }
                  className="h-12 rounded-xl border border-line bg-white px-2.5 text-plum focus:border-plum focus:outline-none"
                />
                <span>to</span>
                <input
                  type="date"
                  aria-label="To date"
                  value={cToDate}
                  min={cFromDate}
                  max={localISODate(now)}
                  onChange={(e) => customDate("to", e.target.value, cToTime)}
                  className="h-12 rounded-xl border border-line bg-white px-2.5 text-plum focus:border-plum focus:outline-none"
                />
                <input
                  type="time"
                  aria-label="To time"
                  value={cToTime}
                  onChange={(e) =>
                    customDate("to", cToDate, e.target.value || "23:59")
                  }
                  className="h-12 rounded-xl border border-line bg-white px-2.5 text-plum focus:border-plum focus:outline-none"
                />
              </div>
            )}
            <button
              type="button"
              onClick={() => setPanelOpen(true)}
              aria-label="Dashboard defaults"
              title="Dashboard defaults"
              aria-haspopup="dialog"
              className="grid size-12 place-items-center rounded-xl border border-line bg-white text-plum shadow-soft hover:bg-milk focus-visible:outline-2 focus-visible:outline-plum"
            >
              <Filter
                className="size-5"
                fill="currentColor"
                aria-hidden="true"
              />
            </button>
          </div>
        </div>

        {tab === "transactions" && (
          <TransactionsTab payments={live} range={range} loading={loading} />
        )}
        {tab === "refunds" && (
          <RefundsTab
            refunds={savedRefunds}
            range={range}
            loading={refundsLoading}
            error={refundsError}
            demo={!!demo}
          />
        )}
        {tab === "settlements" && (
          <SettlementsTab range={range} demo={demo?.settlements} />
        )}
      </main>

      {panelOpen && (
        <DefaultsPanel
          initial={defaults}
          current={{
            tab,
            period: period === "custom" ? defaults.period : period,
            includeTest,
          }}
          today={localISODate(now)}
          onSave={saveDefaults}
          onClose={() => setPanelOpen(false)}
        />
      )}
    </div>
  );
}

type RangeT = ReturnType<typeof periodRange>;

type Defaults = {
  period: Exclude<PeriodId, "custom">;
  tab: Tab;
  includeTest: boolean;
};

const STANDARD_DEFAULTS: Defaults = {
  period: "last7",
  tab: "transactions",
  includeTest: false,
};

/** Saved per browser. */
const DEFAULTS_KEY = "heynanny-ops:payments-defaults";
const OLD_PERIOD_KEY = "heynanny-ops:payments-default-period";

function readDefaults(): Defaults {
  if (typeof window === "undefined") return STANDARD_DEFAULTS;
  try {
    const raw = JSON.parse(
      window.localStorage.getItem(DEFAULTS_KEY) ?? "null",
    ) as Partial<Defaults> | null;
    const oldPeriod = window.localStorage.getItem(OLD_PERIOD_KEY);
    const period = raw?.period ?? oldPeriod;
    return {
      period: PERIODS.some((p) => p.id === period && p.id !== "custom")
        ? (period as Defaults["period"])
        : STANDARD_DEFAULTS.period,
      tab:
        raw?.tab === "refunds" || raw?.tab === "settlements"
          ? raw.tab
          : "transactions",
      includeTest: raw?.includeTest === true,
    };
  } catch {
    return STANDARD_DEFAULTS;
  }
}

/** Last 7 days, whole days: "2026-11-11T00:00" → "2026-11-17T23:59". */
function defaultCustom() {
  return {
    from: `${localISODate(new Date(Date.now() - 6 * 86400000))}T00:00`,
    to: `${localISODate(new Date())}T23:59`,
  };
}

/**
 * Period dropdown with the dates in small text under the label (a native <select>
 * can't show two lines). Each option shows its own dates too.
 */
function PeriodPicker({
  value,
  onChange,
  range,
  today,
  note,
}: {
  value: PeriodId;
  onChange: (p: PeriodId) => void;
  range: RangeT;
  today: string;
  note: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const noon = new Date(`${today}T12:00:00`);
  const label = PERIODS.find((p) => p.id === value)?.label ?? "";

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) =>
      !root.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const choose = (id: PeriodId) => {
    onChange(id);
    setOpen(false);
    button.current?.focus();
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        setActive(
          Math.max(
            0,
            PERIODS.findIndex((p) => p.id === value),
          ),
        );
        setOpen(true);
      }
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % PERIODS.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i - 1 + PERIODS.length) % PERIODS.length);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      choose(PERIODS[active]!.id);
    }
  };

  return (
    <div ref={root} className="relative" onKeyDown={onKey}>
      <button
        ref={button}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Period: ${label}, ${rangeLabel(range)}`}
        onClick={() => {
          setActive(
            Math.max(
              0,
              PERIODS.findIndex((p) => p.id === value),
            ),
          );
          setOpen((o) => !o);
        }}
        className="flex h-12 min-w-[210px] items-center justify-between gap-3 rounded-xl border border-line bg-white pl-4 pr-3 text-left shadow-soft hover:bg-milk/40 focus:border-plum focus:outline-none"
      >
        <span className="min-w-0">
          <span className="block text-sm font-semibold leading-tight text-plum">
            {label}
          </span>
          <span className="block truncate text-[0.72rem] leading-tight text-muted">
            {rangeLabel(range)}
            {note ? ` · ${note}` : ""}
          </span>
        </span>
        <ChevronDown
          className={`size-4 shrink-0 text-plum transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>
      {open && (
        <ul
          role="listbox"
          aria-label="Period"
          className="absolute right-0 z-20 mt-1.5 w-[260px] overflow-hidden rounded-xl border border-line bg-white py-1 shadow-lift"
        >
          {PERIODS.map((p, i) => {
            const selected = p.id === value;
            return (
              <li
                key={p.id}
                role="option"
                aria-selected={selected}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(p.id)}
                className={`cursor-pointer px-4 py-2 ${i === active ? "bg-milk" : ""}`}
              >
                <span
                  className={`block text-sm leading-tight ${selected ? "font-semibold text-plum" : "text-plum"}`}
                >
                  {p.label}
                </span>
                <span className="block text-[0.72rem] leading-tight text-muted">
                  {p.id === "custom"
                    ? selected
                      ? rangeLabel(range)
                      : "Pick dates and times"
                    : rangeLabel(periodRange(p.id, noon))}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

const TAB_LABELS: Record<Tab, string> = {
  transactions: "Transactions",
  refunds: "Refunds",
  settlements: "Settlements",
};

/** Kylas-style side panel: choose what the Payments page opens with. */
function DefaultsPanel({
  initial,
  current,
  today,
  onSave,
  onClose,
}: {
  initial: Defaults;
  current: Defaults;
  today: string;
  onSave: (d: Defaults) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<Defaults>(initial);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const inputCls =
    "h-11 w-full appearance-none rounded-xl border border-line bg-white px-3 pr-10 text-sm font-medium text-plum focus:border-plum focus:outline-none";
  const sameAsCurrent =
    draft.period === current.period &&
    draft.tab === current.tab &&
    draft.includeTest === current.includeTest;

  return (
    <div
      className="fixed inset-0 z-30"
      role="dialog"
      aria-modal="true"
      aria-labelledby="defaults-title"
    >
      <div
        className="fade-in absolute inset-0 bg-plum/30 backdrop-blur-[1px]"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside className="panel-in absolute inset-y-0 right-0 flex w-full max-w-[400px] flex-col bg-milk shadow-lift">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div>
            <h2 id="defaults-title" className="font-display text-2xl text-plum">
              Dashboard defaults
            </h2>
            <p className="text-xs text-muted">
              What Payments shows when you open it. Saved in this browser.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid size-10 place-items-center rounded-full text-plum hover:bg-plum/5"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
          <section className="rounded-[18px] border border-line bg-paper p-4">
            <label htmlFor="d-period" className="text-sm font-bold text-plum">
              Date range
            </label>
            <div className="relative mt-2">
              <select
                id="d-period"
                value={draft.period}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    period: e.target.value as Defaults["period"],
                  }))
                }
                className={inputCls}
              >
                {PERIODS.filter((p) => p.id !== "custom").map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
              <ChevronDown
                className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted"
                aria-hidden="true"
              />
            </div>
            <p className="mt-2 text-xs text-muted">
              Today that&apos;s{" "}
              {rangeLabel(
                periodRange(draft.period, new Date(`${today}T12:00:00`)),
              )}
              .
            </p>
          </section>

          <section className="rounded-[18px] border border-line bg-paper p-4">
            <p className="text-sm font-bold text-plum">Open on</p>
            <div
              role="radiogroup"
              aria-label="Open on"
              className="mt-2 grid grid-cols-3 gap-1.5"
            >
              {(Object.keys(TAB_LABELS) as Tab[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  role="radio"
                  aria-checked={draft.tab === t}
                  onClick={() => setDraft((d) => ({ ...d, tab: t }))}
                  className={`h-10 rounded-full text-xs font-semibold transition-colors ${draft.tab === t ? "bg-plum text-milk" : "bg-white text-plum ring-1 ring-line hover:bg-milk"}`}
                >
                  {TAB_LABELS[t]}
                </button>
              ))}
            </div>
          </section>

          <section className="rounded-[18px] border border-line bg-paper p-4">
            <p className="text-sm font-bold text-plum">Test payments</p>
            <label className="mt-2 flex items-center gap-2.5 text-sm text-plum">
              <input
                type="checkbox"
                checked={draft.includeTest}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, includeTest: e.target.checked }))
                }
                className="size-4 accent-plum"
              />
              Include Cashfree sandbox (test) payments
            </label>
          </section>

          {!sameAsCurrent && (
            <button
              type="button"
              onClick={() => setDraft(current)}
              className="px-1 text-xs font-semibold text-rose-deep underline-offset-4 hover:underline"
            >
              Use what I&apos;m looking at now (
              {PERIODS.find((p) => p.id === current.period)?.label},{" "}
              {TAB_LABELS[current.tab]}
              {current.includeTest ? ", incl. test" : ""})
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-line px-5 py-4">
          <button
            type="button"
            onClick={() => onSave(draft)}
            className="h-11 flex-1 rounded-full bg-plum px-5 text-sm font-semibold text-milk transition-colors hover:bg-plum-soft"
          >
            Save defaults
          </button>
          <button
            type="button"
            onClick={() => setDraft(STANDARD_DEFAULTS)}
            className="inline-flex h-11 items-center gap-1.5 rounded-full px-4 text-sm font-semibold text-plum hover:bg-plum/5"
            title="Last 7 days, Transactions, no test payments"
          >
            <RotateCcw className="size-4" aria-hidden="true" />
            Reset
          </button>
        </div>
      </aside>
    </div>
  );
}

/* ---------------- Transactions ---------------- */

function TransactionsTab({
  payments,
  range,
  loading,
}: {
  payments: Payment[];
  range: RangeT;
  loading: boolean;
}) {
  const [status, setStatus] = useState<"all" | PaymentStatus>("all");
  const [search, setSearch] = useState("");

  const current = useMemo(
    () => summarize(payments, range.start, range.end),
    [payments, range],
  );
  const previous = useMemo(
    () => summarize(payments, range.prevStart, range.prevEnd),
    [payments, range],
  );
  const buckets = useMemo(
    () => revenueBuckets(payments, range.start, range.end),
    [payments, range],
  );
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const digits = q.replace(/\D/g, "");
    return payments.filter((p) => {
      if (!inRange(paidAt(p), range.start, range.end)) return false;
      if (status !== "all" && p.payment_status !== status) return false;
      if (!q) return true;
      const c = p.customer_details ?? {};
      return (
        (c.customer_name ?? "").toLowerCase().includes(q) ||
        (c.customer_email ?? "").toLowerCase().includes(q) ||
        (digits.length >= 3 &&
          (c.customer_phone ?? "").replace(/\D/g, "").includes(digits)) ||
        p.order_id.toLowerCase().includes(q) ||
        String(p.cf_payment_id).includes(q) ||
        (p.booking_id ?? "").toLowerCase().includes(q)
      );
    });
  }, [payments, range, status, search]);
  const attempts = current.paid + current.failed + current.abandoned;

  return (
    <>
      <Panel>
        <Totals
          items={[
            ["Total transactions", String(current.paid)],
            ["Transactions amount", formatINRExact(current.revenue)],
          ]}
          note="Successful payments only, as on Cashfree."
        />
        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Metric
            label="Amount"
            value={formatINRShort(current.revenue)}
            delta={change(current.revenue, previous.revenue)}
            compare={range.compareLabel}
          />
          <Metric
            label="Transactions"
            value={String(current.paid)}
            delta={change(current.paid, previous.paid)}
            compare={range.compareLabel}
          />
          <Metric
            label="Average"
            value={formatINRShort(Math.round(current.avg))}
            delta={change(current.avg, previous.avg)}
            compare={range.compareLabel}
          />
          <Metric
            label="Failed / abandoned"
            value={`${current.failed} / ${current.abandoned}`}
            hint={
              attempts
                ? `${Math.round((current.paid / attempts) * 100)}% of attempts succeeded`
                : "No attempts"
            }
          />
        </div>
        <div className="mt-5">
          {loading ? <ChartSkeleton /> : <ComboChart data={buckets} />}
        </div>
      </Panel>

      <ListToolbar
        search={search}
        onSearch={setSearch}
        placeholder="Search name, phone, order ID, payment ID"
        status={status}
        onStatus={(v) => setStatus(v as typeof status)}
        statuses={(Object.keys(PAYMENT_STATUS_META) as PaymentStatus[]).map(
          (s) => [s, PAYMENT_STATUS_META[s].label],
        )}
        count={rows.length}
        onExport={() =>
          downloadRows(
            rows,
            [
              ["Paid at", (p) => formatDateTime(paidAt(p))],
              [
                "Status",
                (p) =>
                  PAYMENT_STATUS_META[p.payment_status]?.label ??
                  p.payment_status,
              ],
              ["Amount (INR)", (p) => Number(p.payment_amount) || 0],
              ["Customer", (p) => p.customer_details?.customer_name ?? ""],
              ["Phone", (p) => p.customer_details?.customer_phone ?? ""],
              ["Email", (p) => p.customer_details?.customer_email ?? ""],
              ["Method", (p) => methodLabel(p.payment_method)],
              ["Order ID", (p) => p.order_id],
              ["Booking ID", (p) => p.booking_id ?? ""],
              ["Cashfree payment ID", (p) => String(p.cf_payment_id)],
              ["Failure reason", (p) => p.failure_reason ?? ""],
              ["Environment", (p) => p.environment],
            ],
            `heynanny-transactions-${fileRange(range)}.csv`,
          )
        }
      />
      {loading ? (
        <Empty>Loading transactions…</Empty>
      ) : !rows.length ? (
        <Empty>
          No transactions in this period
          {status !== "all" || search ? " match these filters" : ""}.
        </Empty>
      ) : (
        <Table
          head={["Paid at", "Customer", "Amount", "Method", "Status", "Order"]}
          align={["", "", "right", "", "", ""]}
          hideBelowLg={[3, 5]}
          rows={rows.map((p) => ({
            key: p.id,
            cells: [
              <span key="t" className="whitespace-nowrap tabular-nums">
                {formatDateTime(paidAt(p))}
              </span>,
              <div key="c">
                <p className="font-semibold">
                  {p.customer_details?.customer_name || "—"}
                </p>
                <p className="text-xs tabular-nums text-muted">
                  {p.customer_details?.customer_phone
                    ? displayPhone(p.customer_details.customer_phone)
                    : p.customer_details?.customer_email || ""}
                </p>
              </div>,
              <span
                key="a"
                className="whitespace-nowrap font-semibold tabular-nums"
              >
                {formatINRExact(Number(p.payment_amount) || 0)}
                {p.environment === "sandbox" && <TestTag />}
              </span>,
              methodLabel(p.payment_method),
              <div key="s">
                <Badge meta={PAYMENT_STATUS_META[p.payment_status]} />
                {typeof p.servicing_case_id === "string" && (
                  <p className="mt-1 text-xs font-semibold text-[#5b3cc4]">
                    In servicing
                  </p>
                )}
                {p.failure_reason && (
                  <p className="mt-1 max-w-[220px] text-xs text-muted">
                    {p.failure_reason}
                  </p>
                )}
              </div>,
              <div key="o">
                <p className="font-mono text-xs">{p.order_id}</p>
                <p className="font-mono text-[0.7rem] text-muted">
                  #{p.cf_payment_id}
                </p>
              </div>,
            ],
          }))}
        />
      )}
    </>
  );
}

/* ---------------- Refunds (Firestore: webhook + import) ---------------- */

function RefundsTab({
  refunds,
  range,
  loading,
  error,
  demo,
}: {
  refunds: Refund[];
  range: RangeT;
  loading: boolean;
  error: string | null;
  demo: boolean;
}) {
  const [status, setStatus] = useState<"all" | RefundStatus>("all");
  const [search, setSearch] = useState("");
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);

  const inPeriod = useMemo(
    () => refunds.filter((r) => inRange(refundedAt(r), range.start, range.end)),
    [refunds, range],
  );
  const counted = inPeriod.filter(countsAsRefund);
  const total = counted.reduce((t, r) => t + (Number(r.refund_amount) || 0), 0);
  const prevCounted = refunds.filter(
    (r) =>
      countsAsRefund(r) &&
      inRange(refundedAt(r), range.prevStart, range.prevEnd),
  );
  const prevTotal = prevCounted.reduce(
    (t, r) => t + (Number(r.refund_amount) || 0),
    0,
  );
  const pending = inPeriod.filter(
    (r) => r.refund_status === "PENDING" || r.refund_status === "ONHOLD",
  );
  const buckets = useMemo(
    () =>
      bucketize(
        refunds
          .filter(countsAsRefund)
          .map((r) => ({
            at: refundedAt(r),
            amount: Number(r.refund_amount) || 0,
          })),
        range.start,
        range.end,
      ),
    [refunds, range],
  );
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...inPeriod]
      .sort(
        (x, y) =>
          (refundedAt(y)?.getTime() ?? 0) - (refundedAt(x)?.getTime() ?? 0),
      )
      .filter(
        (r) =>
          (status === "all" || r.refund_status === status) &&
          (!q ||
            [
              r.order_id,
              r.cf_refund_id,
              r.cf_payment_id,
              r.refund_arn,
              r.refund_note,
              r.refund_id,
            ].some((v) => (v ?? "").toLowerCase().includes(q))),
      );
  }, [inPeriod, status, search]);

  const runImport = async () => {
    setImporting(true);
    setImportMsg(null);
    try {
      if (demo) {
        setImportMsg("Demo mode: nothing imported.");
        return;
      }
      const r = await importRefunds(120);
      const sr = r.settlementRecon;
      const parts = [
        `Found ${r.refunds} refund${r.refunds === 1 ? "" : "s"}: ${r.created} new, ${r.updated} updated.`,
        sr
          ? sr.error
            ? `Settlement records: error (${sr.error}).`
            : `Settlement records: ${sr.scanned} events checked (${
                Object.entries(sr.types)
                  .map(([k, v]) => `${k} ${v}`)
                  .join(", ") || "none"
              }), ${sr.refunds} refunds.`
          : "",
        `Recent orders: ${r.orders} checked${r.failedOrders ? `, ${r.failedOrders} couldn't be checked` : ""}.`,
        (r.errors ?? []).length
          ? `Cashfree said: ${(r.errors ?? []).map((e) => `${e.count}× ${e.message} (e.g. ${e.orderId})`).join(" · ")}`
          : "",
      ];
      setImportMsg(parts.filter(Boolean).join(" "));
    } catch (e) {
      setImportMsg((e as Error).message);
    } finally {
      setImporting(false);
    }
  };

  return (
    <>
      {error && <Alert>{error}</Alert>}
      <Panel>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <Totals
            items={[
              ["Total refunds", String(counted.length)],
              ["Refunds amount", formatINRExact(total)],
            ]}
            note="By refund date. New refunds arrive automatically from Cashfree; cancelled ones aren't counted."
          />
          <button
            type="button"
            onClick={runImport}
            disabled={importing}
            className="inline-flex h-9 items-center gap-2 rounded-full bg-white px-3.5 text-sm font-semibold text-plum ring-1 ring-line hover:bg-milk disabled:opacity-50"
            title="Fetch earlier refunds from Cashfree (last 120 days)"
          >
            <RefreshCw
              className={`size-4 ${importing ? "animate-spin" : ""}`}
              aria-hidden="true"
            />
            {importing ? "Importing… (up to a minute)" : "Import from Cashfree"}
          </button>
        </div>
        {importMsg && (
          <p className="mt-2 rounded-xl bg-white px-3 py-2 font-mono text-[0.72rem] leading-relaxed text-muted ring-1 ring-line">
            {importMsg}
          </p>
        )}
        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Metric
            label="Amount"
            value={formatINRShort(total)}
            delta={change(total, prevTotal)}
            compare={range.compareLabel}
            invert
          />
          <Metric
            label="Refunds"
            value={String(counted.length)}
            delta={change(counted.length, prevCounted.length)}
            compare={range.compareLabel}
            invert
          />
          <Metric
            label="Pending"
            value={String(pending.length)}
            hint={
              pending.length
                ? formatINRExact(
                    pending.reduce((t, r) => t + r.refund_amount, 0),
                  )
                : "None waiting"
            }
          />
          <Metric
            label="Cancelled"
            value={String(inPeriod.length - counted.length)}
            hint="Not counted in totals"
          />
        </div>
        <div className="mt-5">
          {loading ? (
            <ChartSkeleton />
          ) : (
            <ComboChart
              data={buckets}
              barColor="#f1c2c4"
              barHover="#d98e92"
              lineColor="#93525a"
            />
          )}
        </div>
      </Panel>

      <ListToolbar
        search={search}
        onSearch={setSearch}
        placeholder="Search order ID, refund ID, payment ID, ARN, note"
        status={status}
        onStatus={(v) => setStatus(v as typeof status)}
        statuses={(Object.keys(REFUND_STATUS_META) as RefundStatus[]).map(
          (st) => [st, REFUND_STATUS_META[st].label],
        )}
        count={rows.length}
        onExport={() =>
          downloadRows(
            rows,
            [
              ["Refunded at", (r) => formatDateTime(refundedAt(r))],
              [
                "Processed",
                (r) =>
                  r.refund_processed_at
                    ? formatDateTime(new Date(r.refund_processed_at))
                    : "",
              ],
              [
                "Status",
                (r) =>
                  REFUND_STATUS_META[r.refund_status]?.label ?? r.refund_status,
              ],
              ["Amount (INR)", (r) => Number(r.refund_amount) || 0],
              ["Order ID", (r) => r.order_id ?? ""],
              ["Refund ID", (r) => r.refund_id ?? ""],
              ["Cashfree refund ID", (r) => r.cf_refund_id],
              ["Cashfree payment ID", (r) => r.cf_payment_id ?? ""],
              ["ARN", (r) => r.refund_arn ?? ""],
              ["Note", (r) => r.refund_note ?? ""],
              ["Source", (r) => r.source],
            ],
            `heynanny-refunds-${fileRange(range)}.csv`,
          )
        }
      />
      {loading ? (
        <Empty>Loading refunds…</Empty>
      ) : !rows.length ? (
        <Empty>
          No refunds in this period
          {status !== "all" || search ? " match these filters" : ""}.
          {!refunds.length &&
            " New refunds appear here automatically. Press “Import from Cashfree” to bring in earlier ones."}
        </Empty>
      ) : (
        <Table
          head={[
            "Refunded at",
            "Amount",
            "Status",
            "Order",
            "Reference",
            "Note",
          ]}
          align={["", "right", "", "", "", ""]}
          hideBelowLg={[4, 5]}
          rows={rows.map((r) => ({
            key: r.id,
            cells: [
              <div key="t" className="whitespace-nowrap tabular-nums">
                <p>{formatDateTime(refundedAt(r))}</p>
                {r.refund_processed_at && (
                  <p className="text-xs text-muted">
                    Processed {formatDateTime(new Date(r.refund_processed_at))}
                  </p>
                )}
              </div>,
              <span
                key="a"
                className="whitespace-nowrap font-semibold tabular-nums"
              >
                {formatINRExact(Number(r.refund_amount) || 0)}
                {r.environment === "sandbox" && <TestTag />}
              </span>,
              <Badge key="s" meta={REFUND_STATUS_META[r.refund_status]} />,
              <p key="o" className="font-mono text-xs">
                {r.order_id ?? "—"}
              </p>,
              <div key="r" className="font-mono text-[0.7rem] text-muted">
                {r.refund_id && <p>{r.refund_id}</p>}
                {r.refund_arn && <p>ARN {r.refund_arn}</p>}
                {r.cf_payment_id && <p>Payment #{r.cf_payment_id}</p>}
              </div>,
              <p key="n" className="max-w-[220px] text-xs text-muted">
                {r.refund_note ?? "—"}
              </p>,
            ],
          }))}
        />
      )}
    </>
  );
}

/* ---------------- Settlements ---------------- */

function SettlementsTab({
  range,
  demo,
}: {
  range: RangeT;
  demo?: Settlement[];
}) {
  const { settlements, loading, error, updatedAt, refresh } = useSettlements(
    range.start,
    range.end,
    true,
    demo,
  );
  // Latest two, like Cashfree's "Recent Settlements" (last 30 days).
  const recentRange = useMemo(() => periodRange("last30", new Date()), []);
  const recent = useSettlements(recentRange.start, recentRange.end, true, demo);
  const [search, setSearch] = useState("");

  const sorted = useMemo(
    () =>
      [...settlements].sort(
        (a, b) =>
          (settledAt(b)?.getTime() ?? 0) - (settledAt(a)?.getTime() ?? 0),
      ),
    [settlements],
  );
  const latest = useMemo(
    () =>
      [...recent.settlements]
        .filter((s) => s.status === "SUCCESS")
        .sort(
          (a, b) =>
            (settledAt(b)?.getTime() ?? 0) - (settledAt(a)?.getTime() ?? 0),
        )
        .slice(0, 2),
    [recent.settlements],
  );
  const done = sorted.filter((s) => s.status === "SUCCESS");
  const pendingList = sorted.filter((s) => s.status.startsWith("PENDING"));
  const sum = (list: Settlement[], f: (s: Settlement) => number) =>
    list.reduce((t, s) => t + f(s), 0);
  const buckets = useMemo(
    () =>
      bucketize(
        done.map((s) => ({ at: settledAt(s), amount: s.amountSettled })),
        range.start,
        range.end,
      ),
    [done, range],
  );
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q
      ? sorted.filter((s) =>
          [s.id, s.utr].some((v) => (v ?? "").toLowerCase().includes(q)),
        )
      : sorted;
  }, [sorted, search]);

  return (
    <>
      {/* Recent settlements */}
      <section
        aria-label="Recent settlements"
        className="mt-4 grid gap-3 md:grid-cols-2"
      >
        {recent.loading ? (
          <div className="rounded-[20px] border border-line bg-paper p-4 text-sm text-muted md:col-span-2">
            Loading recent settlements…
          </div>
        ) : latest.length ? (
          latest.map((s, i) => (
            <div
              key={s.id}
              className={`rounded-[20px] p-4 ${i === 0 ? "bg-plum text-milk" : "border border-line bg-paper text-plum"}`}
            >
              <p
                className={`text-xs font-semibold uppercase tracking-wider ${i === 0 ? "text-blush" : "text-muted"}`}
              >
                {i === 0 ? "Latest settlement" : "Previous settlement"}
              </p>
              <p
                className="mt-1 font-display text-[2.2rem] leading-none tabular-nums"
                title={formatINRExact(s.amountSettled)}
              >
                {formatINRShort(s.amountSettled)}
              </p>
              <p
                className={`mt-2 text-xs ${i === 0 ? "text-blush/90" : "text-muted"}`}
              >
                Settled on{" "}
                {settledAt(s)
                  ? `${settledAt(s)!.getDate()} ${MONTHS[settledAt(s)!.getMonth()]} ${settledAt(s)!.getFullYear()}`
                  : "—"}
                {s.utr ? ` · UTR ${s.utr}` : ""}
              </p>
            </div>
          ))
        ) : (
          <div className="rounded-[20px] border border-line bg-paper p-4 text-sm text-muted md:col-span-2">
            {recent.error ?? "No settlements in the last 30 days."}
          </div>
        )}
      </section>

      {error && <Alert>{error}</Alert>}
      <Panel>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <Totals
            items={[
              ["Settlements", String(done.length)],
              [
                "Amount settled",
                formatINRExact(sum(done, (s) => s.amountSettled)),
              ],
            ]}
            note="Live from Cashfree: amount credited to your bank, by settlement date."
          />
          <button
            type="button"
            onClick={refresh}
            className="inline-flex h-9 items-center gap-2 rounded-full bg-white px-3.5 text-sm font-semibold text-plum ring-1 ring-line hover:bg-milk"
          >
            <RefreshCw className="size-4" aria-hidden="true" />
            {updatedAt
              ? `Updated ${updatedAt.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}`
              : "Refresh"}
          </button>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Metric
            label="Transactions settled"
            value={formatINRShort(sum(done, (s) => s.paymentAmount))}
            hint="Gross, before charges"
          />
          <Metric
            label="Charges + tax"
            value={formatINRShort(sum(done, (s) => s.charges))}
            hint="PG and settlement charges"
          />
          <Metric
            label="Adjustments"
            value={formatINRShort(sum(done, (s) => s.adjustment))}
            hint="Refunds, disputes, etc."
          />
          <Metric
            label="Pending"
            value={String(pendingList.length)}
            hint={
              pendingList.length
                ? formatINRExact(sum(pendingList, (s) => s.amountSettled))
                : "Nothing pending"
            }
          />
        </div>
        <div className="mt-5">
          {loading ? (
            <ChartSkeleton />
          ) : (
            <ComboChart
              data={buckets}
              amountLabel="Settled"
              barColor="#bfe0c8"
              barHover="#7fbf92"
              lineColor="#3f8a55"
            />
          )}
        </div>
      </Panel>

      <ListToolbar
        search={search}
        onSearch={setSearch}
        placeholder="Search settlement ID or UTR"
        count={rows.length}
        onExport={() =>
          downloadRows(
            rows,
            [
              ["Settled on", (s) => formatDateTime(settledAt(s))],
              [
                "Status",
                (s) => SETTLEMENT_STATUS_META[s.status]?.label ?? s.status,
              ],
              ["Settlement ID", (s) => s.id],
              ["UTR", (s) => s.utr ?? ""],
              [
                "Payments from",
                (s) =>
                  s.paymentFrom ? formatDateTime(new Date(s.paymentFrom)) : "",
              ],
              [
                "Payments till",
                (s) =>
                  s.paymentTill ? formatDateTime(new Date(s.paymentTill)) : "",
              ],
              ["Transactions (INR)", (s) => s.paymentAmount],
              ["Charges + tax (INR)", (s) => s.charges],
              ["Adjustment (INR)", (s) => s.adjustment],
              ["Amount settled (INR)", (s) => s.amountSettled],
            ],
            `heynanny-settlements-${fileRange(range)}.csv`,
          )
        }
      />
      {loading ? (
        <Empty>Loading settlements from Cashfree…</Empty>
      ) : !rows.length ? (
        <Empty>
          {error
            ? "Settlements couldn't be loaded."
            : "No settlements in this period."}
        </Empty>
      ) : (
        <Table
          head={[
            "Settled on",
            "Amount settled",
            "Status",
            "Payments covered",
            "Breakdown",
            "UTR",
          ]}
          align={["", "right", "", "", "", ""]}
          hideBelowLg={[3, 4]}
          rows={rows.map((s) => ({
            key: s.id,
            cells: [
              <span key="t" className="whitespace-nowrap tabular-nums">
                {formatDateTime(settledAt(s))}
              </span>,
              <span
                key="a"
                className="whitespace-nowrap font-semibold tabular-nums"
              >
                {formatINRExact(s.amountSettled)}
              </span>,
              <Badge
                key="s"
                meta={
                  SETTLEMENT_STATUS_META[s.status] ?? {
                    label: s.status,
                    tone: "bg-beige text-muted",
                  }
                }
              />,
              <span key="p" className="whitespace-nowrap text-xs text-muted">
                {s.paymentFrom ? shortDate(s.paymentFrom) : "—"} –{" "}
                {s.paymentTill ? shortDate(s.paymentTill) : "—"}
              </span>,
              <div key="b" className="text-xs tabular-nums text-muted">
                <p>Transactions {formatINRExact(s.paymentAmount)}</p>
                <p>Charges −{formatINRExact(s.charges)}</p>
                {s.adjustment !== 0 && (
                  <p>Adjustment {formatINRExact(s.adjustment)}</p>
                )}
              </div>,
              <div key="u" className="font-mono text-[0.7rem] text-muted">
                <p>{s.utr ?? "—"}</p>
                <p>#{s.id}</p>
              </div>,
            ],
          }))}
        />
      )}
    </>
  );
}

/* ---------------- shared bits ---------------- */

const shortDate = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : `${d.getDate()} ${MONTHS[d.getMonth()]}`;
};

const fileRange = (r: RangeT) =>
  `${localISODate(r.start)}-to-${localISODate(new Date(r.end.getTime() - 1))}`;

function Panel({ children }: { children: ReactNode }) {
  return (
    <section className="mt-4 rounded-[20px] border border-line bg-paper p-4 shadow-soft sm:p-5">
      {children}
    </section>
  );
}

function Totals({ items, note }: { items: [string, string][]; note?: string }) {
  return (
    <div>
      <div className="flex flex-wrap gap-x-8 gap-y-1">
        {items.map(([k, v]) => (
          <p key={k} className="text-sm text-muted">
            {k}{" "}
            <span className="ml-1 font-display text-xl tabular-nums text-plum">
              {v}
            </span>
          </p>
        ))}
      </div>
      {note && <p className="mt-0.5 text-xs text-muted">{note}</p>}
    </div>
  );
}

function Alert({ children }: { children: ReactNode }) {
  return (
    <p
      role="alert"
      className="mt-4 rounded-[20px] bg-red-50 px-4 py-3 text-sm text-red-700"
    >
      {children}
    </p>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="mt-3 rounded-[20px] border border-dashed border-line bg-paper/60 px-4 py-16 text-center text-sm text-muted">
      {children}
    </div>
  );
}

function ChartSkeleton() {
  return <div className="h-[300px] animate-pulse rounded-xl bg-line/40" />;
}

function TestTag() {
  return (
    <span className="ml-1.5 rounded bg-beige px-1.5 py-0.5 text-[0.65rem] text-muted">
      TEST
    </span>
  );
}

function Badge({ meta }: { meta?: { label: string; tone: string } }) {
  if (!meta) return null;
  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${meta.tone}`}
    >
      {meta.label}
    </span>
  );
}

function Change({
  value,
  label,
  onDark,
  invert,
}: {
  value: number | null;
  label: string;
  onDark?: boolean;
  invert?: boolean;
}) {
  const vs = label.replace(/^vs /, "");
  if (value === null) return <span>New vs {vs}</span>;
  if (Math.round(value) === 0) return <span>Same as {vs}</span>;
  const up = value > 0;
  const good = invert ? !up : up;
  const tone = onDark
    ? good
      ? "text-[#9fe0b0]"
      : "text-[#ffb4b4]"
    : good
      ? "text-success"
      : "text-red-700";
  return (
    <span className={`inline-flex items-center gap-0.5 font-semibold ${tone}`}>
      {up ? (
        <ArrowUpRight className="size-3.5" aria-hidden="true" />
      ) : (
        <ArrowDownRight className="size-3.5" aria-hidden="true" />
      )}
      {Math.abs(Math.round(value))}%
      <span
        className={`font-normal ${onDark ? "text-blush/80" : "text-muted"}`}
      >
        &nbsp;{label}
      </span>
    </span>
  );
}

function Metric({
  label,
  value,
  delta,
  compare,
  hint,
  invert,
}: {
  label: string;
  value: string;
  delta?: number | null;
  compare?: string;
  hint?: string;
  invert?: boolean;
}) {
  return (
    <div className="rounded-[16px] bg-white p-3 ring-1 ring-line">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted">
        {label}
      </p>
      <p className="mt-1 font-display text-[1.6rem] leading-none tabular-nums text-plum">
        {value}
      </p>
      <p className="mt-1.5 text-xs text-muted">
        {hint ??
          (delta !== undefined && compare ? (
            <Change value={delta} label={`vs ${compare}`} invert={invert} />
          ) : null)}
      </p>
    </div>
  );
}

function ListToolbar({
  search,
  onSearch,
  placeholder,
  status,
  onStatus,
  statuses,
  count,
  onExport,
}: {
  search: string;
  onSearch: (v: string) => void;
  placeholder: string;
  status?: string;
  onStatus?: (v: string) => void;
  statuses?: [string, string][];
  count: number;
  onExport: () => void;
}) {
  return (
    <div className="mt-6 flex flex-wrap items-center gap-2">
      <label className="relative min-w-[220px] flex-1">
        <span className="sr-only">Search</span>
        <Search
          className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted"
          aria-hidden="true"
        />
        <input
          type="search"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder={placeholder}
          className="h-10 w-full rounded-full border border-line bg-white pl-10 pr-4 text-sm text-plum placeholder:text-muted/80 focus:border-plum focus:outline-none"
        />
      </label>
      {statuses && onStatus && (
        <select
          aria-label="Status"
          value={status}
          onChange={(e) => onStatus(e.target.value)}
          className="select-chevron h-10 rounded-full border border-line bg-white pl-4 text-sm font-medium text-plum focus:border-plum focus:outline-none"
        >
          <option value="all">All statuses</option>
          {statuses.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      )}
      <button
        type="button"
        disabled={!count}
        onClick={onExport}
        className="inline-flex h-10 items-center gap-2 rounded-full bg-paper px-4 text-sm font-semibold text-plum ring-1 ring-line hover:bg-white disabled:opacity-50"
      >
        <Download className="size-4" aria-hidden="true" />
        Export {count || ""} to Excel
      </button>
    </div>
  );
}

function Table({
  head,
  align,
  hideBelowLg,
  rows,
}: {
  head: string[];
  align: string[];
  hideBelowLg: number[];
  rows: { key: string; cells: ReactNode[] }[];
}) {
  const hide = (i: number) =>
    hideBelowLg.includes(i) ? "hidden lg:table-cell" : "";
  return (
    <>
      <div className="mt-3 hidden overflow-x-auto rounded-[20px] border border-line bg-paper md:block">
        <table className="w-full text-sm text-plum">
          <thead className="border-b border-line text-left text-xs uppercase tracking-wider text-muted">
            <tr>
              {head.map((h, i) => (
                <th
                  key={h}
                  scope="col"
                  className={`px-4 py-3 font-semibold ${align[i] === "right" ? "text-right" : ""} ${hide(i)}`}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={r.key} className="align-top">
                {r.cells.map((c, i) => (
                  <td
                    key={i}
                    className={`px-4 py-3 ${align[i] === "right" ? "text-right" : ""} ${hide(i)}`}
                  >
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Phones: stacked cards with the first three columns */}
      <ul className="mt-3 grid gap-2 md:hidden">
        {rows.map((r) => (
          <li
            key={r.key}
            className="grid gap-1.5 rounded-[18px] border border-line bg-paper p-4 text-sm text-plum"
          >
            {r.cells.slice(0, 3).map((c, i) => (
              <div key={i} className="flex items-start justify-between gap-3">
                <span className="text-xs text-muted">{head[i]}</span>
                <div className="text-right">{c}</div>
              </div>
            ))}
          </li>
        ))}
      </ul>
    </>
  );
}
