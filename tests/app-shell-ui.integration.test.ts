import { chromium, expect as browserExpect } from "@playwright/test";
import { expect, it } from "vitest";
import { chooseLanguage } from "./language-menu";
import { translate } from "../src/lib/i18n/messages";
import type { Locale } from "../src/lib/i18n/locale";

it.skipIf(!process.env.UNIFIED_UI_TEST_URL)("retains sidebar and mobile directory position across navigation and reload", async () => {
  const base=process.env.UNIFIED_UI_TEST_URL!;
  const browser=await chromium.launch({executablePath:"C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"});
  const page=await browser.newPage({locale:"zh-TW",viewport:{width:1280,height:650}});
  try {
    await page.goto(`${base}/api/line-booking/integrated-demo?role=owner`);
    await page.goto(`${base}/merchant/calendar?organization=demo&location=taipei`);
    const sidebar=page.locator(".workspace-sidebar");
    await sidebar.getByRole("link",{name:"商家設定",exact:true}).scrollIntoViewIfNeeded();
    const position=await sidebar.evaluate(node=>node.scrollTop);
    expect(position).toBeGreaterThan(100);
    await sidebar.getByRole("link",{name:"商家設定",exact:true}).click();
    await browserExpect(page).toHaveURL(/merchant\/settings/);
    await browserExpect.poll(()=>sidebar.evaluate(node=>node.scrollTop)).toBeCloseTo(position,0);
    await page.reload();
    await browserExpect.poll(()=>sidebar.evaluate(node=>node.scrollTop)).toBeCloseTo(position,0);
    await browserExpect(sidebar.getByRole("link",{name:"商家設定",exact:true})).toHaveAttribute("aria-current","page");
    await page.setViewportSize({width:390,height:620});
    await page.getByRole("button",{name:"開啟選單",exact:true}).click();
    const menu=page.locator(".workspace-menu-body");
    await menu.getByRole("link",{name:"訂閱方案",exact:true}).scrollIntoViewIfNeeded();
    const mobilePosition=await menu.evaluate(node=>node.scrollTop);
    await menu.getByRole("link",{name:"訂閱方案",exact:true}).click();
    await browserExpect(page).toHaveURL(/merchant\/subscription/);
    await page.getByRole("button",{name:"開啟選單",exact:true}).click();
    await browserExpect.poll(()=>menu.evaluate(node=>node.scrollTop)).toBeCloseTo(mobilePosition,0);
  } finally {await browser.close();}
},60000);

