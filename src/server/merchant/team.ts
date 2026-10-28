import "server-only";
import {assertCapability, requireLocation, type OrganizationContext} from "../authorization/context";
import {prisma} from "../database/prisma";

export async function getMerchantTeam(context: OrganizationContext) {
  assertCapability(context,"team.read");
  const location=requireLocation(context);
  const organizationMembers=await prisma.organization_memberships.findMany({
    where:{organization_id:context.organization.id,OR:[{all_locations:true},{role:"ORGANIZATION_OWNER"},
      {profiles:{location_memberships:{some:{organization_id:context.organization.id,location_id:location.id,status:"ACTIVE"}}}}]},
    select:{id:true,role:true,status:true,all_locations:true,profiles:{select:{display_name:true,is_active:true}}},orderBy:{created_at:"asc"},
  });
  const locationMembers=await prisma.location_memberships.findMany({
    where:{organization_id:context.organization.id,location_id:location.id},
    select:{id:true,role:true,status:true,profiles:{select:{display_name:true,is_active:true}}},orderBy:{created_at:"asc"},
  });
  return [...organizationMembers.map(row=>({...row,scope:row.all_locations || row.role==="ORGANIZATION_OWNER" ? "organization" as const : "location" as const})),
    ...locationMembers.map(row=>({...row,scope:"location" as const}))].map(row=>({
      id:row.id, name:row.profiles.display_name, role:row.role, status:row.profiles.is_active ? row.status : "INACTIVE",
      scope:row.scope,
    }));
}
export type MerchantTeamData = Awaited<ReturnType<typeof getMerchantTeam>>;
