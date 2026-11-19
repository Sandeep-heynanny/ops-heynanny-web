import { NextResponse } from "next/server";

import { HttpError, requireRole } from "@/lib/server/admin";
import { saveCaseIntake } from "@/lib/server/servicing";
import { checkServicingForm, formInputFromUnknown } from "@/lib/servicing-form";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/servicing/intake   { caseId, form }   (servicing, managers, admins)
 * Edits the Servicing form on a case and the enquiry's copy of it together
 * (the servicing team can't write enquiries directly).
 */
export async function POST(request: Request) {
  try {
    const { email } = await requireRole(request, [
      "servicing",
      "manager",
      "admin",
    ]);
    const body = (await request.json().catch(() => null)) as {
      caseId?: unknown;
      form?: unknown;
    } | null;
    const caseId =
      typeof body?.caseId === "string" &&
      /^[A-Za-z0-9_-]{1,64}$/.test(body.caseId)
        ? body.caseId
        : null;
    if (!caseId)
      return NextResponse.json({ error: "Missing case ID." }, { status: 400 });
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
    const result = await saveCaseIntake(caseId, checked.value, email);
    if (result === "not_found")
      return NextResponse.json({ error: "Case not found." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof HttpError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("[servicing-intake]", (err as Error).message);
    return NextResponse.json(
      { error: "Couldn't save the form. Try again." },
      { status: 500 },
    );
  }
}
