import {
  expect,
  test,
  type Locator,
  type Page,
  type TestInfo,
} from "@playwright/test";

const password = "Beauty123!";
const merchantScope = "organization=demo&location=taipei";

const accounts = {
  merchant: "merchant@lumi.test",
  provider: "provider@lumi.test",
  customer: "customer@lumi.test",
} as const;

async function loginAs(page: Page, email: string): Promise<void> {
  await page.goto("/");
  await page.getByLabel("Email").fill(email);
  await page.locator('input[type="password"]').fill(password);
  const loginResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/auth/login") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "登入" }).click();
  expect((await loginResponse).status()).toBe(200);
  await page.waitForURL((url) => url.pathname !== "/");
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
}

function trackHydrationErrors(page: Page): string[] {
  const errors: string[] = [];
  const record = (message: string) => {
    if (
      /hydration|server rendered text.*match|text content did not match/i.test(
        message,
      )
    ) {
      errors.push(message);
    }
  };

  page.on("console", (message) => {
    if (message.type() === "error") {
      record(message.text());
    }
  });
  page.on("pageerror", (error) => record(error.message));
  return errors;
}

async function openMerchantView(
  page: Page,
  view: string,
  heading: string,
): Promise<void> {
  await page.goto(`/merchant/${view}?${merchantScope}`);
  await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
  await expectNoHorizontalOverflow(page);
}

