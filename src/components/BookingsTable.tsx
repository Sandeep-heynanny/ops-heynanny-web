"use client";

import { ChevronRight, Inbox } from "lucide-react";

import { StatusPill } from "@/components/StatusPill";
import { CARE_TYPES, planName, serviceName } from "@/lib/catalog";
import { formatDate, formatPhone, formatReceived, formatTime, toDate } from "@/lib/format";
import { requestId, type Booking } from "@/lib/types";

export function BookingsTable({
  bookings,
  now,
  selectedId,
  onSelect,
  emptyHint,
}: {
  bookings: Booking[];
  now: Date;
  selectedId: string | null;
  onSelect: (id: string) => void;
  emptyHint: string;
}) {
  if (!bookings.length) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-[20px] border border-dashed border-line bg-paper/60 px-4 py-16 text-center">
        <Inbox className="size-7 text-muted" strokeWidth={1.5} aria-hidden="true" />
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
              <th scope="col" className="px-4 py-3 font-semibold">Received</th>
              <th scope="col" className="px-4 py-3 font-semibold">Customer</th>
              <th scope="col" className="px-4 py-3 font-semibold">Service</th>
              <th scope="col" className="px-4 py-3 font-semibold">Starts</th>
              <th scope="col" className="hidden px-4 py-3 font-semibold lg:table-cell">Area</th>
              <th scope="col" className="hidden px-4 py-3 font-semibold xl:table-cell">Source</th>
              <th scope="col" className="px-4 py-3 font-semibold">Status</th>
              <th scope="col" className="hidden px-4 py-3 font-semibold lg:table-cell">Assigned</th>
              <th scope="col" className="w-8 px-2 py-3"><span className="sr-only">Open</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {bookings.map((b) => {
              const care = b.bookingDetails.careType ? CARE_TYPES[b.bookingDetails.careType] : null;
              return (
                <tr
                  key={b.id}
                  onClick={() => onSelect(b.id)}
                  className={`cursor-pointer transition-colors hover:bg-white ${selectedId === b.id ? "bg-white" : ""} ${b.status === "pending" ? "font-medium" : ""}`}
                >
                  <td className="whitespace-nowrap px-4 py-3">
                    <p className="text-plum">{formatReceived(toDate(b.createdAt), now)}</p>
                    <p className="font-mono text-[0.7rem] text-muted">{requestId(b)}</p>
                  </td>
                  <td className="px-4 py-3">
                    {/* The button keeps rows keyboard-accessible; the whole row is also clickable. */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelect(b.id);
                      }}
                      className="text-left font-semibold text-plum underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-plum"
                    >
                      {b.customer.name}
                    </button>
                    <p className="whitespace-nowrap text-xs text-muted">{formatPhone(b.customer.phone)}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-plum">{serviceName(b.serviceId)}</p>
                    <p className="text-xs text-muted">
                      {planName(b.serviceId, b.planId)}
                      {care ? ` · ${care}` : ""}
                    </p>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <p className="text-plum">{formatDate(b.bookingDetails.date)}</p>
                    <p className="text-xs text-muted">{formatTime(b.bookingDetails.startTime)}</p>
                  </td>
                  <td className="hidden px-4 py-3 lg:table-cell">
                    <p className="text-plum">{b.bookingDetails.address.city}</p>
                    <p className="text-xs text-muted">{b.bookingDetails.address.pincode}</p>
                  </td>
                  <td className="hidden px-4 py-3 xl:table-cell">
                    {b.leadSource ? (
                      <span className="rounded-full bg-beige px-2 py-0.5 text-xs text-plum">{b.leadSource}</span>
                    ) : (
                      <span className="text-xs text-muted">Direct</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill status={b.status} />
                  </td>
                  <td className="hidden max-w-[160px] truncate px-4 py-3 text-xs text-muted lg:table-cell">
                    {b.ops?.assignedTo ? b.ops.assignedTo.split("@")[0] : "—"}
                  </td>
                  <td className="px-2 py-3 text-muted">
                    <ChevronRight className="size-4" aria-hidden="true" />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Phone: cards */}
      <ul className="grid gap-2 md:hidden">
        {bookings.map((b) => (
          <li key={b.id}>
            <button
              type="button"
              onClick={() => onSelect(b.id)}
              className="w-full rounded-[18px] border border-line bg-paper p-4 text-left active:bg-white"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-plum">{b.customer.name}</p>
                  <p className="text-xs text-muted">{formatPhone(b.customer.phone)}</p>
                </div>
                <StatusPill status={b.status} />
              </div>
              <p className="mt-2 text-sm text-plum">
                {serviceName(b.serviceId)} · {planName(b.serviceId, b.planId)}
              </p>
              <p className="mt-0.5 text-xs text-muted">
                Starts {formatDate(b.bookingDetails.date)}, {formatTime(b.bookingDetails.startTime)} · {b.bookingDetails.address.city}
              </p>
              <p className="mt-2 text-xs text-muted">
                {formatReceived(toDate(b.createdAt), now)}
                {b.leadSource ? ` · ${b.leadSource}` : ""}
              </p>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
