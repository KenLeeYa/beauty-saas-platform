import {chromium, expect as browserExpect, type Page, type Locator} from "@playwright/test";
import {expect, it} from "vitest";
import {chooseLanguage} from "./language-menu";
import {waitForSkillCatalog} from "./skill-catalog";

it.skipIf(!process.env.UNIFIED_UI_TEST_URL)("merchant navigation separates team access from service staff", async () => {
  const base = process.env.UNIFIED_UI_TEST_URL!;
  const browser = await chromium.launch({executablePath:"C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"});
  const page = await browser.newPage({locale:"zh-TW",viewport:{width:390,height:844}});
  try {
    await page.goto(`${base}/api/line-booking/integrated-demo?role=owner`);
    await page.goto(`${base}/merchant/team?organization=demo&location=taipei`);
    await browserExpect(page.getByRole("heading",{name:"團隊與權限",exact:true})).toBeVisible();
    await browserExpect(page.getByLabel("搜尋服務人員",{exact:true})).toHaveCount(0);
    await browserExpect(page.getByLabel("授權成員",{exact:true})).toBeVisible();
    await page.getByLabel("搜尋團隊成員",{exact:true}).fill("Lumi");
    for (const locale of ["en","vi","zh-TW"] as const) {
      await chooseLanguage(page,locale);
      await browserExpect(page.locator('input[type=search]')).toHaveValue("Lumi");
      expect(await page.locator("html").evaluate(node=>node.scrollWidth<=innerWidth)).toBe(true);
    }
    await page.getByLabel("搜尋團隊成員",{exact:true}).clear();
    const destinations=[['dashboard','營運總覽'],['calendar','預約行事曆'],['bookings','預約管理'],['customers','顧客管理'],['operations','營運管理'],['services','服務項目'],['staff','服務人員'],['resources','空間與設備'],['locations','分店管理'],['team','團隊與權限'],['reports','營運報表'],['subscription','訂閱方案'],['billing','帳務管理'],['settings','商家設定'],['setup','開店設定']];
    for (const width of [390,1440]) {
      await page.setViewportSize({width,height:844});
      for(const [view,label] of destinations){
        if(width<1000) await page.getByRole('button',{name:'開啟選單',exact:true}).click();
        const nav=width<1000 ? page.getByRole('dialog').getByRole('navigation',{name:'全部功能'}) : page.locator('.workspace-sidebar').getByRole('navigation');
        const link=nav.getByRole('link',{name:label,exact:true});
        await browserExpect(link).toHaveAttribute('href',`/merchant/${view}?organization=demo&location=taipei`);
        await link.click();
        await browserExpect(page.getByRole('heading',{name:label,exact:true,level:1})).toBeVisible();
        expect(new URL(page.url()).pathname).toBe(`/merchant/${view}`);
        expect(await page.locator('html').evaluate(node=>node.scrollWidth<=innerWidth)).toBe(true);
      }
    }
    await page.goto(`${base}/api/line-booking/integrated-demo?role=receptionist`);
    await page.goto(`${base}/merchant/bookings?organization=demo&location=taipei`);
    await browserExpect(page.locator('.workspace-sidebar').getByRole('link',{name:'團隊與權限',exact:true})).toHaveCount(0);
    const denied=await page.goto(`${base}/merchant/team?organization=demo&location=taipei`);
    expect(denied?.status()).toBe(403);
  } finally {await browser.close();}
},120000);

async function localizedDraft(page:Page,dialog:Locator) {
  await waitForSkillCatalog(dialog);
  const values=()=>dialog.locator('input:not([type=file])').evaluateAll(nodes=>nodes.map(node=>({value:(node as HTMLInputElement).value,checked:(node as HTMLInputElement).checked})));
  const before=await values();
  for(const locale of ['en','vi','zh-TW'] as const){await chooseLanguage(dialog,locale);await page.waitForLoadState('networkidle');expect(await values()).toEqual(before);}
  for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:844});expect(await dialog.evaluate(node=>node.scrollWidth<=node.clientWidth)).toBe(true);}
  await page.setViewportSize({width:390,height:844});
}

