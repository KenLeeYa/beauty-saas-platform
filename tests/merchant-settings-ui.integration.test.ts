import {chromium, expect as ui, type Page} from "@playwright/test";
import {expect, it} from "vitest";
import {chooseLanguage} from "./language-menu";
import {translate} from "../src/lib/i18n/messages";
import type {Locale} from "../src/lib/i18n/locale";

const browserPath = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const scope = "organization=demo&location=taipei";

async function draft(page: Page) {
  return page.getByRole("dialog").locator("input:not([type=file]),select,textarea").evaluateAll(nodes => nodes.map(node => {
    const field = node as HTMLInputElement;
    return {name:field.name,value:field.value,checked:field.checked};
  }));
}

it.skipIf(!process.env.UNIFIED_UI_TEST_URL || !process.env.UNIFIED_TEST_DATABASE_URL)("merchant settings stage location state, recover media failure and keep all entry controls reachable", async () => {
  const {prisma}=await import("../src/server/database/prisma");
  const base=process.env.UNIFIED_UI_TEST_URL!;
  const location=await prisma.locations.findFirstOrThrow({where:{slug:"taipei",organizations:{slug:"demo"}}});
  const browser=await chromium.launch({executablePath:browserPath});
  const page=await browser.newPage({locale:"zh-TW",viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:"reduce"});
  try {
    await page.goto(`${base}/api/line-booking/integrated-demo?role=owner`);
    for(const view of ["locations","resources","settings"]) {
      await page.goto(`${base}/merchant/${view}?${scope}`);
      if(view === "resources") {
        await chooseLanguage(page,"zh-TW");
        await ui(page.getByRole("button",{name:"使用中",exact:true})).toHaveAttribute("aria-pressed","true");
        expect(await page.locator(".merchant-resource-row").getByText("已停用",{exact:true}).count()).toBe(0);
        await page.getByRole("button",{name:"全部",exact:true}).click();
        await ui(page.getByRole("button",{name:"全部",exact:true})).toHaveAttribute("aria-pressed","true");
        await page.getByRole("button",{name:"使用中",exact:true}).click();
      }
      for(const locale of ["zh-TW","en","vi"] as Locale[]) {
        await chooseLanguage(page,locale);
        if(view === "resources") {
          await ui(page.getByRole("button",{name:translate(locale,"使用中"),exact:true})).toHaveAttribute("aria-pressed","true");
          await ui(page.getByRole("button",{name:translate(locale,"全部"),exact:true})).toBeVisible();
        }
        for(const width of [320,390,640,768,1024,1440]) {
          await page.setViewportSize({width,height:844});
          expect(await page.locator("html").evaluate(node=>node.scrollWidth<=innerWidth)).toBe(true);
          expect(await page.locator("main .merchant-row").count()).toBeLessThanOrEqual(8);
          expect(await page.locator("main .merchant-resource-row").count()).toBeLessThanOrEqual(8);
        }
      }
    }
    await page.setViewportSize({width:390,height:844});
    await chooseLanguage(page,"zh-TW");
    await page.goto(`${base}/merchant/locations?${scope}`);
    await page.getByRole("button",{name:/目前分店/}).click();
    const dialog=page.getByRole("dialog");
    await dialog.locator('[name=description]').fill("圖片失敗仍保留草稿");
    await page.route("**/api/merchant/media?**",route=>route.fulfill({status:503,json:{error:{message:"圖片上傳失敗。"}}}));
    await dialog.locator('input[type=file]').setInputFiles({name:"qa.png",mimeType:"image/png",buffer:Buffer.from("synthetic upload failure")});
    await ui(dialog.getByRole("alert")).toBeVisible();
    await ui(dialog.locator('[name=description]')).toHaveValue("圖片失敗仍保留草稿");
    await page.unroute("**/api/merchant/media?**");
    await dialog.getByRole("button",{name:"預約狀態",exact:true}).click();
    const next=location.booking_state === "PAUSED" ? "OPEN" : "PAUSED";
    await dialog.getByRole("button",{name:next === "OPEN" ? "開放" : "暫停",exact:true}).click();
    expect((await prisma.locations.findUniqueOrThrow({where:{id:location.id}})).booking_state).toBe(location.booking_state);
    await chooseLanguage(dialog,"vi");
    await ui(dialog.getByRole("button",{name:translate("vi",next === "OPEN" ? "開放" : "暫停"),exact:true})).toHaveAttribute("aria-pressed","true");
    await page.route("**/api/merchant/location?**",route=>route.fulfill({status:503,json:{error:{message:"分店設定失敗。"}}}));
    await dialog.locator(".merchant-sheet-footer button").click();
    await ui(dialog.getByRole("alert")).toBeVisible();
    expect((await prisma.locations.findUniqueOrThrow({where:{id:location.id}})).booking_state).toBe(location.booking_state);
    await page.unroute("**/api/merchant/location?**");
    await dialog.locator(".merchant-sheet-footer button").click();
    await ui(dialog.getByRole("status")).toBeVisible();
    expect((await prisma.locations.findUniqueOrThrow({where:{id:location.id}})).booking_state).toBe(next);
    await dialog.getByRole("button",{name:translate("vi","基本資料"),exact:true}).click();
    await ui(dialog.locator('[name=description]')).toHaveValue("圖片失敗仍保留草稿");
    const style=await page.addStyleTag({content:"html {font-size:200% !important;}"});
    expect(await dialog.evaluate(node=>node.scrollWidth<=node.clientWidth)).toBe(true);
    await ui(dialog.locator(".merchant-sheet-footer button")).toBeInViewport();
    await style.evaluate(node=>node.remove());
  } finally {
    await prisma.locations.update({where:{id:location.id},data:{booking_state:location.booking_state,online_booking_enabled:location.online_booking_enabled}});
    await browser.close();
  }
},90000);

