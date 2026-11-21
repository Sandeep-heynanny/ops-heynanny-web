#!/usr/bin/env node
/**
 * Copy a few production records into the STAGING project for testing, with
 * fake names, phone numbers, emails and addresses. Production is only read.
 *
 *   npm run copy-to-staging                 # copy (re-running overwrites the same records)
 *   npm run copy-to-staging -- --fresh      # first empty staging's test collections, then copy
 *   npm run copy-to-staging -- --dry-run    # show what would be copied; writes nothing
 *   npm run copy-to-staging -- --self-test  # check the scrubbing on sample data (no Firebase)
 *
 * What it copies: ~10 servicing cases (one per stage where possible, plus
 * cancelled/refund ones), the enquiries, nannies, bookings and Cashfree payment
 * records linked to them, topped up with recent enquiries and nannies.
 *
 * What it changes: names, phones, emails, exact addresses and free-text notes
 * are replaced; map points are moved a few hundred metres; Cashfree order and
 * payment IDs get a TEST- prefix; nanny documents (Aadhaar, BGV) are dropped;
 * internal notes and care-day subcollections are not copied. The same real
 * value always becomes the same fake one (salt in scripts/.staging-salt,
 * git-ignored), so a lead, its case and its booking still match up.
 *
 * Credentials: `gcloud auth application-default login` with a Google account
 * that can read production and write staging (same as `npm run role`).
 * Override the target with STAGING_PROJECT_ID=... (must contain "staging").
 */
