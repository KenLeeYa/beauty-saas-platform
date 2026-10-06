import type { PrismaClient } from "@prisma/client";

export async function enableSyntheticMemberEntitlement(prisma: PrismaClient,
  organizationId: string, ownerId: string): Promise<string> {
  const override = await prisma.organization_feature_overrides.create({ data: {
    organization_id: organizationId, feature_key: "MEMBERSHIPS_PACKAGES",
    override_type: "ALLOW", reason: "Synthetic member ledger integration test",
    created_by: ownerId,
  }, select: { id: true } });
  return override.id;
}
