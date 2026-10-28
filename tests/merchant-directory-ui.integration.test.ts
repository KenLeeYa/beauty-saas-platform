import {chromium,expect as browserExpect} from "@playwright/test";
import {expect,it} from "vitest";
import {chooseLanguage} from "./language-menu";
import {randomUUID} from "node:crypto";
import {waitForSkillCatalog} from "./skill-catalog";

it.skipIf(!process.env.UNIFIED_UI_TEST_URL || !process.env.UNIFIED_TEST_DATABASE_URL)("service and staff server pages preserve independent drafts, skills and language through paging and retry on mobile",async()=>{
  const {prisma}=await import("../src/server/database/prisma");
  const base=process.env.UNIFIED_UI_TEST_URL!,org="11111111-1111-4111-8111-111111111111",branch="22222222-2222-4222-8222-222222222221";
  const marker=`跨頁護理${Date.now()}`,serviceIds:string[]=[],staffIds:string[]=[];
  const category=await prisma.service_categories.create({data:{organization_id:org,name:marker}});
  const browser=await chromium.launch({executablePath:"C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"});
  const page=await browser.newPage({locale:"zh-TW",viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:"reduce"});
  const errors:string[]=[];page.on("pageerror",error=>errors.push(error.message));
  try {
    for(let i=0;i<9;i++) {
      const name=marker+String(i).padStart(2,"0");
      const service=await prisma.services.create({data:{organization_id:org,name,category_id:category.id}});serviceIds.push(service.id);
      const variant=await prisma.service_variants.create({data:{organization_id:org,service_id:service.id,name:"標準療程",duration_minutes:60,price_minor:180000}});
      await prisma.location_services.create({data:{organization_id:org,location_id:branch,service_id:service.id,service_variant_id:variant.id,sort_order:i}});
      const person=await prisma.staff_profiles.create({data:{organization_id:org,display_name:name,title:"美容師",sort_order:i}});staffIds.push(person.id);
      await prisma.staff_location_assignments.create({data:{organization_id:org,location_id:branch,staff_profile_id:person.id}});
    }
    await page.goto(`${base}/api/line-booking/integrated-demo?role=owner`);
    for(const kind of ["services","staff"] as const) {
      const service=kind==="services",endpoint=`/api/merchant/${kind}?`,pattern=`**${endpoint}**`;
      await page.goto(`${base}/merchant/${kind}?organization=demo&location=taipei`);
      const response=page.waitForResponse(r=>r.url().includes(endpoint)&&r.request().method()==="GET"&&new URL(r.url()).searchParams.get("search")===marker,{timeout:5000});
      const search=page.getByLabel(service?"搜尋服務":"搜尋服務人員",{exact:true});
      await search.fill(marker);expect((await response).status()).toBe(200);
      const pager=page.locator('main .merchant-pager').first(),dialog=page.getByRole("dialog");
      const rows=page.locator(service?".merchant-row":".merchant-person-card");
      await browserExpect(pager).toContainText("1-8 / 9");await browserExpect(rows).toHaveCount(8);
      if(service) await page.getByLabel("服務群組",{exact:true}).selectOption(marker);
      await rows.first().click();await waitForSkillCatalog(dialog);
      const skill=dialog.getByRole("checkbox").first(),skillName=await skill.getAttribute("aria-label") || await skill.evaluate(n=>n.closest("label")?.textContent?.trim()??"");
      await skill.check();
      if(service) await dialog.locator('[name="preBufferMinutes"]').fill("23");
      await dialog.getByRole("button",{name:"關閉",exact:true}).click();
      await pager.getByRole("button",{name:"下一頁",exact:true}).click();
      await browserExpect(pager).toContainText("9-9 / 9");await browserExpect(rows).toHaveCount(1);
      await rows.first().click();await waitForSkillCatalog(dialog);
      await browserExpect(dialog.getByRole("checkbox").first()).not.toBeChecked();
      await dialog.getByRole("button",{name:"關閉",exact:true}).click();
      await page.getByRole("button",{name:service?"新增服務":"新增服務人員",exact:true}).click();
      const field=dialog.locator(service?'[name="name"]':'[name="displayName"]');
      await field.fill("尚未送出的中文草稿");
      if(!service) {await waitForSkillCatalog(dialog);await dialog.getByRole("checkbox").first().check();}
      for(const locale of ["en","vi","zh-TW"] as const) {
        await chooseLanguage(dialog,locale);await browserExpect(field).toHaveValue("尚未送出的中文草稿");
        if(!service) await browserExpect(dialog.getByRole("checkbox").first()).toBeChecked();
        await browserExpect(pager).toContainText("9-9 / 9");
        for(const viewport of [{width:320,height:740},{width:390,height:844},{width:844,height:390}]) {
          await page.setViewportSize(viewport);
          expect(await dialog.evaluate(n=>n.scrollWidth<=n.clientWidth)).toBe(true);
          await browserExpect.poll(async()=>{const b=await dialog.locator('.merchant-sheet-footer').boundingBox();return b!.y+b!.height;}).toBeLessThanOrEqual(viewport.height+1);
        }
      }
      await page.setViewportSize({width:390,height:844});
      await dialog.getByRole("button",{name:"關閉",exact:true}).click();
      await page.route(pattern,route=>route.request().method()==="GET"?route.fulfill({status:503,json:{error:{message:"無法載入清單，請重試"}}}):route.continue());
      await pager.getByRole("button",{name:"上一頁",exact:true}).click();
      await browserExpect(page.getByRole("alert").filter({hasText:"無法載入清單"})).toBeVisible();
      await page.unroute(pattern);await page.getByRole("button",{name:"重試",exact:true}).click();
      await browserExpect(pager).toContainText("1-8 / 9");
      await page.getByRole("button",{name:service?"新增服務":"新增服務人員",exact:true}).click();
      await browserExpect(field).toHaveValue("尚未送出的中文草稿");
      if(!service) {await waitForSkillCatalog(dialog);await browserExpect(dialog.getByRole("checkbox").first()).toBeChecked();}
      await dialog.getByRole("button",{name:"關閉",exact:true}).click();
      await rows.first().click();await waitForSkillCatalog(dialog);
      await browserExpect(dialog.getByRole("checkbox").first()).toBeChecked();
      if(service) await browserExpect(dialog.locator('[name="preBufferMinutes"]')).toHaveValue("23");
      for(const locale of ["en","vi","zh-TW"] as const) {
        await chooseLanguage(dialog,locale);await browserExpect(dialog.getByRole("checkbox").first()).toBeChecked();
        if(service) await browserExpect(dialog.locator('[name="preBufferMinutes"]')).toHaveValue("23");
      }
      const saveName=service?"儲存服務技能":"儲存技能",savePattern=service?pattern:"**/api/merchant/staff/skills?**";
      await page.route(savePattern,route=>route.request().method()==="PATCH"?route.fulfill({status:503,json:{error:{message:"設定失敗。"}}}):route.continue());
      await dialog.getByRole("button",{name:saveName,exact:true}).click();
      await browserExpect(dialog.getByRole("alert")).toBeVisible();await browserExpect(dialog.getByRole("checkbox").first()).toBeChecked();
      await page.unroute(savePattern);
      const saved=page.waitForResponse(r=>r.url().includes(service?endpoint:"/api/merchant/staff/skills?")&&r.request().method()==="PATCH");
      await dialog.getByRole("button",{name:saveName,exact:true}).click();expect((await saved).status()).toBe(200);
      await browserExpect(dialog).toBeVisible();await browserExpect(dialog.getByRole("checkbox").first()).toBeChecked();
      if(service) {await dialog.getByRole("button",{name:"儲存服務緩衝時間",exact:true}).click();await browserExpect(dialog.getByRole("status")).toContainText("服務緩衝時間已更新");}
      await page.screenshot({path:`.dev-logs/server-${kind}-draft-mobile.png`});
      await page.reload();await page.getByLabel(service?"搜尋服務":"搜尋服務人員",{exact:true}).fill(marker+"00");
      await browserExpect(rows).toHaveCount(1);await rows.first().click();await waitForSkillCatalog(dialog);
      await browserExpect(dialog.getByRole("checkbox",{name:skillName,exact:true})).toBeChecked();
      if(service) await browserExpect(dialog.locator('[name="preBufferMinutes"]')).toHaveValue("23");
      await dialog.getByRole("button",{name:"關閉",exact:true}).click();
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
        await search.fill(marker+"08");await browserExpect(rows).toHaveCount(1);await browserExpect(rows).toContainText(marker+"08");
        release();await done;await browserExpect(rows).toContainText(marker+"08");
      } finally {release();await page.unroute(pattern);}
      await search.fill("查無此項目"+marker);await browserExpect(page.getByText("請調整搜尋條件",{exact:true})).toBeVisible();
      expect(await page.locator("html").evaluate(n=>n.scrollWidth<=innerWidth)).toBe(true);
    }
    expect(errors).toEqual([]);
  } finally {
    await browser.close();
    await prisma.service_staff_assignments.deleteMany({where:{staff_profile_id:{in:staffIds}}});
    await prisma.staff_location_assignments.deleteMany({where:{staff_profile_id:{in:staffIds}}});
    await prisma.staff_profiles.deleteMany({where:{id:{in:staffIds}}});
    await prisma.location_services.deleteMany({where:{service_id:{in:serviceIds}}});
    await prisma.service_variants.deleteMany({where:{service_id:{in:serviceIds}}});
    await prisma.services.deleteMany({where:{id:{in:serviceIds}}});
    await prisma.service_categories.delete({where:{id:category.id}});
  }
},120000);

