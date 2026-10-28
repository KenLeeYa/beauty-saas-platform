import { redirect } from "next/navigation";

import { ScopeSelector } from "@/components/scope-selector";
import { getLanguage } from "@/lib/i18n/server";
import { translate } from "@/lib/i18n/messages";
import { getCurrentSession } from "@/server/auth/session";
import { getSessionOrganizationSelections } from "@/server/auth/selection";

export const dynamic = "force-dynamic";

export default async function SelectOrganizationPage() {
  const { locale } = await getLanguage();
  const t = (key: string) => translate(locale, key);
  const session = await getCurrentSession();
  if (!session) {
    redirect("/?next=/select-organization");
  }
  if (session.platformRole === "PLATFORM_ADMIN") {
    redirect("/admin/organizations");
  }

  const organizations = await getSessionOrganizationSelections(
    session.profileId,
  );
  if (organizations.length === 0) {
    redirect("/onboarding");
  }

  return (
    <ScopeSelector
      displayName={session.displayName}
      kind="organization"
      options={organizations.map((organization) => ({
        id: organization.id,
        title: organization.name,
        description: `${t("分店數：")} ${organization.locations.length} · ${t(organization.role)}`,
        href: organization.destination,
      }))}
    />
  );
}
