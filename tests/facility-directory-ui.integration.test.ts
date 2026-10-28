import {chromium, expect as browserExpect} from "@playwright/test";
import {expect, it} from "vitest";
import {randomUUID} from "node:crypto";
import {chooseLanguage} from "./language-menu";

it.skipIf(!process.env.UNIFIED_UI_TEST_URL || !process.env.UNIFIED_TEST_DATABASE_URL)("facility server pages retain mobile multilingual drafts across paging, errors and saved readback", async () => {
  const {prisma} = await import("../src/server/database/prisma");
  const base = process.env.UNIFIED_UI_TEST_URL!, org = "11111111-1111-4111-8111-111111111111";
  const marker = `分頁美學${randomUUID().slice(0,8)}`, ids: string[] = [];
  const slug = `qa-${randomUUID()}`, typeId = randomUUID();
  const browser = await chromium.launch({executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"});
  const page = await browser.newPage({locale: "zh-TW", viewport: {width:390,height:844}, isMobile:true, hasTouch:true, reducedMotion:"reduce"});
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  try {
    for (let i=0;i<9;i++) {
      const row = await prisma.locations.create({data: {organization_id:org, name:marker+String(i).padStart(2,"0"),
        slug:i===0?slug:`qa-${randomUUID()}`, code:`QA${randomUUID().slice(0,8)}`}}); ids.push(row.id);
    }
    await prisma.resource_types.create({data:{id:typeId,organization_id:org,name:marker+"療程空間",kind:"SPA_ROOM"}});
    for(let i=0;i<7;i++) await prisma.resources.create({data:{organization_id:org,location_id:ids[0],resource_type_id:typeId,name:marker+String(i).padStart(2,"0"),sort_order:i}});
    await page.goto(`${base}/api/line-booking/integrated-demo?role=owner`);
    for(const kind of ["locations","resources"] as const) {
      const location=kind==="locations",endpoint=`/api/merchant/${location?"location":"resources"}?`,pattern=`**${endpoint}**`;
      await page.goto(`${base}/merchant/${kind}?organization=demo&location=${slug}`);
      const search=page.getByLabel(location?"搜尋分店":"搜尋空間與設備",{exact:true});
      const response=page.waitForResponse(r=>r.url().includes(endpoint)&&r.request().method()==="GET"&&new URL(r.url()).searchParams.get("search")===marker,{timeout:5000});
      await search.fill(marker);expect((await response).status()).toBe(200);
      const pager=page.locator("main .merchant-pager").first(),dialog=page.getByRole("dialog"),rows=page.locator(location?".merchant-row":".merchant-resource-row");
      await browserExpect(pager).toContainText(location?"1-8 / 9":"1-6 / 7");
      const open = async () => {if(location) await rows.filter({hasText:marker+"00"}).click();else await page.getByRole("button",{name:"新增空間或設備",exact:true}).click();};
      await open();const name=dialog.locator('[name="name"]'),draft=location?marker+"中文分店草稿":marker+"新增芳療設備";
      await name.fill(draft);
      if(location) {await dialog.locator('[name="address"]').fill("台北市大安區美學路一號");await dialog.locator('[name="description"]').fill("三語切換保留的分店介紹");}
      else {await dialog.locator('[name="typeName"]').fill(marker+"護理設備");await dialog.locator('[name="kind"]').selectOption("EQUIPMENT");}
      await dialog.getByRole("button",{name:"關閉",exact:true}).click();
      await pager.getByRole("button",{name:"下一頁",exact:true}).click();
      await browserExpect(pager).toContainText(location?"9-9 / 9":"7-7 / 7");await browserExpect(rows).toHaveCount(1);
      if(location) {
        await rows.first().click();await browserExpect(dialog.locator('[name="name"]')).toHaveCount(0);
        await browserExpect(dialog.getByRole("link",{name:"切換至此分店"})).toHaveAttribute("href",/organization=demo&location=qa-/);
        await dialog.getByRole("button",{name:"關閉",exact:true}).click();
      }
      for(const locale of ["en","vi","zh-TW"] as const) {await chooseLanguage(page,locale);await browserExpect(pager).toContainText(location?"9-9 / 9":"7-7 / 7");}
      await page.route(pattern,route=>route.request().method()==="GET"?route.fulfill({status:503,json:{error:{message:"無法載入清單，請重試"}}}):route.continue());
      await pager.getByRole("button",{name:"上一頁",exact:true}).click();
      await browserExpect(page.getByRole("alert").filter({hasText:"無法載入清單"})).toBeVisible();
      await page.unroute(pattern);await page.getByRole("button",{name:"重試",exact:true}).click();
      await browserExpect(pager).toContainText(location?"1-8 / 9":"1-6 / 7");await open();
      for(const locale of ["en","vi","zh-TW"] as const) {
        await chooseLanguage(dialog,locale);await browserExpect(name).toHaveValue(draft);
        if(location) {await browserExpect(dialog.locator('[name="address"]')).toHaveValue("台北市大安區美學路一號");await browserExpect(dialog.locator('[name="description"]')).toHaveValue("三語切換保留的分店介紹");}
        else {await browserExpect(dialog.locator('[name="typeName"]')).toHaveValue(marker+"護理設備");await browserExpect(dialog.locator('[name="kind"]')).toHaveValue("EQUIPMENT");}
        for(const viewport of [{width:320,height:740},{width:390,height:844},{width:844,height:390}]) {
          await page.setViewportSize(viewport);expect(await dialog.evaluate(n=>n.scrollWidth<=n.clientWidth)).toBe(true);
          await browserExpect.poll(async()=>{const b=await dialog.locator(".merchant-sheet-footer").boundingBox();return b!.y+b!.height;}).toBeLessThanOrEqual(viewport.height+1);
        }
      }
      await page.setViewportSize({width:390,height:844});
      await page.route(pattern,route=>route.request().method()===(location?"PATCH":"POST")?route.fulfill({status:503,json:{error:{message:"設定失敗。"}}}):route.continue());
      await dialog.getByRole("button",{name:"儲存",exact:true}).click();await browserExpect(dialog.getByRole("alert")).toBeVisible();await browserExpect(name).toHaveValue(draft);
      await page.unroute(pattern);
      const saved=page.waitForResponse(r=>r.url().includes(endpoint)&&r.request().method()===(location?"PATCH":"POST"));
      await dialog.getByRole("button",{name:"儲存",exact:true}).click();expect((await saved).status()).toBe(location?200:201);
      if(location) {await browserExpect(dialog.getByRole("status")).toContainText("分店資料已更新");await page.screenshot({path:".dev-logs/server-locations-draft-mobile.png"});}
      else {await browserExpect(dialog).toHaveCount(0);}
      await page.reload();await search.fill(draft);await browserExpect(rows).toHaveCount(1);await browserExpect(rows).toContainText(draft);
      if(location) {await rows.click();await browserExpect(name).toHaveValue(draft);await dialog.getByRole("button",{name:"關閉",exact:true}).click();}
      if(!location) await page.screenshot({path:".dev-logs/server-resources-page-mobile.png"});
      let release=()=>{},started=()=>{},finished=()=>{};
      const gate=new Promise<void>(resolve=>{release=resolve;}),ready=new Promise<void>(resolve=>{started=resolve;}),done=new Promise<void>(resolve=>{finished=resolve;});
      await page.route(pattern,async route=>{
        if(route.request().method()==="GET" && new URL(route.request().url()).searchParams.get("search")===marker+"01") {
          const response=await route.fetch();started();await gate;
          try {await route.fulfill({response});} finally {finished();}
        } else await route.continue();
      });
      try {
        await search.fill(marker+"01");await ready;
        await search.fill(marker+"02");await browserExpect(rows).toHaveCount(1);await browserExpect(rows).toContainText(marker+"02");
        release();await done;await browserExpect(rows).toContainText(marker+"02");
      } finally {release();await page.unroute(pattern);}
      await search.fill(marker);await browserExpect(pager).toContainText(location?"1-8 / 9":"1-6 / 8");
      if(!location) {await pager.scrollIntoViewIfNeeded();await page.screenshot({path:".dev-logs/server-resources-pagination-mobile.png"});}
      // Another administrator removes the final page while this client is paging.
      if(location) await prisma.locations.update({where:{id:ids[8]},data:{is_active:false}});
      else await prisma.resources.updateMany({where:{location_id:ids[0],name:{in:[marker+"06",draft]}},data:{is_active:false}});
      await pager.getByRole("button",{name:"下一頁",exact:true}).click();
      await browserExpect(pager).toContainText(location?"1-8 / 8":"1-6 / 6");await browserExpect(rows).toHaveCount(location?8:6);
      await search.fill("查無此項目"+marker);await browserExpect(page.getByText("沒有符合條件的資料",{exact:true})).toBeVisible();
      expect(await page.locator("html").evaluate(n=>n.scrollWidth<=innerWidth)).toBe(true);
    }
    expect(errors).toEqual([]);
  } finally {
    await browser.close();
    await prisma.resources.deleteMany({where:{location_id:{in:ids}}});
    await prisma.resource_types.deleteMany({where:{organization_id:org,name:{startsWith:marker}}});
    await prisma.locations.deleteMany({where:{id:{in:ids}}});
  }
},120000);

it.skipIf(!process.env.UNIFIED_UI_TEST_URL)("facility showcase directories fit mobile tablet and desktop in three languages", async () => {
  const base=process.env.UNIFIED_UI_LAN_URL || process.env.UNIFIED_UI_TEST_URL!;
  const browser=await chromium.launch({executablePath:"C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"});
  const page=await browser.newPage({locale:"zh-TW",viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:"reduce"});
  const errors:string[]=[];page.on("pageerror",error=>errors.push(error.message));
  try {
    await page.goto(`${base}/api/line-booking/integrated-demo?store=showcase&role=owner`);
    for(const kind of ["locations","resources"] as const) {
      await page.goto(`${base}/merchant/${kind}?organization=showcase&location=daan`);
      await browserExpect(page.locator(kind==="locations"?".merchant-row":".merchant-resource-row").first()).toBeVisible();
      for(const locale of ["zh-TW","en","vi"] as const) {
        await chooseLanguage(page,locale);
        for(const width of [320,390,768,1440]) {
          await page.setViewportSize({width,height:844});
          expect(await page.locator("html").evaluate(n=>n.scrollWidth<=innerWidth)).toBe(true);
          await browserExpect(page.locator("main .merchant-pager")).toBeVisible();
          if(width===390 && locale==="zh-TW") await page.screenshot({path:`.dev-logs/server-${kind}-showcase-mobile.png`});
        }
      }
    }
    expect(errors).toEqual([]);
  } finally {await browser.close();}
},60000);
