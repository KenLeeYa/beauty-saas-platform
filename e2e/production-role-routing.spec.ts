import { expect, test, type Page } from "@playwright/test";

const qaPassword = process.env.PRODUCTION_QA_PASSWORD;

const accounts = {
  merchant: "merchant.qa@beauty-preview.test",
  provider: "provider.qa@beauty-preview.test",
  platform: "platform.qa@beauty-preview.test",
  customer: "customer.qa@beauty-preview.test",
} as const;

async function login(page: Page, email: string): Promise<void> {
  if (!qaPassword) {
    throw new Error("PRODUCTION_QA_PASSWORD is required.");
  }

  await page.goto("/");
  await page.getByLabel("Email").fill(email);
  await page.locator('input[type="password"]').fill(qaPassword);
  const loginResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/auth/login") &&
      response.request().method() === "POST",
    { timeout: 30_000 },
  );
  await page.getByRole("button", { name: "登入" }).click();
  expect((await loginResponse).status()).toBe(200);
}

async function expectSecureSession(page: Page): Promise<void> {
  const cookies = await page.context().cookies();
  const session = cookies.find((cookie) => cookie.name === "beauty_session");

  expect(session).toBeDefined();
  expect(session?.httpOnly).toBe(true);
  expect(session?.secure).toBe(true);
  expect(session?.sameSite).toBe("Lax");
}

test.describe("production role routing", () => {
  test.skip(!qaPassword, "PRODUCTION_QA_PASSWORD is required.");

  test("merchant enters the preview merchant workspace", async ({ page }) => {
    await login(page, accounts.merchant);

    await expect(page).toHaveURL(
      /\/merchant\/dashboard\?organization=preview&location=taipei$/,
      { timeout: 30_000 },
    );
    await expect(
      page.getByRole("heading", { name: "營運總覽" }),
    ).toBeVisible();
    await expectSecureSession(page);
  });

  test("provider enters the scoped staff workspace", async ({ page }) => {
    await login(page, accounts.provider);

    await expect(page).toHaveURL(/\/staff\/taipei$/, {
      timeout: 30_000,
    });
    await expect(
      page.getByRole("heading", { name: /我的預約/ }),
    ).toBeVisible();
    await expectSecureSession(page);
  });

  test("platform admin enters platform operations", async ({ page }) => {
    await login(page, accounts.platform);

    await expect(page).toHaveURL(/\/admin\/organizations$/, {
      timeout: 30_000,
    });
    await expect(
      page.getByRole("heading", { name: "Beauty SaaS 營運總覽" }),
    ).toBeVisible();
    await expectSecureSession(page);
  });

  test("customer enters the preview booking calendar", async ({ page }) => {
    await login(page, accounts.customer);

    await expect(page).toHaveURL(/\/book\/preview\/taipei$/, {
      timeout: 30_000,
    });
    await expect(
      page.getByRole("heading", { level: 1, name: "選擇服務" }),
    ).toBeVisible();
    await expect(
      page.getByRole("region", { name: "月曆" }),
    ).toBeVisible();
    await expectSecureSession(page);

    const dimensions = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(
      dimensions.clientWidth,
    );
  });
});
