import {chromium, expect as ui} from "@playwright/test";
import {expect, it} from "vitest";
import {chooseLanguage} from "./language-menu";
import {translate} from "../src/lib/i18n/messages";
import type {Locale} from "../src/lib/i18n/locale";

const browserPath = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const scope = "organization=demo&location=taipei";

it.skipIf(!process.env.UNIFIED_UI_TEST_URL)("merchant business pages keep mobile controls compact across three languages", async () => {
  const base = process.env.UNIFIED_UI_TEST_URL!;
  const browser = await chromium.launch({executablePath:browserPath});
  const page = await browser.newPage({locale:"zh-TW",viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:"reduce"});
  const errors:string[]=[];
  page.on("pageerror", error => errors.push(error.message));
  try {
    await page.goto(`${base}/api/line-booking/integrated-demo?role=owner`);
    await page.goto(`${base}/merchant/billing?${scope}`);
    expect(await page.locator("main table").count()).toBe(0);
    for (const view of ["reports","subscription","billing","setup"]) {
      await page.goto(`${base}/merchant/${view}?${scope}`);
      for (const locale of ["zh-TW","en","vi"] as Locale[]) {
        await chooseLanguage(page,locale);
        for (const width of [320,390,640,768,1024,1440]) {
          await page.setViewportSize({width,height:844});
          expect(await page.locator("html").evaluate(node=>node.scrollWidth<=innerWidth)).toBe(true);
          await ui(page.locator(view === "reports" ? ".merchant-report-dashboard" : ".merchant-business")).toBeVisible();
          expect(await page.locator("main .merchant-row").count()).toBeLessThanOrEqual(6);
          expect(await page.locator("main").evaluate(node=>[...node.querySelectorAll("button,a,input")].filter(el=>el.getClientRects().length).every(el=>el.getBoundingClientRect().width>=43 && el.getBoundingClientRect().height>=43))).toBe(true);
        }
      }
      await page.setViewportSize({width:390,height:844});
      await chooseLanguage(page,"zh-TW");
      await page.screenshot({path:`.dev-logs/merchant-${view}-business.png`});
    }
    await page.goto(`${base}/merchant/reports?${scope}`);
    for (const locale of ["en","vi","zh-TW"] as Locale[]) {
      await chooseLanguage(page,locale);
      await ui(page.getByRole("region",{name:translate(locale,"預約狀態"),exact:true})).toBeVisible();
      await ui(page.getByRole("region",{name:translate(locale,"服務營收"),exact:true})).toBeVisible();
      expect(await page.locator('.merchant-report-statuses > div').count()).toBe(9);
      for(const label of ["待訂金","已確認","已報到","服務中","已完成","已取消","未到店","已失效","已改期"]){
        await ui(page.locator('.merchant-report-statuses').getByText(translate(locale,label),{exact:true})).toBeVisible();
      }
      expect(await page.locator('.merchant-report-dashboard button').count()).toBe(0);
    }
    await page.goto(`${base}/merchant/subscription?${scope}`);
    await page.getByRole("button",{name:"方案權益",exact:true}).click();
    for (const locale of ["en","vi","zh-TW"] as Locale[]) {
      await chooseLanguage(page.getByRole("dialog"),locale);
      await ui(page.getByRole("dialog").getByRole("heading",{name:translate(locale,"方案權益"),exact:true})).toBeVisible();
    }
    await page.keyboard.press("Escape");
    await ui(page.getByRole("button",{name:"方案權益",exact:true})).toBeFocused();
    expect(errors).toEqual([]);
  } finally {await browser.close();}
},90000);

