"use client";

import {
  Building2,
  Car,
  Check,
  ClipboardCopy,
  Home,
  MessageCircle,
  Phone,
  Plus,
  Search,
  Ticket,
  Trash2,
  Undo2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { confirmDialog } from "@/components/ConfirmDialog";
import { UpdatedBy } from "@/components/UpdatedBy";
import { AppHeader } from "@/components/AppHeader";
import { NannyAvatar } from "@/components/NannyAvatar";
import { profileData } from "@/components/ProfileCard";
import { SidePanel } from "@/components/NanniesPage";
import type { Staff } from "@/lib/auth";
import {
  formatDateTime,
  formatReceived,
  fromLocalInput,
  localISODate,
  toDate,
  toLocalInput,
  whatsappLink,
} from "@/lib/format";
import {
  NANNY_STATUS_META,
  nannyPlace,
  nannySummary,
  useNannies,
  WORK_TYPE_LABEL,
  type Nanny,
} from "@/lib/nannies";
import {
  cancelCase,
  CANCEL_REASONS,
  caseRef,
  createCase,
  emptyTravel,
  newProposal,
  placeNanny,
  readNotes,
  REFUND_META,
  CF_REFUND_META,
  initiateCaseRefund,
  liveCfRefunds,
  syncCaseRefund,
  refundDue,
  reopenCase,
  saveNotes,
  STAGE_META,
  bucketMeta,
  caseBucket,
  needsForm,
  saveIntake,
  type Intake,
  TRAVEL_MODES,
  travelStatus,
  unplace,
  updateCase,
  updateRefund,
  useServicingCases,
  type Proposal,
  type Refund,
  type Bucket,
  type ServicingCase,
  type Stage,
  type Travel,
} from "@/lib/servicing";
import {
  servicingStaff,
  staffName,
  useStaffList,
  type StaffMember,
} from "@/lib/staff-list";
import { ProfileShareDialog } from "@/components/ProfileShareDialog";
import { ServicingForm } from "@/components/ServicingForm";
import {
  emptyForm,
  formInputFromValue,
  guessCareType,
  type ServicingFormValue,
} from "@/lib/servicing-form";
import type { ProfileItem } from "@/lib/profile-image";
import { displayPhone } from "@/lib/types";
import { Timestamp } from "firebase/firestore";

type Tab = "active" | Bucket | "refunds" | "all";
const TABS: { id: Tab; label: string }[] = [
  { id: "active", label: "Active" },
  { id: "form_pending", label: "Form pending" },
  { id: "new", label: "New" },
  { id: "profiles_shared", label: "Profiles shared" },
  { id: "interviews", label: "Interviews" },
  { id: "approved", label: "Approved" },
  { id: "placed", label: "Placed" },
  { id: "travel", label: "Travel" },
  { id: "joined", label: "Joined" },
  { id: "on_hold", label: "On hold" },
  { id: "cancelled", label: "Cancelled" },
  { id: "refunds", label: "Refunds due" },
  { id: "all", label: "All" },
];
/** Still being worked on: everything up to her joining the family. */
const ACTIVE: Bucket[] = [
  "form_pending",
  "new",
  "profiles_shared",
  "interviews",
  "approved",
  "placed",
  "travel",
];
const inr = (n: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);

/** Servicing team + admins: every paying customer from payment to placement. */
export function ServicingPage({
  staff,
  demo,
}: {
  staff: Staff;
  demo?: { cases: ServicingCase[]; nannies: Nanny[] };
}) {
  const { cases, loading, error } = useServicingCases(true, demo?.cases);
  const { nannies } = useNannies(true, demo?.nannies);
  const allStaff = useStaffList(!!demo);
  const team = servicingStaff(allStaff);
  const [tab, setTab] = useState<Tab>("active");
  const [mine, setMine] = useState(false);
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(t);
  }, []);

  const newCount = cases.filter((c) => c.stage === "new").length;
  useEffect(() => {
    document.title = newCount
      ? `(${newCount}) Servicing · HeyNanny Ops`
      : "Servicing · HeyNanny Ops";
  }, [newCount]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const digits = q.replace(/\D/g, "");
    return cases.filter(
      (c) =>
        (!mine || c.assignedTo === staff.email) &&
        (!q ||
          (c.customer.name ?? "").toLowerCase().includes(q) ||
          (digits.length >= 3 && c.customer.phone.includes(digits)) ||
          caseRef(c).toLowerCase().includes(q) ||
          (c.area ?? "").toLowerCase().includes(q) ||
          c.proposals.some((p) => p.nanny.name.toLowerCase().includes(q))),
    );
  }, [cases, search, mine, staff.email]);
  const counts = useMemo(() => {
    const out: Record<string, number> = {
      all: filtered.length,
      active: 0,
      refunds: 0,
    };
    for (const c of filtered) {
      if (refundDue(c)) out.refunds! += 1;
      const b = caseBucket(c);
      out[b] = (out[b] ?? 0) + 1;
      if (ACTIVE.includes(b)) out.active! += 1;
    }
    return out;
  }, [filtered]);
  const visible =
    tab === "all"
      ? filtered
      : tab === "refunds"
        ? filtered.filter(refundDue)
        : tab === "active"
          ? filtered.filter((c) => ACTIVE.includes(caseBucket(c)))
          : filtered.filter((c) => caseBucket(c) === tab);
  const open = cases.find((c) => c.id === openId) ?? null;

  return (
    <div className="min-h-dvh">
      <AppHeader staff={staff} active="servicing" />
      <main className="mx-auto max-w-[1400px] px-4 pb-16 pt-6 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-[1.9rem] leading-tight text-plum">
              Servicing
            </h1>
            <p className="mt-0.5 text-sm text-muted">
              Paid customers, from matching nannies to placement. Customers
              arrive here when sales submits the Servicing form.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="inline-flex h-10 items-center gap-2 rounded-full bg-plum px-4 text-sm font-semibold text-milk hover:bg-plum-soft"
          >
            <Plus className="size-4" aria-hidden="true" />
            New case
          </button>
        </div>

        {/* Pipeline */}
        <section
          aria-label="Pipeline"
          className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-5"
        >
          {(
            [
              "new",
              "profiles_shared",
              "interviews",
              "approved",
              "placed",
            ] as Stage[]
          ).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setTab(s)}
              className={`rounded-[20px] p-4 text-left transition-[transform,box-shadow] hover:-translate-y-[2px] hover:shadow-soft ${s === "new" ? "bg-plum text-milk" : "border border-line bg-paper text-plum"} ${tab === s ? "ring-2 ring-rose ring-offset-2 ring-offset-milk" : ""}`}
            >
              <p
                className={`text-xs font-semibold uppercase tracking-wider ${s === "new" ? "text-blush" : "text-muted"}`}
              >
                {STAGE_META[s].short}
              </p>
              <p className="mt-1 font-display text-[2rem] leading-none tabular-nums">
                {counts[s] ?? 0}
              </p>
            </button>
          ))}
        </section>

        <section
          aria-label="Filters"
          className="mt-5 rounded-[20px] border border-line bg-paper p-3 shadow-soft"
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
                placeholder="Search customer, phone, case ID, area, nanny"
                className="h-10 w-full rounded-full border border-line bg-white pl-10 pr-4 text-sm text-plum placeholder:text-muted/80 focus:border-plum focus:outline-none"
              />
            </label>
            <label className="inline-flex h-10 items-center gap-2 rounded-full bg-white px-4 text-sm font-medium text-plum ring-1 ring-line">
              <input
                type="checkbox"
                checked={mine}
                onChange={(e) => setMine(e.target.checked)}
                className="size-4 accent-plum"
              />
              Assigned to me
            </label>
          </div>
          <div
            role="tablist"
            aria-label="Stage"
            className="mt-3 flex flex-wrap gap-1 border-t border-line pt-3"
          >
            {TABS.map((t) => (
              <button
                key={t.id}
                role="tab"
                type="button"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={`inline-flex h-9 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-semibold transition-colors ${tab === t.id ? "bg-plum text-milk" : "text-plum hover:bg-plum/5"}`}
              >
                {t.label}
                <span
                  className={`min-w-6 rounded-full px-1.5 py-0.5 text-xs tabular-nums ${tab === t.id ? "bg-milk/20 text-milk" : (t.id === "new" && counts.new) || (t.id === "form_pending" && counts.form_pending) || (t.id === "refunds" && counts.refunds) ? "bg-rose text-white" : "bg-beige text-muted"}`}
                >
                  {counts[t.id] ?? 0}
                </span>
              </button>
            ))}
          </div>
        </section>

        {error && (
          <p
            role="alert"
            className="mt-4 rounded-[20px] bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            {error}
          </p>
        )}
        {loading ? (
          <Empty>Loading cases…</Empty>
        ) : !visible.length ? (
          <Empty>
            {cases.length
              ? "No cases here."
              : "No cases yet. They arrive when sales submits the Servicing form on a converted enquiry, or add one with “New case”."}
          </Empty>
        ) : (
          <ul className="mt-4 grid gap-2">
            {visible.map((c) => (
              <li key={c.id}>
                <CaseRow
                  c={c}
                  now={now}
                  team={team}
                  onOpen={() => setOpenId(c.id)}
                />
              </li>
            ))}
          </ul>
        )}
      </main>

      {open && (
        <CaseDetail
          key={open.id}
          c={open}
          people={allStaff}
          nannies={nannies}
          team={team}
          staff={staff}
          demo={!!demo}
          onClose={() => setOpenId(null)}
        />
      )}
      {creating && (
        <NewCasePanel
          staff={staff}
          demo={!!demo}
          onClose={() => setCreating(false)}
          onCreated={(id) => setOpenId(id)}
        />
      )}
    </div>
  );
}

