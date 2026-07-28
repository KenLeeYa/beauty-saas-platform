import { redirect } from "next/navigation";

import { ScopeSelector } from "@/components/scope-selector";
import { getCurrentSession } from "@/server/auth/session";
import { getSessionOrganizationSelections } from "@/server/auth/selection";

export const dynamic = "force-dynamic";

export default async function SelectOrganizationPage() {
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
        description: `${organization.locations.length} 間分店 · ${organization.role}`,
        href: organization.destination,
      }))}
    />
  );
}
