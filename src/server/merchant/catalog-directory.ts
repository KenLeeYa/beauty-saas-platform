import "server-only";
import {Prisma} from "@prisma/client";
import {z} from "zod";
import {hasRequiredSkills} from "@/lib/staff-skills";
import {assertCapability,requireLocation,type OrganizationContext} from "../authorization/context";
import {prisma} from "../database/prisma";
import {publicMediaUrl} from "../storage/provider";
import {literalSearch} from "./customer-directory";
import type {MerchantWorkspaceData} from "./data";

export const catalogDirectorySchema=z.object({
  search:z.string().trim().max(100).default(""),
  offset:z.coerce.number().int().min(0).max(1000000).default(0),
  limit:z.coerce.number().int().min(1).max(50).default(8),
});
export const serviceDirectorySchema=catalogDirectorySchema.extend({category:z.string().max(100).default("ALL")});
export type StaffDirectoryItem=MerchantWorkspaceData["staff"][number]&{eligibleServiceCount:number};

export async function listMerchantServices(context:OrganizationContext,input:z.infer<typeof serviceDirectorySchema>) {
  assertCapability(context,"catalog.read");
  const location=requireLocation(context),now=new Date();
  const contains=literalSearch(input.search);
  const scope={organization_id:context.organization.id,location_id:location.id,is_active:true};
  const where:Prisma.location_servicesWhereInput={...scope,
    ...(input.category!=="ALL" ? {services:input.category==="未分類" ? {category_id:null} : {service_categories:{name:input.category}}} : {}),
    ...(contains ? {OR:[{services:{name:{contains,mode:"insensitive"}}},{service_variants:{name:{contains,mode:"insensitive"}}}]} : {}),
  };
  const [total,records,categories]=await prisma.$transaction([
    prisma.location_services.count({where}),
    prisma.location_services.findMany({where,skip:input.offset,take:input.limit,orderBy:[{sort_order:"asc"},{id:"asc"}],select:{
      id:true,online_booking_enabled:true,required_skills:true,price_override_minor:true,duration_override_minutes:true,
      services:{select:{id:true,name:true,image_path:true,service_categories:{select:{name:true}}}},
      service_variants:{select:{name:true,duration_minutes:true,price_minor:true,pre_buffer_minutes:true,post_buffer_minutes:true}},
      service_staff_assignments:{where:{organization_id:context.organization.id,is_active:true,effective_from:{lte:now},
        OR:[{effective_until:null},{effective_until:{gt:now}}],
        staff_profiles:{is_active:true,staff_location_assignments:{some:{organization_id:context.organization.id,location_id:location.id,is_active:true}}}},
        select:{staff_profiles:{select:{id:true,display_name:true,skills:true}}}},
    }}),
    // Filter choices describe the entire branch, not only the current page/search.
    prisma.$queryRaw<{name:string}[]>`select distinct coalesce(c.name,'未分類') as name
      from public.location_services ls join public.services s on s.id=ls.service_id and s.organization_id=ls.organization_id
      left join public.service_categories c on c.id=s.category_id and c.organization_id=s.organization_id
      where ls.organization_id=${context.organization.id}::uuid and ls.location_id=${location.id}::uuid and ls.is_active
      order by name`,
  ],{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead});
  const items:MerchantWorkspaceData["services"]=records.map(service=>{
    const eligibleStaff=service.service_staff_assignments.filter(({staff_profiles})=>hasRequiredSkills(service.required_skills,staff_profiles.skills))
      .map(({staff_profiles})=>({id:staff_profiles.id,name:staff_profiles.display_name}));
    return {id:service.services.id,locationServiceId:service.id,name:service.services.name,variantName:service.service_variants.name,
      durationMinutes:service.duration_override_minutes??service.service_variants.duration_minutes,
      priceMinor:service.price_override_minor??service.service_variants.price_minor,
      preBufferMinutes:service.service_variants.pre_buffer_minutes,postBufferMinutes:service.service_variants.post_buffer_minutes,
      onlineBookingEnabled:service.online_booking_enabled,requiredSkills:service.required_skills,eligibleStaff,staffCount:eligibleStaff.length,
      categoryName:service.services.service_categories?.name??null,imageUrl:publicMediaUrl(service.services.image_path)};
  });
  return {items,total,categories:categories.map(row=>row.name)};
}

export async function listMerchantStaff(context:OrganizationContext,input:z.infer<typeof catalogDirectorySchema>) {
  assertCapability(context,"staff.read");
  const location=requireLocation(context),now=new Date();
  return prisma.$transaction(async tx=>{
    // strpos preserves literal %/_ input and supports partial matches within skill names.
    const page=await tx.$queryRaw<{id:string|null;total:number}[]>`with matched as (
      select s.id,s.sort_order from public.staff_profiles s
      where s.organization_id=${context.organization.id}::uuid
      and exists(select 1 from public.staff_location_assignments a where a.organization_id=s.organization_id
        and a.staff_profile_id=s.id and a.location_id=${location.id}::uuid and a.is_active)
      and (${input.search}='' or strpos(lower(s.display_name),lower(${input.search}))>0
        or strpos(lower(s.title),lower(${input.search}))>0
        or exists(select 1 from unnest(s.skills) skill where strpos(lower(skill),lower(${input.search}))>0))
    ) select p.id,c.total from (select count(*)::int total from matched) c
      left join lateral (select id,sort_order from matched order by sort_order,id offset ${input.offset} limit ${input.limit}) p on true
      order by p.sort_order,p.id`;
    const ids=page.flatMap(row=>row.id?[row.id]:[]);
    const records=await tx.staff_profiles.findMany({where:{organization_id:context.organization.id,id:{in:ids}},orderBy:[{sort_order:"asc"},{id:"asc"}],select:{
      id:true,display_name:true,title:true,skills:true,is_active:true,photo_path:true,
      service_staff_assignments:{where:{organization_id:context.organization.id,is_active:true,effective_from:{lte:now},
        OR:[{effective_until:null},{effective_until:{gt:now}}],
        location_services:{organization_id:context.organization.id,location_id:location.id,is_active:true}},
        select:{location_services:{select:{required_skills:true}}}},
    }});
    const items:StaffDirectoryItem[]=records.map(staff=>({id:staff.id,displayName:staff.display_name,title:staff.title,skills:staff.skills,
      isActive:staff.is_active,photoUrl:publicMediaUrl(staff.photo_path),
      eligibleServiceCount:staff.is_active ? staff.service_staff_assignments.filter(row=>hasRequiredSkills(row.location_services.required_skills,staff.skills)).length : 0}));
    return {items,total:page[0]?.total??0};
  },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead});
}