function StagePill({ c }: { c: ServicingCase }) {
  const m = bucketMeta(caseBucket(c));
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${m.tone}`}
    >
      <span className={`size-1.5 rounded-full ${m.dot}`} aria-hidden="true" />
      {m.short}
    </span>
  );
}

/** What the team should do next, shown on the list. */
function nextStep(c: ServicingCase, now: Date): string {
  if (needsForm(c)) return "Waiting for the Servicing form";
  if (c.stage === "cancelled") {
    const r = c.cancellation?.refund;
    if (!c.cancellation || !r) return "Cancelled";
    const amt = r.amount !== null ? ` ${inr(r.amount)}` : "";
    return `${c.cancellation.reason} · ${r.status === "pending" ? `Refund${amt} due` : r.status === "processed" ? `Refunded${amt}` : "No refund"}`;
  }
  if (c.stage === "placed" && c.placement)
    return `${c.placement.nanny.name} since ${c.placement.startDate} · ${travelStatus(c.travel) ?? "Add travel details"}`;
  if (c.stage === "approved")
    return `Approved: ${c.proposals
      .filter((p) => p.outcome === "approved")
      .map((p) => p.nanny.name)
      .join(", ")}. Place her.`;
  const upcoming = c.proposals
    .filter((p) => p.interviewAt && p.interviewStatus === "scheduled")
    .sort((a, b) => a.interviewAt!.toMillis() - b.interviewAt!.toMillis())[0];
  if (upcoming) {
    const at = upcoming.interviewAt!.toDate();
    return `${at < now ? "Interview to update" : "Interview"}: ${upcoming.nanny.name}, ${formatDateTime(at)}`;
  }
  if (c.stage === "profiles_shared")
    return `${c.proposals.length} profile${c.proposals.length === 1 ? "" : "s"} shared · ${c.proposals.filter((p) => p.shortlisted).length} shortlisted`;
  if (c.stage === "new") return "Pick nannies to share";
  return "";
}

function CaseRow({
  c,
  now,
  team,
  onOpen,
}: {
  c: ServicingCase;
  now: Date;
  team: StaffMember[];
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="grid w-full gap-3 rounded-[18px] border border-line bg-paper p-4 text-left transition-shadow hover:shadow-soft md:grid-cols-[minmax(0,0.9fr)_minmax(0,2.4fr)_minmax(0,1fr)_auto] md:items-center md:gap-5"
    >
      <div className="min-w-0">
        <p className="truncate font-semibold text-plum">
          {c.customer.name || displayPhone(c.customer.phone)}
        </p>
        <p className="truncate text-xs text-muted">
          {caseRef(c)} · {displayPhone(c.customer.phone)}
        </p>
      </div>
      <div className="min-w-0 text-sm text-plum">
        <p
          className="truncate"
          title={[c.careType, c.area].filter(Boolean).join(" · ")}
        >
          {[c.careType, c.area].filter(Boolean).join(" · ") || "—"}
        </p>
        <p className="text-xs text-muted">
          Paid {inr(c.totalPaid)} · {formatReceived(toDate(c.createdAt), now)}
        </p>
        {c.intake && (
          <p
            className="line-clamp-2 text-xs text-[#4a2fb0]"
            title={requirementLine(c.intake)}
          >
            {requirementLine(c.intake)}
          </p>
        )}
      </div>
      <p className="min-w-0 line-clamp-2 text-xs text-plum">{nextStep(c, now)}</p>
      <div className="flex items-center gap-2 md:min-w-[7.5rem] md:flex-col md:items-end md:justify-self-end">
        <StagePill c={c} />
        <span className="text-xs text-muted">
          {c.assignedTo ? staffName(c.assignedTo, team) : "Unassigned"}
        </span>
      </div>
    </button>
  );
}

/* ---------------- case detail ---------------- */

function CaseDetail({
  c,
  people,
  nannies,
  team,
  staff,
  demo,
  onClose,
}: {
  c: ServicingCase;
  /** Everyone on staff, for showing who last changed something. */
  people: StaffMember[];
  nannies: Nanny[];
  team: StaffMember[];
  staff: Staff;
  demo: boolean;
  onClose: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  // The Servicing form is the sales team's. Managers and admins can fill or fix it here.
  const canFillForm = staff.role === "manager" || staff.role === "admin";
  // Once it's in, the servicing team can correct it too (the family changes a detail).
  const canEditForm = canFillForm || staff.role === "servicing";
  const [cancelling, setCancelling] = useState(false);
  const [shareItems, setShareItems] = useState<ProfileItem[] | null>(null);
  const byId = useMemo(() => new Map(nannies.map((n) => [n.id, n])), [nannies]);

  /** Every change saves straight away; the list updates live. */
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      if (!demo) await fn();
    } catch (e) {
      setError(
        (e as { code?: string }).code === "permission-denied"
          ? "You don't have permission to change this case."
          : "Couldn't save. Check your connection and try again.",
      );
    } finally {
      setBusy(false);
    }
  };
  // Cashfree refunds (admins): show the server's message, success or not.
  const [refundNotice, setRefundNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const runCashfree = async (fn: () => Promise<string | null>) => {
    setBusy(true);
    setError(null);
    setRefundNotice(null);
    try {
      if (demo) return;
      const msg = await fn();
      if (msg) setRefundNotice({ ok: true, text: msg });
    } catch (e) {
      setRefundNotice({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };
  const setProposals = (proposals: Proposal[]) =>
    run(() => updateCase(c, { proposals }, staff.email));
  const patchProposal = (nannyId: string, patch: Partial<Proposal>) =>
    setProposals(
      c.proposals.map((p) => (p.nannyId === nannyId ? { ...p, ...patch } : p)),
    );

  /** Profile card image (one per nanny): preview, then WhatsApp / download. */
  const share = (ps: Proposal[]) =>
    setShareItems(
      ps.map((p) => {
        const n = byId.get(p.nannyId);
        return {
          nannyId: p.nannyId,
          data: profileData(n ?? p.nanny),
          hasPhoto: !!(n?.photoUrl ?? p.nanny.photoUrl),
        };
      }),
    );

  const whatsappText = useMemo(() => {
    const first = c.customer.name?.split(" ")[0];
    const lines = c.proposals.map(
      (p, i) =>
        `${i + 1}. ${nannySummary(p.nanny)}${p.nanny.skills.length ? `\n   Skills: ${p.nanny.skills.join(", ")}` : ""}`,
    );
    return `Hi${first ? ` ${first}` : ""}, here are the nanny profiles we've picked for you:\n\n${lines.join("\n\n")}\n\nPlease tell us which ones you'd like to interview.`;
  }, [c.proposals, c.customer.name]);

  return (
    <SidePanel
      title={`${c.customer.name || displayPhone(c.customer.phone)}`}
      onClose={onClose}
      wide
    >
      <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <span className="font-mono">{caseRef(c)}</span>
          <StagePill c={c} />
          <span>Opened {formatDateTime(toDate(c.createdAt))}</span>
          {c.source === "manual" && <span>· added by hand</span>}
        </div>

        {c.stage === "cancelled" && c.cancellation && (
          <RefundBox
            c={c}
            disabled={busy}
            isAdmin={staff.role === "admin"}
            onSave={(refund) => run(() => updateRefund(c, refund, staff.email))}
            onCashfree={(fn) => runCashfree(fn)}
            notice={refundNotice}
          />
        )}

        {/* Customer */}
        <Section title="Customer">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-semibold tabular-nums text-plum">
                {displayPhone(c.customer.phone)}
              </p>
              <p className="text-xs text-muted">
                {c.customer.email ?? "No email"}
              </p>
            </div>
            <div className="flex gap-2">
              <a
                href={`tel:${c.customer.phone}`}
                className="inline-flex h-9 items-center gap-1.5 rounded-full bg-plum px-3.5 text-sm font-semibold text-milk"
              >
                <Phone className="size-4" aria-hidden="true" /> Call
              </a>
              <a
                href={whatsappLink(c.customer.phone)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-9 items-center gap-1.5 rounded-full bg-white px-3.5 text-sm font-semibold text-plum ring-1 ring-line"
              >
                <MessageCircle className="size-4" aria-hidden="true" /> WhatsApp
              </a>
            </div>
          </div>
          <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <EditableRow
              label="Type of care"
              value={c.careType}
              onSave={(v) =>
                run(() => updateCase(c, { careType: v || null }, staff.email))
              }
            />
            <EditableRow
              label="Area"
              value={c.area}
              onSave={(v) =>
                run(() => updateCase(c, { area: v || null }, staff.email))
              }
            />
            <div>
              <dt className="text-xs text-muted">Paid</dt>
              <dd className="font-semibold text-plum">
                {inr(c.totalPaid)}{" "}
                <span className="text-xs font-normal text-muted">
                  ({c.payments.length} payment
                  {c.payments.length === 1 ? "" : "s"}
                  {c.payments.at(-1)?.paidAt
                    ? `, last ${formatDateTime(new Date(c.payments.at(-1)!.paidAt!))}`
                    : ""}
                  )
                </span>
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Assigned to</dt>
              <dd>
                <select
                  value={c.assignedTo ?? ""}
                  onChange={(e) =>
                    run(() =>
                      updateCase(
                        c,
                        { assignedTo: e.target.value || null },
                        staff.email,
                      ),
                    )
                  }
                  className="mt-0.5 h-9 w-full rounded-lg border border-line bg-white px-2 text-sm text-plum"
                >
                  <option value="">Unassigned</option>
                  {[
                    ...team,
                    ...(team.some((t) => t.email === staff.email)
                      ? []
                      : [
                          {
                            email: staff.email,
                            name: staff.name,
                            role: staff.role,
                          },
                        ]),
                  ].map((t) => (
                    <option key={t.email} value={t.email}>
                      {t.name}
                    </option>
                  ))}
                  {c.assignedTo &&
                    !team.some((t) => t.email === c.assignedTo) &&
                    c.assignedTo !== staff.email && (
                      <option value={c.assignedTo}>{c.assignedTo}</option>
                    )}
                </select>
              </dd>
            </div>
          </dl>
        </Section>

        {c.intake && (
          <RequirementsBox
            intake={c.intake}
            people={people}
            // Sales submits it; servicing, managers and admins can edit it here.
            onSave={
              canEditForm
                ? async (v) => {
                    if (!demo) await saveIntake(c, v);
                  }
                : undefined
            }
          />
        )}

        {needsForm(c) && !canFillForm && (
          <section className="rounded-[18px] bg-[#fff8e8] p-4 ring-1 ring-[#f1dca8]">
            <h3 className="text-sm font-bold text-plum">
              Waiting for the sales team
            </h3>
            <p className="mt-0.5 text-sm text-plum">
              The sales team fills in the Servicing form on{" "}
              {c.customer.name ? `${c.customer.name}'s` : "this customer's"}{" "}
              enquiry. The steps below unlock as soon as it&apos;s in, with all
              their requirements.
            </p>
          </section>
        )}

        {needsForm(c) && canFillForm && (
          <Section
            title="Servicing form"
            hint="Usually filled by the sales team on the enquiry. As a manager or admin you can fill it here (e.g. the customer paid without an enquiry). The steps below unlock once it's in."
          >
            <ServicingForm
              compact
              initial={emptyForm({
                customerName: c.customer.name ?? "",
                customerPhone: c.customer.phone.slice(-10),
                careType: guessCareType(c.careType),
                location: c.area ?? "",
                amountPaid: c.totalPaid > 0 ? String(c.totalPaid) : "",
              })}
              submitLabel="Submit form"
              onSubmit={async (v) => {
                if (!demo) await saveIntake(c, v);
              }}
            />
          </Section>
        )}

        {/* Steps 1–4 stay locked until the Servicing form is in. */}
        <div
          className={`space-y-5 ${needsForm(c) ? "pointer-events-none select-none opacity-45" : ""}`}
          inert={needsForm(c)}
          aria-disabled={needsForm(c) || undefined}
        >
          {/* Step 1 */}
          <Section
            title="1 · Profiles shared"
            hint="Pick nannies to send the customer. Share them on WhatsApp for now; they'll also appear in the customer app."
            action={
              c.proposals.length > 0 && (
                <div className="flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => share(c.proposals)}
                    className="inline-flex h-8 items-center gap-1.5 rounded-full bg-[#1f9d55] px-3 text-xs font-semibold text-white hover:bg-[#188247]"
                  >
                    <MessageCircle className="size-3.5" aria-hidden="true" />
                    {`Send ${c.proposals.length === 1 ? "profile card" : `${c.proposals.length} profile cards`}`}
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      await navigator.clipboard
                        ?.writeText(whatsappText)
                        .catch(() => undefined);
                      setCopied(true);
                      window.setTimeout(() => setCopied(false), 1500);
                    }}
                    className="inline-flex h-8 items-center gap-1.5 rounded-full bg-white px-3 text-xs font-semibold text-plum ring-1 ring-line hover:bg-milk"
                  >
                    {copied ? (
                      <Check className="size-3.5" aria-hidden="true" />
                    ) : (
                      <ClipboardCopy className="size-3.5" aria-hidden="true" />
                    )}
                    {copied ? "Copied" : "Copy text"}
                  </button>
                </div>
              )
            }
          >
            {c.intake && (
              <p className="mb-2 rounded-lg bg-[#f4f0fe] px-3 py-2 text-xs text-[#4a2fb0]">
                <span className="font-semibold">Looking for:</span>{" "}
                {requirementLine(c.intake)}
              </p>
            )}
            <NannyPicker
              nannies={nannies}
              exclude={new Set(c.proposals.map((p) => p.nannyId))}
              careType={c.careType}
              onAdd={(picked) =>
                setProposals([
                  ...c.proposals,
                  ...picked.map((n) => newProposal(n, staff.email)),
                ])
              }
              disabled={busy || c.stage === "placed"}
            />
          </Section>

          {/* Step 2 */}
          <Section
            title="2 · Shortlist and interviews"
            hint="Tick who the customer shortlisted, schedule interviews and record the result."
          >
            {!c.proposals.length ? (
              <p className="text-sm text-muted">No profiles shared yet.</p>
            ) : (
              <ul className="space-y-3">
                {c.proposals.map((p) => (
                  <ProposalRow
                    key={p.nannyId}
                    p={p}
                    current={byId.get(p.nannyId)}
                    placed={c.placement?.nannyId === p.nannyId}
                    disabled={busy}
                    onShare={() => share([p])}
                    onPatch={(patch) => patchProposal(p.nannyId, patch)}
                    onRemove={async () => {
                      const started =
                        p.interviewAt || p.outcome || p.shortlisted;
                      if (
                        started &&
                        !(await confirmDialog({
                          title: `Remove ${p.nanny.name}?`,
                          message:
                            "Her shortlist, interview and feedback on this case will be lost.",
                          confirmLabel: "Remove",
                          danger: true,
                        }))
                      )
                        return;
                      setProposals(
                        c.proposals.filter((x) => x.nannyId !== p.nannyId),
                      );
                    }}
                  />
                ))}
              </ul>
            )}
          </Section>

          {/* Step 3 */}
          <Section
            title="3 · Placement"
            hint="When the customer approves a nanny, place her at the site. She's then shown in the customer app."
          >
            <PlacementBox
              c={c}
              byId={byId}
              disabled={busy}
              onPlace={(n, start, address) =>
                run(() => placeNanny(c, n, start, address, staff.email))
              }
              onUndo={() => run(() => unplace(c, staff.email))}
            />
          </Section>

          {/* Step 4 */}
          <Section
            title="4 · Travel and arrival"
            hint="Is she travelling to the family? Add the ticket, then mark when she reaches the PG and when she's based at the customer's."
          >
            {c.placement ? (
              <TravelBox
                key={c.placement.nannyId}
                c={c}
                disabled={busy}
                onSave={(travel) =>
                  run(() =>
                    updateCase(
                      c,
                      {
                        travel: travel
                          ? { ...travel, updatedBy: staff.email }
                          : null,
                      },
                      staff.email,
                    ),
                  )
                }
                newTravel={(t) => emptyTravel(t, staff.email)}
              />
            ) : (
              <p className="text-sm text-muted">
                Place a nanny in step 3 first.
              </p>
            )}
          </Section>
        </div>

        <NotesBox caseId={c.id} staff={staff} people={people} demo={demo} />

        {/* Hold / cancel */}
        {cancelling ? (
          <CancelForm
            c={c}
            disabled={busy}
            onCancel={() => setCancelling(false)}
            onConfirm={(input) =>
              run(async () => {
                await cancelCase(c, input, staff.email);
              }).then(() => setCancelling(false))
            }
          />
        ) : null}
        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4 text-sm">
          {c.stage === "on_hold" || c.stage === "cancelled" ? (
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                if (c.cancellation && liveCfRefunds(c.cancellation.refund).length) {
                  await confirmDialog({
                    title: "Can't reopen this case",
                    message:
                      "A refund has been sent to Cashfree for this case. Open a new case for the customer instead.",
                    confirmLabel: "OK",
                  });
                  return;
                }
                if (
                  c.cancellation?.refund.status === "processed" &&
                  !(await confirmDialog({
                    title: "Reopen this case?",
                    message:
                      "This customer has already been refunded. Reopening clears the cancellation record.",
                    confirmLabel: "Reopen",
                  }))
                )
                  return;
                run(() => reopenCase(c, staff.email));
              }}
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-white px-3.5 font-semibold text-plum ring-1 ring-line"
            >
              <Undo2 className="size-4" aria-hidden="true" /> Reopen case
            </button>
          ) : (
            !cancelling && (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    run(() => updateCase(c, { stage: "on_hold" }, staff.email))
                  }
                  className="h-9 rounded-full bg-white px-3.5 font-semibold text-plum ring-1 ring-line"
                >
                  Put on hold
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setCancelling(true)}
                  className="h-9 rounded-full px-3.5 font-semibold text-red-700 hover:bg-red-50"
                >
                  Cancel case
                </button>
              </>
            )
          )}
          {busy && <span className="text-xs text-muted">Saving…</span>}
          {error && <span className="text-xs text-red-700">{error}</span>}
        </div>
        <UpdatedBy by={c.updatedBy} at={toDate(c.updatedAt)} people={people} />
      </div>
      {shareItems && (
        <ProfileShareDialog
          items={shareItems}
          customer={{ name: c.customer.name, phone: c.customer.phone }}
          demo={demo}
          onClose={() => setShareItems(null)}
        />
      )}
    </SidePanel>
  );
}

