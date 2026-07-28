import { expect, test } from "@playwright/test";

test("customer can replace a held time and change dates", async ({
  page,
}) => {
  await page.goto("/book/demo/taipei");

  const dateSection = page.locator(
    'section[aria-labelledby="date-heading"]',
  );
  const calendar = dateSection.locator("section[aria-label]").first();
  const availableDays = calendar
    .getByRole("button")
    .filter({ hasText: "可查詢" });

  await expect(availableDays.first()).toBeVisible();
  await availableDays.first().click();

  const timeButtons = dateSection
    .getByRole("button")
    .filter({ hasText: /^\d{2}:\d{2}$/ });
  await expect(timeButtons.nth(5)).toBeVisible();

  const firstTime = await timeButtons.first().innerText();
  const replacementTime = await timeButtons.nth(5).innerText();
  await timeButtons.first().click();

  const details = page.locator(
    'section[aria-labelledby="details-heading"]',
  );
  const customerName = details.locator("input").first();
  await expect(details).toBeVisible();
  await customerName.fill("重新選時段測試");

  await timeButtons.nth(5).click();

  await expect(details).toBeVisible();
  await expect(customerName).toHaveValue("重新選時段測試");
  await expect(
    dateSection.getByRole("button", { name: firstTime, exact: true }),
  ).toBeVisible();
  await expect(
    dateSection.getByRole("button", {
      name: replacementTime,
      exact: true,
    }),
  ).toHaveAttribute("aria-pressed", "true");

  await expect(availableDays.nth(1)).toBeVisible();
  await availableDays.nth(1).click();
  await expect(details).toHaveCount(0);
  await expect(timeButtons.first()).toBeVisible();
  await timeButtons.first().click();

  await expect(details).toBeVisible();
  await expect(details.locator("input").first()).toHaveValue(
    "重新選時段測試",
  );

  await availableDays.first().click();
  await expect(details).toHaveCount(0);
});
