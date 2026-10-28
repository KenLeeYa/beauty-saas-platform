import "server-only";
import {Prisma} from "@prisma/client";
import {z} from "zod";
import {findQualificationReviews} from "../booking/qualification-review";
import {assertCapability, requireLocation, type OrganizationContext} from "../authorization/context";
import {prisma} from "../database/prisma";
import {requireEntitlement} from "../entitlements/service";
import {AppError} from "../http/errors";

export type StaffSkill = {id: string; name: string};
export const skillCatalogQuerySchema=z.object({
  search:z.string().trim().max(100).default(""),
  offset:z.coerce.number().int().min(0).max(1000000).default(0),
  limit:z.coerce.number().int().min(1).max(50).default(8),
});

export async function listStaffSkills(context:OrganizationContext,input:z.infer<typeof skillCatalogQuerySchema>) {
  assertCapability(context,"staff.read");
  const rows=await prisma.$queryRaw<{id:string|null;name:string|null;total:number}[]>(Prisma.sql`
    with matched as (
      select id,name from public.staff_skill_catalog where organization_id=${context.organization.id}::uuid
        and strpos(lower(name),lower(${input.search}))>0
    )
    select page.id,page.name,totals.total from (select count(*)::integer total from matched) totals
    left join lateral (select id,name from matched order by name,id limit ${input.limit} offset ${input.offset}) page on true
    order by page.name,page.id
  `);
  return {items:rows.flatMap(row=>row.id!==null && row.name!==null ? [{id:row.id,name:row.name}] : []),total:rows[0]?.total ?? 0};
}

export async function validateStaffSkills(transaction: Prisma.TransactionClient, organizationId: string, skills: string[]): Promise<string[]> {
  if (!skills.length) return [];
  const catalog = await transaction.$queryRaw<StaffSkill[]>`select id, name from public.staff_skill_catalog
    where organization_id=${organizationId}::uuid and lower(name)=any(${skills.map(skill=>skill.trim().toLowerCase())}::text[])`;
  const names = new Map(catalog.map(skill=>[skill.name.toLowerCase(),skill.name]));
  const selected = skills.map(skill=>names.get(skill.trim().toLowerCase()));
  if (selected.some(skill=>!skill)) throw new AppError("BAD_REQUEST","請選擇已建立的技能項目。",400);
  return [...new Set(selected as string[])];
}

export async function createStaffSkill(input: {context: OrganizationContext; name: string; requestId: string}): Promise<StaffSkill> {
  assertCapability(input.context,"staff.manage");
  await requireEntitlement(input.context.organization.id,"STAFF_SCHEDULING");
  return prisma.$transaction(async transaction=>{
    const rows = await transaction.$queryRaw<StaffSkill[]>`insert into public.staff_skill_catalog (organization_id,name)
      values (${input.context.organization.id}::uuid,${input.name.trim()}) on conflict do nothing returning id,name`;
    if (!rows[0]) throw new AppError("CONFLICT","已有相同名稱的技能。",409);
    await transaction.audit_logs.create({data:{organization_id:input.context.organization.id,
      location_id:requireLocation(input.context).id, actor_profile_id:input.context.session.profileId,
      action:"STAFF_SKILL_CREATE",target_type:"STAFF_SKILL",target_id:rows[0].id,outcome:"SUCCESS",request_id:input.requestId}});
    return rows[0];
  });
}

export async function updateStaffSkills(input: {context: OrganizationContext; staffId: string; skills: string[]; expectedSkills: string[]; requestId: string}) {
  assertCapability(input.context,"staff.manage");
  await requireEntitlement(input.context.organization.id,"STAFF_SCHEDULING");
  const location = requireLocation(input.context);
  return prisma.$transaction(async transaction=>{
    const where = {id:input.staffId, organization_id:input.context.organization.id,
      staff_location_assignments:{some:{location_id:location.id,is_active:true}}};
    if (!await transaction.staff_profiles.findFirst({where,select:{id:true}})) {
      throw new AppError("NOT_FOUND","找不到服務人員。",404);
    }
    const skills = await validateStaffSkills(transaction,input.context.organization.id,input.skills);
    const result = await transaction.staff_profiles.updateMany({where:{...where,skills:{equals:input.expectedSkills}},data:{skills}});
    if (result.count!==1) throw new AppError("CONFLICT","技能已被其他人更新，請重新載入頁面。",409);
    await recordSkillChange(transaction, input.context, {staffId: input.staffId});
    await transaction.audit_logs.create({data:{organization_id:input.context.organization.id,location_id:location.id,
      actor_profile_id:input.context.session.profileId,action:"STAFF_SKILLS_UPDATE",target_type:"STAFF_PROFILE",
      target_id:input.staffId,outcome:"SUCCESS",request_id:input.requestId,after_json:{skills}}});
    return {skills, pendingReviewCount: (await findQualificationReviews(transaction,input.context)).total};
  });
}

async function recordSkillChange(transaction: Prisma.TransactionClient, context: OrganizationContext,
  target: {staffId?: string; locationServiceId?: string}) {
  await transaction.$executeRaw(Prisma.sql`
    insert into public.staff_capability_events
      (organization_id,location_id,assignment_id,actor_profile_id,effective_from,effective_until,
        online_booking_enabled,walk_in_eligible,reason)
    select assignment.organization_id, service.location_id, assignment.id, ${context.session.profileId}::uuid,
      assignment.effective_from,assignment.effective_until,assignment.online_booking_enabled,
      assignment.walk_in_eligible,'服務技能需求或人員技能已更新'
    from public.service_staff_assignments assignment
    join public.location_services service on service.id=assignment.location_service_id
      and service.organization_id=assignment.organization_id
    where assignment.organization_id=${context.organization.id}::uuid
      ${target.staffId ? Prisma.sql`and assignment.staff_profile_id=${target.staffId}::uuid` : Prisma.empty}
      ${target.locationServiceId ? Prisma.sql`and service.id=${target.locationServiceId}::uuid` : Prisma.empty}
  `);
}

export async function updateServiceSkills(input: {context: OrganizationContext; locationServiceId: string;
  skills: string[]; expectedSkills: string[]; requestId: string}) {
  assertCapability(input.context,"catalog.manage");
  await requireEntitlement(input.context.organization.id,"STAFF_SCHEDULING");
  const location=requireLocation(input.context);
  return prisma.$transaction(async transaction=>{
    const where={id:input.locationServiceId,organization_id:input.context.organization.id,location_id:location.id,is_active:true};
    if (!await transaction.location_services.findFirst({where,select:{id:true}})) {
      throw new AppError("NOT_FOUND","找不到可預約的服務。",404);
    }
    const skills=await validateStaffSkills(transaction,input.context.organization.id,input.skills);
    const result=await transaction.location_services.updateMany({where:{...where,required_skills:{equals:input.expectedSkills}},data:{required_skills:skills}});
    if(result.count!==1) throw new AppError("CONFLICT","服務技能需求已被其他人更新，請重新載入頁面。",409);
    await recordSkillChange(transaction,input.context,{locationServiceId:input.locationServiceId});
    await transaction.audit_logs.create({data:{organization_id:input.context.organization.id,location_id:location.id,
      actor_profile_id:input.context.session.profileId,action:"SERVICE_SKILLS_UPDATE",target_type:"LOCATION_SERVICE",
      target_id:input.locationServiceId,outcome:"SUCCESS",request_id:input.requestId,after_json:{skills}}});
    return {skills,pendingReviewCount:(await findQualificationReviews(transaction,input.context)).total};
  });
}