it.skipIf(!process.env.UNIFIED_UI_TEST_URL || !process.env.UNIFIED_TEST_DATABASE_URL)("merchant business invoice paging and detail survive locale changes without billing writes", async () => {
  const {prisma}=await import("../src/server/database/prisma");
  const organization=await prisma.organizations.findUniqueOrThrow({where:{slug:"demo"}});
  const subscription=await prisma.subscriptions.findFirstOrThrow({where:{organization_id:organization.id,is_current:true}});
  const prefix=`LOCAL-MOBILE-${Date.now()}`;
  const ids:string[]=[];
  const browser=await chromium.launch({executablePath:browserPath});
  const page=await browser.newPage({locale:"zh-TW",viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  try {
    for(let i=0;i<8;i++) {
      const invoice=await prisma.invoices.create({data:{organization_id:organization.id,subscription_id:subscription.id,invoice_number:`${prefix}-${i}`,status:i===0?"VOID":i===1?"PAID":"ISSUED",currency:"TWD",period_start:new Date("2026-10-01"),period_end:new Date("2026-10-31"),subtotal_minor:100000,total_minor:100000,amount_paid_minor:i===1?100000:i===2?25000:0,created_at:new Date(Date.now()+i*1000)}});
      ids.push(invoice.id);
    }
    const before=await prisma.invoices.findMany({where:{id:{in:ids}},orderBy:{id:"asc"}});
    await page.goto(`${process.env.UNIFIED_UI_TEST_URL}/api/line-booking/integrated-demo?role=owner`);
    await page.goto(`${process.env.UNIFIED_UI_TEST_URL}/merchant/billing?${scope}`);
    expect(await page.locator(".merchant-invoice-row").count()).toBe(6);
    await page.getByRole("button",{name:"下一頁",exact:true}).click();
    await page.locator(".merchant-invoice-row").filter({hasText:`${prefix}-0`}).click();
    let dialog=page.getByRole("dialog");
    await ui(dialog.getByText("不適用",{exact:true})).toBeVisible();
    for(const locale of ["en","vi","zh-TW"] as Locale[]) {
      await chooseLanguage(dialog,locale);
      await ui(dialog.getByText(`${prefix}-0`,{exact:true}).first()).toBeVisible();
      await ui(dialog.getByText(translate(locale,"不適用"),{exact:true})).toBeVisible();
      expect(await dialog.evaluate(node=>node.scrollWidth<=node.clientWidth)).toBe(true);
    }
    await page.keyboard.press("Escape");
    await page.getByRole("button",{name:"待繳帳單",exact:true}).click();
    await page.locator(".merchant-invoice-row").filter({hasText:`${prefix}-2`}).click();
    dialog=page.getByRole("dialog");
    await ui(dialog.locator(".merchant-detail-list > div").filter({hasText:"待繳金額"})).toContainText("$750");
    await page.screenshot({path:".dev-logs/merchant-invoice-detail.png"});
    await page.keyboard.press("Escape");
    await chooseLanguage(page,"vi");
    await ui(page.getByRole("button",{name:translate("vi","待繳帳單"),exact:true})).toHaveAttribute("aria-pressed","true");
    expect(await prisma.invoices.findMany({where:{id:{in:ids}},orderBy:{id:"asc"}})).toEqual(before);
  } finally {
    await browser.close();
    await prisma.invoices.deleteMany({where:{organization_id:organization.id,id:{in:ids},invoice_number:{startsWith:prefix}}});
  }
},60000);

it.skipIf(!process.env.UNIFIED_UI_TEST_URL || !process.env.UNIFIED_TEST_DATABASE_URL)("merchant business setup retains drafts and retries real scoped saves with restored fixtures", async () => {
  const {prisma}=await import("../src/server/database/prisma");
  const organization=await prisma.organizations.findUniqueOrThrow({where:{slug:"demo"}});
  const branch=await prisma.locations.findFirstOrThrow({where:{organization_id:organization.id,slug:"taipei"}});
  const progress=await prisma.merchant_setup_progress.findUniqueOrThrow({where:{organization_id:organization.id}});
  const hours=await prisma.location_business_hours.findMany({where:{organization_id:organization.id,location_id:branch.id}});
  const policy=await prisma.location_booking_policies.findUniqueOrThrow({where:{location_id:branch.id}});
  const deposit=await prisma.deposit_policies.findFirstOrThrow({where:{organization_id:organization.id,location_id:branch.id,service_variant_id:null},orderBy:{created_at:"asc"}});
  const cancellation=await prisma.cancellation_policies.findFirstOrThrow({where:{organization_id:organization.id,location_id:branch.id,service_variant_id:null},orderBy:{created_at:"asc"}});
  const browser=await chromium.launch({executablePath:browserPath});
  const page=await browser.newPage({locale:"zh-TW",viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:"reduce"});
  const errors:string[]=[];page.on("pageerror",error=>errors.push(error.message));
  const base=process.env.UNIFIED_UI_TEST_URL!;
  try {
    await prisma.merchant_setup_progress.update({where:{id:progress.id},data:{business_hours_completed_at:null,policies_completed_at:null}});
    await prisma.cancellation_policies.update({where:{id:cancellation.id},data:{late_fee_mode:"PERCENTAGE",late_fee_fixed_minor:null,late_fee_percentage:20,no_show_fee_mode:"PERCENTAGE",no_show_fee_fixed_minor:null,no_show_fee_percentage:50}});
    await page.goto(`${base}/api/line-booking/integrated-demo?role=owner`);
    await page.goto(`${base}/merchant/setup?${scope}`);
    await page.getByRole("button",{name:/預約設定/}).click();
    for(const [opener,field,value] of [["營業時間","opensAt","11:15"],["預約、取消與訂金規則","minimumLeadMinutes","95"]]) {
      await page.getByRole("button",{name:new RegExp(opener)}).click();
      const dialog=page.getByRole("dialog");
      await dialog.locator(`[name=${field}]`).fill(value);
      if(field==="opensAt") await dialog.locator('input[name=days][value="0"]').check();
      else {
        await dialog.locator('[name=holdMinutes]').fill("99");
        await dialog.getByRole("button",{name:"訂金設定",exact:true}).click();
        await dialog.locator(".merchant-sheet-footer button").click();
        await ui(dialog.locator('[name=holdMinutes]')).toBeFocused();
        await dialog.locator('[name=holdMinutes]').fill("10");
        await dialog.getByRole("button",{name:"訂金設定",exact:true}).click();
        await dialog.locator('[name=depositMode]').selectOption("PERCENTAGE");
        await dialog.locator('[name=depositPercentage]').fill("37");
        await dialog.getByRole("button",{name:"預約規則",exact:true}).click();
      }
      const draft=()=>dialog.locator("input,select").evaluateAll(nodes=>nodes.map(node=>{const el=node as HTMLInputElement;return {name:el.name,value:el.value,checked:el.checked};}));
      const before=await draft();
      for(const locale of ["en","vi","zh-TW"] as Locale[]) {
        await chooseLanguage(dialog,locale);
        expect(await draft()).toEqual(before);
        for(const width of [320,390,640,768,1024,1440]) {
          await page.setViewportSize({width,height:620});
          expect(await dialog.evaluate(node=>node.scrollWidth<=node.clientWidth)).toBe(true);
          await ui(dialog.locator(".merchant-sheet-footer button")).toBeInViewport();
        }
      }
      await page.keyboard.press("Escape");
      await page.getByRole("button",{name:new RegExp(opener)}).click();
      expect(await draft()).toEqual(before);
      await page.setViewportSize({width:390,height:844});
      const zoom=await page.addStyleTag({content:"html {font-size:200% !important;}"});
      expect(await dialog.evaluate(node=>node.scrollWidth<=node.clientWidth)).toBe(true);
      await ui(dialog.locator(".merchant-sheet-footer button")).toBeInViewport();
      await zoom.evaluate(node=>node.remove());
      await dialog.locator(`[name=${field}]`).focus();
      await page.evaluate(()=>{
        Object.defineProperties(window.visualViewport!,{height:{configurable:true,value:380},offsetTop:{configurable:true,value:24}});
        window.visualViewport!.dispatchEvent(new Event("resize"));
      });
      await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
      for(const control of [dialog.locator(`[name=${field}]`),dialog.locator(".merchant-sheet-footer button")]) expect(await control.evaluate(node=>{
        const r=node.getBoundingClientRect(),v=window.visualViewport!;
        const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
        return r.top>=v.offsetTop && r.bottom<=v.height+v.offsetTop && !!hit && node.contains(hit);
      })).toBe(true);
      await page.evaluate(()=>{Reflect.deleteProperty(window.visualViewport!,"height");Reflect.deleteProperty(window.visualViewport!,"offsetTop");window.visualViewport!.dispatchEvent(new Event("resize"));});
      await page.route("**/api/merchant/setup?**",route=>route.fulfill({status:503,json:{error:{message:"開店設定更新失敗。"}}}));
      await dialog.locator(".merchant-sheet-footer button").click();
      await ui(dialog.getByRole("alert")).toBeVisible();
      expect(await draft()).toEqual(before);
      const failed=await prisma.merchant_setup_progress.findUniqueOrThrow({where:{id:progress.id}});
      expect(field==="opensAt" ? failed.business_hours_completed_at : failed.policies_completed_at).toBeNull();
      await chooseLanguage(dialog,"vi");
      await ui(dialog.getByRole("alert")).toHaveText(translate("vi","開店設定更新失敗。"));
      await page.unroute("**/api/merchant/setup?**");
      const saved=page.waitForResponse(response=>response.url().includes("/api/merchant/setup?")&&response.request().method()==="POST");
      await dialog.locator(".merchant-sheet-footer button").click();
      expect((await saved).status()).toBe(200);
      await ui(dialog.getByRole("status")).toBeVisible();
      const stored=await prisma.merchant_setup_progress.findUniqueOrThrow({where:{id:progress.id}});
      expect(field==="opensAt" ? stored.business_hours_completed_at : stored.policies_completed_at).not.toBeNull();
      if(field==="opensAt") {
        const savedHours=await prisma.location_business_hours.findMany({where:{location_id:branch.id}});
        expect(savedHours).toHaveLength(7);
        expect(savedHours.every(row=>row.opens_at.toISOString().slice(11,16)==="11:15")).toBe(true);
      } else {
        expect((await prisma.location_booking_policies.findUniqueOrThrow({where:{location_id:branch.id}})).minimum_lead_minutes).toBe(95);
        const savedCancellation=await prisma.cancellation_policies.findUniqueOrThrow({where:{id:cancellation.id}});
        expect(savedCancellation).toMatchObject({late_fee_mode:"DEPOSIT_FORFEIT",late_fee_fixed_minor:null,late_fee_percentage:null,no_show_fee_mode:"DEPOSIT_FORFEIT",no_show_fee_fixed_minor:null,no_show_fee_percentage:null});
        expect(Number((await prisma.deposit_policies.findUniqueOrThrow({where:{id:deposit.id}})).percentage)).toBe(37);
      }
      await page.screenshot({path:`.dev-logs/merchant-setup-${field}-saved.png`});
      await page.keyboard.press("Escape");
      await chooseLanguage(page,"zh-TW");
      await page.reload();
      await page.getByRole("button",{name:/預約設定/}).click();
      await ui(page.getByRole("button",{name:new RegExp(opener)})).toContainText("已完成");
    }
    expect(errors).toEqual([]);
    expect((await prisma.locations.findUniqueOrThrow({where:{id:branch.id}})).booking_state).toBe(branch.booking_state);
  } finally {
    await browser.close();
    await prisma.$transaction(async tx=>{
      await tx.location_business_hours.deleteMany({where:{organization_id:organization.id,location_id:branch.id}});
      if(hours.length) await tx.location_business_hours.createMany({data:hours});
      await tx.location_booking_policies.update({where:{id:policy.id},data:policy});
      await tx.deposit_policies.update({where:{id:deposit.id},data:deposit});
      await tx.cancellation_policies.update({where:{id:cancellation.id},data:cancellation});
      await tx.merchant_setup_progress.update({where:{id:progress.id},data:progress});
    });
  }
},120000);

it.skipIf(!process.env.UNIFIED_UI_TEST_URL || !process.env.UNIFIED_TEST_DATABASE_URL)("merchant business setup gates activation and keeps failed action dialogs retryable", async()=>{
  const {prisma}=await import("../src/server/database/prisma");
  const organization=await prisma.organizations.findUniqueOrThrow({where:{slug:"demo"}});
  const branch=await prisma.locations.findFirstOrThrow({where:{organization_id:organization.id,slug:"taipei"}});
  const progress=await prisma.merchant_setup_progress.findUniqueOrThrow({where:{organization_id:organization.id}});
  const integrations=await prisma.notification_integrations.findMany({where:{organization_id:organization.id}});
  const browser=await chromium.launch({executablePath:browserPath});
  const page=await browser.newPage({locale:"zh-TW",viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const base=process.env.UNIFIED_UI_TEST_URL!;
  const pattern="**/api/merchant/setup?**";
  const attempts:string[]=[];
  try {
    await prisma.merchant_setup_progress.update({where:{id:progress.id},data:{notifications_completed_at:null,test_booking_completed_at:null,go_live_at:null}});
    await page.goto(`${base}/api/line-booking/integrated-demo?role=owner`);
    await page.goto(`${base}/merchant/setup?${scope}`);
    await page.getByRole("button",{name:/開放預約/}).click();
    await ui(page.getByRole("button",{name:"正式上線",exact:true})).toBeDisabled();
    await page.getByRole("button",{name:/測試預約/}).click();
    await ui(page.getByRole("dialog").locator(".merchant-sheet-footer button")).toBeDisabled();
    await page.keyboard.press("Escape");
    await page.getByRole("button",{name:/預約設定/}).click();
    await page.getByRole("button",{name:/通知通道/}).click();
    const dialog=page.getByRole("dialog");
    await page.route(pattern,async route=>{attempts.push(route.request().postDataJSON().action);await route.fulfill({status:503,json:{error:{message:"開店設定更新失敗。"}}});});
    await dialog.locator(".merchant-sheet-footer button").click();
    await ui(dialog.getByRole("alert")).toBeVisible();
    await chooseLanguage(dialog,"en");
    await page.unroute(pattern);
    const saved=page.waitForResponse(response=>response.url().includes("/api/merchant/setup?")&&response.request().method()==="POST");
    await dialog.locator(".merchant-sheet-footer button").click();
    expect((await saved).status()).toBe(200);
    await ui(dialog.getByRole("status")).toBeVisible();
    await ui(dialog).toHaveAttribute("aria-busy","false");
    expect((await prisma.merchant_setup_progress.findUniqueOrThrow({where:{id:progress.id}})).notifications_completed_at).not.toBeNull();
    const after=await prisma.notification_integrations.findMany({where:{organization_id:organization.id}});
    for(const item of after) expect(item.status).toBe(integrations.find(original=>original.id===item.id)?.status ?? "DISABLED");
    await page.keyboard.press("Escape");
    await ui(dialog).toBeHidden();
    await chooseLanguage(page,"zh-TW");
    await page.getByRole("button",{name:/開放預約/}).click();
    await page.getByRole("button",{name:/測試預約/}).click();
    await page.route(pattern,async route=>{attempts.push(route.request().postDataJSON().action);await route.fulfill({status:503,json:{error:{message:"開店設定更新失敗。"}}});});
    for(const locale of ["zh-TW","vi"] as Locale[]) {
      await chooseLanguage(dialog,locale);
      await dialog.locator(".merchant-sheet-footer button").click();
      await ui(dialog.getByRole("alert")).toBeVisible();
      await ui(dialog.locator(".merchant-sheet-footer button")).toBeEnabled();
    }
    await page.keyboard.press("Escape");
    await prisma.merchant_setup_progress.update({where:{id:progress.id},data:{test_booking_completed_at:new Date()}});
    await chooseLanguage(page,"zh-TW");
    await page.reload();
    await page.getByRole("button",{name:/開放預約/}).click();
    await page.getByRole("button",{name:"正式上線",exact:true}).click();
    await page.keyboard.press("Escape");
    expect(attempts).not.toContain("GO_LIVE");
    await page.getByRole("button",{name:"正式上線",exact:true}).click();
    await dialog.getByRole("button",{name:"確認開放預約",exact:true}).click();
    await ui(dialog.getByRole("alert")).toBeVisible();
    expect(attempts).toEqual(["NOTIFICATIONS","CREATE_TEST_BOOKING","CREATE_TEST_BOOKING","GO_LIVE"]);
    expect((await prisma.merchant_setup_progress.findUniqueOrThrow({where:{id:progress.id}})).go_live_at).toBeNull();
    expect((await prisma.locations.findUniqueOrThrow({where:{id:branch.id}})).booking_state).toBe(branch.booking_state);
  } finally {
    await browser.close();
    await prisma.merchant_setup_progress.update({where:{id:progress.id},data:progress});
    await prisma.notification_integrations.deleteMany({where:{organization_id:organization.id,id:{notIn:integrations.map(item=>item.id)},status:"DISABLED"}});
  }
},60000);