/** "Day Nanny · joins 20 Nov · 30-40 yrs · Hindi, Kannada · 9 Hrs from 09:00 · ISRO Layout" */
function requirementLine(r: Intake) {
  return [
    r.careType,
    r.joiningDate ? `joins ${formatDay(r.joiningDate)}` : null,
    r.nannyAge?.length ? `${r.nannyAge.join(", ")} yrs` : null,
    r.languages?.length ? r.languages.join(", ") : null,
    r.workingHours
      ? `${r.workingHours}${r.startTime ? ` from ${formatTime(r.startTime)}` : ""}`
      : null,
    r.location || null,
  ]
    .filter(Boolean)
    .join(" · ");
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
/** "2026-11-20" → "20 Nov 2026" */
function formatDay(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  return y && m && d ? `${d} ${MONTHS[m - 1]} ${y}` : ymd;
}
/** "14:30" → "2:30 PM" */
function formatTime(hm: string) {
  const [h, m] = hm.split(":").map(Number);
  if (h === undefined || m === undefined || Number.isNaN(h)) return hm;
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

/**
 * Everything the sales team recorded in the Servicing form, laid out for the
 * servicing team to match a nanny. Editable (e.g. the family changes a detail).
 */
function RequirementsBox({
  intake,
  people,
  onSave,
}: {
  intake: Intake;
  people: StaffMember[];
  /** Missing when this person can't edit the form (read-only). */
  onSave?: (v: ServicingFormValue) => Promise<void>;
}) {
  const edited =
    intake.editedAt instanceof Date
      ? intake.editedAt
      : (intake.editedAt?.toDate?.() ?? null);
  const [editing, setEditing] = useState(false);
  const at =
    intake.submittedAt instanceof Date
      ? intake.submittedAt
      : (intake.submittedAt?.toDate?.() ?? null);
  if (editing)
    return (
      <Section
        title="Requirements"
        hint="Edit the Servicing form. Changes are saved to this case."
      >
        <ServicingForm
          compact
          initial={formInputFromValue(intake)}
          submitLabel="Save requirements"
          onSubmit={async (v) => {
            await onSave?.(v);
            setEditing(false);
          }}
        />
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="mt-2 text-xs font-semibold text-muted hover:text-plum"
        >
          Cancel
        </button>
      </Section>
    );

  const chips = (items: string[] | undefined) =>
    items?.length ? (
      <span className="flex flex-wrap gap-1">
        {items.map((x) => (
          <span
            key={x}
            className="rounded-full bg-[#ece6fb] px-2 py-0.5 text-xs font-semibold text-[#5b3cc4]"
          >
            {x}
          </span>
        ))}
      </span>
    ) : null;
  const rows: [string, ReactNode][] = [
    ["Care type", intake.careType],
    ["Joining date", intake.joiningDate ? formatDay(intake.joiningDate) : null],
    ["Nanny age", chips(intake.nannyAge?.map((a) => `${a} yrs`))],
    ["Languages", chips(intake.languages)],
    ["Working hours", intake.workingHours],
    ["Start time", intake.startTime ? formatTime(intake.startTime) : null],
    ["Baby age", intake.babyAge],
    ["Location", intake.location],
    ["City", intake.city],
    [
      "Payment",
      [
        intake.payment,
        typeof intake.amountPaid === "number" ? inr(intake.amountPaid) : null,
      ]
        .filter(Boolean)
        .join(" · "),
    ],
    [
      "Alternate number",
      intake.altPhone ? displayPhone(intake.altPhone) : null,
    ],
    ["Source", intake.source ?? null],
  ];
  return (
    <Section
      title="Requirements"
      hint={`From the Servicing form, submitted${at ? ` ${formatDateTime(at)}` : ""}${intake.submittedBy ? ` by ${staffName(intake.submittedBy, people)}` : ""}.`}
      action={
        onSave && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="h-8 rounded-full bg-white px-3 text-xs font-semibold text-plum ring-1 ring-line hover:bg-milk"
          >
            Edit
          </button>
        )
      }
    >
      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        {rows
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <div key={k} className="min-w-0">
              <dt className="text-xs text-muted">{k}</dt>
              <dd className="mt-0.5 break-words text-sm font-medium text-plum">
                {v}
              </dd>
            </div>
          ))}
      </dl>
      {intake.specificRequirement && (
        <div className="mt-3 rounded-xl bg-[#fff8e8] px-3 py-2.5 ring-1 ring-[#f1dca8]">
          <p className="text-xs font-semibold text-[#7a5410]">
            Specific requirement
          </p>
          <p className="mt-0.5 whitespace-pre-line text-sm text-plum">
            {intake.specificRequirement}
          </p>
        </div>
      )}
      <UpdatedBy
        by={intake.editedBy}
        at={edited}
        people={people}
        label="Last edited by"
        className="mt-3"
      />
    </Section>
  );
}

