import { publicMessage } from '@/lib/line-booking/validation';
import {storeQuery} from '@/lib/line-booking/validation';
import {withDb} from '@/lib/line-booking/db';
import {localDemoEnabled} from '@/lib/line-booking/local-demo';
import {getPublicCatalog} from '@/server/public-booking/catalog';
import {mapPublicCatalogToMobile} from '@/server/mobile/catalog-mapper';
import {resolveMobileStore} from '@/server/mobile/store';

export async function GET(request: Request) {
  try {
    const slug=storeQuery.parse(Object.fromEntries(new URL(request.url).searchParams)).store;
    if (!localDemoEnabled(request.headers.get('host'))) {
      const store=await resolveMobileStore(slug);
      const catalog=await getPublicCatalog({organizationSlug:store.organizationSlug,locationSlug:store.locationSlug});
      return Response.json(mapPublicCatalogToMobile(catalog));
    }
    const result=await withDb(async client=>{
      const {rows:[store]}=await client.query('select id,slug,timezone from line_booking.stores where slug=$1',[slug]);
      if(!store) throw Error('store not found');
      const services=await client.query('select id,name,duration_minutes from line_booking.services where store_id=$1 order by name',[store.id]);
      const staff=await client.query('select id,name from line_booking.staff where store_id=$1 order by name',[store.id]);
      const skills=await client.query('select staff_id,service_id from line_booking.staff_skills where store_id=$1',[store.id]);
      return {timezone:store.timezone,services:services.rows,staff:staff.rows,skills:skills.rows};
    });
    return Response.json(result);
  } catch(error) {return Response.json({error:publicMessage(error, request)},{status:400});}
}
