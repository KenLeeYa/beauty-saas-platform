import "server-only";

import { Prisma } from "@prisma/client";

import { prisma } from "../database/prisma";
import { getServerEnv } from "../env";
import { AppError } from "../http/errors";
import { resolveStoreLineChannel } from "../notifications/line-channel-registry";
import { getStoreLineLoginChannel } from "../notifications/line-channel-registry";
import { hmacSha256, randomToken, sha256 } from "../security/crypto";
import { assertCapability, requireLocation, type OrganizationContext } from "../authorization/context";
import type { VerifiedLineIdentity } from "./line-identity";

type LinkRow = {
  id: string;
  actorKind: string;
  profileId: string | null;
  customerId: string | null;
  approvedAt: Date | null;
  profileActive: boolean | null;
  customerActive: boolean | null;
};

export function lineSubjectHash(identity: VerifiedLineIdentity): string {
  return hmacSha256(getServerEnv().TOKEN_DERIVATION_SECRET,
    `line:${identity.providerId}:${identity.subject}`);
}

export async function resolveApprovedEmployeeLineProfile(input: {
  organizationId: string;
  locationId: string;
  channelId: string;
  identity: VerifiedLineIdentity;
}): Promise<{ linkId: string; profileId: string }> {
  const channel = await resolveStoreLineChannel(input.organizationId,
    input.locationId, input.channelId);
  if (!channel || channel.providerId !== input.identity.providerId) {
    throw new AppError("FORBIDDEN", "LINE channel does not match store", 403);
  }
  const rows = await prisma.$queryRaw<{ linkId: string; profileId: string }[]>(Prisma.sql`
    select link.id as "linkId", link.profile_id as "profileId"
    from public.line_identity_links link
    join public.profiles profile on profile.id = link.profile_id
    where link.organization_id = ${input.organizationId}::uuid
      and link.provider_id = ${input.identity.providerId}
      and link.subject_hash = ${lineSubjectHash(input.identity)}
      and link.actor_kind = 'EMPLOYEE' and link.approved_at is not null
      and link.revoked_at is null and profile.is_active
      and profile.platform_role is null
      and (exists (select 1 from public.organization_memberships membership
        where membership.organization_id = link.organization_id
          and membership.profile_id = link.profile_id
          and membership.status = 'ACTIVE' and membership.all_locations)
        or exists (select 1 from public.location_memberships membership
          where membership.organization_id = link.organization_id
            and membership.location_id = ${input.locationId}::uuid
            and membership.profile_id = link.profile_id
            and membership.status = 'ACTIVE'))
    limit 1
  `);
  if (!rows[0]) throw new AppError("FORBIDDEN", "Approved employee LINE link required", 403);
  return rows[0];
}

export async function ensureCustomerLineLink(input: {
  organizationId: string;
  locationId: string;
  channelId: string;
  identity: VerifiedLineIdentity;
}): Promise<string> {
  const channel = await resolveStoreLineChannel(input.organizationId, input.locationId, input.channelId);
  if (!channel || channel.providerId !== input.identity.providerId) {
    throw new AppError("FORBIDDEN", "LINE channel does not match store", 403);
  }
  const subjectHash = lineSubjectHash(input.identity);
  const findExisting = () => prisma.$queryRaw<{ customerId: string }[]>(Prisma.sql`
    select customer_id as "customerId" from public.line_identity_links
    where organization_id = ${input.organizationId}::uuid
      and provider_id = ${input.identity.providerId}
      and subject_hash = ${subjectHash}
      and actor_kind = 'CUSTOMER' and revoked_at is null
    limit 1
  `);
  const existing = await findExisting();
  if (existing[0]) return existing[0].customerId;
  try {
    return await prisma.$transaction(async (transaction) => {
      const customer = await transaction.customers.create({
        data: { organization_id: input.organizationId,
          display_name: "LINE customer", source: "LINE" },
        select: { id: true },
      });
      const links = await transaction.$queryRaw<{ id: string }[]>(Prisma.sql`
        insert into public.line_identity_links
          (organization_id, provider_id, subject_hash, actor_kind, customer_id)
        values (${input.organizationId}::uuid, ${input.identity.providerId},
          ${subjectHash}, 'CUSTOMER', ${customer.id}::uuid)
        returning id
      `);
      await transaction.$executeRaw(Prisma.sql`
        insert into public.line_identity_events
          (organization_id, identity_link_id, event_type)
        values (${input.organizationId}::uuid, ${links[0].id}::uuid, 'LINKED')
      `);
      return customer.id;
    });
  } catch (error) {
    const raced = await findExisting();
    if (raced[0]) return raced[0].customerId;
    throw error;
  }
}

