#!/usr/bin/env node
/**
 * Give or remove dashboard access.
 *
 *   npm run role -- priya@heynanny.in sales      # sales: Enquiries only ("ops" is the old name)
 *   npm run role -- ravi@heynanny.in servicing   # servicing team: Servicing + Nannies (add/edit)
 *   npm run role -- asha@heynanny.in supply      # supply team: Nannies only (view, add, edit)
 *   npm run role -- meera@heynanny.in manager    # everything except Payments; can import nannies
 *   npm run role -- sandeep@heynanny.in admin    # everything
 *   npm run role -- priya@heynanny.in none     # remove access (signs them out)
 *   npm run role -- --list                     # who has access
 *   npm run role -- --sync                     # rebuild the "Assigned to" staff list from current roles
 *
 * Each role change also updates Firestore `staff/{uid}` ({ email, name, role }),
 * which fills the "Assigned to" dropdown on the dashboard.
 *
 * The person must have signed in to the dashboard once first, so their
 * account exists. Credentials: run `gcloud auth application-default login` and
 * `gcloud auth application-default set-quota-project hey-nanny-web` once (uses your
 * own Google account, which must be an Owner of the Firebase project), or put a
 * service-account key at ./service-account.json (git-ignored) if keys are allowed.
 */
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { applicationDefault, cert, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

// FIREBASE_PROJECT=hey-nanny-staging npm run role -- ... manages staging instead.
const PROJECT_ID = process.env.FIREBASE_PROJECT || "hey-nanny-web";
const DOMAIN = "@heynanny.in";
const ROLES = ["sales", "servicing", "supply", "manager", "admin", "none"];
const STAFF = ROLES.filter((r) => r !== "none");

const keyPath = new URL("../service-account.json", import.meta.url);
const hasKey = existsSync(keyPath);
// Credentials saved by `gcloud auth application-default login` (macOS/Linux and Windows paths).
const gcloudAdc = [
  join(homedir(), ".config", "gcloud", "application_default_credentials.json"),
  join(process.env.APPDATA ?? "", "gcloud", "application_default_credentials.json"),
].some((p) => p && existsSync(p));
if (!hasKey && !process.env.GOOGLE_APPLICATION_CREDENTIALS && !gcloudAdc) {
  console.error(
    "✗ No admin credentials found. Sign in once with your Google account:\n" +
      "    gcloud auth application-default login\n" +
      "    gcloud auth application-default set-quota-project hey-nanny-web\n" +
      "  (or save a service-account key here as service-account.json, if your organisation allows keys)",
  );
  process.exit(1);
}
initializeApp({
  projectId: PROJECT_ID,
  credential: hasKey ? cert(JSON.parse(readFileSync(keyPath, "utf8"))) : applicationDefault(),
});
const auth = getAuth();
const db = getFirestore();

/** The dashboard's staff list (Firestore `staff/{uid}`); only this script writes it. */
async function writeStaff(user, role) {
  const ref = db.collection("staff").doc(user.uid);
  if (role === "none") return ref.delete();
  await ref.set({
    email: user.email.toLowerCase(),
    name: user.displayName || user.email.split("@")[0],
    role,
    updatedAt: FieldValue.serverTimestamp(),
  });
}

async function sync() {
  const keep = new Set();
  let token;
  do {
    const page = await auth.listUsers(1000, token);
    for (const u of page.users) {
      let role = u.customClaims?.role;
      // "ops" was renamed "sales": move old accounts over.
      if (role === "ops") {
        role = "sales";
        await auth.setCustomUserClaims(u.uid, { ...u.customClaims, role });
        console.log(`${u.email}: ops → sales`);
      }
      if (u.email?.toLowerCase().endsWith(DOMAIN) && STAFF.includes(role)) {
        await writeStaff(u, role);
        keep.add(u.uid);
      }
    }
    token = page.pageToken;
  } while (token);
  const existing = await db.collection("staff").get();
  for (const d of existing.docs) if (!keep.has(d.id)) await d.ref.delete();
  console.log(`Staff list updated: ${keep.size} ${keep.size === 1 ? "person" : "people"}.`);
}

const [arg1, arg2] = process.argv.slice(2);

async function list() {
  let token;
  const rows = [];
  do {
    const page = await auth.listUsers(1000, token);
    for (const u of page.users) if (u.customClaims?.role) rows.push(`${u.customClaims.role.padEnd(9)} ${u.email}`);
    token = page.pageToken;
  } while (token);
  console.log(rows.length ? rows.sort().join("\n") : "Nobody has access yet.");
}

async function setRole(email, role) {
  if (!email?.toLowerCase().endsWith(DOMAIN)) throw new Error(`Only ${DOMAIN} accounts can be given access.`);
  if (role === "ops") role = "sales"; // old name
  if (!ROLES.includes(role)) throw new Error(`Role must be one of: ${ROLES.join(", ")}`);
  let user;
  try {
    user = await auth.getUserByEmail(email);
  } catch (err) {
    if (err?.code === "auth/user-not-found") {
      throw new Error(`${email} hasn't signed in yet. Ask them to open the dashboard and sign in once, then run this again.`);
    }
    throw new Error(`Couldn't reach Firebase: ${err?.message ?? err}`);
  }
  const claims = { ...(user.customClaims ?? {}) };
  if (role === "none") delete claims.role;
  else claims.role = role;
  await auth.setCustomUserClaims(user.uid, claims);
  await writeStaff(user, role);
  if (role === "none") {
    await auth.revokeRefreshTokens(user.uid);
    console.log(`Removed access for ${email}. They lose access within an hour (immediately if they sign out).`);
  } else {
    console.log(`${email} is now "${role}". They can press "Check again" on the dashboard.`);
  }
}

try {
  if (arg1 === "--list") await list();
  else if (arg1 === "--sync") await sync();
  else if (arg1 && arg2) await setRole(arg1.trim(), arg2.trim());
  else {
    console.log("Usage: npm run role -- <email@heynanny.in> <sales|servicing|supply|manager|admin|none>   |   npm run role -- --list   |   npm run role -- --sync");
    process.exitCode = 1;
  }
} catch (err) {
  console.error(`✗ ${err.message}`);
  process.exitCode = 1;
}
