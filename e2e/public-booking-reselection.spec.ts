import { expect, test } from "@playwright/test";

test("customer can replace a held time and change dates", async ({
  page,
}) => {
  await page.goto("/book/demo/taipei");
  await page.getByRole("button", {name: "下一步", exact: true}).click();
  await page.getByRole("button", {name: "下一步", exact: true}).click();

  const dateSection = page.locator(
    'section[aria-labelledby="date-heading"]',
  );
  const calendar = dateSection.locator("section[aria-label]").first();
  const availableDays = calendar
    .getByRole("button")
    .filter({ hasText: "可查詢" });

  const primaryDay = availableDays.nth(1);
  const secondaryDay = availableDays.nth(2);
  await expect(primaryDay).toBeVisible();
  await primaryDay.click();

  const dialog = page.getByRole("dialog");
  const timeButtons = dialog
    .getByRole("button")
    .filter({ hasText: /^\d{2}:\d{2}$/ });
  await expect(timeButtons.nth(5)).toBeVisible();

  const firstTime = await timeButtons.first().innerText();
  const replacementTime = await timeButtons.nth(5).innerText();
  await timeButtons.first().click();
  await dialog.getByRole("button", {name: "確認時間", exact: true}).click();

  const details = page.locator(
    'section[aria-labelledby="details-heading"]',
  );
  const customerName = details.locator("input").first();
  await expect(details).toBeVisible();
  await customerName.fill("重新選時段測試");

  await page.getByRole("button", {name: "上一步", exact: true}).click();
  await primaryDay.click();
  await timeButtons.nth(5).click();
  await expect(
    dialog.getByRole("button", { name: firstTime, exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", {
      name: replacementTime,
      exact: true,
    }),
  ).toHaveAttribute("aria-pressed", "true");
  await dialog.getByRole("button", {name: "確認時間", exact: true}).click();
  await expect(details).toBeVisible();
  await expect(customerName).toHaveValue("重新選時段測試");

  await page.getByRole("button", {name: "上一步", exact: true}).click();
  await expect(secondaryDay).toBeVisible();
  await secondaryDay.click();
  await expect(details).toHaveCount(0);
  await expect(timeButtons.first()).toBeVisible();
  await timeButtons.first().click();
  await dialog.getByRole("button", {name: "確認時間", exact: true}).click();

  await expect(details).toBeVisible();
  await expect(details.locator("input").first()).toHaveValue(
    "重新選時段測試",
  );

  await page.getByRole("button", {name: "上一步", exact: true}).click();
  await primaryDay.click();
  await expect(details).toHaveCount(0);
});