/** A booking tracking token is an existing possession credential for that booking. */
export async function linkExistingCustomerByBooking(input: {
  organizationId: string;
  locationId: string;
  mobileSessionId: string;
  currentCustomerId: string;
  trackingToken: string;
}): Promise<string> {
  if (input.trackingToken.length < 32 || input.trackingToken.length > 512) {
    throw new AppError("BAD_REQUEST", "Invalid booking proof", 400);
  }
  return prisma.$transaction(async (transaction) => {
    const links = await transaction.$queryRaw<{ id: string; customerId: string }[]>(Prisma.sql`
      select link.id, link.customer_id as "customerId"
      from public.line_mobile_sessions mobile
      join public.line_identity_links link on link.id = mobile.identity_link_id
      where mobile.id = ${input.mobileSessionId}::uuid
        and mobile.organization_id = ${input.organizationId}::uuid
        and mobile.location_id = ${input.locationId}::uuid
        and mobile.revoked_at is null and mobile.expires_at > now()
        and link.actor_kind = 'CUSTOMER' and link.revoked_at is null
        and link.customer_id = ${input.currentCustomerId}::uuid
      for update of link
    `);
    const link = links[0];
    if (!link) throw new AppError("UNAUTHENTICATED", "LINE session expired", 401);
    const bookings = await transaction.$queryRaw<{ customerId: string }[]>(Prisma.sql`
      select customer_id as "customerId" from public.bookings
      where organization_id = ${input.organizationId}::uuid
        and location_id = ${input.locationId}::uuid
        and tracking_token_hash = ${sha256(input.trackingToken)}
        and status in ('CONFIRMED', 'PENDING_PAYMENT')
      for update
    `);
    const target = bookings[0]?.customerId;
    if (!target) throw new AppError("NOT_FOUND", "Booking proof not found", 404);
    if (target === link.customerId) return target;
    const current = await transaction.customers.findFirst({ where: {
      id: link.customerId, organization_id: input.organizationId, is_active: true,
    }, select: { display_name: true } });
    const used = await transaction.bookings.count({ where: {
      organization_id: input.organizationId, customer_id: link.customerId,
    } });
    const contacts = await transaction.customer_contacts.count({ where: {
      organization_id: input.organizationId, customer_id: link.customerId,
    } });
    if (!current || current.display_name !== "LINE customer" || contacts || used) {
      throw new AppError("CONFLICT", "LINE account already has customer history", 409);
    }
    const existing = await transaction.customers.findFirst({ where: {
      id: target, organization_id: input.organizationId, is_active: true,
    }, select: { id: true } });
    if (!existing) throw new AppError("NOT_FOUND", "Customer not found", 404);
    await transaction.$executeRaw(Prisma.sql`
      update public.line_identity_links set customer_id = ${target}::uuid
      where id = ${link.id}::uuid and customer_id = ${link.customerId}::uuid
    `);
    await transaction.$executeRaw(Prisma.sql`
      insert into public.line_identity_events
        (organization_id, identity_link_id, mobile_session_id, event_type, reason)
      values (${input.organizationId}::uuid, ${link.id}::uuid,
        ${input.mobileSessionId}::uuid, 'LINKED', 'verified booking tracking token')
    `);
    return target;
  });
}

