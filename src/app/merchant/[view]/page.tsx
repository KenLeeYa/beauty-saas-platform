import { notFound } from "next/navigation";

import {
  MerchantRoute,
  type MerchantView,
} from "@/components/merchant-route";

export const dynamic = "force-dynamic";

const merchantViews = new Set<MerchantView>([
  "dashboard",
  "calendar",
  "bookings",
  "customers",
  "services",
  "staff",
  "resources",
  "locations",
  "reports",
  "team",
  "subscription",
  "billing",
  "settings",
  "setup",
]);

export default async function MerchantViewPage({
  params,
  searchParams,
}: {
  params: Promise<{
    view: string;
  }>;
  searchParams: Promise<{
    organization?: string;
    location?: string;
  }>;
}) {
  const { view } = await params;
  if (!merchantViews.has(view as MerchantView)) {
    notFound();
  }

  return (
    <MerchantRoute
      activeView={view as MerchantView}
      searchParams={searchParams}
    />
  );
}
