import { redirect } from "next/navigation";

import { getCurrentSession } from "@/server/auth/session";
import { getApplicantOnboardingData } from "@/server/onboarding/data";

import { MerchantApplicationForm } from "./merchant-application-form";

export async function OnboardingRoute({
  requestedPath,
}: {
  requestedPath: string;
}) {
  const session = await getCurrentSession();
  if (!session) {
    redirect(`/?next=${encodeURIComponent(requestedPath)}`);
  }
  if (session.platformRole === "PLATFORM_ADMIN") {
    redirect("/admin/merchant-applications");
  }

  return (
    <MerchantApplicationForm
      data={await getApplicantOnboardingData(session)}
    />
  );
}
