import { redirect } from "next/navigation";

import { ScopeSelector } from "@/components/scope-selector";
import { getCurrentSession } from "@/server/auth/session";
import { getSessionOrganizationSelections } from "@/server/auth/selection";

export const dynamic = "force-dynamic";

export default async function SelectLocationPage({
  searchParams,
}: {
  searchParams: Promise<{
    organization?: string;
  }>;
}) {
  const session = await getCurrentSession();
  if (!session) {
    redirect("/?next=/select-location");
  }
  if (session.platformRole === "PLATFORM_ADMIN") {
    redirect("/admin/organizations");
  }

  const { organization: organizationSlug } = await searchParams;
  const organizations = await getSessionOrganizationSelections(
    session.profileId,
  );
  const selectedOrganization = organizationSlug
    ? organizations.find(
        (organization) => organization.slug === organizationSlug,
      )
    : organizations.length === 1
      ? organizations[0]
      : null;

  if (!selectedOrganization) {
    redirect("/select-organization");
  }
  if (selectedOrganization.locations.length === 0) {
    redirect(selectedOrganization.destination);
  }

  return (
    <ScopeSelector
      displayName={session.displayName}
      kind="location"
      options={selectedOrganization.locations.map((location) => ({
        id: location.id,
        title: location.name,
        description: `${selectedOrganization.name} · ${location.role}`,
        href: location.destination,
      }))}
    />
  );
}
