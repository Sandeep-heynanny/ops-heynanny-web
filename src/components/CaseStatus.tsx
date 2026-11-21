"use client";

/**
 * Read-only view of a customer's servicing case, in the enquiry drawer, so
 * sales can tell the customer what's happening. Changes are made by the
 * servicing team on the Servicing page.
 */
import { ArrowRight, CalendarClock, ExternalLink, IndianRupee, Phone } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import {
  CaseProgress,
  formatDay,
  inr,
  nextStep,
  StagePill,
} from "@/components/CaseProgress";
import { confirmDialog } from "@/components/ConfirmDialog";
import { UpdatedBy } from "@/components/UpdatedBy";
import type { Staff } from "@/lib/auth";
import { canSeeEnquiries, canSeeServicing } from "@/lib/firebase";
import { formatDateTime, toDate } from "@/lib/format";
import { markPaymentCollected } from "@/lib/leads";
import {
  caseRef,
  collectDue,
  needsForm,
  openRequests,
  readNotes,
  REFUND_META,
  REQUEST_META,
  requestWhen,
  STAGE_META,
  travelStatus,
  TRAVEL_MODES,
  useServicingCase,
  type Proposal,
  type ServicingCase,
} from "@/lib/servicing";
import { staffName, type StaffMember } from "@/lib/staff-list";
import { displayPhone } from "@/lib/types";

const ts = (v: { toDate?: () => Date } | Date | null | undefined) =>
  !v ? null : v instanceof Date ? v : typeof v.toDate === "function" ? v.toDate() : null;
const when = (v: Parameters<typeof ts>[0]) => {
  const d = ts(v);
  return d ? formatDateTime(d) : null;
};
const TRAVEL_MODE_LABEL = new Map(
  [...TRAVEL_MODES.inter_city, ...TRAVEL_MODES.intra_city].map((m) => [m.id, m.label]),
);

export function CaseStatus({
  caseId,
  leadId,
  staff,
  people,
  demo,
}: {
  caseId: string;
  /** The enquiry, for "Full payment collected". */
  leadId: string;
  staff: Staff;
  people: StaffMember[];
  demo: boolean;
}) {
  const { c, loading, error } = useServicingCase(demo ? null : caseId);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(t);
  }, []);

  if (demo) return null;
  return (
    <section className="mt-4 rounded-2xl bg-paper p-4 ring-1 ring-line" aria-label="Servicing progress">
      {loading ? (
        <p className="text-sm text-muted">Loading servicing progress…</p>
      ) : error || !c ? (
        <p className="text-sm text-red-700">{error ?? "Servicing case not found."}</p>
      ) : (
        <>
          {canSeeEnquiries(staff.role) && <CollectPayment c={c} leadId={leadId} people={people} />}
          <CaseBody c={c} now={now} staff={staff} people={people} />
        </>
      )}
    </section>
  );
}

