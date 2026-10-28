import { forbidden, redirect } from "next/navigation";

import { MerchantWorkspace } from "@/components/merchant-workspace";
import { getCurrentSession } from "@/server/auth/session";
import { hasCapability } from "@/server/authorization/capabilities";
import { resolveMerchantContext } from "@/server/merchant/context";
import { getMerchantWorkspaceData } from "@/server/merchant/data";
import { canShowModule } from "@/server/entitlements/module-visibility";
import {getMerchantTeam} from "@/server/merchant/team";

export type MerchantView =
  | "dashboard"
  | "calendar"
  | "bookings"
  | "customers"
  | "services"
  | "staff"
  | "resources"
  | "locations"
  | "reports"
  | "operations"
  | "team"
  | "subscription"
  | "billing"
  | "settings"
  | "setup";

export async function MerchantRoute({
  activeView,
  searchParams,
}: {
  activeView: MerchantView;
  searchParams: Promise<{
    organization?: string;
    location?: string;
  }>;
}) {
  const session = await getCurrentSession();
  if (!session) {
    redirect("/");
  }
  const query = await searchParams;
  const context = await resolveMerchantContext({
    session,
    organizationSlug: query.organization,
    locationSlug: query.location,
  });
  const staffOnly =
    hasCapability(context.roles, "booking.own.read") &&
    !hasCapability(context.roles, "booking.read");
  if (staffOnly && context.location) {
    redirect(`/staff/${encodeURIComponent(context.location.slug)}`);
  }
  const crmVisible=await canShowModule(context,"CUSTOMER_CRM");
  if(activeView==="customers" && !crmVisible) forbidden();
  if(activeView==="team" && !hasCapability(context.roles,"team.read")) forbidden();
  const data = await getMerchantWorkspaceData(context, {
    pagedCatalog: activeView === "services" || activeView === "staff",
    pagedFacilities: activeView === "locations" || activeView === "resources",
  });
  const workspaceRevision = [
    context.organization.id,
    context.location?.id ?? "organization",
    activeView,
  ].join(":");

  return (
    <MerchantWorkspace
      activeView={activeView}
      initialData={data}
      crmVisible={crmVisible}
      teamData={activeView === "team" ? await getMerchantTeam(context) : []}
      key={workspaceRevision}
    />
  );
}
