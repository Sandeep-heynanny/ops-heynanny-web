"use client";

import {
  CalendarClock,
  Check,
  Copy,
  Mail,
  MessageCircle,
  Phone,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { CaseStatus } from "@/components/CaseStatus";
import { confirmDialog } from "@/components/ConfirmDialog";
import { ReturningChip } from "@/components/ReturningChip";
import { UpdatedBy } from "@/components/UpdatedBy";
import { OriginBadge } from "@/components/OriginBadge";
import { StatusPill } from "@/components/StatusPill";
import type { Staff } from "@/lib/auth";
import {
  formatCallback,
  formatDateTime,
  fromLocalInput,
  toDate,
  toLocalInput,
  whatsappLink,
} from "@/lib/format";
import {
  deleteLead,
  saveLeadUpdate,
  sendToServicing,
  type Returning,
} from "@/lib/leads";
import { ServicingForm } from "@/components/ServicingForm";
import {
  emptyForm,
  formInputFromValue,
  guessCareType,
  type ServicingFormValue,
} from "@/lib/servicing-form";
import { staffName, type StaffMember } from "@/lib/staff-list";
import {
  careShort,
  CLOSE_CATEGORIES,
  CLOSE_REASONS,
  displayPhone,
  formName,
  leadRef,
  metaPlatform,
  questionLabel,
  STATUS_META,
  STATUS_ORDER,
  type CloseCategory,
  type CloseReason,
  type Lead,
  type LeadStatus,
} from "@/lib/types";

/** Side panel with everything about one enquiry, plus the ops controls. */
type PanelProps = {
  lead: Lead;
  staff: Staff;
  staffList: StaffMember[];
  /** Everyone on staff (servicing too), for names on the servicing progress. */
  allStaff?: StaffMember[];
  /** Set when this person converted on an earlier enquiry. */
  returning?: Returning;
  onOpenLead?: (id: string) => void;
  demo: boolean;
  onClose: () => void;
};

export function LeadDetail(props: PanelProps) {
  // Re-mount per enquiry so the form starts from that enquiry's values.
  return <Panel key={props.lead.id} {...props} />;
}

function Panel({
  lead: l,
  staff,
  staffList,
  allStaff,
  returning,
  onOpenLead,
  demo,
  onClose,
}: PanelProps) {
  const [status, setStatus] = useState<LeadStatus>(l.status);
  const [assignedTo, setAssignedTo] = useState(l.ops?.assignedTo ?? "");
  const [notes, setNotes] = useState(l.ops?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  const initialCallback = toLocalInput(toDate(l.ops?.callbackAt));
  const [callback, setCallback] = useState(initialCallback);

  const initialReason = l.ops?.closeReason ?? null;
  const [closeReason, setCloseReason] = useState<CloseReason | null>(
    initialReason,
  );
  const reasonKey = (r: CloseReason | null) =>
    r ? `${r.category}:${r.reason}` : "";

  const [base, setBase] = useState({
    status: l.status,
    assignedTo: l.ops?.assignedTo ?? "",
    notes: l.ops?.notes ?? "",
    callback: initialCallback,
    reason: reasonKey(initialReason),
  });
  // The call back only counts while the status is "contacted" (it's cleared otherwise).
  const effectiveCallback = status === "contacted" ? callback : "";
  const dirty =
    status !== base.status ||
    assignedTo !== base.assignedTo ||
    notes !== base.notes ||
    effectiveCallback !== (base.status === "contacted" ? base.callback : "") ||
    (status === "not_interested" ? reasonKey(closeReason) : "") !==
      (base.status === "not_interested" ? base.reason : "");
  // A lead can't be closed without saying why.
  const needsReason = status === "not_interested" && !closeReason?.reason;

  const requestClose = async () => {
    if (
      dirty &&
      !(await confirmDialog({
        title: "Discard your changes?",
        message: "You have unsaved changes to this enquiry.",
        confirmLabel: "Discard",
        cancelLabel: "Keep editing",
        danger: true,
      }))
    )
      return;
    onClose();
  };

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && requestClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty]);

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const remove = async () => {
    setDeleting(true);
    setError(null);
    try {
      if (!demo) await deleteLead(l);
      onClose(); // the live list drops it automatically
    } catch (err) {
      setError(
        (err as { code?: string }).code === "permission-denied"
          ? "You don't have permission to delete enquiries."
          : "Couldn't delete. Check your connection and try again.",
      );
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  // ---- Servicing form ----
  // A converted enquiry goes to servicing only when the sales team submits the
  // Servicing form (was a Google Form).
  const [formDone, setFormDone] = useState<{ at: Date; by: string } | null>(
    l.ops?.servicingFormAt
      ? {
          at: toDate(l.ops.servicingFormAt) ?? new Date(),
          by: l.ops.servicingFormBy ?? "",
        }
      : null,
  );
  const [editingForm, setEditingForm] = useState(false);
  const [formMsg, setFormMsg] = useState<string | null>(null);
  const submitForm = async (form: ServicingFormValue) => {
    const r = demo
      ? { outcome: "created", caseId: "demo" }
      : await sendToServicing(l, form);
    setFormDone({ at: new Date(), by: staff.email });
    setEditingForm(false);
    setFormMsg(
      r.outcome === "already"
        ? "Form updated on the servicing case."
        : r.outcome === "linked"
          ? "Sent to servicing (added to this customer's existing case)."
          : "Sent to servicing.",
    );
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const reason = status === "not_interested" ? closeReason : null;
      if (!demo)
        await saveLeadUpdate(
          l,
          {
            status,
            notes,
            assignedTo,
            callbackAt: fromLocalInput(effectiveCallback),
            closeReason: reason,
          },
          staff.email,
        );
      const justConverted =
        status === "converted" && base.status !== "converted";
      setBase({
        status,
        assignedTo,
        notes,
        callback: effectiveCallback,
        reason: reasonKey(reason),
      });
      setCallback(effectiveCallback);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2000);
      // Point them at the Servicing form, which appears below once converted.
      if (justConverted && !formDone)
        window.setTimeout(
          () =>
            document
              .getElementById("servicing-form")
              ?.scrollIntoView({ behavior: "smooth", block: "start" }),
          100,
        );
    } catch (err) {
      setError(
        (err as { code?: string }).code === "permission-denied"
          ? "You don't have permission to update enquiries."
          : "Couldn't save. Check your connection and try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  const tel = `+91${l.phone.replace(/\D/g, "").slice(-10)}`;
  const first = staff.name.split(" ")[0];
  const waText = `Hi${l.name ? ` ${l.name.split(" ")[0]}` : ""}, this is ${first} from HeyNanny. Thanks for your enquiry about ${careShort(l.careType)} in ${l.area}. Is now a good time to talk?`;

  return (
    <div
      className="fixed inset-0 z-30"
      role="dialog"
      aria-modal="true"
      aria-labelledby="detail-title"
    >
      <div
        className="fade-in absolute inset-0 bg-plum/40 backdrop-blur-[2px]"
        onClick={requestClose}
        aria-hidden="true"
      />
      <aside className="panel-in absolute inset-y-0 right-0 flex w-full max-w-[520px] flex-col bg-milk shadow-lift">
        {/* Header */}
        <div className="flex items-start gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0 flex-1">
            <p className="font-mono text-xs text-muted">{leadRef(l)}</p>
            <h2
              id="detail-title"
              className="truncate font-display text-2xl leading-tight text-plum"
            >
              {l.name || careShort(l.careType)}
            </h2>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted">
              <StatusPill status={l.status} />
              <OriginBadge lead={l} />
              <span>Received {formatDateTime(toDate(l.createdAt))}</span>
            </div>
            {returning && (
              <div className="mt-2">
                <ReturningChip info={returning} onOpen={onOpenLead} detailed />
              </div>
            )}
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
          <section
            aria-label="Contact"
            className="rounded-[18px] border border-line bg-paper p-4"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-lg font-bold tabular-nums text-plum">
                  {displayPhone(l.phone)}
                </p>
                {l.email ? (
                  <a
                    href={`mailto:${l.email}`}
                    className="block truncate text-sm text-muted underline-offset-4 hover:underline"
                  >
                    {l.email}
                  </a>
                ) : (
                  <p className="text-sm text-muted">No email given</p>
                )}
              </div>
              <button
                type="button"
                onClick={async () => {
                  await navigator.clipboard
                    ?.writeText(tel)
                    .catch(() => undefined);
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 1500);
                }}
                className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-semibold text-plum ring-1 ring-line hover:bg-white"
              >
                {copied ? (
                  <Check className="size-3.5" aria-hidden="true" />
                ) : (
                  <Copy className="size-3.5" aria-hidden="true" />
                )}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <div
              className={`mt-3 grid gap-2 ${l.email ? "grid-cols-3" : "grid-cols-2"}`}
            >
              <ActionLink
                href={`tel:${tel}`}
                icon={<Phone className="size-4" aria-hidden="true" />}
                label="Call"
                primary
              />
              <ActionLink
                href={whatsappLink(l.phone, waText)}
                icon={<MessageCircle className="size-4" aria-hidden="true" />}
                label="WhatsApp"
                external
              />
              {l.email && (
                <ActionLink
                  href={`mailto:${l.email}?subject=${encodeURIComponent("Your HeyNanny enquiry")}`}
                  icon={<Mail className="size-4" aria-hidden="true" />}
                  label="Email"
                />
              )}
            </div>
          </section>

          {/* Enquiry */}
          <section aria-label="Enquiry details">
            <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-rose-deep">
              Enquiry
            </h3>
            <dl className="mt-2 divide-y divide-line rounded-[18px] border border-line bg-paper text-sm">
              {l.name && <Row label="Name" value={l.name} />}
              <Row label="Type of care" value={l.careType} />
              <Row label="Needed" value={l.when} />
              <Row label="Area" value={l.area} />
              <Row label="Form" value={formName(l)} />
              <Row label="Lead source" value={l.leadSource || "Direct"} />
            </dl>
          </section>

          {/* Meta lead form */}
          {l.meta && (
            <section aria-label="Meta ad">
              <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-rose-deep">
                Meta ad ·{" "}
                {l.meta.isOrganic ? "Organic" : metaPlatform(l.meta.platform)}
              </h3>
              <dl className="mt-2 divide-y divide-line rounded-[18px] border border-line bg-paper text-sm">
                {l.meta.campaignName && (
                  <Row label="Campaign" value={l.meta.campaignName} />
                )}
                {l.meta.adsetName && (
                  <Row label="Ad set" value={l.meta.adsetName} />
                )}
                {l.meta.adName && <Row label="Ad" value={l.meta.adName} />}
                {l.meta.formName && (
                  <Row label="Form" value={l.meta.formName} />
                )}
                {l.meta.rawPhone && (
                  <Row label="Phone as typed" value={l.meta.rawPhone} />
                )}
              </dl>
              {!!l.meta.answers?.length && (
                <>
                  <h4 className="mt-3 text-xs font-semibold text-muted">
                    Form answers
                  </h4>
                  <dl className="mt-1.5 divide-y divide-line rounded-[18px] border border-line bg-paper text-sm">
                    {l.meta.answers.map((a, i) => (
                      <div key={i} className="px-4 py-2.5">
                        <dt className="text-xs text-muted">
                          {questionLabel(a.question)}
                        </dt>
                        <dd className="mt-0.5 break-words font-medium text-plum">
                          {a.answer || "—"}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </>
              )}
            </section>
          )}

          {/* Ops */}
          <section
            aria-label="Update"
            className="rounded-[18px] border border-plum/15 bg-white p-4"
          >
            <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-rose-deep">
              Ops
            </h3>

            <fieldset className="mt-3">
              <legend className="text-sm font-semibold text-plum">
                Status
              </legend>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {STATUS_ORDER.map((s) => (
                  <button
                    key={s}
                    type="button"
                    aria-pressed={status === s}
                    onClick={() => setStatus(s)}
                    className={`h-9 rounded-full px-3.5 text-sm font-semibold transition-colors ${
                      status === s
                        ? "bg-plum text-milk"
                        : "bg-paper text-plum ring-1 ring-line hover:bg-milk"
                    }`}
                  >
                    {STATUS_META[s].label}
                  </button>
                ))}
              </div>
            </fieldset>

            {status === "contacted" && (
              <CallbackPicker value={callback} onChange={setCallback} />
            )}
            {status === "not_interested" && (
              <ReasonPicker value={closeReason} onChange={setCloseReason} />
            )}

            <div className="mt-4">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="assigned-to"
                  className="text-sm font-semibold text-plum"
                >
                  Assigned to
                </label>
                {assignedTo !== staff.email && (
                  <button
                    type="button"
                    onClick={() => setAssignedTo(staff.email)}
                    className="text-xs font-semibold text-rose-deep hover:underline"
                  >
                    Assign to me
                  </button>
                )}
              </div>
              <select
                id="assigned-to"
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
                className="mt-1.5 h-10 w-full rounded-xl border border-line bg-paper px-3 text-sm text-plum focus:border-plum focus:outline-none"
              >
                <option value="">Unassigned</option>
                {assigneeOptions(staffList, staff, assignedTo).map((s) => (
                  <option key={s.email} value={s.email}>
                    {s.name && s.name !== s.email
                      ? `${s.name} (${s.email.split("@")[0]})`
                      : s.email}
                  </option>
                ))}
              </select>
            </div>

            <label className="mt-4 block">
              <span className="text-sm font-semibold text-plum">
                Internal notes
              </span>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={4}
                placeholder="Call outcome, budget, follow-up date… (customers never see this)"
                className="mt-1.5 w-full resize-y rounded-xl border border-line bg-paper px-3 py-2 text-sm text-plum focus:border-plum focus:outline-none"
              />
            </label>

            {base.status === "converted" && (
              <section
                id="servicing-form"
                className={`mt-4 scroll-mt-4 rounded-2xl p-4 ring-1 ${formDone && !editingForm ? "bg-[#f4f0fe] ring-[#ddd3fa]" : "bg-[#fff8e8] ring-[#f1dca8]"}`}
              >
                {formDone && !editingForm ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="flex-1 text-sm text-plum">
                      <span className="inline-flex items-center gap-1.5 font-semibold text-[#5b3cc4]">
                        <Check className="size-4" aria-hidden="true" />{" "}
                        Servicing form submitted · In servicing
                      </span>
                      <span className="block text-xs text-muted">
                        {formMsg ??
                          `Submitted ${formatDateTime(formDone.at)}${formDone.by ? ` by ${staffName(formDone.by, staffList)}` : ""}`}
                      </span>
                      <UpdatedBy
                        by={l.ops?.servicingFormEditedBy}
                        at={toDate(l.ops?.servicingFormEditedAt)}
                        people={staffList}
                        label="Last edited by"
                        className="mt-0.5"
                      />
                    </p>
                    <button
                      type="button"
                      onClick={() => setEditingForm(true)}
                      className="h-9 rounded-full bg-white px-3.5 text-sm font-semibold text-plum ring-1 ring-line hover:bg-milk"
                    >
                      Edit form
                    </button>
                  </div>
                ) : (
                  <>
                    <h3 className="text-sm font-bold text-plum">
                      Servicing form
                    </h3>
                    <p className="mt-0.5 text-xs text-muted">
                      {formDone
                        ? "Update the details sent to servicing."
                        : "Converted. Fill this in to send the customer to the servicing team; until then the enquiry shows “Form pending”."}
                    </p>
                    <div className="mt-3">
                      <ServicingForm
                        compact
                        initial={
                          l.ops?.servicingForm
                            ? formInputFromValue(l.ops.servicingForm)
                            : emptyForm({
                                customerName: l.name ?? "",
                                customerPhone: l.phone,
                                careType: guessCareType(l.careType),
                                location:
                                  l.area && l.area !== "Not specified"
                                    ? l.area
                                    : "",
                              })
                        }
                        submitLabel={
                          formDone
                            ? "Update form"
                            : "Submit & send to servicing"
                        }
                        onSubmit={submitForm}
                      />
                      {formDone && (
                        <button
                          type="button"
                          onClick={() => setEditingForm(false)}
                          className="mt-2 text-xs font-semibold text-muted hover:text-plum"
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  </>
                )}
              </section>
            )}

            <UpdatedBy
              by={l.ops?.updatedBy}
              at={toDate(l.updatedAt)}
              people={staffList}
              className="mt-3"
            />
          </section>

          {/* What servicing is doing for this customer (read-only for sales). */}
          {l.ops?.servicingCaseId && (
            <CaseStatus
              caseId={l.ops.servicingCaseId}
              staff={staff}
              people={allStaff ?? staffList}
              demo={demo}
            />
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-line bg-milk px-5 py-3">
          {error && (
            <p
              role="alert"
              className="mb-2 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700"
            >
              {error}
            </p>
          )}
          {confirmDelete ? (
            <div className="flex flex-wrap items-center gap-2">
              <p className="flex-1 text-sm font-semibold text-red-700">
                Delete this enquiry permanently?
              </p>
              <button
                type="button"
                onClick={remove}
                disabled={deleting}
                className="h-11 rounded-full bg-red-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? "Deleting…" : "Yes, delete"}
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                disabled={deleting}
                className="h-11 rounded-full px-4 text-sm font-semibold text-plum hover:bg-plum/5"
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={save}
                disabled={!dirty || saving || needsReason}
                title={needsReason ? "Choose a reason first" : undefined}
                className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-plum px-5 text-sm font-semibold text-milk transition-colors hover:bg-plum-soft disabled:opacity-50"
              >
                {saved ? <Check className="size-4" aria-hidden="true" /> : null}
                {saving ? "Saving…" : saved ? "Saved" : "Save changes"}
              </button>
              <button
                type="button"
                onClick={requestClose}
                className="h-11 rounded-full px-4 text-sm font-semibold text-plum hover:bg-plum/5"
              >
                Close
              </button>
              {staff.role === "admin" && (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  aria-label="Delete enquiry"
                  title="Delete enquiry"
                  className="grid size-11 place-items-center rounded-full text-red-600 transition-colors hover:bg-red-50"
                >
                  <Trash2 className="size-5" aria-hidden="true" />
                </button>
              )}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

/** Outcome + reason, shown while the status is "Not interested". Required to save. */
function ReasonPicker({
  value,
  onChange,
}: {
  value: CloseReason | null;
  onChange: (v: CloseReason | null) => void;
}) {
  const category = value?.category ?? null;
  const pickCategory = (c: CloseCategory) => {
    if (c === category) return;
    const only =
      CLOSE_REASONS[c].reasons.length === 1 ? CLOSE_REASONS[c].reasons[0]! : "";
    onChange({ category: c, reason: only });
  };
  return (
    <div className="mt-4 rounded-xl bg-paper p-3 ring-1 ring-line">
      <p className="text-sm font-semibold text-plum">
        Why didn&apos;t it go ahead? <span className="text-rose-deep">*</span>
      </p>
      <div
        role="radiogroup"
        aria-label="Outcome"
        className="mt-2 grid grid-cols-3 gap-1.5"
      >
        {CLOSE_CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={category === c}
            onClick={() => pickCategory(c)}
            title={CLOSE_REASONS[c].hint}
            className={`h-9 rounded-full px-2 text-xs font-semibold transition-colors ${
              category === c
                ? "bg-plum text-milk"
                : "bg-white text-plum ring-1 ring-line hover:bg-milk"
            }`}
          >
            {CLOSE_REASONS[c].label}
          </button>
        ))}
      </div>
      {category && (
        <>
          <label
            htmlFor="close-reason"
            className="mt-3 block text-xs text-muted"
          >
            {CLOSE_REASONS[category].hint}
          </label>
          <select
            id="close-reason"
            value={value?.reason ?? ""}
            onChange={(e) => onChange({ category, reason: e.target.value })}
            className="mt-1 h-10 w-full rounded-xl border border-line bg-white px-3 text-sm text-plum focus:border-plum focus:outline-none"
          >
            <option value="" disabled>
              Choose a reason…
            </option>
            {CLOSE_REASONS[category].reasons.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
            {/* Keep an old reason visible if it was removed from the list. */}
            {value?.reason &&
              !CLOSE_REASONS[category].reasons.includes(value.reason) && (
                <option value={value.reason}>{value.reason}</option>
              )}
          </select>
        </>
      )}
      {!value?.reason && (
        <p className="mt-2 text-xs font-medium text-rose-deep">
          Choose an outcome and a reason to save.
        </p>
      )}
    </div>
  );
}

/** Quick presets, all in local time. */
function presets(now: Date): [string, Date][] {
  const at = (days: number, h: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() + days);
    d.setHours(h, 0, 0, 0);
    return d;
  };
  const inTwoHours = new Date(now.getTime() + 2 * 3600_000);
  inTwoHours.setMinutes(inTwoHours.getMinutes() < 30 ? 30 : 60, 0, 0);
  return [
    ["In 2 hours", inTwoHours],
    ["This evening", at(0, 18)],
    ["Tomorrow 10 AM", at(1, 10)],
    ["In 3 days", at(3, 10)],
    ["Next week", at(7, 10)],
  ].filter(([, d]) => (d as Date) > now) as [string, Date][];
}

/** "Call back on" date and time, shown while the status is Contacted. */
function CallbackPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const now = new Date();
  const date = fromLocalInput(value);
  return (
    <div className="mt-4 rounded-xl bg-paper p-3 ring-1 ring-line">
      <div className="flex items-center justify-between gap-2">
        <label
          htmlFor="callback-at"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-plum"
        >
          <CalendarClock className="size-4" aria-hidden="true" />
          Call back on
        </label>
        {value && (
          <button
            type="button"
            onClick={() => onChange("")}
            className="text-xs font-semibold text-rose-deep hover:underline"
          >
            No call back
          </button>
        )}
      </div>
      <input
        id="callback-at"
        type="datetime-local"
        value={value}
        min={toLocalInput(now)}
        step={900}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1.5 h-10 w-full rounded-xl border border-line bg-white px-3 text-sm text-plum focus:border-plum focus:outline-none"
      />
      <div className="mt-2 flex flex-wrap gap-1.5">
        {presets(now).map(([label, d]) => {
          const v = toLocalInput(d);
          return (
            <button
              key={label}
              type="button"
              aria-pressed={value === v}
              onClick={() => onChange(v)}
              className={`h-7 rounded-full px-2.5 text-xs font-semibold transition-colors ${
                value === v
                  ? "bg-plum text-milk"
                  : "bg-white text-plum ring-1 ring-line hover:bg-milk"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-muted">
        {date
          ? `Reminder ${formatCallback(date, now)}. The team sees it on the dashboard.`
          : "Pick a time and the dashboard will remind the team to call back."}
      </p>
    </div>
  );
}

/**
 * Staff from the live list, plus the signed-in person and whoever is currently
 * assigned (so an older or removed assignee still shows instead of going blank).
 */
function assigneeOptions(
  list: StaffMember[],
  me: Staff,
  current: string,
): StaffMember[] {
  const out = [...list];
  const has = (email: string) =>
    out.some((s) => s.email === email.toLowerCase());
  if (!has(me.email))
    out.push({ email: me.email.toLowerCase(), name: me.name, role: me.role });
  if (current && !has(current))
    out.push({ email: current, name: current, role: "" });
  return out;
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
        primary
          ? "bg-plum text-milk hover:bg-plum-soft"
          : "bg-white text-plum ring-1 ring-line hover:bg-milk"
      }`}
    >
      {icon}
      {label}
    </a>
  );
}
