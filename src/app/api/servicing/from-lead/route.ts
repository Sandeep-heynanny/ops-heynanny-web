import { NextResponse } from "next/server";

import { HttpError, requireRole } from "@/lib/server/admin";
import { sendLeadToServicing } from "@/lib/server/servicing";
import { checkServicingForm, formInputFromUnknown } from "@/lib/servicing-form";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/servicing/from-lead   { leadId, form }   (ops, managers, admins)
 * Submits the Servicing form for a converted enquiry, which sends the customer
 * to servicing (creates or links their case).
 * The ops team can't read servicing data; this runs on the server so they can
 * still hand a customer over.
 */
export async function POST(request: Request) {
  try {
    const { email } = await requireRole(request, ["sales", "ops", "manager", "admin"]);
    const body = (await request.json().catch(() => null)) as {
      leadId?: unknown;
      form?: unknown;
    } | null;
    const leadId =
      typeof body?.leadId === "string" &&
      /^[A-Za-z0-9_-]{1,64}$/.test(body.leadId)
        ? body.leadId
        : null;
    if (!leadId)
      return NextResponse.json(
        { error: "Missing enquiry ID." },
        { status: 400 },
      );
    // Checked again here: the browser's checks can be skipped.
    const checked = checkServicingForm(formInputFromUnknown(body?.form));
    if (checked.errors)
      return NextResponse.json(
        {
          error: `Fill in every required question (${Object.keys(checked.errors).join(", ")}).`,
          fields: checked.errors,
        },
        { status: 422 },
      );
    const result = await sendLeadToServicing(leadId, email, checked.value);
    if (result.outcome === "not_converted")
      return NextResponse.json(
        { error: "Mark the enquiry as Converted first." },
        { status: 409 },
      );
    if (result.outcome === "no_phone")
      return NextResponse.json(
        { error: "This enquiry has no valid phone number." },
        { status: 422 },
      );
    if (result.outcome === "not_found")
      return NextResponse.json(
        { error: "Enquiry not found." },
        { status: 404 },
      );
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof HttpError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("[from-lead]", (err as Error).message);
    return NextResponse.json(
      { error: "Couldn't send to servicing. Try again." },
      { status: 500 },
    );
  }
}
