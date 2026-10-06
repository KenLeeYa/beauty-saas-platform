import { loadEnvConfig } from "@next/env";
import { chromium } from "@playwright/test";
import { expect, it } from "vitest";

it.skipIf(!process.env.UNIFIED_UI_TEST_URL)(
  "shows owner attendance and payroll review in a desktop browser",
  async () => {
    loadEnvConfig(process.cwd());
    const [{ prisma }, { createApplicationSession }] = await Promise.all([
      import("../src/server/database/prisma"),
      import("../src/server/auth/session"),
    ]);
    const organization = await prisma.organizations.findUniqueOrThrow({ where: {
      id: "11111111-1111-4111-8111-111111111111" }, select: { slug: true } });
    const location = await prisma.locations.findUniqueOrThrow({ where: {
      id: "22222222-2222-4222-8222-222222222221" }, select: { slug: true } });
    const material = await createApplicationSession({
      profileId: "33333333-3333-4333-8333-333333333301" });
    const base = process.env.UNIFIED_UI_TEST_URL!;
    const browser = await chromium.launch({ executablePath:
      "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
      headless: true, args: ["--no-sandbox"] });
    try {
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      await context.addCookies([
        { name: "beauty_session", value: material.sessionToken, url: base },
        { name: "beauty_csrf", value: material.csrfToken, url: base },
      ]);
      const page = await context.newPage();
      const url = `${base}/merchant/operations?organization=${organization.slug}&location=${location.slug}`;
      const response = await page.goto(url);
      expect(response?.status()).toBe(200);
      await page.getByRole("heading", { name: "Operations review" }).waitFor();
      await page.getByRole("heading", { name: "Attendance" }).waitFor();
      await page.getByRole("heading", { name: "Payroll shadow calculation" }).waitFor();
      await page.getByRole("heading", { name: "Benefits and commission preview" }).waitFor();
      await page.getByRole("heading", { name: "Walk-in timing" }).waitFor();
      await page.getByRole("heading", { name: "Multi-provider commission" }).waitFor();
      const timing = page.waitForResponse(response =>
        response.url().includes("/api/merchant/operations/walkin") &&
        response.request().method() === "GET");
      await page.getByRole("button", { name: "Load timing policy" }).click();
      expect((await timing).status()).toBe(200);
      const saved = page.waitForResponse(response =>
        response.url().includes("/api/merchant/operations/walkin") &&
        response.request().method() === "PATCH");
      await page.getByRole("button", { name: "Save timing policy" }).click();
      expect((await saved).status()).toBe(200);
      await page.getByText(/Published version/).waitFor();
      const customer = await prisma.customers.findFirstOrThrow({ where: {
        organization_id:"11111111-1111-4111-8111-111111111111" },
        select:{ id:true } });
      await page.getByLabel("Customer ID").fill(customer.id);
      const consent = page.waitForResponse(response =>
        response.url().includes("/api/merchant/customers/marketing-consent"));
      await page.getByRole("button",{ name:"Review marketing consent" }).click();
      expect((await consent).status()).toBe(200);
      await page.getByLabel("Marketing consent history").waitFor();
      const policies = page.waitForResponse(response =>
        response.url().includes("/api/merchant/benefits") &&
        response.url().includes("policies=true"));
      await page.getByRole("button", { name: "Load draft rules" }).click();
      expect((await policies).status()).toBe(200);
      const csv = await context.request.get(`${base}/api/merchant/operations?`+
        `organization=${organization.slug}&location=${location.slug}&format=csv`);
      expect(csv.status()).toBe(200);
      expect(await csv.text()).toContain("event_id,profile_id,kind");
      expect(await page.locator("html").evaluate(element =>
        element.scrollWidth <= innerWidth)).toBe(true);
      await page.setViewportSize({ width:390,height:844 });
      expect(await page.locator("html").evaluate(element =>
        element.scrollWidth <= innerWidth)).toBe(true);
      const unlabeled=await page.locator("input,select,textarea").evaluateAll(elements =>
        elements.filter(element => {
          const input=element as HTMLInputElement;
          return input.type !== "hidden" && !input.labels?.length &&
            !input.getAttribute("aria-label") &&
            !input.getAttribute("aria-labelledby");
        }).map(element => element.outerHTML.slice(0,120)));
      expect(unlabeled).toEqual([]);
      await context.close();
    } finally { await browser.close(); }
  }, 60_000);
