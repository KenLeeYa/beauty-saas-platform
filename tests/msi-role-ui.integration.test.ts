import { chromium, expect as browserExpect } from "@playwright/test";
import { it, expect } from "vitest";

it.skipIf(!process.env.UNIFIED_UI_TEST_URL)("enters all synthetic roles and clears merchant authority when switching to customer", async () => {
  const base = process.env.UNIFIED_UI_TEST_URL!;
  const browser = await chromium.launch({executablePath:
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",headless:true});
  try {
    for (const role of ["customer","receptionist","beautician","owner"]) {
      const context = await browser.newContext({viewport:{width:390,height:844}});
      const page = await context.newPage();
      const errors: string[] = [];
      page.on("pageerror",error=>errors.push(error.message));
      await page.goto(`${base}/api/line-booking/integrated-demo?role=${role}`);
      if (role === "owner") {
        await browserExpect(page.getByRole("heading",{name:"Operations review"})).toBeVisible();
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
          await browserExpect(page.getByRole("heading",{name:"我的出勤"})).toBeVisible();
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
      const context = await browser.newContext({viewport:{width:390,height:844}});
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
