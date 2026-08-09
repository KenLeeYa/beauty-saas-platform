import { redirect } from "next/navigation";

import { MerchantWorkspace } from "@/components/merchant-workspace";
import { getCurrentSession } from "@/server/auth/session";
import { hasCapability } from "@/server/authorization/capabilities";
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
  const staffOnly =
    hasCapability(context.roles, "booking.own.read") &&
    !hasCapability(context.roles, "booking.read");
  if (staffOnly && context.location) {
    redirect(`/staff/${encodeURIComponent(context.location.slug)}`);
  }
  const data = await getMerchantWorkspaceData(context);
  const entityRevision =
    activeView === "services"
      ? data.services.map((service) => service.locationServiceId)
      : activeView === "staff"
        ? data.staff.map((staff) => staff.id)
        : activeView === "resources"
          ? data.resources.map((resource) => resource.id)
          : activeView === "customers"
            ? data.customers.map((customer) => customer.id)
            : [];
  const workspaceRevision = [
    context.organization.id,
    context.location?.id ?? "organization",
    activeView,
    ...entityRevision,
  ].join(":");

  return (
    <MerchantWorkspace
      activeView={activeView}
      initialData={data}
      key={workspaceRevision}
    />
  );
}
