import { NextResponse } from "next/server";

import { adminDb, HttpError, requireRole } from "@/lib/server/admin";
import { checkNewLead, newLeadFromUnknown } from "@/lib/new-lead";
import {
  leadRef,
  STATUS_META,
  TEAM_CHANNEL,
  type LeadStatus,
} from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/leads   (sales, servicing, managers, admins)
 * Adds an enquiry from the dashboard, e.g. a referral the servicing team hears about.
 * It lands in Enquiries as "New" for the sales team. Written here because the
 * servicing team can't write enquiries directly.
 */
export async function POST(request: Request) {
  try {
    const { uid, email } = await requireRole(request, [
      "sales",
      "ops",
      "servicing",
      "manager",
      "admin",
    ]);
    const f = newLeadFromUnknown(await request.json().catch(() => null));
    const errors = checkNewLead(f);
    if (Object.keys(errors).length)
      return NextResponse.json(
        { error: Object.values(errors)[0], fields: errors },
        { status: 422 },
      );

    const db = adminDb();
    // Don't open a second enquiry while sales is still working on one for this number.
    const same = await db
      .collection("leads")
      .where("phone", "==", f.phone)
      .get();
    const open = same.docs.find((d) =>
      ["new", "contacted"].includes(d.get("status")),
    );
    if (open) {
      const status =
        STATUS_META[open.get("status") as LeadStatus]?.label ??
        open.get("status");
      return NextResponse.json(
        {
          error: `This number already has an open enquiry (${leadRef({ id: open.id })}, ${status}). Ask the sales team to follow it up.`,
        },
        { status: 409 },
      );
    }

    const notes = [
      f.source === "Referral" && f.referredBy
        ? `Referred by ${f.referredBy}.`
        : "",
      f.note,
    ]
      .filter(Boolean)
      .join("\n");
    const now = new Date();
    const ref = db.collection("leads").doc();
    await ref.create({
      userId: uid,
      channel: TEAM_CHANNEL,
      status: "new",
      name: f.name,
      careType: f.careType,
      when: f.when,
      area: f.area,
      phone: f.phone,
      email: f.email || null,
      leadSource: f.source,
      page: null,
      createdAt: now,
      updatedAt: now,
      ops: { createdBy: email, updatedBy: email, ...(notes ? { notes } : {}) },
    });
    return NextResponse.json({
      ok: true,
      id: ref.id,
      ref: leadRef({ id: ref.id }),
    });
  } catch (err) {
    if (err instanceof HttpError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("[leads-create]", (err as Error).message);
    return NextResponse.json(
      { error: "Couldn't add the enquiry. Try again." },
      { status: 500 },
    );
  }
}
