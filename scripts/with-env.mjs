#!/usr/bin/env node
/**
 * Run a command with an env file loaded first, e.g.
 *   node scripts/with-env.mjs .env.staging next dev
 * Values in the file win over .env.local, because Next.js never overrides
 * variables that are already set. (`node --env-file` can't be used: Next
 * passes Node flags on to its worker process, and Node rejects --env-file there.)
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

const [file, ...cmd] = process.argv.slice(2);
if (!file || !cmd.length) {
  console.error("Usage: node scripts/with-env.mjs <env-file> <command> [args…]");
  process.exit(1);
}
if (!existsSync(file)) {
  console.error(`✗ ${file} not found.`);
  process.exit(1);
}
process.loadEnvFile(file);
console.log(`Using ${file} → Firebase project ${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "(not set)"}`);

const child = spawn(cmd[0], cmd.slice(1), { stdio: "inherit", shell: true, env: process.env });
child.on("exit", (code, signal) => (signal ? process.kill(process.pid, signal) : process.exit(code ?? 0)));
for (const s of ["SIGINT", "SIGTERM"]) process.on(s, () => child.kill(s));
