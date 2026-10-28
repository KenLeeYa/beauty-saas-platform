import { getLanguage } from "@/lib/i18n/server";
import { translate } from "@/lib/i18n/messages";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { LogoutButton } from "@/components/logout-button";
import { OrganizationFeatureControls } from "@/components/organization-feature-controls";
import { PlatformNavigation } from "@/components/platform-navigation";
import { getAdminOrganizationFeatures } from "@/server/admin/features";
import { getCurrentSession } from "@/server/auth/session";

export const dynamic = "force-dynamic";

export default async function OrganizationFeaturesPage({
  params,
}: {
  params: Promise<{
    organizationId: string;
  }>;
}) {
  const { locale } = await getLanguage();
  const t = (key: string) => translate(locale, key);
  const session = await getCurrentSession();
  if (!session) {
    redirect("/");
  }
  if (session.platformRole !== "PLATFORM_ADMIN") {
    redirect("/merchant");
  }
  const parsed = z.uuid().safeParse((await params).organizationId);
  if (!parsed.success) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-mist">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div>
            <p className="text-xs font-semibold text-teal">{t("平台管理")}</p>
            <h1 className="mt-1 text-xl font-semibold text-ink">
              {t("商家功能權益")}</h1>
          </div>
          <LogoutButton />
        </div>
      </header>
      <PlatformNavigation />
      <div className="mx-auto max-w-7xl px-4 py-7 sm:px-6">
        <OrganizationFeatureControls
          data={await getAdminOrganizationFeatures(
            session,
            parsed.data,
          )}
        />
      </div>
    </main>
  );
}
