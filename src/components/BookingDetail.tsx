"use client";

import { Check, Copy, Mail, MessageCircle, Phone, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { StatusPill } from "@/components/StatusPill";
import type { Staff } from "@/lib/auth";
import { saveOpsUpdate } from "@/lib/bookings";
import { AGE_GROUPS, CARE_TYPES, planName, serviceName } from "@/lib/catalog";
import { formatDate, formatDateTime, formatINR, formatPhone, formatTime, toDate, whatsappLink } from "@/lib/format";
import { requestId, STATUS_META, STATUS_ORDER, type Booking, type BookingStatus } from "@/lib/types";

/** Side panel with everything about one request, plus the ops controls. */
export function BookingDetail(props: { booking: Booking; staff: Staff; demo: boolean; onClose: () => void }) {
  // Re-mount per booking so the form starts from that booking's values.
  return <Panel key={props.booking.id} {...props} />;
}

function Panel({ booking: b, staff, demo, onClose }: { booking: Booking; staff: Staff; demo: boolean; onClose: () => void }) {
  const [status, setStatus] = useState<BookingStatus>(b.status);
  const [assignedTo, setAssignedTo] = useState(b.ops?.assignedTo ?? "");
  const [notes, setNotes] = useState(b.ops?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  // What's saved (updated right after a save, before the live update arrives).
  const [base, setBase] = useState({ status: b.status, assignedTo: b.ops?.assignedTo ?? "", notes: b.ops?.notes ?? "" });
  const dirty = status !== base.status || assignedTo !== base.assignedTo || notes !== base.notes;

  const requestClose = () => {
    if (dirty && !window.confirm("You have unsaved changes. Close without saving?")) return;
    onClose();
  };

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && requestClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty]);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      if (!demo) await saveOpsUpdate(b, { status, notes, assignedTo }, staff.email);
      setBase({ status, assignedTo, notes });
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(
        (err as { code?: string }).code === "permission-denied"
          ? "You don't have permission to update bookings."
          : "Couldn't save. Check your connection and try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  const d = b.bookingDetails;
  const first = staff.name.split(" ")[0];
  const waText = `Hi ${b.customer.name.split(" ")[0]}, this is ${first} from HeyNanny about your ${serviceName(b.serviceId)} request (${requestId(b)}).`;

  return (
    <div className="fixed inset-0 z-30" role="dialog" aria-modal="true" aria-labelledby="detail-title">
      <div className="fade-in absolute inset-0 bg-plum/40 backdrop-blur-[2px]" onClick={requestClose} aria-hidden="true" />
      <aside className="panel-in absolute inset-y-0 right-0 flex w-full max-w-[520px] flex-col bg-milk shadow-lift">
        {/* Header */}
        <div className="flex items-start gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0 flex-1">
            <p className="font-mono text-xs text-muted">{requestId(b)}</p>
            <h2 id="detail-title" className="truncate font-display text-2xl leading-tight text-plum">
              {b.customer.name}
            </h2>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted">
              <StatusPill status={b.status} />
              <span>Received {formatDateTime(toDate(b.createdAt))}</span>
            </div>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={requestClose}
            aria-label="Close"
            className="grid size-10 shrink-0 place-items-center rounded-full text-plum hover:bg-plum/5 focus-visible:outline-2 focus-visible:outline-plum"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
          {/* Contact */}
          <section aria-label="Contact" className="rounded-[18px] border border-line bg-paper p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-lg font-bold tabular-nums text-plum">{formatPhone(b.customer.phone)}</p>
                <a href={`mailto:${b.customer.email}`} className="text-sm text-muted underline-offset-4 hover:underline">
                  {b.customer.email}
                </a>
              </div>
              <button
                type="button"
                onClick={async () => {
                  await navigator.clipboard?.writeText(b.customer.phone).catch(() => undefined);
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 1500);
                }}
                className="inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-semibold text-plum ring-1 ring-line hover:bg-white"
              >
                {copied ? <Check className="size-3.5" aria-hidden="true" /> : <Copy className="size-3.5" aria-hidden="true" />}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <ActionLink href={`tel:${b.customer.phone}`} icon={<Phone className="size-4" aria-hidden="true" />} label="Call" primary />
              <ActionLink href={whatsappLink(b.customer.phone, waText)} icon={<MessageCircle className="size-4" aria-hidden="true" />} label="WhatsApp" external />
              <ActionLink href={`mailto:${b.customer.email}?subject=${encodeURIComponent(`Your HeyNanny request ${requestId(b)}`)}`} icon={<Mail className="size-4" aria-hidden="true" />} label="Email" />
            </div>
          </section>

          {/* Ops */}
          <section aria-label="Update" className="rounded-[18px] border border-plum/15 bg-white p-4">
            <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-rose-deep">Ops</h3>

            <fieldset className="mt-3">
              <legend className="text-sm font-semibold text-plum">Status</legend>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {STATUS_ORDER.map((s) => (
                  <button
                    key={s}
                    type="button"
                    aria-pressed={status === s}
                    onClick={() => setStatus(s)}
                    className={`h-9 rounded-full px-3.5 text-sm font-semibold transition-colors ${
                      status === s ? "bg-plum text-milk" : "bg-paper text-plum ring-1 ring-line hover:bg-milk"
                    }`}
                  >
                    {STATUS_META[s].label}
                  </button>
                ))}
              </div>
            </fieldset>

            <div className="mt-4">
              <div className="flex items-center justify-between">
                <label htmlFor="assigned-to" className="text-sm font-semibold text-plum">
                  Assigned to
                </label>
                {assignedTo !== staff.email && (
                  <button type="button" onClick={() => setAssignedTo(staff.email)} className="text-xs font-semibold text-rose-deep hover:underline">
                    Assign to me
                  </button>
                )}
              </div>
              <input
                id="assigned-to"
                type="email"
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
                placeholder="name@heynanny.in"
                className="mt-1.5 h-10 w-full rounded-xl border border-line bg-paper px-3 text-sm text-plum focus:border-plum focus:outline-none"
              />
            </div>

            <label className="mt-4 block">
              <span className="text-sm font-semibold text-plum">Internal notes</span>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={4}
                placeholder="Call outcome, preferences, follow-up date… (customers never see this)"
                className="mt-1.5 w-full resize-y rounded-xl border border-line bg-paper px-3 py-2 text-sm text-plum focus:border-plum focus:outline-none"
              />
            </label>

            {b.ops?.updatedBy && (
              <p className="mt-2 text-xs text-muted">
                Last updated by {b.ops.updatedBy}
                {b.updatedAt ? `, ${formatDateTime(toDate(b.updatedAt))}` : ""}
              </p>
            )}
          </section>

          {/* Booking */}
          <section aria-label="Booking details">
            <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-rose-deep">Booking</h3>
            <dl className="mt-2 divide-y divide-line rounded-[18px] border border-line bg-paper text-sm">
              <Row label="Service" value={serviceName(b.serviceId)} />
              <Row label="Plan" value={planName(b.serviceId, b.planId)} />
              {d.careType && <Row label="Type of care" value={CARE_TYPES[d.careType] ?? d.careType} />}
              <Row label="Starts" value={`${formatDate(d.date)}, ${formatTime(d.startTime)}`} />
              <Row
                label={d.children.length > 1 ? "Children" : "Child"}
                value={`${d.children.length} · ${d.children.map((c) => AGE_GROUPS[c.ageGroup] ?? c.ageGroup).join(", ")}`}
              />
              <Row label="Address" value={`${d.address.line1}, ${d.address.city} ${d.address.pincode}`} />
              {b.nannyId && <Row label="Requested nanny" value={b.nannyId} />}
              <Row label="Lead source" value={b.leadSource || "Direct"} />
            </dl>
            {d.notes && (
              <div className="mt-2 rounded-[18px] bg-blush/50 px-4 py-3 text-sm text-plum">
                <p className="text-xs font-semibold text-rose-deep">Note from customer</p>
                <p className="mt-0.5 whitespace-pre-wrap">{d.notes}</p>
              </div>
            )}
          </section>

          {/* Price */}
          <section aria-label="Price">
            <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-rose-deep">Estimated price</h3>
            <dl className="mt-2 divide-y divide-line rounded-[18px] border border-line bg-paper text-sm">
              <Row label="Plan price" value={formatINR(b.pricing.subtotal)} />
              <Row label="GST (18%)" value={formatINR(b.pricing.taxes)} />
              <Row label="Total" value={<span className="font-bold">{formatINR(b.pricing.totalAmount)}</span>} />
            </dl>
            <p className="mt-1.5 text-xs text-muted">No payment taken online. Confirm the amount on the call.</p>
          </section>

        </div>

        {/* Footer */}
        <div className="border-t border-line bg-milk px-5 py-3">
          {error && (
            <p role="alert" className="mb-2 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={save}
              disabled={!dirty || saving}
              className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-plum px-5 text-sm font-semibold text-milk transition-colors hover:bg-plum-soft disabled:opacity-50"
            >
              {saved ? <Check className="size-4" aria-hidden="true" /> : null}
              {saving ? "Saving…" : saved ? "Saved" : "Save changes"}
            </button>
            <button type="button" onClick={requestClose} className="h-11 rounded-full px-4 text-sm font-semibold text-plum hover:bg-plum/5">
              Close
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-4 px-4 py-2.5">
      <dt className="w-28 shrink-0 text-muted">{label}</dt>
      <dd className="flex-1 text-right font-medium text-plum">{value}</dd>
    </div>
  );
}

function ActionLink({
  href,
  icon,
  label,
  primary,
  external,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  primary?: boolean;
  external?: boolean;
}) {
  return (
    <a
      href={href}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      className={`inline-flex h-10 items-center justify-center gap-1.5 rounded-full text-sm font-semibold transition-colors ${
        primary ? "bg-plum text-milk hover:bg-plum-soft" : "bg-white text-plum ring-1 ring-line hover:bg-milk"
      }`}
    >
      {icon}
      {label}
    </a>
  );
}
