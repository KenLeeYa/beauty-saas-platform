import {loadEnvConfig} from '@next/env';
import {Prisma} from '@prisma/client';
import {expect,it} from 'vitest';

it.skipIf(!process.env.UNIFIED_TEST_DATABASE_URL)(
  'verifies the raw webhook with its store channel and disables unconfigured delivery',
  async()=>{
    loadEnvConfig(process.cwd());
    const previousProvider=process.env.NOTIFICATION_PROVIDER;
    const previousSecrets=process.env.LINE_BOOKING_CHANNEL_SECRETS_JSON;
    process.env.NOTIFICATION_PROVIDER='line';
    const channelId='synthetic-oa-channel';
    const secret='synthetic-webhook-placeholder';
    process.env.LINE_BOOKING_CHANNEL_SECRETS_JSON=JSON.stringify({[channelId]:secret});
    try {
      const [{prisma},{processLineWebhook},{createLineSignature},
        {getNotificationAdapterForLocation}]=await Promise.all([
        import('../src/server/database/prisma'),
        import('../src/server/notifications/line-webhook'),
        import('../src/server/notifications/line-security'),
        import('../src/server/notifications/adapters'),
      ]);
      const organizationId='11111111-1111-4111-8111-111111111111';
      const locationId='22222222-2222-4222-8222-222222222221';
      const organization=await prisma.organizations.findUniqueOrThrow({where:{id:organizationId},select:{slug:true}});
      await prisma.notification_integrations.upsert({where:{organization_id_channel:{organization_id:organizationId,channel:'LINE'}},
        create:{organization_id:organizationId,channel:'LINE',status:'ACTIVE'},update:{status:'ACTIVE'}});
      await prisma.$executeRaw(Prisma.sql`
        insert into public.store_line_channels
          (organization_id,location_id,provider_id,channel_id,purpose,is_enabled)
        values (${organizationId}::uuid,${locationId}::uuid,'synthetic-provider',
          ${channelId},'MESSAGING',true)
        on conflict (organization_id,location_id,channel_id)
        do update set purpose='MESSAGING',is_enabled=true
      `);
      const body='{"events":[]}';
      await expect(processLineWebhook({organizationSlug:organization.slug,
        channelId,body,signature:'invalid'})).rejects.toMatchObject({status:403});
      await expect(processLineWebhook({organizationSlug:organization.slug,
        channelId:'unknown-channel',body,signature:createLineSignature(body,secret)}))
        .rejects.toMatchObject({status:503});
      expect(await processLineWebhook({organizationSlug:organization.slug,
        channelId,body,signature:createLineSignature(body,secret)}))
        .toEqual({accepted:0,duplicates:0,rejected:0});
      const adapter=await getNotificationAdapterForLocation('LINE',organizationId,locationId);
      expect(adapter.configured).toBe(false);
      expect(adapter.unavailableCode).toBe('STORE_LINE_ACCESS_TOKEN_NOT_CONFIGURED');
    } finally {
      if(previousProvider===undefined)delete process.env.NOTIFICATION_PROVIDER;
      else process.env.NOTIFICATION_PROVIDER=previousProvider;
      if(previousSecrets===undefined)delete process.env.LINE_BOOKING_CHANNEL_SECRETS_JSON;
      else process.env.LINE_BOOKING_CHANNEL_SECRETS_JSON=previousSecrets;
    }
  },60_000,
);
