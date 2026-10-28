import {Client} from "pg";
import {mkdirSync, writeFileSync} from "node:fs";

const url = new URL(process.env.DATABASE_URL || "postgresql://invalid/invalid");
if (process.env.APP_ENV !== "test" || process.env.UNIFIED_LOCAL_TRIAL !== "true" ||
    url.hostname !== "127.0.0.1" || url.port !== "56863" || url.pathname !== "/beauty_msi_20261009") {
  throw Error("Showcase data is restricted to the retained MSI synthetic database.");
}
const organization = "11111111-1111-4111-8111-111111111111";
const client = new Client({connectionString:url.toString()});
await client.connect();
try {
  const identity = await client.query("select name,slug from organizations where id=$1",[organization]);
  if (identity.rows[0]?.slug !== "demo") throw Error("Synthetic organization identity mismatch.");
  const inventory = {};
  for (const [table, field] of [["locations","name"],["staff_profiles","display_name"],["customers","display_name"],["services","name"],["resources","name"]]) {
    const result = await client.query(`select id,${field} as name from ${table} where organization_id=$1 order by id`,[organization]);
    inventory[table] = result.rows;
  }
  console.log(JSON.stringify(Object.fromEntries(Object.entries(inventory).map(([table,rows])=>[table,{count:rows.length,samples:rows.slice(0,5).map(row=>row.name)}])),null,2));
  if (process.argv.includes("--apply")) {
    const changes = [];
    const media = `tenants/${organization}/demo/`;
    const surnames = [..."陳林黃張李王吳劉蔡楊許鄭謝郭洪曾"];
    const first = [..."怡雅佳欣婉淑思詩佩語映宛郁宜慧品"];
    const last = [..."安婷涵雯萱君玲瑜潔蓉珊甄庭寧妍晴"];
    const personName = index => surnames[index % 16] + first[Math.floor(index / 16) % 16] + last[Math.floor(index / 256) % 16];
    const serviceNames = ["水潤保濕護理","淨膚調理療程","肩頸舒壓","芳香精油舒壓","輕盈美睫設計","手部凝膠美甲","足部深層保養","亮采修護療程"];
    const branches = ["信義光感館","大安靜心館","中山花語館","板橋晴光館","新竹竹北館","台中綠園館","台南沐光館","高雄美麗館"];
    const syntheticName = value => !/\p{Script=Han}/u.test(value) || /^(QA|Synthetic|Bundle|Skill|Eligibility|Local)\b|^(手機測試|實機\d|測試|注音)/i.test(value);
    const usedNames = Object.fromEntries(Object.entries(inventory).map(([table,rows])=>[table,new Set(rows.map(row=>row.name))]));
    function uniqueName(table, base, initial) {
      let serial=initial;
      while (usedNames[table].has(`${base} ${serial}`)) serial++;
      const value=`${base} ${serial}`;
      usedNames[table].add(value);
      return value;
    }
    async function change(table, id, values) {
      const keys=Object.keys(values);
      const before=(await client.query(`select ${keys.join(",")} from ${table} where id=$1 and organization_id=$2`,[id,organization])).rows[0];
      if (!before || keys.every(key=>before[key]===values[key])) return;
      changes.push({table,id,before,after:values});
      await client.query(`update ${table} set ${keys.map((key,i)=>`${key}=$${i+3}`).join(",")} where id=$1 and organization_id=$2`,[id,organization,...Object.values(values)]);
    }
    await client.query("begin");
    try {
      const preserved = await client.query("select md5(string_agg(to_jsonb(b)::text,'' order by id)) as digest from bookings b where organization_id=$1",[organization]);
      const outsideBefore=await client.query("select md5(string_agg(row_to_json(s)::text,'' order by id)) as digest from staff_profiles s where organization_id<>$1",[organization]);
      for (const [i,row] of inventory.staff_profiles.entries()) {
        if (syntheticName(row.name)) await change("staff_profiles",row.id,{display_name:personName(i),title:"專業美容師",bio:"重視溝通與舒適節奏，提供細緻的美學保養服務。",photo_path:media+(i%2 ? "demo-beautician-senior.png" : "demo-beautician.png")});
        const canonicalOrder={"44444444-4444-4444-8444-444444444401":10,"44444444-4444-4444-8444-444444444402":20};
        await change("staff_profiles",row.id,{sort_order:canonicalOrder[row.id] ?? 100+i});
      }
      for (const [i,row] of inventory.customers.entries()) {
        if (syntheticName(row.name)) await change("customers",row.id,{display_name:personName(i+500)});
      }
      for (const [i,row] of inventory.services.entries()) {
        if (syntheticName(row.name)) await change("services",row.id,{name:uniqueName("services",serviceNames[i%8],i+1),description:"依膚況與個人需求調整服務內容，預約前由美容師確認適合的保養方式。"});
      }
      for (const [i,row] of inventory.resources.entries()) {
        if (syntheticName(row.name)) await change("resources",row.id,{name:uniqueName("resources",["沐光療程室","靜心舒壓室","花語美睫區","晴光美甲席"][i%4],i+1),description:"採預約制安排，每次服務後清潔與整理。"});
      }
      for (const [i,row] of inventory.locations.entries()) {
        const values={cover_image_path:media+"demo-salon.png"};
        if (syntheticName(row.name)) Object.assign(values,{name:uniqueName("locations",branches[i%8],Math.floor(i/8)+1),description:"預約制美學空間，提供美容、美體與放鬆保養。"});
        await change("locations",row.id,values);
      }
      // Only the two canonical fictional staff have curated public identities.
      await change("staff_profiles","44444444-4444-4444-8444-444444444401",{display_name:"林怡安",title:"資深美容師",photo_path:media+"demo-beautician.png",sort_order:10});
      await change("staff_profiles","44444444-4444-4444-8444-444444444402",{display_name:"陳雅婷",title:"美學顧問",photo_path:media+"demo-beautician-senior.png",sort_order:20});
      const brandBefore=(await client.query("select name,business_name,brand_description,brand_cover_image_path from organizations where id=$1",[organization])).rows[0];
      const brandAfter={name:"光感美學",business_name:"光感美學工作室",brand_description:"本機虛構示範品牌，專注臉部保養、美睫與身體舒壓。",brand_cover_image_path:media+"demo-salon.png"};
      if (Object.entries(brandAfter).some(([key,value])=>brandBefore[key]!==value)) {
        changes.push({table:"organizations",id:organization,before:brandBefore,after:brandAfter});
        await client.query("update organizations set name=$2,business_name=$3,brand_description=$4,brand_cover_image_path=$5 where id=$1",[organization,...Object.values(brandAfter)]);
      }
      const after=await client.query("select md5(string_agg(to_jsonb(b)::text,'' order by id)) as digest from bookings b where organization_id=$1",[organization]);
      const outsideAfter=await client.query("select md5(string_agg(row_to_json(s)::text,'' order by id)) as digest from staff_profiles s where organization_id<>$1",[organization]);
      if (preserved.rows[0].digest!==after.rows[0].digest || outsideBefore.rows[0].digest!==outsideAfter.rows[0].digest) throw Error("Preservation verification failed.");
      mkdirSync(".dev-logs",{recursive:true});
      const receipt=`.dev-logs/showcase-${Date.now()}.json`;
      writeFileSync(receipt,JSON.stringify({organization,fictional:true,changes,bookingsPreserved:true,otherTenantStaffPreserved:true},null,2));
      await client.query("commit");
      console.log(JSON.stringify({updated:changes.length,receipt,bookingsPreserved:true,otherTenantStaffPreserved:true}));
    } catch (error) {await client.query("rollback");throw error;}
  }
} finally {await client.end();}
