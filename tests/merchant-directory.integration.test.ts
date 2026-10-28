import {expect,it} from "vitest";
import {NextRequest} from "next/server";
import {randomUUID} from "node:crypto";

it.skipIf(!process.env.UNIFIED_TEST_DATABASE_URL)("customer search reaches old records with stable pages and enforces scope and permissions",async()=>{
  const {prisma}=await import("../src/server/database/prisma");
  const {createApplicationSession}=await import("../src/server/auth/session");
  const route=await import("../src/app/api/merchant/customers/route");
  const org="11111111-1111-4111-8111-111111111111";
  const session=await createApplicationSession({profileId:"33333333-3333-4333-8333-333333333301"});
  const marker=`分頁${randomUUID().slice(0,8)}%_`, ids:string[]=[];
  const get=(query:string,scope="organization=demo&location=taipei",token=session.sessionToken)=>route.GET(new NextRequest(`http://127.0.0.1:3100/api/merchant/customers?${scope}&${query}`,{headers:{cookie:`beauty_session=${token}`}}));
  try {
    for(let i=0;i<10;i++) ids.push((await prisma.customers.create({data:{organization_id:org,display_name:`${marker}${i}`,created_at:new Date("2000-01-01")}})).id);
    const phone=`qa-phone-${randomUUID()}`;
    await prisma.customer_contacts.create({data:{organization_id:org,customer_id:ids[0],contact_type:"PHONE",value:phone,normalized_value:phone,is_primary:true}});
    await prisma.customer_notes.create({data:{organization_id:org,customer_id:ids[0],note:"Sensitive QA",sensitivity:"SENSITIVE",created_by:"33333333-3333-4333-8333-333333333301"}});
    const q=`search=${encodeURIComponent(marker)}&limit=6`;
    const first=await get(q);expect(first.status).toBe(200);
    const a=(await first.json()).data;
    const b=(await (await get(`${q}&offset=6`)).json()).data;
    expect(a.total).toBe(10);expect(a.items).toHaveLength(6);expect(b.items).toHaveLength(4);
    expect(new Set([...a.items,...b.items].map((row:{id:string})=>row.id)).size).toBe(10);
    expect((await (await get(q)).json()).data).toEqual(a);
    expect((await (await get(`${q}&offset=999`)).json()).data).toMatchObject({items:[],total:10});
    expect((await get("limit=1000")).status).toBe(400);
    expect((await get("offset=-1")).status).toBe(400);
    expect((await get(q,"organization=unrelated&location=taipei")).status).toBe(404);
    expect((await get(q,undefined,"")).status).toBe(401);
    const staff=await createApplicationSession({profileId:"33333333-3333-4333-8333-333333333305"});
    expect((await get(q,undefined,staff.sessionToken)).status).toBe(403);
    const front=await createApplicationSession({profileId:"33333333-3333-4333-8333-333333333304"});
    expect((await (await get(`search=${encodeURIComponent(phone)}`)).json()).data.total).toBe(1);
    expect((await (await get(`search=${encodeURIComponent(phone)}`,undefined,front.sessionToken)).json()).data.total).toBe(0);
    const limited=(await (await get(`${q}&limit=50`,undefined,front.sessionToken)).json()).data.items as {phone:string|null;notes:unknown[]}[];
    expect(limited).toHaveLength(10);
    expect(limited.every(row=>row.phone===null && row.notes.length===0)).toBe(true);
  } finally {
    await prisma.customer_notes.deleteMany({where:{customer_id:{in:ids},organization_id:org}});
    await prisma.customer_contacts.deleteMany({where:{customer_id:{in:ids},organization_id:org}});
    await prisma.customers.deleteMany({where:{id:{in:ids},organization_id:org}});
  }
},30000);

it.skipIf(!process.env.UNIFIED_TEST_DATABASE_URL)("booking directory searches beyond the calendar window without crossing branches",async()=>{
  const {prisma}=await import("../src/server/database/prisma");
  const {createApplicationSession}=await import("../src/server/auth/session");
  const route=await import("../src/app/api/merchant/bookings/route");
  const session=await createApplicationSession({profileId:"33333333-3333-4333-8333-333333333301"});
  const org="11111111-1111-4111-8111-111111111111",branch="22222222-2222-4222-8222-222222222221";
  const customer=await prisma.customers.create({data:{organization_id:org,display_name:`歷史預約${randomUUID()}`}});
  const service=await prisma.location_services.findFirstOrThrow({where:{organization_id:org,location_id:branch}});
  const ids:string[]=[];
  const get=(extra="",location="taipei")=>route.GET(new NextRequest(`http://127.0.0.1:3100/api/merchant/bookings?organization=demo&location=${location}&search=${encodeURIComponent(customer.display_name)}&limit=6&${extra}`,{headers:{cookie:`beauty_session=${session.sessionToken}`}}));
  try {
    for(let i=0;i<9;i++) {
      const b=await prisma.bookings.create({data:{organization_id:org,location_id:branch,customer_id:customer.id,status:"CANCELLED",subtotal_minor:180000,total_minor:180000,is_test:true,tracking_token_hash:randomUUID()}});ids.push(b.id);
      await prisma.booking_segments.create({data:{booking_id:b.id,organization_id:org,location_id:branch,service_id:service.service_id,service_variant_id:service.service_variant_id,service_name_snapshot:"水潤保濕護理",variant_name_snapshot:"標準療程",starts_at:new Date("2001-01-01T02:00:00Z"),ends_at:new Date("2001-01-01T03:00:00Z"),duration_minutes:60,price_minor:180000}});
    }
    const first=await get();expect(first.status).toBe(200);
    const a=(await first.json()).data,b=(await (await get("offset=6")).json()).data;
    expect(a.total).toBe(9);expect(a.items).toHaveLength(6);expect(b.items).toHaveLength(3);
    expect(new Set([...a.items,...b.items].map((row:{id:string})=>row.id)).size).toBe(9);
    expect((await (await get("status=CONFIRMED")).json()).data.total).toBe(0);
    expect((await get("status=unknown")).status).toBe(400);
    expect((await get("","missing-location")).status).toBe(404);
    const otherBranch=await prisma.locations.findFirstOrThrow({where:{organization_id:org,id:{not:branch},is_active:true}});
    const other=await get("",otherBranch.slug);
    expect(other.status).toBe(200);
    expect((await other.json()).data).toMatchObject({items:[],total:0});
  } finally {
    await prisma.booking_segments.deleteMany({where:{booking_id:{in:ids},organization_id:org}});
    await prisma.bookings.deleteMany({where:{id:{in:ids},organization_id:org}});
    await prisma.customers.delete({where:{id:customer.id}});
  }
},30000);
