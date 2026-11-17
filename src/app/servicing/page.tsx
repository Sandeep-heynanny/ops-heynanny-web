"use client";

import { useState } from "react";

import { ServicingPage } from "@/components/ServicingPage";
import { StaffPage } from "@/components/StaffGate";
import { DEMO_SERVICING_STAFF, demoCases, demoNannies } from "@/lib/demo";
import { canSeeServicing } from "@/lib/firebase";

const DEMO = process.env.NEXT_PUBLIC_OPS_DEMO === "1";

/** /servicing: paid customers from matching to placement. Servicing team and admins only. */
export default function Page() {
  const [demo] = useState(() => (DEMO ? { cases: demoCases(), nannies: demoNannies() } : undefined));
  return (
    <StaffPage allow={canSeeServicing} what="Servicing" demoStaff={DEMO ? DEMO_SERVICING_STAFF : undefined}>
      {(staff) => <ServicingPage staff={staff} demo={demo} />}
    </StaffPage>
  );
}
