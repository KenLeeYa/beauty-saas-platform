import {chromium, expect as browserExpect, type Locator, type Page} from "@playwright/test";
import {expect, it} from "vitest";
import {chooseLanguage} from "./language-menu";
import {waitForSkillCatalog} from "./skill-catalog";
import {translate} from "../src/lib/i18n/messages";
import type {Locale} from "../src/lib/i18n/locale";

async function fields(root: Locator) {
  await waitForSkillCatalog(root);
  return root.locator("input,textarea,select").evaluateAll(nodes => nodes.map(node => {
    const field = node as HTMLInputElement;
    return {name: field.name, value: field.value, checked: field.checked};
  }));
}

async function retainedLanguages(page: Page, title: string) {
  const draft = await fields(page.getByRole("dialog"));
  for (const locale of ["en", "vi", "zh-TW"] as Locale[]) {
    await chooseLanguage(page.getByRole("dialog"), locale);
    const dialog = page.getByRole("dialog", {name: translate(locale, title), exact:true});
    await browserExpect(dialog).toBeVisible();
    expect(await fields(dialog)).toEqual(draft);
    for (const width of [320, 768, 1024, 390]) {
      await page.setViewportSize({width, height:620});
      expect(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
      expect(await page.locator("html").evaluate(node => node.scrollWidth <= innerWidth)).toBe(true);
    }
  }
}

async function keyboardCheck(page: Page, dialog: Locator, field: Locator, submit: Locator) {
  await page.setViewportSize({width:390,height:844});
  await field.focus();
  await page.evaluate(() => {
    Object.defineProperties(window.visualViewport!, {height:{configurable:true,value:380}, offsetTop:{configurable:true,value:24}});
    window.visualViewport!.dispatchEvent(new Event("resize"));
  });
  await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
  for (const control of [field,submit]) {
    expect(await control.evaluate(node=>{
      const rect=node.getBoundingClientRect(), viewport=window.visualViewport!;
      const hit=document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2);
      return rect.top >= viewport.offsetTop && rect.bottom <= viewport.offsetTop+viewport.height && !!hit && node.contains(hit);
    })).toBe(true);
  }
  expect(await dialog.evaluate(node=>node.scrollWidth<=node.clientWidth)).toBe(true);
  await page.evaluate(()=>{
    Reflect.deleteProperty(window.visualViewport!,"height"); Reflect.deleteProperty(window.visualViewport!,"offsetTop");
    window.visualViewport!.dispatchEvent(new Event("resize"));
  });
}