it.skipIf(!process.env.UNIFIED_UI_TEST_URL)("merchant settings retain branch resource and policy drafts in compact multilingual sheets", async () => {
  const base = process.env.UNIFIED_UI_TEST_URL!;
  const browser = await chromium.launch({executablePath:browserPath});
  const page = await browser.newPage({locale:"zh-TW",viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:"reduce"});
  const errors:string[]=[]; page.on("pageerror",error=>errors.push(error.message));
  try {
    await page.goto(`${base}/api/line-booking/integrated-demo?role=owner`);
    for (const [view, opener, title, field] of [
      ["locations","目前分店","分店資料","address"],
      ["resources","新增空間或設備","新增空間或設備","name"],
      ["settings","品牌與公司資料","品牌與公司資料","businessName"],
      ["settings","預約規則與訂金","預約規則與訂金","cancellationCutoffHours"],
    ]) {
      await page.goto(`${base}/merchant/${view}?${scope}`);
      await chooseLanguage(page,"zh-TW");
      await page.getByRole("button",{name:opener,exact:view!=="locations"}).click();
      const dialog = page.getByRole("dialog");
      await ui(dialog.getByRole("heading",{name:title,exact:true})).toBeVisible();
      await dialog.locator(`[name=${field}]`).fill(field === "cancellationCutoffHours" ? "17" : "QA 草稿 Nguyễn draft");
      const before = await draft(page);
      for (const locale of ["en","vi","zh-TW"] as Locale[]) {
        await chooseLanguage(dialog,locale);
        await ui(dialog.getByRole("heading",{name:translate(locale,title),exact:true})).toBeVisible();
        expect(await draft(page)).toEqual(before);
        for (const width of [320,390,640,768,1024,1440]) {
          await page.setViewportSize({width,height:620});
          expect(await dialog.evaluate(node=>node.scrollWidth<=node.clientWidth)).toBe(true);
          expect(await page.locator("html").evaluate(node=>node.scrollWidth<=innerWidth)).toBe(true);
          await ui(dialog.locator(".merchant-sheet-footer button")).toBeInViewport();
        }
      }
      await page.keyboard.press("Escape");
      await page.getByRole("button",{name:opener,exact:view!=="locations"}).click();
      expect(await draft(page)).toEqual(before);
      await page.setViewportSize({width:390,height:390});
      await dialog.locator(`[name=${field}]`).focus();
      await ui(dialog.locator(".merchant-sheet-footer button")).toBeInViewport();
      await page.setViewportSize({width:390,height:844});
      await page.evaluate(()=>{
        Object.defineProperties(window.visualViewport!,{height:{configurable:true,value:380},offsetTop:{configurable:true,value:24}});
        window.visualViewport!.dispatchEvent(new Event("resize"));
      });
      await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
      for(const control of [dialog.locator(`[name=${field}]`),dialog.locator(".merchant-sheet-footer button")]) {
        expect(await control.evaluate(node=>{
          const rect=node.getBoundingClientRect(),viewport=window.visualViewport!;
          const hit=document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2);
          return rect.top>=viewport.offsetTop && rect.bottom<=viewport.height+viewport.offsetTop && !!hit && node.contains(hit);
        })).toBe(true);
      }
      await page.evaluate(()=>{
        Reflect.deleteProperty(window.visualViewport!,"height");Reflect.deleteProperty(window.visualViewport!,"offsetTop");
        window.visualViewport!.dispatchEvent(new Event("resize"));
      });
      await dialog.locator(".merchant-sheet-body").evaluate(node=>node.scrollTop=0);
      await page.screenshot({path:`.dev-logs/merchant-${view}-${field}-editor.png`});
      await page.keyboard.press("Escape");
      await ui(page.locator('[data-slot="dialog-overlay"]')).toHaveCount(0);
      expect(await page.locator("html").evaluate(node=>node.scrollHeight)).toBeLessThan(1300);
      await page.screenshot({path:`.dev-logs/merchant-${view}-compact.png`});
    }
    expect(errors).toEqual([]);
  } finally {await browser.close();}
},90000);

