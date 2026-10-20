"use client";

import { Bell, Download, LogOut, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { BookingDetail } from "@/components/BookingDetail";
import { BookingsTable } from "@/components/BookingsTable";
import { Logo } from "@/components/Logo";
import type { Staff } from "@/lib/auth";
import { useAuth } from "@/lib/auth";
import { useBookings } from "@/lib/bookings";
import { SERVICES } from "@/lib/catalog";
import { downloadCsv } from "@/lib/csv";
import { formatINR, isSameDay, localISODate, toDate } from "@/lib/format";
import { requestId, type Booking, type BookingStatus } from "@/lib/types";

type Tab = BookingStatus | "all";
type Range = "all" | "today" | "7d" | "30d";

const TABS: { id: Tab; label: string }[] = [
  { id: "pending", label: "New" },
  { id: "contacted", label: "Contacted" },
  { id: "confirmed", label: "Confirmed" },
  { id: "cancelled", label: "Cancelled" },
  { id: "all", label: "All" },
];

const RANGES: { id: Range; label: string }[] = [
  { id: "all", label: "Any time" },
  { id: "today", label: "Today" },
  { id: "7d", label: "Last 7 days" },
  { id: "30d", label: "Last 30 days" },
];

export function Dashboard({ staff, demo }: { staff: Staff; demo?: Booking[] }) {
  const { signOut } = useAuth();
  const { bookings, loading, error, arrivals, clearArrivals } = useBookings(true, demo);

  const [tab, setTab] = useState<Tab>("pending");
  const [search, setSearch] = useState("");
  const [service, setService] = useState("all");
  const [source, setSource] = useState("all");
  const [range, setRange] = useState<Range>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());

  // Keep "12 min ago" labels fresh.
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(t);
  }, []);

  // Tab title shows how many new requests are waiting.
  const newCount = bookings.filter((b) => b.status === "pending").length;
  useEffect(() => {
    document.title = newCount ? `(${newCount}) New requests · HeyNanny Ops` : "HeyNanny Ops";
  }, [newCount]);

  const sources = useMemo(
    () => [...new Set(bookings.map((b) => b.leadSource).filter((s): s is string => !!s))].sort(),
    [bookings],
  );

  const stats = useMemo(() => {
    const today = bookings.filter((b) => {
      const d = toDate(b.createdAt);
      return !d || isSameDay(d, now);
    });
    const monthKey = localISODate(now).slice(0, 7);
    const confirmedThisMonth = bookings.filter((b) => {
      const d = toDate(b.ops?.confirmedAt) ?? toDate(b.updatedAt);
      return b.status === "confirmed" && d && localISODate(d).startsWith(monthKey);
    });
    return {
      newRequests: newCount,
      today: today.length,
      contacted: bookings.filter((b) => b.status === "contacted").length,
      confirmedMonth: confirmedThisMonth.length,
      confirmedValue: confirmedThisMonth.reduce((s, b) => s + b.pricing.subtotal, 0),
    };
  }, [bookings, newCount, now]);

  // Everything except the status tab, so tab counts reflect the other filters.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const qDigits = q.replace(/\D/g, "");
    const minDate =
      range === "all" ? null : new Date(now.getFullYear(), now.getMonth(), now.getDate() - (range === "today" ? 0 : range === "7d" ? 6 : 29));
    return bookings.filter((b) => {
      if (service !== "all" && b.serviceId !== service) return false;
      if (source !== "all" && (b.leadSource ?? "") !== source) return false;
      if (minDate) {
        const d = toDate(b.createdAt);
        if (d && d < minDate) return false;
      }
      if (!q) return true;
      return (
        b.customer.name.toLowerCase().includes(q) ||
        b.customer.email.toLowerCase().includes(q) ||
        (qDigits.length >= 3 && b.customer.phone.replace(/\D/g, "").includes(qDigits)) ||
        requestId(b).toLowerCase().includes(q) ||
        b.bookingDetails.address.pincode.includes(q) ||
        b.bookingDetails.address.city.toLowerCase().includes(q)
      );
    });
  }, [bookings, search, service, source, range, now]);

  const tabCounts = useMemo(() => {
    const counts: Record<Tab, number> = { pending: 0, contacted: 0, confirmed: 0, cancelled: 0, completed: 0, all: filtered.length };
    for (const b of filtered) counts[b.status] = (counts[b.status] ?? 0) + 1;
    return counts;
  }, [filtered]);

  const visible = useMemo(() => (tab === "all" ? filtered : filtered.filter((b) => b.status === tab)), [filtered, tab]);
  const selected = bookings.find((b) => b.id === selectedId) ?? null;
  const filtersOn = search || service !== "all" || source !== "all" || range !== "all";

  return (
    <div className="min-h-dvh">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-line bg-milk/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-[1400px] items-center gap-3 px-4 sm:px-6">
          <Logo className="h-10 w-auto" priority />
          <span className="rounded-full bg-plum px-2.5 py-1 text-[0.68rem] font-bold uppercase tracking-wider text-milk">Ops</span>
          <div className="ml-auto flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-semibold leading-tight text-plum">{staff.name}</p>
              <p className="text-xs leading-tight text-muted">
                {staff.email} · {staff.role}
              </p>
            </div>
            <button
              type="button"
              onClick={signOut}
              className="inline-flex h-9 items-center gap-2 rounded-full bg-paper px-3.5 text-sm font-semibold text-plum ring-1 ring-line hover:bg-white"
            >
              <LogOut className="size-4" aria-hidden="true" />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] px-4 pb-16 pt-6 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-[1.9rem] leading-tight text-plum">Booking requests</h1>
            <p className="mt-0.5 text-sm text-muted">Live from heynanny.in. New requests appear here automatically.</p>
          </div>
          <button
            type="button"
            disabled={!visible.length}
            onClick={() => downloadCsv(visible, `heynanny-bookings-${localISODate(new Date())}.csv`)}
            className="inline-flex h-10 items-center gap-2 rounded-full bg-paper px-4 text-sm font-semibold text-plum ring-1 ring-line hover:bg-white disabled:opacity-50"
          >
            <Download className="size-4" aria-hidden="true" />
            Export {visible.length ? `${visible.length} ` : ""}to Excel
          </button>
        </div>

        {/* Summary */}
        <section aria-label="Summary" className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="New requests" value={stats.newRequests} hint="Waiting for a call" accent onClick={() => setTab("pending")} />
          <StatCard label="Received today" value={stats.today} hint="All statuses" onClick={() => { setRange("today"); setTab("all"); }} />
          <StatCard label="Contacted" value={stats.contacted} hint="Waiting to confirm" onClick={() => setTab("contacted")} />
          <StatCard
            label="Confirmed this month"
            value={stats.confirmedMonth}
            hint={`${formatINR(stats.confirmedValue)} (excl. GST)`}
            onClick={() => setTab("confirmed")}
          />
        </section>

        {/* Toolbar */}
        <section aria-label="Filters" className="mt-6 rounded-[20px] border border-line bg-paper p-3 shadow-soft">
          <div className="flex flex-wrap items-center gap-2">
            <label className="relative min-w-[220px] flex-1">
              <span className="sr-only">Search</span>
              <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden="true" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, phone, email, request ID, pincode"
                className="h-10 w-full rounded-full border border-line bg-white pl-10 pr-4 text-sm text-plum placeholder:text-muted/80 focus:border-plum focus:outline-none"
              />
            </label>
            <Select label="Service" value={service} onChange={setService} options={[["all", "All services"], ...Object.entries(SERVICES).map(([id, s]) => [id, s.name] as [string, string])]} />
            <Select label="Lead source" value={source} onChange={setSource} options={[["all", "All sources"], ...sources.map((s) => [s, s] as [string, string])]} />
            <Select label="Received" value={range} onChange={(v) => setRange(v as Range)} options={RANGES.map((r) => [r.id, r.label] as [string, string])} />
            {filtersOn && (
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setService("all");
                  setSource("all");
                  setRange("all");
                }}
                className="inline-flex h-10 items-center gap-1 rounded-full px-3 text-sm font-semibold text-rose-deep hover:bg-blush/50"
              >
                <X className="size-4" aria-hidden="true" />
                Clear
              </button>
            )}
          </div>

          <div role="tablist" aria-label="Status" className="mt-3 flex gap-1 overflow-x-auto border-t border-line pt-3">
            {TABS.map((t) => {
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  role="tab"
                  type="button"
                  aria-selected={active}
                  onClick={() => setTab(t.id)}
                  className={`inline-flex h-9 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-semibold transition-colors ${
                    active ? "bg-plum text-milk" : "text-plum hover:bg-plum/5"
                  }`}
                >
                  {t.label}
                  <span
                    className={`min-w-6 rounded-full px-1.5 py-0.5 text-xs tabular-nums ${
                      active ? "bg-milk/20 text-milk" : t.id === "pending" && tabCounts.pending ? "bg-rose text-white" : "bg-beige text-muted"
                    }`}
                  >
                    {tabCounts[t.id]}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {/* Table */}
        <section aria-label="Bookings" className="mt-4">
          {error ? (
            <p role="alert" className="rounded-[20px] bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </p>
          ) : loading ? (
            <div className="rounded-[20px] border border-line bg-paper px-4 py-16 text-center text-sm text-muted">Loading bookings…</div>
          ) : (
            <BookingsTable bookings={visible} now={now} selectedId={selectedId} onSelect={setSelectedId} emptyHint={tabEmptyHint(tab, !!filtersOn)} />
          )}
        </section>
      </main>

      {selected && <BookingDetail booking={selected} staff={staff} demo={!!demo} onClose={() => setSelectedId(null)} />}

      {/* New request toast */}
      {arrivals.length > 0 && (
        <div className="toast-in fixed bottom-5 left-1/2 z-40 w-[min(420px,calc(100vw-2rem))] -translate-x-1/2">
          <div className="flex items-center gap-3 rounded-[18px] bg-plum px-4 py-3 text-milk shadow-lift" role="status">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-rose/30">
              <Bell className="size-4" aria-hidden="true" />
            </span>
            <button
              type="button"
              className="min-w-0 flex-1 text-left"
              onClick={() => {
                setTab("pending");
                setSelectedId(arrivals[0]!.id);
                clearArrivals();
              }}
            >
              <p className="text-sm font-bold">
                {arrivals.length === 1 ? "New booking request" : `${arrivals.length} new booking requests`}
              </p>
              <p className="truncate text-xs text-blush/90">
                {arrivals[0]!.customer.name} · {SERVICES[arrivals[0]!.serviceId]?.name ?? arrivals[0]!.serviceId} · tap to open
              </p>
            </button>
            <button type="button" onClick={clearArrivals} aria-label="Dismiss" className="grid size-8 place-items-center rounded-full hover:bg-white/10">
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function tabEmptyHint(tab: Tab, filtersOn: boolean) {
  if (filtersOn) return "No bookings match these filters.";
  if (tab === "pending") return "No new requests. You're all caught up.";
  if (tab === "all") return "No bookings yet.";
  return "Nothing here yet.";
}

function StatCard({
  label,
  value,
  hint,
  accent,
  onClick,
}: {
  label: string;
  value: number;
  hint: string;
  accent?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-[20px] p-4 text-left transition-[transform,box-shadow] duration-200 hover:-translate-y-[2px] hover:shadow-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-plum ${
        accent ? "bg-plum text-milk" : "border border-line bg-paper text-plum"
      }`}
    >
      <p className={`text-xs font-semibold uppercase tracking-wider ${accent ? "text-blush" : "text-muted"}`}>{label}</p>
      <p className="mt-1 font-display text-[2.1rem] leading-none tabular-nums">{value}</p>
      <p className={`mt-2 truncate text-xs ${accent ? "text-blush/90" : "text-muted"}`}>{hint}</p>
    </button>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
}) {
  return (
    <label>
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="select-chevron h-10 rounded-full border border-line bg-white pl-4 text-sm font-medium text-plum focus:border-plum focus:outline-none"
      >
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}
