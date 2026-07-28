import { notFound, redirect } from "next/navigation";

import { PlatformOrganizationDetail } from "@/components/platform-organization-detail";
import { getPlatformOrganizationDetail } from "@/server/admin/data";
import { getCurrentSession } from "@/server/auth/session";
import { AppError } from "@/server/http/errors";

export const dynamic = "force-dynamic";

export default async function PlatformOrganizationDetailPage({
  params,
}: {
  params: Promise<{
    organizationId: string;
  }>;
}) {
  const session = await getCurrentSession();
  if (!session) {
    redirect("/");
  }
  if (session.platformRole !== "PLATFORM_ADMIN") {
    notFound();
  }
  const { organizationId } = await params;

  let data;
  try {
    data = await getPlatformOrganizationDetail(
      session,
      organizationId,
    );
  } catch (error) {
    if (error instanceof AppError && error.code === "NOT_FOUND") {
      notFound();
    }
    throw error;
  }

  return (
    <PlatformOrganizationDetail
      data={data}
      displayName={session.displayName}
    />
  );
}
