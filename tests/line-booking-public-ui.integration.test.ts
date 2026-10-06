import {loadEnvConfig} from '@next/env';
import {Prisma} from '@prisma/client';
import {chromium} from '@playwright/test';
import {expect,it,vi} from 'vitest';

it.skipIf(!process.env.UNIFIED_TEST_DATABASE_URL || !process.env.UNIFIED_TEST_UI_URL)(
  'books and cancels through the public core at a 390px mobile viewport',
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
    const session=await createLineMobileSession({organizationId,locationId,channelId,
      identity,deviceId:randomToken(16),origin:base});
    const browser=await chromium.launch({executablePath:
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      headless:true,args:['--no-sandbox']});
    const context=await browser.newContext({viewport:{width:390,height:844}});
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
      await page.locator('#booking form button').last().click();
      await page.locator('#booking form button[type="submit"]').click();
      await page.locator('#booking small[role="alert"]').first().waitFor();
      expect(await page.locator('#name').getAttribute('aria-invalid')).toBe('true');
      expect(await page.locator('#phone').getAttribute('aria-invalid')).toBe('true');
      const name=`Mobile ${randomToken(5)}`;
      const phone=`09${Math.floor(10000000+Math.random()*90000000)}`;
      await page.locator('#name').fill(name);
      await page.locator('#phone').fill(phone);
      await page.locator('#booking form button[type="submit"]').click();
      await page.locator('#booking [role="status"]').waitFor({timeout:15_000});
      const booking=await prisma.bookings.findFirstOrThrow({where:{organization_id:organizationId,
        location_id:locationId,customer_id:customerId},orderBy:{created_at:'desc'},
        select:{id:true,source:true,status:true}});
      expect(booking.source).toBe('LINE');
      expect((await prisma.customers.findUniqueOrThrow({where:{id:customerId}})).display_name).toBe(name);
      await page.screenshot({path:'../line-booking/.local/unified-public-mobile.png'});
      const opener=page.locator(`#mine article[data-booking-id="${booking.id}"] button`).first();
      await opener.focus();await page.keyboard.press('Enter');
      const dialog=page.getByRole('dialog');await dialog.waitFor();
      expect(await dialog.ariaSnapshot()).toContain('heading');
      expect(await dialog.evaluate(element=>element.contains(document.activeElement))).toBe(true);
      await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
      expect(await opener.evaluate(element=>element===document.activeElement)).toBe(true);
      await page.locator(`#mine article[data-booking-id="${booking.id}"] button`).last().click();
      await page.locator(`#mine article[data-booking-id="${booking.id}"]`).waitFor({state:'detached'});
      expect((await prisma.bookings.findUniqueOrThrow({where:{id:booking.id}})).status).toBe('CANCELLED');
    } finally {await context.close();await browser.close();}
  },90_000,
);