function Section({
  title,
  hint,
  action,
  children,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[18px] border border-line bg-paper p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-plum">{title}</h3>
          {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
        </div>
        {action}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function EditableRow({
  label,
  value,
  onSave,
}: {
  label: string;
  value: string | null;
  onSave: (v: string) => void;
}) {
  const [v, setV] = useState(value ?? "");
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd>
        <input
          value={v}
          onChange={(e) => setV(e.target.value)}
          onBlur={() => v.trim() !== (value ?? "") && onSave(v.trim())}
          placeholder="—"
          className="mt-0.5 h-9 w-full rounded-lg border border-transparent bg-transparent px-2 text-sm text-plum hover:border-line focus:border-plum focus:bg-white focus:outline-none"
        />
      </dd>
    </div>
  );
}

/* ---- step 1: multi-select dropdown ---- */

function NannyPicker({
  nannies,
  exclude,
  careType,
  onAdd,
  disabled,
}: {
  nannies: Nanny[];
  exclude: Set<string>;
  careType: string | null;
  onAdd: (n: Nanny[]) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [showAll, setShowAll] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const wantsLiveIn = /live/i.test(careType ?? "");

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) =>
      !root.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const options = useMemo(() => {
    const s = q.trim().toLowerCase();
    return nannies
      .filter((n) => !exclude.has(n.id))
      .filter(
        (n) =>
          showAll || n.status === "available" || n.status === "interviewing",
      )
      .filter(
        (n) =>
          !s ||
          [
            n.name,
            n.area ?? "",
            n.city ?? "",
            n.role ?? "",
            n.phone ?? "",
            ...n.languages,
            ...n.skills,
          ].some((x) => x.toLowerCase().includes(s)),
      )
      .sort((a, b) => {
        // Suggest a matching work type first, then available before interviewing.
        const fit = (n: Nanny) =>
          careType
            ? wantsLiveIn
              ? n.workType !== "day"
              : n.workType !== "live_in"
            : true;
        return (
          Number(fit(b)) - Number(fit(a)) ||
          Number(b.status === "available") - Number(a.status === "available") ||
          a.name.localeCompare(b.name)
        );
      });
  }, [nannies, exclude, q, showAll, careType, wantsLiveIn]);

  const toggle = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  return (
    <div ref={root} className="relative">
      <div className="flex gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex h-11 flex-1 items-center justify-between rounded-xl border border-line bg-white px-3 text-left text-sm text-plum disabled:opacity-50"
        >
          <span className={picked.length ? "font-semibold" : "text-muted"}>
            {picked.length
              ? `${picked.length} selected: ${picked.map((id) => nannies.find((n) => n.id === id)?.name).join(", ")}`
              : "Select nannies to share…"}
          </span>
          <Plus className="size-4 shrink-0 text-muted" aria-hidden="true" />
        </button>
        <button
          type="button"
          disabled={!picked.length || disabled}
          onClick={() => {
            onAdd(
              picked
                .map((id) => nannies.find((n) => n.id === id)!)
                .filter(Boolean),
            );
            setPicked([]);
            setOpen(false);
          }}
          className="h-11 rounded-xl bg-plum px-4 text-sm font-semibold text-milk disabled:opacity-40"
        >
          Add {picked.length || ""}
        </button>
      </div>
      {open && (
        <div className="absolute inset-x-0 z-20 mt-1.5 overflow-hidden rounded-xl border border-line bg-white shadow-lift">
          <div className="flex items-center gap-2 border-b border-line p-2">
            <Search className="ml-1 size-4 text-muted" aria-hidden="true" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Name, area, city, language, skill"
              className="h-9 flex-1 bg-transparent text-sm text-plum outline-none"
            />
            <label className="flex shrink-0 items-center gap-1.5 text-xs text-muted">
              <input
                type="checkbox"
                checked={showAll}
                onChange={(e) => setShowAll(e.target.checked)}
                className="size-3.5 accent-plum"
              />
              Include placed / on leave
            </label>
          </div>
          <ul
            role="listbox"
            aria-multiselectable="true"
            className="max-h-[320px] overflow-y-auto py-1"
          >
            {!options.length && (
              <li className="px-4 py-6 text-center text-sm text-muted">
                No nannies match.
              </li>
            )}
            {options.map((n) => {
              const on = picked.includes(n.id);
              return (
                <li
                  key={n.id}
                  role="option"
                  aria-selected={on}
                  onClick={() => toggle(n.id)}
                  className={`flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-milk ${on ? "bg-milk/70" : ""}`}
                >
                  <span
                    className={`grid size-5 shrink-0 place-items-center rounded border ${on ? "border-plum bg-plum text-milk" : "border-line bg-white"}`}
                  >
                    {on && <Check className="size-3.5" aria-hidden="true" />}
                  </span>
                  <NannyAvatar name={n.name} photoUrl={n.photoUrl} size={34} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-plum">
                      {n.name}
                    </p>
                    <p className="truncate text-xs text-muted">
                      {[
                        n.role,
                        n.age ? `${n.age} yrs` : null,
                        n.experienceYears !== null
                          ? `${n.experienceYears} yrs exp`
                          : null,
                        n.workType ? WORK_TYPE_LABEL[n.workType] : null,
                        nannyPlace(n),
                        n.languages.join(", ") || null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[0.68rem] font-semibold ${NANNY_STATUS_META[n.status].tone}`}
                  >
                    {NANNY_STATUS_META[n.status].label}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

/* ---- step 2 ---- */

function ProposalRow({
  p,
  current,
  placed,
  disabled,
  onShare,
  onPatch,
  onRemove,
}: {
  p: Proposal;
  current: Nanny | undefined;
  placed: boolean;
  disabled: boolean;
  onShare: () => void;
  onPatch: (patch: Partial<Proposal>) => void;
  onRemove: () => void;
}) {
  const [when, setWhen] = useState(
    toLocalInput(p.interviewAt ? p.interviewAt.toDate() : null),
  );
  const [note, setNote] = useState(p.outcomeNote ?? "");
  const savedWhen = toLocalInput(p.interviewAt ? p.interviewAt.toDate() : null);
  const whenChanged = when !== savedWhen;
  /** Saves the interview time. A future time is "scheduled"; a past one keeps its status. */
  const saveWhen = () => {
    const d = fromLocalInput(when);
    const status: Proposal["interviewStatus"] = !d
      ? null
      : d > new Date()
        ? "scheduled"
        : (p.interviewStatus ?? "scheduled");
    onPatch({
      interviewAt: d ? Timestamp.fromDate(d) : null,
      interviewStatus: status,
      shortlisted: d ? true : p.shortlisted,
    });
  };
  return (
    <li className="relative rounded-2xl bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] ring-1 ring-line">
      <div className="absolute right-3 top-3 flex items-center gap-1">
        <button
          type="button"
          onClick={onShare}
          title="Her profile card for WhatsApp"
          className="inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold text-[#1a7f45] transition-colors hover:bg-[#e7f6ec]"
        >
          <MessageCircle className="size-3.5" aria-hidden="true" />
          Send
        </button>
        {!placed && (
          <button
            type="button"
            disabled={disabled}
            onClick={onRemove}
            aria-label={`Remove ${p.nanny.name}`}
            title="Remove profile"
            className="grid size-8 place-items-center rounded-full text-muted transition-colors hover:bg-red-50 hover:text-red-700 disabled:opacity-40"
          >
            <Trash2 className="size-4" aria-hidden="true" />
          </button>
        )}
      </div>
      <div className="flex items-start gap-3 pr-28">
        <NannyAvatar
          name={p.nanny.name}
          photoUrl={p.nanny.photoUrl}
          size={40}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-plum">{p.nanny.name}</p>
            {placed && (
              <span className="rounded-full bg-[#dcefe1] px-2 py-0.5 text-[0.68rem] font-semibold text-success">
                Placed
              </span>
            )}
            {p.outcome === "approved" && !placed && (
              <span className="rounded-full bg-[#ece6fb] px-2 py-0.5 text-[0.68rem] font-semibold text-[#5b3cc4]">
                Approved
              </span>
            )}
            {p.outcome === "rejected" && (
              <span className="rounded-full bg-beige px-2 py-0.5 text-[0.68rem] font-semibold text-muted">
                Not selected
              </span>
            )}
            {current && current.status !== "available" && !placed && (
              <span
                className={`rounded-full px-2 py-0.5 text-[0.68rem] font-semibold ${NANNY_STATUS_META[current.status].tone}`}
              >
                Now {NANNY_STATUS_META[current.status].label.toLowerCase()}
              </span>
            )}
          </div>
          <p className="truncate text-xs text-muted">
            {nannySummary(p.nanny).replace(`${p.nanny.name} · `, "")}
          </p>
          {current?.phone && (
            <p className="text-xs tabular-nums text-muted">
              Nanny: {displayPhone(current.phone)}
            </p>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            <label className="inline-flex h-9 items-center gap-2 rounded-lg bg-white px-3 ring-1 ring-line">
              <input
                type="checkbox"
                checked={p.shortlisted}
                disabled={disabled}
                onChange={(e) => onPatch({ shortlisted: e.target.checked })}
                className="size-4 accent-plum"
              />
              Shortlisted
            </label>
            <input
              type="datetime-local"
              aria-label={`Interview with ${p.nanny.name}`}
              value={when}
              disabled={disabled}
              onChange={(e) => setWhen(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && whenChanged && saveWhen()}
              className="h-9 rounded-lg border border-line bg-white px-2 text-plum"
            />
            {whenChanged && (
              <>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={saveWhen}
                  className="inline-flex h-9 items-center gap-1.5 rounded-full bg-plum px-3.5 text-xs font-semibold text-milk disabled:opacity-40"
                >
                  <Check className="size-3.5" aria-hidden="true" /> Done
                </button>
                <button
                  type="button"
                  onClick={() => setWhen(savedWhen)}
                  className="h-9 rounded-full px-2 text-xs font-semibold text-muted hover:text-plum"
                >
                  Cancel
                </button>
              </>
            )}
            {p.interviewAt && (
              <select
                aria-label="Interview status"
                value={p.interviewStatus ?? "scheduled"}
                disabled={disabled}
                onChange={(e) =>
                  onPatch({
                    interviewStatus: e.target
                      .value as Proposal["interviewStatus"],
                  })
                }
                className="h-9 rounded-lg border border-line bg-white px-2 text-plum"
              >
                <option value="scheduled">Interview scheduled</option>
                <option value="done">Interview done</option>
                <option value="cancelled">Interview cancelled</option>
              </select>
            )}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            <button
              type="button"
              disabled={disabled}
              aria-pressed={p.outcome === "approved"}
              onClick={() =>
                onPatch({
                  outcome: p.outcome === "approved" ? null : "approved",
                  shortlisted: true,
                  interviewStatus: p.interviewAt ? "done" : p.interviewStatus,
                })
              }
              className={`h-8 rounded-full px-3 text-xs font-semibold ${p.outcome === "approved" ? "bg-[#5b3cc4] text-white" : "bg-white text-plum ring-1 ring-line"}`}
            >
              Customer approved
            </button>
            <button
              type="button"
              disabled={disabled}
              aria-pressed={p.outcome === "rejected"}
              onClick={() =>
                onPatch({
                  outcome: p.outcome === "rejected" ? null : "rejected",
                })
              }
              className={`h-8 rounded-full px-3 text-xs font-semibold ${p.outcome === "rejected" ? "bg-muted text-white" : "bg-white text-plum ring-1 ring-line"}`}
            >
              Not selected
            </button>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onBlur={() =>
                note.trim() !== (p.outcomeNote ?? "") &&
                onPatch({ outcomeNote: note.trim() || null })
              }
              placeholder="Feedback (optional)"
              className="h-8 min-w-[160px] flex-1 rounded-lg border border-line bg-white px-2 text-xs text-plum"
            />
          </div>
        </div>
      </div>
    </li>
  );
}

/* ---- step 3 ---- */

function PlacementBox({
  c,
  byId,
  disabled,
  onPlace,
  onUndo,
}: {
  c: ServicingCase;
  byId: Map<string, Nanny>;
  disabled: boolean;
  onPlace: (n: Nanny, startDate: string, address: string) => void;
  onUndo: () => void;
}) {
  const approved = c.proposals.filter((p) => p.outcome === "approved");
  const [nannyId, setNannyId] = useState(approved[0]?.nannyId ?? "");
  const [start, setStart] = useState(localISODate(new Date()));
  const [address, setAddress] = useState(c.placement?.siteAddress ?? "");
  const [changing, setChanging] = useState(false);

  if (c.placement && !changing) {
    const pl = c.placement;
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-xl bg-white p-3 ring-1 ring-line">
        <NannyAvatar
          name={pl.nanny.name}
          photoUrl={pl.nanny.photoUrl}
          size={44}
        />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-plum">{pl.nanny.name}</p>
          <p className="text-xs text-muted">
            Started {pl.startDate}
            {pl.siteAddress ? ` · ${pl.siteAddress}` : ""}
          </p>
          <p className="text-xs text-muted">
            {c.bookingId
              ? "Shown in the customer app."
              : "Will show in the customer app once it reads servicing cases."}
          </p>
        </div>
        <button
          type="button"
          disabled={disabled}
          onClick={() => setChanging(true)}
          className="h-9 rounded-full bg-white px-3.5 text-sm font-semibold text-plum ring-1 ring-line"
        >
          Replace nanny
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={async () =>
            (await confirmDialog({
              title: `Undo ${pl.nanny.name}'s placement?`,
              message:
                "She becomes available again, and any travel details on this case are cleared.",
              confirmLabel: "Undo placement",
              danger: true,
            })) && onUndo()
          }
          className="h-9 rounded-full px-3 text-sm font-semibold text-red-700 hover:bg-red-50"
        >
          Undo
        </button>
      </div>
    );
  }

  const candidates = (changing ? c.proposals : approved).filter(
    (p) => p.nannyId !== c.placement?.nannyId,
  );
  if (!candidates.length)
    return (
      <p className="text-sm text-muted">
        Mark a nanny as “Customer approved” in step 2 to place her.
      </p>
    );
  const chosen = byId.get(nannyId) ?? byId.get(candidates[0]!.nannyId);
  return (
    <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
      <select
        value={chosen?.id ?? ""}
        onChange={(e) => setNannyId(e.target.value)}
        aria-label="Nanny to place"
        className="h-10 rounded-lg border border-line bg-white px-2 text-sm text-plum"
      >
        {candidates.map((p) => (
          <option key={p.nannyId} value={p.nannyId}>
            {p.nanny.name}
            {p.outcome === "approved" ? " (approved)" : ""}
          </option>
        ))}
      </select>
      <input
        type="date"
        aria-label="Start date"
        value={start}
        onChange={(e) => setStart(e.target.value)}
        className="h-10 rounded-lg border border-line bg-white px-2 text-sm text-plum"
      />
      <input
        value={address}
        onChange={(e) => setAddress(e.target.value)}
        placeholder="Site address (where she'll work)"
        className="h-10 rounded-lg border border-line bg-white px-3 text-sm text-plum sm:col-span-2"
      />
      {!chosen && (
        <p className="text-xs text-red-700 sm:col-span-2">
          This nanny isn&apos;t in the nanny list any more.
        </p>
      )}
      <div className="flex gap-2 sm:col-span-2">
        <button
          type="button"
          disabled={disabled || !chosen || !start}
          onClick={() => {
            if (chosen) onPlace(chosen, start, address);
            setChanging(false);
          }}
          className="h-10 flex-1 rounded-full bg-success px-4 text-sm font-semibold text-white disabled:opacity-50"
        >
          Place {chosen?.name ?? "nanny"} on {start}
        </button>
        {changing && (
          <button
            type="button"
            onClick={() => setChanging(false)}
            className="h-10 rounded-full px-4 text-sm font-semibold text-plum"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

/* ---- step 4 ---- */

const pillBtn = (on: boolean) =>
  `h-9 rounded-full px-4 text-sm font-semibold ${on ? "bg-plum text-milk" : "bg-white text-plum ring-1 ring-line hover:bg-milk"}`;

function TravelBox({
  c,
  disabled,
  onSave,
  newTravel,
}: {
  c: ServicingCase;
  disabled: boolean;
  onSave: (t: Travel | null) => void;
  newTravel: (travelling: boolean) => Travel;
}) {
  const t = c.travel;
  const name = c.placement?.nanny.name.split(" ")[0] ?? "She";
  const [ticket, setTicket] = useState({
    mode: t?.mode ?? "",
    ticketNumber: t?.ticketNumber ?? "",
    fromCity: t?.fromCity ?? "",
    departAt: toLocalInput(t?.departAt ? t.departAt.toDate() : null),
    arriveAt: toLocalInput(t?.arriveAt ? t.arriveAt.toDate() : null),
    ticketNote: t?.ticketNote ?? "",
  });
  const ts = (v: string) => {
    const d = fromLocalInput(v);
    return d ? Timestamp.fromDate(d) : null;
  };
  const ticketSaved =
    !!t &&
    (t.mode ?? "") === ticket.mode &&
    (t.ticketNumber ?? "") === ticket.ticketNumber.trim() &&
    (t.fromCity ?? "") === ticket.fromCity.trim() &&
    toLocalInput(t.departAt ? t.departAt.toDate() : null) === ticket.departAt &&
    toLocalInput(t.arriveAt ? t.arriveAt.toDate() : null) === ticket.arriveAt &&
    (t.ticketNote ?? "") === ticket.ticketNote.trim();
  const hasTicket = !!(t?.ticketNumber || t?.mode || t?.arriveAt);
  const set = (patch: Partial<Travel>) => t && onSave({ ...t, ...patch });
  /** Ticket (another city) and ride (within Bengaluru) details don't carry over, so switching clears them. */
  const switchScope = async (scope: "inter_city" | "intra_city") => {
    if (!t) return onSave({ ...newTravel(true), scope });
    if (t.scope === scope) return;
    const what = t.scope === "inter_city" ? "ticket" : "ride";
    if (
      hasTicket &&
      !(await confirmDialog({
        title: `Switch to ${scope === "inter_city" ? "inter-city" : "intra-city"}?`,
        message: `The ${what} details you saved will be cleared.`,
        confirmLabel: "Switch",
        danger: true,
      }))
    )
      return;
    set({
      scope,
      travelling: true,
      mode: null,
      ticketNumber: null,
      fromCity: null,
      departAt: null,
      arriveAt: null,
      ticketNote: null,
      ...(scope === "intra_city" ? { reachedPgAt: null } : {}),
    });
    setTicket({
      mode: "",
      ticketNumber: "",
      fromCity: "",
      departAt: "",
      arriveAt: "",
      ticketNote: "",
    });
  };
  const inter = t?.scope === "inter_city";

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-semibold text-muted">
          Where is {name} travelling from?
        </p>
        <div className="mt-1.5 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={disabled}
            aria-pressed={t?.scope === "inter_city"}
            onClick={() => switchScope("inter_city")}
            className={pillBtn(t?.scope === "inter_city")}
          >
            Inter-city (another city)
          </button>
          <button
            type="button"
            disabled={disabled}
            aria-pressed={t?.scope === "intra_city"}
            onClick={() => switchScope("intra_city")}
            className={pillBtn(t?.scope === "intra_city")}
          >
            Intra-city (within Bengaluru)
          </button>
        </div>
      </div>

      {t?.scope && (
        <>
          {t.scope && (
            <div className="rounded-2xl bg-white p-4 ring-1 ring-line">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-plum">
                {inter ? (
                  <Ticket className="size-4" aria-hidden="true" />
                ) : (
                  <Car className="size-4" aria-hidden="true" />
                )}{" "}
                {inter ? "Ticket" : "Ride booking"}
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <label className="text-xs text-muted">
                  Mode
                  <select
                    value={ticket.mode}
                    onChange={(e) =>
                      setTicket({ ...ticket, mode: e.target.value })
                    }
                    className="mt-1 h-10 w-full rounded-lg border border-line bg-white px-2 text-sm text-plum"
                  >
                    <option value="">Select…</option>
                    {TRAVEL_MODES[t.scope].map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs text-muted">
                  {inter
                    ? "Ticket / PNR number"
                    : "Booking ID or vehicle number"}
                  <input
                    value={ticket.ticketNumber}
                    onChange={(e) =>
                      setTicket({ ...ticket, ticketNumber: e.target.value })
                    }
                    maxLength={60}
                    placeholder={
                      inter ? "e.g. 4521873390" : "e.g. KA 01 AB 1234"
                    }
                    className="mt-1 h-10 w-full rounded-lg border border-line bg-white px-3 text-sm text-plum"
                  />
                </label>
                <label className="text-xs text-muted">
                  {inter ? "From city" : "Pickup area"}
                  <input
                    value={ticket.fromCity}
                    onChange={(e) =>
                      setTicket({ ...ticket, fromCity: e.target.value })
                    }
                    maxLength={80}
                    placeholder={inter ? "e.g. Kolkata" : "e.g. Yelahanka"}
                    className="mt-1 h-10 w-full rounded-lg border border-line bg-white px-3 text-sm text-plum"
                  />
                </label>
                <span className="hidden sm:block" />
                <label className="text-xs text-muted">
                  {inter ? "Departs" : "Pickup time"}
                  <input
                    type="datetime-local"
                    value={ticket.departAt}
                    onChange={(e) =>
                      setTicket({ ...ticket, departAt: e.target.value })
                    }
                    className="mt-1 h-10 w-full rounded-lg border border-line bg-white px-2 text-sm text-plum"
                  />
                </label>
                <label className="text-xs text-muted">
                  {inter ? "Arrives" : "Expected arrival"}
                  <input
                    type="datetime-local"
                    value={ticket.arriveAt}
                    onChange={(e) =>
                      setTicket({ ...ticket, arriveAt: e.target.value })
                    }
                    className="mt-1 h-10 w-full rounded-lg border border-line bg-white px-2 text-sm text-plum"
                  />
                </label>
                <label className="text-xs text-muted sm:col-span-2">
                  Notes
                  <input
                    value={ticket.ticketNote}
                    onChange={(e) =>
                      setTicket({ ...ticket, ticketNote: e.target.value })
                    }
                    maxLength={300}
                    placeholder={
                      inter
                        ? "Train name, coach/seat, who's picking her up…"
                        : "Driver name and number, fare…"
                    }
                    className="mt-1 h-10 w-full rounded-lg border border-line bg-white px-3 text-sm text-plum"
                  />
                </label>
              </div>
              {ticket.arriveAt &&
                ticket.departAt &&
                ticket.arriveAt < ticket.departAt && (
                  <p className="mt-2 text-xs text-red-700">
                    Arrival is before departure.
                  </p>
                )}
              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  disabled={
                    disabled ||
                    ticketSaved ||
                    (!!ticket.arriveAt &&
                      !!ticket.departAt &&
                      ticket.arriveAt < ticket.departAt)
                  }
                  onClick={() =>
                    set({
                      mode: (ticket.mode || null) as Travel["mode"],
                      ticketNumber: ticket.ticketNumber.trim() || null,
                      fromCity: ticket.fromCity.trim() || null,
                      departAt: ts(ticket.departAt),
                      arriveAt: ts(ticket.arriveAt),
                      ticketNote: ticket.ticketNote.trim() || null,
                    })
                  }
                  className="h-9 rounded-full bg-plum px-4 text-sm font-semibold text-milk disabled:opacity-40"
                >
                  {inter ? "Save ticket" : "Save ride"}
                </button>
                {ticketSaved && hasTicket && (
                  <span className="text-xs text-success">Saved</span>
                )}
              </div>
            </div>
          )}

          {inter && (
            <Checkpoint
              icon={<Building2 className="size-4" aria-hidden="true" />}
              label="Reached PG"
              hint="She's checked in at the HeyNanny PG."
              at={t.reachedPgAt}
              disabled={disabled}
              onMark={(at) => set({ reachedPgAt: at })}
            />
          )}
        </>
      )}

      {t?.scope && (
        <Checkpoint
          icon={<Home className="size-4" aria-hidden="true" />}
          label="Based at customer location"
          hint={
            c.placement?.siteAddress ??
            "She's reached the family and started work."
          }
          at={t.reachedSiteAt}
          disabled={disabled}
          onMark={(at) => set({ reachedSiteAt: at })}
        />
      )}
    </div>
  );
}

/** A tick-off step with the time it happened (defaults to now, editable). */
function Checkpoint({
  icon,
  label,
  hint,
  at,
  disabled,
  onMark,
}: {
  icon: ReactNode;
  label: string;
  hint: string;
  at: Timestamp | null;
  disabled: boolean;
  onMark: (at: Timestamp | null) => void;
}) {
  const [when, setWhen] = useState("");
  const done = !!at;
  return (
    <div
      className={`flex flex-wrap items-center gap-3 rounded-2xl p-3 ring-1 ${done ? "bg-[#eef7f0] ring-[#cfe6d6]" : "bg-white ring-line"}`}
    >
      <span
        className={`grid size-9 shrink-0 place-items-center rounded-full ${done ? "bg-success text-white" : "bg-milk text-plum"}`}
      >
        {done ? <Check className="size-4" aria-hidden="true" /> : icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-plum">{label}</p>
        <p className="truncate text-xs text-muted">
          {done ? formatDateTime(at.toDate()) : hint}
        </p>
      </div>
      {done ? (
        <button
          type="button"
          disabled={disabled}
          onClick={() => onMark(null)}
          className="h-8 rounded-full px-3 text-xs font-semibold text-muted hover:bg-white hover:text-plum"
        >
          Undo
        </button>
      ) : (
        <div className="flex items-center gap-2">
          <input
            type="datetime-local"
            aria-label={`${label} time`}
            value={when}
            disabled={disabled}
            onChange={(e) => setWhen(e.target.value)}
            className="h-9 rounded-lg border border-line bg-white px-2 text-xs text-plum"
          />
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              const d = fromLocalInput(when) ?? new Date();
              onMark(Timestamp.fromDate(d));
            }}
            className="h-9 rounded-full bg-success px-3.5 text-xs font-semibold text-white disabled:opacity-40"
          >
            {when ? "Mark" : "Mark now"}
          </button>
        </div>
      )}
    </div>
  );
}

/* ---- cancellation and refund ---- */

function CancelForm({
  c,
  disabled,
  onCancel,
  onConfirm,
}: {
  c: ServicingCase;
  disabled: boolean;
  onCancel: () => void;
  onConfirm: (input: {
    reason: string;
    note: string;
    refund: "pending" | "not_needed";
    amount: number | null;
  }) => void;
}) {
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [refund, setRefund] = useState<"pending" | "not_needed" | "">(
    c.totalPaid > 0 ? "" : "not_needed",
  );
  const [amount, setAmount] = useState(c.totalPaid ? String(c.totalPaid) : "");
  const amt = Number(amount);
  const amountOk =
    refund !== "pending" ||
    (Number.isFinite(amt) && amt > 0 && amt <= c.totalPaid);
  const ready =
    reason && refund && amountOk && (reason !== "Other" || note.trim());
  return (
    <section className="rounded-[18px] border border-red-200 bg-red-50/40 p-4">
      <h3 className="text-sm font-bold text-plum">Cancel this case</h3>
      <p className="mt-0.5 text-xs text-muted">
        Paid {inr(c.totalPaid)}.
        {c.placement
          ? ` ${c.placement.nanny.name} will be freed and become available again.`
          : ""}
      </p>
      <div className="mt-3 grid gap-3">
        <label className="text-xs text-muted">
          Reason
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="mt-1 h-10 w-full rounded-lg border border-line bg-white px-2 text-sm text-plum"
          >
            <option value="">Select a reason…</option>
            {CANCEL_REASONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-muted">
          Details{reason === "Other" ? "" : " (optional)"}
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
            placeholder="What happened"
            className="mt-1 h-10 w-full rounded-lg border border-line bg-white px-3 text-sm text-plum"
          />
        </label>
        <div>
          <p className="text-xs text-muted">Refund</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <button
              type="button"
              aria-pressed={refund === "pending"}
              onClick={() => setRefund("pending")}
              className={pillBtn(refund === "pending")}
            >
              Refund due
            </button>
            <button
              type="button"
              aria-pressed={refund === "not_needed"}
              onClick={() => setRefund("not_needed")}
              className={pillBtn(refund === "not_needed")}
            >
              No refund
            </button>
            {refund === "pending" && (
              <label className="inline-flex items-center gap-2 text-xs text-muted">
                Amount ₹
                <input
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) =>
                    setAmount(e.target.value.replace(/[^\d.]/g, ""))
                  }
                  aria-label="Refund amount"
                  className="h-9 w-28 rounded-lg border border-line bg-white px-2 text-sm tabular-nums text-plum"
                />
              </label>
            )}
          </div>
          {!amountOk && (
            <p className="mt-1 text-xs text-red-700">
              Enter an amount up to {inr(c.totalPaid)}.
            </p>
          )}
        </div>
      </div>
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          disabled={disabled || !ready}
          onClick={() =>
            onConfirm({
              reason,
              note,
              refund: refund as "pending" | "not_needed",
              amount: refund === "pending" ? Math.round(amt * 100) / 100 : null,
            })
          }
          className="h-9 rounded-full bg-red-700 px-4 text-sm font-semibold text-white disabled:opacity-40"
        >
          Cancel case
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="h-9 rounded-full px-3.5 text-sm font-semibold text-plum"
        >
          Keep case open
        </button>
      </div>
    </section>
  );
}

/** Shown on a cancelled case: the reason, and the refund until it's paid. */
function RefundBox({
  c,
  disabled,
  isAdmin,
  onSave,
  onCashfree,
  notice,
}: {
  c: ServicingCase;
  disabled: boolean;
  isAdmin: boolean;
  onSave: (r: Omit<Refund, "updatedBy">) => void;
  onCashfree: (fn: () => Promise<string | null>) => void;
  notice: { ok: boolean; text: string } | null;
}) {
  const cx = c.cancellation!;
  const r = cx.refund;
  const cfLive = liveCfRefunds(r);
  const viaCashfree = (r.cashfree ?? []).length > 0;
  const [amount, setAmount] = useState(
    r.amount !== null ? String(r.amount) : String(c.totalPaid || ""),
  );
  const [reference, setReference] = useState(r.reference ?? "");
  const [when, setWhen] = useState(localISODate(new Date()));
  const [note, setNote] = useState(r.note ?? "");
  const amt = Number(amount);
  const amountOk = Number.isFinite(amt) && amt > 0 && amt <= c.totalPaid;
  return (
    <section className="rounded-[18px] border border-line bg-paper p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-plum">
            Cancelled · {cx.reason}
          </h3>
          <p className="mt-0.5 text-xs text-muted">
            {formatDateTime(toDate(cx.cancelledAt))}
            {cx.cancelledBy ? ` by ${cx.cancelledBy}` : ""}
            {cx.placedNanny
              ? ` · ${cx.placedNanny} was placed and has been freed`
              : ""}
          </p>
          {cx.note && <p className="mt-1 text-sm text-plum">{cx.note}</p>}
        </div>
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${REFUND_META[r.status].tone}`}
        >
          {REFUND_META[r.status].label}
          {r.amount !== null && r.status !== "not_needed"
            ? ` · ${inr(r.amount)}`
            : ""}
        </span>
      </div>

      {(isAdmin || viaCashfree) &&
        (r.status === "pending" || r.status === "initiated" || viaCashfree) && (
          <CashfreeRefunds
            c={c}
            disabled={disabled}
            isAdmin={isAdmin}
            onCashfree={onCashfree}
          />
        )}
      {notice && (
        <p
          className={`mt-2 text-xs ${notice.ok ? "text-success" : "text-red-700"}`}
        >
          {notice.text}
        </p>
      )}

      {r.status === "processed" ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white p-3 text-sm ring-1 ring-line">
          <p className="text-plum">
            Refunded {r.amount !== null ? inr(r.amount) : ""} on{" "}
            {r.refundedAt
              ? formatDateTime(r.refundedAt.toDate())
                  .split(",")
                  .slice(0, 1)
                  .join("")
              : "—"}
            {r.reference ? (
              <span className="text-muted"> · Ref {r.reference}</span>
            ) : null}
            {r.note ? (
              <span className="block text-xs text-muted">{r.note}</span>
            ) : null}
          </p>
          {!cfLive.length && (
            <button
              type="button"
              disabled={disabled}
              onClick={() =>
                onSave({ ...r, status: "pending", refundedAt: null })
              }
              className="h-8 rounded-full px-3 text-xs font-semibold text-muted hover:text-plum"
            >
              Undo
            </button>
          )}
        </div>
      ) : r.status === "initiated" ? null : r.status === "pending" && cfLive.length ? null : r.status === "pending" ? (
        <div className="mt-3 rounded-xl bg-white p-3 ring-1 ring-line">
          <p className="text-xs text-muted">
            {isAdmin
              ? "Refunded another way (bank transfer, or a payment outside Cashfree)? Record it here."
              : "An admin starts the refund from here. If it was refunded another way, record it here."}
          </p>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            <label className="text-xs text-muted">
              Amount ₹
              <input
                inputMode="decimal"
                value={amount}
                onChange={(e) =>
                  setAmount(e.target.value.replace(/[^\d.]/g, ""))
                }
                className="mt-1 h-9 w-full rounded-lg border border-line bg-white px-2 text-sm tabular-nums text-plum"
              />
            </label>
            <label className="text-xs text-muted">
              Refunded on
              <input
                type="date"
                value={when}
                max={localISODate(new Date())}
                onChange={(e) => setWhen(e.target.value)}
                className="mt-1 h-9 w-full rounded-lg border border-line bg-white px-2 text-sm text-plum"
              />
            </label>
            <label className="text-xs text-muted">
              Cashfree refund ID / UTR
              <input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                maxLength={80}
                className="mt-1 h-9 w-full rounded-lg border border-line bg-white px-2 text-sm text-plum"
              />
            </label>
            <label className="text-xs text-muted sm:col-span-3">
              Note (optional)
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={300}
                className="mt-1 h-9 w-full rounded-lg border border-line bg-white px-2 text-sm text-plum"
              />
            </label>
          </div>
          {!amountOk && (
            <p className="mt-1 text-xs text-red-700">
              Enter an amount up to {inr(c.totalPaid)}.
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={disabled || !amountOk || !when}
              onClick={() =>
                onSave({
                  status: "processed",
                  amount: Math.round(amt * 100) / 100,
                  refundedAt: Timestamp.fromDate(
                    new Date(`${when}T12:00:00+05:30`),
                  ),
                  reference: reference.trim() || null,
                  note: note.trim() || null,
                })
              }
              className="h-9 rounded-full bg-success px-4 text-sm font-semibold text-white disabled:opacity-40"
            >
              Mark refunded
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={async () =>
                (await confirmDialog({
                  title: "No refund for this customer?",
                  message: "The case leaves the Refunds due list.",
                  confirmLabel: "No refund",
                })) && onSave({ ...r, status: "not_needed", amount: null })
              }
              className="h-9 rounded-full px-3.5 text-sm font-semibold text-plum"
            >
              No refund needed
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-2">
          <button
            type="button"
            disabled={disabled}
            onClick={() =>
              onSave({ ...r, status: "pending", amount: c.totalPaid || null })
            }
            className="h-8 rounded-full bg-white px-3 text-xs font-semibold text-plum ring-1 ring-line"
          >
            Refund is due after all
          </button>
        </div>
      )}

    </section>
  );
}

/** Refunds sent through Cashfree from this case; admins can start one. */
function CashfreeRefunds({
  c,
  disabled,
  isAdmin,
  onCashfree,
}: {
  c: ServicingCase;
  disabled: boolean;
  isAdmin: boolean;
  onCashfree: (fn: () => Promise<string | null>) => void;
}) {
  const r = c.cancellation!.refund;
  const list = r.cashfree ?? [];
  const live = liveCfRefunds(r);
  const owed = r.amount ?? c.totalPaid;
  const remaining = Math.max(
    0,
    Math.round((owed - live.reduce((t, e) => t + e.amount, 0)) * 100) / 100,
  );
  const payable = c.payments
    .filter((p) => p.orderId && p.orderId !== "manual")
    .map((p) => ({
      ...p,
      left:
        Math.round(
          (p.amount -
            live
              .filter((e) => e.orderId === p.orderId)
              .reduce((t, e) => t + e.amount, 0)) *
            100,
        ) / 100,
    }))
    .filter((p) => p.left > 0);
  const [orderId, setOrderId] = useState(payable[0]?.orderId ?? "");
  const pay = payable.find((p) => p.orderId === orderId) ?? payable[0];
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState(c.cancellation!.reason);
  const max = pay ? Math.min(remaining, pay.left) : 0;
  const amt = amount === "" ? max : Number(amount);
  const amountOk = Number.isFinite(amt) && amt > 0 && amt <= max;
  const anyOpen = list.some((e) =>
    ["CREATING", "PENDING", "ONHOLD"].includes(e.status),
  );
  const creating = list.some((e) => e.status === "CREATING");
  const canStart =
    isAdmin && r.status === "pending" && remaining > 0 && !creating;

  return (
    <div className="mt-3 rounded-xl bg-white p-3 ring-1 ring-line">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-xs font-bold uppercase tracking-wide text-muted">
          Cashfree refund
        </h4>
        {isAdmin && anyOpen && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => onCashfree(() => syncCaseRefund(c))}
            className="h-8 rounded-full bg-white px-3 text-xs font-semibold text-plum ring-1 ring-line disabled:opacity-40"
          >
            Check status
          </button>
        )}
      </div>

      {list.length > 0 && (
        <ul className="mt-2 space-y-2">
          {list.map((e) => (
            <li
              key={e.refundId}
              className="flex flex-wrap items-start justify-between gap-2 rounded-lg bg-paper px-3 py-2 text-sm"
            >
              <div>
                <p className="font-semibold tabular-nums text-plum">
                  {inr(e.amount)}{" "}
                  <span className="font-mono text-xs font-normal text-muted">
                    {e.refundId}
                  </span>
                </p>
                <p className="text-xs text-muted">
                  {formatDateTime(new Date(e.createdAt))} by {e.createdBy}
                  {e.cfRefundId ? ` · Cashfree ${e.cfRefundId}` : ""}
                  {e.arn ? ` · ARN ${e.arn}` : ""}
                </p>
                {e.error && (
                  <p className="text-xs text-red-700">{e.error}</p>
                )}
              </div>
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-semibold ${CF_REFUND_META[e.status].tone}`}
              >
                {CF_REFUND_META[e.status].label}
              </span>
            </li>
          ))}
        </ul>
      )}

      {!isAdmin && r.status === "pending" && !list.length && (
        <p className="mt-1 text-xs text-muted">
          Only an admin can start a refund.
        </p>
      )}

      {canStart &&
        (payable.length ? (
          <>
            <p className="mt-2 text-xs text-muted">
              {remaining < owed
                ? `${inr(remaining)} still owed of ${inr(owed)}.`
                : `${inr(owed)} owed.`}{" "}
              The money goes back to the customer&apos;s original payment
              method, usually in 5–7 working days.
            </p>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              <label className="text-xs text-muted">
                From payment
                <select
                  value={pay?.orderId ?? ""}
                  onChange={(e) => {
                    setOrderId(e.target.value);
                    setAmount("");
                  }}
                  className="mt-1 h-9 w-full rounded-lg border border-line bg-white px-2 text-sm text-plum"
                >
                  {payable.map((p) => (
                    <option key={p.orderId} value={p.orderId}>
                      {inr(p.amount)}
                      {p.paidAt
                        ? ` · ${formatDateTime(new Date(p.paidAt)).split(",")[0]}`
                        : ""}
                      {p.left < p.amount ? ` (${inr(p.left)} left)` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-muted">
                Amount ₹
                <input
                  inputMode="decimal"
                  value={amount === "" ? String(max) : amount}
                  onChange={(e) =>
                    setAmount(e.target.value.replace(/[^\d.]/g, ""))
                  }
                  className="mt-1 h-9 w-full rounded-lg border border-line bg-white px-2 text-sm tabular-nums text-plum"
                />
              </label>
              <label className="text-xs text-muted">
                Note (sent to Cashfree)
                <input
                  value={note}
                  maxLength={100}
                  onChange={(e) => setNote(e.target.value)}
                  className="mt-1 h-9 w-full rounded-lg border border-line bg-white px-2 text-sm text-plum"
                />
              </label>
            </div>
            {!amountOk && (
              <p className="mt-1 text-xs text-red-700">
                Enter an amount up to {inr(max)}.
              </p>
            )}
            <button
              type="button"
              disabled={disabled || !amountOk || !pay}
              onClick={async () => {
                if (!pay) return;
                const value = Math.round(amt * 100) / 100;
                const ok = await confirmDialog({
                  title: `Refund ${inr(value)} to ${c.customer.name || "this customer"}?`,
                  message: `Cashfree sends ${inr(value)} back to the customer's original payment method (order ${pay.orderId}). This can't be undone once Cashfree processes it.`,
                  confirmLabel: `Refund ${inr(value)}`,
                });
                if (ok)
                  onCashfree(() =>
                    initiateCaseRefund(c, {
                      orderId: pay.orderId,
                      amount: value,
                      note,
                    }),
                  );
              }}
              className="mt-3 h-9 rounded-full bg-plum px-4 text-sm font-semibold text-white disabled:opacity-40"
            >
              Refund {amountOk ? inr(Math.round(amt * 100) / 100) : ""} via
              Cashfree
            </button>
          </>
        ) : (
          <p className="mt-1 text-xs text-muted">
            This customer didn&apos;t pay through Cashfree (or it&apos;s
            already refunded there). Refund them another way and record it
            below.
          </p>
        ))}
    </div>
  );
}

/* ---- notes ---- */

function NotesBox({
  caseId,
  staff,
  people,
  demo,
}: {
  caseId: string;
  staff: Staff;
  people: StaffMember[];
  demo: boolean;
}) {
  const [notes, setNotes] = useState<string | null>(demo ? "" : null);
  const [meta, setMeta] = useState<{ by: string | null; at: Date | null }>({
    by: null,
    at: null,
  });
  const [saved, setSaved] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
  useEffect(() => {
    if (demo) return;
    let off = false;
    readNotes(caseId)
      .then((n) => {
        if (off) return;
        setNotes(n.notes);
        setSaved(n.notes);
        setMeta({ by: n.updatedBy, at: n.updatedAt });
      })
      .catch(() => !off && setNotes(""));
    return () => {
      off = true;
    };
  }, [caseId, demo]);
  return (
    <Section
      title="Internal notes"
      hint="Only the servicing team sees these. Never shown to the customer."
    >
      <textarea
        value={notes ?? ""}
        disabled={notes === null}
        onChange={(e) => setNotes(e.target.value)}
        rows={4}
        maxLength={5000}
        placeholder={
          notes === null
            ? "Loading…"
            : "Family preferences, budget, follow-ups…"
        }
        className="w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-plum focus:border-plum focus:outline-none"
      />
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          disabled={notes === null || notes === saved || state === "saving"}
          onClick={async () => {
            setState("saving");
            try {
              if (!demo) await saveNotes(caseId, notes ?? "", staff.email);
              setSaved(notes ?? "");
              setMeta({ by: staff.email, at: new Date() });
              setState("saved");
            } catch {
              setState("error");
            }
          }}
          className="h-9 rounded-full bg-plum px-4 text-sm font-semibold text-milk disabled:opacity-40"
        >
          {state === "saving" ? "Saving…" : "Save notes"}
        </button>
        {state === "saved" && notes === saved && (
          <span className="text-xs text-success">Saved</span>
        )}
        {state === "error" && (
          <span className="text-xs text-red-700">Couldn&apos;t save.</span>
        )}
      </div>
      <UpdatedBy by={meta.by} at={meta.at} people={people} className="mt-2" />
    </Section>
  );
}

/* ---------------- new case (by hand) ---------------- */

function NewCasePanel({
  staff,
  demo,
  onClose,
  onCreated,
}: {
  staff: Staff;
  demo: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [extra, setExtra] = useState({ email: "", area: "" });
  const input =
    "mt-1 h-10 w-full rounded-xl border border-line bg-white px-3 text-sm text-plum focus:border-plum focus:outline-none";
  const set = (k: keyof typeof extra) => (e: { target: { value: string } }) =>
    setExtra((x) => ({ ...x, [k]: e.target.value }));
  return (
    <SidePanel title="New servicing case" onClose={onClose}>
      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
        <p className="text-sm text-muted">
          For customers who paid another way. Converted enquiries come here when
          the sales team submits the Servicing form.
        </p>
        <ServicingForm
          initial={emptyForm()}
          submitLabel="Create case"
          extra={
            <div className="grid gap-3 border-t border-line pt-4 sm:grid-cols-2">
              <label className="block text-xs font-semibold text-muted">
                Customer email
                <input
                  value={extra.email}
                  onChange={set("email")}
                  type="email"
                  className={input}
                />
              </label>
              <label className="block text-xs font-semibold text-muted">
                Area
                <input
                  value={extra.area}
                  onChange={set("area")}
                  placeholder="e.g. HSR Layout"
                  className={input}
                />
              </label>
            </div>
          }
          onSubmit={async (form) => {
            try {
              const id = demo
                ? "case1"
                : await createCase(
                    {
                      form,
                      email: extra.email,
                      area: extra.area,
                      // Paid outside Cashfree: record the form's amount as a manual payment.
                      amount: form.amountPaid,
                    },
                    staff.email,
                  );
              onClose();
              onCreated(id);
            } catch (e) {
              throw new Error(
                (e as { code?: string }).code === "permission-denied"
                  ? "You don't have permission to create cases."
                  : "Couldn't create the case.",
              );
            }
          }}
        />
      </div>
    </SidePanel>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="mt-4 rounded-[20px] border border-dashed border-line bg-paper/60 px-4 py-16 text-center text-sm text-muted">
      {children}
    </div>
  );
}
