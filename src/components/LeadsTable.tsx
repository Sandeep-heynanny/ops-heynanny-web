"use client";

import { ChevronRight, Inbox, PhoneCall } from "lucide-react";

import { OriginBadge } from "@/components/OriginBadge";
import { ReturningChip } from "@/components/ReturningChip";
import { StatusPill } from "@/components/StatusPill";
import {
  callbackState,
  formatCallback,
  formatReceived,
  toDate,
} from "@/lib/format";
import type { Returning } from "@/lib/leads";
import {
  bucketMeta,
  caseBucket,
  type ServicingCase,
} from "@/lib/servicing";
import { staffName, type StaffMember } from "@/lib/staff-list";
import {
  careShort,
  CLOSE_REASONS,
  displayPhone,
  formName,
  formPending,
  leadRef,
  type Lead,
} from "@/lib/types";

export function LeadsTable({
  leads,
  now,
  selectedId,
  onSelect,
  emptyHint,
  staffList = [],
  returning,
  cases,
}: {
  leads: Lead[];
  now: Date;
  selectedId: string | null;
  onSelect: (id: string) => void;
  emptyHint: string;
  staffList?: StaffMember[];
  /** People who converted on an earlier enquiry. */
  returning?: Map<string, Returning>;
  /** Servicing cases by ID, to show a converted customer's servicing stage. */
  cases?: Map<string, ServicingCase>;
}) {
  if (!leads.length) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-[20px] border border-dashed border-line bg-paper/60 px-4 py-16 text-center">
        <Inbox
          className="size-7 text-muted"
          strokeWidth={1.5}
          aria-hidden="true"
        />
        <p className="text-sm text-muted">{emptyHint}</p>
      </div>
    );
  }

  return (
    <>
      {/* Desktop / tablet: table */}
      <div className="hidden overflow-hidden rounded-[20px] border border-line bg-paper shadow-soft md:block">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line bg-beige/40 text-xs font-semibold uppercase tracking-wider text-muted">
            <tr>
              <th scope="col" className="px-4 py-3 font-semibold">
                Received
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                Contact
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                Type of care
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                Area
              </th>
              <th
                scope="col"
                className="hidden px-4 py-3 font-semibold lg:table-cell"
              >
                Needed
              </th>
              <th
                scope="col"
                className="hidden px-4 py-3 font-semibold lg:table-cell"
              >
                Source
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                Status
              </th>
              <th
                scope="col"
                className="hidden px-4 py-3 font-semibold lg:table-cell"
              >
                Assigned
              </th>
              <th scope="col" className="w-8 px-2 py-3">
                <span className="sr-only">Open</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {leads.map((l) => (
              <tr
                key={l.id}
                onClick={() => onSelect(l.id)}
                className={`cursor-pointer transition-colors hover:bg-white ${selectedId === l.id ? "bg-white" : ""} ${l.status === "new" ? "font-medium" : ""}`}
              >
                <td className="whitespace-nowrap px-4 py-3">
                  <p className="text-plum">
                    {formatReceived(toDate(l.createdAt), now)}
                  </p>
                  <p className="font-mono text-[0.7rem] text-muted">
                    {leadRef(l)}
                  </p>
                </td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelect(l.id);
                    }}
                    className="whitespace-nowrap text-left font-semibold tabular-nums text-plum underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-plum"
                  >
                    {l.name || displayPhone(l.phone)}
                  </button>
                  <p className="max-w-[200px] truncate text-xs text-muted">
                    {l.name ? displayPhone(l.phone) : l.email || "No email"}
                  </p>
                </td>
                <td className="px-4 py-3 text-plum">{careShort(l.careType)}</td>
                <td className="max-w-[180px] truncate px-4 py-3 text-plum">
                  {l.area}
                </td>
                <td className="hidden whitespace-nowrap px-4 py-3 text-plum lg:table-cell">
                  {l.when === "Not specified" ? (
                    <span className="text-xs text-muted">—</span>
                  ) : (
                    l.when
                  )}
                </td>
                <td className="hidden px-4 py-3 lg:table-cell">
                  <OriginBadge lead={l} />
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-col items-start">
                    <StatusPill status={l.status} />
                    <CallbackChip lead={l} now={now} />
                    <ReasonChip lead={l} />
                    <ReturningChip info={returning?.get(l.id)} />
                    {l.status === "converted" &&
                      (formPending(l) ? (
                        <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-[#fbecc8] px-2 py-0.5 text-[0.7rem] font-semibold text-[#7a5410]">
                          <span
                            className="size-1.5 rounded-full bg-[#d9a23a]"
                            aria-hidden="true"
                          />
                          Form pending
                        </span>
                      ) : (
                        <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-[#ece6fb] px-2 py-0.5 text-[0.7rem] font-semibold text-[#5b3cc4]">
                          <span
                            className="size-1.5 rounded-full bg-[#7a5ce0]"
                            aria-hidden="true"
                          />
                          {(() => {
                            const c = l.ops?.servicingCaseId
                              ? cases?.get(l.ops.servicingCaseId)
                              : undefined;
                            return c
                              ? `In servicing · ${bucketMeta(caseBucket(c)).short}`
                              : "In servicing";
                          })()}
                        </span>
                      ))}
                  </div>
                </td>
                <td className="hidden max-w-[160px] truncate px-4 py-3 text-xs text-muted lg:table-cell">
                  {l.ops?.assignedTo
                    ? staffName(l.ops.assignedTo, staffList)
                    : "—"}
                </td>
                <td className="px-2 py-3 text-muted">
                  <ChevronRight className="size-4" aria-hidden="true" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Phone: cards */}
      <ul className="grid gap-2 md:hidden">
        {leads.map((l) => (
          <li key={l.id}>
            <button
              type="button"
              onClick={() => onSelect(l.id)}
              className="w-full rounded-[18px] border border-line bg-paper p-4 text-left active:bg-white"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-plum">
                    {l.name || displayPhone(l.phone)}
                  </p>
                  <p className="truncate text-xs tabular-nums text-muted">
                    {l.name ? displayPhone(l.phone) : l.email || "No email"}
                  </p>
                  <OriginBadge lead={l} className="mt-1" />
                </div>
                <div className="flex shrink-0 flex-col items-end">
                  <StatusPill status={l.status} />
                  <CallbackChip lead={l} now={now} />
                  <ReasonChip lead={l} />
                  <ReturningChip info={returning?.get(l.id)} />
                </div>
              </div>
              <p className="mt-2 text-sm text-plum">
                {careShort(l.careType)} · {l.area}
              </p>
              <p className="mt-2 text-xs text-muted">
                {formatReceived(toDate(l.createdAt), now)}
                {l.when !== "Not specified" ? ` · ${l.when}` : ""}
                {` · ${formName(l)}`}
              </p>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

const CALLBACK_TONE = {
  overdue: "bg-red-50 text-red-700 ring-red-200",
  today: "bg-[#fbecc8] text-[#7a5410] ring-[#ecd39a]",
  later: "bg-white text-muted ring-line",
} as const;

/** Call-back time under the status, for contacted leads that have one. */
function CallbackChip({ lead, now }: { lead: Lead; now: Date }) {
  const d = lead.status === "contacted" ? toDate(lead.ops?.callbackAt) : null;
  if (!d) return null;
  return (
    <span
      className={`mt-1 inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[0.7rem] font-semibold ring-1 ${CALLBACK_TONE[callbackState(d, now)]}`}
    >
      <PhoneCall className="size-3" aria-hidden="true" />
      {formatCallback(d, now)}
    </span>
  );
}

/** Outcome and reason under the status, for closed ("not interested") leads. */
function ReasonChip({ lead }: { lead: Lead }) {
  const r = lead.status === "not_interested" ? lead.ops?.closeReason : null;
  if (!r) return null;
  return (
    <span
      className="mt-1 max-w-[180px] truncate text-[0.7rem] text-muted"
      title={r.reason}
    >
      <span className="font-semibold text-plum">
        {CLOSE_REASONS[r.category]?.label ?? r.category}
      </span>{" "}
      · {r.reason}
    </span>
  );
}