it.skipIf(!process.env.UNIFIED_UI_TEST_URL)("keeps application actions and navigation stable across breakpoints and languages", async () => {
  const base = process.env.UNIFIED_UI_TEST_URL!;
  const browser = await chromium.launch({executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"});
  const page = await browser.newPage({locale: "zh-TW", viewport: {width: 768, height: 900}, isMobile: true, hasTouch: true});
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  try {
    await page.goto(`${base}/api/line-booking/integrated-demo?role=owner`);
    await page.goto(`${base}/merchant/customers?organization=demo&location=taipei`);
    for (const locale of ["zh-TW", "en", "vi"] as Locale[]) {
      await chooseLanguage(page, locale);
      const action = page.getByRole("link", {name: translate(locale, "開啟顧客預約頁"), exact: true});
      for (const width of [320, 390, 639, 640, 767, 768, 1023, 1024, 1440]) {
        await page.setViewportSize({width, height: 900});
        expect(await action.evaluate(node => {
          const box = node.getBoundingClientRect();
          return [...node.querySelectorAll("span,svg")].every(child => {
            const rect = child.getBoundingClientRect();
            return !rect.width || (rect.left >= box.left - 1 && rect.right <= box.right + 1 && rect.top >= box.top - 1 && rect.bottom <= box.bottom + 1);
          });
        }), `header action content at ${width}px / ${locale}`).toBe(true);
        expect((await action.boundingBox())!.width).toBe(44);
        expect((await action.boundingBox())!.height).toBe(44);
        expect(await page.locator("html").evaluate(node => node.scrollWidth <= innerWidth)).toBe(true);
      }
      await page.setViewportSize({width:390,height:844});
      const navigation = page.getByRole("navigation", {name:translate(locale,"主要導覽")});
      await browserExpect(navigation.getByRole("link", {name:translate(locale,"顧客管理"),exact:true})).toHaveAttribute("aria-current","page");
      const menu = navigation.getByRole("button", {name:translate(locale,"開啟選單")});
      await menu.click();
      const dialog = page.getByRole("dialog", {name:translate(locale,"全部功能")});
      await browserExpect(dialog.getByRole("link", {name:translate(locale,"服務項目"),exact:true})).toBeVisible();
      for (const width of [320,768,1024,390]) {
        await page.setViewportSize({width,height:640});
        expect(await dialog.evaluate(node=>node.scrollWidth<=node.clientWidth)).toBe(true);
        await browserExpect(dialog.getByRole("button", {name:translate(locale,"關閉選單")})).toBeInViewport();
      }
      await page.keyboard.press("Escape");
      await browserExpect(menu).toBeFocused();
      await page.screenshot({path:`.dev-logs/app-shell-${locale}-390.png`});
    }
    await chooseLanguage(page,"zh-TW");
    await page.emulateMedia({reducedMotion:"reduce"});
    await page.addStyleTag({content:"html {font-size: 200% !important;}"});
    await page.getByRole("button", {name:"開啟選單"}).click();
    const expandedMenu = page.getByRole("dialog", {name:"全部功能"});
    expect(await expandedMenu.evaluate(node=>node.scrollWidth<=node.clientWidth)).toBe(true);
    await page.route("**/merchant/services?**", async route => {
      await new Promise(resolve=>setTimeout(resolve,600));
      await route.continue();
    });
    await page.getByRole("dialog").getByRole("link", {name:"服務項目",exact:true}).click();
    await browserExpect(page).toHaveURL(/\/merchant\/services\?organization=demo&location=taipei/);
    await browserExpect(page.getByRole("heading", {name:"服務項目",exact:true})).toBeVisible();
    await page.goBack();
    await browserExpect(page.getByRole("heading", {name:"顧客管理",exact:true})).toBeVisible();
    expect(errors).toEqual([]);
  } finally { await browser.close(); }
}, 90000);

it.skipIf(!process.env.UNIFIED_UI_TEST_URL)("recovers customer note failures inside the detail view and reads back a saved note", async () => {
  const base = process.env.UNIFIED_UI_TEST_URL!;
  const browser = await chromium.launch({executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"});
  const page = await browser.newPage({locale:"zh-TW",viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const errors: string[] = [];
  page.on("pageerror", error=>errors.push(error.message));
  const marker = Date.now();
  const name = `QA app-shell ${marker}`;
  const contact = `09${String(marker).slice(-8)}`;
  const note = `QA app-shell note ${marker}`;
  try {
    await page.goto(`${base}/api/line-booking/integrated-demo?role=owner`);
    await page.goto(`${base}/merchant/customers?organization=demo&location=taipei`);
    const rows = page.getByRole("button", {name:/顧客詳細資料/});
    expect(await rows.count()).toBeLessThanOrEqual(8);
    await page.getByRole("button", {name:"新增顧客",exact:true}).click();
    const create = page.getByRole("form", {name:"新增顧客",exact:true});
    await create.getByLabel("顧客姓名").fill(name);
    await create.getByLabel("手機", {exact:true}).fill(contact);
    await create.getByRole("button", {name:"建立顧客",exact:true}).click();
    await browserExpect(page.getByRole("status")).toContainText("顧客已建立");
    await page.getByPlaceholder("搜尋姓名、手機或標籤").fill(contact);
    await page.getByRole("button", {name:`顧客詳細資料 ${name}`,exact:true}).click();
    const dialog = page.getByRole("dialog", {name:"顧客詳細資料",exact:true});
    await dialog.getByText("顧客紀錄與標籤", {exact:true}).click();
    const field = dialog.getByRole("textbox", {name:"新增顧客備註"});
    await field.fill(note);
    await page.route("**/api/merchant/customers/notes?**", route=>route.fulfill({status:503,json:{error:{message:"服務暫時無法使用，請稍後再試。"}}}));
    await dialog.getByRole("button", {name:"新增備註",exact:true}).click();
    await browserExpect(dialog.getByRole("alert")).toBeVisible();
    await browserExpect(field).toHaveValue(note);
    await page.setViewportSize({width:390,height:420});
    await field.focus();
    await dialog.getByRole("button", {name:"新增備註",exact:true}).scrollIntoViewIfNeeded();
    await browserExpect(dialog.getByRole("button", {name:"新增備註",exact:true})).toBeInViewport();
    await page.unroute("**/api/merchant/customers/notes?**");
    const saved = page.waitForResponse(response=>response.url().includes("/api/merchant/customers/notes") && response.request().method()==="POST");
    await dialog.getByRole("button", {name:"新增備註",exact:true}).click();
    expect((await saved).status()).toBe(201);
    await browserExpect(field).toHaveValue("");
    await browserExpect(dialog.getByText(note,{exact:true})).toBeVisible();
    await page.reload();
    await page.getByPlaceholder("搜尋姓名、手機或標籤").fill(contact);
    const savedCustomer = page.getByRole("button", {name:`顧客詳細資料 ${name}`,exact:true}).filter({hasText:contact});
    await browserExpect(savedCustomer).toHaveCount(1);
    await savedCustomer.click();
    await dialog.getByText("顧客紀錄與標籤", {exact:true}).click();
    await browserExpect(dialog.getByText(note,{exact:true})).toBeVisible();
    expect(errors).toEqual([]);
  } finally {await browser.close();}
},90000);

it.skipIf(!process.env.UNIFIED_UI_TEST_URL)("keeps customer details and note drafts together without expanding the whole directory", async () => {
  const base = process.env.UNIFIED_UI_TEST_URL!;
  const browser = await chromium.launch({executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"});
  const page = await browser.newPage({locale: "zh-TW", viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true});
  try {
    await page.goto(`${base}/api/line-booking/integrated-demo?role=owner`);
    await page.goto(`${base}/merchant/customers?organization=demo&location=taipei`);
    const details = page.getByRole("button", {name: /顧客詳細資料/}).first();
    await browserExpect(details).toBeVisible();
    await browserExpect(page.getByLabel("會員生日", {exact: true})).toHaveCount(0);
    await details.click();
    let dialog = page.getByRole("dialog", {name: "顧客詳細資料", exact: true});
    await dialog.getByText("顧客紀錄與標籤", {exact: true}).click();
    await dialog.getByRole("textbox", {name: "新增顧客備註"}).fill("QA 注音草稿 - keep this note");
    for (const locale of ["en", "vi", "zh-TW"] as Locale[]) {
      await chooseLanguage(dialog, locale);
      dialog = page.getByRole("dialog", {name: translate(locale, "顧客詳細資料"), exact: true});
      for (const width of [320, 640, 1024, 390]) {
        await page.setViewportSize({width, height: 640});
        await browserExpect(dialog.getByRole("textbox", {name: translate(locale, "新增顧客備註")})).toHaveValue("QA 注音草稿 - keep this note");
        expect(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
      }
    }
    await page.keyboard.press("Escape");
    await browserExpect(details).toBeFocused();
    await details.click();
    await dialog.getByText("顧客紀錄與標籤", {exact: true}).click();
    await browserExpect(dialog.getByRole("textbox", {name: "新增顧客備註"})).toHaveValue("QA 注音草稿 - keep this note");
    await page.screenshot({path: ".dev-logs/customer-details-app-390.png"});
  } finally { await browser.close(); }
}, 90000);