function taipeiDateAtOffset(offset: number): string {
  const localDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const date = new Date(`${localDate}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

async function selectCalendarDate(page: Page, date: string): Promise<void> {
  const calendar = page.getByRole("region", { name: "月曆" });
  const [year, month, day] = date.split("-").map(Number);
  const targetMonth = `${year} 年 ${month} 月`;

  if (!(await calendar.getByRole("heading", { name: targetMonth }).isVisible())) {
    await calendar.getByRole("button", { name: "下一個月" }).click();
  }

  await calendar
    .getByRole("button", { name: new RegExp(`${month} 月 ${day} 日`) })
    .click();
}

test("merchant can inspect every implemented workspace module", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const hydrationErrors = trackHydrationErrors(page);
  await loginAs(page, accounts.merchant);
  await expect(page).toHaveURL(/\/merchant\/dashboard\?organization=demo&location=taipei$/);

  await test.step("dashboard and seeded operating day", async () => {
    await expect(page.getByRole("heading", { level: 1, name: "營運總覽" })).toBeVisible();
    await expect(page.getByText("今日預約", { exact: true })).toBeVisible();
    await expect(page.getByText("QA 王小美（VIP 常客）").first()).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  await test.step("calendar", async () => {
    await openMerchantView(page, "calendar", "預約行事曆");
    await expect(page.getByRole("group", { name: "當日營業模式" })).toBeVisible();
    await expect(page.getByText("當日預約", { exact: true })).toBeVisible();
  });

  await test.step("booking search and terminal states", async () => {
    await openMerchantView(page, "bookings", "預約管理");
    await page.getByLabel("預約狀態").selectOption("CANCELLED");
    await expect(page.getByText("QA 林雅婷（黑名單）").first()).toBeVisible();
    await page.getByLabel("預約狀態").selectOption("EXPIRED");
    const expiredBooking = page.locator("article").filter({ hasText: "QA 林雅婷（黑名單）" }).first();
    await expect(expiredBooking.getByText("已失效", { exact: true })).toBeVisible();
    await page.getByLabel("預約狀態").selectOption("ALL");
    await page.getByPlaceholder("搜尋顧客、電話或服務").fill("0900000001");
    await expect(page.getByText("QA 王小美（VIP 常客）").first()).toBeVisible();
  });

  await test.step("customer CRM", async () => {
    await openMerchantView(page, "customers", "顧客管理");
    await expect(page.getByText("QA 王小美（VIP 常客）")).toBeVisible();
    await expect(page.getByText("QA 陳怡君（需訂金）")).toBeVisible();
    await expect(page.getByText("QA 林雅婷（黑名單）")).toBeVisible();
    const loyalCustomer = page.locator("article").filter({ hasText: "QA 王小美（VIP 常客）" });
    const riskCustomer = page.locator("article").filter({ hasText: "QA 林雅婷（黑名單）" });
    await expect(loyalCustomer.getByText("VIP 常客", { exact: true }).first()).toBeVisible();
    await expect(riskCustomer.getByText("黑名單", { exact: true })).toBeVisible();
  });

  await test.step("catalog and media controls", async () => {
    await openMerchantView(page, "services", "服務項目");
    await expect(page.getByText("深層舒壓", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("光感臉部護理", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("自然款美睫", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("上傳服務圖片").first()).toBeVisible();
  });

  await test.step("staff and resources", async () => {
    await openMerchantView(page, "staff", "服務人員");
    await expect(page.getByText("Yuki", { exact: true })).toBeVisible();
    await expect(page.getByText("Mina", { exact: true })).toBeVisible();
    await expect(page.getByText("更新人員照片").first()).toBeVisible();

    await openMerchantView(page, "resources", "空間與設備");
    await expect(page.getByText("光感 A 室", { exact: true })).toBeVisible();
    await expect(page.getByText("光感 B 室", { exact: true })).toBeVisible();
  });

  await test.step("location and organization surfaces", async () => {
    await openMerchantView(page, "locations", "分店管理");
    await expect(page.getByText("台北光感館", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("更新店外觀照")).toBeVisible();

    await openMerchantView(page, "team", "團隊與權限");
    await expect(page.getByText("Yuki", { exact: true })).toBeVisible();
  });

  await test.step("reports, plan, billing, and setup", async () => {
    await openMerchantView(page, "reports", "營運報表");
    await expect(page.getByRole("heading", { name: "服務營收" })).toBeVisible();
    await expect(page.getByText("深層舒壓", { exact: true })).toBeVisible();

    await openMerchantView(page, "subscription", "訂閱方案");
    await expect(page.getByText("目前方案", { exact: true })).toBeVisible();
    await expect(page.getByText(/狀態：TRIALING/)).toBeVisible();

    await openMerchantView(page, "billing", "帳務管理");
    await expect(page.getByText("LOCAL-QA-0001", { exact: true })).toBeVisible();

    await openMerchantView(page, "setup", "開店設定");
    await expect(page.getByText("測試預約", { exact: true })).toBeVisible();
  });

  await test.step("settings and notification health", async () => {
    await openMerchantView(page, "settings", "商家設定");
    await expect(page.getByRole("heading", { name: "通知健康狀態" })).toBeVisible();
    const notificationResults = page.locator(
      'section[aria-labelledby="notification-delivery-heading"]',
    );
    await expect(
      notificationResults
        .locator("p:visible, td:visible")
        .filter({ hasText: /^LOCAL_QA_RECIPIENT_UNREACHABLE$/ }),
    ).toBeVisible();
    await expect(page.getByText("品牌與公司資料", { exact: true })).toBeVisible();
    await expect(page.getByText("預約規則與訂金", { exact: true })).toBeVisible();
  });

  expect(hydrationErrors).toEqual([]);
});

test("merchant can operate schedules, booking states, catalog, location, and notifications", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chrome", "mutations run once on desktop");
  test.setTimeout(120_000);
  const hydrationErrors = trackHydrationErrors(page);
  await loginAs(page, accounts.merchant);

  await test.step("set and restore a custom day schedule", async () => {
    await openMerchantView(page, "calendar", "預約行事曆");
    const targetDate = taipeiDateAtOffset(5);
    await selectCalendarDate(page, targetDate);
    await page.getByRole("button", { name: "自訂時段" }).click();
    await page.getByLabel("時段 1 開始").fill("12:00");
    await page.getByLabel("時段 1 結束").fill("16:00");
    await page.getByLabel("備註").fill("LOCAL_QA_CUSTOM_SCHEDULE");
    await page.getByRole("button", { name: "儲存當日設定" }).click();
    await expect(page.getByRole("status")).toContainText("當日開放時段已更新");

    await page.reload();
    await selectCalendarDate(page, targetDate);
    await expect(page.getByRole("button", { name: "自訂時段" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByLabel("時段 1 開始")).toHaveValue("12:00");
    await expect(page.getByLabel("時段 1 結束")).toHaveValue("16:00");

    await page.getByRole("button", { name: "正常營業" }).click();
    await page.getByLabel("備註").fill("");
    await page.getByRole("button", { name: "儲存當日設定" }).click();
    await expect(page.getByRole("status")).toContainText("當日開放時段已更新");
  });

  await test.step("confirm payment, cancel, and expire independent bookings", async () => {
    await openMerchantView(page, "bookings", "預約管理");
    await page.getByLabel("預約狀態").selectOption("PENDING_PAYMENT");

    const paymentBooking = page.locator("article").filter({ hasText: "QA 陳怡君（需訂金）" });
    await paymentBooking.getByRole("button", { name: "確認訂金" }).click();
    const paymentDialog = page.getByRole("dialog", { name: "確認已收到訂金" });
    await expect(paymentDialog).toBeVisible();
    await paymentDialog.getByRole("button", { name: "確認已收款" }).click();
    await expect(page.getByRole("status")).toContainText("訂金已確認");

    await page.getByLabel("預約狀態").selectOption("CONFIRMED");
    const confirmedPaymentBooking = page.locator("article").filter({ hasText: "QA 陳怡君（需訂金）" });
    const cancelResponse = page.waitForResponse(
      (response) =>
        response.url().includes("/api/merchant/bookings/status") &&
        response.request().method() === "PATCH",
    );
    page.once("dialog", (dialog) => dialog.accept("LOCAL_QA_CANCELLED_AFTER_PAYMENT"));
    await confirmedPaymentBooking.getByRole("button", { name: "取消預約" }).click();
    expect((await cancelResponse).status()).toBe(200);
    await expect(page.getByRole("status")).toContainText("預約狀態已更新");

    await page.getByLabel("預約狀態").selectOption("PENDING_PAYMENT");
    const expiryBooking = page.locator("article").filter({ hasText: "QA 林雅婷（黑名單）" });
    const expiryResponse = page.waitForResponse(
      (response) =>
        response.url().includes("/api/merchant/bookings/status") &&
        response.request().method() === "PATCH",
    );
    page.once("dialog", (dialog) => dialog.accept("LOCAL_QA_PAYMENT_EXPIRED"));
    await expiryBooking.getByRole("button", { name: "標記失效" }).click();
    expect((await expiryResponse).status()).toBe(200);
    await expect(page.getByRole("status")).toContainText("預約狀態已更新");
    await page.getByLabel("預約狀態").selectOption("EXPIRED");
    await expect(page.getByText("QA 林雅婷（黑名單）").first()).toBeVisible();
  });

  await test.step("update and restore service availability controls", async () => {
    await openMerchantView(page, "services", "服務項目");
    const service = page.locator("article").filter({ hasText: "深層舒壓" });
    await service.getByLabel("前置緩衝").fill("12");
    await service.getByLabel("後置緩衝").fill("18");
    await service.getByRole("button", { name: "儲存服務緩衝時間" }).click();
    await expect(page.getByRole("status")).toContainText("服務緩衝時間已更新");
    await service.getByLabel("前置緩衝").fill("10");
    await service.getByLabel("後置緩衝").fill("10");
    await service.getByRole("button", { name: "儲存服務緩衝時間" }).click();

    await service.getByRole("button", { name: "關閉線上預約" }).click();
    await expect(service.getByRole("button", { name: "開啟線上預約" })).toBeVisible();
    await service.getByRole("button", { name: "開啟線上預約" }).click();
    await expect(service.getByRole("button", { name: "關閉線上預約" })).toBeVisible();
  });

  await test.step("pause and restore the location", async () => {
    await openMerchantView(page, "locations", "分店管理");
    await page.getByRole("button", { name: "暫停", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("分店預約狀態已更新");
    await expect(page.getByText("暫停預約", { exact: true }).first()).toBeVisible();
    await page.getByRole("button", { name: "開放", exact: true }).click();
    await expect(page.getByText("開放預約", { exact: true }).first()).toBeVisible();
  });

  await test.step("retry a failed notification and save booking settings", async () => {
    await openMerchantView(page, "settings", "商家設定");
    const failedDelivery = page.locator("tr").filter({ hasText: "LOCAL_QA_PROVIDER_TIMEOUT" });
    await failedDelivery.getByRole("button", { name: "立即重試" }).click();
    await expect(page.getByRole("status")).toContainText("通知已排入重試佇列");

    const bookingSettings = page.locator("section").filter({ hasText: "預約規則與訂金" }).first();
    const cutoff = bookingSettings.getByLabel("免費取消期限（預約前小時）");
    await cutoff.fill("36");
    await bookingSettings.getByRole("button", { name: "儲存" }).click();
    await expect(page.getByRole("status")).toContainText("預約規則與訂金設定已更新");
    await cutoff.fill("24");
    await bookingSettings.getByRole("button", { name: "儲存" }).click();
    await expect(page.getByRole("status")).toContainText("預約規則與訂金設定已更新");
  });

  expect(hydrationErrors).toEqual([]);
});

test("provider can complete assigned work and mark an independent no-show", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chrome", "staff mutations run once on desktop");
  const hydrationErrors = trackHydrationErrors(page);
  await loginAs(page, accounts.provider);
  await expect(page).toHaveURL(/\/staff\/taipei$/);
  await expect(page.getByRole("heading", { name: /我的預約/ })).toBeVisible();
  await expect(page.getByText("QA 陳怡君（需訂金）")).toHaveCount(0);

  const serviceBooking = page.locator("article").filter({ hasText: /10:00.*QA 王小美（VIP 常客）/ });
  await serviceBooking.getByRole("button", { name: "報到" }).click();
  await expect(serviceBooking.getByText("已報到", { exact: true })).toBeVisible();
  await serviceBooking.getByRole("button", { name: "開始服務" }).click();
  await expect(serviceBooking.getByText("服務中", { exact: true })).toBeVisible();
  await serviceBooking.getByRole("button", { name: "完成服務" }).click();
  await expect(serviceBooking.getByText("已完成", { exact: true })).toBeVisible();

  const noShowBooking = page.locator("article").filter({ hasText: "QA 林雅婷（黑名單）" });
  await noShowBooking.getByRole("button", { name: "未到店" }).click();
  await expect(noShowBooking.getByText("未到店", { exact: true })).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.goto(`/merchant/dashboard?${merchantScope}`);
  await expect(page).toHaveURL(/\/staff\/taipei$/);
  expect(hydrationErrors).toEqual([]);
});

test("customer can book, reschedule, and cancel through the secure link", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chrome", "customer mutation runs once on desktop");
  test.setTimeout(120_000);
  const hydrationErrors = trackHydrationErrors(page);
  await loginAs(page, accounts.customer);
  await expect(page).toHaveURL(/\/book\/demo\/taipei$/);

  const dateSection = page.locator('section[aria-labelledby="date-heading"]');
  const availableDays = dateSection.getByRole("button").filter({ hasText: "可查詢" });
  await expect(availableDays.nth(2)).toBeVisible();
  await availableDays.nth(2).click();
  const timeButtons = dateSection.getByRole("button").filter({ hasText: /^\d{2}:\d{2}$/ });
  await expect(timeButtons.first()).toBeVisible();
  await timeButtons.first().click();

  const details = page.locator('section[aria-labelledby="details-heading"]');
  await details.getByLabel("姓名").fill("QA 顧客完整流程");
  await details.getByLabel("手機").fill("0900000001");
  await details.getByLabel("Email（選填）").fill("customer@lumi.test");
  await details.getByLabel(/我確認服務內容與取消規則/).check();
  await details.getByRole("button", { name: "送出預約" }).click();

  await expect(page).toHaveURL(/\/booking\/[^/]+$/);
  await expect(page.getByRole("heading", { level: 1, name: "預約已確認" })).toBeVisible();
  await page.getByRole("link", { name: "改期", exact: true }).click();

  await expect(page.getByRole("heading", { level: 1, name: "選擇新的預約日期" })).toBeVisible();
  const rescheduleSection = page.locator('section[aria-labelledby="date-heading"]');
  const rescheduleDays = rescheduleSection.getByRole("button").filter({ hasText: "可查詢" });
  await expect(rescheduleDays.nth(3)).toBeVisible();
  await rescheduleDays.nth(3).click();
  const rescheduleTimes = rescheduleSection.getByRole("button").filter({ hasText: /^\d{2}:\d{2}$/ });
  await expect(rescheduleTimes.first()).toBeVisible();
  await rescheduleTimes.first().click();
  await page.getByRole("button", { name: "確認改期" }).click();

  await expect(page).toHaveURL(/\/booking\/[^/]+$/);
  await expect(page.getByRole("heading", { level: 1, name: "預約已確認" })).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "取消預約" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "已取消" })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  expect(hydrationErrors).toEqual([]);
});

test("Pixel 7 first screens remain usable for merchant, provider, and customer", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chrome", "mobile visual QA only");
  const hydrationErrors = trackHydrationErrors(page);

  await loginAs(page, accounts.merchant);
  await expect(page).toHaveURL(/\/merchant\/dashboard/);
  await expectStartsWithinViewport(
    page.locator('section[aria-label="月曆"]'),
    page,
  );
  await captureFirstScreen(page, testInfo, "mobile-merchant-dashboard.png");

  await page.context().clearCookies();
  await loginAs(page, accounts.provider);
  await expect(page).toHaveURL(/\/staff\/taipei$/);
  await expectStartsWithinViewport(page.locator("main article").first(), page);
  await captureFirstScreen(page, testInfo, "mobile-provider-schedule.png");

  await page.context().clearCookies();
  await loginAs(page, accounts.customer);
  await expect(page).toHaveURL(/\/book\/demo\/taipei$/);
  await expectStartsWithinViewport(
    page.getByRole("heading", { name: "選擇日期與時間" }),
    page,
  );
  await captureFirstScreen(page, testInfo, "mobile-customer-booking.png");
  expect(hydrationErrors).toEqual([]);
});

async function expectStartsWithinViewport(
  locator: Locator,
  page: Page,
): Promise<void> {
  await expect(locator).toBeVisible();
  const [box, viewportHeight] = await Promise.all([
    locator.boundingBox(),
    page.evaluate(() => window.innerHeight),
  ]);
  expect(box).not.toBeNull();
  expect(box?.y).toBeLessThan(viewportHeight);
}

async function captureFirstScreen(
  page: Page,
  testInfo: TestInfo,
  name: string,
): Promise<void> {
  await expectNoHorizontalOverflow(page);
  const path = testInfo.outputPath(name);
  const screenshot = await page.screenshot({ path });
  await testInfo.attach(name, {
    body: screenshot,
    contentType: "image/png",
  });
}
