import { redirect } from "next/navigation";

import { PlatformOverview } from "@/components/platform-overview";
import { getPlatformOverviewData } from "@/server/admin/data";
import { getCurrentSession } from "@/server/auth/session";

export const dynamic = "force-dynamic";

export default async function PlatformOrganizationsPage() {
  const session = await getCurrentSession();
  if (!session) {
    redirect("/");
  }
  if (session.platformRole !== "PLATFORM_ADMIN") {
    redirect("/merchant");
  }

  return <PlatformOverview data={await getPlatformOverviewData(session)} />;
}