it.skipIf(!process.env.UNIFIED_UI_TEST_URL || !process.env.UNIFIED_TEST_DATABASE_URL)("server skill pages retain cross-page selections, multilingual forms and retry until saved on mobile",async()=>{
  const {prisma}=await import("../src/server/database/prisma");
  const base=process.env.UNIFIED_UI_TEST_URL!,org="11111111-1111-4111-8111-111111111111";
  const marker=`跨頁技能${randomUUID().slice(0,8)}`,staffName=`美容師分頁驗證${Date.now()}`;
  const ids:string[]=[];
  const browser=await chromium.launch({executablePath:"C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"});
  const page=await browser.newPage({locale:"zh-TW",viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:"reduce"});
  const errors:string[]=[];page.on("pageerror",error=>errors.push(error.message));
  try {
    for(let i=0;i<17;i++) {const id=randomUUID();ids.push(id);await prisma.$executeRaw`insert into public.staff_skill_catalog(id,organization_id,name) values(${id}::uuid,${org}::uuid,${marker+String(i).padStart(2,"0")})`;}
    await page.goto(`${base}/api/line-booking/integrated-demo?role=owner`);
    await page.goto(`${base}/merchant/staff?organization=demo&location=taipei`);
    const request=page.waitForResponse(response=>response.url().includes("/api/merchant/staff/skills?") && response.request().method()==="GET",{timeout:5000});
    await page.getByRole("button",{name:"新增服務人員",exact:true}).click();
    expect((await request).status()).toBe(200);
    const dialog=page.getByRole("dialog");
    await dialog.getByLabel("顯示名稱",{exact:true}).fill(staffName);
    await dialog.getByLabel("職稱",{exact:true}).fill("保留的職稱草稿");
    await dialog.getByLabel("搜尋技能",{exact:true}).fill(marker);
    await browserExpect(dialog.getByRole("navigation",{name:"清單分頁"})).toContainText("1-8 / 17");
    await dialog.getByRole("checkbox",{name:marker+"00",exact:true}).check();
    await dialog.getByRole("button",{name:"下一頁",exact:true}).click();
    await browserExpect(dialog.getByRole("navigation",{name:"清單分頁"})).toContainText("9-16 / 17");
    await dialog.getByRole("checkbox",{name:marker+"08",exact:true}).check();
    for(const locale of ["en","vi","zh-TW"] as const) {
      await chooseLanguage(dialog,locale);
      await browserExpect(dialog.locator('input[type="search"]')).toHaveValue(marker);
      await browserExpect(dialog.locator('input[name="displayName"]')).toHaveValue(staffName);
      await browserExpect(dialog.locator('input[name="title"]')).toHaveValue("保留的職稱草稿");
      await browserExpect(dialog.getByRole("checkbox",{name:marker+"08",exact:true})).toBeChecked();
      for(const viewport of [{width:320,height:740},{width:390,height:844},{width:844,height:390}]) {
        await page.setViewportSize(viewport);
        expect(await dialog.evaluate(n=>n.scrollWidth<=n.clientWidth)).toBe(true);
        await browserExpect.poll(async()=>{
          const footer=await dialog.locator('.merchant-sheet-footer').boundingBox();
          return footer!.y+footer!.height;
        }).toBeLessThanOrEqual(viewport.height+1);
      }
    }
    await page.setViewportSize({width:390,height:844});
    await page.route("**/api/merchant/staff/skills?**",route=>route.request().method()==="GET" ? route.fulfill({status:503,json:{error:{message:"無法載入清單，請重試"}}}) : route.continue());
    await dialog.getByRole("button",{name:"下一頁",exact:true}).click();
    await browserExpect(dialog.getByRole("alert")).toBeVisible();
    await page.unroute("**/api/merchant/staff/skills?**");
    await dialog.getByRole("button",{name:"重試",exact:true}).click();
    await browserExpect(dialog.getByRole("navigation",{name:"清單分頁"})).toContainText("17-17 / 17");
    await dialog.getByRole("checkbox",{name:marker+"16",exact:true}).check();
    await dialog.getByRole("button",{name:"上一頁",exact:true}).click();
    await browserExpect(dialog.getByRole("checkbox",{name:marker+"08",exact:true})).toBeChecked();
    await dialog.getByRole("button",{name:"上一頁",exact:true}).click();
    await browserExpect(dialog.getByRole("checkbox",{name:marker+"00",exact:true})).toBeChecked();
    await dialog.getByRole("checkbox",{name:marker+"00",exact:true}).uncheck();
    await dialog.getByLabel("搜尋技能",{exact:true}).fill("沒有此項目"+marker);
    await browserExpect(dialog.getByText("沒有符合的技能，請調整搜尋文字",{exact:true})).toBeVisible();
    let submitted: {skills:string[]}|undefined;
    await page.route("**/api/merchant/staff?**",route=>{
      submitted=route.request().postDataJSON() as {skills:string[]};
      return route.fulfill({status:503,json:{error:{message:"建立資料失敗。"}}});
    });
    await dialog.getByRole("button",{name:"儲存",exact:true}).click();
    await browserExpect(dialog.getByRole("alert")).toBeVisible();
    expect(submitted?.skills).toEqual([marker+"08",marker+"16"]);
    await browserExpect(dialog.locator('input[name="displayName"]')).toHaveValue(staffName);
    await page.unroute("**/api/merchant/staff?**");
    const saved=page.waitForResponse(response=>response.url().includes("/api/merchant/staff?") && response.request().method()==="POST");
    await dialog.getByRole("button",{name:"儲存",exact:true}).click();
    expect((await saved).status()).toBe(201);
    await browserExpect(dialog).toHaveCount(0);
    await page.reload();
    await page.getByLabel("搜尋服務人員",{exact:true}).fill(staffName);
    await page.getByRole("button",{name:`人員詳細資料 ${staffName}`,exact:true}).click();
    await dialog.getByLabel("搜尋技能",{exact:true}).fill(marker+"08");
    await browserExpect(dialog.getByRole("checkbox",{name:marker+"08",exact:true})).toBeChecked();
    await dialog.getByLabel("搜尋技能",{exact:true}).fill(marker+"16");
    await browserExpect(dialog.getByRole("checkbox",{name:marker+"16",exact:true})).toBeChecked();
    await page.screenshot({path:".dev-logs/server-skills-mobile.png"});
    await dialog.getByRole("button",{name:"關閉",exact:true}).click();
    await page.goto(`${base}/merchant/services?organization=demo&location=taipei`);
    await page.getByRole("button",{name:/服務詳細資料/}).first().click();
    await dialog.locator('[name="preBufferMinutes"]').fill("19");
    await dialog.getByLabel("搜尋技能",{exact:true}).fill(marker);
    await browserExpect(dialog.getByRole("navigation",{name:"清單分頁"})).toContainText("1-8 / 17");
    await dialog.getByRole("checkbox",{name:marker+"00",exact:true}).check();
    await dialog.getByRole("button",{name:"下一頁",exact:true}).click();
    await dialog.getByRole("checkbox",{name:marker+"08",exact:true}).check();
    for(const locale of ["en","vi","zh-TW"] as const) {
      await chooseLanguage(dialog,locale);
      await browserExpect(dialog.locator('[name="preBufferMinutes"]')).toHaveValue("19");
      await browserExpect(dialog.getByRole("checkbox",{name:marker+"08",exact:true})).toBeChecked();
    }
    await dialog.getByRole("button",{name:"上一頁",exact:true}).click();
    await browserExpect(dialog.getByRole("checkbox",{name:marker+"00",exact:true})).toBeChecked();
    await page.screenshot({path:".dev-logs/server-service-skills-mobile.png"});
    expect(errors).toEqual([]);
  } finally {
    await browser.close();
    await prisma.staff_profiles.updateMany({where:{organization_id:org,display_name:staffName},data:{is_active:false,public_visible:false,skills:[]}});
    for(const id of ids) await prisma.$executeRaw`delete from public.staff_skill_catalog where id=${id}::uuid and organization_id=${org}::uuid`;
  }
},90000);

