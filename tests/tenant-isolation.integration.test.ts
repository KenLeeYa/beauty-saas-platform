import { loadEnvConfig } from "@next/env";
import { expect, it } from "vitest";

it.skipIf(!process.env.UNIFIED_TEST_DATABASE_URL)(
  "keeps each store owner outside the other tenant",
  async () => {
    loadEnvConfig(process.cwd());
    const [{ prisma }, { randomToken }, { resolveOrganizationContext }] =
      await Promise.all([
        import("../src/server/database/prisma"),
        import("../src/server/security/crypto"),
        import("../src/server/authorization/context"),
      ]);
    const suffix = randomToken(8).replace(/[^a-zA-Z0-9]/g, "a").toLowerCase();
    const organization = await prisma.organizations.create({ data: {
      name: "Other synthetic store", business_name: "Other synthetic store",
      slug: `isolated-${suffix}`, email: `owner-${suffix}@example.test`, phone: "",
    }, select: { id: true, slug: true } });
    {
      const location = await prisma.locations.create({ data: {
        organization_id: organization.id, name: "Other location",
        slug: `other-${suffix}`, code: `ISO-${suffix}`,
      }, select: { slug: true } });
      const otherOwner = await prisma.profiles.create({ data: {
        email: `other-${suffix}@example.test`, display_name: "Other owner",
      }, select: { id: true } });
      await prisma.organization_memberships.create({ data: {
        organization_id: organization.id, profile_id: otherOwner.id,
        role: "ORGANIZATION_OWNER", status: "ACTIVE", all_locations: true,
      } });
      const primary = await prisma.organizations.findUniqueOrThrow({
        where: { id: "11111111-1111-4111-8111-111111111111" },
        select: { slug: true },
      });
      const session = (profileId: string) => ({ id: randomToken(16), profileId,
        email: "synthetic@example.test", displayName: "Synthetic", platformRole: null,
        expiresAt: new Date(Date.now() + 60_000), csrfTokenHash: "" });
      const primaryOwner = session("33333333-3333-4333-8333-333333333301");
      expect((await resolveOrganizationContext({ session: primaryOwner,
        organizationSlug: primary.slug })).organization.slug).toBe(primary.slug);
      await expect(resolveOrganizationContext({ session: primaryOwner,
        organizationSlug: organization.slug, locationSlug: location.slug }))
        .rejects.toMatchObject({ status: 404 });
      const otherSession = session(otherOwner.id);
      expect((await resolveOrganizationContext({ session: otherSession,
        organizationSlug: organization.slug, locationSlug: location.slug }))
        .organization.slug).toBe(organization.slug);
      await expect(resolveOrganizationContext({ session: otherSession,
        organizationSlug: primary.slug })).rejects.toMatchObject({ status: 404 });
    }
  },
);
