import {loadEnvConfig} from '@next/env';
import {Prisma} from '@prisma/client';
import {NextRequest} from 'next/server';
import {expect,it} from 'vitest';

it.skipIf(!process.env.UNIFIED_TEST_DATABASE_URL)(
  'returns 403 for CRM mutation when the store module is disabled',
  async()=>{
    loadEnvConfig(process.cwd());
    const [{prisma},{createApplicationSession},{POST:createCustomer}]=await Promise.all([
      import('../src/server/database/prisma'),
      import('../src/server/auth/session'),
      import('../src/app/api/merchant/customers/route'),
    ]);
    const organizationId='11111111-1111-4111-8111-111111111111';
    const locationId='22222222-2222-4222-8222-222222222221';
    const organization=await prisma.organizations.findUniqueOrThrow({where:{id:organizationId},select:{slug:true}});
    const location=await prisma.locations.findUniqueOrThrow({where:{id:locationId},select:{slug:true}});
    const session=await createApplicationSession({profileId:'33333333-3333-4333-8333-333333333301'});
    await prisma.$executeRaw(Prisma.sql`
      insert into public.store_module_activations
        (organization_id,location_id,feature_key,is_active)
      values (${organizationId}::uuid,${locationId}::uuid,'CUSTOMER_CRM',false)
      on conflict (organization_id,location_id,feature_key)
      do update set is_active=false
    `);
    try {
      const query=new URLSearchParams({organization:organization.slug,location:location.slug});
      const response=await createCustomer(new NextRequest(`http://127.0.0.1:3100/api/merchant/customers?${query}`,{
        method:'POST',headers:{origin:'http://127.0.0.1:3100',
          cookie:`beauty_session=${session.sessionToken}; beauty_csrf=${session.csrfToken}`,
          'x-csrf-token':session.csrfToken,'content-type':'application/json'},body:'{}',
      }));
      expect(response.status).toBe(403);
    } finally {
      await prisma.$executeRaw(Prisma.sql`
        delete from public.store_module_activations
        where organization_id=${organizationId}::uuid
          and location_id=${locationId}::uuid and feature_key='CUSTOMER_CRM'
      `);
    }
  },60_000,
);