it.skipIf(!process.env.UNIFIED_UI_TEST_URL)("isolated showcase mobile server pages preserve multilingual searches, customer and skill drafts, and retry failures",async()=>{
  const base=process.env.UNIFIED_UI_TEST_URL!;
  const browser=await chromium.launch({executablePath:"C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"});
  const page=await browser.newPage({locale:"zh-TW",viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const errors:string[]=[];page.on("pageerror",error=>errors.push(error.message));
  const scope="organization=showcase&location=daan";
  try {
    await page.goto(`${base}/api/line-booking/integrated-demo?store=showcase&role=owner`);
    await browserExpect(page.getByRole("heading",{name:"營運管理",exact:true})).toBeVisible();
    await page.goto(`${base}/merchant/customers?${scope}`);
    const cards=page.locator(".merchant-person-card");
    await browserExpect(cards).toHaveCount(8);
    const first=await cards.allTextContents();
    await page.getByRole("navigation",{name:"清單分頁"}).getByRole("button",{name:"下一頁"}).click();
    await browserExpect.poll(async()=>JSON.stringify(await cards.allTextContents())!==JSON.stringify(first)).toBe(true);
    await page.getByLabel("搜尋顧客",{exact:true}).fill("沈若晴");
    await browserExpect(cards).toHaveCount(1);await browserExpect(cards).toContainText("沈若晴");
    await page.getByRole("button",{name:"新增顧客",exact:true}).click();
    await page.locator('[name="displayName"]').fill("保留的中文草稿");
    for(const locale of ["en","vi","zh-TW"] as const) {
      await chooseLanguage(page,locale);
      await browserExpect(page.locator('input[type="search"]').first()).toHaveValue("沈若晴");
      await browserExpect(page.locator('[name="displayName"]')).toHaveValue("保留的中文草稿");
      for(const width of [320,390,768]) {await page.setViewportSize({width,height:844});expect(await page.locator("html").evaluate(n=>n.scrollWidth<=innerWidth)).toBe(true);}
    }
    await page.route("**/api/merchant/customers?**",route=>route.fulfill({status:503,json:{error:{message:"無法載入清單，請重試"}}}));
    await page.getByLabel("搜尋顧客",{exact:true}).fill("王佩珊");
    await browserExpect(page.getByRole("alert").filter({hasText:"無法載入清單"})).toBeVisible();
    await page.unroute("**/api/merchant/customers?**");
    await page.getByRole("button",{name:"重試",exact:true}).click();
    await browserExpect(cards).toHaveCount(1);await browserExpect(cards).toContainText("王佩珊");
    await browserExpect(page.locator('[name="displayName"]')).toHaveValue("保留的中文草稿");
    await page.setViewportSize({width:390,height:844});
    await page.screenshot({path:".dev-logs/showcase-customers-mobile.png"});
    await page.goto(`${base}/merchant/staff?${scope}`);
    await browserExpect(page.locator('.merchant-person-card img').first()).toBeVisible();
    await browserExpect.poll(()=>page.locator('.merchant-person-card img').first().evaluate(n=>(n as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    await page.getByRole("button",{name:"新增服務人員",exact:true}).click();
    const dialog=page.getByRole("dialog");
    await dialog.getByLabel("顯示名稱",{exact:true}).fill("技能草稿");
    await browserExpect(dialog.getByRole("checkbox")).toHaveCount(8);
    await dialog.getByLabel("搜尋技能",{exact:true}).fill("頭皮");
    await dialog.getByRole("checkbox",{name:"頭皮舒壓",exact:true}).check();
    await dialog.getByLabel("搜尋技能",{exact:true}).fill("保濕");
    await dialog.getByRole("checkbox",{name:"保濕導入",exact:true}).check();
    for(const locale of ["en","vi","zh-TW"] as const) {
      await chooseLanguage(dialog,locale);
      await browserExpect(dialog.locator('input[type="search"]')).toHaveValue("保濕");
      await browserExpect(dialog.getByRole("checkbox",{name:"保濕導入",exact:true})).toBeChecked();
      await browserExpect(dialog.locator('input[name="displayName"]')).toHaveValue("技能草稿");
    }
    await dialog.getByLabel("搜尋技能",{exact:true}).fill("頭皮");
    await browserExpect(dialog.getByRole("checkbox",{name:"頭皮舒壓",exact:true})).toBeChecked();
    await page.keyboard.press("Escape");
    await page.getByRole("button",{name:"新增服務人員",exact:true}).click();
    await dialog.getByLabel("搜尋技能",{exact:true}).fill("頭皮");
    await browserExpect(dialog.getByRole("checkbox",{name:"頭皮舒壓",exact:true})).toBeChecked();
    await page.screenshot({path:".dev-logs/showcase-skills-mobile.png"});
    await page.keyboard.press("Escape");
    await page.goto(`${base}/merchant/bookings?${scope}`);
    await browserExpect(page.getByRole("navigation",{name:"清單分頁"})).toContainText("/ 20");
    await page.getByLabel("搜尋預約",{exact:true}).fill("水潤");
    for(const locale of ["en","vi","zh-TW"] as const) {await chooseLanguage(page,locale);await browserExpect(page.locator('input').first()).toHaveValue("水潤");}
    expect(errors).toEqual([]);
  } finally {await browser.close();}
},90000);

it.skipIf(!process.env.UNIFIED_UI_TEST_URL)("showcase pending reviews use six-row pages, retry loading, and retain reassignment language drafts",async()=>{
  const base=process.env.UNIFIED_UI_TEST_URL!;
  const browser=await chromium.launch({executablePath:"C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"});
  const page=await browser.newPage({locale:"zh-TW",viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  try {
    await page.goto(`${base}/api/line-booking/integrated-demo?store=showcase&role=owner`);
    await page.getByRole("button",{name:"預約改派",exact:true}).click();
    const panel=page.getByLabel("資格異動待處理預約",{exact:true});
    await browserExpect(panel.locator("li[data-segment-id]")).toHaveCount(6);
    await panel.getByRole("button",{name:"下一頁",exact:true}).click();
    await browserExpect(panel.getByRole("navigation")).toContainText("7 - 12");
    await panel.getByLabel("搜尋服務或人員").fill("舒敏");
    await browserExpect(panel.locator("li[data-segment-id]")).toHaveCount(2);
    await panel.getByRole("button",{name:"選擇改派人員",exact:true}).first().click();
    const dialog=page.getByRole("dialog");
    await dialog.getByLabel("改派原因",{exact:true}).fill("保留原人員與其他療程");
    for(const locale of ["en","vi","zh-TW"] as const) {
      await chooseLanguage(dialog,locale);
      await browserExpect(dialog.locator("textarea, input").last()).toHaveValue("保留原人員與其他療程");
      expect(await dialog.evaluate(n=>n.scrollWidth<=n.clientWidth)).toBe(true);
    }
    await page.screenshot({path:".dev-logs/showcase-reassignment-mobile.png"});
    await page.keyboard.press("Escape");
    await page.route("**/api/merchant/bookings/reassign?**",route=>route.fulfill({status:503,json:{error:{message:"無法載入待處理預約"}}}));
    await panel.getByRole("button",{name:"重新整理待處理預約",exact:true}).click();
    await browserExpect(panel.getByRole("alert")).toBeVisible();
    await page.unroute("**/api/merchant/bookings/reassign?**");
    await panel.getByRole("button",{name:"重新整理待處理預約",exact:true}).click();
    await browserExpect(panel.locator("li[data-segment-id]")).toHaveCount(2);
    let release!:()=>void,started!:()=>void;
    const held=new Promise<void>(resolve=>{release=resolve;}),requested=new Promise<void>(resolve=>{started=resolve;});
    await page.route("**/api/merchant/bookings/reassign?**",async route=>{
      if(new URL(route.request().url()).searchParams.get("search")!=="舒敏") return route.continue();
      const response=await route.fetch();started();await held;
      await route.fulfill({response}).catch(()=>{});
    });
    await panel.getByRole("button",{name:"重新整理待處理預約",exact:true}).click();await requested;
    await panel.getByLabel("搜尋服務或人員").fill("水潤");
    await browserExpect(panel.locator("li[data-segment-id]")).toHaveCount(6);
    release();await page.waitForTimeout(400);
    await browserExpect(panel.locator("li[data-segment-id]")).toHaveCount(6);
    await page.unroute("**/api/merchant/bookings/reassign?**");
    await panel.getByLabel("搜尋服務或人員").fill("不存在的人員");
    await browserExpect(panel.getByText("目前沒有資格異動待處理預約",{exact:true})).toBeVisible();
  } finally {await browser.close();}
},60000);