import { createHmac, randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { applicationDefault, initializeApp } from "firebase-admin/app";
import { DocumentReference, GeoPoint, getFirestore, Timestamp } from "firebase-admin/firestore";

const PROD = "hey-nanny-web";
const STAGING = process.env.STAGING_PROJECT_ID || "hey-nanny-staging";
const args = new Set(process.argv.slice(2));
const DRY = args.has("--dry-run");
const FRESH = args.has("--fresh");

const COUNTS = { cases: 10, leads: 20, nannies: 20, bookings: 6 };
const COLLECTIONS = ["nannies", "leads", "servicing", "bookings", "cashfreePayments", "cashfreeRefunds"];

/* ---------------- fake values ---------------- */

const saltPath = new URL("./.staging-salt", import.meta.url);
function salt() {
  if (!existsSync(saltPath)) writeFileSync(saltPath, randomBytes(32).toString("hex"));
  return readFileSync(saltPath, "utf8").trim();
}
let SALT = null;
const h = (kind, v) => createHmac("sha256", (SALT ??= salt())).update(`${kind}:${v}`).digest();

const NANNY_FIRST = ["Lakshmi", "Savitha", "Meena", "Radha", "Kavya", "Sunita", "Geetha", "Asha", "Rekha", "Pooja",
  "Anitha", "Shobha", "Divya", "Nirmala", "Sarita", "Bhavani", "Usha", "Manjula", "Rani", "Shanti"];
const CUST_FIRST = ["Arjun", "Priya", "Rahul", "Sneha", "Vikram", "Ananya", "Karthik", "Neha", "Rohan", "Isha",
  "Aditya", "Meera", "Siddharth", "Tanvi", "Nikhil", "Riya", "Varun", "Aditi", "Manish", "Shreya"];
const LAST = ["Sharma", "Rao", "Iyer", "Reddy", "Nair", "Gupta", "Patel", "Menon", "Joshi", "Kulkarni",
  "Shetty", "Das", "Verma", "Pillai", "Hegde", "Bose", "Kapoor", "Naidu", "Mishra", "Desai"];

function fakeName(orig, pool) {
  const b = h("name", String(orig).trim().toLowerCase());
  const first = (pool === "nanny" ? NANNY_FIRST : CUST_FIRST)[b[0] % 20];
  return `${first} ${LAST[b[1] % 20]} (Test)`;
}

/** Same format as the original: "9876543210", "+919876543210" or "919876543210". Fakes start 6000. */
function fakePhone(orig) {
  const digits = String(orig).replace(/\D/g, "");
  if (digits.length < 10) return orig;
  const last10 = digits.slice(-10);
  const n = h("phone", last10).readUInt32BE(0) % 1_000_000;
  const fake = `6000${String(n).padStart(6, "0")}`;
  const s = String(orig).trim();
  if (s.startsWith("+")) return `+91${fake}`;
  if (digits.length === 12 && digits.startsWith("91")) return `91${fake}`;
  return fake;
}

const isStaffEmail = (e) => /@heynanny\.in$/i.test(e);
const fakeEmail = (orig) => (isStaffEmail(orig) ? orig : `test.${h("email", orig.toLowerCase()).toString("hex").slice(0, 8)}@example.com`);
const testId = (v) => (typeof v === "string" && v && !v.startsWith("TEST-") ? `TEST-${v}` : v);

/** Up to ~450 m, the same shift for the same point. */
function jitter(lat, lng) {
  const b = h("geo", `${lat.toFixed(5)},${lng.toFixed(5)}`);
  return [lat + ((b[0] / 255) * 2 - 1) * 0.004, lng + ((b[1] / 255) * 2 - 1) * 0.004];
}

const PHONE_IN_TEXT = /(?:\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}\b/g;
const EMAIL_IN_TEXT = /[\w.+-]+@[\w-]+\.[\w.]+/g;
const scrubText = (s) => s.replace(PHONE_IN_TEXT, (m) => fakePhone(m)).replace(EMAIL_IN_TEXT, (m) => fakeEmail(m));

/* ---------------- scrubbing ---------------- */

const DROP = new Set(["documents", "kylas", "rawphone"]);
const PHONE_KEY = /phone|mobile|whatsapp/;
const NAME_KEYS = new Set(["name", "customername", "customer_name", "nannyname", "placednanny", "firstname", "lastname", "fullname"]);
const NANNY_NAME_KEYS = new Set(["nannyname", "placednanny"]);
const CUSTOMER_NAME_KEYS = new Set(["customername", "customer_name"]);
const ADDRESS_KEYS = new Set(["address", "location", "fulladdress", "addressline", "addressline1", "addressline2", "landmark", "street", "flat", "pincode", "pin"]);
const FREE_TEXT_KEYS = new Set(["notes", "note", "message", "comment", "comments", "answer", "ticketnumber", "remarks"]);
const ID_KEYS = new Set(["orderid", "order_id", "paymentid", "cfpaymentid", "cf_payment_id", "cfrefundid", "cf_refund_id", "refund_arn", "arn", "bank_reference", "reference"]);
const USER_KEYS = new Set(["userid", "uid", "customer_id"]);
const NANNY_CONTEXT = /^(nanny|proposals|placement|placementhistory|replacement)$/;

/**
 * @param v value
 * @param key its field name (lowercased) or null
 * @param ctx { nanny: boolean } whether a bare `name` here belongs to a nanny
 * @param toRef maps a production DocumentReference to staging
 */
export function scrub(v, key = null, ctx = { nanny: false }, toRef = (r) => r) {
  if (v === null || v === undefined) return v;
  if (v instanceof Timestamp) return v;
  if (v instanceof GeoPoint) {
    const [la, ln] = jitter(v.latitude, v.longitude);
    return new GeoPoint(la, ln);
  }
  if (v instanceof DocumentReference) return toRef(v);
  if (Array.isArray(v)) return v.map((x) => scrub(x, key, ctx, toRef));
  if (typeof v === "object") {
    const out = {};
    const isPoint = typeof v.lat === "number" && typeof v.lng === "number";
    for (const [k, x] of Object.entries(v)) {
      const lk = k.toLowerCase();
      if (DROP.has(lk)) continue;
      const childCtx = NANNY_CONTEXT.test(lk) ? { nanny: true } : lk === "customer" || lk === "intake" ? { nanny: false } : ctx;
      out[k] = scrub(x, lk, childCtx, toRef);
    }
    if (isPoint) [out.lat, out.lng] = jitter(v.lat, v.lng);
    return out;
  }
  if (typeof v !== "string") return v;
  if (!key) return scrubText(v);
  if (USER_KEYS.has(key)) return "test-user";
  if (ID_KEYS.has(key)) return testId(v);
  if (PHONE_KEY.test(key)) return fakePhone(v);
  if (key.includes("email")) return v.includes("@") ? fakeEmail(v) : v;
  if (NAME_KEYS.has(key)) {
    const pool = NANNY_NAME_KEYS.has(key) ? "nanny" : CUSTOMER_NAME_KEYS.has(key) ? "customer" : ctx.nanny ? "nanny" : "customer";
    return v.trim() ? fakeName(v, pool) : v;
  }
  if (ADDRESS_KEYS.has(key)) return v.trim() ? `Test address ${h("addr", v).toString("hex").slice(0, 4).toUpperCase()}` : v;
  if (FREE_TEXT_KEYS.has(key)) return v.trim() ? "Test note (copied from production, text removed)" : v;
  return scrubText(v);
}

/* ---------------- self-test ---------------- */

function selfTest() {
  SALT = "self-test-salt";
  const sample = {
    customer: { name: "Real Customer", phone: "+919876543210", email: "real@gmail.com" },
    leadId: "abc123",
    intake: { customerName: "Real Customer", location: "Flat 4B, Prestige Sunrise, HSR", locationGeo: { lat: 12.91, lng: 77.64, area: "HSR Layout" } },
    proposals: [{ nannyId: "n1", nanny: { name: "Real Nanny", phone: "9123456789" } }],
    payments: [{ orderId: "HN-abc-1", cfPaymentId: "555", amount: 5000 }],
    interviewRequests: { n1: { nannyName: "Real Nanny" } },
    ops: { notes: "Called 9876543210, she said ok", assignedTo: "priya@heynanny.in" },
    updatedBy: "sandeep@heynanny.in",
    documents: { aadhaar: { path: "nannies/x/docs/a.pdf" } },
    meta: { answers: [{ question: "Your name?", answer: "Real Customer" }] },
  };
  const lead = { name: "Real Customer", phone: "9876543210", email: "real@gmail.com", userId: "anon-uid" };
  const out = scrub(sample);
  const outLead = scrub(lead);
  console.log(JSON.stringify({ case: out, lead: outLead }, null, 2));
  const text = JSON.stringify([out, outLead]);
  const leaks = ["Real Customer", "Real Nanny", "9876543210", "9123456789", "real@gmail.com", "Prestige", "anon-uid", "nannies/x/docs"].filter((s) => text.includes(s));
  const linked = out.customer.phone === `+91${outLead.phone}` && out.customer.name === outLead.name;
  console.log(leaks.length ? `✗ Leaked: ${leaks.join(", ")}` : "✓ No real values left");
  console.log(linked ? "✓ Case and enquiry still match (same fake phone and name)" : "✗ Case and enquiry no longer match");
  console.log(out.ops.assignedTo === "priya@heynanny.in" ? "✓ Staff emails kept" : "✗ Staff email changed");
  process.exit(leaks.length || !linked ? 1 : 0);
}

/* ---------------- copy ---------------- */

async function main() {
  if (STAGING === PROD || !/staging/i.test(STAGING)) {
    console.error(`✗ Refusing to write to "${STAGING}": the target must be a staging project.`);
    process.exit(1);
  }
  const prodApp = initializeApp({ projectId: PROD, credential: applicationDefault() }, "prod");
  const stagingApp = initializeApp({ projectId: STAGING, credential: applicationDefault() }, "staging");
  const prod = getFirestore(prodApp);
  const staging = getFirestore(stagingApp);
  const toRef = (r) => staging.doc(r.path);
  const ms = (t) => (t && typeof t.toMillis === "function" ? t.toMillis() : 0);
  const recent = async (name, limit) =>
    (await prod.collection(name).orderBy("createdAt", "desc").limit(limit).get()).docs;
  const byIds = async (name, ids) => {
    const out = [];
    for (const id of [...ids].filter(Boolean)) {
      const s = await prod.collection(name).doc(id).get();
      if (s.exists) out.push(s);
    }
    return out;
  };

  console.log(`Reading from ${PROD} (read-only)…`);

  // 1. Servicing cases: one per stage first, refund cases, then the most recent.
  const allCases = await recent("servicing", 400);
  const picked = new Map();
  const add = (d) => picked.size < COUNTS.cases && !picked.has(d.id) && picked.set(d.id, d);
  const refund = (d) => d.get("cancellation.refund.status");
  allCases.filter((d) => d.get("stage") === "cancelled" && ["pending", "initiated"].includes(refund(d))).slice(0, 1).forEach(add);
  allCases.filter((d) => d.get("stage") === "cancelled" && refund(d) === "processed").slice(0, 1).forEach(add);
  for (const stage of ["new", "profiles_shared", "interviews", "approved", "placed", "on_hold", "cancelled"]) {
    const d = allCases.find((x) => x.get("stage") === stage && !picked.has(x.id));
    if (d) add(d);
  }
  allCases.forEach(add);
  const cases = [...picked.values()];

  // 2. Everything they point to.
  const leadIds = new Set(), bookingIds = new Set(), nannyIds = new Set(), orderIds = new Set();
  for (const c of cases) {
    const d = c.data();
    if (d.leadId) leadIds.add(d.leadId);
    if (d.bookingId) bookingIds.add(d.bookingId);
    for (const p of d.proposals ?? []) if (p?.nannyId) nannyIds.add(p.nannyId);
    for (const p of d.placementHistory ?? []) if (p?.nannyId) nannyIds.add(p.nannyId);
    if (d.placement?.nannyId) nannyIds.add(d.placement.nannyId);
    for (const p of d.payments ?? []) if (p?.orderId && p.orderId !== "manual") orderIds.add(p.orderId);
  }

  const leads = new Map((await byIds("leads", leadIds)).map((d) => [d.id, d]));
  for (const d of await recent("leads", 60)) if (leads.size < Math.max(COUNTS.leads, leadIds.size)) leads.set(d.id, d);

  const bookings = new Map((await byIds("bookings", bookingIds)).map((d) => [d.id, d]));
  for (const d of await recent("bookings", 20)) if (bookings.size < Math.max(COUNTS.bookings, bookingIds.size)) bookings.set(d.id, d);
  for (const b of bookings.values()) if (b.get("payment.orderId")) orderIds.add(b.get("payment.orderId"));

  const nannies = new Map((await byIds("nannies", nannyIds)).map((d) => [d.id, d]));
  const allNannies = (await prod.collection("nannies").limit(500).get()).docs.sort((a, b) => ms(b.get("updatedAt")) - ms(a.get("updatedAt")));
  for (const status of ["available", "interviewing", "placed", "on_leave", "inactive"])
    allNannies.filter((d) => d.get("status") === status).slice(0, 3).forEach((d) => nannies.size < COUNTS.nannies + nannyIds.size && nannies.set(d.id, d));
  for (const d of allNannies) if (nannies.size < Math.max(COUNTS.nannies, nannyIds.size)) nannies.set(d.id, d);

  const payments = [];
  const ids = [...orderIds];
  for (let i = 0; i < ids.length; i += 30) {
    const snap = await prod.collection("cashfreePayments").where("order_id", "in", ids.slice(i, i + 30)).get();
    payments.push(...snap.docs);
  }

  const plan = [
    ["servicing", cases, (d) => d.id],
    ["leads", [...leads.values()], (d) => d.id],
    ["nannies", [...nannies.values()], (d) => d.id],
    ["bookings", [...bookings.values()], (d) => d.id],
    ["cashfreePayments", payments, (d) => testId(d.id)],
  ];
  console.log(plan.map(([n, docs]) => `  ${n}: ${docs.length}`).join("\n"));

  const scrubDoc = (name, d) => scrub(d.data(), null, { nanny: name === "nannies" }, toRef);

  if (DRY) {
    const c = cases[0];
    if (c) console.log("\nExample (first servicing case, as it would be written):\n", JSON.stringify(scrubDoc("servicing", c), null, 2));
    console.log("\nDry run: nothing written.");
    return;
  }

  if (FRESH) {
    console.log(`\nEmptying test collections in ${STAGING}…`);
    for (const name of COLLECTIONS) await staging.recursiveDelete(staging.collection(name));
  }

  console.log(`\nWriting to ${STAGING}…`);
  for (const [name, docs, idOf] of plan) {
    for (let i = 0; i < docs.length; i += 400) {
      const batch = staging.batch();
      for (const d of docs.slice(i, i + 400)) batch.set(staging.collection(name).doc(idOf(d)), scrubDoc(name, d));
      await batch.commit();
    }
  }

  console.log("\n✓ Done. Test customers (sign in to the staging app with these numbers):");
  for (const c of cases) {
    const d = scrubDoc("servicing", c);
    console.log(`  ${d.customer?.phone ?? "—"}  ${d.customer?.name ?? "—"}  · ${d.stage}${d.cancellation?.refund?.status ? ` (refund ${d.cancellation.refund.status})` : ""}`);
  }
}

if (args.has("--self-test")) selfTest();
else
  main().catch((err) => {
    console.error("✗", err.message);
    if (/default credentials|Could not load/i.test(err.message))
      console.error("  Sign in first: gcloud auth application-default login");
    process.exit(1);
  });
