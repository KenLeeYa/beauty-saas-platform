import { loadEnvConfig } from "@next/env";
import { chromium, expect as browserExpect } from "@playwright/test";
import { chooseLanguage } from "./language-menu";
import { expect, it } from "vitest";

it.skipIf(!process.env.UNIFIED_UI_TEST_URL)("paginates attendance without losing rows or locale state", async () => {
  const base=process.env.UNIFIED_UI_TEST_URL!;
  const browser=await chromium.launch({executablePath:"C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"});
  const page=await browser.newPage({locale:"zh-TW",viewport:{width:390,height:844}});
  try {
    await page.goto(`${base}/api/line-booking/integrated-demo?role=owner`);
    await page.route("**/api/merchant/operations?*",route=>route.fulfill({json:{data:{
      attendance:Array.from({length:13},(_,i)=>({id:`event-${i}`,profileId:`person-${i}`,kind:"CLOCK_IN",occurredAt:"2026-10-27T02:00:00Z",correctedAt:null})),
      employees:Array.from({length:13},(_,i)=>({id:`person-${i}`,name:`美容師林怡安 ${i+1}`})),staff:[],periods:[],rules:[],
    }}}));
    await page.goto(`${base}/merchant/operations?organization=demo&location=taipei`);
    await page.getByRole("button",{name:"出勤紀錄",exact:true}).click();
    const panel=page.locator('section[aria-label="出勤審核"]');
    await browserExpect(panel.locator("tbody tr")).toHaveCount(6);
    await panel.getByRole("button",{name:"下一頁",exact:true}).click();
    await browserExpect(panel).toContainText("美容師林怡安 7");
    await chooseLanguage(page,"en");
    await browserExpect(page.locator('section:not([hidden]) tbody tr')).toHaveCount(6);
    await chooseLanguage(page,"vi");
    await chooseLanguage(page,"zh-TW");
    await browserExpect(panel).toContainText("美容師林怡安 7");
    await panel.getByRole("button",{name:"下一頁",exact:true}).click();
    await browserExpect(panel.locator("tbody tr")).toHaveCount(1);
    await browserExpect(panel).toContainText("美容師林怡安 13");
    await browserExpect(panel.getByRole("button",{name:"下一頁",exact:true})).toBeDisabled();
    expect(await page.locator("html").evaluate(node=>node.scrollWidth<=innerWidth)).toBe(true);
  } finally {await browser.close();}
},60000);

