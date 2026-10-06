import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const database = process.env.DATABASE_URL;
if (!database) throw Error("DATABASE_URL must point to a seeded local synthetic database");
const url = new URL(database);
if (!["127.0.0.1", "localhost", "::1"].includes(url.hostname) ||
    process.env.APP_ENV !== "test") {
  throw Error("Unified tests require a loopback database and APP_ENV=test");
}
const tests = [
  "tests/public-mobile-core.integration.test.ts",
  "tests/reception-workflow.integration.test.ts",
  "tests/line-mobile-identity.integration.test.ts",
  "tests/line-employee-link.integration.test.ts",
  "tests/line-desktop-login.integration.test.ts",
  "tests/google-profile-linking.integration.test.ts",
  "tests/line-channel-routing.integration.test.ts",
  "tests/module-guard.integration.test.ts",
  "tests/line-customer-link.integration.test.ts",
  "tests/staff-capability.integration.test.ts",
  "tests/walkin-dispatch.integration.test.ts",
  "tests/exception-queue.integration.test.ts",
  "tests/booking-reassignment.integration.test.ts",
  "tests/customer-status.integration.test.ts",
  "tests/promotion-checkout.integration.test.ts",
  "tests/member-policy.integration.test.ts",
  "tests/member-ledger.integration.test.ts",
  "tests/member-benefits.integration.test.ts",
  "src/server/payroll/commission-quote.test.ts",
  "tests/attendance.integration.test.ts",
  "tests/payroll-period.integration.test.ts",
  "tests/operations-access.integration.test.ts",
];
const vitest = fileURLToPath(new URL("../node_modules/vitest/vitest.mjs", import.meta.url));
const run = spawnSync(process.execPath, [vitest, "run", "--no-file-parallelism", ...tests], {
  cwd: fileURLToPath(new URL("..", import.meta.url)),
  env: { ...process.env, UNIFIED_TEST_DATABASE_URL: "true" },
  stdio: "inherit", timeout: 120_000,
});
if (run.error) throw run.error;
process.exitCode = run.status ?? 1;
