import { NextResponse } from "next/server";

import { HttpError, requireAdmin } from "@/lib/server/admin";
import { CashfreeError, fetchRefundsByDate } from "@/lib/server/cashfree";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/cashfree/refunds?from=<epoch ms>&to=<epoch ms>   (admins only)
 * Refunds straight from Cashfree (PG reconciliation) for [from, to), by refund date.
 */
export async function GET(request: Request) {
  try {
    await requireAdmin(request);
    const url = new URL(request.url);
    const from = Number(url.searchParams.get("from"));
    const to = Number(url.searchParams.get("to"));
    if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from || to - from > 130 * 86_400_000) {
      return NextResponse.json({ error: "Invalid date range (max about 4 months)." }, { status: 400 });
    }
    const scan = await fetchRefundsByDate(new Date(from), new Date(to));
    if (!scan.refunds.length) console.info("[refunds] none found", { scanned: scan.scanned, types: scan.types, sampleKeys: scan.sampleKeys });
    return NextResponse.json(scan, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof HttpError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof CashfreeError) {
      console.error("[refunds]", err.message);
      return NextResponse.json({ error: err.message }, { status: 502 });
    }
    console.error("[refunds]", (err as Error).message);
    return NextResponse.json({ error: "Couldn't load refunds." }, { status: 500 });
  }
}
