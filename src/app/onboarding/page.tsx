import { OnboardingRoute } from "@/components/onboarding-route";

export const dynamic = "force-dynamic";

export default function OnboardingPage() {
  return <OnboardingRoute requestedPath="/onboarding" />;
}
