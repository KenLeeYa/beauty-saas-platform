import {chromium, expect as browserExpect} from '@playwright/test';
import {createHash} from 'node:crypto';
import {chooseLanguage} from './language-menu';
import {waitForSkillCatalog} from './skill-catalog';
import {expect, it} from 'vitest';
import {translate} from '../src/lib/i18n/messages';
import type {Locale} from '../src/lib/i18n/locale';
import type {Page} from '@playwright/test';

async function switchLanguage(page: Page, locale: Locale, heading: string) {
  await chooseLanguage(page, locale);
  await page.getByRole('heading', {name: translate(locale, heading), exact: true}).waitFor();
  await page.waitForLoadState('networkidle');
}

async function checkResponsive(page: Page, name: string) {
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({width, height: 844});
    expect(await page.locator('html').evaluate(node => node.scrollWidth <= innerWidth)).toBe(true);
    for (const button of await page.locator('.onboarding-surface header button, .scope-surface header button').all()) {
      expect(await button.evaluate(node => node.getBoundingClientRect().height)).toBeLessThanOrEqual(60);
    }
    if (width < 768) {
      for (const table of await page.locator('.legacy-table').all()) {
        expect(await table.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
      }
    }
    await page.screenshot({path: `.dev-logs/${name}-${width}.png`, fullPage: true});
    await page.screenshot({path: `.dev-logs/${name}-${width}-viewport.png`});
  }
  await page.setViewportSize({width: 390, height: 844});
}

it.skipIf(!process.env.UNIFIED_TEST_UI_URL)(
  'filters swipeable service cards without changing booking selection across languages and steps', async () => {
    const base = process.env.UNIFIED_UI_LAN_URL || process.env.UNIFIED_TEST_UI_URL!;
    const browser = await chromium.launch({executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'});
    const page = await browser.newPage({locale:'zh-TW',viewport:{width:390,height:844},isMobile:true,hasTouch:true});
    const created: {serviceId:string;locationServiceId:string}[] = [];
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    let holdWrites = 0;
    page.on('request', request => {if (request.url().endsWith('/api/public/holds')) holdWrites++;});
    const endpoint = `${base}/api/merchant/services?organization=demo&location=taipei`;
    let headers: Record<string,string> = {};
    const category = `QA 分類 ${Date.now()}`;
    const name = `QA Chăm sóc da chuyên sâu ${Date.now()}`;
    try {
      await page.goto(`${base}/api/line-booking/integrated-demo?role=owner`);
      const csrf = (await page.context().cookies()).find(cookie=>cookie.name==='beauty_csrf')!.value;
      headers = {origin:base,'x-csrf-token':csrf};
      for (const categoryName of [category,'']) {
        const response = await page.request.post(endpoint,{headers,data:{name:`${name} ${created.length}`,variantName:'30 分鐘',categoryName,description:'Synthetic category and long-name regression.',durationMinutes:30,priceMinor:120000}});
        expect(response.status()).toBe(201);
        created.push((await response.json()).data);
      }
      await page.goto(`${base}/book/demo/taipei`);
      const filters = page.getByRole('group',{name:'服務類型',exact:true});
      await browserExpect(filters).toBeVisible();
      const rail = page.locator('[data-service-carousel]');
      const cards = rail.locator('[data-service-card]');
      const original = await cards.count();
      const uncategorizedCount=Number((await filters.getByRole('button',{name:'一般服務',exact:true}).locator('span').innerText()).trim());
      expect(original).toBeGreaterThanOrEqual(5);
      const selected = await rail.locator('[aria-pressed=true]').getAttribute('data-service-card');
      await filters.getByRole('button',{name:category,exact:true}).click();
      await browserExpect(cards).toHaveCount(1);
      expect(await cards.first().innerText()).toContain(`${name} 0`);
      expect(await cards.first().getAttribute('aria-pressed')).toBe('false');
      await cards.first().click();
      const chosen = await cards.first().getAttribute('data-service-card');
      expect(chosen).not.toBe(selected);
      for (const locale of ['en','vi','zh-TW'] as Locale[]) {
        await chooseLanguage(page,locale);
        await browserExpect(page.getByRole('group',{name:translate(locale,'服務類型')}).getByRole('button',{name:category,exact:true})).toHaveAttribute('aria-pressed','true');
        await browserExpect(cards.first()).toHaveAttribute('data-service-card',chosen!);
        await browserExpect(cards.first()).toHaveAttribute('aria-pressed','true');
        await page.getByRole('button',{name:translate(locale,'下一步'),exact:true}).click();
        await page.locator('#staff-heading').waitFor();
        await page.getByRole('button',{name:translate(locale,'上一步'),exact:true}).click();
        await browserExpect(cards).toHaveCount(1);
      }
      await filters.getByRole('button',{name:'一般服務',exact:true}).click();
      await browserExpect(cards).toHaveCount(uncategorizedCount);
      await browserExpect(cards.filter({hasText:`${name} 1`})).toHaveCount(1);
      await filters.getByRole('button',{name:'全部服務',exact:true}).click();
      await browserExpect(cards).toHaveCount(original);
      await browserExpect(rail.locator('[aria-pressed=true]')).toHaveAttribute('data-service-card',chosen!);
      const next = page.getByRole('button',{name:'下一組服務',exact:true});
      // Interrupt smooth scrolling with keyboard navigation, as a user can.
      for (let attempt=0;attempt<3;attempt++) {
        await next.click();
        await browserExpect.poll(()=>rail.evaluate(node=>node.scrollLeft)).toBeGreaterThan(100);
        await cards.first().focus();
        await page.keyboard.press('ArrowRight');
        await browserExpect(cards.nth(1)).toBeFocused();
        expect(await rail.locator('[aria-pressed=true]').getAttribute('data-service-card')).toBe(chosen);
        await page.keyboard.press('Home');
        await browserExpect(cards.first()).toBeFocused();
        await browserExpect.poll(()=>rail.evaluate(node=>node.scrollLeft)).toBeLessThan(2);
        await browserExpect.poll(async () => {
          const card=(await cards.first().boundingBox())!, bounds=(await rail.boundingBox())!;
          return card.x>=bounds.x && card.x+card.width<=bounds.x+bounds.width;
        }).toBe(true);
      }
      const box = (await rail.boundingBox())!;
      const cdp = await page.context().newCDPSession(page);
      const y = Math.round(box.y + 80);
      const startX = Math.round(box.x + box.width * .85);
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:startX,y}]});
      for (let offset=20;offset<=240;offset+=20) {
        await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:startX-offset,y}]});
        await page.waitForTimeout(20);
      }
      await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      await browserExpect.poll(()=>rail.evaluate(node=>node.scrollLeft)).toBeGreaterThan(100);
      expect(await rail.locator('[aria-pressed=true]').getAttribute('data-service-card')).toBe(chosen);
      // Let native touch momentum finish before testing viewport changes and keyboard focus.
      await browserExpect.poll(async () => {
        const left = await rail.evaluate(node=>node.scrollLeft);
        await page.waitForTimeout(150);
        return Math.abs((await rail.evaluate(node=>node.scrollLeft))-left);
      }).toBeLessThan(1);
      await page.emulateMedia({reducedMotion:'reduce'});
      expect(await cards.first().evaluate(node=>getComputedStyle(node).transitionDuration)).toBe('0s');
      for (const [width,height] of [[320,568],[390,844],[430,932],[768,1024],[844,390],[1440,900]]) {
        await page.setViewportSize({width,height});
        await page.locator('#service-heading').focus();
        await cards.first().focus();
        await browserExpect.poll(async () => {
          const bounds = (await cards.first().boundingBox())!;
          const window = (await rail.boundingBox())!;
          return bounds.x >= window.x && bounds.x + bounds.width <= window.x + window.width;
        }).toBe(true);
        expect(await page.locator('html').evaluate(node=>node.scrollWidth<=innerWidth)).toBe(true);
        expect(await cards.first().evaluate(node=>node.scrollWidth<=node.clientWidth)).toBe(true);
        expect((await cards.first().boundingBox())!.width).toBeLessThanOrEqual(360);
        expect(await next.evaluate(node=>node.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
        const railBounds = (await rail.boundingBox())!;
        const continueBounds = (await page.getByRole('button',{name:'下一步',exact:true}).boundingBox())!;
        expect(continueBounds.y).toBeGreaterThanOrEqual(railBounds.y + railBounds.height);
        await page.screenshot({path:`.dev-logs/service-cards-${width}.png`});
      }
      await page.setViewportSize({width:390,height:844});
      await chooseLanguage(page,'vi');
      await page.evaluate(()=>{document.documentElement.style.fontSize='200%';});
      expect(await page.locator('html').evaluate(node=>node.scrollWidth<=innerWidth)).toBe(true);
      expect(await cards.first().evaluate(node=>node.scrollWidth<=node.clientWidth)).toBe(true);
      const railBounds = (await rail.boundingBox())!;
      const continueBounds = (await page.getByRole('button',{name:translate('vi','下一步'),exact:true}).boundingBox())!;
      expect(continueBounds.y).toBeGreaterThanOrEqual(railBounds.y + railBounds.height);
      await page.screenshot({path:'.dev-logs/service-cards-vi-large-text.png',fullPage:true});
      expect(holdWrites).toBe(0);
      expect(errors).toEqual([]);
    } finally {
      for (const service of created) {
        const response = await page.request.patch(endpoint,{headers,data:{locationServiceId:service.locationServiceId,onlineBookingEnabled:false}});
        expect(response.ok()).toBe(true);
      }
      if (created.length && process.env.UNIFIED_TEST_DATABASE_URL) {
        const {prisma} = await import('../src/server/database/prisma');
        await prisma.services.updateMany({where:{id:{in:created.map(service=>service.serviceId)}},data:{is_active:false}});
      }
      await browser.close();
    }
  }, 120_000,
);

