import { chromium, expect as browserExpect } from "@playwright/test";
import { it, expect } from "vitest";
import { chooseLanguage } from "./language-menu";
import { translate } from "../src/lib/i18n/messages";
import type { Locale } from "../src/lib/i18n/locale";

it.skipIf(!process.env.UNIFIED_UI_TEST_URL)("keeps mobile operations navigation compact and preserves drafts across menus and languages", async () => {
  const browser = await chromium.launch({executablePath:
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"});
  const page = await browser.newPage({locale:"zh-TW",viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  try {
    await page.goto(`${process.env.UNIFIED_UI_TEST_URL}/api/line-booking/integrated-demo?role=owner`);
    const navigation = page.getByRole("navigation", {name:"營運工作區"});
    await browserExpect(navigation).toBeVisible();
    expect((await navigation.boundingBox())!.height).toBeLessThanOrEqual(88);
    await page.getByRole("spinbutton", {name:"最早可開始時間（幾分鐘後）"}).fill("27");
    await page.getByRole("heading", {name:"營運管理",exact:true}).click();
    for (const locale of ["zh-TW","en","vi"] as Locale[]) {
      await chooseLanguage(page,locale);
      const nav = page.getByRole("navigation", {name:translate(locale,"營運工作區")});
      await browserExpect(page.getByRole("spinbutton", {name:translate(locale,"最早可開始時間（幾分鐘後）")})).toHaveValue("27");
      for (const width of [320,390,430]) {
        await page.setViewportSize({width,height:844});
        expect((await nav.boundingBox())!.height).toBeLessThanOrEqual(88);
        expect(await nav.locator("button:visible").count()).toBe(5);
        expect(await page.locator("html").evaluate(node=>node.scrollWidth<=innerWidth)).toBe(true);
      }
      for (const label of ["薪資試算","多人抽成"]) {
        await nav.getByRole("button", {name:translate(locale,"更多營運功能")}).click();
        await page.getByRole("menuitemradio", {name:translate(locale,label),exact:true}).click();
        await browserExpect(page.getByRole("heading", {name:translate(locale,label),exact:true})).toBeVisible();
        await browserExpect(nav.getByRole("button", {name:translate(locale,"更多營運功能")})).toHaveAttribute("aria-current","page");
      }
      await nav.getByRole("button", {name:translate(locale,"更多營運功能")}).click();
      await page.keyboard.press("Escape");
      await browserExpect(nav.getByRole("button", {name:translate(locale,"更多營運功能")})).toBeFocused();
      await nav.getByRole("button", {name:translate(locale,"預約改派"),exact:true}).click();
      await browserExpect(page.getByRole("heading", {name:translate(locale,"預約改派"),exact:true})).toBeVisible();
      await nav.getByRole("button", {name:translate(locale,"現場排程"),exact:true}).click();
      await browserExpect(page.getByRole("spinbutton", {name:translate(locale,"最早可開始時間（幾分鐘後）")})).toHaveValue("27");
      await page.screenshot({path:`.dev-logs/mobile-navigation-${locale}.png`});
    }
    await page.setViewportSize({width:844,height:390});
    expect(await page.getByRole("navigation", {name:translate("vi","營運工作區")}).locator("button:visible").count()).toBe(5);
    expect(await page.locator("html").evaluate(node=>node.scrollWidth<=innerWidth)).toBe(true);
  } finally { await browser.close(); }
},90000);

it.skipIf(!process.env.UNIFIED_UI_TEST_URL)("retains the signed-in page on failed logout and retries a real revocation", async () => {
  const base = process.env.UNIFIED_UI_TEST_URL!;
  const browser = await chromium.launch({executablePath:
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"});
  try {
    for (const path of ["/merchant/dashboard?organization=demo&location=taipei","/select-location?organization=demo"]) {
      const context = await browser.newContext({locale:"zh-TW",viewport:{width:390,height:844}});
      const page = await context.newPage();
      const errors:string[]=[]; page.on("pageerror",error=>errors.push(error.message));
      await page.goto(`${base}/api/line-booking/integrated-demo?role=owner`);
      await page.goto(`${base}${path}`);
      for (const locale of ["zh-TW","en","vi"] as Locale[]) {
        await chooseLanguage(page,locale);
        await page.route("**/api/auth/logout", route => locale === "zh-TW"
          ? route.abort("internetdisconnected") : route.fulfill({status:503,json:{error:{message:"test failure"}}}));
        await page.getByRole("button",{name:translate(locale,"登出"),exact:true}).click();
        await browserExpect(page.getByRole("alert").filter({hasText:translate(locale,"登出尚未完成，請檢查連線後重試。")})).toBeVisible();
        await browserExpect(page.getByRole("dialog",{name:translate(locale,"登出"),exact:true})).toBeVisible();
        expect(new URL(page.url()).pathname+new URL(page.url()).search).toBe(path);
        expect((await context.cookies()).some(cookie=>cookie.name==="beauty_session")).toBe(true);
        expect((await context.request.get(`${base}/api/auth/session`)).status()).toBe(200);
        await page.screenshot({path:`.dev-logs/logout-recovery-${path.startsWith('/merchant/')?'merchant':'shared'}-${locale}.png`});
        if (locale !== "vi") {
          if (locale === "zh-TW") await page.keyboard.press("Escape");
          else await page.getByRole("dialog").getByRole("button",{name:translate(locale,"關閉"),exact:true}).click();
          await browserExpect(page.getByRole("button",{name:translate(locale,"登出"),exact:true})).toBeFocused();
        }
        await page.unroute("**/api/auth/logout");
      }
      await page.getByRole("button",{name:translate("vi","重試"),exact:true}).click();
      await page.waitForURL(`${base}/`);
      expect((await context.cookies()).some(cookie=>cookie.name==="beauty_session")).toBe(false);
      expect((await context.request.get(`${base}/api/auth/session`)).status()).toBe(401);
      expect(errors).toEqual([]);
      await context.close();
    }
  } finally { await browser.close(); }
},90000);

it.skipIf(!process.env.UNIFIED_UI_TEST_URL)("enters all synthetic roles and clears merchant authority when switching to customer", async () => {
  const base = process.env.UNIFIED_UI_TEST_URL!;
  const browser = await chromium.launch({executablePath:
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",headless:true});
  try {
    for (const role of ["customer","receptionist","beautician","owner"]) {
      const context = await browser.newContext({locale:'zh-TW',viewport:{width:390,height:844}});
      const page = await context.newPage();
      const errors: string[] = [];
      page.on("pageerror",error=>errors.push(error.message));
      await page.goto(`${base}/api/line-booking/integrated-demo?role=${role}`);
      if (role === "owner") {
        await browserExpect(page.getByRole("heading",{name:"營運管理"})).toBeVisible();
        for (const width of [360,390,430,768,1280]) {
          await page.setViewportSize({width,height:844});
          expect(await page.locator("html").evaluate(element=>element.scrollWidth<=innerWidth)).toBe(true);
          await page.screenshot({path:`.dev-logs/owner-operations-${width}.png`,fullPage:true});
        }
        await page.goto(`${base}/api/line-booking/integrated-demo?role=customer`);
        expect((await context.cookies()).some(cookie=>cookie.name==="beauty_session")).toBe(false);
      }
      if (role === "beautician" || role === "receptionist") {
        await browserExpect(page.getByRole("button",{name:"店內行程",exact:true})).toHaveAttribute("aria-current","page");
        await browserExpect(page.locator("#booking")).toBeHidden();
        if (role === "beautician") {
          await page.getByRole("button",{name:"出勤",exact:true}).click();
          await browserExpect(page.getByRole("heading",{name:"我的出勤",level:2})).toBeVisible();
        } else {
          await browserExpect(page.getByRole("button",{name:"出勤",exact:true})).toHaveCount(0);
        }
      } else {
        await browserExpect(page.locator("#service")).toBeVisible();
        await browserExpect(page.getByRole("button",{name:"店內行程",exact:true})).toHaveCount(0);
      }
      for (const width of [360,390,430,768,1280]) {
        await page.setViewportSize({width,height:844});
        expect(await page.locator("html").evaluate(element=>element.scrollWidth<=innerWidth)).toBe(true);
        await page.screenshot({path:`.dev-logs/${role === "owner" ? "owner-switched-customer" : role}-${width}.png`,fullPage:true});
      }
      expect(errors).toEqual([]);
      await context.close();
    }
    if (process.env.UNIFIED_UI_LAN_URL) {
      const context = await browser.newContext({locale:'zh-TW',viewport:{width:390,height:844}});
      try {
        const page = await context.newPage();
        const errors: string[] = [];
        page.on("pageerror", error => errors.push(error.message));
        await page.goto(`${process.env.UNIFIED_UI_LAN_URL}/api/line-booking/integrated-demo?role=customer`);
        await browserExpect(page.locator("#service")).toBeVisible();
        await page.getByRole("button",{name:"選擇時間",exact:true}).click();
        await browserExpect(page.locator("#date")).toBeVisible();
        expect(errors).toEqual([]);
        await page.screenshot({path:".dev-logs/lan-customer-390.png",fullPage:true});
      } finally { await context.close(); }
    }
  } finally { await browser.close(); }
},90000);
