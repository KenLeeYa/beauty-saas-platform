import { redirect } from "next/navigation";

import { LogoutButton } from "@/components/logout-button";
import { MerchantApplicationReview } from "@/components/merchant-application-review";
import { PlatformNavigation } from "@/components/platform-navigation";
import { getCurrentSession } from "@/server/auth/session";
import { getAdminMerchantApplications } from "@/server/onboarding/data";

export const dynamic = "force-dynamic";

export default async function MerchantApplicationsPage() {
  const session = await getCurrentSession();
  if (!session) {
    redirect("/");
  }
  if (session.platformRole !== "PLATFORM_ADMIN") {
    redirect("/merchant");
  }

  return (
    <main className="min-h-screen bg-mist">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div>
            <p className="text-xs font-semibold text-teal">平台管理</p>
            <h1 className="mt-1 text-xl font-semibold text-ink">
              商家申請審核
            </h1>
          </div>
          <LogoutButton />
        </div>
      </header>
      <PlatformNavigation />
      <div className="mx-auto max-w-7xl px-4 py-7 sm:px-6">
        <MerchantApplicationReview
          data={await getAdminMerchantApplications(session)}
        />
      </div>
    </main>
  );
}