it.skipIf(!process.env.UNIFIED_UI_TEST_URL || !process.env.UNIFIED_TEST_DATABASE_URL)(
  "renders localized platform entitlements as mobile rows and retains overrides after a failed command",
  async () => {
    loadEnvConfig(process.cwd());
    const { prisma } = await import("../src/server/database/prisma");
    const { createApplicationSession } = await import("../src/server/auth/session");
    const admin = await prisma.profiles.findFirstOrThrow({ where: { platform_role: "PLATFORM_ADMIN", is_active: true } });
    const material = await createApplicationSession({ profileId: admin.id });
    const organizationId = "11111111-1111-4111-8111-111111111111";
    const override = await prisma.organization_feature_overrides.create({ data: {
      organization_id: organizationId, feature_key: "CUSTOM_DOMAIN", override_type: "ALLOW",
      reason: "Synthetic localized entitlement presentation", created_by: admin.id,
    } });
    const base = process.env.UNIFIED_UI_TEST_URL!;
    const browser = await chromium.launch({ executablePath:
      "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe", headless: true });
    try {
      const context = await browser.newContext({ locale: 'zh-TW', viewport: { width: 390, height: 844 } });
      await context.addCookies([
        { name: "beauty_session", value: material.sessionToken, url: base },
        { name: "beauty_csrf", value: material.csrfToken, url: base },
      ]);
      const page = await context.newPage();
      expect((await page.goto(`${base}/admin/organizations/${organizationId}/features`))?.status()).toBe(200);
      await page.getByRole("heading", { name: "方案與有效權益" }).waitFor();
      const row = page.locator("tbody tr").filter({ hasText: "自訂網域" });
      expect(await row.innerText()).toContain("允許使用");
      expect(await page.locator("main").innerText()).not.toMatch(/\b(?:ALLOW|DENY|LIMIT|TRIALING|ACTIVE)\b/);
      for (const width of [320, 390, 768, 1440]) {
        await page.setViewportSize({ width, height: 844 });
        expect(await page.locator("html").evaluate(element => element.scrollWidth <= innerWidth)).toBe(true);
        await row.scrollIntoViewIfNeeded();
        expect(await row.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
        await page.screenshot({ path: `.dev-logs/platform-entitlements-${width}.png` });
      }
      await page.route("**/api/admin/organizations/*/features", route => route.abort());
      await row.getByRole("button", { name: /撤銷/ }).click();
      await page.getByRole("alert").filter({ hasText: "功能權益更新失敗" }).waitFor();
      expect((await prisma.organization_feature_overrides.findUniqueOrThrow({ where: { id: override.id } })).revoked_at).toBeNull();
      await page.goto(`${base}/admin/plans`);
      await chooseLanguage(page, 'en');
      await page.getByRole('heading', {name: 'Plan versions'}).waitFor();
      for (const width of [320, 390, 768, 1440]) {
        await page.setViewportSize({width, height: 844});
        expect(await page.locator('html').evaluate(element => element.scrollWidth <= innerWidth)).toBe(true);
        expect(await page.locator('tbody tr').count()).toBeGreaterThan(0);
        if (width < 768) expect(await page.locator('tbody td[data-label="Monthly price"]').first()
          .evaluate(element => getComputedStyle(element, '::before').content)).toContain('Monthly price');
        await page.screenshot({path: `.dev-logs/plans-english-${width}.png`, fullPage: true});
      }
    } finally {
      await browser.close();
      await prisma.organization_feature_overrides.delete({ where: { id: override.id } });
    }
  }, 60_000,
);

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
    const customer = await prisma.customers.create({ data: {
      organization_id: "11111111-1111-4111-8111-111111111111",
      display_name: "Synthetic security UI customer",
    }, select: { id: true } });
    const override = await prisma.organization_feature_overrides.create({ data: {
      organization_id: "11111111-1111-4111-8111-111111111111",
      feature_key: "CUSTOMER_BLACKLIST", override_type: "DENY",
      reason: "Synthetic UI blacklist entitlement regression",
      created_by: "33333333-3333-4333-8333-333333333301",
    } });
    const { getBookingEligibility } = await import("../src/modules/crm/server/customer-status");
    const browser = await chromium.launch({ executablePath:
      "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
      headless: true, args: ["--no-sandbox"] });
    try {
      const context = await browser.newContext({ locale: 'zh-TW', viewport: { width: 1280, height: 900 } });
      await context.addCookies([
        { name: "beauty_session", value: material.sessionToken, url: base },
        { name: "beauty_csrf", value: material.csrfToken, url: base },
      ]);
      const page = await context.newPage();
      const url = `${base}/merchant/operations?organization=${organization.slug}&location=${location.slug}`;
      const response = await page.goto(url);
      expect(response?.status()).toBe(200);
      await page.getByRole("heading", { name: "營運管理" }).waitFor();
      expect(await page.locator("main > section:not([hidden])").count()).toBe(1);
      for (const [tab,heading] of [["出勤紀錄","出勤紀錄"],["薪資試算","薪資試算"],
        ["會員結帳","會員結帳"],["多人抽成","多人抽成"]]) {
        if (["薪資試算", "多人抽成"].includes(tab)) {
          await page.getByRole("button", {name:"更多營運功能"}).click();
          await page.getByRole("menuitemradio", {name:tab,exact:true}).click();
        } else await page.getByRole("button",{name:tab,exact:true}).click();
        await page.getByRole("heading",{name:heading}).waitFor();
        expect(await page.locator("main > section:not([hidden])").count()).toBe(1);
      }
      for (const width of [360, 390, 768, 1280]) {
        await page.setViewportSize({ width, height: 844 });
        for (const tab of ["現場排程", "會員結帳", "出勤紀錄", "薪資試算", "預約改派", "多人抽成"]) {
          const navigation = page.getByRole("navigation", { name: "營運工作區" });
          if (["薪資試算", "多人抽成"].includes(tab)) {
            await navigation.getByRole("button", {name:"更多營運功能"}).click();
            await page.getByRole("menuitemradio", {name:tab,exact:true}).click();
          } else await navigation.getByRole("button", { name: tab, exact: true }).click();
          expect(await page.locator("html").evaluate(element => element.scrollWidth <= innerWidth)).toBe(true);
          const interfaceText = await page.locator("main > section:not([hidden])")
            .locator("h2, h3, summary, button, th").allTextContents();
          expect(interfaceText.join("\n")).not.toMatch(/^(?:Walk-in|Payroll|Attendance|Benefits and|Multi-provider|Select|Published version)/m);
        }
        await page.screenshot({ path: `.dev-logs/operations-app-${width}.png`, fullPage: true });
      }
      await page.getByRole("button",{name:"現場排程",exact:true}).click();
      await page.getByRole("heading", { name: "現場排程" }).waitFor();
      const timing = page.waitForResponse(response =>
        response.url().includes("/api/merchant/operations/walkin") &&
        response.request().method() === "GET");
      await page.getByRole("button", { name: "載入排程設定" }).click();
      expect((await timing).status()).toBe(200);
      const saved = page.waitForResponse(response =>
        response.url().includes("/api/merchant/operations/walkin") &&
        response.request().method() === "PATCH");
      await page.getByRole("button", { name: "儲存排程設定" }).click();
      expect((await saved).status()).toBe(200);
      await page.getByText(/已發布版本/).waitFor();
      await page.getByRole("button",{name:"會員結帳",exact:true}).click();
      await page.getByLabel("顧客編號").fill(customer.id);
      const balance = page.waitForResponse(response => response.url().includes("/api/merchant/benefits?") && response.url().includes("customerId="));
      await page.getByRole("button", { name: "查看餘額與權益" }).click();
      expect((await balance).status()).toBe(200);
      await page.getByLabel("權益處理結果").getByText("可用餘額", { exact: true }).waitFor();
      expect(await page.getByLabel("權益處理結果").innerText()).not.toMatch(/paidMinor|bonusMinor|COUPON|SERVICE_PACKAGE/);
      await page.setViewportSize({ width: 360, height: 800 });
      await page.screenshot({ path: ".dev-logs/merchant-benefits-mobile.png", fullPage: true });
      await page.route("**/api/merchant/benefits?*customerId=*", route => route.abort());
      await page.getByRole("button", { name: "查看餘額與權益" }).click();
      await page.getByRole("status").filter({ hasText: "無法載入權益資料" }).waitFor();
      expect(await page.getByLabel("權益處理結果").count()).toBe(0);
      await page.unroute("**/api/merchant/benefits?*customerId=*");
      await page.getByRole("button", { name: "查看餘額與權益" }).click();
      await page.getByLabel("權益處理結果").waitFor();
      const consent = page.waitForResponse(response =>
        response.url().includes("/api/merchant/customers/marketing-consent"));
      await page.getByText("行銷同意", { exact: true }).click();
      await page.getByRole("button",{ name:"查看行銷同意" }).click();
      expect((await consent).status()).toBe(200);
      await page.getByLabel("行銷同意紀錄").waitFor();
      await page.setViewportSize({ width: 390, height: 844 });
      await page.getByText("顧客預約權限", { exact: true }).click();
      await page.getByLabel(/^狀態/).selectOption("BLACKLIST");
      await page.getByLabel("原因", { exact: true }).fill("Synthetic security UI test");
      const changeStatus = async (button: string, expected: number) => {
        const pending = page.waitForResponse(response =>
          response.url().includes("/api/merchant/customers/status") && response.request().method() === "PATCH");
        await page.getByRole("button", { name: button, exact: true }).click();
        expect((await pending).status()).toBe(expected);
      };
      await changeStatus("啟用狀態", 403);
      await page.getByRole("status").filter({ hasText: "目前方案未包含此功能" }).waitFor();
      const eligible = () => getBookingEligibility("11111111-1111-4111-8111-111111111111",
        "22222222-2222-4222-8222-222222222221", customer.id);
      expect((await eligible()).allowed).toBe(true);
      expect(await prisma.audit_logs.count({ where: { target_id: customer.id,
        action: "CUSTOMER_STATUS_CHANGED" } })).toBe(0);
      await prisma.organization_feature_overrides.update({ where: { id: override.id }, data: { override_type: "ALLOW" } });
      await changeStatus("啟用狀態", 200);
      await page.getByRole("status").filter({ hasText: "已更新顧客狀態" }).waitFor();
      expect((await eligible()).allowed).toBe(false);
      await changeStatus("解除狀態", 200);
      expect((await eligible()).allowed).toBe(true);
      await prisma.organization_feature_overrides.update({ where: { id: override.id }, data: { override_type: "DENY" } });
      await page.getByLabel(/^狀態/).selectOption("VIP");
      await changeStatus("啟用狀態", 200);
      expect(await eligible()).toEqual({ allowed: true, vip: true });
      await changeStatus("解除狀態", 200);
      expect(await eligible()).toEqual({ allowed: true, vip: false });
      const policies = page.waitForResponse(response =>
        response.url().includes("/api/merchant/benefits") &&
        response.url().includes("policies=true"));
      await page.getByText("優惠與抽成規則", { exact: true }).click();
      await page.getByRole("button", { name: "載入規則草稿" }).click();
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
    } finally {
      await browser.close();
      await prisma.organization_feature_overrides.delete({ where: { id: override.id } });
    }
  }, 60_000);