it.skipIf(!process.env.UNIFIED_UI_TEST_URL)("merchant pages keep day and catalog editors compact with retained three-language drafts", async () => {
  const base = process.env.UNIFIED_UI_TEST_URL!;
  const browser = await chromium.launch({executablePath:"C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"});
  const page = await browser.newPage({locale:"zh-TW",viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  try {
    await page.goto(`${base}/api/line-booking/integrated-demo?role=owner`);
    await page.goto(`${base}/merchant/calendar?organization=demo&location=taipei`);
    expect(await page.locator("html").evaluate(node => node.scrollHeight)).toBeLessThan(1200);
    await browserExpect(page.getByLabel("當日備註",{exact:true})).toHaveCount(0);
    const date = page.locator("button[data-date][aria-pressed=true]");
    await date.click();
    let dialog = page.getByRole("dialog", {name:"當日行程",exact:true});
    await dialog.getByRole("button",{name:"開放時段",exact:true}).click();
    await dialog.getByRole("button",{name:"自訂時段",exact:true}).click();
    await dialog.locator('[name="schedule-start-0"]').fill("10:30");
    await dialog.getByLabel("當日備註",{exact:true}).fill("注音草稿 lịch hẹn draft");
    await retainedLanguages(page,"當日行程");
    await page.keyboard.press("Escape");
    await browserExpect(date).toBeFocused();
    await date.click();
    dialog = page.getByRole("dialog");
    await browserExpect(dialog.getByLabel("當日備註",{exact:true})).toHaveValue("注音草稿 lịch hẹn draft");
    await page.keyboard.press("Escape");

    for (const [view,title,field,value] of [
      ["services","新增服務","name","QA service 草稿"],
      ["staff","新增服務人員","displayName","QA staff 草稿"],
    ]) {
      await page.goto(`${base}/merchant/${view}?organization=demo&location=taipei`);
      await page.getByRole("button",{name:title,exact:true}).click();
      dialog = page.getByRole("dialog",{name:title,exact:true});
      await dialog.locator(`[name=${field}]`).fill(value);
      await retainedLanguages(page,title);
      await page.setViewportSize({width:390,height:390});
      await dialog.locator(`[name=${field}]`).focus();
      await browserExpect(dialog.getByRole("button",{name:"儲存",exact:true})).toBeInViewport();
      await page.keyboard.press("Escape");
      await page.getByRole("button",{name:title,exact:true}).click();
      await browserExpect(dialog.locator(`[name=${field}]`)).toHaveValue(value);
      await page.keyboard.press("Escape");
    }
    expect(errors).toEqual([]);
  } finally { await browser.close(); }
},90000);

it.skipIf(!process.env.UNIFIED_UI_TEST_URL)("merchant pages use consistent readable directories across devices and three locales", async () => {
  const base=process.env.UNIFIED_UI_TEST_URL!;
  const browser=await chromium.launch({executablePath:"C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"});
  const page=await browser.newPage({locale:"zh-TW",viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const errors:string[]=[]; page.on("pageerror",error=>errors.push(error.message));
  try {
    await page.goto(`${base}/api/line-booking/integrated-demo?role=owner`);
    for (const view of ["calendar","bookings","services","staff"]) {
      await page.goto(`${base}/merchant/${view}?organization=demo&location=taipei`);
      for(const locale of ["zh-TW","en","vi"] as Locale[]) {
        await chooseLanguage(page,locale);
        for(const width of [320,390,640,768,1024,1440]) {
          await page.setViewportSize({width,height:844});
          expect(await page.locator("html").evaluate(node=>node.scrollWidth<=innerWidth)).toBe(true);
          expect(await page.locator(".merchant-row, .merchant-person-card").count()).toBeLessThanOrEqual(8);
          expect(await page.locator(".merchant-row, .merchant-person-card").evaluateAll(rows=>rows.every(row=>{
            const rect=row.getBoundingClientRect();
            return [...row.children].every(child=>{
              const bounds=child.getBoundingClientRect();
              return bounds.left>=rect.left && bounds.right<=rect.right+1 && bounds.top>=rect.top && bounds.bottom<=rect.bottom+1;
            });
          }))).toBe(true);
        }
        await page.setViewportSize({width:390,height:844});
        if(locale==="vi") await page.screenshot({path:`.dev-logs/merchant-${view}-compact-vi-390.png`});
      }
      await chooseLanguage(page,"zh-TW");
      if(view==="calendar") await page.locator("button[data-date][aria-pressed=true]").click();
      else await page.locator("button.merchant-row, button.merchant-person-card").first().click();
      const dialog=page.getByRole("dialog");
      await browserExpect(dialog).toBeVisible();
      await page.screenshot({path:`.dev-logs/merchant-${view}-detail-390.png`});
      await page.addStyleTag({content:"html {font-size:200% !important;}"});
      expect(await dialog.evaluate(node=>node.scrollWidth<=node.clientWidth)).toBe(true);
      await browserExpect(dialog.getByRole("button",{name:"關閉",exact:true})).toBeInViewport();
      await page.keyboard.press("Escape");
    }
    expect(errors).toEqual([]);
  } finally {await browser.close();}
},90000);

it.skipIf(!process.env.UNIFIED_UI_TEST_URL || !process.env.UNIFIED_TEST_DATABASE_URL)("merchant pages save daily hours after failure without keyboard occlusion or locale data loss", async () => {
  const {prisma}=await import("../src/server/database/prisma");
  const {addLocalDays,formatDateInTimeZone}=await import("../src/server/time/timezone");
  const location=await prisma.locations.findFirstOrThrow({where:{slug:"taipei",organizations:{slug:"demo"}}});
  const today=formatDateInTimeZone(new Date(),location.timezone);
  let date="";
  for (let offset=10;offset<25 && !date;offset++) {
    const candidate=addLocalDays(today,offset);
    if (!await prisma.location_day_schedules.count({where:{location_id:location.id,schedule_date:new Date(candidate)}})) date=candidate;
  }
  expect(date).toBeTruthy();
  const marker=`QA hours ${Date.now()}`;
  const browser=await chromium.launch({executablePath:"C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"});
  const page=await browser.newPage({locale:"zh-TW",viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const base=process.env.UNIFIED_UI_TEST_URL!;
  const selectDate=async()=>{
    for(let i=0;i<3 && !await page.locator(`button[data-date="${date}"]:enabled`).count();i++) await page.getByRole("button",{name:"下一個月",exact:true}).click();
    await page.locator(`button[data-date="${date}"]:enabled`).click();
    await page.getByRole("dialog").getByRole("button",{name:"開放時段",exact:true}).click();
  };
  try {
    await page.goto(`${base}/api/line-booking/integrated-demo?role=owner`);
    await page.goto(`${base}/merchant/calendar?organization=demo&location=taipei`);
    await selectDate();
    const lamp=page.locator(`button[data-date="${date}"] [data-schedule-mode]`);
    const lampColor=()=>lamp.evaluate(node=>getComputedStyle(node).backgroundColor);
    await browserExpect(lamp).toHaveAttribute("data-schedule-mode","NORMAL");
    const normalColor=await lampColor();
    const dialog=page.getByRole("dialog",{name:"當日行程",exact:true});
    await dialog.getByRole("button",{name:"自訂時段",exact:true}).click();
    await dialog.locator('[name="schedule-start-0"]').fill("08:00");
    await dialog.locator('[name="schedule-end-0"]').fill("22:00");
    await dialog.getByLabel("當日備註",{exact:true}).fill(marker);
    await page.route("**/api/merchant/schedule/day?**",route=>route.fulfill({status:503,json:{error:{message:"日期設定失敗。"}}}));
    await dialog.getByRole("button",{name:"儲存當日設定",exact:true}).click();
    await browserExpect(dialog.getByRole("alert")).toBeVisible();
    await browserExpect(lamp).toHaveAttribute("data-schedule-mode","NORMAL");
    expect(await lampColor()).toBe(normalColor);
    expect(await prisma.location_day_schedules.count({where:{location_id:location.id,schedule_date:new Date(date)}})).toBe(0);
    await retainedLanguages(page,"當日行程");
    await keyboardCheck(page,dialog,dialog.getByLabel("當日備註",{exact:true}),dialog.getByRole("button",{name:"儲存當日設定",exact:true}));
    await page.unroute("**/api/merchant/schedule/day?**");
    await dialog.getByRole("button",{name:"儲存當日設定",exact:true}).click();
    await browserExpect(dialog.getByRole("status")).toContainText("當日開放時段已更新");
    const saved=await prisma.location_day_schedules.findMany({where:{location_id:location.id,schedule_date:new Date(date)}});
    expect(saved).toHaveLength(1); expect(saved[0].reason).toBe(marker);
    expect(saved[0].opens_at?.toISOString().slice(11,16)).toBe("08:00");
    expect(saved[0].closes_at?.toISOString().slice(11,16)).toBe("22:00");
    await browserExpect(lamp).toHaveAttribute("data-schedule-mode","CUSTOM");
    const customColor=await lampColor();
    expect(customColor).not.toBe(normalColor);
    await page.reload(); await selectDate();
    await browserExpect(lamp).toHaveAttribute("data-schedule-mode","CUSTOM");
    expect(await lampColor()).toBe(customColor);
    await browserExpect(dialog.getByLabel("當日備註",{exact:true})).toHaveValue(marker);
    await browserExpect(dialog.locator('[name="schedule-start-0"]')).toHaveValue("08:00");
    await dialog.getByRole("button",{name:"整日關閉",exact:true}).click();
    await dialog.getByRole("button",{name:"儲存當日設定",exact:true}).click();
    await browserExpect(lamp).toHaveAttribute("data-schedule-mode","CLOSED");
    const closedColor=await lampColor();
    expect([normalColor,customColor]).not.toContain(closedColor);
    await page.reload(); await selectDate();
    await browserExpect(lamp).toHaveAttribute("data-schedule-mode","CLOSED");
    expect(await lampColor()).toBe(closedColor);
    await dialog.getByRole("button",{name:"正常營業",exact:true}).click();
    await dialog.getByRole("button",{name:"儲存當日設定",exact:true}).click();
    await browserExpect(dialog.getByRole("status")).toContainText("當日開放時段已更新");
    expect(await prisma.location_day_schedules.count({where:{location_id:location.id,schedule_date:new Date(date)}})).toBe(0);
    await browserExpect(lamp).toHaveAttribute("data-schedule-mode","NORMAL");
    expect(await lampColor()).toBe(normalColor);
  } finally {
    await browser.close();
    await prisma.location_day_schedules.deleteMany({where:{location_id:location.id,schedule_date:new Date(date),reason:marker}});
  }
},90000);

it.skipIf(!process.env.UNIFIED_UI_TEST_URL || !process.env.UNIFIED_TEST_DATABASE_URL)("merchant pages retain booking filters and reason through failed cancellation then persist retry", async () => {
  const {prisma}=await import("../src/server/database/prisma");
  const {resolvePublicLocation}=await import("../src/server/public-booking/context");
  const {getPublicAvailability}=await import("../src/server/public-booking/availability");
  const {bookMobile}=await import("../src/server/mobile/booking");
  const {randomToken,sha256}=await import("../src/server/security/crypto");
  const {addLocalDays,formatDateInTimeZone}=await import("../src/server/time/timezone");
  const store=await resolvePublicLocation({organizationSlug:"demo",locationSlug:"taipei"});
  const variantId="66666666-6666-4666-8666-666666666611";
  let startsAt="",staffProfileId="";
  for(let offset=1;offset<=14 && !startsAt;offset++) {
    const result=await getPublicAvailability({...store,sessionId:"00000000-0000-4000-8000-000000000000",sessionToken:"query",requestId:"query"},
      {serviceVariantId:variantId,date:addLocalDays(formatDateInTimeZone(new Date(),store.timezone),offset)});
    if(result.slots[0]) {startsAt=result.slots[0].startsAt; staffProfileId=result.slots[0].availableStaff[0];}
  }
  expect(startsAt).toBeTruthy();
  const token=randomToken(32), base=process.env.UNIFIED_UI_TEST_URL!, marker=`QA agenda ${Date.now()}`;
  let releaseDirectory: (() => void) | undefined;
  const session=await prisma.public_booking_sessions.create({data:{organization_id:store.organizationId,location_id:store.locationId,token_hash:sha256(token),expires_at:new Date(Date.now()+1800000),ip_hash:sha256("qa-merchant-pages"),device_hash:sha256(randomToken(16)),behavior_hash:sha256(marker),allowed_origin:base}});
  const booked=await bookMobile({actor:{kind:"employee",sessionId:randomToken(16),organizationId:store.organizationId,locationId:store.locationId,profileId:"33333333-3333-4333-8333-333333333301",customerId:null,capabilities:new Set(["booking.create"])},context:{...store,sessionId:session.id,sessionToken:token,requestId:randomToken(12)},serviceVariantId:variantId,staffProfileId,startsAt,name:marker,phone:`09${String(Date.now()).slice(-8)}`,source:"phone",idempotencyKey:randomToken(24)});
  const browser=await chromium.launch({executablePath:"C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"});
  const page=await browser.newPage({locale:"zh-TW",viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const errors:string[]=[]; page.on("pageerror",error=>errors.push(error.message));
  try {
    await page.goto(`${base}/api/line-booking/integrated-demo?role=owner`);
    await page.goto(`${base}/merchant/bookings?organization=demo&location=taipei`);
    expect(await page.getByRole("button",{name:/預約詳細資料/}).count()).toBeLessThanOrEqual(8);
    await page.getByLabel("搜尋預約",{exact:true}).fill(marker);
    for(const locale of ["en","vi","zh-TW"] as Locale[]) {
      await chooseLanguage(page,locale);
      await browserExpect(page.getByLabel(translate(locale,"搜尋預約"),{exact:true})).toHaveValue(marker);
    }
    const row=page.getByRole("button",{name:new RegExp(`預約詳細資料 ${marker}`)});
    await row.click();
    const detail=page.getByRole("dialog",{name:"預約詳細資料",exact:true});
    const before=await prisma.bookings.findUniqueOrThrow({where:{id:booked.id}});
    const directoryGate=new Promise<void>(resolve=>{releaseDirectory=resolve;});
    await page.route("**/api/merchant/bookings?**",async route=>{
      await directoryGate;
      await route.continue();
    });
    if(before.status === "PENDING_PAYMENT") {
      await detail.getByRole("button",{name:"確認訂金",exact:true}).click();
      const payment=page.getByRole("dialog",{name:"確認已收到訂金",exact:true});
      await payment.getByRole("button",{name:"確認已收款",exact:true}).click();
      await browserExpect(payment).toHaveCount(0);
      expect((await prisma.bookings.findUniqueOrThrow({where:{id:booked.id}})).status).toBe("CONFIRMED");
    }
    await detail.getByRole("button",{name:"取消預約",exact:true}).click();
    const confirmation=page.getByRole("dialog",{name:"變更預約狀態",exact:true});
    await confirmation.getByLabel("變更原因",{exact:true}).fill("注音測試 hủy lịch QA");
    await retainedLanguages(page,"變更預約狀態");
    await browserExpect(confirmation.getByLabel("變更原因",{exact:true})).toHaveValue("注音測試 hủy lịch QA");
    await page.route("**/api/merchant/bookings/status?**",route=>route.fulfill({status:503,json:{error:{message:"狀態更新失敗。"}}}));
    await confirmation.getByRole("button",{name:"確認變更",exact:true}).click();
    await browserExpect(confirmation.getByRole("alert")).toBeVisible();
    expect((await prisma.bookings.findUniqueOrThrow({where:{id:booked.id}})).status).toBe("CONFIRMED");
    await keyboardCheck(page,confirmation,confirmation.getByLabel("變更原因",{exact:true}),confirmation.getByRole("button",{name:"確認變更",exact:true}));
    await page.unroute("**/api/merchant/bookings/status?**");
    await confirmation.getByRole("button",{name:"確認變更",exact:true}).click();
    await browserExpect(confirmation).toHaveCount(0);
    releaseDirectory?.();
    await browserExpect(detail.getByText("已取消",{exact:true})).toBeVisible();
    await page.keyboard.press("Escape"); await browserExpect(row).toBeFocused();
    await page.reload();
    await page.getByLabel("搜尋預約",{exact:true}).fill(marker);
    await page.getByLabel("預約狀態",{exact:true}).selectOption("CANCELLED");
    await row.click(); await browserExpect(detail.getByText("已取消",{exact:true})).toBeVisible();
    expect((await prisma.bookings.findUniqueOrThrow({where:{id:booked.id}})).status).toBe("CANCELLED");
    expect(errors).toEqual([]);
  } finally {
    releaseDirectory?.();
    await browser.close();
    await prisma.bookings.updateMany({where:{id:booked.id,status:{in:["PENDING_PAYMENT","CONFIRMED"]}},data:{status:"CANCELLED",cancelled_at:new Date(),version:{increment:1}}});
  }
},90000);

it.skipIf(!process.env.UNIFIED_UI_TEST_URL || !process.env.UNIFIED_TEST_DATABASE_URL)("merchant pages recover catalog writes and persist services staff and buffer settings", async () => {
  const {prisma} = await import("../src/server/database/prisma");
  const base=process.env.UNIFIED_UI_TEST_URL!;
  const browser=await chromium.launch({executablePath:"C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"});
  const page=await browser.newPage({locale:"zh-TW",viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const marker=`QA mobile ${Date.now()}`;
  let serviceId:string|undefined, locationServiceId:string|undefined, staffId:string|undefined;
  const errors:string[]=[]; page.on("pageerror",error=>errors.push(error.message));
  try {
    await page.goto(`${base}/api/line-booking/integrated-demo?role=owner`);
    await page.goto(`${base}/merchant/services?organization=demo&location=taipei`);
    await page.getByRole("button",{name:"新增服務",exact:true}).click();
    let dialog=page.getByRole("dialog",{name:"新增服務",exact:true});
    for (const [name,value] of Object.entries({name:marker,variantName:"測試規格",categoryName:"QA mobile",durationMinutes:"45",price:"1250",preBufferMinutes:"5",postBufferMinutes:"10",description:"測試服務 Nguyễn"})) await dialog.locator(`[name=${name}]`).fill(value);
    const draft=await fields(dialog);
    await page.route("**/api/merchant/services?**",route=>route.fulfill({status:503,json:{error:{message:"服務暫時無法使用，請稍後再試。"}}}));
    await dialog.getByRole("button",{name:"儲存",exact:true}).click();
    await browserExpect(dialog.getByRole("alert")).toBeVisible(); expect(await fields(dialog)).toEqual(draft);
    await retainedLanguages(page,"新增服務");
    await page.unroute("**/api/merchant/services?**");
    const created=page.waitForResponse(r=>r.url().includes("/api/merchant/services?") && r.request().method()==="POST");
    await dialog.getByRole("button",{name:"儲存",exact:true}).click();
    const response=await created; expect(response.status()).toBe(201);
    ({serviceId,locationServiceId}=((await response.json()) as {data:{serviceId:string;locationServiceId:string}}).data);
    await browserExpect(dialog).toHaveCount(0);
    await page.getByLabel("搜尋服務",{exact:true}).fill(marker);
    await page.getByRole("button",{name:new RegExp(`服務詳細資料 ${marker}`)}).click();
    dialog=page.getByRole("dialog",{name:"服務詳細資料",exact:true});
    await dialog.locator('[name="preBufferMinutes"]').fill("15");
    await dialog.locator('[name="postBufferMinutes"]').fill("20");
    await retainedLanguages(page,"服務詳細資料");
    await keyboardCheck(page,dialog,dialog.locator('[name="postBufferMinutes"]'),dialog.getByRole("button",{name:"儲存服務緩衝時間",exact:true}));
    await dialog.getByRole("button",{name:"儲存服務緩衝時間",exact:true}).click();
    await browserExpect(dialog.getByRole("status")).toContainText("服務緩衝時間已更新");
    await page.reload();
    await page.getByLabel("搜尋服務",{exact:true}).fill(marker);
    await page.getByRole("button",{name:new RegExp(`服務詳細資料 ${marker}`)}).click();
    await browserExpect(dialog.locator('[name="preBufferMinutes"]')).toHaveValue("15");
    await browserExpect(dialog.locator('[name="postBufferMinutes"]')).toHaveValue("20");
    await dialog.getByRole("switch",{name:"線上預約",exact:true}).click();
    await browserExpect(dialog.getByRole("switch")).toHaveAttribute("aria-checked","false");
    expect((await prisma.location_services.findUniqueOrThrow({where:{id:locationServiceId}})).online_booking_enabled).toBe(false);
    await page.keyboard.press("Escape");
    await page.goto(`${base}/merchant/staff?organization=demo&location=taipei`);
    await page.getByRole("button",{name:"新增服務人員",exact:true}).click();
    dialog=page.getByRole("dialog",{name:"新增服務人員",exact:true});
    for (const [name,value] of Object.entries({displayName:marker,title:"測試美容師"})) await dialog.locator(`[name=${name}]`).fill(value);
    const chosenSkill=await dialog.locator('input[name=skills]').first().inputValue();
    await dialog.locator('input[name=skills]').first().check();
    await retainedLanguages(page,"新增服務人員");
    const staffCreated=page.waitForResponse(r=>r.url().includes("/api/merchant/staff?") && r.request().method()==="POST");
    await dialog.getByRole("button",{name:"儲存",exact:true}).click();
    const staffResponse=await staffCreated; expect(staffResponse.status()).toBe(201);
    staffId=((await staffResponse.json()) as {data:{id:string}}).data.id;
    await page.reload();
    await page.getByLabel("搜尋服務人員",{exact:true}).fill(marker);
    await page.getByRole("button",{name:`人員詳細資料 ${marker}`,exact:true}).click();
    dialog=page.getByRole("dialog",{name:"人員詳細資料",exact:true});
    await browserExpect(dialog.getByText("測試美容師",{exact:true})).toBeVisible();
    await browserExpect(dialog.getByRole("checkbox",{name:chosenSkill,exact:true})).toBeChecked();
    await page.route("**/api/merchant/media?**",route=>route.fulfill({status:503,json:{error:{message:"圖片上傳失敗。"}}}));
    await dialog.locator('input[type=file]').setInputFiles({name:"qa.png",mimeType:"image/png",buffer:Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aUAAAAABJRU5ErkJggg==","base64")});
    await browserExpect(dialog.getByRole("alert")).toContainText("圖片上傳失敗");
    await retainedLanguages(page,"人員詳細資料");
    expect((await prisma.staff_profiles.findUniqueOrThrow({where:{id:staffId}})).display_name).toBe(marker);
    expect(errors).toEqual([]);
  } finally {
    await browser.close();
    if (locationServiceId) await prisma.location_services.update({where:{id:locationServiceId},data:{online_booking_enabled:false,is_active:false}});
    if (serviceId) await prisma.services.update({where:{id:serviceId},data:{is_active:false}});
    if (staffId) await prisma.staff_profiles.update({where:{id:staffId},data:{is_active:false,public_visible:false}});
  }
},90000);