it.skipIf(!process.env.UNIFIED_UI_TEST_URL || !process.env.UNIFIED_TEST_DATABASE_URL)('merchant skill catalog creates, selects, retries and retains multilingual staff drafts',async()=>{
  const {prisma}=await import('../src/server/database/prisma');
  const base=process.env.UNIFIED_UI_TEST_URL!;
  const marker=`Skill mobile ${Date.now()}`;
  const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
  const page=await browser.newPage({locale:'zh-TW',viewport:{width:390,height:844}});
  let staffId:string|undefined,skillId:string|undefined,serviceId:string|undefined,locationServiceId:string|undefined;
  try{
    await page.goto(`${base}/api/line-booking/integrated-demo?role=owner`);
    await page.goto(`${base}/merchant/staff?organization=demo&location=taipei`);
    for(const width of [320,390,768,1440]){
      await page.setViewportSize({width,height:844});
      expect(await page.locator('.merchant-staff-toolbar').evaluate(node=>{
        const centers=Array.from(node.children).map(child=>{const rect=child.getBoundingClientRect();return rect.top+rect.height/2;});
        return Math.max(...centers)-Math.min(...centers)<2;
      })).toBe(true);
    }
    await page.setViewportSize({width:390,height:844});
    await page.getByRole('button',{name:'新增服務人員',exact:true}).click();
    let dialog=page.getByRole('dialog');
    await dialog.getByLabel('顯示名稱',{exact:true}).fill(marker);
    await page.keyboard.press('Escape');
    await page.getByRole('button',{name:'技能項目',exact:true}).click();
    dialog=page.getByRole('dialog');
    await dialog.getByLabel('技能名稱',{exact:true}).fill(marker);
    await dialog.getByLabel('搜尋技能',{exact:true}).fill(marker);
    await browserExpect(dialog.getByText('沒有符合的技能，請調整搜尋文字',{exact:true})).toBeVisible();
    await localizedDraft(page,dialog);
    await page.route('**/api/merchant/staff/skills?**',route=>route.fulfill({status:503,json:{error:{message:'建立資料失敗。'}}}));
    await dialog.getByRole('button',{name:'新增技能',exact:true}).click();
    await browserExpect(dialog.getByRole('alert')).toBeVisible();
    await browserExpect(dialog.getByLabel('技能名稱',{exact:true})).toHaveValue(marker);
    await page.unroute('**/api/merchant/staff/skills?**');
    const added=page.waitForResponse(r=>r.url().includes('/staff/skills?')&&r.request().method()==='POST');
    await dialog.getByRole('button',{name:'新增技能',exact:true}).click();
    const addResponse=await added;expect(addResponse.status()).toBe(201);skillId=(await addResponse.json()).data.id;
    await browserExpect(dialog.locator('.merchant-skill-catalog li')).toHaveText([marker]);
    await browserExpect(dialog.getByRole('status')).toContainText('技能已新增');
    await dialog.getByLabel('技能名稱',{exact:true}).fill(marker.toUpperCase());
    await dialog.getByRole('button',{name:'新增技能',exact:true}).click();
    await browserExpect(dialog.getByRole('alert')).toContainText('已有相同名稱');
    await page.keyboard.press('Escape');
    await page.getByRole('button',{name:'新增服務人員',exact:true}).click();
    dialog=page.getByRole('dialog');
    await browserExpect(dialog.getByLabel('顯示名稱',{exact:true})).toHaveValue(marker);
    await dialog.getByRole('checkbox',{name:marker,exact:true}).check();
    await localizedDraft(page,dialog);
    await page.screenshot({path:'.dev-logs/staff-skills-mobile-20261026.png'});
    const created=page.waitForResponse(r=>r.url().includes('/merchant/staff?')&&r.request().method()==='POST');
    await dialog.getByRole('button',{name:'儲存',exact:true}).click();
    const createdResponse=await created;expect(createdResponse.status()).toBe(201);staffId=(await createdResponse.json()).data.id;
    await browserExpect(dialog).toHaveCount(0);
    await page.getByLabel('搜尋服務人員',{exact:true}).fill(marker);
    await page.getByRole('button',{name:`人員詳細資料 ${marker}`,exact:true}).click();
    dialog=page.getByRole('dialog');
    await browserExpect(dialog.getByRole('checkbox',{name:marker,exact:true})).toBeChecked();
    await dialog.getByRole('checkbox',{name:marker,exact:true}).uncheck();
    await localizedDraft(page,dialog);
    await page.keyboard.press('Escape');
    await page.getByRole('button',{name:`人員詳細資料 ${marker}`,exact:true}).click();
    await browserExpect(dialog.getByRole('checkbox',{name:marker,exact:true})).not.toBeChecked();
    await page.route('**/api/merchant/staff/skills?**',route=>route.fulfill({status:503,json:{error:{message:'設定失敗。'}}}));
    await dialog.getByRole('button',{name:'儲存技能',exact:true}).click();
    await browserExpect(dialog.getByRole('alert')).toBeVisible();
    expect((await prisma.staff_profiles.findUniqueOrThrow({where:{id:staffId}})).skills).toEqual([marker]);
    await page.unroute('**/api/merchant/staff/skills?**');
    await dialog.getByRole('button',{name:'儲存技能',exact:true}).click();
    await browserExpect(dialog.getByRole('status')).toContainText('技能已儲存');
    expect((await prisma.staff_profiles.findUniqueOrThrow({where:{id:staffId}})).skills).toEqual([]);
    await page.reload();
    await page.getByLabel('搜尋服務人員',{exact:true}).fill(marker);
    await page.getByRole('button',{name:`人員詳細資料 ${marker}`,exact:true}).click();
    await browserExpect(page.getByRole('checkbox',{name:marker,exact:true})).not.toBeChecked();
    await page.keyboard.press('Escape');
    const {createApplicationSession,resolveSessionToken}=await import('../src/server/auth/session');
    const {resolveMerchantContext}=await import('../src/server/merchant/context');
    const {createMerchantService}=await import('../src/server/merchant/management');
    const material=await createApplicationSession({profileId:'33333333-3333-4333-8333-333333333301'});
    const context=await resolveMerchantContext({session:(await resolveSessionToken(material.sessionToken))!,organizationSlug:'demo',locationSlug:'taipei'});
    const service=await createMerchantService({context,name:marker,variantName:'QA',categoryName:'',description:'',durationMinutes:30,priceMinor:10000,preBufferMinutes:0,postBufferMinutes:0,requestId:marker});
    serviceId=service.serviceId;locationServiceId=service.locationServiceId;
    const variantId=(await prisma.location_services.findUniqueOrThrow({where:{id:locationServiceId}})).service_variant_id;
    await page.goto(`${base}/merchant/services?organization=demo&location=taipei`);
    await page.getByLabel('搜尋服務',{exact:true}).fill(marker);
    await page.getByRole('button',{name:`服務詳細資料 ${marker} QA`,exact:true}).click();
    dialog=page.getByRole('dialog');
    await dialog.getByRole('checkbox',{name:marker,exact:true}).check();
    await dialog.locator('[name=preBufferMinutes]').fill('13');
    await localizedDraft(page,dialog);
    await page.route('**/api/merchant/services?**',route=>route.fulfill({status:503,json:{error:{message:'設定失敗。'}}}));
    await dialog.getByRole('button',{name:'儲存服務技能',exact:true}).click();
    await browserExpect(dialog.getByRole('alert')).toBeVisible();
    await browserExpect(dialog.getByRole('checkbox',{name:marker,exact:true})).toBeChecked();
    expect((await prisma.location_services.findUniqueOrThrow({where:{id:locationServiceId}})).required_skills).toEqual([]);
    await page.unroute('**/api/merchant/services?**');
    await dialog.getByRole('button',{name:'儲存服務技能',exact:true}).click();
    await browserExpect(dialog.getByRole('status')).toContainText('服務技能已儲存');
    await browserExpect(dialog.getByText('暫無符合資格的人員',{exact:true})).toBeVisible();
    await browserExpect(dialog.locator('[name=preBufferMinutes]')).toHaveValue('13');
    expect((await prisma.location_services.findUniqueOrThrow({where:{id:locationServiceId}})).required_skills).toEqual([marker]);
    await page.screenshot({path:'.dev-logs/service-skill-requirements-mobile.png'});
    const customer=await browser.newPage({locale:'zh-TW',viewport:{width:390,height:844},isMobile:true,hasTouch:true});
    await customer.goto(`${base}/book/demo/taipei`);
    await customer.locator(`[data-service-card="${variantId}"]`).click();
    await customer.getByRole('button',{name:'下一步',exact:true}).click();
    await browserExpect(customer.getByText('暫無符合資格的人員',{exact:true})).toBeVisible();
    await browserExpect(customer.getByRole('button',{name:'下一步',exact:true})).toBeDisabled();
    await page.bringToFront();
    await page.goto(`${base}/merchant/staff?organization=demo&location=taipei`);
    await page.getByLabel('搜尋服務人員',{exact:true}).fill(marker);
    await page.getByRole('button',{name:`人員詳細資料 ${marker}`,exact:true}).click();
    dialog=page.getByRole('dialog');
    await dialog.getByRole('checkbox',{name:marker,exact:true}).check();
    await dialog.getByRole('button',{name:'儲存技能',exact:true}).click();
    await browserExpect(dialog.getByRole('status')).toContainText('技能已儲存');
    await dialog.getByRole('button',{name:'儲存技能',exact:true}).press('Escape');
    await browserExpect(dialog).toHaveCount(0);
    for(const locale of ['en','vi','zh-TW'] as const){
      await chooseLanguage(page,locale);
      for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:844});
        expect(await page.locator('.merchant-person-card').first().evaluate(node=>node.scrollWidth<=node.clientWidth)).toBe(true);
        expect(await page.locator('html').evaluate(node=>node.scrollWidth<=innerWidth)).toBe(true);
      }
    }
    await page.setViewportSize({width:390,height:844});
    await page.screenshot({path:'.dev-logs/staff-cards-mobile.png'});
    await customer.reload();
    await customer.locator(`[data-service-card="${variantId}"]`).click();
    await customer.getByRole('button',{name:'下一步',exact:true}).click();
    const choices=customer.locator('section[aria-labelledby=staff-heading] button');
    await browserExpect(choices).toHaveCount(2);
    await customer.getByRole('button',{name:marker,exact:true}).click();
    for(const locale of ['en','vi','zh-TW'] as const){await chooseLanguage(customer,locale);await browserExpect(customer.getByRole('button',{name:marker,exact:true})).toHaveAttribute('aria-pressed','true');}
    await customer.screenshot({path:'.dev-logs/qualified-staff-mobile.png'});
    await customer.close();
  }finally{
    await browser.close();
    if(serviceId)await prisma.services.update({where:{id:serviceId},data:{is_active:false,online_booking_enabled:false}});
    if(locationServiceId)await prisma.location_services.update({where:{id:locationServiceId},data:{is_active:false,required_skills:[]}});
    if(staffId)await prisma.staff_profiles.update({where:{id:staffId},data:{is_active:false,public_visible:false}});
    if(skillId)await prisma.$executeRaw`delete from public.staff_skill_catalog where id=${skillId}::uuid and name=${marker}`;
  }
},180000);

