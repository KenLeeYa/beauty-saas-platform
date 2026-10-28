import {PrismaClient} from "@prisma/client";
import {createHash} from "node:crypto";
import {mkdirSync,writeFileSync} from "node:fs";

const url=new URL(process.env.DATABASE_URL || "postgresql://invalid/invalid");
if(process.env.APP_ENV!=="test" || process.env.UNIFIED_LOCAL_TRIAL!=="true" || url.hostname!=="127.0.0.1" || url.port!=="56863" || url.pathname!=="/beauty_msi_20261009") {
  throw Error("Showcase data is restricted to the retained MSI synthetic database.");
}
const org="d1000000-0000-4000-8000-000000000001",location="d2000000-0000-4000-8000-000000000001";
const owner="d3000000-0000-4000-8000-000000000001",provider="d3000000-0000-4000-8000-000000000005",front="d3000000-0000-4000-8000-000000000004";
const id=name=>{const h=createHash("sha256").update(`beauty-isolated-showcase-v1:${name}`).digest("hex");return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20,32)}`;};
const media=`tenants/${org}/demo/`;
const db=new PrismaClient();
const snapshot=async tx=>{
  const result={};
  for(const table of ["bookings","booking_segments","booking_staff_allocations","customers","customer_notes","staff_profiles","locations","services"]) {
    result[table]=(await tx.$queryRawUnsafe(`select count(*)::integer count, md5(coalesce(string_agg(to_jsonb(t)::text,'' order by id),'')) digest from public.${table} t where organization_id<>$1::uuid`,org))[0];
  }
  return result;
};
try {
  const result=await db.$transaction(async tx=>{
    await tx.$executeRaw`select pg_advisory_xact_lock(20261027,1)`;
    const existing=await tx.organizations.findFirst({where:{OR:[{id:org},{slug:"showcase"}]}});
    if(existing && (existing.id!==org || existing.slug!=="showcase")) throw Error("Showcase identity conflict; existing records were not changed.");
    const before=await snapshot(tx);
    if(!existing && process.argv.includes("--apply")) {
      const now=new Date(),expiry=new Date(now.getTime()+90*86400000);
      for(const [profileId,name,email] of [[owner,"王雅雯","owner@showcase.example.test"],[provider,"林怡安","staff@showcase.example.test"],[front,"張詩涵","front@showcase.example.test"]]) {
        await tx.profiles.create({data:{id:profileId,auth_user_id:profileId,display_name:name,email,is_active:true}});
      }
      await tx.organizations.create({data:{id:org,slug:"showcase",name:"沐光美學",business_name:"沐光美學工作室",email:"hello@showcase.example.test",phone:"02-0000-0100",status:"TRIALING",trial_ends_at:expiry,public_profile_enabled:true,brand_description:"獨立本機虛構展示店家，提供臉部保養與芳香舒壓。所有人物、聯絡資料及交易均為示範。",brand_cover_image_path:media+"demo-salon.png"}});
      await tx.locations.create({data:{id:location,organization_id:org,slug:"daan",code:"DAAN",name:"大安沐光館",description:"安靜舒適的預約制美容空間，提供保養諮詢與個人化療程。",address:"台北市大安區示範路 18 號（虛構地址）",phone:"02-0000-0100",timezone:"Asia/Taipei",currency:"TWD",booking_state:"OPEN",online_booking_enabled:true,cover_image_path:media+"demo-salon.png"}});
      await tx.organization_memberships.create({data:{organization_id:org,profile_id:owner,role:"ORGANIZATION_OWNER",status:"ACTIVE",all_locations:true}});
      for(const [profileId,role] of [[provider,"SERVICE_PROVIDER"],[front,"FRONT_DESK"]]) await tx.location_memberships.create({data:{organization_id:org,location_id:location,profile_id:profileId,role,status:"ACTIVE"}});
      await tx.subscriptions.create({data:{id:id("subscription"),organization_id:org,plan_version_id:"00000000-0000-4000-8000-000000000201",status:"TRIALING",is_current:true,billing_period_start:now,billing_period_end:expiry,trial_ends_at:expiry}});
      await tx.organization_feature_overrides.create({data:{organization_id:org,feature_key:"CUSTOMER_BLACKLIST",override_type:"ALLOW",reason:"獨立本機展示，無實際收費或外部啟用",created_by:owner,expires_at:expiry}});
      await tx.location_booking_policies.create({data:{organization_id:org,location_id:location,slot_interval_minutes:30,minimum_lead_minutes:60,maximum_advance_days:60,hold_minutes:10,customer_cancellation_enabled:true,customer_reschedule_enabled:true,cancellation_cutoff_hours:24,deposits_enabled:false}});
      const skills=["臉部清潔","保濕導入","敏感肌照護","亮采修護","肩頸舒壓","芳香精油","筋膜放鬆","手部保養","足部保養","自然美睫","睫毛卸除","凝膠美甲","色彩搭配","肌膚諮詢","衛生消毒","頭皮舒壓"];
      for(const name of skills) await tx.$executeRaw`insert into public.staff_skill_catalog(id,organization_id,name) values(${id("skill:"+name)}::uuid,${org}::uuid,${name})`;
      for(let day=0;day<7;day++) await tx.$executeRaw`insert into public.location_business_hours(organization_id,location_id,day_of_week,opens_at,closes_at,is_closed) values(${org}::uuid,${location}::uuid,${day},'10:00'::time,'20:00'::time,false)`;
      const people=["林怡安","陳雅婷","許婉晴","黃品蓉"];
      for(const [i,name] of people.entries()) {
        const staff=id(`staff:${i}`);
        await tx.staff_profiles.create({data:{id:staff,organization_id:org,linked_profile_id:i===0 ? provider : null,display_name:name,title:i===0 ? "資深美容師" : "美容顧問",bio:"重視溝通與細緻照護，依膚況安排舒適的保養節奏。",photo_path:media+(i%2 ? "demo-beautician-senior.png" : "demo-beautician.png"),skills:i<3 ? skills.slice(0,8) : skills.slice(4),sort_order:i*10}});
        await tx.staff_location_assignments.create({data:{organization_id:org,location_id:location,staff_profile_id:staff,is_primary:true,is_active:true}});
        for(let day=0;day<7;day++) await tx.$executeRaw`insert into public.staff_availability_rules(organization_id,location_id,staff_profile_id,day_of_week,starts_at,ends_at,effective_from,is_active) values(${org}::uuid,${location}::uuid,${staff}::uuid,${day},'10:00'::time,'20:00'::time,'2026-01-01'::date,true)`;
      }
      const services=[
        ["水潤保濕護理","臉部保養",60,180000,"保濕導入"],
        ["舒敏修護療程","臉部保養",60,220000,"敏感肌照護"],
        ["亮采煥膚保養","臉部保養",60,240000,"亮采修護"],
        ["肩頸深層舒壓","身體舒壓",60,160000,"肩頸舒壓"],
        ["芳香全身放鬆","身體舒壓",60,200000,"芳香精油"],
        ["手部細緻保養","手足美學",60,120000,"手部保養"],
      ];
      for(const name of [...new Set(services.map(row=>row[1]))]) await tx.service_categories.create({data:{id:id("category:"+name),organization_id:org,name}});
      for(const [i,[name,category,duration,price,skill]] of services.entries()) {
        const service=id(`service:${i}`),variant=id(`variant:${i}`),localService=id(`location-service:${i}`);
        await tx.services.create({data:{id:service,organization_id:org,category_id:id("category:"+category),name,description:"諮詢、清潔、專業保養與居家照護建議。",booking_notice:"預約前一天可自行改期；如有特殊需求，請於備註告知。",online_booking_enabled:true,sort_order:i*10}});
        await tx.service_variants.create({data:{id:variant,organization_id:org,service_id:service,name:"標準療程",duration_minutes:duration,price_minor:price,is_default:true}});
        await tx.location_services.create({data:{id:localService,organization_id:org,location_id:location,service_id:service,service_variant_id:variant,required_skills:[skill],online_booking_enabled:true,sort_order:i*10}});
        for(let p=0;p<4;p++) {
          await tx.staff_service_assignments.create({data:{organization_id:org,staff_profile_id:id(`staff:${p}`),service_variant_id:variant}});
          await tx.service_staff_assignments.create({data:{id:id(`assignment:${i}:${p}`),organization_id:org,location_service_id:localService,staff_profile_id:id(`staff:${p}`),online_booking_enabled:true}});
        }
      }
      const resourceType=id("resource-type");
      await tx.resource_types.create({data:{id:resourceType,organization_id:org,name:"獨立療程室",kind:"SPA_ROOM"}});
      for(const [i,name] of ["沐光一室","花語二室","靜心三室"].entries()) await tx.resources.create({data:{id:id(`room:${i}`),organization_id:org,location_id:location,resource_type_id:resourceType,name,description:"服務前後皆進行清潔與整理。",sort_order:i}});
      const names=["李欣怡","王佩珊","陳韻涵","林詩婷","吳佳穎","張雅惠","蔡宜庭","許心妍","黃郁晴","劉宛蓉","鄭品萱","楊舒涵","郭思穎","謝婉君","洪佳玲","曾映潔","葉語彤","廖慧敏","蘇怡靜","潘美如","江淑芬","杜雅雯","彭予安","沈若晴"];
      const tag=id("tag");await tx.customer_tags.create({data:{id:tag,organization_id:org,name:"定期保養",color:"#0f766e"}});
      for(const [i,name] of names.entries()) {
        const customer=id(`customer:${i}`);
        await tx.customers.create({data:{id:customer,organization_id:org,display_name:name,birthday:new Date(`199${i%10}-${String(i%12+1).padStart(2,"0")}-15`),deposit_mode:i===2 ? "REQUIRED" : "DEFAULT",is_blacklisted:i===23,blacklisted_at:i===23 ? now : null,blacklist_reason:i===23 ? "多次未到店，請先聯繫確認（虛構示範）" : null}});
        await tx.customer_contacts.create({data:{organization_id:org,customer_id:customer,contact_type:"PHONE",value:`090000${String(i+1000)}`,normalized_value:`+88690000${String(i+1000)}`,is_primary:true}});
        await tx.customer_notes.create({data:{organization_id:org,customer_id:customer,note:i%2 ? "喜歡安靜的療程環境，下次可安排下午時段。" : "保養前先確認近期膚況，偏好清爽保濕。",created_by:owner}});
        if(i%3===0) await tx.customer_tag_assignments.create({data:{customer_id:customer,tag_id:tag,organization_id:org,assigned_by:owner}});
      }
      // Create historical and future terms once. Reruns never move appointments or reset user edits.
      for(let i=0;i<20;i++) {
        const future=i>=8,bundle=i>=18,serviceIndex=future ? 0 : i%services.length;
        const start=new Date(now);start.setUTCDate(start.getUTCDate()+(future ? i-6 : i-10));start.setUTCHours(3,0,0,0);
        const status=future ? "CONFIRMED" : i===6 ? "CANCELLED" : i===7 ? "NO_SHOW" : "COMPLETED";
        const total=services[serviceIndex][3]+(bundle ? services[1][3] : 0),booking=id(`booking:${i}`);
        await tx.bookings.create({data:{id:booking,organization_id:org,location_id:location,customer_id:id(`customer:${i}`),status,payment_status:status==="COMPLETED" ? "PAID" : "UNPAID",subtotal_minor:total,total_minor:total,paid_minor:status==="COMPLETED" ? total : 0,tracking_token_hash:createHash("sha256").update(booking).digest("hex"),is_test:true,source:"OTHER",public_note:bundle ? "希望安排連續療程，兩位美容師共同服務。" : "到店前請先確認肌膚狀況。",internal_note:"獨立展示店家虛構預約",confirmed_at:start,completed_at:status==="COMPLETED" ? new Date(start.getTime()+3600000) : null}});
        for(let part=0;part<(bundle ? 2 : 1);part++) {
          const index=part ? 1 : serviceIndex,segment=id(`segment:${i}:${part}`),from=new Date(start.getTime()+part*3600000),until=new Date(from.getTime()+3600000);
          await tx.booking_segments.create({data:{id:segment,organization_id:org,location_id:location,booking_id:booking,service_id:id(`service:${index}`),service_variant_id:id(`variant:${index}`),assigned_staff_id:id("staff:0"),service_name_snapshot:services[index][0],variant_name_snapshot:"標準療程",staff_name_snapshot:people[0],starts_at:from,ends_at:until,duration_minutes:60,price_minor:services[index][3],sort_order:part}});
          for(const p of bundle ? [0,1] : [0]) await tx.booking_staff_allocations.create({data:{organization_id:org,location_id:location,booking_id:booking,booking_segment_id:segment,staff_profile_id:id(`staff:${p}`),starts_at:from,ends_at:until,is_blocking:future}});
        }
      }
      for(const index of [0,1]) {
        const assignment=id(`assignment:${index}:0`);
        await tx.$executeRaw`update public.service_staff_assignments set effective_until=${now} where id=${assignment}::uuid and organization_id=${org}::uuid`;
        await tx.$executeRaw`insert into public.staff_capability_events(organization_id,location_id,assignment_id,actor_profile_id,effective_from,effective_until,online_booking_enabled,walk_in_eligible,reason) values(${org}::uuid,${location}::uuid,${assignment}::uuid,${owner}::uuid,'2020-01-01'::timestamptz,${now},true,true,'進修期間資格調整，請商家確認改派（虛構示範）')`;
      }
      await tx.merchant_setup_progress.create({data:{organization_id:org,brand_completed_at:now,location_completed_at:now,business_hours_completed_at:now,service_completed_at:now,staff_completed_at:now,resource_completed_at:now,policies_completed_at:now,last_step:"NOTIFICATIONS"}});
    }
    const after=await snapshot(tx);
    if(JSON.stringify(before)!==JSON.stringify(after)) throw Error("Existing tenant data changed; rolling back showcase creation.");
    return {created:!existing && process.argv.includes("--apply"),existingRecordsPreserved:true,before,after,organization:"showcase",location:"daan",customers:await tx.customers.count({where:{organization_id:org}}),bookings:await tx.bookings.count({where:{organization_id:org}})};
  },{timeout:60000,isolationLevel:"Serializable"});
  mkdirSync(".dev-logs",{recursive:true});
  writeFileSync(`.dev-logs/isolated-showcase-${Date.now()}.json`,JSON.stringify(result,null,2));
  console.log(JSON.stringify(result,null,2));
} catch(error) {
  console.error(error instanceof Error ? error.message : "Showcase creation failed.");
  process.exitCode=1;
} finally {await db.$disconnect();}
