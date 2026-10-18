import "server-only";

import { Prisma } from "@prisma/client";

import { isRole } from "../authorization/capabilities";
import { prisma } from "../database/prisma";
import { sha256 } from "../security/crypto";
import { resolveVerifiedMobileActor, type VerifiedMobileActor } from "./line-mobile-session";

type SessionRow = {
  sessionId: string;
  organizationId: string;
  locationId: string;
  sessionExpiresAt: Date;
  sessionRevokedAt: Date | null;
  linkRevokedAt: Date | null;
  actorKind: string;
  profileId: string | null;
  customerId: string | null;
  profileActive: boolean | null;
  customerActive: boolean | null;
  approvedAt: Date | null;
};

export async function resolveLineActor(
  sessionToken: string,
  organizationId: string,
  locationId: string,
): Promise<VerifiedMobileActor | null> {
  if (!sessionToken || sessionToken.length < 32 || sessionToken.length > 256) return null;
  const rows = await prisma.$queryRaw<SessionRow[]>(Prisma.sql`
    select session.id as "sessionId", session.organization_id as "organizationId",
      session.location_id as "locationId", session.expires_at as "sessionExpiresAt",
      session.revoked_at as "sessionRevokedAt", link.revoked_at as "linkRevokedAt",
      link.actor_kind as "actorKind", link.profile_id as "profileId",
      link.customer_id as "customerId", profile.is_active as "profileActive",
      customer.is_active as "customerActive",
      link.approved_at as "approvedAt"
    from public.line_mobile_sessions session
    join public.line_identity_links link on link.id = session.identity_link_id
      and link.organization_id = session.organization_id
    left join public.profiles profile on profile.id = link.profile_id
    left join public.customers customer on customer.id = link.customer_id
      and customer.organization_id = link.organization_id
    where session.token_hash = ${sha256(sessionToken)}
      and session.organization_id = ${organizationId}::uuid
      and session.location_id = ${locationId}::uuid
    limit 1
  `);
  const row = rows[0];
  if (!row || (row.actorKind !== "CUSTOMER" && row.actorKind !== "EMPLOYEE") ||
      (row.actorKind === "EMPLOYEE" && !row.approvedAt)) return null;

  const [organizationMemberships, locationMemberships] = row.profileId ? await Promise.all([
    prisma.organization_memberships.findMany({
      where: { organization_id: organizationId, profile_id: row.profileId, status: "ACTIVE" },
      select: { role: true, all_locations: true },
    }),
    prisma.location_memberships.findMany({
      where: { organization_id: organizationId, location_id: locationId,
        profile_id: row.profileId, status: "ACTIVE" },
      select: { role: true, location_id: true },
    }),
  ]) : [[], []];
  const memberships = [
    ...organizationMemberships.filter((membership) => isRole(membership.role)).map((membership) => ({
      role: membership.role, organizationId, locationId: null,
      active: true, allLocations: membership.all_locations,
    })),
    ...locationMemberships.filter((membership) => isRole(membership.role)).map((membership) => ({
      role: membership.role, organizationId, locationId: membership.location_id,
      active: true, allLocations: false,
    })),
  ];
  return resolveVerifiedMobileActor({
    ...row, actorKind: row.actorKind, profileActive: Boolean(row.profileActive),
    customerActive: Boolean(row.customerActive), memberships,
  }, organizationId, locationId);
}