it.skipIf(!process.env.UNIFIED_UI_TEST_URL)('merchant images keep upload inside each photo and retry the same file without clearing forms',async()=>{
  const base=process.env.UNIFIED_UI_TEST_URL!;
  const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
  const page=await browser.newPage({locale:'zh-TW',viewport:{width:390,height:844}});
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  try{
    await page.goto(`${base}/api/line-booking/integrated-demo?role=owner`);
    for(const [view,opener,labels] of [
      ['services','服務詳細資料',['上傳服務圖片']],['staff','人員詳細資料',['更新人員照片']],
      ['locations','目前分店',['更新店外觀照']],['settings','品牌與公司資料',['更新品牌封面','更新 Logo']],
    ] as const){
      await page.goto(`${base}/merchant/${view}?organization=demo&location=taipei`);
      await page.getByRole('button',{name:new RegExp(opener)}).first().click();
      const dialog=page.getByRole('dialog');
      if(view==='settings')await dialog.getByRole('button',{name:'品牌圖片',exact:true}).click();
      await waitForSkillCatalog(dialog);
      for(const label of labels){
        const button=dialog.getByRole('button',{name:label,exact:true});
        for(const width of [320,390,768,1440]){
          await page.setViewportSize({width,height:844});
          expect(await button.evaluate(node=>{const rect=node.getBoundingClientRect(),parent=node.parentElement!.getBoundingClientRect();
            return rect.width>=44&&rect.height>=44&&rect.right<=parent.right&&rect.bottom<=parent.bottom&&parent.right-rect.right<=6&&parent.bottom-rect.bottom<=6;})).toBe(true);
        }
        await page.setViewportSize({width:390,height:844});
        const original=await dialog.locator('input:not([type=file])').evaluateAll(nodes=>nodes.map(n=>(n as HTMLInputElement).value));
        for(let attempt=0;attempt<2;attempt++){
          const chooser=page.waitForEvent('filechooser');await button.click();
          const response=page.waitForResponse(r=>r.url().includes('/api/merchant/media?'));
          await (await chooser).setFiles({name:'invalid.png',mimeType:'image/png',buffer:Buffer.from('invalid image test')});
          expect((await response).status()).toBe(400);
          await browserExpect(dialog.getByRole('alert')).toContainText('圖片內容無法辨識');
          expect(await dialog.locator('input:not([type=file])').evaluateAll(nodes=>nodes.map(n=>(n as HTMLInputElement).value))).toEqual(original);
        }
        await localizedDraft(page,dialog);
        // The preview-only upload is not persisted. A fresh document separates it
        // from language refreshes that correctly read the original stored image.
        await page.reload();
        await page.getByRole('button',{name:new RegExp(opener)}).first().click();
        if(view==='settings')await dialog.getByRole('button',{name:'品牌圖片',exact:true}).click();
        await waitForSkillCatalog(dialog);
        // Exercise preview and pending UI without claiming an enabled Storage provider.
        const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/Z1sAAAAASUVORK5CYII=','base64');
        const preview=`data:image/png;base64,${png.toString('base64')}`;
        let release!:()=>void;
        const gate=new Promise<void>(resolve=>{release=resolve;});
        await page.route('**/api/merchant/media?**',async route=>{await gate;await route.fulfill({status:201,json:{data:{path:'synthetic-preview',url:preview}}});});
        const chooser=page.waitForEvent('filechooser');await button.click();
        await (await chooser).setFiles({name:'preview.png',mimeType:'image/png',buffer:png});
        await browserExpect(button).toBeDisabled();
        await page.keyboard.press('Escape');
        await browserExpect(dialog).toBeVisible();
        release();
        await browserExpect(dialog.getByRole('status')).toContainText('圖片已更新');
        const photo=button.locator('..').locator('img');
        await browserExpect(photo).toHaveAttribute('src',preview);
        await browserExpect.poll(()=>photo.evaluate(node=>(node as HTMLImageElement).naturalWidth)).toBe(1);
        await page.unroute('**/api/merchant/media?**');
        expect(await dialog.locator('input:not([type=file])').evaluateAll(nodes=>nodes.map(n=>(n as HTMLInputElement).value))).toEqual(original);
        if(view==='staff')await page.screenshot({path:'.dev-logs/staff-photo-mobile-20261026.png'});
      }
    }
    expect(errors).toEqual([]);
  }finally{await browser.close();}
},120000);
