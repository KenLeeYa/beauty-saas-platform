import {expect,it,vi} from "vitest";
import {NextRequest} from "next/server";
import {randomUUID} from "node:crypto";

vi.mock("next/cache",()=>({revalidateTag:vi.fn(),unstable_cache:(callback:unknown)=>callback}));

it.skipIf(!process.env.UNIFIED_TEST_DATABASE_URL)("service and staff directories search in the database with stable pages and tenant/branch boundaries",async()=>{
  const {prisma}=await import("../src/server/database/prisma");
  const {createApplicationSession}=await import("../src/server/auth/session");
  const services=await import("../src/app/api/merchant/services/route");
  const staff=await import("../src/app/api/merchant/staff/route");
  const org="11111111-1111-4111-8111-111111111111",branch="22222222-2222-4222-8222-222222222221";
  const owner=await createApplicationSession({profileId:"33333333-3333-4333-8333-333333333301"});
  const other=await prisma.locations.findFirstOrThrow({where:{organization_id:org,id:{not:branch},is_active:true}});
  const foreignOrg=randomUUID(),foreignBranch=randomUUID(),marker=`目錄${randomUUID().slice(0,8)}%_`;
  const serviceIds:string[]=[],staffIds:string[]=[],categoryIds:string[]=[];
  const get=(kind:"services"|"staff",query:string,location="taipei",token=owner.sessionToken)=>({services,staff}[kind]).GET(new NextRequest(`http://127.0.0.1:3100/api/merchant/${kind}?organization=demo&location=${location}&${query}`,{headers:{cookie:`beauty_session=${token}`}}));
  try {
    await prisma.organizations.create({data:{id:foreignOrg,slug:`catalog-${foreignOrg}`,name:"隔離美學",business_name:"隔離美學",email:"qa@example.test",phone:"0900000000"}});
    await prisma.locations.create({data:{id:foreignBranch,organization_id:foreignOrg,slug:"taipei",code:"QA",name:"隔離分店"}});
    for(let i=0;i<12;i++) {
      const organization_id=i===11?foreignOrg:org,location_id=i===10?other.id:i===11?foreignBranch:branch;
      const name=i===9?marker.replace("%_","wildcard"):`${marker}${String(i).padStart(2,"0")}`;
      const category=await prisma.service_categories.create({data:{organization_id,name:`${name}群組`}});categoryIds.push(category.id);
      const service=await prisma.services.create({data:{organization_id,name,category_id:category.id}});serviceIds.push(service.id);
      const variant=await prisma.service_variants.create({data:{organization_id,service_id:service.id,name:"標準療程",duration_minutes:60,price_minor:180000}});
      const item=await prisma.location_services.create({data:{organization_id,location_id,service_id:service.id,service_variant_id:variant.id,required_skills:["保濕"]}});
      const person=await prisma.staff_profiles.create({data:{organization_id,display_name:name,title:"美容師",skills:["深層保濕"],is_active:i!==8}});staffIds.push(person.id);
      await prisma.staff_location_assignments.create({data:{organization_id,location_id,staff_profile_id:person.id}});
      await prisma.service_staff_assignments.create({data:{organization_id,location_service_id:item.id,staff_profile_id:person.id}});
    }
    for(const kind of ["services","staff"] as const) {
      const query=`search=${encodeURIComponent(marker)}&limit=8`;
      const response=await get(kind,query);expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("no-store");
      const first=(await response.json()).data,second=(await (await get(kind,query+"&offset=8")).json()).data;
      expect(first.total).toBe(9);expect(first.items).toHaveLength(8);expect(second.items).toHaveLength(1);
      expect(new Set([...first.items,...second.items].map((row:{id:string})=>row.id)).size).toBe(9);
      expect((await (await get(kind,query)).json()).data).toEqual(first);
      expect((await (await get(kind,query+"&offset=999")).json()).data).toMatchObject({items:[],total:9});
      expect((await (await get(kind,query,other.slug)).json()).data.total).toBe(1);
      for(const invalid of ["limit=51","offset=-1",`search=${"x".repeat(101)}`]) expect((await get(kind,invalid)).status).toBe(400);
      expect((await get(kind,query,"missing")).status).toBe(404);
      expect((await get(kind,query,"taipei","")).status).toBe(401);
      const provider=await createApplicationSession({profileId:"33333333-3333-4333-8333-333333333305"});
      expect((await get(kind,query,"taipei",provider.sessionToken)).status).toBe(kind==="services"?200:403);
    }
    const filtered=(await (await get("services",`category=${encodeURIComponent(marker+"08群組")}`)).json()).data;
    expect(filtered.total).toBe(1);expect(filtered.items[0].name).toBe(marker+"08");
    expect(filtered.categories).toContain(marker+"00群組");
    expect(filtered.categories).not.toContain(marker+"10群組");
    expect(filtered.items[0].eligibleStaff).toEqual([]);
    const bySkill=(await (await get("staff",`search=${encodeURIComponent("層保")}&limit=50`)).json()).data;
    expect(bySkill.items.filter((row:{id:string})=>staffIds.includes(row.id))).toHaveLength(10);
    expect(bySkill.items.filter((row:{id:string})=>staffIds.includes(row.id)).every((row:{eligibleServiceCount:number})=>row.eligibleServiceCount===0)).toBe(true);
    await prisma.staff_profiles.update({where:{id:staffIds[0]},data:{skills:["保濕"]}});
    const qualified=(await (await get("services",`search=${encodeURIComponent(marker+"00")}`)).json()).data.items[0];
    expect(qualified.eligibleStaff).toEqual([{id:staffIds[0],name:marker+"00"}]);expect(qualified.staffCount).toBe(1);
    expect((await (await get("staff",`search=${encodeURIComponent(marker+"00")}`)).json()).data.items[0].eligibleServiceCount).toBe(1);
    const {resolveSessionToken}=await import("../src/server/auth/session");
    const {resolveMerchantContext}=await import("../src/server/merchant/context");
    const {getMerchantWorkspaceData}=await import("../src/server/merchant/data");
    const context=await resolveMerchantContext({session:(await resolveSessionToken(owner.sessionToken))!,organizationSlug:"demo",locationSlug:"taipei"});
    const projection=await getMerchantWorkspaceData(context,{pagedCatalog:true});
    expect(projection.services).toEqual([]);expect(projection.staff).toEqual([]);
    const {listMerchantServices,listMerchantStaff,catalogDirectorySchema,serviceDirectorySchema}=await import("../src/server/merchant/catalog-directory");
    const finance={...context,roles:new Set(["FINANCE_VIEWER"] as const)};
    await expect(listMerchantServices(finance,serviceDirectorySchema.parse({}))).rejects.toMatchObject({status:403});
    await expect(listMerchantStaff(finance,catalogDirectorySchema.parse({}))).rejects.toMatchObject({status:403});
  } finally {
    await prisma.service_staff_assignments.deleteMany({where:{staff_profile_id:{in:staffIds}}});
    await prisma.staff_location_assignments.deleteMany({where:{staff_profile_id:{in:staffIds}}});
    await prisma.staff_profiles.deleteMany({where:{id:{in:staffIds}}});
    await prisma.location_services.deleteMany({where:{service_id:{in:serviceIds}}});
    await prisma.service_variants.deleteMany({where:{service_id:{in:serviceIds}}});
    await prisma.services.deleteMany({where:{id:{in:serviceIds}}});
    await prisma.service_categories.deleteMany({where:{id:{in:categoryIds}}});
    await prisma.locations.deleteMany({where:{id:foreignBranch}});
    await prisma.organizations.deleteMany({where:{id:foreignOrg}});
  }
},30000);
