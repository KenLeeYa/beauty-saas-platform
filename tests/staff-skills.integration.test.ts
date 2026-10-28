import {expect,it,vi} from "vitest";
import {NextRequest} from "next/server";
import {randomUUID} from "node:crypto";

vi.mock("next/cache",()=>({revalidateTag:vi.fn(),unstable_cache:(callback:unknown)=>callback}));

it.skipIf(!process.env.UNIFIED_TEST_DATABASE_URL)("skill catalog API searches literal names with stable server pages and verified organization access",async()=>{
  const {prisma}=await import("../src/server/database/prisma");
  const {createApplicationSession}=await import("../src/server/auth/session");
  const route=await import("../src/app/api/merchant/staff/skills/route");
  const org="11111111-1111-4111-8111-111111111111",foreignOrg=randomUUID();
  const owner=await createApplicationSession({profileId:"33333333-3333-4333-8333-333333333301"});
  const marker=`技能目錄${randomUUID().slice(0,8)}%_`,ids:string[]=[];
  const get=(query:string,token=owner.sessionToken,scope="organization=demo&location=taipei")=>route.GET(new NextRequest(`http://127.0.0.1:3100/api/merchant/staff/skills?${scope}&${query}`,{headers:{cookie:`beauty_session=${token}`}}));
  try {
    await prisma.organizations.create({data:{id:foreignOrg,slug:`skills-${foreignOrg}`,name:"隔離測試店家",business_name:"隔離測試店家",email:"qa@example.test",phone:"0900000000"}});
    for(let i=0;i<17;i++) {
      const id=randomUUID();ids.push(id);
      await prisma.$executeRaw`insert into public.staff_skill_catalog(id,organization_id,name) values(${id}::uuid,${org}::uuid,${marker+String(i).padStart(2,"0")})`;
    }
    await prisma.$executeRaw`insert into public.staff_skill_catalog(organization_id,name) values(${foreignOrg}::uuid,${marker+"foreign"})`;
    const distractor=randomUUID();ids.push(distractor);
    await prisma.$executeRaw`insert into public.staff_skill_catalog(id,organization_id,name) values(${distractor}::uuid,${org}::uuid,${marker.replace("%_","wildcard")})`;
    const q=`search=${encodeURIComponent(marker)}&limit=8`;
    const response=await get(q);expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const first=(await response.json()).data;
    const second=(await (await get(q+"&offset=8")).json()).data;
    const third=(await (await get(q+"&offset=16")).json()).data;
    expect(first.total).toBe(17);expect(first.items).toHaveLength(8);expect(second.items).toHaveLength(8);expect(third.items).toHaveLength(1);
    expect(new Set([...first.items,...second.items,...third.items].map((row:{id:string})=>row.id)).size).toBe(17);
    expect((await (await get(q)).json()).data).toEqual(first);
    expect((await (await get(q+"&offset=999")).json()).data).toEqual({items:[],total:17});
    for(const invalid of ["limit=51","offset=-1",`search=${"x".repeat(101)}`]) expect((await get(invalid)).status).toBe(400);
    expect((await get(q,"")).status).toBe(401);
    expect((await get(q,undefined,`organization=skills-${foreignOrg}&location=taipei`)).status).toBe(404);
    expect((await get(q,undefined,"organization=demo&location=missing")).status).toBe(404);
    const provider=await createApplicationSession({profileId:"33333333-3333-4333-8333-333333333305"});
    expect((await get(q,provider.sessionToken)).status).toBe(403);
    const front=await createApplicationSession({profileId:"33333333-3333-4333-8333-333333333304"});
    expect((await get(q,front.sessionToken)).status).toBe(200);
  } finally {
    for(const id of ids) await prisma.$executeRaw`delete from public.staff_skill_catalog where id=${id}::uuid and organization_id=${org}::uuid`;
    await prisma.organizations.deleteMany({where:{id:foreignOrg}});
  }
},30000);

