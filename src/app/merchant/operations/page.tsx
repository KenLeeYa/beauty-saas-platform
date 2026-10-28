import { forbidden, redirect } from "next/navigation";

import { OperationsReview } from "./review";
import { getCurrentSession } from "@/server/auth/session";
import { hasCapability } from "@/server/authorization/capabilities";
import { resolveMerchantContext } from "@/server/merchant/context";
import { canShowModule } from "@/server/entitlements/module-visibility";

export const dynamic = "force-dynamic";

export default async function OperationsPage({ searchParams }: { searchParams: Promise<{
  organization?: string; location?: string }> }) {
  const session = await getCurrentSession();
  if (!session) redirect("/");
  const scope = await searchParams;
  const context = await resolveMerchantContext({ session,
    organizationSlug: scope.organization, locationSlug: scope.location });
  if (!context.location || (!hasCapability(context.roles, "staff.manage") &&
      !hasCapability(context.roles, "billing.read"))) forbidden();
  return <OperationsReview organization={context.organization.slug}
    organizationName={context.organization.name} identity={session.displayName}
    crmVisible={await canShowModule(context, "CUSTOMER_CRM")}
    teamVisible={hasCapability(context.roles,"team.read")}
    location={context.location.slug} locationName={context.location.name} timezone={context.location.timezone} />;
}
