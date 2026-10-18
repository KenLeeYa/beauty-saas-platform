import { readFileSync, existsSync, mkdirSync, openSync, writeFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { createServer } from "node:net";
import { Client } from "pg";

const mode = process.argv[2];
const credentialPath = process.argv[3] || process.env.BEAUTY_LOCAL_CREDENTIAL_FILE;
if (!credentialPath) throw Error("Supply the existing local PostgreSQL credential file path.");
const values = Object.fromEntries(readFileSync(credentialPath, "utf8").split(/\r?\n/)
  .filter(line => line.includes("=")).map(line => {
    const index = line.indexOf("=");
    return [line.slice(0, index), line.slice(index + 1)];
  }));
const database = "beauty_msi_20261009";
const options = { host: "127.0.0.1", port: 56863,
  user: values.POSTGRES_USER, password: values.POSTGRES_PASSWORD };
const url = new URL(`postgresql://127.0.0.1:56863/${database}`);
url.username = options.user;
url.password = options.password;
const port = Number(process.env.BEAUTY_LOCAL_PORT || 3100);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw Error("Invalid local port.");
const origins = [`http://127.0.0.1:${port}`, `http://localhost:${port}`];
if (process.env.BEAUTY_LOCAL_LAN_HOST) {
  if (!/^192\.168\.\d{1,3}\.\d{1,3}$|^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$|^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(process.env.BEAUTY_LOCAL_LAN_HOST)) {
    throw Error("LAN host must be a private IPv4 address.");
  }
  origins.push(`http://${process.env.BEAUTY_LOCAL_LAN_HOST}:${port}`);
}
const env = { ...process.env, DATABASE_URL: url.toString(), DIRECT_URL: url.toString(),
  APP_ENV: "test", ALLOW_DEMO_SEED: "true", ENABLE_LOCAL_AUTH_STUB: "true",
  UNIFIED_LOCAL_TRIAL: "true", LINE_BOOKING_LOCAL_DEMO: "false",
  UNIFIED_LOCAL_TRIAL_ORIGINS: origins.join(","),
  NEXT_PUBLIC_APP_URL: origins[0], PUBLIC_APP_ORIGINS: origins.join(","),
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:56861",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "local-synthetic-placeholder",
  SUPABASE_SERVICE_ROLE_KEY: "local-synthetic-placeholder",
  SESSION_SECRET: "local-only-msi-session-placeholder-20261009",
  CSRF_SECRET: "local-only-msi-csrf-placeholder-20261009",
  ABUSE_HASH_SECRET: "local-only-msi-abuse-placeholder-20261009",
  TOKEN_DERIVATION_SECRET: "local-only-msi-token-placeholder-20261009",
  CRON_SECRET: "local-only-msi-cron-placeholder-20261009",
  NEXT_PUBLIC_GOOGLE_LOGIN_ENABLED: "false", PAYMENT_PROVIDER: "disabled",
  NOTIFICATION_PROVIDER: "disabled", TURNSTILE_ALLOW_TEST_KEYS: "true",
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
  MEMBER_VALUE_TEST_ONLY: "false", PAYROLL_TEST_ONLY: "false",
  UNIFIED_TEST_DATABASE_URL: "true" };
function run(args) {
  const result = spawnSync(process.execPath, args, { env, encoding: "utf8", timeout: 600000 });
  const redact = text => (text || "").replaceAll(url.toString(), "[local database]")
    .replace(/(beauty_(?:session|csrf|line_session)=)[^;\s]+/g, "$1[redacted]")
    .replace(/((?:x-csrf-token|authorization):\s*)[^\r\n]*/gi, "$1[redacted]")
    .replaceAll(values.POSTGRES_PASSWORD, "[redacted]");
  process.stdout.write(redact(result.stdout));
  process.stderr.write(redact(result.stderr));
  if (result.error || result.status !== 0) throw Error(`Command failed: ${args[0]}`);
}
try {
  if (mode === "setup") {
    const admin = new Client({ ...options, database: values.POSTGRES_DB });
    await admin.connect();
    try {
      const found = await admin.query("select 1 from pg_database where datname=$1", [database]);
      if (!found.rowCount) {
        await admin.query(`create database ${database} template beauty_unified_rehearsal_20261006_v12`);
        console.log("Created isolated copy of the historical synthetic migration rehearsal.");
      } else console.log("Existing MSI synthetic database preserved.");
    } finally { await admin.end(); }
  } else if (mode === "test") {
    run(["scripts/test-unified-synthetic.mjs"]);
  } else if (mode === "unit") {
    delete env.UNIFIED_TEST_DATABASE_URL;
    run(["node_modules/vitest/vitest.mjs", "run", "--no-file-parallelism"]);
  } else if (mode === "build") {
    run(["node_modules/prisma/build/index.js", "generate"]);
    run(["node_modules/next/dist/bin/next", "build"]);
  } else if (mode === "ui") {
    env.UNIFIED_TEST_UI_URL = origins[0];
    env.UNIFIED_UI_TEST_URL = origins[0];
    env.UNIFIED_UI_LAN_URL = origins[2] || "";
    run(["node_modules/vitest/vitest.mjs", "run", "--no-file-parallelism",
      "tests/line-booking-public-ui.integration.test.ts", "tests/operations-ui.integration.test.ts",
      "tests/msi-role-ui.integration.test.ts", "tests/booking-reassignment.integration.test.ts"]);
  } else if (mode === "start") {
    env.MEMBER_VALUE_TEST_ONLY = "true";
    env.PAYROLL_TEST_ONLY = "true";
    if (!existsSync(".next/BUILD_ID")) throw Error("Build the candidate before starting it.");
    mkdirSync(".dev-logs", { recursive: true });
    const stdout = openSync(".dev-logs/msi.stdout.log", "a");
    const stderr = openSync(".dev-logs/msi.stderr.log", "a");
    await new Promise((accept, reject) => {
      const probe = createServer();
      probe.once("error", reject);
      probe.listen(port, "0.0.0.0", () => probe.close(accept));
    });
    const child = spawn(process.execPath, [resolve("node_modules/next/dist/bin/next"), "start",
      "-H", "0.0.0.0", "-p", String(port)], { env, detached: true,
      windowsHide: true, stdio: ["ignore", stdout, stderr] });
    child.unref();
    writeFileSync(resolve(".dev-logs/msi.pid"), String(child.pid));
    let ready = false;
    for (let attempt = 0; attempt < 30 && !ready; attempt++) {
      try { ready = (await fetch(`${origins[0]}/api/health`, {signal:AbortSignal.timeout(2000)})).ok; }
      catch { /* The process may still be opening its listener. */ }
      if (!ready) await new Promise(accept => setTimeout(accept, 500));
    }
    if (!ready) { child.kill(); throw Error("Trial health failed; inspect .dev-logs/msi.stderr.log."); }
    console.log(`PID ${child.pid}; test entry ${origins[0]}/api/line-booking/integrated-demo?role=customer`);
  } else throw Error("Use setup, unit, test, build, ui, or start.");
} catch (error) {
  console.error(error instanceof Error ? error.message.replaceAll(url.toString(), "[local database]")
    .replaceAll(values.POSTGRES_PASSWORD, "[redacted]") : "Local operation failed.");
  process.exitCode = 1;
}
