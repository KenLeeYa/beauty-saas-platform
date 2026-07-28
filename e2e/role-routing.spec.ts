import { expect, test } from "@playwright/test";

test("login surface fits the viewport", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "登入預約空間" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "登入" })).toBeVisible();

  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
});

test("merchant account enters the merchant workspace", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /店家測試/ }).click();
  await page.getByRole("button", { name: "登入" }).click();

  await expect(page).toHaveURL(
    /\/merchant\/dashboard\?organization=demo&location=taipei$/,
  );
  await expect(
    page.getByRole("heading", { name: "營運總覽" }),
  ).toBeVisible();
});

test("customer account enters the public booking calendar", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: /顧客測試/ }).click();
  await page.getByRole("button", { name: "登入" }).click();

  await expect(page).toHaveURL(/\/book\/demo\/taipei$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "選擇服務" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 2, name: "選擇日期與時間" }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "月曆" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "登出" }).click();
  await expect(page).toHaveURL("/");
  await expect(
    page.getByRole("heading", { name: "登入預約空間" }),
  ).toBeVisible();

  const cookies = await page.context().cookies();
  expect(
    cookies.some((cookie) => cookie.name === "beauty_session"),
  ).toBe(false);
  expect(
    cookies.some((cookie) => cookie.name === "beauty_csrf"),
  ).toBe(false);
});
