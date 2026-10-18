import { OnboardingRoute } from "@/components/onboarding-route";

export const dynamic = "force-dynamic";

export default function EditOnboardingPage() {
  return <OnboardingRoute requestedPath="/onboarding/edit" />;
}