it.skipIf(!process.env.UNIFIED_TEST_UI_URL)(
  'pages booking steps and opens a recoverable accessible time sheet without losing selections', async () => {
    const base = process.env.UNIFIED_UI_LAN_URL || process.env.UNIFIED_TEST_UI_URL!;
    const browser = await chromium.launch({executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'});
    const page = await browser.newPage({locale: 'zh-TW', viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true});
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    let holdPosts = 0;
    page.on('request', request => {if (request.url().endsWith('/api/public/holds') && request.method() === 'POST') holdPosts++;});
    const dialog = page.getByRole('dialog');
    const dates = page.locator('[data-date]').filter({hasText: '可查詢'});
    const times = dialog.getByRole('button').filter({hasText: /^\d{2}:\d{2}$/});
    try {
      await page.goto(`${base}/book/demo/taipei`);
      expect(await page.locator('#service-heading').isVisible()).toBe(true);
      expect(await page.locator('#date-heading').isVisible()).toBe(false);
      await page.getByRole('button', {name: '下一步', exact: true}).click();
      await page.locator('#staff-heading').waitFor();
      const staff = page.locator('section[aria-labelledby=staff-heading] button').last();
      await staff.click();
      const staffName = await staff.innerText();
      await page.getByRole('button', {name: '下一步', exact: true}).click();
      await page.locator('#date-heading').waitFor();
      await page.getByRole('button', {name: '上一步', exact: true}).click();
      expect(await page.getByRole('button', {name: staffName, exact: true}).getAttribute('aria-pressed')).toBe('true');
      await page.getByRole('button', {name: '由系統安排', exact: true}).click();
      await page.getByRole('button', {name: '下一步', exact: true}).click();
      let availableDate: string | null = null;
      for (let month = 0; month < 2 && !availableDate; month++) {
        for (const day of await page.locator('[data-date]:enabled').all()) {
          const availability = page.waitForResponse(r => r.url().endsWith('/api/public/availability'));
          await day.click();
          const response = await availability;
          expect(response.status()).toBe(200);
          const payload = await response.json() as {data:{slots:unknown[]}};
          if (payload.data.slots.length > 1) availableDate = await day.getAttribute('data-date');
          await dialog.getByRole('button', {name:'關閉',exact:true}).click();
          if (availableDate) break;
        }
        if (!availableDate) await page.getByRole('button', {name:'下一個月',exact:true}).click();
      }
      expect(availableDate, 'The retained rehearsal data must have two real available times').not.toBeNull();
      const availableDay = page.locator(`[data-date="${availableDate}"]`);
      let releaseLate!: () => void;
      const late = new Promise<void>(resolve => {releaseLate = resolve;});
      await page.route('**/api/public/availability', async route => {
        await late;
        await route.fulfill({status:503,json:{error:{message:'Late response must be ignored'}}}).catch(()=>undefined);
      });
      const loading = page.waitForRequest(request => request.url().endsWith('/api/public/availability'));
      await dates.first().click(); await loading;
      await dialog.getByRole('status').waitFor();
      await dialog.getByRole('button',{name:'關閉',exact:true}).click();
      await dialog.waitFor({state:'hidden'});
      await page.unroute('**/api/public/availability');
      await page.route('**/api/public/availability', route => route.fulfill({json:{data:{slots:[]}}}));
      await availableDay.click();
      await dialog.getByText('當日已額滿或暫停預約，請選擇其他日期。',{exact:true}).waitFor();
      releaseLate();
      expect(await dialog.getByRole('button',{name:'確認時間',exact:true}).isDisabled()).toBe(true);
      expect(await dialog.getByRole('alert').count()).toBe(0);
      await dialog.getByRole('button',{name:'關閉',exact:true}).click();
      await page.unroute('**/api/public/availability');
      await page.route('**/api/public/availability', route => route.fulfill({status:503, json:{error:{message:'時段查詢失敗。'}}}));
      await availableDay.click();
      await dialog.getByRole('alert').waitFor();
      expect(await dialog.getByRole('button', {name:'確認時間', exact:true}).isDisabled()).toBe(true);
      await chooseLanguage(dialog, 'en');
      await dialog.getByRole('heading', {name:'Choose time', exact:true}).waitFor();
      expect(await dialog.getByRole('alert').innerText()).toContain('Could not load available times.');
      await page.unroute('**/api/public/availability');
      const ready = page.waitForResponse(r => r.url().endsWith('/api/public/availability'));
      await dialog.getByRole('button', {name:'Retry', exact:true}).click();
      expect((await ready).status()).toBe(200);
      await times.first().waitFor();
      await times.first().click();
      const time = await times.first().innerText();
      expect(holdPosts).toBe(0);
      await chooseLanguage(dialog, 'vi');
      await dialog.getByRole('heading', {name:translate('vi', '選擇時間'),exact:true}).waitFor();
      expect(await dialog.getByRole('button', {name:time,exact:true}).getAttribute('aria-pressed')).toBe('true');
      for (const [width,height] of [[320,568],[390,844],[430,932],[1280,800]]) {
        await page.setViewportSize({width,height});
        await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
        const bounds = await dialog.boundingBox();
        const confirm = await dialog.getByRole('button', {name:translate('vi','確認時間'),exact:true}).boundingBox();
        expect(bounds).not.toBeNull(); expect(confirm).not.toBeNull();
        expect(bounds!.x).toBeGreaterThanOrEqual(0); expect(bounds!.y).toBeGreaterThanOrEqual(0);
        expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width + 1);
        expect(confirm!.y + confirm!.height).toBeLessThanOrEqual(height);
        expect(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
        expect(await page.evaluate(() => document.querySelector('[role=dialog]')?.contains(document.activeElement))).toBe(true);
        await page.screenshot({path: `.dev-logs/booking-time-sheet-${width}.png`});
      }
      await page.keyboard.press('Escape');
      await dialog.waitFor({state:'hidden'});
      expect(await page.locator('[data-date][aria-pressed=true]').evaluate(node=>node===document.activeElement)).toBe(true);
      expect(holdPosts).toBe(0);
      await chooseLanguage(page, 'zh-TW');
      await page.getByRole('heading', {name:'選擇日期與時間',exact:true}).waitFor();
      await page.locator('[data-date][aria-pressed=true]').click();
      await times.first().waitFor();
      await times.first().click();
      await page.route('**/api/public/holds', async route => {
        if (route.request().method() === 'POST') await route.fulfill({status:409,json:{error:{message:'時段保留失敗。'}}});
        else await route.continue();
      });
      await dialog.getByRole('button', {name:'確認時間',exact:true}).click();
      await dialog.getByRole('alert').waitFor();
      expect(await dialog.getByRole('alert').innerText()).toContain('時段保留失敗。');
      expect(await page.locator('#details-heading').isVisible()).toBe(false);
      await page.unroute('**/api/public/holds');
      await dialog.getByRole('button', {name:'確認時間',exact:true}).click();
      await page.locator('#details-heading').waitFor();
      const details = page.locator('section[aria-labelledby=details-heading]');
      await details.getByLabel('姓名', {exact:true}).fill('分頁注音測試');
      await details.getByLabel('手機', {exact:true}).fill('0912345678');
      await page.getByRole('button', {name:'上一步',exact:true}).click();
      await page.locator('[data-date][aria-pressed=true]').click();
      await times.first().waitFor();
      expect(await times.first().innerText()).toBe(time);
      await times.nth(1).click();
      await dialog.getByRole('button', {name:'確認時間',exact:true}).click();
      await page.locator('#details-heading').waitFor();
      expect(await details.getByLabel('姓名', {exact:true}).inputValue()).toBe('分頁注音測試');
      expect(await details.getByLabel('手機', {exact:true}).inputValue()).toBe('0912345678');
      // Changing service releases the synthetic hold; it must not create a booking.
      for (let i=0;i<3;i++) await page.getByRole('button',{name:'上一步',exact:true}).click();
      await page.locator('[data-service-card][aria-pressed=false]').first().click();
      expect(errors).toEqual([]);
    } finally {await browser.close();}
  }, 120_000,
);

it.skipIf(!process.env.UNIFIED_TEST_UI_URL || !process.env.UNIFIED_TEST_DATABASE_URL)(
  'preserves applicant drafts, retries and authorized scope selections across three languages', async () => {
    const {prisma} = await import('../src/server/database/prisma');
    const {hash} = await import('bcryptjs');
    const base = process.env.UNIFIED_UI_LAN_URL || process.env.UNIFIED_TEST_UI_URL!;
    const run = Date.now().toString();
    const password = 'LocalLocaleQA123!';
    const profile = await prisma.profiles.create({data: {
      email: `applicant-locale-${run}@example.test`, display_name: '測試申請人 Nguyễn',
      password_hash: await hash(password, 10), is_active: true,
    }});
    const browser = await chromium.launch({executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'});
    const page = await browser.newPage({locale: 'zh-TW', viewport: {width: 390, height: 844}});
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    let extraOrganization: string | undefined;
    let extraLocation: string | undefined;
    const formDraft = () => page.locator('main form :is(input,select,textarea)').evaluateAll(nodes => nodes.map(n => (n as HTMLInputElement).value));
    const heading = '申請 Beauty SaaS 商家空間';
    try {
      await page.goto(`${base}/?next=/onboarding`);
      await page.locator('input[type=email]').fill(profile.email);
      await page.locator('input[type=password]').fill(password);
      await page.getByRole('button', {name: '登入', exact: true}).click();
      await page.waitForURL('**/onboarding');
      for (const [label, value] of Object.entries({
        '商家名稱': `測試美業 Tiệm làm đẹp ${run}`, '聯絡人': '測試申請人 Nguyễn',
        '電子郵件': profile.email, '聯絡電話': '0912345678', '商家網址代碼': `locale-${run}`,
        '分店名稱': '測試第一分店 Chi nhánh', '分店地址': '台北市測試路 123 號', '申請備註': '保留注音與 tiếng Việt draft',
      })) await page.getByLabel(label, {exact: true}).fill(value);
      await page.getByLabel('產業類型').selectOption('NAIL');
      const draft = await formDraft();
      await page.getByLabel('商家網址代碼', {exact:true}).fill('x');
      const invalidDraft = await formDraft();
      for (const locale of ['vi', 'en', 'zh-TW'] as Locale[]) {
        await switchLanguage(page, locale, heading);
        const pending = page.waitForResponse(r => r.url().endsWith('/api/onboarding/application') && r.request().method() === 'POST');
        await page.getByRole('button', {name:translate(locale,'儲存草稿'),exact:true}).click();
        const response = await pending;
        expect(response.status()).toBe(400);
        const payload = await response.json();
        expect(payload.error.code).toBe('BAD_REQUEST');
        expect(payload.error.message).toBe(translate(locale, '請檢查輸入內容。'));
        expect(payload.error.details.issues).toContainEqual({path:'desiredSlug',message:translate(locale,'商家網址至少需要 3 個字元。')});
        await expect.poll(() => page.locator('main [role=alert]').innerText()).toContain(translate(locale,'商家網址至少需要 3 個字元。'));
        expect(await formDraft()).toEqual(invalidDraft);
        expect(await prisma.merchant_applications.count({where:{applicant_profile_id:profile.id}})).toBe(0);
      }
      for (const locale of ['en', 'vi', 'zh-TW'] as Locale[]) {
        await switchLanguage(page,locale,heading);
        expect(await page.locator('main [role=alert]').innerText()).toContain(translate(locale,'商家網址至少需要 3 個字元。'));
        expect(await formDraft()).toEqual(invalidDraft);
        if (locale === 'vi') await checkResponsive(page,'applicant-validation-vi');
      }
      await page.getByLabel('商家網址代碼', {exact:true}).fill(`locale-${run}`);
      for (const locale of ['en','vi','zh-TW'] as Locale[]) {
        await switchLanguage(page,locale,heading);
        expect(await formDraft()).toEqual(draft);
        expect(await prisma.merchant_applications.count({where:{applicant_profile_id:profile.id}})).toBe(0);
      }
      await switchLanguage(page,'vi',heading);
      await checkResponsive(page,'applicant-draft-vi');
      await page.route('**/api/onboarding/application', route => route.fulfill({status:503,json:{error:{message:'商家申請儲存失敗。'}}}));
      await page.getByRole('button',{name:translate('vi','儲存草稿'),exact:true}).click();
      await page.locator('main [role=alert]').waitFor();
      for (const locale of ['en','zh-TW','vi'] as Locale[]) {
        await switchLanguage(page,locale,heading);
        expect(await formDraft()).toEqual(draft);
        expect(await page.locator('main [role=alert]').innerText()).toBe(translate(locale,'商家申請儲存失敗。'));
      }
      await page.unroute('**/api/onboarding/application');
      await page.getByRole('button',{name:translate('vi','儲存草稿'),exact:true}).click();
      await page.waitForURL('**/onboarding/edit');
      await page.reload();
      expect(await formDraft()).toEqual(draft);
      const saved = await prisma.merchant_applications.findFirstOrThrow({where:{applicant_profile_id:profile.id}});
      expect(saved.status).toBe('DRAFT'); expect(saved.industry_type).toBe('NAIL');
      expect(saved.applicant_note).toBe('保留注音與 tiếng Việt draft');
      await page.getByLabel(translate('vi','申請備註'),{exact:true}).fill('修改後 vẫn giữ draft');
      const edited = await formDraft();
      for (const locale of ['zh-TW','en','vi'] as Locale[]) {
        await switchLanguage(page,locale,heading); expect(await formDraft()).toEqual(edited);
        expect((await prisma.merchant_applications.findUniqueOrThrow({where:{id:saved.id}})).version).toBe(saved.version);
      }
      await page.getByRole('button',{name:translate('vi','送出申請'),exact:true}).click();
      await page.waitForURL('**/onboarding/status');
      for (const locale of ['en','zh-TW','vi'] as Locale[]) {
        await switchLanguage(page,locale,'平台正在處理申請');
        expect(await page.locator('main form').count()).toBe(0);
      }
      const submitted = await prisma.merchant_applications.findUniqueOrThrow({where:{id:saved.id}});
      expect(submitted.status).toBe('SUBMITTED'); expect(submitted.applicant_note).toBe('修改後 vẫn giữ draft');
      expect(submitted.version).toBe(saved.version+1);
      await checkResponsive(page,'applicant-status-vi');

      const demo = await prisma.organizations.findUniqueOrThrow({where:{slug:'demo'}});
      const second = await prisma.organizations.create({data:{
        name:'測試多語組織 LongBusinessNameForMobileWrapping',business_name:'Synthetic locale business',slug:`scope-${run}`,
        email:profile.email,phone:'0912345678',status:'ACTIVE',is_test:true,
      }}); extraOrganization=second.id;
      const branch = await prisma.locations.create({data:{organization_id:demo.id,name:'測試長分店名稱 ChiNhanhThuNghiemChoGiaoDienDienThoai',slug:`scope-${run}`,code:`L${run}`,is_active:true}});
      extraLocation=branch.id;
      await prisma.organization_memberships.createMany({data:[demo.id,second.id].map(id=>({organization_id:id,profile_id:profile.id,role:'ORGANIZATION_ADMIN' as const,status:'ACTIVE' as const,all_locations:true}))});
      await page.goto(`${base}/select-organization`);
      const links = () => page.locator('main nav a').evaluateAll(nodes=>nodes.map(n=>({href:n.getAttribute('href'),title:n.querySelector('span span')?.textContent})));
      const organizations = await links(); expect(organizations.length).toBe(2);
      for(const locale of ['zh-TW','en','vi'] as Locale[]) {
        await switchLanguage(page,locale,'選擇商家'); expect(await links()).toEqual(organizations);
        expect(await page.locator('main nav').innerText()).not.toContain('ORGANIZATION_ADMIN');
      }
      await checkResponsive(page,'scope-organizations-vi');
      await page.locator('main nav a').filter({hasText:demo.name}).click();
      await page.waitForURL('**/select-location?organization=demo');
      const branchUrl = page.url(); const branches = await links();
      for(const locale of ['zh-TW','en','vi'] as Locale[]) {
        await switchLanguage(page,locale,'選擇分店'); expect(await links()).toEqual(branches); expect(page.url()).toBe(branchUrl);
      }
      await checkResponsive(page,'scope-locations-vi');
      await page.locator('main nav a[href*="location=taipei"]').click();
      await page.waitForURL('**/merchant/dashboard?organization=demo&location=taipei');
      await page.getByRole('heading',{name:translate('vi','營運總覽'),exact:true}).waitFor();
      await page.goto(`${base}/select-location?organization=not-authorized`);
      await page.waitForURL('**/select-organization');
      expect(await links()).toEqual(organizations);
      expect(errors).toEqual([]);
    } finally {
      await browser.close();
      await prisma.organization_memberships.deleteMany({where:{profile_id:profile.id}});
      if(extraLocation) await prisma.locations.delete({where:{id:extraLocation}});
      if(extraOrganization) await prisma.organizations.delete({where:{id:extraOrganization}});
      await prisma.profiles.update({where:{id:profile.id},data:{is_active:false}});
    }
  }, 150_000,
);

it.skipIf(!process.env.UNIFIED_TEST_UI_URL || !process.env.UNIFIED_TEST_DATABASE_URL)(
  'preserves platform invoice and entitlement drafts across three languages and failed writes', async () => {
    const {prisma} = await import('../src/server/database/prisma');
    const {createApplicationSession} = await import('../src/server/auth/session');
    const admin = await prisma.profiles.findFirstOrThrow({where: {platform_role: 'PLATFORM_ADMIN', is_active: true}});
    const material = await createApplicationSession({profileId: admin.id});
    const base = process.env.UNIFIED_TEST_UI_URL!;
    const org = '11111111-1111-4111-8111-111111111111';
    const beforeInvoices = await prisma.invoices.count({where: {organization_id: org}});
    const beforeOverrides = await prisma.organization_feature_overrides.count({where: {organization_id: org}});
    const browser = await chromium.launch({executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'});
    const context = await browser.newContext({locale: 'zh-TW', viewport: {width: 390, height: 844}});
    await context.addCookies([{name: 'beauty_session', value: material.sessionToken, url: base},
      {name: 'beauty_csrf', value: material.csrfToken, url: base}]);
    const page = await context.newPage();
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    async function draft() {return page.locator('main form :is(input,textarea,select)').evaluateAll(nodes => nodes.map(n => {
      const input = n as HTMLInputElement; return {name: input.name, value: input.value};
    }));}
    try {
      for (const [path, heading] of [
        ['/admin/organizations', 'Beauty SaaS 營運總覽'],
        [`/admin/organizations/${org}`, '商家資料'],
        ['/admin/merchant-applications', '商家申請審核'],
      ]) {
        await page.goto(base + path);
        for (const locale of ['en','vi','zh-TW'] as Locale[]) await switchLanguage(page, locale, heading);
        await switchLanguage(page, 'vi', heading);
        await checkResponsive(page, path.includes('applications') ? 'legacy-review-vi' : path.endsWith(org) ? 'legacy-detail-vi' : 'legacy-overview-vi');
      }
      await page.goto(`${base}/admin/billing`);
      await page.locator('[name=organizationId]').selectOption(org);
      await page.locator('input[name=description]').fill('草稿 hóa đơn draft');
      await page.locator('[name=periodStart]').fill('2026-11-01');
      await page.locator('[name=periodEnd]').fill('2026-11-30');
      await page.locator('[name=dueAt]').fill('2026-11-05');
      await page.locator('[name=subtotal]').fill('123');
      const invoiceDraft = await draft();
      for (const locale of ['zh-TW','en','vi'] as Locale[]) {
        await switchLanguage(page, locale, 'SaaS 帳務'); expect(await draft()).toEqual(invoiceDraft);
      }
      await checkResponsive(page, 'legacy-billing-vi');
      await page.route('**/api/admin/billing', route => route.fulfill({status: 409, json: {error: {message: '帳務操作失敗。'}}}));
      await page.getByRole('button', {name: translate('vi','開立帳單'), exact: true}).click();
      await page.locator('main [role=alert]').waitFor();
      await switchLanguage(page, 'en', 'SaaS 帳務');
      expect(await page.locator('main [role=alert]').innerText()).toBe(translate('en','帳務操作失敗。'));
      expect(await draft()).toEqual(invoiceDraft);
      await page.goto(`${base}/admin/organizations/${org}/features`);
      await page.locator('[name=reason]').fill('保留 quyền lợi draft');
      const featureDraft = await draft();
      for (const locale of ['vi','zh-TW','en'] as Locale[]) {
        await switchLanguage(page, locale, '商家功能權益'); expect(await draft()).toEqual(featureDraft);
      }
      await page.route('**/api/admin/organizations/*/features', route => route.fulfill({status: 409, json: {error: {message: '功能權益更新失敗。'}}}));
      await page.getByRole('button', {name: translate('en','儲存覆寫')}).click();
      await page.locator('main [role=alert]').waitFor();
      await switchLanguage(page, 'vi', '商家功能權益');
      expect(await draft()).toEqual(featureDraft);
      await checkResponsive(page, 'legacy-features-vi');
      expect(await prisma.invoices.count({where: {organization_id: org}})).toBe(beforeInvoices);
      expect(await prisma.organization_feature_overrides.count({where: {organization_id: org}})).toBe(beforeOverrides);
      expect(errors).toEqual([]);
    } finally {await browser.close();}
  }, 120_000,
);

it.skipIf(!process.env.UNIFIED_TEST_UI_URL || !process.env.UNIFIED_TEST_DATABASE_URL)(
  'retains legacy booking holds and contact drafts across languages, retries, reschedules and cancels', async () => {
    const {prisma} = await import('../src/server/database/prisma');
    const base = process.env.UNIFIED_UI_LAN_URL || process.env.UNIFIED_TEST_UI_URL!;
    const org = '11111111-1111-4111-8111-111111111111';
    const phone = `+8869${String(Date.now()).slice(-8)}`;
    const customer = await prisma.customers.create({data: {organization_id: org, display_name: 'Synthetic locale customer', deposit_mode: 'EXEMPT'}});
    await prisma.customer_contacts.create({data: {organization_id: org, customer_id: customer.id, contact_type: 'PHONE', value: phone, normalized_value: phone, is_primary: true}});
    const browser = await chromium.launch({executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'});
    const page = await browser.newPage({locale: 'zh-TW', viewport: {width: 390, height: 844}});
    const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
    const tokens: string[] = [];
    let resourceId: string | undefined;
    let holdRequests = 0;
    let bookingSessionToken = '';
    page.on('request', request => {
      if (request.url().endsWith('/api/public/availability')) {
        bookingSessionToken = request.headers()['x-booking-session'] ?? '';
      }
    });
    page.on('request', req => {if(req.url().endsWith('/api/public/holds')) holdRequests++;});
    const dates = () => page.locator('section[aria-labelledby="date-heading"] section[aria-label] button').filter({hasText: '可查詢'});
    const timeDialog = () => page.getByRole('dialog');
    const times = () => timeDialog().getByRole('button').filter({hasText: /^\d{2}:\d{2}$/});
    const heldSummary = () => page.locator('aside dd').nth(2);
    async function chooseTime() {
      const policy=await prisma.location_booking_policies.findUniqueOrThrow({where:{location_id:'22222222-2222-4222-8222-222222222221'}});
      const safeStart=Date.now()+(policy.cancellation_cutoff_hours+24)*60*60*1000;
      // A retained demo can fill the remaining days of a month; continue through the calendar.
      for(let month=0;month<3;month++) {
        for (let i=0;i<Math.min(await dates().count(),12);i++) {
          const ready=page.waitForResponse(r=>r.url().endsWith('/api/public/availability'));
          await dates().nth(i).click();
          const response=await ready;
          expect(response.status()).toBe(200);
          const availability=await response.json() as {data:{slots:Array<{startsAt:string}>}};
          await browserExpect(times()).toHaveCount(availability.data.slots.length);
          const usable=availability.data.slots.findIndex(slot=>new Date(slot.startsAt).getTime()>safeStart);
          if(usable>=0 && availability.data.slots.length>1){await times().nth(usable).click(); await timeDialog().getByRole('button',{name:'確認時間',exact:true}).click(); await page.locator('#details-heading').waitFor(); return;}
          await timeDialog().getByRole('button',{name:'關閉',exact:true}).click();
        }
        const next=page.getByRole('button',{name:'下一個月',exact:true});
        if(await next.isDisabled()) break;
        await next.click();
      }
      throw Error('No synthetic booking availability');
    }
    try {
      // Retained demo resources may have no weekly schedule; never rewrite their configuration.
      const resource=await prisma.resources.create({data:{
        organization_id:org,location_id:'22222222-2222-4222-8222-222222222221',
        resource_type_id:'88888888-8888-4888-8888-888888888801',name:`語系驗證療程室 ${Date.now()}`,
      }});
      resourceId=resource.id;
      await prisma.resource_availability_rules.createMany({data:Array.from({length:7},(_,day_of_week)=>({
        organization_id:org,resource_id:resource.id,day_of_week,
        starts_at:new Date('1970-01-01T10:00:00Z'),ends_at:new Date('1970-01-01T20:00:00Z'),
      }))});
      await page.goto(`${base}/book/demo/taipei`);
      await page.getByRole('button',{name:'下一步',exact:true}).click();
      await page.getByRole('button',{name:'下一步',exact:true}).click();
      await chooseTime();
      const details = page.locator('section[aria-labelledby="details-heading"]');
      await details.locator('input').nth(0).fill('Synthetic locale customer');
      await details.locator('input').nth(1).fill(phone);
      await details.locator('input[type=email]').fill('locale-test@example.test');
      await details.locator('textarea').fill('注音與 tiếng Việt draft');
      await details.locator('input[type=checkbox]').first().check();
      const selected = await heldSummary().innerText();
      const selectedDate = await page.locator('button[data-date][aria-pressed=true]').getAttribute('data-date');
      const calls = holdRequests;
      for (const locale of ['en','vi','zh-TW'] as Locale[]) {
        await switchLanguage(page,locale,'填寫預約資料');
        expect(await details.locator('input').first().inputValue()).toBe('Synthetic locale customer');
        expect(await details.locator('textarea').inputValue()).toBe('注音與 tiếng Việt draft');
        expect(await details.locator('input[type=checkbox]').first().isChecked()).toBe(true);
        expect(await heldSummary().innerText()).toBe(selected);
        expect(await page.locator('button[data-date][aria-pressed=true]').getAttribute('data-date')).toBe(selectedDate);
        expect(holdRequests).toBe(calls);
        expect(await prisma.bookings.count({where:{customer_id:customer.id}})).toBe(0);
      }
      for (const action of ['availability','hold','release','confirm']) {
        const chosenDate = await page.locator('button[data-date][aria-pressed=true]').getAttribute('data-date');
        if (action === 'hold') {
          await page.getByRole('button',{name:'上一步',exact:true}).click();
          await page.locator(`button[data-date="${chosenDate}"]`).click();
          await times().first().waitFor();
          await times().first().click();
        }
        // Expire only this test's real session and hold, as the production TTL does.
        const expiredToken = bookingSessionToken;
        expect(expiredToken).not.toBe('');
        const expiredSession = await prisma.public_booking_sessions.update({
          where:{token_hash:createHash('sha256').update(expiredToken).digest('hex')},
          data:{status:'EXPIRED',expires_at:new Date(Date.now()-1000)},
        });
        await prisma.booking_holds.updateMany({where:{public_booking_session_id:expiredSession.id,status:'ACTIVE'},data:{created_at:new Date(Date.now()-60_000),expires_at:new Date(Date.now()-1000)}});
        await prisma.$queryRaw`select beauty_private.expire_booking_holds()`;
        if (action === 'confirm') await page.getByRole('button',{name:'送出預約',exact:true}).click();
        else if (action === 'hold') await timeDialog().getByRole('button',{name:'確認時間',exact:true}).click();
        else {
          await page.getByRole('button',{name:'上一步',exact:true}).click();
          if (action === 'release') {
            await page.getByRole('button',{name:'上一步',exact:true}).click();
            await page.locator('section[aria-labelledby=staff-heading] button').last().click();
          } else await page.locator(`button[data-date="${chosenDate}"]`).click();
        }
        await browserExpect(timeDialog()).toBeHidden();
        await browserExpect(page.getByRole('alert').filter({hasText:'預約工作階段已失效。'})).toBeVisible();
        for (const locale of ['en','vi','zh-TW'] as Locale[]) {
          await switchLanguage(page,locale,'選擇日期與時間');
        }
        await chooseTime();
        expect(bookingSessionToken).not.toBe(expiredToken);
        expect(await details.locator('input').first().inputValue()).toBe('Synthetic locale customer');
        expect(await details.locator('textarea').inputValue()).toBe('注音與 tiếng Việt draft');
        expect(await details.locator('input[type=checkbox]').first().isChecked()).toBe(true);
      }
      await checkResponsive(page,'legacy-booking-zh');
      await switchLanguage(page,'vi','填寫預約資料');
      await checkResponsive(page,'legacy-booking-vi');
      await page.getByRole('button',{name:translate('vi','送出預約'),exact:true}).click();
      await page.waitForURL('**/booking/*'); tokens.push(decodeURIComponent(new URL(page.url()).pathname.split('/').pop()!));
      const original = await prisma.bookings.findFirstOrThrow({where:{customer_id:customer.id}});
      expect(original.status).toBe('CONFIRMED');
      for(const locale of ['en','zh-TW','vi'] as Locale[]) await switchLanguage(page,locale,'預約內容');
      expect((await prisma.bookings.findUniqueOrThrow({where:{id:original.id}})).version).toBe(original.version);
      await checkResponsive(page,'legacy-tracking-vi');
      await page.getByRole('link',{name:translate('vi','改期'),exact:true}).click();
      await switchLanguage(page,'zh-TW','選擇新的預約日期');
      await page.route('**/api/public/availability',route=>route.fulfill({status:503,json:{error:{message:'時段查詢失敗。'}}}));
      await dates().nth(2).click(); await timeDialog().getByRole('alert').waitFor();
      await chooseLanguage(timeDialog(),'en');
      await timeDialog().getByRole('heading',{name:translate('en','選擇時間'),exact:true}).waitFor();
      expect(await timeDialog().getByRole('alert').innerText()).toContain(translate('en','時段查詢失敗。'));
      await page.unroute('**/api/public/availability');
      const retried = page.waitForResponse(r => r.url().endsWith('/api/public/availability'));
      await page.getByRole('button',{name:'Retry',exact:true}).click();
      expect((await retried).status()).toBe(200);
      await page.waitForLoadState('networkidle');
      if (await times().count()) {
        await times().last().click();
        await timeDialog().getByRole('button',{name:'Confirm time',exact:true}).click();
      }
      else {
        await timeDialog().getByRole('button',{name:'Close',exact:true}).click();
        await switchLanguage(page,'zh-TW','選擇新的預約日期');
        await chooseTime();
      }
      await page.locator('#details-heading').waitFor();
      const heldText=await heldSummary().innerText();
      for(const locale of ['vi','zh-TW','en'] as Locale[]) {
        await switchLanguage(page,locale,'確認改期');
        expect(await heldSummary().innerText()).toBe(heldText);
      }
      await page.getByRole('button',{name:translate('en','確認改期'),exact:true}).click();
      await page.waitForURL('**/booking/*'); tokens.push(decodeURIComponent(new URL(page.url()).pathname.split('/').pop()!));
      expect((await prisma.bookings.findUniqueOrThrow({where:{id:original.id}})).status).toBe('RESCHEDULED');
      page.on('dialog',dialog=>dialog.accept());
      await page.getByRole('button',{name:translate('en','取消預約'),exact:true}).click();
      await page.getByRole('heading',{name:translate('en','已取消'),exact:true}).waitFor();
      expect(await prisma.bookings.count({where:{customer_id:customer.id,status:'CONFIRMED'}})).toBe(0);
      expect(errors).toEqual([]);
    } finally {
      for(const token of tokens) await page.request.post(`${base}/api/public/bookings/cancel`,{headers:{Origin:base},data:{trackingToken:token,reason:'Synthetic locale QA cleanup'}}).catch(()=>undefined);
      await prisma.customers.update({where:{id:customer.id},data:{is_active:false}});
      if(resourceId) await prisma.resources.update({where:{id:resourceId},data:{is_active:false}});
      await browser.close();
    }
  }, 120_000,
);

it.skipIf(!process.env.UNIFIED_TEST_UI_URL)(
  'negotiates SSR language, preserves login drafts, persists overrides and recovers failed saves',
  async () => {
    const base = process.env.UNIFIED_TEST_UI_URL!;
    const browser = await chromium.launch({executablePath:
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', headless: true});
    try {
      for (const [device, expected] of [['en-US', 'en'], ['vi-VN', 'vi'], ['zh-TW', 'zh-TW'], ['fr-FR', 'zh-TW']]) {
        const context = await browser.newContext({locale: device, viewport: {width: 390, height: 844}});
        const page = await context.newPage();
        const errors: string[] = [];
        page.on('pageerror', error => errors.push(error.message));
        const response = await page.goto(base);
        expect(await response!.text()).toContain(`<html lang="${expected}"`);
        expect(await page.locator('html').getAttribute('lang')).toBe(expected);
        await page.locator('input[type=email]').fill('language-draft@example.test');
        const picker = {selectOption: (locale: string) => chooseLanguage(page, locale)};
        expect(await page.locator('select').count()).toBe(0);
        await picker.selectOption('en');
        await page.getByRole('heading', {name: 'Sign in to Lumi'}).waitFor();
        expect(await page.locator('input[type=email]').inputValue()).toBe('language-draft@example.test');
        await picker.selectOption('vi');
        await page.getByRole('heading', {name: 'Đăng nhập Lumi'}).waitFor();
        expect(await page.locator('input[type=email]').inputValue()).toBe('language-draft@example.test');
        await page.reload();
        await page.getByRole('heading', {name: 'Đăng nhập Lumi'}).waitFor();
        expect((await context.cookies()).find(item => item.name === 'beauty_language')?.value).toBe('vi');
        await picker.selectOption('en');
        await page.getByRole('heading', {name: 'Sign in to Lumi'}).waitFor();
        await page.reload();
        await page.getByRole('heading', {name: 'Sign in to Lumi'}).waitFor();
        const cookie = (await context.cookies()).find(item => item.name === 'beauty_language');
        expect(cookie?.value).toBe('en'); expect(cookie?.httpOnly).toBe(true);
        await page.route('**/api/preferences/language', route => route.abort());
        await picker.selectOption('zh-TW');
        await page.getByRole('alert').filter({hasText: 'Language could not be saved'}).waitFor();
        expect(await page.locator('html').getAttribute('lang')).toBe('en');
        expect(await page.locator('[data-language-option="en"]').getAttribute('aria-checked')).toBe('true');
        await page.unroute('**/api/preferences/language');
        await picker.selectOption('zh-TW');
        await page.getByRole('heading', {name: '登入預約空間'}).waitFor();
        for (const width of [320, 390, 768, 1440]) {
          await page.setViewportSize({width, height: 844});
          expect(await page.locator('html').evaluate(node => node.scrollWidth <= innerWidth)).toBe(true);
          await page.screenshot({path: `.dev-logs/login-locale-${device}-${width}.png`, fullPage: true});
        }
        await picker.selectOption('auto');
        await expect.poll(() => page.locator('html').getAttribute('lang')).toBe(expected);
        await page.reload();
        expect(await page.locator('html').getAttribute('lang')).toBe(expected);
        expect((await context.cookies()).some(item => item.name === 'beauty_language')).toBe(false);
        // Preference writes cannot accept cross-site requests or arbitrary payloads.
        expect((await page.request.post(`${base}/api/preferences/language`, {
          headers: {Origin: 'https://untrusted.example'}, data: {preference: 'en'},
        })).status()).toBe(403);
        expect((await page.request.post(`${base}/api/preferences/language`, {
          headers: {Origin: base}, data: {preference: 'en', tenant_id: 'injected'},
        })).status()).toBe(400);
        expect(errors).toEqual([]);
        await context.close();
      }
    } finally {await browser.close();}
  }, 90_000,
);

it.skipIf(!process.env.UNIFIED_TEST_UI_URL || !process.env.UNIFIED_TEST_DATABASE_URL)(
  'preserves merchant forms, operation drafts and staff dates across three languages on mobile',
  async () => {
    const {prisma} = await import('../src/server/database/prisma');
    const base = process.env.UNIFIED_TEST_UI_URL!;
    const browser = await chromium.launch({executablePath:
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', headless: true});
    const context = await browser.newContext({locale: 'zh-TW', viewport: {width: 390, height: 844}});
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    async function drafts() {
      return page.locator('main :is(input,textarea,select),[role=dialog] :is(input,textarea,select)').evaluateAll(elements =>
        elements.filter(element => !(element instanceof HTMLInputElement && element.type === 'file'))
          .map(element => {
            const field = element as HTMLInputElement;
            return {name: field.name, value: field.value, checked: field.checked};
          }));
    }
    async function cycle(title: string, screenshot: string) {
      await waitForSkillCatalog(page);
      const before = await drafts();
      for (const language of ['en', 'vi', 'zh-TW'] as Locale[]) {
        await chooseLanguage(await page.getByRole('dialog').count() ? page.getByRole('dialog') : page, language);
        await page.getByRole('heading', {name: translate(language, title), exact: true}).waitFor();
        await page.waitForLoadState('networkidle');
        expect(await drafts()).toEqual(before);
        for (const width of [320, 390, 768, 1440]) {
          await page.setViewportSize({width, height: 844});
          expect(await page.locator('html').evaluate(node => node.scrollWidth <= innerWidth)).toBe(true);
        }
        await page.setViewportSize({width: 390, height: 844});
        if (language === 'vi') await page.screenshot({path: `.dev-logs/${screenshot}-vi.png`, fullPage: true});
      }
    }
    try {
      await page.goto(`${base}/api/line-booking/integrated-demo?role=owner`);
      for (const [view, , create] of [
        ['services', '服務項目', '新增服務'], ['staff', '服務人員', '新增服務人員'],
        ['resources', '空間與設備', '新增空間或設備'],
      ]) {
        await page.goto(`${base}/merchant/${view}?organization=demo&location=taipei`);
        await page.getByRole('button', {name: create, exact: true}).click();
        await page.locator('[role=dialog] input[type=text]').first().fill('草稿 Nguyễn draft');
        let addedResource: string | undefined;
        try {
          if (view === 'resources') {
            // A concurrent catalog addition used to change the workspace key and erase this draft.
            const added = await prisma.$queryRaw<Array<{id: string}>>`
              insert into public.resources (organization_id, location_id, resource_type_id, name, is_active, sort_order)
              select r.organization_id, r.location_id, r.resource_type_id, 'Locale concurrent fixture', true, 999999
              from public.resources r join public.locations l on l.id = r.location_id
                join public.organizations o on o.id = r.organization_id
              where o.slug = 'demo' and l.slug = 'taipei' limit 1 returning id`;
            addedResource = added[0]?.id;
            expect(addedResource).toBeTruthy();
          }
          await cycle(create, `merchant-${view}`);
          if (addedResource) {
            await page.keyboard.press('Escape');
            await page.getByLabel('搜尋空間與設備',{exact:true}).fill('Locale concurrent fixture');
            await browserExpect(page.getByText('Locale concurrent fixture', {exact: true})).toHaveCount(1);
          }
        } finally {
          if (addedResource) await prisma.resources.delete({where: {id: addedResource}});
        }
      }
      await page.goto(`${base}/merchant/settings?organization=demo&location=taipei`);
      await page.getByRole('button',{name:'品牌與公司資料',exact:true}).click();
      await page.locator('input[name=businessName]').fill('未送出 Công ty');
      await page.locator('textarea[name=brandDescription]').fill('保留品牌草稿');
      await cycle('品牌與公司資料', 'merchant-settings');
      await page.goto(`${base}/merchant/operations?organization=demo&location=taipei`);
      await page.getByLabel('最早可開始時間（幾分鐘後）', {exact: true}).fill('27');
      await cycle('營運管理', 'merchant-operations');
      const timingField = page.getByLabel('最早可開始時間（幾分鐘後）', {exact: true});
      await timingField.focus();
      const focusedBounds = await timingField.boundingBox();
      await timingField.blur();
      expect(await timingField.boundingBox()).toEqual(focusedBounds);
      await page.getByRole('button', {name: '會員結帳', exact: true}).click();
      await page.getByLabel('顧客編號').fill('00000000-0000-4000-8000-000000000001');
      await page.getByText('顧客預約權限', {exact: true}).click();
      expect(await page.getByLabel('狀態', {exact: true}).isVisible()).toBe(true);
      for (const [view, title] of [
        ['dashboard', '營運總覽'], ['calendar', '預約行事曆'], ['bookings', '預約管理'],
        ['customers', '顧客管理'], ['locations', '分店管理'], ['reports', '營運報表'],
        ['team', '團隊與權限'], ['subscription', '訂閱方案'], ['billing', '帳務管理'],
      ]) {
        await page.goto(`${base}/merchant/${view}?organization=demo&location=taipei`);
        if (view === 'customers') {
          await page.getByRole('button', {name: '新增顧客', exact: true}).click();
          await page.locator('input[name=displayName]').fill('顧客 Nguyễn draft');
          await page.locator('input[name=phone]').fill('0900000123');
          await page.locator('input[name=birthday]').fill('1990-05-17');
          await page.getByText('管理標籤', {exact: true}).click();
          await page.getByLabel('新標籤名稱', {exact: true}).fill('未送出 Nhãn');
        }
        await cycle(title, `merchant-${view}`);
      }
      await page.goto(`${base}/api/line-booking/integrated-demo?role=beautician`);
      await page.goto(`${base}/staff/taipei`);
      const date = page.locator('input[type=date]');
      await date.waitFor();
      const initial = await date.inputValue();
      for (const language of ['vi', 'en', 'zh-TW']) {
        await chooseLanguage(page, language);
        await page.waitForLoadState('networkidle');
        expect(await date.inputValue()).toBe(initial);
        expect(await page.locator('html').evaluate(node => node.scrollWidth <= innerWidth)).toBe(true);
        await page.screenshot({path: `.dev-logs/staff-workspace-${language}.png`, fullPage: true});
      }
      expect(errors).toEqual([]);
    } finally {await browser.close();}
  }, 240_000,
);
