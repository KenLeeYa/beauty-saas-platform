import { OnboardingRoute } from "@/components/onboarding-route";

export const dynamic = "force-dynamic";

export default function OnboardingStatusPage() {
  return <OnboardingRoute requestedPath="/onboarding/status" />;
}
