"use client";

import { useState, type ReactNode } from "react";

import { SidePanel } from "@/components/NanniesPage";
import {
  checkNewLead,
  emptyNewLead,
  NEW_LEAD_CARE_TYPES,
  NEW_LEAD_WHEN,
  type NewLeadInput,
} from "@/lib/new-lead";
import { auth } from "@/lib/firebase";
import { TEAM_LEAD_SOURCES } from "@/lib/types";

const input =
  "mt-1 h-10 w-full rounded-xl border border-line bg-white px-3 text-sm text-plum focus:border-plum focus:outline-none";

/**
 * Add an enquiry from the dashboard (a referral, a call…). It goes to the
 * sales team's Enquiries list as New; Source defaults to Referral.
 */
export function NewEnquiryPanel({
  demo,
  forSales,
  onClose,
  onCreated,
}: {
  demo: boolean;
  /** The sales team sees the enquiry in their own list; others get a "sent to sales" note. */
  forSales: boolean;
  onClose: () => void;
  onCreated: (r: { id: string; ref: string }) => void;
}) {
  const [f, setF] = useState<NewLeadInput>(emptyNewLead);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errors = checkNewLead(f);
  const show = (k: keyof NewLeadInput) => (tried ? errors[k] : undefined);
  const set = (k: keyof NewLeadInput) => (e: { target: { value: string } }) =>
    setF((x) => ({ ...x, [k]: e.target.value }));

  const submit = async () => {
    setTried(true);
    setError(null);
    if (Object.keys(errors).length) return;
    setBusy(true);
    try {
      const r = demo
        ? { id: "demo", ref: "ENQ-DEMO01" }
        : await createTeamLead(f);
      onCreated(r);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SidePanel title="New enquiry" onClose={onClose}>
      <form
        className="flex-1 space-y-4 overflow-y-auto px-5 py-5"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <p className="text-sm text-muted">
          {forSales
            ? "Add an enquiry that didn't come through the website, like a referral or a phone call."
            : "Heard about a family who needs a nanny? Add them here and the sales team will call them."}
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Customer name *" error={show("name")}>
            <input
              value={f.name}
              onChange={set("name")}
              maxLength={80}
              className={input}
            />
          </Field>
          <Field label="Phone *" error={show("phone")}>
            <input
              value={f.phone}
              onChange={set("phone")}
              inputMode="tel"
              placeholder="98765 43210"
              maxLength={16}
              className={`${input} tabular-nums`}
            />
          </Field>
          <Field label="Type of care *" error={show("careType")}>
            <select
              value={f.careType}
              onChange={set("careType")}
              className={input}
            >
              <option value="">Choose…</option>
              {NEW_LEAD_CARE_TYPES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
          <Field label="Needed" error={show("when")}>
            <select value={f.when} onChange={set("when")} className={input}>
              {NEW_LEAD_WHEN.map((w) => (
                <option key={w}>{w}</option>
              ))}
            </select>
          </Field>
          <Field label="Area *" error={show("area")}>
            <input
              value={f.area}
              onChange={set("area")}
              placeholder="e.g. HSR Layout"
              maxLength={120}
              className={input}
            />
          </Field>
          <Field label="Email" error={show("email")}>
            <input
              value={f.email}
              onChange={set("email")}
              type="email"
              maxLength={120}
              className={input}
            />
          </Field>
          <Field label="Source *" error={show("source")}>
            <select value={f.source} onChange={set("source")} className={input}>
              {TEAM_LEAD_SOURCES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </Field>
          {f.source === "Referral" && (
            <Field label="Referred by">
              <input
                value={f.referredBy}
                onChange={set("referredBy")}
                placeholder="Customer or nanny name"
                maxLength={80}
                className={input}
              />
            </Field>
          )}
          <div className="sm:col-span-2">
            <Field label="Note for sales">
              <textarea
                value={f.note}
                onChange={set("note")}
                maxLength={1000}
                rows={3}
                className={`${input} h-auto py-2`}
              />
            </Field>
          </div>
        </div>
        {error && <p className="text-sm text-red-700">{error}</p>}
        <div className="flex justify-end gap-2 border-t border-line pt-4">
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-full px-4 text-sm font-semibold text-plum"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className="h-10 rounded-full bg-plum px-5 text-sm font-semibold text-milk disabled:opacity-50"
          >
            {busy ? "Adding…" : "Add enquiry"}
          </button>
        </div>
      </form>
    </SidePanel>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="block text-xs font-semibold text-muted">
      {label}
      {children}
      {error && (
        <span className="mt-1 block font-normal text-red-700">{error}</span>
      )}
    </label>
  );
}

export async function createTeamLead(
  f: NewLeadInput,
): Promise<{ id: string; ref: string }> {
  const user = auth().currentUser;
  if (!user) throw new Error("Not signed in");
  const res = await fetch("/api/leads", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${await user.getIdToken()}`,
    },
    body: JSON.stringify(f),
  });
  const body = (await res.json().catch(() => null)) as {
    error?: string;
    id?: string;
    ref?: string;
  } | null;
  if (!res.ok || !body?.id)
    throw new Error(body?.error ?? "Couldn't add the enquiry.");
  return { id: body.id, ref: body.ref ?? "" };
}
