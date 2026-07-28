import { redirect } from "next/navigation";

import { MerchantWorkspace } from "@/components/merchant-workspace";
import { getCurrentSession } from "@/server/auth/session";
import { resolveMerchantContext } from "@/server/merchant/context";
import { getMerchantWorkspaceData } from "@/server/merchant/data";

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
  const data = await getMerchantWorkspaceData(context);

  return <MerchantWorkspace activeView={activeView} initialData={data} />;
}
