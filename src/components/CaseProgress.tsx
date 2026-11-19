"use client";

/**
 * Pieces of a servicing case shared by the Servicing page and the enquiry
 * drawer (where sales see the case read-only): stage pill, 7-step progress,
 * the "next step" line and the requirement summary.
 */
import { Check } from "lucide-react";

import {
  bucketMeta,
  caseBucket,
  caseTimeline,
  needsForm,
  travelStatus,
  type Intake,
  type ServicingCase,
} from "@/lib/servicing";
import { formatDateTime } from "@/lib/format";

export const inr = (n: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);

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
export function formatDay(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  return y && m && d ? `${d} ${MONTHS[m - 1]} ${y}` : ymd;
}
/** "14:30" → "2:30 PM" */
export function formatTime(hm: string) {
  const [h, m] = hm.split(":").map(Number);
  if (h === undefined || m === undefined || Number.isNaN(h)) return hm;
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

export function requirementLine(r: Intake) {
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

export function StagePill({ c }: { c: ServicingCase }) {
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
export function nextStep(c: ServicingCase, now: Date): string {
  if (needsForm(c)) return "Waiting for the Servicing form";
  if (c.stage === "cancelled") {
    const r = c.cancellation?.refund;
    if (!c.cancellation || !r) return "Cancelled";
    const amt = r.amount !== null ? ` ${inr(r.amount)}` : "";
    return `${c.cancellation.reason} · ${r.status === "pending" ? `Refund${amt} due` : r.status === "initiated" ? `Refund${amt} initiated` : r.status === "processed" ? `Refunded${amt}` : "No refund"}`;
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

/** The seven steps (form → joined) with a hover card on each. */
export function CaseProgress({
  c,
  now,
  className = "",
}: {
  c: ServicingCase;
  now: Date;
  className?: string;
}) {
  const steps = caseTimeline(c, now);
  const stopped = c.stage === "on_hold" || c.stage === "cancelled";
  return (
    <ol
      className={`grid grid-cols-7 ${className}`}
      aria-label="Progress"
    >
      {steps.map((s, i) => (
        <li
          key={s.key}
          className="group relative min-w-0 text-center text-[0.68rem] leading-tight sm:text-xs"
          aria-current={s.state === "now" ? "step" : undefined}
        >
          {i > 0 && (
            <span
              aria-hidden="true"
              className={`absolute right-1/2 top-[9px] h-0.5 w-full ${s.state === "todo" ? "bg-line" : stopped ? "bg-muted/40" : "bg-success"}`}
            />
          )}
          <span
            aria-hidden="true"
            className={`relative z-[1] mx-auto mb-1 grid size-5 place-items-center rounded-full border-2 transition-transform group-hover:scale-110 ${
              s.state === "done"
                ? stopped
                  ? "border-muted/60 bg-muted/60 text-white"
                  : "border-success bg-success text-white"
                : s.state === "now"
                  ? stopped
                    ? "border-muted bg-paper"
                    : "border-success bg-paper ring-4 ring-[#dcefe1]"
                  : "border-line bg-paper"
            }`}
          >
            {s.state === "done" && (
              <Check className="size-3" strokeWidth={3} />
            )}
          </span>
          <span
            className={`block truncate px-0.5 ${s.state === "now" ? "font-semibold text-plum" : "text-muted"}`}
          >
            {s.label}
          </span>
          {s.state === "now" ? (
            <span className="block truncate px-0.5 text-[0.68rem] text-muted">
              {stopped
                ? c.stage === "on_hold"
                  ? "(On hold)"
                  : "(Stopped)"
                : "(Current)"}
              <span className="hidden sm:inline">
                {s.detail ? ` · ${s.detail}` : ""}
              </span>
            </span>
          ) : (
            s.detail && (
              <span className="hidden truncate px-0.5 text-[0.68rem] text-muted/80 sm:block">
                {s.detail}
              </span>
            )
          )}
          {/* Hover card: the step's details without opening the case. */}
          <span
            role="tooltip"
            className={`pointer-events-none absolute bottom-full z-30 mb-2 hidden w-max min-w-[180px] max-w-[280px] rounded-xl bg-plum px-3 py-2 text-left text-xs leading-snug text-milk shadow-lift group-hover:block ${
              i === 0
                ? "left-0"
                : i === steps.length - 1
                  ? "right-0"
                  : "left-1/2 -translate-x-1/2"
            }`}
          >
            <span className="mb-1 block font-semibold">
              {s.label}
              <span className="font-normal text-milk/70">
                {s.state === "done"
                  ? " · done"
                  : s.state === "now"
                    ? stopped
                      ? ` · stopped (${c.stage === "on_hold" ? "on hold" : "cancelled"})`
                      : " · current step"
                    : ""}
              </span>
            </span>
            {s.tip.map((line, j) => (
              <span key={j} className="block">
                {line}
              </span>
            ))}
          </span>
        </li>
      ))}
    </ol>
  );
}