function CaseBody({
  c,
  now,
  staff,
  people,
}: {
  c: ServicingCase;
  now: Date;
  staff: Staff;
  people: StaffMember[];
}) {
  const stopped = c.stage === "on_hold" || c.stage === "cancelled";
  const next = nextStep(c, now);
  const requests = openRequests(c);
  const shared = [...c.proposals].sort(
    (a, b) => (a.sharedAt?.toMillis() ?? 0) - (b.sharedAt?.toMillis() ?? 0),
  );
  const t = c.travel;
  const cancel = c.cancellation;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="flex-1 text-sm font-bold text-plum">
          Servicing progress{" "}
          <span className="font-mono text-xs font-normal text-muted">{caseRef(c)}</span>
        </h3>
        <StagePill c={c} />
        {canSeeServicing(staff.role) && (
          <a
            href={`/servicing?case=${encodeURIComponent(c.id)}`}
            className="inline-flex items-center gap-1 text-xs font-semibold text-rose-deep hover:underline"
          >
            Open in Servicing
            <ExternalLink className="size-3" aria-hidden="true" />
          </a>
        )}
      </div>
      <p className="mt-0.5 text-xs text-muted">
        Read-only. The servicing team updates this
        {c.assignedTo ? ` · handled by ${staffName(c.assignedTo, people)}` : " · not assigned yet"}.
      </p>

      {!needsForm(c) && <CaseProgress c={c} now={now} className="mt-4" />}

      {next && (
        <p className="mt-3 flex items-start gap-1.5 rounded-xl bg-white px-3 py-2 text-sm text-plum ring-1 ring-line">
          <ArrowRight className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden="true" />
          <span>
            <span className="font-semibold">{stopped ? `${STAGE_META[c.stage].label}: ` : "Now: "}</span>
            {next}
          </span>
        </p>
      )}

      {requests.map(({ nannyId, proposal, req }) => (
        <p
          key={nannyId}
          className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-[#fff6e5] px-2.5 py-1.5 text-xs text-plum ring-1 ring-[#f1d9a6]"
        >
          <CalendarClock className="size-3.5 shrink-0 text-[#9a6417]" aria-hidden="true" />
          <span>
            Customer asked (app) to meet <span className="font-semibold">{proposal.nanny.name}</span> ·{" "}
            {requestWhen(req.at.toDate())}
          </span>
          <span className={`rounded-full px-2 py-0.5 text-[0.68rem] font-semibold ${REQUEST_META[req.status].tone}`}>
            {REQUEST_META[req.status].label}
          </span>
        </p>
      ))}

      <dl className="mt-4 divide-y divide-line overflow-hidden rounded-xl bg-white text-sm ring-1 ring-line">
        <Row label="Paid">
          {inr(c.totalPaid)}
          {c.payments.length > 0 && (
            <span className="mt-0.5 block text-xs text-muted">
              {c.payments
                .map((p) => `${inr(p.amount)}${p.paidAt ? ` on ${formatDateTime(new Date(p.paidAt))}` : ""}`)
                .join(" · ")}
            </span>
          )}
        </Row>
        <Row label={`Profiles shared (${shared.length})`}>
          {shared.length ? (
            <ul className="space-y-2">
              {shared.map((p) => (
                <ProposalLine key={p.nannyId} p={p} people={people} />
              ))}
            </ul>
          ) : (
            <span className="text-muted">None yet</span>
          )}
        </Row>
        {c.placement && (
          <Row label="Placed nanny">
            <span className="font-semibold">{c.placement.nanny.name}</span>
            {c.placement.nanny.phone && (
              <a
                href={`tel:${c.placement.nanny.phone}`}
                className="ml-2 inline-flex items-center gap-1 text-xs font-semibold text-rose-deep hover:underline"
              >
                <Phone className="size-3" aria-hidden="true" />
                {displayPhone(c.placement.nanny.phone)}
              </a>
            )}
            <span className="mt-0.5 block text-xs text-muted">
              Starts {formatDay(c.placement.startDate)}
              {c.placement.siteAddress ? ` · ${c.placement.siteAddress}` : ""}
              {c.placement.placedAt ? ` · placed ${when(c.placement.placedAt)}` : ""}
              {c.placement.placedBy ? ` by ${staffName(c.placement.placedBy, people)}` : ""}
            </span>
          </Row>
        )}
        {t && (
          <Row label="Travel">
            {travelStatus(t)}
            {(t.mode || t.ticketNumber || t.fromCity || t.departAt || t.arriveAt) && (
              <span className="mt-0.5 block text-xs text-muted">
                {[
                  t.mode ? TRAVEL_MODE_LABEL.get(t.mode) ?? t.mode : null,
                  t.ticketNumber ? `ticket ${t.ticketNumber}` : null,
                  t.fromCity ? `from ${t.fromCity}` : null,
                  t.departAt ? `leaves ${when(t.departAt)}` : null,
                  t.arriveAt ? `arrives ${when(t.arriveAt)}` : null,
                  t.reachedPgAt ? `reached PG ${when(t.reachedPgAt)}` : null,
                  t.reachedSiteAt ? `at customer's ${when(t.reachedSiteAt)}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            )}
            {t.ticketNote && <span className="mt-0.5 block text-xs text-muted">{t.ticketNote}</span>}
          </Row>
        )}
        {c.placementHistory.length > 0 && (
          <Row label="Earlier nannies">
            {c.placementHistory.map((p, i) => (
              <span key={i} className="block">
                {p.nanny.name}
                <span className="text-xs text-muted">
                  {" "}
                  · from {formatDay(p.startDate)}
                  {p.endedAt ? ` · replaced ${when(p.endedAt)}` : ""}
                  {p.endReason ? ` · ${p.endReason}` : ""}
                </span>
              </span>
            ))}
          </Row>
        )}
        {cancel && (
          <Row label={c.stage === "cancelled" ? "Cancelled" : "Cancellation"}>
            {cancel.reason}
            {cancel.note ? ` · ${cancel.note}` : ""}
            <span className="mt-0.5 block text-xs text-muted">
              {cancel.cancelledAt ? `${when(cancel.cancelledAt)}` : ""}
              {cancel.cancelledBy ? ` by ${staffName(cancel.cancelledBy, people)}` : ""}
            </span>
            <span className="mt-1 flex flex-wrap items-center gap-2 text-xs">
              <span className={`rounded-full px-2 py-0.5 font-semibold ${REFUND_META[cancel.refund.status].tone}`}>
                {REFUND_META[cancel.refund.status].label}
              </span>
              {cancel.refund.amount !== null && <span>{inr(cancel.refund.amount)}</span>}
              {cancel.refund.reference && <span className="text-muted">Ref {cancel.refund.reference}</span>}
              {cancel.refund.refundedAt && <span className="text-muted">{when(cancel.refund.refundedAt)}</span>}
            </span>
          </Row>
        )}
      </dl>

      <ServicingNotes caseId={c.id} people={people} />

      <UpdatedBy by={c.updatedBy} at={toDate(c.updatedAt)} people={people} className="mt-3" />
    </>
  );
}

/**
 * Nanny placed but not paid in full (Payment Half / Pre / Token): sales collect
 * the rest and mark it here. Once marked, a line shows who collected it.
 */
function CollectPayment({ c, leadId, people }: { c: ServicingCase; leadId: string; people: StaffMember[] }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const r = c.intake;
  if (!r) return null;
  if (!collectDue(c)) {
    if (!r.paymentCollectedAt) return null;
    return (
      <p className="mb-3 flex items-center gap-1.5 rounded-xl bg-[#dcefe1] px-3 py-2 text-xs font-semibold text-success">
        <IndianRupee className="size-3.5" aria-hidden="true" />
        Full payment collected{r.paymentWas ? ` (was ${r.paymentWas})` : ""}
        {r.paymentCollectedBy ? ` by ${staffName(r.paymentCollectedBy, people)}` : ""}
        {r.paymentCollectedAt ? ` · ${when(r.paymentCollectedAt as Date)}` : ""}
      </p>
    );
  }
  const collect = async () => {
    if (
      !(await confirmDialog({
        title: "Full payment collected?",
        message: `Mark ${c.customer.name ?? "this customer"}'s payment as Full. Do this only once the rest of the amount is received.`,
        confirmLabel: "Yes, collected",
        cancelLabel: "Not yet",
      }))
    )
      return;
    setBusy(true);
    setError(null);
    try {
      await markPaymentCollected({ id: leadId });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div role="alert" className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-800 ring-1 ring-red-200">
      <p className="flex items-center gap-1.5 font-bold">
        <IndianRupee className="size-4" aria-hidden="true" />
        Collect the full payment
      </p>
      <p className="mt-0.5 text-xs">
        {c.placement?.nanny.name ?? "The nanny"} is placed, but the Servicing form says Payment: <b>{r.payment}</b>
        {typeof r.amountPaid === "number" ? ` (${inr(r.amountPaid)} paid)` : ""}. Collect the rest from the customer, then mark it here.
      </p>
      {error && <p className="mt-1 text-xs font-semibold">{error}</p>}
      <button
        type="button"
        onClick={collect}
        disabled={busy}
        className="mt-2 h-9 rounded-full bg-red-700 px-4 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50"
      >
        {busy ? "Saving…" : "Full payment collected"}
      </button>
    </div>
  );
}

function ProposalLine({ p, people }: { p: Proposal; people: StaffMember[] }) {
  const n = p.nanny;
  const facts = [
    n.role,
    n.age ? `${n.age} yrs` : null,
    n.experienceYears !== null && n.experienceYears !== undefined ? `${n.experienceYears} yrs exp` : null,
    n.languages?.length ? n.languages.join(", ") : null,
  ].filter(Boolean);
  const interview = p.interviewAt
    ? `Interview ${formatDateTime(p.interviewAt.toDate())}${p.interviewStatus === "done" ? " (done)" : p.interviewStatus === "cancelled" ? " (cancelled)" : ""}`
    : null;
  return (
    <li>
      <span className="font-semibold">{n.name}</span>
      {facts.length > 0 && <span className="text-xs text-muted"> · {facts.join(" · ")}</span>}
      <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        {p.sharedAt && (
          <span className="text-muted">
            Shared {formatDateTime(p.sharedAt.toDate())}
            {p.sharedBy ? ` by ${staffName(p.sharedBy, people)}` : ""}
          </span>
        )}
        {p.shortlisted && (
          <span className="rounded-full bg-[#e3edfd] px-2 py-0.5 font-semibold text-[#1a56c4]">Shortlisted</span>
        )}
        {interview && <span className="text-plum">{interview}</span>}
        {p.outcome && (
          <span
            className={`rounded-full px-2 py-0.5 font-semibold ${p.outcome === "approved" ? "bg-[#dcefe1] text-success" : "bg-beige text-muted"}`}
          >
            {p.outcome === "approved" ? "Approved" : "Not selected"}
          </span>
        )}
        {p.outcomeNote && <span className="text-muted">{p.outcomeNote}</span>}
      </span>
    </li>
  );
}

function ServicingNotes({ caseId, people }: { caseId: string; people: StaffMember[] }) {
  const [notes, setNotes] = useState<Awaited<ReturnType<typeof readNotes>> | null>(null);
  useEffect(() => {
    let live = true;
    readNotes(caseId)
      .then((n) => live && setNotes(n))
      .catch(() => live && setNotes(null));
    return () => {
      live = false;
    };
  }, [caseId]);
  if (!notes?.notes.trim()) return null;
  return (
    <div className="mt-3">
      <p className="text-xs font-semibold text-plum">Servicing team notes</p>
      <p className="mt-1 max-h-48 overflow-y-auto whitespace-pre-wrap rounded-xl bg-white px-3 py-2 text-sm text-plum ring-1 ring-line">
        {notes.notes}
      </p>
      <UpdatedBy by={notes.updatedBy} at={notes.updatedAt} people={people} className="mt-1" />
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-3 px-3 py-2.5 sm:grid-cols-[150px_minmax(0,1fr)]">
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0 text-plum">{children}</dd>
    </div>
  );
}
