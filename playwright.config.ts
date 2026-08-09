import { randomUUID } from "node:crypto";

import { defineConfig, devices } from "@playwright/test";

const appUrl = process.env.PLAYWRIGHT_APP_URL ?? "http://127.0.0.1:3101";
const reuseExistingServer = process.env.PLAYWRIGHT_REUSE_EXISTING_SERVER === "true";
const runClientIdentifier = randomUUID();

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report", open: "never" }]
  ],
  use: {
    baseURL: appUrl,
    locale: "zh-TW",
    timezoneId: "Asia/Taipei",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure"
  },
  projects: [
    {
      name: "desktop-chrome",
      use: {
        ...devices["Desktop Chrome"],
        extraHTTPHeaders: {
          "x-test-client-ip": `e2e-desktop:${runClientIdentifier}`
        }
      }
    },
    {
      name: "mobile-chrome",
      use: {
        ...devices["Pixel 7"],
        extraHTTPHeaders: {
          "x-test-client-ip": `e2e-mobile:${runClientIdentifier}`
        }
      }
    }
  ],
  webServer: reuseExistingServer
    ? undefined
    : {
        command:
          "cross-env APP_ENV=test ALLOW_DEMO_SEED=true ENABLE_LOCAL_AUTH_STUB=true NEXT_PUBLIC_APP_URL=http://127.0.0.1:3101 PUBLIC_APP_ORIGINS=http://127.0.0.1:3101 TRUSTED_CLIENT_IP_HEADER=x-test-client-ip next dev --hostname 127.0.0.1 --port 3101",
        url: `${appUrl}/api/health`,
        reuseExistingServer: false,
        timeout: 120_000
      }
});
