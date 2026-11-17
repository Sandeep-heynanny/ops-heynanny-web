#!/usr/bin/env node
/**
 * Delete website enquiries (Firestore `leads`) so the dashboard starts fresh.
 * Bookings are never touched.
 *
 *   npm run clear-leads                # dry run: shows how many would be deleted
 *   npm run clear-leads -- --yes       # saves a backup to ./backups, then deletes
 *
 * Credentials: same as `npm run role` (gcloud application-default login, or ./service-account.json).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { applicationDefault, cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const PROJECT_ID = "hey-nanny-web";
const keyPath = new URL("../service-account.json", import.meta.url);
const hasKey = existsSync(keyPath);
const gcloudAdc = [
  join(homedir(), ".config", "gcloud", "application_default_credentials.json"),
  join(process.env.APPDATA ?? "", "gcloud", "application_default_credentials.json"),
].some((p) => p && existsSync(p));
if (!hasKey && !process.env.GOOGLE_APPLICATION_CREDENTIALS && !gcloudAdc) {
  console.error(
    "✗ No admin credentials found. Sign in once with your Google account:\n" +
      "    gcloud auth application-default login\n" +
      "    gcloud auth application-default set-quota-project hey-nanny-web",
  );
  process.exit(1);
}
initializeApp({ projectId: PROJECT_ID, credential: hasKey ? cert(JSON.parse(readFileSync(keyPath, "utf8"))) : applicationDefault() });
const db = getFirestore();

const confirm = process.argv.includes("--yes");
const snap = await db.collection("leads").get();
console.log(`Found ${snap.size} enquiries in "leads" (project ${PROJECT_ID}).`);
if (!snap.size) process.exit(0);

if (!confirm) {
  console.log("Dry run, nothing deleted. Run `npm run clear-leads -- --yes` to back them up and delete them.");
  process.exit(0);
}

mkdirSync(new URL("../backups/", import.meta.url), { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backup = new URL(`../backups/leads-${stamp}.json`, import.meta.url);
const rows = snap.docs.map((d) => {
  const data = d.data();
  for (const [k, v] of Object.entries(data)) if (v?.toDate) data[k] = v.toDate().toISOString();
  return { id: d.id, ...data };
});
writeFileSync(backup, JSON.stringify(rows, null, 2));
console.log(`Backup saved: ${backup.pathname}`);

let done = 0;
for (let i = 0; i < snap.docs.length; i += 400) {
  const batch = db.batch();
  for (const d of snap.docs.slice(i, i + 400)) batch.delete(d.ref);
  await batch.commit();
  done += Math.min(400, snap.docs.length - i);
}
console.log(`✓ Deleted ${done} enquiries. The dashboard now shows only new ones.`);
