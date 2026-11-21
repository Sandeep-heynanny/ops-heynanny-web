"use client";

import type { ServicingFormValue } from "@/lib/servicing-form";
import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  limit,
  Timestamp,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  type FieldValue,
} from "firebase/firestore";
import { useEffect, useRef, useState } from "react";

import { auth, db } from "@/lib/firebase";
import type { CloseReason, Lead, LeadStatus } from "@/lib/types";

/** Newest first. Add pagination / date filters in the query when this grows. */
const MAX_LEADS = 1000;

export type LeadsState = {
  leads: Lead[];
  loading: boolean;
  error: string | null;
  /** Enquiries that arrived while the dashboard was open (for the toast). */
  arrivals: Lead[];
  clearArrivals: () => void;
};

/** Live list of website enquiries. Updates instantly when someone submits a form. */
export function useLeads(enabled: boolean, demo?: Lead[]): LeadsState {
  const [leads, setLeads] = useState<Lead[]>(demo ?? []);
  const [loading, setLoading] = useState(!demo);
  const [error, setError] = useState<string | null>(null);
  const [arrivals, setArrivals] = useState<Lead[]>([]);
  const seen = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (!enabled || demo) return;
    const q = query(
      collection(db(), "leads"),
      orderBy("createdAt", "desc"),
      limit(MAX_LEADS),
    );
    return onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => {
          const data = d.data() as Omit<Lead, "id">;
          return { ...data, id: d.id, status: data.status ?? "new" };
        });
        if (seen.current) {
          const fresh = snap
            .docChanges()
            .filter((c) => c.type === "added" && !seen.current!.has(c.doc.id))
            .map((c) => list.find((l) => l.id === c.doc.id)!)
            .filter(Boolean);
          if (fresh.length) setArrivals((a) => [...fresh, ...a].slice(0, 5));
        }
        seen.current = new Set(list.map((l) => l.id));
        setLeads(list);
        setLoading(false);
        setError(null);
      },
      (err) => {
        setError(
          err.code === "permission-denied"
            ? "You don't have permission to read enquiries. Ask an admin to check your role and the Firestore rules."
            : "Couldn't load enquiries. Check your connection.",
        );
        setLoading(false);
      },
    );
  }, [enabled, demo]);

  return {
    leads,
    loading,
    error,
    arrivals,
    clearArrivals: () => setArrivals([]),
  };
}

const STATUS_STAMP: Partial<Record<LeadStatus, string>> = {
  contacted: "ops.contactedAt",
  converted: "ops.convertedAt",
  not_interested: "ops.closedAt",
};

/** Permanently delete an enquiry. Admins only (Firestore rules). Firestore only; a lead already sent to Kylas stays there. */
export async function deleteLead(lead: Lead) {
  await deleteDoc(doc(db(), "leads", lead.id));
}

/** Save the ops fields. Rules only allow `status`, `ops.*` and `updatedAt` to change. */
export async function saveLeadUpdate(
  lead: Lead,
  change: {
    status: LeadStatus;
    notes: string;
    assignedTo: string;
    callbackAt: Date | null;
    closeReason: CloseReason | null;
  },
  by: string,
) {
  const patch: Record<string, string | FieldValue | Timestamp | CloseReason> = {
    status: change.status,
    "ops.notes": change.notes.trim() || deleteField(),
    "ops.assignedTo": change.assignedTo.trim() || deleteField(),
    "ops.updatedBy": by,
    // Call backs only apply while a lead is "contacted".
    "ops.callbackAt":
      change.status === "contacted" && change.callbackAt
        ? Timestamp.fromDate(change.callbackAt)
        : deleteField(),
    // The reason only applies while a lead is "not interested".
    "ops.closeReason":
      change.status === "not_interested" && change.closeReason
        ? change.closeReason
        : deleteField(),
    updatedAt: serverTimestamp(),
  };
  const stamp = STATUS_STAMP[change.status];
  if (stamp && change.status !== lead.status) patch[stamp] = serverTimestamp();
  await updateDoc(doc(db(), "leads", lead.id), patch);
}

/**
 * Hand a converted enquiry to the servicing team (creates or links their case on
 * the server; the ops team can't write servicing data directly).
 */
/** Sales collected the rest of the payment after placement (Payment → Full on the case). */
export async function markPaymentCollected(lead: Pick<Lead, "id">): Promise<void> {
  const user = auth().currentUser;
  if (!user) throw new Error("Not signed in");
  const res = await fetch("/api/servicing/payment-collected", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${await user.getIdToken()}`,
    },
    body: JSON.stringify({ leadId: lead.id }),
  });
  if (!res.ok) {
    const j = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(j?.error ?? "Couldn't save. Try again.");
  }
}

export async function sendToServicing(
  lead: Pick<Lead, "id">,
  form: ServicingFormValue,
): Promise<{ outcome: string; caseId: string | null }> {
  const user = auth().currentUser;
  if (!user) throw new Error("Not signed in");
  const res = await fetch("/api/servicing/from-lead", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${await user.getIdToken()}`,
    },
    body: JSON.stringify({ leadId: lead.id, form }),
  });
  const body = (await res.json().catch(() => null)) as {
    outcome?: string;
    caseId?: string | null;
    error?: string;
  } | null;
  if (!res.ok || !body)
    throw new Error(body?.error ?? "Couldn't submit the form.");
  return { outcome: body.outcome ?? "created", caseId: body.caseId ?? null };
}

/* ---------------- returning customers ---------------- */

export type Returning = {
  /** Their most recent earlier enquiry that was converted (they paid). */
  previous: Lead;
  /** How many earlier enquiries from this number were converted. */
  times: number;
};

/**
 * Enquiries from someone who converted before (same 10-digit phone, an earlier
 * enquiry marked Converted). Only enquiries loaded on the dashboard (the latest
 * 1,000) are checked.
 */
export function findReturning(leads: Lead[]): Map<string, Returning> {
  const ten = (p: string | null | undefined) =>
    (p ?? "").replace(/\D/g, "").slice(-10);
  const ms = (l: Lead) => l.createdAt?.toMillis?.() ?? 0;
  const converted = new Map<string, Lead[]>();
  for (const l of leads) {
    if (l.status !== "converted" && !l.ops?.convertedAt) continue;
    const p = ten(l.phone);
    if (p.length !== 10) continue;
    converted.set(p, [...(converted.get(p) ?? []), l]);
  }
  const out = new Map<string, Returning>();
  for (const l of leads) {
    const earlier = (converted.get(ten(l.phone)) ?? []).filter(
      (x) => x.id !== l.id && ms(x) < ms(l),
    );
    if (!earlier.length) continue;
    const previous = earlier.reduce((a, b) => (ms(b) > ms(a) ? b : a));
    out.set(l.id, { previous, times: earlier.length });
  }
  return out;
}