it.skipIf(!process.env.UNIFIED_UI_TEST_URL || !process.env.UNIFIED_TEST_DATABASE_URL)("merchant settings retry branch and brand saves with real persistence and restore", async () => {
  const {prisma}=await import("../src/server/database/prisma");
  const base=process.env.UNIFIED_UI_TEST_URL!;
  const browser=await chromium.launch({executablePath:browserPath});
  const page=await browser.newPage({locale:"zh-TW",viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const organization=await prisma.organizations.findUniqueOrThrow({where:{slug:"demo"}});
  const branch=await prisma.locations.findFirstOrThrow({where:{organization_id:organization.id,slug:"taipei"}});
  try {
    await page.goto(`${base}/api/line-booking/integrated-demo?role=owner`);
    for (const [view,opener,field,endpoint] of [
      ["locations","目前分店","address","location"],
      ["settings","品牌與公司資料","businessName","organization"],
    ]) {
      await page.goto(`${base}/merchant/${view}?${scope}`);
      await page.getByRole("button",{name:opener,exact:view!=="locations"}).click();
      let dialog=page.getByRole("dialog");
      const value=`QA local ${field} ${Date.now()}`;
      await dialog.locator(`[name=${field}]`).fill(value);
      const pattern=`**/api/merchant/${endpoint}?**`;
      await page.route(pattern,route=>route.fulfill({status:503,json:{error:{message:"操作失敗。"}}}));
      await dialog.getByRole("button",{name:"儲存",exact:true}).click();
      await ui(dialog.getByRole("alert")).toBeVisible();
      await ui(dialog.locator(`[name=${field}]`)).toHaveValue(value);
      if (endpoint==="location") expect((await prisma.locations.findUniqueOrThrow({where:{id:branch.id}})).address).toBe(branch.address);
      else expect((await prisma.organizations.findUniqueOrThrow({where:{id:organization.id}})).business_name).toBe(organization.business_name);
      await chooseLanguage(dialog,"vi");
      await ui(dialog.locator(`[name=${field}]`)).toHaveValue(value);
      await page.unroute(pattern);
      const saved=page.waitForResponse(response=>response.url().includes(`/api/merchant/${endpoint}?`) && response.request().method()==="PATCH");
      await dialog.locator(".merchant-sheet-footer button").click();
      expect((await saved).status()).toBe(200);
      await ui(dialog.getByRole("status")).toBeVisible();
      if (endpoint==="location") expect((await prisma.locations.findUniqueOrThrow({where:{id:branch.id}})).address).toBe(value);
      else expect((await prisma.organizations.findUniqueOrThrow({where:{id:organization.id}})).business_name).toBe(value);
      await page.reload();
      await chooseLanguage(page,"zh-TW");
      await page.getByRole("button",{name:opener,exact:view!=="locations"}).click();
      dialog=page.getByRole("dialog");
      await ui(dialog.locator(`[name=${field}]`)).toHaveValue(value);
    }
  } finally {
    await prisma.locations.update({where:{id:branch.id},data:{address:branch.address}});
    await prisma.organizations.update({where:{id:organization.id},data:{business_name:organization.business_name}});
    await browser.close();
  }
},90000);

it.skipIf(!process.env.UNIFIED_UI_TEST_URL || !process.env.UNIFIED_TEST_DATABASE_URL)("merchant settings create resources after failure and retain policy tabs through retry", async () => {
  const {prisma}=await import("../src/server/database/prisma");
  const base=process.env.UNIFIED_UI_TEST_URL!;
  const browser=await chromium.launch({executablePath:browserPath});
  const page=await browser.newPage({locale:"zh-TW",viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const marker=`QA space ${Date.now()}`;
  const location=await prisma.locations.findFirstOrThrow({where:{slug:"taipei",organizations:{slug:"demo"}}});
  let policy:Record<string,string|number|boolean>|undefined;
  try {
    await page.goto(`${base}/api/line-booking/integrated-demo?role=owner`);
    await page.goto(`${base}/merchant/resources?${scope}`);
    await page.getByRole("button",{name:"新增空間或設備",exact:true}).click();
    let dialog=page.getByRole("dialog");
    await dialog.locator('[name=name]').fill(marker);
    await dialog.locator('[name=typeName]').fill(marker);
    await dialog.locator('[name=kind]').selectOption("EQUIPMENT");
    await page.route("**/api/merchant/resources?**",route=>route.fulfill({status:503,json:{error:{message:"操作失敗。"}}}));
    await dialog.getByRole("button",{name:"儲存",exact:true}).click();
    await ui(dialog.getByRole("alert")).toBeVisible();
    await chooseLanguage(dialog,"en");
    await ui(dialog.locator('[name=name]')).toHaveValue(marker);
    expect(await prisma.resources.count({where:{location_id:location.id,name:marker}})).toBe(0);
    await page.unroute("**/api/merchant/resources?**");
    await dialog.locator(".merchant-sheet-footer button").click();
    await ui(dialog).toHaveCount(0);
    await page.reload();
    await chooseLanguage(page,"zh-TW");
    await page.getByLabel("搜尋空間與設備",{exact:true}).fill(marker);
    await ui(page.locator(".merchant-resource-row")).toHaveCount(1);
    expect(await prisma.resources.count({where:{location_id:location.id,name:marker}})).toBe(1);
    await page.getByRole("button",{name:"新增空間或設備",exact:true}).click();
    await ui(page.getByRole("dialog").locator('[name=name]')).toHaveValue("");
    await page.goto(`${base}/merchant/settings?${scope}`);
    await page.getByRole("button",{name:"預約規則與訂金",exact:true}).click();
    dialog=page.getByRole("dialog");
    const original=await draft(page);
    const value=(name:string)=>original.find(field=>field.name===name)!;
    policy={onlineBookingEnabled:value("onlineBookingEnabled").checked,customerCancellationEnabled:value("customerCancellationEnabled").checked,customerRescheduleEnabled:value("customerRescheduleEnabled").checked,depositsEnabled:value("depositsEnabled").checked,depositMode:value("depositMode").value,depositAmountMinor:Math.round(Number(value("depositAmount").value)*100),depositPercentage:Number(value("depositPercentage").value),cancellationCutoffHours:Number(value("cancellationCutoffHours").value)};
    await dialog.locator('[name=cancellationCutoffHours]').fill("721");
    await dialog.getByRole("button",{name:"訂金",exact:true}).click();
    await dialog.getByRole("button",{name:"儲存",exact:true}).click();
    await ui(dialog.locator('[name=cancellationCutoffHours]')).toBeVisible();
    await ui(dialog.locator('[name=cancellationCutoffHours]')).toBeFocused();
    await dialog.locator('[name=cancellationCutoffHours]').fill("19");
    await dialog.getByRole("button",{name:"訂金",exact:true}).click();
    await dialog.locator('[name=depositAmount]').fill("240");
    await dialog.locator('[name=depositPercentage]').fill("25");
    const before=await draft(page);
    for(const locale of ["en","vi","zh-TW"] as Locale[]) {await chooseLanguage(dialog,locale);expect(await draft(page)).toEqual(before);}
    await page.route("**/api/merchant/settings?**",route=>route.fulfill({status:503,json:{error:{message:"操作失敗。"}}}));
    await dialog.getByRole("button",{name:"儲存",exact:true}).click();
    await ui(dialog.getByRole("alert")).toBeVisible();
    expect(await draft(page)).toEqual(before);
    await page.unroute("**/api/merchant/settings?**");
    const response=page.waitForResponse(r=>r.url().includes("/api/merchant/settings?") && r.request().method()==="PATCH");
    await dialog.getByRole("button",{name:"儲存",exact:true}).click();
    expect((await response).status()).toBe(200);
    await page.reload();
    await page.getByRole("button",{name:"預約規則與訂金",exact:true}).click();
    dialog=page.getByRole("dialog");
    await ui(dialog.locator('[name=cancellationCutoffHours]')).toHaveValue("19");
    await dialog.getByRole("button",{name:"訂金",exact:true}).click();
    await ui(dialog.locator('[name=depositAmount]')).toHaveValue("240");
    await page.keyboard.press("Escape");
    await page.getByRole("button",{name:"通知健康狀態",exact:true}).click();
    await ui(page.getByRole("dialog").getByText("通知健康狀態",{exact:true}).first()).toBeVisible();
  } finally {
    if(policy) {
      const csrf=(await page.context().cookies()).find(cookie=>cookie.name==="beauty_csrf")!.value;
      const restored=await page.request.patch(`${base}/api/merchant/settings?${scope}`,{headers:{origin:base,"x-csrf-token":csrf},data:policy});
      expect(restored.status()).toBe(200);
      await prisma.locations.update({where:{id:location.id},data:{booking_state:location.booking_state,online_booking_enabled:location.online_booking_enabled}});
    }
    await prisma.resources.updateMany({where:{location_id:location.id,name:marker},data:{is_active:false}});
    await browser.close();
  }
},90000);
