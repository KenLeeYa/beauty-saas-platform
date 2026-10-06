import { forbidden, redirect } from "next/navigation";

import { OperationsReview } from "./review";
import { getCurrentSession } from "@/server/auth/session";
import { hasCapability } from "@/server/authorization/capabilities";
import { resolveMerchantContext } from "@/server/merchant/context";

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
    location={context.location.slug} />;
}
