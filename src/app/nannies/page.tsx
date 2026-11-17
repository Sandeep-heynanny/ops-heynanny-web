"use client";

import { useState } from "react";

import { NanniesPage } from "@/components/NanniesPage";
import { StaffPage } from "@/components/StaffGate";
import { DEMO_SERVICING_STAFF, demoNannies } from "@/lib/demo";
import { canSeeNannies } from "@/lib/firebase";

const DEMO = process.env.NEXT_PUBLIC_OPS_DEMO === "1";

/** /nannies: caregiver database. Servicing team and admins only. */
export default function Page() {
  const [demo] = useState(() => (DEMO ? demoNannies() : undefined));
  return (
    <StaffPage allow={canSeeNannies} what="Nannies" demoStaff={DEMO ? DEMO_SERVICING_STAFF : undefined}>
      {(staff) => <NanniesPage staff={staff} demo={demo} />}
    </StaffPage>
  );
}
