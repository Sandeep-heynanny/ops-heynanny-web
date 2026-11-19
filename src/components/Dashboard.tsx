"use client";

import { Bell, Download, PhoneCall, Plus, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { AppHeader } from "@/components/AppHeader";
import { LeadDetail } from "@/components/LeadDetail";
import { LeadsTable } from "@/components/LeadsTable";
import { NewEnquiryPanel } from "@/components/NewEnquiryPanel";
import type { Staff } from "@/lib/auth";
import { downloadCsv } from "@/lib/csv";
import { formatCallback, isSameDay, localISODate, toDate } from "@/lib/format";
import { canReadServicing } from "@/lib/firebase";
import { findReturning, useLeads } from "@/lib/leads";
import { useServicingCases } from "@/lib/servicing";
import { enquiryStaff, useStaffList } from "@/lib/staff-list";
import {
  careShort,
  displayPhone,
  leadOrigin,
  leadRef,
  ORIGIN_META,
  ORIGINS,
  type Lead,
  type LeadStatus,
} from "@/lib/types";

type Tab = LeadStatus | "all";
type Range = "all" | "today" | "7d" | "30d";

const TABS: { id: Tab; label: string }[] = [
  { id: "new", label: "New" },
  { id: "contacted", label: "Contacted" },
  { id: "converted", label: "Converted" },
  { id: "not_interested", label: "Not interested" },
  { id: "all", label: "All" },
];

const RANGES: { id: Range; label: string }[] = [
  { id: "all", label: "Any time" },
  { id: "today", label: "Today" },
  { id: "7d", label: "Last 7 days" },
  { id: "30d", label: "Last 30 days" },
];

export function Dashboard({ staff, demo }: { staff: Staff; demo?: Lead[] }) {
  const { leads, loading, error, arrivals, clearArrivals } = useLeads(
    true,
    demo,
  );
  const allStaff = useStaffList(!!demo);
  const staffList = useMemo(() => enquiryStaff(allStaff), [allStaff]);
  // Servicing cases, so sales can see where each converted customer is (read-only).
  const { cases } = useServicingCases(
    !demo && canReadServicing(staff.role),
    demo ? [] : undefined,
  );
  const caseById = useMemo(
    () => new Map(cases.map((c) => [c.id, c])),
    [cases],
  );
  // Enquiries from people who converted (paid) before.
  const returning = useMemo(() => findReturning(leads), [leads]);

  const [tab, setTab] = useState<Tab>("new");
  const [search, setSearch] = useState("");
  const [care, setCare] = useState("all");
  const [source, setSource] = useState("all");
  const [origin, setOrigin] = useState("all");
  const [range, setRange] = useState<Range>("all");
  /** "all", "me", "none" (unassigned) or a staff email. */
  const [assignee, setAssignee] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [addingLead, setAddingLead] = useState(false);
  const [now, setNow] = useState(() => new Date());

  // Keep "12 min ago" labels fresh.
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(t);
  }, []);

  // Contacted leads whose call-back time has come, oldest first.
  const dueCallbacks = useMemo(
    () =>
      leads
        .filter((l) => l.status === "contacted")
        .map((l) => ({ lead: l, at: toDate(l.ops?.callbackAt) }))
        .filter((x): x is { lead: Lead; at: Date } => !!x.at && x.at <= now)
        .sort((a, b) => a.at.getTime() - b.at.getTime()),
    [leads, now],
  );
  const callbacksToday = useMemo(
    () =>
      leads.filter((l) => {
        const d = l.status === "contacted" ? toDate(l.ops?.callbackAt) : null;
        return d && d > now && isSameDay(d, now);
      }).length,
    [leads, now],
  );

  // Tab title shows new enquiries and call backs that are due.
  const newCount = leads.filter((l) => l.status === "new").length;
  useEffect(() => {
    const parts = [
      newCount && `${newCount} new`,
      dueCallbacks.length &&
        `${dueCallbacks.length} call back${dueCallbacks.length === 1 ? "" : "s"}`,
    ].filter(Boolean);
    document.title = parts.length
      ? `(${parts.join(", ")}) HeyNanny Ops`
      : "HeyNanny Ops";
  }, [newCount, dueCallbacks.length]);

  // Pop up a reminder when a call back becomes due (for its assignee, or everyone if unassigned).
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());
  const reminderKey = (x: { lead: Lead; at: Date }) =>
    `${x.lead.id}@${x.at.getTime()}`;
  const myDue = useMemo(
    () =>
      dueCallbacks.filter(({ lead }) => {
        const owner = lead.ops?.assignedTo?.toLowerCase();
        return !owner || owner === staff.email.toLowerCase();
      }),
    [dueCallbacks, staff.email],
  );
  const pendingReminders = myDue.filter((x) => !dismissed.has(reminderKey(x)));
  const reminder = pendingReminders[pendingReminders.length - 1] ?? null;
  const dismissReminders = () =>
    setDismissed((d) => new Set([...d, ...pendingReminders.map(reminderKey)]));

  // Desktop notification too, if the browser tab is in the background and alerts are allowed.
  const notified = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (
      typeof Notification === "undefined" ||
      Notification.permission !== "granted" ||
      !document.hidden
    )
      return;
    for (const x of myDue) {
      const key = reminderKey(x);
      if (notified.current.has(key)) continue;
      notified.current.add(key);
      new Notification("Call back due", {
        body: `${x.lead.name || displayPhone(x.lead.phone)} · ${careShort(x.lead.careType)}`,
        tag: key,
      });
    }
  }, [myDue]);

  const sources = useMemo(
    () =>
      [
        ...new Set(
          leads.map((l) => l.leadSource).filter((s): s is string => !!s),
        ),
      ].sort(),
    [leads],
  );
  const careTypes = useMemo(
    () => [...new Set(leads.map((l) => l.careType).filter(Boolean))].sort(),
    [leads],
  );

  const stats = useMemo(() => {
    const today = leads.filter((l) => {
      const d = toDate(l.createdAt);
      return !d || isSameDay(d, now);
    });
    const monthKey = localISODate(now).slice(0, 7);
    const convertedThisMonth = leads.filter((l) => {
      const d = toDate(l.ops?.convertedAt) ?? toDate(l.updatedAt);
      return (
        l.status === "converted" && d && localISODate(d).startsWith(monthKey)
      );
    });
    const monthLeads = leads.filter((l) => {
      const d = toDate(l.createdAt);
      return d && localISODate(d).startsWith(monthKey);
    });
    return {
      newLeads: newCount,
      today: today.length,
      contacted: leads.filter((l) => l.status === "contacted").length,
      convertedMonth: convertedThisMonth.length,
      monthLeads: monthLeads.length,
    };
  }, [leads, newCount, now]);

  // Everything except the status tab, so tab counts reflect the other filters.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const qDigits = q.replace(/\D/g, "");
    const minDate =
      range === "all"
        ? null
        : new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate() - (range === "today" ? 0 : range === "7d" ? 6 : 29),
          );
    return leads.filter((l) => {
      if (care !== "all" && l.careType !== care) return false;
      if (source !== "all" && (l.leadSource ?? "") !== source) return false;
      if (origin !== "all" && leadOrigin(l) !== origin) return false;
      if (assignee !== "all") {
        const owner = (l.ops?.assignedTo ?? "").toLowerCase();
        if (
          assignee === "none"
            ? owner
            : owner !==
              (assignee === "me" ? staff.email : assignee).toLowerCase()
        )
          return false;
      }
      if (minDate) {
        const d = toDate(l.createdAt);
        if (d && d < minDate) return false;
      }
      if (!q) return true;
      return (
        (l.name ?? "").toLowerCase().includes(q) ||
        (l.email ?? "").toLowerCase().includes(q) ||
        (qDigits.length >= 3 && l.phone.replace(/\D/g, "").includes(qDigits)) ||
        leadRef(l).toLowerCase().includes(q) ||
        l.area.toLowerCase().includes(q) ||
        (l.ops?.notes ?? "").toLowerCase().includes(q)
      );
    });
  }, [leads, search, care, source, origin, range, now, assignee, staff.email]);

  // Everyone who can be assigned, plus anyone already assigned an enquiry.
  const assigneeOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of staffList) m.set(t.email.toLowerCase(), t.name);
    for (const l of leads) {
      const e = l.ops?.assignedTo?.toLowerCase();
      if (e && !m.has(e)) m.set(e, e);
    }
    m.delete(staff.email.toLowerCase());
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [staffList, leads, staff.email]);

  const tabCounts = useMemo(() => {
    const counts: Record<Tab, number> = {
      new: 0,
      contacted: 0,
      converted: 0,
      not_interested: 0,
      all: filtered.length,
    };
    for (const l of filtered) counts[l.status] = (counts[l.status] ?? 0) + 1;
    return counts;
  }, [filtered]);

  const visible = useMemo(() => {
    if (tab === "all") return filtered;
    const list = filtered.filter((l) => l.status === tab);
    if (tab !== "contacted") return list;
    // Earliest call back first; leads without one keep their order at the end.
    const t = (l: Lead) =>
      toDate(l.ops?.callbackAt)?.getTime() ?? Number.POSITIVE_INFINITY;
    return [...list].sort((a, b) => t(a) - t(b));
  }, [filtered, tab]);
  const selected = leads.find((l) => l.id === selectedId) ?? null;
  const filtersOn =
    search ||
    care !== "all" ||
    source !== "all" ||
    origin !== "all" ||
    range !== "all" ||
    assignee !== "all";

  return (
    <div className="min-h-dvh">
      {/* Header */}
      <AppHeader staff={staff} active="enquiries" />

      <main className="mx-auto max-w-[1400px] px-4 pb-16 pt-6 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-[1.9rem] leading-tight text-plum">
              Enquiries
            </h1>
            <p className="mt-0.5 text-sm text-muted">
              Website, Google Ads and Meta lead forms. New enquiries appear here
              automatically.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setAddingLead(true)}
              className="inline-flex h-10 items-center gap-2 rounded-full bg-plum px-4 text-sm font-semibold text-milk hover:bg-plum-soft"
            >
              <Plus className="size-4" aria-hidden="true" />
              New enquiry
            </button>
            <button
              type="button"
              disabled={!visible.length}
              onClick={() =>
                downloadCsv(
                  visible,
                  `heynanny-enquiries-${localISODate(new Date())}.csv`,
                )
              }
              className="inline-flex h-10 items-center gap-2 rounded-full bg-paper px-4 text-sm font-semibold text-plum ring-1 ring-line hover:bg-white disabled:opacity-50"
            >
              <Download className="size-4" aria-hidden="true" />
              Export {visible.length ? `${visible.length} ` : ""}to Excel
            </button>
          </div>
        </div>
        {addingLead && (
          <NewEnquiryPanel
            demo={!!demo}
            forSales
            onClose={() => setAddingLead(false)}
            onCreated={(r) => {
              if (r.id === "demo") return;
              setTab("new");
              setSelectedId(r.id);
            }}
          />
        )}

        {/* Summary */}
        <section
          aria-label="Summary"
          className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4"
        >
          <StatCard
            label="New enquiries"
            value={stats.newLeads}
            hint="Waiting for a call"
            accent
            onClick={() => setTab("new")}
          />
          <StatCard
            label="Received today"
            value={stats.today}
            hint="All statuses"
            onClick={() => {
              setRange("today");
              setTab("all");
            }}
          />
          <StatCard
            label="Call backs due"
            value={dueCallbacks.length}
            hint={`${callbacksToday} more later today · ${stats.contacted} contacted`}
            alert={dueCallbacks.length > 0}
            onClick={() => setTab("contacted")}
          />
          <StatCard
            label="Converted this month"
            value={stats.convertedMonth}
            hint={`Out of ${stats.monthLeads} enquiries this month`}
            onClick={() => setTab("converted")}
          />
        </section>

        {/* Toolbar */}
        <section
          aria-label="Filters"
          className="mt-6 rounded-[20px] border border-line bg-paper p-3 shadow-soft"
        >
          <div className="flex flex-wrap items-center gap-2">
            <label className="relative min-w-[220px] flex-1">
              <span className="sr-only">Search</span>
              <Search
                className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted"
                aria-hidden="true"
              />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, phone, email, area, notes"
                className="h-10 w-full rounded-full border border-line bg-white pl-10 pr-4 text-sm text-plum placeholder:text-muted/80 focus:border-plum focus:outline-none"
              />
            </label>
            <Select
              label="Type of care"
              value={care}
              onChange={setCare}
              options={[
                ["all", "All care types"],
                ...careTypes.map((c) => [c, careShort(c)] as [string, string]),
              ]}
            />
            <Select
              label="Source"
              value={origin}
              onChange={setOrigin}
              options={[
                ["all", "All channels"],
                ...ORIGINS.map(
                  (o) => [o, ORIGIN_META[o].label] as [string, string],
                ),
              ]}
            />
            <Select
              label="Lead source"
              value={source}
              onChange={setSource}
              options={[
                ["all", "All sources"],
                ...sources.map((s) => [s, s] as [string, string]),
              ]}
            />
            <Select
              label="Assigned to"
              value={assignee}
              onChange={setAssignee}
              options={[
                ["all", "All assignees"],
                ["me", "Assigned to me"],
                ["none", "Unassigned"],
                ...assigneeOptions,
              ]}
            />
            <Select
              label="Received"
              value={range}
              onChange={(v) => setRange(v as Range)}
              options={RANGES.map((r) => [r.id, r.label] as [string, string])}
            />
            {filtersOn && (
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setCare("all");
                  setSource("all");
                  setOrigin("all");
                  setRange("all");
                  setAssignee("all");
                }}
                className="inline-flex h-10 items-center gap-1 rounded-full px-3 text-sm font-semibold text-rose-deep hover:bg-blush/50"
              >
                <X className="size-4" aria-hidden="true" />
                Clear
              </button>
            )}
          </div>

          <div
            role="tablist"
            aria-label="Status"
            className="mt-3 flex flex-wrap gap-1 border-t border-line pt-3"
          >
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
                      active
                        ? "bg-milk/20 text-milk"
                        : t.id === "new" && tabCounts.new
                          ? "bg-rose text-white"
                          : "bg-beige text-muted"
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
        <section aria-label="Enquiries" className="mt-4">
          {error ? (
            <p
              role="alert"
              className="rounded-[20px] bg-red-50 px-4 py-3 text-sm text-red-700"
            >
              {error}
            </p>
          ) : loading ? (
            <div className="rounded-[20px] border border-line bg-paper px-4 py-16 text-center text-sm text-muted">
              Loading enquiries…
            </div>
          ) : (
            <LeadsTable
              leads={visible}
              now={now}
              selectedId={selectedId}
              onSelect={setSelectedId}
              returning={returning}
              emptyHint={tabEmptyHint(tab, !!filtersOn)}
              staffList={staffList}
              cases={caseById}
            />
          )}
        </section>
      </main>

      {selected && (
        <LeadDetail
          lead={selected}
          staff={staff}
          staffList={staffList}
          allStaff={allStaff}
          returning={returning.get(selected.id)}
          onOpenLead={setSelectedId}
          demo={!!demo}
          onClose={() => setSelectedId(null)}
        />
      )}

      {/* Call back reminder */}
      {reminder && (
        <div
          className={`toast-in fixed left-1/2 z-40 w-[min(420px,calc(100vw-2rem))] -translate-x-1/2 ${arrivals.length ? "bottom-24" : "bottom-5"}`}
        >
          <div
            className="flex items-center gap-3 rounded-[18px] bg-[#7a5410] px-4 py-3 text-white shadow-lift"
            role="status"
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-white/15">
              <PhoneCall className="size-4" aria-hidden="true" />
            </span>
            <button
              type="button"
              className="min-w-0 flex-1 text-left"
              onClick={() => {
                setTab("contacted");
                setSelectedId(reminder.lead.id);
                dismissReminders();
              }}
            >
              <p className="text-sm font-bold">
                Call back due
                {pendingReminders.length > 1
                  ? ` (${pendingReminders.length})`
                  : ""}
              </p>
              <p className="truncate text-xs text-white/85">
                {reminder.lead.name || displayPhone(reminder.lead.phone)} ·{" "}
                {formatCallback(reminder.at, now)} · tap to open
              </p>
            </button>
            <button
              type="button"
              onClick={dismissReminders}
              aria-label="Dismiss"
              className="grid size-8 place-items-center rounded-full hover:bg-white/10"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      {/* New enquiry toast */}
      {arrivals.length > 0 && (
        <div className="toast-in fixed bottom-5 left-1/2 z-40 w-[min(420px,calc(100vw-2rem))] -translate-x-1/2">
          <div
            className="flex items-center gap-3 rounded-[18px] bg-plum px-4 py-3 text-milk shadow-lift"
            role="status"
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-rose/30">
              <Bell className="size-4" aria-hidden="true" />
            </span>
            <button
              type="button"
              className="min-w-0 flex-1 text-left"
              onClick={() => {
                setTab("new");
                setSelectedId(arrivals[0]!.id);
                clearArrivals();
              }}
            >
              <p className="text-sm font-bold">
                {arrivals.length === 1
                  ? "New enquiry"
                  : `${arrivals.length} new enquiries`}
              </p>
              <p className="truncate text-xs text-blush/90">
                {arrivals[0]!.name ? `${arrivals[0]!.name} · ` : ""}
                {careShort(arrivals[0]!.careType)} · {arrivals[0]!.area} · tap
                to open
              </p>
            </button>
            <button
              type="button"
              onClick={clearArrivals}
              aria-label="Dismiss"
              className="grid size-8 place-items-center rounded-full hover:bg-white/10"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function tabEmptyHint(tab: Tab, filtersOn: boolean) {
  if (filtersOn) return "No enquiries match these filters.";
  if (tab === "new") return "No new enquiries. You're all caught up.";
  if (tab === "all") return "No enquiries yet.";
  return "Nothing here yet.";
}

function StatCard({
  label,
  value,
  hint,
  accent,
  alert,
  onClick,
}: {
  label: string;
  value: number;
  hint: string;
  accent?: boolean;
  /** Something overdue: red outline. */
  alert?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-[20px] p-4 text-left transition-[transform,box-shadow] duration-200 hover:-translate-y-[2px] hover:shadow-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-plum ${
        accent
          ? "bg-plum text-milk"
          : alert
            ? "border border-red-300 bg-red-50 text-red-800"
            : "border border-line bg-paper text-plum"
      }`}
    >
      <p
        className={`text-xs font-semibold uppercase tracking-wider ${accent ? "text-blush" : "text-muted"}`}
      >
        {label}
      </p>
      <p className="mt-1 font-display text-[2.1rem] leading-none tabular-nums">
        {value}
      </p>
      <p
        className={`mt-2 truncate text-xs ${accent ? "text-blush/90" : "text-muted"}`}
      >
        {hint}
      </p>
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
