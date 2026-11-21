import { NextResponse } from "next/server";

import { HttpError, requireRole } from "@/lib/server/admin";
import { markPaymentCollected } from "@/lib/server/servicing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/servicing/payment-collected   { leadId }   (sales, managers, admins)
 * The nanny is placed and sales collected the rest of the payment: Payment
 * becomes Full on the case (sales can't write servicing cases directly).
 */
export async function POST(request: Request) {
  try {
    const { email } = await requireRole(request, ["sales", "ops", "manager", "admin"]);
    const body = (await request.json().catch(() => null)) as { leadId?: unknown } | null;
    const leadId =
      typeof body?.leadId === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(body.leadId) ? body.leadId : null;
    if (!leadId) return NextResponse.json({ error: "Missing enquiry ID." }, { status: 400 });
    const outcome = await markPaymentCollected(leadId, email);
    if (outcome === "not_found") return NextResponse.json({ error: "Enquiry not found." }, { status: 404 });
    if (outcome === "no_case")
      return NextResponse.json({ error: "This customer has no servicing case yet." }, { status: 409 });
    return NextResponse.json({ ok: true, outcome });
  } catch (err) {
    if (err instanceof HttpError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("[payment-collected]", (err as Error).message);
    return NextResponse.json({ error: "Couldn't save. Try again." }, { status: 500 });
  }
}