export async function recordVerifiedEmployeeLinkRequest(input: {
  organizationId: string;
  locationId: string;
  channelId: string;
  profileId: string;
  identity: VerifiedLineIdentity;
}): Promise<string> {
  const channel = await resolveStoreLineChannel(input.organizationId,input.locationId,input.channelId);
  if (!channel || channel.providerId!==input.identity.providerId) {
    throw new AppError("FORBIDDEN","LINE channel does not match store",403);
  }
  const profile=await prisma.profiles.findFirst({where:{id:input.profileId,is_active:true},select:{id:true}});
  if (!profile) throw new AppError("FORBIDDEN","Employee profile inactive",403);
  const [organizationMembership,locationMembership]=await Promise.all([
    prisma.organization_memberships.findFirst({where:{organization_id:input.organizationId,
      profile_id:input.profileId,status:"ACTIVE",all_locations:true},select:{id:true}}),
    prisma.location_memberships.findFirst({where:{organization_id:input.organizationId,
      location_id:input.locationId,profile_id:input.profileId,status:"ACTIVE"},select:{id:true}}),
  ]);
  if (!organizationMembership && !locationMembership) {
    throw new AppError("FORBIDDEN","Employee has no active store membership",403);
  }
  const rows=await prisma.$queryRaw<{id:string}[]>(Prisma.sql`
    insert into public.line_employee_link_requests
      (organization_id,location_id,profile_id,provider_id,subject_hash,expires_at)
    values (${input.organizationId}::uuid,${input.locationId}::uuid,
      ${input.profileId}::uuid,${input.identity.providerId},${lineSubjectHash(input.identity)},
      now()+interval '1 day')
    on conflict (organization_id,provider_id,subject_hash,profile_id)
      where status='PENDING'
    do update set verified_at=now(),expires_at=excluded.expires_at
    returning id
  `);
  return rows[0].id;
}

export async function approveEmployeeLineLink(input: {
  context: OrganizationContext;
  requestId: string;
}): Promise<{linkId:string;profileId:string}> {
  assertCapability(input.context,"team.manage");
  const location=requireLocation(input.context);
  const channel=await getStoreLineLoginChannel(input.context.organization.id,location.id);
  if (!channel) throw new AppError("FEATURE_UNAVAILABLE","LINE Login is disabled",503);
  return prisma.$transaction(async transaction=>{
    const pending=await transaction.$queryRaw<{id:string;profileId:string;providerId:string;subjectHash:string}[]>(Prisma.sql`
      select id,profile_id as "profileId",provider_id as "providerId",
        subject_hash as "subjectHash"
      from public.line_employee_link_requests
      where id=${input.requestId}::uuid
        and organization_id=${input.context.organization.id}::uuid
        and location_id=${location.id}::uuid
        and status='PENDING' and expires_at>now()
      for update
    `);
    const request=pending[0];
    if (!request) throw new AppError("NOT_FOUND","Verified link request not found",404);
    if (request.providerId!==channel.providerId) {
      throw new AppError("CONFLICT","LINE provider changed",409);
    }
    const member=await transaction.profiles.findFirst({where:{id:request.profileId,is_active:true},
      select:{id:true,organization_memberships:{where:{organization_id:input.context.organization.id,
        status:"ACTIVE",all_locations:true},select:{id:true}},
        location_memberships:{where:{organization_id:input.context.organization.id,
          location_id:location.id,status:"ACTIVE"},select:{id:true}}}});
    if (!member || (!member.organization_memberships.length && !member.location_memberships.length)) {
      throw new AppError("FORBIDDEN","Employee membership inactive",403);
    }
    const conflicting=await transaction.$queryRaw<{profileId:string}[]>(Prisma.sql`
      select profile_id as "profileId" from public.line_identity_links
      where organization_id=${input.context.organization.id}::uuid
        and provider_id=${request.providerId}
        and subject_hash=${request.subjectHash}
        and actor_kind='EMPLOYEE' and revoked_at is null
      for update
    `);
    if (conflicting[0] && conflicting[0].profileId!==request.profileId) {
      throw new AppError("CONFLICT","LINE account already linked to another employee",409);
    }
    let linkId:string;
    if (conflicting[0]) {
      const existing=await transaction.$queryRaw<{id:string}[]>(Prisma.sql`
        select id from public.line_identity_links
        where organization_id=${input.context.organization.id}::uuid
          and provider_id=${request.providerId} and subject_hash=${request.subjectHash}
          and actor_kind='EMPLOYEE' and revoked_at is null limit 1
      `);
      linkId=existing[0].id;
    } else {
      const inserted=await transaction.$queryRaw<{id:string}[]>(Prisma.sql`
        insert into public.line_identity_links
          (organization_id,provider_id,subject_hash,actor_kind,profile_id,
            approved_by_profile_id,approved_at)
        values (${input.context.organization.id}::uuid,${request.providerId},
          ${request.subjectHash},'EMPLOYEE',${request.profileId}::uuid,
          ${input.context.session.profileId}::uuid,now())
        returning id
      `);
      linkId=inserted[0].id;
    }
    await transaction.$executeRaw(Prisma.sql`
      update public.line_employee_link_requests
      set status='APPROVED',reviewed_by_profile_id=${input.context.session.profileId}::uuid,
        reviewed_at=now()
      where id=${request.id}::uuid
    `);
    await transaction.$executeRaw(Prisma.sql`
      insert into public.line_identity_events
        (organization_id,identity_link_id,actor_profile_id,event_type)
      values (${input.context.organization.id}::uuid,${linkId}::uuid,
        ${input.context.session.profileId}::uuid,'APPROVED')
    `);
    return {linkId,profileId:request.profileId};
  });
}

