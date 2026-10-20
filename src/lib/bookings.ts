"use client";

import {
  collection,
  deleteField,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  type FieldValue,
} from "firebase/firestore";
import { useEffect, useRef, useState } from "react";

import { db } from "@/lib/firebase";
import type { Booking, BookingStatus } from "@/lib/types";

/** Newest first. Enough for the early days; add pagination / date filters in the query when this grows. */
const MAX_BOOKINGS = 1000;

export type BookingsState = {
  bookings: Booking[];
  loading: boolean;
  error: string | null;
  /** Requests that arrived while the dashboard was open (for the toast). */
  arrivals: Booking[];
  clearArrivals: () => void;
};

/** Live list of bookings. Updates instantly when a customer submits a request. */
export function useBookings(enabled: boolean, demo?: Booking[]): BookingsState {
  const [bookings, setBookings] = useState<Booking[]>(demo ?? []);
  const [loading, setLoading] = useState(!demo);
  const [error, setError] = useState<string | null>(null);
  const [arrivals, setArrivals] = useState<Booking[]>([]);
  const seen = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (!enabled || demo) return;
    const q = query(collection(db(), "bookings"), orderBy("createdAt", "desc"), limit(MAX_BOOKINGS));
    return onSnapshot(
      q,
      { includeMetadataChanges: false },
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Booking, "id">) }));
        if (seen.current) {
          const fresh = snap
            .docChanges()
            .filter((c) => c.type === "added" && !seen.current!.has(c.doc.id))
            .map((c) => list.find((b) => b.id === c.doc.id)!)
            .filter(Boolean);
          if (fresh.length) setArrivals((a) => [...fresh, ...a].slice(0, 5));
        }
        seen.current = new Set(list.map((b) => b.id));
        setBookings(list);
        setLoading(false);
        setError(null);
      },
      (err) => {
        setError(
          err.code === "permission-denied"
            ? "You don't have permission to read bookings. Ask an admin to check your role and the Firestore rules."
            : "Couldn't load bookings. Check your connection.",
        );
        setLoading(false);
      },
    );
  }, [enabled, demo]);

  return { bookings, loading, error, arrivals, clearArrivals: () => setArrivals([]) };
}

const STATUS_STAMP: Partial<Record<BookingStatus, string>> = {
  contacted: "ops.contactedAt",
  confirmed: "ops.confirmedAt",
  cancelled: "ops.cancelledAt",
  completed: "ops.completedAt",
};

/** Save the ops fields. Rules only allow `status`, `ops.*` and `updatedAt` to change. */
export async function saveOpsUpdate(
  booking: Booking,
  change: { status: BookingStatus; notes: string; assignedTo: string },
  by: string,
) {
  const patch: Record<string, string | FieldValue> = {
    status: change.status,
    "ops.notes": change.notes.trim() || deleteField(),
    "ops.assignedTo": change.assignedTo.trim() || deleteField(),
    "ops.updatedBy": by,
    updatedAt: serverTimestamp(),
  };
  const stamp = STATUS_STAMP[change.status];
  if (stamp && change.status !== booking.status) patch[stamp] = serverTimestamp();
  await updateDoc(doc(db(), "bookings", booking.id), patch);
}
