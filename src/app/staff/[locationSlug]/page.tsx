import { notFound, redirect } from "next/navigation";

import { StaffWorkspace } from "@/components/staff-workspace";
import { getCurrentSession } from "@/server/auth/session";
import { AppError } from "@/server/http/errors";
import { getStaffWorkspaceData } from "@/server/staff/data";

export const dynamic = "force-dynamic";

export default async function StaffPage({
  params,
}: {
  params: Promise<{
    locationSlug: string;
  }>;
}) {
  const session = await getCurrentSession();
  if (!session) {
    redirect("/");
  }
  const { locationSlug } = await params;

  let data;
  try {
    data = await getStaffWorkspaceData({
      session,
      locationSlug,
    });
  } catch (error) {
    if (
      error instanceof AppError &&
      ["NOT_FOUND", "FORBIDDEN"].includes(error.code)
    ) {
      notFound();
    }
    throw error;
  }

  return <StaffWorkspace initialData={data} />;
}