export async function revokeEmployeeLineLink(input: {
  context: OrganizationContext;
  linkId: string;
  reason: string;
}): Promise<void> {
  assertCapability(input.context,"organization.manage");
  if (!input.reason.trim()) throw new AppError("BAD_REQUEST","Revocation reason required",400);
  await prisma.$transaction(async transaction=>{
    const rows=await transaction.$queryRaw<{id:string}[]>(Prisma.sql`
      update public.line_identity_links set revoked_at=now()
      where id=${input.linkId}::uuid
        and organization_id=${input.context.organization.id}::uuid
        and actor_kind='EMPLOYEE' and revoked_at is null
      returning id
    `);
    if (!rows[0]) throw new AppError("NOT_FOUND","Employee link not found",404);
    const sessions=await transaction.$queryRaw<{publicSessionId:string}[]>(Prisma.sql`
      update public.line_mobile_sessions set revoked_at=now()
      where identity_link_id=${input.linkId}::uuid and revoked_at is null
      returning public_booking_session_id as "publicSessionId"
    `);
    if (sessions.length) await transaction.public_booking_sessions.updateMany({where:{
      id:{in:sessions.map(session=>session.publicSessionId)}},data:{status:"REVOKED"}});
    await transaction.$executeRaw(Prisma.sql`
      update public.auth_sessions auth set revoked_at=now()
      from public.line_desktop_sessions desktop
      where desktop.auth_session_id=auth.id
        and desktop.identity_link_id=${input.linkId}::uuid
        and auth.revoked_at is null
    `);
    await transaction.$executeRaw(Prisma.sql`
      insert into public.line_identity_events
        (organization_id,identity_link_id,actor_profile_id,event_type,reason)
      values (${input.context.organization.id}::uuid,${input.linkId}::uuid,
        ${input.context.session.profileId}::uuid,'REVOKED',${input.reason.trim()})
    `);
  });
}

