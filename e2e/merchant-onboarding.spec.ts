import { randomUUID } from "node:crypto";
import { loadEnvFile } from "node:process";

import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";
import { hash } from "bcryptjs";

test.setTimeout(120_000);

test("merchant application reaches public go-live", async (
  { page },
  testInfo,
) => {
  const baseUrl = String(testInfo.project.use.baseURL ?? "");
  test.skip(
    !/^http:\/\/(127\.0\.0\.1|localhost):/.test(baseUrl),
    "This stateful onboarding flow only runs against a local database.",
  );

  if (!process.env.DATABASE_URL) {
    loadEnvFile(".env.development.local");
  }

  const runId = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const applicantEmail = `merchant-${runId}@beauty.test`;
  const applicantPassword = "Beauty123!";
  const businessName = `QA 美業 ${runId.slice(-8)}`;
  const organizationSlug = `qa-beauty-${runId}`;
  await page.setExtraHTTPHeaders({
    "x-test-client-ip": `merchant-onboarding-${runId}`,
  });
  const prisma = new PrismaClient();
  const applicantProfile = await prisma.profiles.create({
    data: {
      id: randomUUID(),
      email: applicantEmail,
      password_hash: await hash(applicantPassword, 12),
      display_name: "QA 商家申請人",
      is_active: true,
    },
  });
  await prisma.$disconnect();

  await page.goto("/?next=/onboarding");
  await page.getByLabel("Email").fill(applicantEmail);
  await page
    .getByRole("textbox", { name: "密碼 顯示密碼" })
    .fill(applicantPassword);
  await page.getByRole("button", { name: "登入" }).click();
  await expect(page).toHaveURL(/\/onboarding$/);

  await page.getByLabel("商家名稱").fill(businessName);
  await page.getByLabel("聯絡電話").fill("0912345678");
  await page
    .getByLabel("商家網址代碼")
    .fill(organizationSlug);
  await page.getByLabel("分店名稱").fill("QA 台北店");
  await page.getByLabel("分店地址").fill("台北市信義區測試路 1 號");
  await page
    .getByLabel("申請備註")
    .fill("Playwright 本機商家導入測試。");
  await page.getByRole("button", { name: "送出申請" }).click();

  await expect(page).toHaveURL(/\/onboarding\/status$/);
  await expect(
    page.getByRole("heading", { name: "平台正在處理申請" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "登出" }).click();
  await expect(page).toHaveURL("/");

  await page.getByLabel("Email").fill("platform@beauty.test");
  await page
    .getByRole("textbox", { name: "密碼 顯示密碼" })
    .fill(applicantPassword);
  await page.getByRole("button", { name: "登入" }).click();
  await expect(page).toHaveURL(/\/admin\/organizations$/);
  await page.goto("/admin/merchant-applications");

  const application = page
    .getByRole("article")
    .filter({ hasText: businessName });
  await expect(application).toContainText("待受理");
  await application
    .getByRole("button", { name: "開始審核" })
    .click();
  await expect(application).toContainText("審核中");

  page.once("dialog", (dialog) => dialog.accept());
  await application
    .getByRole("button", { name: "核准並建立試用" })
    .click();
  await expect(application).toContainText("已核准");

  await page.goto("/admin/organizations");
  const organizationLink = page.getByRole("link", {
    name: businessName,
  });
  await expect(organizationLink).toBeVisible();
  await organizationLink.click();
  await expect(
    page.getByRole("heading", { name: businessName }),
  ).toBeVisible();
  await expect(page.getByText("未啟用", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "登出" }).click();
  await expect(page).toHaveURL("/");
  await page.getByLabel("Email").fill(applicantEmail);
  await page
    .getByRole("textbox", { name: "密碼 顯示密碼" })
    .fill(applicantPassword);
  await page.getByRole("button", { name: "登入" }).click();
  await expect(page).toHaveURL(
    new RegExp(
      `/merchant/setup\\?organization=${organizationSlug}&location=main$`,
    ),
  );
  await expect(
    page.getByRole("heading", { name: "開店設定" }),
  ).toBeVisible();

  await page
    .getByRole("button", { name: "儲存營業時間" })
    .click();
  await expect(
    page.getByRole("button", { name: "儲存營業時間" }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "儲存預約政策" })
    .click();
  await expect(
    page.getByRole("button", { name: "儲存預約政策" }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "確認通知設定" })
    .click();
  await expect(
    page.getByRole("button", { name: "確認通知設定" }),
  ).toHaveCount(0);

  const scope = `organization=${encodeURIComponent(
    organizationSlug,
  )}&location=main`;
  await page.goto(`/merchant/services?${scope}`);
  await page.getByRole("button", { name: "新增服務" }).click();
  await page.getByLabel("服務名稱").fill("QA 臉部保養");
  await page.getByLabel("規格名稱").fill("標準療程");
  await page.getByLabel("服務分鐘").fill("60");
  await page.getByLabel("價格（TWD）").fill("1800");
  await page.getByRole("button", { name: "儲存" }).click();
  await expect(page.getByText("QA 臉部保養")).toBeVisible();

  await page.goto(`/merchant/staff?${scope}`);
  await page
    .getByRole("button", { name: "新增服務人員" })
    .click();
  await page.getByLabel("顯示名稱").fill("QA 美容師");
  await page.getByLabel("職稱").fill("美容師");
  await page.getByLabel("技能（以逗號分隔）").fill("臉部保養");
  await page.getByRole("button", { name: "儲存" }).click();
  await expect(page.getByText("QA 美容師")).toBeVisible();

  await page.goto(`/merchant/resources?${scope}`);
  await page
    .getByRole("button", { name: "新增空間或設備" })
    .click();
  await page.getByLabel("資源名稱").fill("QA 療程室");
  await page.getByLabel("類型名稱").fill("療程室");
  await page.getByLabel("資源種類").selectOption("SPA_ROOM");
  await page.getByRole("button", { name: "儲存" }).click();
  await expect(page.getByText("QA 療程室")).toBeVisible();

  await page.goto(`/merchant/setup?${scope}`);
  const testBookingButton = page.getByRole("button", {
    name: "建立並完成測試預約",
  });
  await expect(testBookingButton).toBeEnabled();
  await testBookingButton.click();
  await expect(page.getByText("測試預約已完成。")).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "正式上線" }).click();
  await expect(page.getByText("公開預約已正式開放。")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "開啟公開預約" }),
  ).toBeVisible();

  await page.goto(`/book/${organizationSlug}/main`);
  await expect(
    page.getByRole("heading", { level: 1, name: "選擇服務" }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("button")
      .filter({ hasText: "QA 臉部保養" }),
  ).toBeVisible();

  const scopePrisma = new PrismaClient();
  const [testOrganization, demoOrganization] = await Promise.all([
    scopePrisma.organizations.findUniqueOrThrow({
      where: {
        slug: organizationSlug,
      },
      select: {
        id: true,
      },
    }),
    scopePrisma.organizations.findUniqueOrThrow({
      where: {
        slug: "demo",
      },
      select: {
        id: true,
      },
    }),
  ]);
  await scopePrisma.$transaction([
    scopePrisma.locations.create({
      data: {
        organization_id: testOrganization.id,
        name: "QA 第二分店",
        slug: "second",
        code: "SECOND",
        timezone: "Asia/Taipei",
        currency: "TWD",
        booking_state: "CLOSED",
        online_booking_enabled: false,
        is_active: true,
      },
    }),
    scopePrisma.organization_memberships.create({
      data: {
        organization_id: demoOrganization.id,
        profile_id: applicantProfile.id,
        role: "FINANCE_VIEWER",
        status: "ACTIVE",
        all_locations: true,
        is_primary_owner: false,
        joined_at: new Date(),
      },
    }),
  ]);
  await scopePrisma.$disconnect();

  await page.goto(`/merchant/dashboard?${scope}`);
  if (testInfo.project.name === "mobile-chrome") {
    await page
      .getByRole("button", { name: "開啟選單" })
      .click();
  }
  await page.getByRole("button", { name: "登出" }).click();
  await expect(page).toHaveURL("/");
  await page.getByLabel("Email").fill(applicantEmail);
  await page
    .getByRole("textbox", { name: "密碼 顯示密碼" })
    .fill(applicantPassword);
  await page.getByRole("button", { name: "登入" }).click();
  await expect(page).toHaveURL(/\/select-organization$/);
  await expect(
    page.getByRole("heading", { name: "選擇商家" }),
  ).toBeVisible();
  await page
    .getByRole("link")
    .filter({ hasText: businessName })
    .click();
  await expect(page).toHaveURL(
    new RegExp(
      `/select-location\\?organization=${organizationSlug}$`,
    ),
  );
  await expect(
    page.getByRole("heading", { name: "選擇分店" }),
  ).toBeVisible();
  await expect(page.getByText("QA 台北店", { exact: true })).toBeVisible();
  await expect(
    page.getByText("QA 第二分店", { exact: true }),
  ).toBeVisible();
});