it.skipIf(!process.env.UNIFIED_UI_TEST_URL)("renders localized mobile member and employee recovery states", async () => {
  const base = process.env.UNIFIED_UI_TEST_URL!;
  const browser = await chromium.launch({ executablePath: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe", headless: true });
  const context = await browser.newContext({ locale: 'zh-TW', viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true });
  try {
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(`${base}/api/line-booking/integrated-demo?role=customer`);
    await page.route("**/api/line-booking/member?*", route => route.abort());
    await page.getByRole("button", { name: "會員", exact: true }).click();
    await page.getByRole("alert").filter({ hasText: "會員權益暫時無法載入" }).waitFor();
    await page.unroute("**/api/line-booking/member?*");
    await page.getByRole("button", { name: "重新載入會員權益" }).click();
    await page.getByLabel("會員餘額").waitFor();
    expect(await page.getByRole("link", { name: "使用 LINE 登入" }).count()).toBe(0);
    expect(await page.getByLabel("我的會員權益").innerText()).not.toMatch(/paidMinor|bonusMinor|COUPON|SERVICE_PACKAGE/);
    expect(await page.getByLabel("連結既有預約").getAttribute("open")).toBeNull();
    await page.route("**/api/line-booking/member?*", route => route.fulfill({ json: {
      visible: true, newIssuanceEnabled: false,
      balance: { paidMinor: 12345, bonusMinor: 1000, totalMinor: 13345 },
      issues: [{ id: "synthetic-benefit", kind: "SERVICE_PACKAGE", available: 3,
        expiresAt: "2099-10-21T16:00:00.000Z", terms: { quantity: 5, serviceVariantId: "synthetic-service" } }],
    } }));
    await page.getByRole("button", { name: "重新載入會員權益" }).click();
    await page.getByText("剩餘 3 次", { exact: true }).waitFor();
    expect(await page.getByLabel("會員餘額").innerText()).toContain("133.45");
    await page.getByText("到期時間 2099/10/22 00:00", { exact: true }).waitFor();
    for (const width of [360, 390, 768, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      expect(await page.locator("html").evaluate(element => element.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: `.dev-logs/member-app-${width}.png`, fullPage: true });
    }
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto(`${base}/api/line-booking/integrated-demo?role=beautician`);
    await page.route("**/api/line-booking/attendance?*", route => route.abort());
    await page.getByRole("button", { name: "出勤", exact: true }).click();
    await page.getByRole("alert").filter({ hasText: "出勤紀錄暫時無法載入" }).waitFor();
    await page.unroute("**/api/line-booking/attendance?*");
    await page.getByRole("button", { name: "重新載入出勤紀錄" }).click();
    await page.getByRole("button", { name: /上班打卡|開始休息|結束休息/ }).first().waitFor();
    await page.screenshot({ path: ".dev-logs/attendance-app-360.png", fullPage: true });
    await page.goto(`${base}/api/line-booking/integrated-demo?role=receptionist`);
    await page.getByRole("heading", { name: "櫃台待處理事項" }).waitFor();
    // Fixture responses isolate error recovery from real dispatch state changes.
    await page.route("**/api/line-booking/exceptions?*", route => route.fulfill({ json: { items: [{
      id: "synthetic-retry", kind: "FAILED_DISPATCH", startsAt: "2026-10-21T03:00:00.000Z",
      serviceName: "測試臉部服務", staffName: "測試人員", bookingId: null,
    }] } }));
    await page.getByRole("button", { name: "重新載入待處理事項" }).click();
    const retryItem = page.getByRole("listitem").filter({ hasText: "測試臉部服務" });
    await retryItem.waitFor();
    await retryItem.getByText("記錄處理結果", { exact: true }).click();
    await page.getByLabel("處理結果與原因").fill("注音失敗重試測試");
    await page.route("**/api/line-booking/exceptions", route => route.abort());
    await page.getByRole("button", { name: "儲存處理結果" }).click();
    await page.getByRole("alert").filter({ hasText: "處理原因已保留" }).waitFor();
    expect(await page.getByLabel("處理結果與原因").inputValue()).toBe("注音失敗重試測試");
    await page.unroute("**/api/line-booking/exceptions");
    await page.route("**/api/line-booking/exceptions", route => route.fulfill({ json: { ok: true } }));
    await page.unroute("**/api/line-booking/exceptions?*");
    await page.route("**/api/line-booking/exceptions?*", route => route.fulfill({ json: { items: [] } }));
    await page.getByRole("button", { name: "儲存處理結果" }).click();
    await page.getByText("處理結果已記錄。", { exact: true }).waitFor();
    await page.getByText("目前沒有待處理事項。", { exact: true }).waitFor();
    expect(errors).toEqual([]);
  } finally { await context.close(); await browser.close(); }
}, 60_000);