export async function createLineMobileSession(input: {
  organizationId: string;
  locationId: string;
  channelId: string;
  identity: VerifiedLineIdentity;
  deviceId: string;
  origin: string;
}): Promise<{ token: string; expiresAt: string }> {
  const channel = await resolveStoreLineChannel(input.organizationId, input.locationId, input.channelId);
  if (!channel || channel.providerId !== input.identity.providerId) {
    throw new AppError("FORBIDDEN", "LINE channel does not match store", 403);
  }
  if (input.deviceId.length < 8 || input.deviceId.length > 256) {
    throw new AppError("BAD_REQUEST", "Invalid device", 400);
  }
  const allowedOrigin = new URL(input.origin).origin;
  const subjectHash = lineSubjectHash(input.identity);
  const links = await prisma.$queryRaw<LinkRow[]>(Prisma.sql`
    select link.id, link.actor_kind as "actorKind", link.profile_id as "profileId",
      link.customer_id as "customerId", link.approved_at as "approvedAt",
      profile.is_active as "profileActive", customer.is_active as "customerActive"
    from public.line_identity_links link
    left join public.profiles profile on profile.id = link.profile_id
    left join public.customers customer on customer.id = link.customer_id
      and customer.organization_id = link.organization_id
    where link.organization_id = ${input.organizationId}::uuid
      and link.provider_id = ${input.identity.providerId}
      and link.subject_hash = ${subjectHash}
      and link.revoked_at is null
    order by case when link.actor_kind = 'EMPLOYEE' then 0 else 1 end
  `);
  const employee = links.find((link) => link.actorKind === "EMPLOYEE" && link.approvedAt && link.profileActive);
  const customer = links.find((link) => link.actorKind === "CUSTOMER" && link.customerActive);
  let link = employee ?? customer;
  if (employee?.profileId) {
    const [orgMembership, locationMembership] = await Promise.all([
      prisma.organization_memberships.findFirst({ where: {
        organization_id: input.organizationId, profile_id: employee.profileId,
        status: "ACTIVE", all_locations: true,
      }, select: { id: true } }),
      prisma.location_memberships.findFirst({ where: {
        organization_id: input.organizationId, location_id: input.locationId,
        profile_id: employee.profileId, status: "ACTIVE",
      }, select: { id: true } }),
    ]);
    if (!orgMembership && !locationMembership) link = customer;
  }
  if (!link) throw new AppError("FORBIDDEN", "LINE account is not linked to this store", 403);

  const token = randomToken(32);
  const tokenHash = sha256(token);
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  const deviceHash = hmacSha256(getServerEnv().TOKEN_DERIVATION_SECRET,
    `device:${input.deviceId}`);
  await prisma.$transaction(async (transaction) => {
    const publicSession = await transaction.public_booking_sessions.create({
      data: {
        organization_id: input.organizationId,
        location_id: input.locationId,
        token_hash: tokenHash,
        expires_at: expiresAt,
        ip_hash: hmacSha256(getServerEnv().TOKEN_DERIVATION_SECRET, "line-mobile:verified"),
        device_hash: deviceHash,
        behavior_hash: hmacSha256(getServerEnv().TOKEN_DERIVATION_SECRET, "line-mobile:login"),
        allowed_origin: allowedOrigin,
      }, select: { id: true },
    });
    const sessions = await transaction.$queryRaw<{ id: string }[]>(Prisma.sql`
      insert into public.line_mobile_sessions
        (organization_id, location_id, identity_link_id, public_booking_session_id,
         token_hash, device_hash, expires_at)
      values (${input.organizationId}::uuid, ${input.locationId}::uuid,
        ${link.id}::uuid, ${publicSession.id}::uuid,
        ${tokenHash}, ${deviceHash}, ${expiresAt})
      returning id
    `);
    await transaction.$executeRaw(Prisma.sql`
      insert into public.line_identity_events
        (organization_id, identity_link_id, mobile_session_id, event_type)
      values (${input.organizationId}::uuid, ${link.id}::uuid,
        ${sessions[0].id}::uuid, 'SESSION_CREATED')
    `);
  });
  return { token, expiresAt: expiresAt.toISOString() };
}

export async function revokeLineMobileSession(input: {
  token: string;
  organizationId: string;
  locationId: string;
}): Promise<void> {
  const tokenHash = sha256(input.token);
  await prisma.$transaction(async (transaction) => {
    const rows = await transaction.$queryRaw<{ id: string; linkId: string; publicSessionId: string }[]>(Prisma.sql`
      update public.line_mobile_sessions
      set revoked_at = now()
      where organization_id = ${input.organizationId}::uuid
        and location_id = ${input.locationId}::uuid
        and token_hash = ${tokenHash} and revoked_at is null
      returning id, identity_link_id as "linkId", public_booking_session_id as "publicSessionId"
    `);
    if (!rows[0]) return;
    await transaction.public_booking_sessions.update({
      where: { id: rows[0].publicSessionId }, data: { status: "REVOKED" },
    });
    await transaction.$executeRaw(Prisma.sql`
      insert into public.line_identity_events
        (organization_id, identity_link_id, mobile_session_id, event_type)
      values (${input.organizationId}::uuid, ${rows[0].linkId}::uuid,
        ${rows[0].id}::uuid, 'SESSION_REVOKED')
    `);
  });
}