it.skipIf(!process.env.UNIFIED_TEST_DATABASE_URL)("staff skills enforce catalog, tenant, branch, role, concurrency and RLS boundaries",async()=>{
  const {prisma}=await import("../src/server/database/prisma");
  const {createApplicationSession,resolveSessionToken}=await import("../src/server/auth/session");
  const {resolveMerchantContext}=await import("../src/server/merchant/context");
  const {getMerchantTeam}=await import("../src/server/merchant/team");
  const skillsRoute=await import("../src/app/api/merchant/staff/skills/route");
  const staffRoute=await import("../src/app/api/merchant/staff/route");
  const org="11111111-1111-4111-8111-111111111111",branch="22222222-2222-4222-8222-222222222221";
  const owner="33333333-3333-4333-8333-333333333301";
  const session=await createApplicationSession({profileId:owner});
  const marker=`Skill QA ${randomUUID().slice(0,8)}`;
  const otherOrg=randomUUID(),otherBranch=randomUUID(),foreignSkill=randomUUID(),foreignStaff=randomUUID(),otherProfile=randomUUID();
  let createdStaff:string|undefined;
  let createdSkill:string|undefined;
  const request=(body:unknown,method="POST",material=session,scope="organization=demo&location=taipei",path="staff/skills")=>new NextRequest(`http://127.0.0.1:3100/api/merchant/${path}?${scope}`,{
    method,headers:{origin:"http://127.0.0.1:3100","content-type":"application/json",cookie:`beauty_session=${material.sessionToken}; beauty_csrf=${material.csrfToken}`,"x-csrf-token":material.csrfToken},body:JSON.stringify(body),
  });
  try{
    const response=await skillsRoute.POST(request({name:` ${marker} `}));
    expect(response.status).toBe(201);
    createdSkill=(await response.json()).data.id;
    expect((await skillsRoute.POST(request({name:marker.toUpperCase()}))).status).toBe(409);
    expect((await skillsRoute.POST(request({name:marker,organization_id:otherOrg}))).status).toBe(400);
    expect((await skillsRoute.POST(request({name:" ".repeat(4)}))).status).toBe(400);
    const unknown=await staffRoute.POST(request({displayName:marker,title:"QA",skills:["unregistered-skill-"+marker]},"POST",session,undefined,"staff"));
    expect(unknown.status).toBe(400);
    expect(await prisma.staff_profiles.count({where:{organization_id:org,display_name:marker}})).toBe(0);
    const created=await staffRoute.POST(request({displayName:marker,title:"QA",skills:[marker]},"POST",session,undefined,"staff"));
    expect(created.status).toBe(201);createdStaff=(await created.json()).data.id;
    const qualifications=await prisma.service_staff_assignments.findMany({where:{staff_profile_id:createdStaff},orderBy:{id:"asc"}});
    const patch=(skills:string[],expectedSkills:string[],staffId=createdStaff!)=>skillsRoute.PATCH(request({staffId,skills,expectedSkills},"PATCH"));
    expect((await patch([], [marker])).status).toBe(200);
    expect((await patch([marker],[marker])).status).toBe(409);
    expect((await patch([marker],[])).status).toBe(200);
    expect((await prisma.staff_profiles.findUniqueOrThrow({where:{id:createdStaff}})).skills).toEqual([marker]);
    expect(await prisma.service_staff_assignments.findMany({where:{staff_profile_id:createdStaff},orderBy:{id:"asc"}})).toEqual(qualifications);
    await prisma.organizations.create({data:{id:otherOrg,slug:`skill-${otherOrg}`,name:marker,business_name:marker,email:"qa@example.test",phone:"0900000000"}});
    await prisma.$executeRaw`insert into public.staff_skill_catalog(id,organization_id,name) values(${foreignSkill}::uuid,${otherOrg}::uuid,${"foreign-"+marker})`;
    expect((await patch(["foreign-"+marker],[marker])).status).toBe(400);
    await prisma.staff_profiles.create({data:{id:foreignStaff,organization_id:otherOrg,display_name:marker}});
    expect((await patch([],[],foreignStaff)).status).toBe(404);
    expect((await skillsRoute.POST(request({name:marker},"POST",session,`organization=skill-${otherOrg}&location=taipei`))).status).toBe(404);
    await prisma.locations.create({data:{id:otherBranch,organization_id:org,slug:`skill-${otherBranch}`,code:otherBranch,name:marker}});
    await prisma.staff_location_assignments.updateMany({where:{staff_profile_id:createdStaff,location_id:branch},data:{location_id:otherBranch}});
    expect((await patch([], [marker])).status).toBe(404);
    await prisma.staff_location_assignments.updateMany({where:{staff_profile_id:createdStaff,location_id:otherBranch},data:{location_id:branch}});
    const front=await prisma.location_memberships.findFirstOrThrow({where:{organization_id:org,location_id:branch,role:"FRONT_DESK",status:"ACTIVE"}});
    const frontSession=await createApplicationSession({profileId:front.profile_id});
    expect((await skillsRoute.POST(request({name:"forbidden-"+marker},"POST",frontSession))).status).toBe(403);
    expect((await skillsRoute.PATCH(request({staffId:createdStaff,skills:[],expectedSkills:[marker]},"PATCH",frontSession))).status).toBe(403);
    const context=await resolveMerchantContext({session:(await resolveSessionToken(session.sessionToken))!,organizationSlug:"demo",locationSlug:"taipei"});
    expect((await getMerchantTeam(context)).some(member=>member.role==="ORGANIZATION_OWNER")).toBe(true);
    await expect(getMerchantTeam({...context,roles:new Set(["FRONT_DESK"])})).rejects.toMatchObject({status:403});
    await prisma.profiles.create({data:{id:otherProfile,auth_user_id:otherProfile,email:`${otherProfile}@example.test`,display_name:marker,is_active:true}});
    await prisma.location_memberships.create({data:{organization_id:org,location_id:otherBranch,profile_id:otherProfile,role:"SERVICE_PROVIDER",status:"ACTIVE"}});
    expect((await getMerchantTeam(context)).some(member=>member.name===marker)).toBe(false);
    // The retained rehearsal DB has a null auth.uid stub. Bind a synthetic JWT only
    // inside this rolled-back transaction; never alter the RLS policy or bypass role.
    const rollback=new Error("rollback synthetic identity");
    const originalAuth=await prisma.$queryRaw<{definition:string}[]>`select pg_get_functiondef('auth.uid()'::regprocedure) definition`;
    await expect(prisma.$transaction(async transaction=>{
      if(originalAuth[0].definition.includes("select null::uuid")) await transaction.$executeRawUnsafe("create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$");
      await transaction.organization_memberships.create({data:{organization_id:org,profile_id:otherProfile,role:"ORGANIZATION_OWNER",status:"ACTIVE"}});
      await transaction.$executeRaw`select set_config('request.jwt.claim.sub',${otherProfile},true)`;
      await transaction.$executeRawUnsafe("SET LOCAL ROLE authenticated");
      const rows=await transaction.$queryRaw<{organization_id:string}[]>`select organization_id from public.staff_skill_catalog`;
      expect(rows.length).toBeGreaterThan(0);expect(rows.every(row=>row.organization_id===org)).toBe(true);
      await transaction.$executeRawUnsafe("RESET ROLE");
      throw rollback;
    })).rejects.toBe(rollback);
    expect(await prisma.$queryRaw`select pg_get_functiondef('auth.uid()'::regprocedure) definition`).toEqual(originalAuth);
    const protection=await prisma.$queryRaw<{rls:boolean;forced:boolean;write:boolean}[]>`select relrowsecurity rls,relforcerowsecurity forced,has_table_privilege('authenticated','public.staff_skill_catalog','INSERT') as write from pg_class where oid='public.staff_skill_catalog'::regclass`;
    expect(protection).toEqual([{rls:true,forced:true,write:false}]);
    expect(await prisma.audit_logs.count({where:{target_id:createdStaff,action:"STAFF_SKILLS_UPDATE"}})).toBe(2);
  }finally{
    if(createdStaff) await prisma.staff_profiles.update({where:{id:createdStaff},data:{is_active:false,public_visible:false}});
    if(createdSkill) await prisma.$executeRaw`delete from public.staff_skill_catalog where id=${createdSkill}::uuid and organization_id=${org}::uuid`;
    await prisma.location_memberships.deleteMany({where:{profile_id:otherProfile,location_id:otherBranch}});
    await prisma.profiles.deleteMany({where:{id:otherProfile}});
    await prisma.locations.deleteMany({where:{id:otherBranch,organization_id:org}});
    await prisma.staff_profiles.deleteMany({where:{id:foreignStaff,organization_id:otherOrg}});
    await prisma.organizations.deleteMany({where:{id:otherOrg}});
  }
},60000);

