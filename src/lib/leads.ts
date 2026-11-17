"use client";

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

import { db } from "@/lib/firebase";
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
    const q = query(collection(db(), "leads"), orderBy("createdAt", "desc"), limit(MAX_LEADS));
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

  return { leads, loading, error, arrivals, clearArrivals: () => setArrivals([]) };
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
  change: { status: LeadStatus; notes: string; assignedTo: string; callbackAt: Date | null; closeReason: CloseReason | null },
  by: string,
) {
  const patch: Record<string, string | FieldValue | Timestamp | CloseReason> = {
    status: change.status,
    "ops.notes": change.notes.trim() || deleteField(),
    "ops.assignedTo": change.assignedTo.trim() || deleteField(),
    "ops.updatedBy": by,
    // Call backs only apply while a lead is "contacted".
    "ops.callbackAt": change.status === "contacted" && change.callbackAt ? Timestamp.fromDate(change.callbackAt) : deleteField(),
    // The reason only applies while a lead is "not interested".
    "ops.closeReason": change.status === "not_interested" && change.closeReason ? change.closeReason : deleteField(),
    updatedAt: serverTimestamp(),
  };
  const stamp = STATUS_STAMP[change.status];
  if (stamp && change.status !== lead.status) patch[stamp] = serverTimestamp();
  await updateDoc(doc(db(), "leads", lead.id), patch);
}
