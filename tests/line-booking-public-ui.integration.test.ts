import {loadEnvConfig} from '@next/env';
import {Prisma} from '@prisma/client';
import {chromium} from '@playwright/test';
import {chooseLanguage} from './language-menu';
import {expect,it,vi} from 'vitest';

it.skipIf(!process.env.UNIFIED_TEST_DATABASE_URL || !process.env.UNIFIED_TEST_UI_URL)(
  'books, recovers reschedule loading and submission failures, and cancels through the public core',
  async()=>{
    loadEnvConfig(process.cwd());
    const [{prisma},{verifyLineIdentity},{ensureCustomerLineLink,createLineMobileSession},
      {randomToken},{addLocalDays,formatDateInTimeZone}]=await Promise.all([
      import('../src/server/database/prisma'),import('../src/server/auth/line-identity'),
      import('../src/server/auth/line-linking'),import('../src/server/security/crypto'),
      import('../src/server/time/timezone'),
    ]);
    const organizationId='11111111-1111-4111-8111-111111111111';
    const locationId='22222222-2222-4222-8222-222222222221';
    const channelId='synthetic-login-channel';
    const entrySlug='synthetic-beauty-line';
    const base=process.env.UNIFIED_TEST_UI_URL!;
    await prisma.$executeRaw(Prisma.sql`
      insert into public.mobile_store_entries (organization_id,location_id,entry_slug,is_enabled)
      values (${organizationId}::uuid,${locationId}::uuid,${entrySlug},true)
      on conflict (organization_id,location_id) do update set entry_slug=excluded.entry_slug,is_enabled=true
    `);
    await prisma.$executeRaw(Prisma.sql`
      insert into public.store_line_channels
        (organization_id,location_id,provider_id,channel_id,purpose,is_enabled)
      values (${organizationId}::uuid,${locationId}::uuid,'synthetic-provider',
        ${channelId},'LOGIN',true)
      on conflict (organization_id,location_id,channel_id)
      do update set is_enabled=true,purpose='LOGIN'
    `);
    const nonce=randomToken(16);
    const identity=await verifyLineIdentity('synthetic-id-token',
      {channelId,providerId:'synthetic-provider'},nonce,
      vi.fn().mockResolvedValue(new Response(JSON.stringify({
        iss:'https://access.line.me',aud:channelId,
        sub:`U-ui-${randomToken(8)}`,nonce,exp:Math.floor(Date.now()/1000)+600}),{status:200})));
    const customerId=await ensureCustomerLineLink({organizationId,locationId,channelId,identity});
    // Only this synthetic customer is exempt; pending-payment bookings are not self-reschedulable.
    await prisma.customers.update({where:{id:customerId},data:{deposit_mode:'EXEMPT'}});
    const session=await createLineMobileSession({organizationId,locationId,channelId,
      identity,deviceId:randomToken(16),origin:base});
    const browser=await chromium.launch({executablePath:
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      headless:true,args:['--no-sandbox']});
    const context=await browser.newContext({locale:'zh-TW',viewport:{width:390,height:844}});
    await context.addCookies([{name:'beauty_line_session',value:session.token,url:base,
      httpOnly:true,sameSite:'Lax'}]);
    const page=await context.newPage();
    try {
      const catalogResponse=await page.request.get(`${base}/api/line-booking/catalog?store=${entrySlug}`);
      expect(catalogResponse.status()).toBe(200);
      const catalog=await catalogResponse.json() as {timezone:string;
        services:{id:string}[];staff:{id:string}[];
        skills:{staff_id:string;service_id:string}[]};
      const service=catalog.services[0];
      const staff=catalog.skills.find(skill=>skill.service_id===service.id)!.staff_id;
      const today=formatDateInTimeZone(new Date(),catalog.timezone);
      let selectedDate='',slot='';
      for(let offset=1;offset<=14&&!slot;offset++){
        const date=addLocalDays(today,offset);
        const query=new URLSearchParams({store:entrySlug,service:service.id,staff,date});
        const response=await page.request.get(`${base}/api/line-booking/availability?${query}`);
        expect(response.status(),await response.text()).toBe(200);
        const slots=(await response.json() as {slots:string[]}).slots;
        if(slots.length){selectedDate=date;slot=slots[0];}
      }
      expect(slot).toBeTruthy();
      await page.goto(`${base}/line-booking/${entrySlug}`);
      const unlabelled=await page.locator('input,select,textarea').evaluateAll(elements =>
        elements.filter(element => {
          const input=element as HTMLInputElement;
          if (input.type === 'hidden') return false;
          return !input.labels?.length && !input.getAttribute('aria-label') &&
            !input.getAttribute('aria-labelledby');
        }).map(element => element.outerHTML.slice(0,120)));
      expect(unlabelled).toEqual([]);
      await page.locator('#service').selectOption(service.id);
      await page.locator('#staff').selectOption(staff);
      await page.locator('#booking form button').first().click();
      await page.locator('#date').fill(selectedDate);
      await page.locator(`input[name="start"][value="${slot}"]`).check();
      await page.locator('#booking form button').first().click();
      await page.locator('#staff').selectOption('any');
      await page.locator('#staff').selectOption(staff);
      await page.locator('#booking form button').first().click();
      expect(await page.locator('#booking form button').last().isDisabled()).toBe(true);
      await page.locator(`input[name="start"][value="${slot}"]`).check();
      await page.locator('#date').fill(addLocalDays(selectedDate,1));
      expect(await page.locator('#booking form button').last().isDisabled()).toBe(true);
      await page.locator('#date').fill(selectedDate);
      await page.locator(`input[name="start"][value="${slot}"]`).check();
      await page.locator('#booking form button').last().click();
      await page.locator('#booking form button[type="submit"]').click();
      await page.locator('#booking small[role="alert"]').first().waitFor();
      expect(await page.locator('#name').getAttribute('aria-invalid')).toBe('true');
      expect(await page.locator('#phone').getAttribute('aria-invalid')).toBe('true');
      const name=`Mobile ${randomToken(5)}`;
      const phone=`09${Math.floor(10000000+Math.random()*90000000)}`;
      await page.locator('#name').fill(name);
      await page.locator('#phone').fill(phone);
      await chooseLanguage(page, 'en');
      await page.getByRole('button',{name:'Confirm booking',exact:true}).waitFor();
      expect((await prisma.customers.findUniqueOrThrow({where: {id: customerId}})).preferred_language).toBe('en');
      await chooseLanguage(page, 'vi');
      expect((await prisma.customers.findUniqueOrThrow({where: {id: customerId}})).preferred_language).toBe('vi');
      expect(await page.locator('#name').inputValue()).toBe(name);
      expect(await page.locator('#phone').inputValue()).toBe(phone);
      await chooseLanguage(page, 'zh-TW');
      await page.getByRole('button',{name:'確認預約',exact:true}).waitFor();
      expect((await prisma.customers.findUniqueOrThrow({where: {id: customerId}})).preferred_language).toBe('zh-TW');
      await page.locator('#booking form button[type="submit"]').click();
      await page.locator('#booking [role="status"]').waitFor({timeout:15_000});
      const booking=await prisma.bookings.findFirstOrThrow({where:{organization_id:organizationId,
        location_id:locationId,customer_id:customerId},orderBy:{created_at:'desc'},
        select:{id:true,source:true,status:true}});
      expect(booking.source).toBe('LINE');
      expect(booking.status).toBe('CONFIRMED');
      expect((await prisma.customers.findUniqueOrThrow({where:{id:customerId}})).display_name).toBe(name);
      for (const width of [360,390,430,768,1280]) {
        await page.setViewportSize({width,height:844});
        expect(await page.locator('html').evaluate(element=>element.scrollWidth<=innerWidth)).toBe(true);
        await page.screenshot({path:`.dev-logs/booking-${width}.png`,fullPage:true});
      }
      await page.getByRole('button',{name:'我的預約',exact:true}).click();
      const opener=page.locator(`#mine article[data-booking-id="${booking.id}"] button`).first();
      await opener.focus();await page.keyboard.press('Enter');
      const dialog=page.getByRole('dialog');await dialog.waitFor();
      expect(await dialog.ariaSnapshot()).toContain('heading');
      expect(await dialog.evaluate(element=>element.contains(document.activeElement))).toBe(true);
      await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
      expect(await opener.evaluate(element=>element===document.activeElement)).toBe(true);
      await page.setViewportSize({width:390,height:844});
      const availabilityPattern='**/api/line-booking/availability?*';
      await page.route(availabilityPattern,route=>route.fulfill({status:503,
        contentType:'application/json',body:JSON.stringify({error:'Internal database error'})}));
      await opener.click();
      await dialog.getByRole('button',{name:'重新載入時段'}).waitFor();
      await expect.poll(async()=>{
        const bounds=await dialog.boundingBox();
        return !!bounds && bounds.x>=0 && bounds.y>=0 &&
          bounds.x+bounds.width<=390 && bounds.y+bounds.height<=844;
      }).toBe(true);
      expect(await dialog.getByRole('alert').textContent()).toContain('無法載入可預約時段');
      expect(await dialog.textContent()).not.toContain('Internal database error');
      expect(await dialog.textContent()).not.toContain('這天沒有其他可用時段');
      expect(await dialog.getByRole('button',{name:'確認改期'}).isDisabled()).toBe(true);
      await page.screenshot({path:'.dev-logs/reschedule-load-error-390.png'});
      await page.unroute(availabilityPattern);
      await page.route(availabilityPattern,route=>route.fulfill({status:200,
        contentType:'application/json',body:JSON.stringify({slots:[]})}));
      await dialog.getByRole('button',{name:'重新載入時段'}).click();
      await dialog.getByText('這天沒有其他可用時段。').waitFor();
      expect(await dialog.getByRole('alert').count()).toBe(0);
      await page.unroute(availabilityPattern);
      await page.route(availabilityPattern,route=>route.fulfill({status:200,
        contentType:'application/json',body:JSON.stringify({slots:['not-a-time']})}));
      await dialog.locator('#change-date').fill(addLocalDays(selectedDate,1));
      await dialog.getByRole('button',{name:'重新載入時段'}).waitFor();
      await page.unroute(availabilityPattern);
      await page.route(availabilityPattern,route=>route.abort());
      await dialog.getByRole('button',{name:'重新載入時段'}).click();
      await dialog.getByRole('button',{name:'重新載入時段'}).waitFor();
      await page.unroute(availabilityPattern);
      await page.route(availabilityPattern,route=>{expect(route.request().method()).toBe('GET');});
      await dialog.getByRole('button',{name:'重新載入時段'}).click();
      await dialog.getByText('正在查詢可預約時段…').waitFor();
      await dialog.getByRole('button',{name:'重新載入時段'}).waitFor({timeout:20_000});
      await page.unroute(availabilityPattern);
      let releaseSlow: (()=>void) | undefined;
      const slow = new Promise<void>(resolve=>{releaseSlow=resolve;});
      let finishSlow: (()=>void) | undefined;
      const slowFinished = new Promise<void>(resolve=>{finishSlow=resolve;});
      const slowDate=addLocalDays(selectedDate,2);
      await page.route(availabilityPattern,async route=>{
        const isSlow=new URL(route.request().url()).searchParams.get('date')===slowDate;
        if(isSlow) await slow;
        await route.fulfill({status:200,contentType:'application/json',
          body:JSON.stringify({slots:isSlow ? [`${slowDate}T12:00:00+08:00`] : []})})
          .catch(()=>{ /* A superseded request is aborted. */ });
        if(isSlow) finishSlow?.();
      });
      const slowRequest=page.waitForRequest(request=>new URL(request.url()).searchParams.get('date')===slowDate);
      await dialog.locator('#change-date').fill(slowDate);await slowRequest;
      await dialog.getByText('正在查詢可預約時段…').waitFor();
      expect(await dialog.getByRole('button',{name:'確認改期'}).isDisabled()).toBe(true);
      await dialog.locator('#change-date').fill(addLocalDays(selectedDate,3));
      await dialog.getByText('這天沒有其他可用時段。').waitFor();
      releaseSlow?.();await slowFinished;
      expect(await dialog.locator('#change-date').inputValue()).toBe(addLocalDays(selectedDate,3));
      expect(await dialog.locator('input[name="new-start"]').count()).toBe(0);
      await page.unroute(availabilityPattern);
      // Repeated local runs may exhaust the original date. Find real replacement capacity.
      let rescheduleDate = '';
      for (let offset = 1; offset <= 14 && !rescheduleDate; offset++) {
        const candidate = addLocalDays(selectedDate, offset);
        const query = new URLSearchParams({store:entrySlug,service:service.id,staff,date:candidate});
        const response = await page.request.get(`${base}/api/line-booking/availability?${query}`);
        expect(response.status(), await response.text()).toBe(200);
        if ((await response.json() as {slots:string[]}).slots.length) rescheduleDate = candidate;
      }
      expect(rescheduleDate).toBeTruthy();
      await dialog.locator('#change-date').fill(rescheduleDate);
      await dialog.locator('input[name="new-start"]').first().waitFor();
      const replacementStart=await dialog.locator('input[name="new-start"]').first().inputValue();
      await dialog.locator('input[name="new-start"]').first().check();
      await page.route(`**/api/line-booking/booking/${booking.id}`,route=>route.fulfill({
        status:409,contentType:'application/json',body:JSON.stringify({error:'此時段已被預約，請重新選擇。'})}));
      await dialog.getByRole('button',{name:'確認改期'}).click();
      await dialog.getByRole('alert').filter({hasText:'此時段已被預約'}).waitFor();
      expect(await dialog.locator('#change-date').inputValue()).toBe(rescheduleDate);
      expect(await dialog.locator('input[name="new-start"]:checked').inputValue()).toBe(replacementStart);
      expect((await prisma.bookings.findUniqueOrThrow({where:{id:booking.id}})).status).toBe(booking.status);
      await chooseLanguage(dialog, 'en');
      await dialog.getByRole('button',{name:'Confirm reschedule'}).waitFor();
      expect(await dialog.getByRole('alert').textContent()).toContain('This time is no longer available');
      expect(await dialog.locator('#change-date').inputValue()).toBe(rescheduleDate);
      expect(await dialog.locator('input[name="new-start"]:checked').inputValue()).toBe(replacementStart);
      await page.screenshot({path:'.dev-logs/reschedule-english-390.png'});
      await chooseLanguage(dialog, 'zh-TW');
      await dialog.getByRole('button',{name:'確認改期'}).waitFor();
      for(const width of [320,390,768,1440]){
        await page.setViewportSize({width,height:844});
        const button=dialog.getByRole('button',{name:'確認改期'});
        const box=await button.boundingBox();
        expect(box && box.x>=0 && box.y>=0 && box.x+box.width<=width && box.y+box.height<=844).toBe(true);
        expect(await button.evaluate(element=>{
          const rect=element.getBoundingClientRect();
          return element.contains(document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2));
        })).toBe(true);
        expect(await page.locator('html').evaluate(element=>element.scrollWidth<=innerWidth)).toBe(true);
        await page.screenshot({path:`.dev-logs/reschedule-retry-${width}.png`});
      }
      await page.setViewportSize({width:390,height:480});
      const compactButton=await dialog.getByRole('button',{name:'確認改期'}).boundingBox();
      expect(compactButton && compactButton.y>=0 && compactButton.y+compactButton.height<=480).toBe(true);
      await page.screenshot({path:'.dev-logs/reschedule-compact-390.png'});
      await page.unroute(`**/api/line-booking/booking/${booking.id}`);
      const rescheduled=page.waitForResponse(response=>response.url().endsWith(`/api/line-booking/booking/${booking.id}`) &&
        response.request().method()==='PATCH');
      await chooseLanguage(dialog, 'en');
      await dialog.getByRole('button',{name:'Confirm reschedule'}).click();
      const rescheduleResponse=await rescheduled;
      expect(rescheduleResponse.status(),await rescheduleResponse.text()).toBe(200);
      await dialog.waitFor({state:'hidden'});
      expect((await prisma.bookings.findUniqueOrThrow({where:{id:booking.id}})).status).toBe('RESCHEDULED');
      const replacement=await prisma.bookings.findFirstOrThrow({where:{organization_id:organizationId,
        location_id:locationId,customer_id:customerId,status:'CONFIRMED'},orderBy:{created_at:'desc'}});
      expect(replacement.id).not.toBe(booking.id);
      const segment=await prisma.booking_segments.findFirstOrThrow({where:{booking_id:replacement.id}});
      expect(segment.service_variant_id).toBe(service.id);
      expect(segment.assigned_staff_id).toBe(staff);
      expect(segment.starts_at.toISOString()).toBe(new Date(replacementStart).toISOString());
      const replacementRow=page.locator(`#mine article[data-booking-id="${replacement.id}"]`);
      await replacementRow.getByRole('button',{name:'Cancel',exact:true}).click();
      await replacementRow.waitFor({state:'detached'});
      expect((await prisma.bookings.findUniqueOrThrow({where:{id:replacement.id}})).status).toBe('CANCELLED');
      await page.getByRole('button',{name:'Membership',exact:true}).click();
      await page.getByRole('heading',{name:'My benefits',exact:true}).waitFor();
      await page.getByText('Available balance',{exact:true}).waitFor();
      expect(await page.locator('html').evaluate(element=>element.scrollWidth<=innerWidth)).toBe(true);
    } finally {await context.close();await browser.close();}
  },150_000,
);
