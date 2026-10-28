import {expect,it,vi} from "vitest";
import {NextRequest} from "next/server";
import {randomUUID} from "node:crypto";
import {translate} from "../src/lib/i18n/messages";

vi.mock("next/cache",()=>({revalidateTag:vi.fn(),unstable_cache:(callback:unknown)=>callback}));

it.skipIf(!process.env.UNIFIED_TEST_DATABASE_URL)("location and resource directories page literal searches within verified tenant and branch memberships",async()=>{
  const {prisma}=await import("../src/server/database/prisma");
  const {createApplicationSession}=await import("../src/server/auth/session");
  const locations=await import("../src/app/api/merchant/location/route");
  const resources=await import("../src/app/api/merchant/resources/route");
  const org="11111111-1111-4111-8111-111111111111",branch="22222222-2222-4222-8222-222222222221";
  const marker=`空間${randomUUID().slice(0,8)}%_`,foreignOrg=randomUUID(),foreignBranch=randomUUID();
  const locationIds:string[]=[],resourceIds:string[]=[],typeIds:string[]=[];
  const person=await prisma.profiles.create({data:{email:`${randomUUID()}@example.test`,display_name:"限定分店驗證"}});
  const owner=await createApplicationSession({profileId:"33333333-3333-4333-8333-333333333301"});
  const restricted=await createApplicationSession({profileId:person.id});
  const get=(kind:"location"|"resources",query:string,token=owner.sessionToken,location="taipei",organization="demo")=>({location:locations,resources}[kind]).GET(new NextRequest(`http://127.0.0.1:3100/api/merchant/${kind}?organization=${organization}&location=${location}&${query}`,{headers:{cookie:`beauty_session=${token}`}}));
  try {
    await prisma.organizations.create({data:{id:foreignOrg,slug:`facility-${foreignOrg}`,name:"隔離美學",business_name:"隔離美學",email:"qa@example.test",phone:"0900000000"}});
    await prisma.locations.create({data:{id:foreignBranch,organization_id:foreignOrg,slug:"taipei",code:"QA",name:marker}});
    for(let i=0;i<11;i++) {
      const row=await prisma.locations.create({data:{organization_id:org,name:i===10?marker.replace("%_","wildcard"):marker+String(i).padStart(2,"0"),slug:`qa-${randomUUID()}`,code:`QA${randomUUID().slice(0,8)}`,is_active:i!==9}});
      locationIds.push(row.id);
    }
    for(let i=0;i<10;i++) {
      const organization_id=i===9?foreignOrg:org,location_id=i===8?locationIds[0]:i===9?foreignBranch:branch;
      const type=await prisma.resource_types.create({data:{organization_id,name:marker+`類型${i}`,kind:"SPA_ROOM"}});typeIds.push(type.id);
      const resource=await prisma.resources.create({data:{organization_id,location_id,resource_type_id:type.id,name:marker+`療程室${i}`,is_active:i!==7}});resourceIds.push(resource.id);
    }
    await prisma.location_memberships.createMany({data:[branch,locationIds[0]].map(location_id=>({organization_id:org,location_id,profile_id:person.id,role:"FRONT_DESK",status:"ACTIVE"}))});
    await prisma.location_memberships.create({data:{organization_id:org,location_id:locationIds[1],profile_id:person.id,role:"FRONT_DESK",status:"DISABLED"}});
    for(const [kind,size,total] of [["location",8,9],["resources",6,7]] as const) {
      const query=`search=${encodeURIComponent(marker)}&limit=${size}`;
      const response=await get(kind,query);expect(response.status).toBe(200);expect(response.headers.get("cache-control")).toBe("no-store");
      const first=(await response.json()).data,second=(await (await get(kind,query+`&offset=${size}`)).json()).data;
      expect(first.total).toBe(total);expect(first.items).toHaveLength(size);expect(second.items).toHaveLength(1);
      expect(new Set([...first.items,...second.items].map((row:{id:string})=>row.id)).size).toBe(total);
      expect((await (await get(kind,query)).json()).data).toEqual(first);
      expect((await (await get(kind,query+"&offset=999")).json()).data).toMatchObject({items:[],total});
      for(const invalid of ["limit=51","offset=-1",`search=${"x".repeat(101)}`]) expect((await get(kind,invalid)).status).toBe(400);
      expect((await get(kind,query,"")).status).toBe(401);
      expect((await get(kind,query,owner.sessionToken,"taipei",`facility-${foreignOrg}`)).status).toBe(404);
    }
    const limited=(await (await get("location",`search=${encodeURIComponent(marker)}`,restricted.sessionToken)).json()).data;
    expect(limited.total).toBe(1);expect(limited.items[0].id).toBe(locationIds[0]);
    expect((await get("resources","",restricted.sessionToken,(await prisma.locations.findUniqueOrThrow({where:{id:locationIds[1]}})).slug)).status).toBe(404);
    expect((await (await get("resources",`search=${encodeURIComponent(marker)}&status=all`)).json()).data.total).toBe(8);
    expect((await get("resources","status=invalid")).status).toBe(400);
    for(const locale of ["zh-TW","en","vi"] as const) {
      const query = `search=${encodeURIComponent(translate(locale, "療程室"))}&limit=50`;
      const page = (await (await get("resources", query)).json()).data;
      expect(page.items.filter((row:{id:string})=>resourceIds.includes(row.id))).toHaveLength(7);
    }
    const provider=await createApplicationSession({profileId:"33333333-3333-4333-8333-333333333305"});
    expect((await get("resources","",provider.sessionToken)).status).toBe(403);
    const {resolveSessionToken}=await import("../src/server/auth/session");
    const {resolveMerchantContext}=await import("../src/server/merchant/context");
    const {getMerchantWorkspaceData}=await import("../src/server/merchant/data");
    const context=await resolveMerchantContext({session:(await resolveSessionToken(owner.sessionToken))!,organizationSlug:"demo",locationSlug:"taipei"});
    const projection=await getMerchantWorkspaceData(context,{pagedFacilities:true});
    expect(projection.resources).toEqual([]);expect(projection.locations).toEqual([]);
    expect(projection.location.id).toBe(branch);
  } finally {
    await prisma.resources.deleteMany({where:{id:{in:resourceIds}}});
    await prisma.resource_types.deleteMany({where:{id:{in:typeIds}}});
    await prisma.location_memberships.deleteMany({where:{profile_id:person.id}});
    await prisma.auth_sessions.deleteMany({where:{profile_id:person.id}});
    await prisma.profiles.delete({where:{id:person.id}});
    await prisma.locations.deleteMany({where:{id:{in:[...locationIds,foreignBranch]}}});
    await prisma.organizations.deleteMany({where:{id:foreignOrg}});
  }
},30000);
