"use client";

import { collection, onSnapshot } from "firebase/firestore";
import { useEffect, useState } from "react";

import { db } from "@/lib/firebase";

/** Someone who can be assigned enquiries. Written by `npm run role` (scripts/set-role.mjs). */
export type StaffMember = { email: string; name: string; role: string };

export const DEMO_STAFF_LIST: StaffMember[] = [
  { email: "priya@heynanny.in", name: "Priya Sharma", role: "sales" },
  { email: "arjun@heynanny.in", name: "Arjun Das", role: "sales" },
  { email: "sandeep@heynanny.in", name: "Sandeep", role: "admin" },
  { email: "ravi@heynanny.in", name: "Ravi Kumar", role: "servicing" },
  { email: "lakshmi@heynanny.in", name: "Lakshmi N", role: "servicing" },
];

/** Live list of ops staff (Firestore `staff`), sorted by name. Empty if it can't be read. */
export function useStaffList(demo: boolean): StaffMember[] {
  const [list, setList] = useState<StaffMember[]>(demo ? DEMO_STAFF_LIST : []);
  useEffect(() => {
    if (demo) return;
    return onSnapshot(
      collection(db(), "staff"),
      (snap) =>
        setList(
          snap.docs
            .map((d) => d.data() as StaffMember)
            .filter((s) => typeof s.email === "string")
            .sort((a, b) =>
              (a.name || a.email).localeCompare(b.name || b.email),
            ),
        ),
      () => setList([]),
    );
  }, [demo]);
  return list;
}

/** "priya@heynanny.in" → "Priya Sharma" when known, else the part before @. */
export function staffName(
  email: string | null | undefined,
  list: StaffMember[],
) {
  if (!email) return "";
  return (
    list.find((s) => s.email === email.toLowerCase())?.name ||
    email.split("@")[0]!
  );
}

/** People who can be assigned enquiries (sales team, managers, admins; "ops" is the old name for sales). */
export const enquiryStaff = (list: StaffMember[]) =>
  list.filter(
    (s) =>
      s.role === "sales" ||
      s.role === "ops" ||
      s.role === "manager" ||
      s.role === "admin",
  );
/** People who can be assigned servicing cases (servicing team, managers, admins). */
export const servicingStaff = (list: StaffMember[]) =>
  list.filter(
    (s) => s.role === "servicing" || s.role === "manager" || s.role === "admin",
  );
