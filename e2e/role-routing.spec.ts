import { expect, test, type Page } from "@playwright/test";

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
}

test("login surface fits the viewport", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "登入預約空間" }),
  ).toBeVisible();
  const loginButton = page.getByRole("button", {
    name: "登入",
    exact: true,
  });
  await expect(loginButton).toBeVisible();
  await expect(loginButton).toBeEnabled();
  await expect(page.getByText("準備中", { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /員工測試/ }),
  ).toBeVisible();

  await expectNoHorizontalOverflow(page);
});

test("merchant account enters the merchant workspace", async ({
  page,
}, testInfo) => {
  const runId = `${testInfo.project.name.replace("-chrome", "")}-${Date.now().toString(36)}`;
  const customerName = `QA 顧客 ${runId}`;
  const customerPhone = `09${testInfo.project.name.startsWith("mobile") ? "8" : "9"}${String(Date.now()).slice(-7)}`;
  const tagName = `QA-${runId}`;
  const noteText = `角色流程測試備註 ${runId}`;

  await page.goto("/");
  await page.getByRole("button", { name: /店家測試/ }).click();
  await page.getByRole("button", { name: "登入" }).click();

  await expect(page).toHaveURL(
    /\/merchant\/dashboard\?organization=demo&location=taipei$/,
  );
  await expect(
    page.getByRole("heading", { name: "營運總覽" }),
  ).toBeVisible();

  await page.goto("/merchant/customers?organization=demo&location=taipei");
  await expect(
    page.getByRole("heading", { name: "顧客管理" }),
  ).toBeVisible();
  await expect(
    page.getByPlaceholder("搜尋姓名、手機或標籤"),
  ).toBeVisible();

  await page.getByRole("button", { name: "新增顧客" }).click();
  const customerForm = page.getByRole("form", { name: "新增顧客" });
  await customerForm.getByLabel("顧客姓名").fill(customerName);
  await customerForm.getByLabel("手機").fill(customerPhone);
  await customerForm.getByLabel("生日").fill("1992-08-09");
  await customerForm.getByRole("button", { name: "建立顧客" }).click();
  await expect(page.getByRole("status")).toContainText("顧客已建立");

  const tagForm = page.getByRole("form", { name: "建立顧客標籤" });
  await tagForm.getByLabel("新標籤名稱").fill(tagName);
  await tagForm.getByRole("button", { name: "建立標籤" }).click();
  await expect(page.getByRole("status")).toContainText("顧客標籤已建立");

  const customerRow = page.locator("article").filter({ hasText: customerName });
  await expect(customerRow).toBeVisible();
  await customerRow.getByText("顧客紀錄與標籤").click();
  await customerRow
    .getByLabel("選擇顧客標籤")
    .selectOption({ label: tagName });
  await customerRow.getByRole("button", { name: "加入標籤" }).click();
  await expect(page.getByRole("status")).toContainText("標籤已加入");
  await expect(customerRow.getByText(tagName, { exact: true }).first()).toBeVisible();

  await customerRow.getByPlaceholder("新增顧客備註").fill(noteText);
  await customerRow.getByLabel("備註敏感層級").selectOption("SENSITIVE");
  await customerRow.getByRole("button", { name: "新增備註" }).click();
  await expect(page.getByRole("status")).toContainText("顧客備註已新增");
  await expect(customerRow.getByText(noteText, { exact: true })).toBeVisible();

  await customerRow
    .getByLabel("此顧客訂金規則")
    .selectOption("REQUIRED");
  await expect(page.getByRole("status")).toContainText("顧客資料已更新");

  page.once("dialog", (dialog) => dialog.accept("QA 常取消紀錄"));
  await customerRow.getByRole("button", { name: "列入黑名單" }).click();
  await expect(customerRow.getByText("黑名單", { exact: true })).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.goto("/merchant/settings?organization=demo&location=taipei");
  await expect(
    page.getByRole("heading", { name: "通知健康狀態" }),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("staff account enters only the scoped staff workspace", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /員工測試/ }).click();
  await page.getByRole("button", { name: "登入" }).click();

  await expect(page).toHaveURL(/\/staff\/taipei$/);
  await expect(
    page.getByRole("heading", { name: /我的預約/ }),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.goto("/merchant/dashboard?organization=demo&location=taipei");
  await expect(page).toHaveURL(/\/staff\/taipei$/);
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
  await expectNoHorizontalOverflow(page);

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
