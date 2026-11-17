import { HttpError, adminDb, requireRole } from "@/lib/server/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_HOSTS = new Set(["firebasestorage.googleapis.com"]);

/**
 * GET /api/nannies/{id}/photo   (servicing, supply, managers, admins)
 * Returns the nanny's uploaded photo from our own origin, so the browser can
 * draw it into the profile PDF (the Storage bucket has no CORS set up). The URL
 * comes from her Firestore record, never from the request, and only Firebase
 * Storage links are fetched.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireRole(request, ["servicing", "supply", "manager", "admin"]);
    const { id } = await params;
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(id))
      return new Response("Bad nanny ID", { status: 400 });

    const snap = await adminDb().collection("nannies").doc(id).get();
    const url = snap.get("photoUrl");
    if (typeof url !== "string")
      return new Response("No photo", { status: 404 });
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return new Response("No photo", { status: 404 });
    }
    if (parsed.protocol !== "https:" || !ALLOWED_HOSTS.has(parsed.hostname))
      return new Response("Photo isn't an uploaded one", { status: 404 });

    const res = await fetch(parsed, {
      signal: AbortSignal.timeout(10_000),
      redirect: "error",
    });
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok || !/^image\/(jpeg|png|webp)$/.test(type.split(";")[0]!.trim()))
      return new Response("Couldn't load photo", { status: 502 });
    const body = await res.arrayBuffer();
    if (body.byteLength > MAX_BYTES)
      return new Response("Photo too large", { status: 502 });
    return new Response(body, {
      headers: {
        "Content-Type": type,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    if (err instanceof HttpError)
      return new Response(err.message, { status: err.status });
    console.error("[nanny-photo]", (err as Error).message);
    return new Response("Couldn't load photo", { status: 500 });
  }
}