it.skipIf(!process.env.UNIFIED_TEST_DATABASE_URL)("required skills filter public staff and protect holds, confirmation, reschedule and qualification reviews",async()=>{
  const {prisma}=await import("../src/server/database/prisma");
  const {createApplicationSession,resolveSessionToken}=await import("../src/server/auth/session");
  const {resolveMerchantContext}=await import("../src/server/merchant/context");
  const {createStaffSkill,updateStaffSkills}=await import("../src/server/merchant/staff-skills");
  const {createMerchantStaff,createMerchantService}=await import("../src/server/merchant/management");
  const servicesRoute=await import("../src/app/api/merchant/services/route");
  const {resolvePublicLocation}=await import("../src/server/public-booking/context");
  const {getPublicCatalog}=await import("../src/server/public-booking/catalog");
  const {getPublicAvailability}=await import("../src/server/public-booking/availability");
  const {createBookingHold}=await import("../src/server/public-booking/hold");
  const {confirmPublicBooking,reschedulePublicBooking,cancelPublicBookingByCustomer}=await import("../src/server/public-booking/booking");
  const {listQualificationReviews}=await import("../src/server/booking/qualification-review");
  const {isStaffQualified}=await import("../src/server/staff/service-capability");
  const {sha256}=await import("../src/server/security/crypto");
  const {addLocalDays,formatDateInTimeZone}=await import("../src/server/time/timezone");
  const session=await createApplicationSession({profileId:"33333333-3333-4333-8333-333333333301"});
  const context=await resolveMerchantContext({session:(await resolveSessionToken(session.sessionToken))!,organizationSlug:"demo",locationSlug:"taipei"});
  const store=await resolvePublicLocation({organizationSlug:"demo",locationSlug:"taipei"});
  const marker=`Eligibility ${randomUUID().slice(0,8)}`, requestId=randomUUID();
  const skills:string[]=[], staffIds:string[]=[], bookingIds:string[]=[];
  let serviceId:string|undefined,locationServiceId:string|undefined,sessionId:string|undefined,otherBranch:string|undefined;
  const patch=(selected:string[],expected:string[],id=locationServiceId!,scope="organization=demo&location=taipei",extra={})=>servicesRoute.PATCH(new NextRequest(`http://127.0.0.1:3100/api/merchant/services?${scope}`,{method:"PATCH",headers:{origin:"http://127.0.0.1:3100","content-type":"application/json",cookie:`beauty_session=${session.sessionToken}; beauty_csrf=${session.csrfToken}`,"x-csrf-token":session.csrfToken},body:JSON.stringify({action:"UPDATE_SKILLS",locationServiceId:id,skills:selected,expectedSkills:expected,...extra})}));
  try {
    for(const suffix of ["A","B"]) skills.push((await createStaffSkill({context,name:`${marker} ${suffix}`,requestId})).name);
    const service=await createMerchantService({context,name:marker,variantName:"QA",categoryName:"",description:"",durationMinutes:30,priceMinor:10000,preBufferMinutes:0,postBufferMinutes:0,requestId});
    serviceId=service.serviceId;locationServiceId=service.locationServiceId;
    const variantId=(await prisma.location_services.findUniqueOrThrow({where:{id:locationServiceId}})).service_variant_id;
    for(const selected of [skills,[skills[0]]]) staffIds.push((await createMerchantStaff({context,displayName:`${marker} ${staffIds.length}`,title:"QA",skills:selected,requestId})).id);
    expect((await patch(skills,[])).status).toBe(200);
    expect((await patch([],[])).status).toBe(409);
    expect((await patch(["unknown-"+marker],skills)).status).toBe(400);
    expect((await patch([],skills,randomUUID())).status).toBe(404);
    expect((await patch([],skills,undefined,"organization=demo&location=foreign-branch")).status).toBe(404);
    const branch=await prisma.locations.create({data:{organization_id:store.organizationId,slug:`eligibility-${randomUUID()}`,code:randomUUID(),name:marker}});otherBranch=branch.id;
    expect((await patch([],skills,undefined,`organization=demo&location=${branch.slug}`)).status).toBe(404);
    expect((await patch([],skills,undefined,undefined,{organizationId:randomUUID()})).status).toBe(400);
    const publicVariant=async()=> (await getPublicCatalog({organizationSlug:"demo",locationSlug:"taipei"})).services.find(row=>row.id===serviceId)!.variants.find(row=>row.id===variantId)!;
    expect((await publicVariant()).staff.map(row=>row.id)).toEqual([staffIds[0]]);
    const token=randomUUID()+randomUUID();
    const publicSession=await prisma.public_booking_sessions.create({data:{organization_id:store.organizationId,location_id:store.locationId,token_hash:sha256(token),expires_at:new Date(Date.now()+1800000),ip_hash:sha256(marker),device_hash:sha256(marker),behavior_hash:sha256(marker),allowed_origin:"http://127.0.0.1:3100"}});
    sessionId=publicSession.id;
    const publicContext={...store,sessionId,sessionToken:token,requestId};
    let slots:Awaited<ReturnType<typeof getPublicAvailability>>["slots"]=[];
    for(let offset=1;offset<14 && slots.length<2;offset++) slots=(await getPublicAvailability(publicContext,{serviceVariantId:variantId,date:addLocalDays(formatDateInTimeZone(new Date(),store.timezone),offset)})).slots;
    expect(slots.length).toBeGreaterThan(1);
    expect(slots.every(slot=>slot.availableStaff.length===1 && slot.availableStaff[0]===staffIds[0])).toBe(true);
    expect(await isStaffQualified(store.locationId,staffIds[1],variantId,new Date(slots[0].startsAt),"MANUAL")).toBe(false);
    await expect(createBookingHold({context:publicContext,serviceVariantId:variantId,staffProfileId:staffIds[1],startsAt:slots[0].startsAt,idempotencyKey:randomUUID()})).rejects.toMatchObject({status:409});
    const key=randomUUID();
    const hold=await createBookingHold({context:publicContext,serviceVariantId:variantId,staffProfileId:staffIds[0],startsAt:slots[0].startsAt,idempotencyKey:key});
    const phone=`09${Math.floor(10000000+Math.random()*90000000)}`;
    const command={context:publicContext,idempotencyKey:key,keepSessionActive:true,payload:{holdToken:hold.holdToken,customer:{displayName:marker,phone},consents:{service:true,marketing:false}}};
    await updateStaffSkills({context,staffId:staffIds[0],skills:[skills[0]],expectedSkills:skills,requestId});
    const before=await prisma.bookings.count();
    await expect(confirmPublicBooking(command)).rejects.toMatchObject({status:409,message:"服務人員資格已變更，請重新選擇人員與時段。"});
    expect(await prisma.bookings.count()).toBe(before);
    expect(await prisma.customers.count({where:{organization_id:store.organizationId,display_name:marker}})).toBe(0);
    await updateStaffSkills({context,staffId:staffIds[0],skills,expectedSkills:[skills[0]],requestId});
    await prisma.customers.create({data:{organization_id:store.organizationId,display_name:marker,deposit_mode:"EXEMPT",
      customer_contacts:{create:{contact_type:"PHONE",value:phone,normalized_value:`+886${phone.slice(1)}`,is_primary:true}}}});
    const confirmed=await confirmPublicBooking(command);bookingIds.push(confirmed.booking.id);
    const original=await prisma.bookings.findUniqueOrThrow({where:{id:confirmed.booking.id}});
    const originalSegments=await prisma.booking_segments.findMany({where:{booking_id:original.id}});
    const originalAllocations=await prisma.booking_staff_allocations.findMany({where:{booking_id:original.id}});
    await updateStaffSkills({context,staffId:staffIds[0],skills:[],expectedSkills:skills,requestId});
    expect((await listQualificationReviews(context)).items.some(item=>item.bookingId===original.id)).toBe(true);
    expect(await prisma.booking_segments.findMany({where:{booking_id:original.id}})).toEqual(originalSegments);
    expect(await prisma.booking_staff_allocations.findMany({where:{booking_id:original.id}})).toEqual(originalAllocations);
    expect((await prisma.bookings.findUniqueOrThrow({where:{id:original.id}})).total_minor).toBe(original.total_minor);
    await updateStaffSkills({context,staffId:staffIds[0],skills,expectedSkills:[],requestId});
    expect((await listQualificationReviews(context)).items.some(item=>item.bookingId===original.id)).toBe(false);
    const later=(await getPublicAvailability(publicContext,{serviceVariantId:variantId,date:formatDateInTimeZone(new Date(slots[0].startsAt),store.timezone)})).slots[0];
    const changeKey=randomUUID();
    const replacement=await createBookingHold({context:publicContext,serviceVariantId:variantId,staffProfileId:staffIds[0],startsAt:later.startsAt,idempotencyKey:changeKey});
    await updateStaffSkills({context,staffId:staffIds[0],skills:[],expectedSkills:skills,requestId});
    await expect(reschedulePublicBooking({context:publicContext,authorizedBooking:{id:original.id,customerId:original.customer_id},holdToken:replacement.holdToken,idempotencyKey:changeKey,keepSessionActive:true})).rejects.toMatchObject({status:409,message:"服務人員資格已變更，請重新選擇人員與時段。"});
    expect((await prisma.bookings.findUniqueOrThrow({where:{id:original.id}})).status).toBe(original.status);
    expect(await prisma.booking_segments.findMany({where:{booking_id:original.id}})).toEqual(originalSegments);
    await updateStaffSkills({context,staffId:staffIds[0],skills,expectedSkills:[],requestId});
    const changed=await reschedulePublicBooking({context:publicContext,authorizedBooking:{id:original.id,customerId:original.customer_id},holdToken:replacement.holdToken,idempotencyKey:changeKey,keepSessionActive:true});
    bookingIds.push(changed.booking.id);
    expect(changed.booking.totalMinor).toBe(confirmed.booking.totalMinor);
  } finally {
    for(const id of bookingIds) {const booking=await prisma.bookings.findUniqueOrThrow({where:{id}});if(["CONFIRMED","PENDING_PAYMENT"].includes(booking.status)) await cancelPublicBookingByCustomer({bookingId:id,organizationId:store.organizationId,locationId:store.locationId,customerId:booking.customer_id,reason:"synthetic cleanup",requestId});}
    if(sessionId) await prisma.booking_holds.updateMany({where:{public_booking_session_id:sessionId,status:"ACTIVE"},data:{status:"CANCELLED",cancelled_at:new Date()}});
    if(serviceId) await prisma.services.update({where:{id:serviceId},data:{is_active:false,online_booking_enabled:false}});
    if(locationServiceId) await prisma.location_services.update({where:{id:locationServiceId},data:{is_active:false,required_skills:[]}});
    await prisma.staff_profiles.updateMany({where:{id:{in:staffIds}},data:{is_active:false,public_visible:false,skills:[]}});
    for(const name of skills) await prisma.$executeRaw`delete from public.staff_skill_catalog where organization_id=${store.organizationId}::uuid and name=${name}`;
    if(otherBranch) await prisma.locations.delete({where:{id:otherBranch}});
  }
},90000);
