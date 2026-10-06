import { loadEnvConfig } from "@next/env";
import { expect, it } from "vitest";

import type { OrganizationContext } from "../src/server/authorization/context";

it.skipIf(!process.env.UNIFIED_TEST_DATABASE_URL)(
  "applies scoped expiring blacklist and VIP without adding marketing consent",
  async () => {
    loadEnvConfig(process.cwd());
    const [{ prisma }, { getBookingEligibility, setCustomerStatus },
      { getMarketingConsentReview },
      { randomToken }] = await Promise.all([
      import("../src/server/database/prisma"),
      import("../src/modules/crm/server/customer-status"),
      import("../src/server/merchant/marketing-consent"),
      import("../src/server/security/crypto"),
    ]);
    const organizationId = "11111111-1111-4111-8111-111111111111";
    const locationId = "22222222-2222-4222-8222-222222222221";
    const organization = await prisma.organizations.findUniqueOrThrow({ where: {
      id: organizationId }, select: { slug: true, name: true, status: true } });
    const location = await prisma.locations.findUniqueOrThrow({ where: {
      id: locationId }, select: { slug: true, name: true, timezone: true } });
    const context: OrganizationContext = { session: { id: randomToken(16),
      profileId: "33333333-3333-4333-8333-333333333301", email: "owner@example.test",
      displayName: "Owner", platformRole: null, expiresAt: new Date(Date.now()+60_000),
      csrfTokenHash: "" }, organization: { id: organizationId, ...organization },
      location: { id: locationId, ...location }, roles: new Set(["ORGANIZATION_OWNER"]),
      allLocations: true, accessibleLocationIds: new Set([locationId]),
      linkedStaffProfileId: null };
    const customer = await prisma.customers.create({ data: {
      organization_id: organizationId, display_name: "Synthetic status",
    }, select: { id: true } });
    const command = { context, customerId: customer.id, scope: "LOCATION" as const,
      statusKind: "BLACKLIST" as const, reason: "synthetic policy review",
      requestId: randomToken(12) };
    expect(await getBookingEligibility(organizationId, locationId, customer.id))
      .toEqual({ allowed: true, vip: false });
    await expect(setCustomerStatus({ ...command,
      context: { ...context, roles: new Set(["SERVICE_PROVIDER"]) }, enabled: true }))
      .rejects.toMatchObject({ status: 403 });
    await setCustomerStatus({ ...command, enabled: true,
      expiresAt: new Date(Date.now()+86400_000) });
    expect(await getBookingEligibility(organizationId, locationId, customer.id))
      .toEqual({ allowed: false, vip: false });
    expect(await getBookingEligibility(organizationId, locationId, customer.id,
      prisma, new Date(Date.now()+2*86400_000)))
      .toEqual({ allowed: true, vip: false });
    await setCustomerStatus({ ...command, enabled: false });
    await setCustomerStatus({ ...command, statusKind: "VIP", enabled: true });
    expect(await getBookingEligibility(organizationId, locationId, customer.id))
      .toEqual({ allowed: true, vip: true });
    expect(await prisma.customer_consents.count({ where: { customer_id: customer.id,
      consent_type: "MARKETING" } })).toBe(0);
    expect(await prisma.notification_outbox.count({ where: {
      customer_id: customer.id } })).toBe(0);
    expect((await getMarketingConsentReview(context,customer.id)).currentlyGranted).toBe(false);
    await expect(getMarketingConsentReview({ ...context,roles:new Set(["SERVICE_PROVIDER"]) },
      customer.id)).rejects.toMatchObject({ status:403 });
    await expect(getMarketingConsentReview({ ...context,allLocations:false,
      roles:new Set(["FRONT_DESK"]) },customer.id))
      .rejects.toMatchObject({ status:404 });
    await prisma.customer_consents.create({ data:{ organization_id:organizationId,
      customer_id:customer.id,consent_type:"MARKETING",status:"GRANTED",
      source:"SYNTHETIC_TEST",policy_version:"test-v1" } });
    expect((await getMarketingConsentReview(context,customer.id)).currentlyGranted).toBe(true);
    await prisma.customer_consents.create({ data:{ organization_id:organizationId,
      customer_id:customer.id,consent_type:"MARKETING",status:"REVOKED",
      source:"SYNTHETIC_TEST",policy_version:"test-v1",
      captured_at:new Date(Date.now()+1000) } });
    const review=await getMarketingConsentReview(context,customer.id);
    expect(review.currentlyGranted).toBe(false);
    expect(review.history.map(row => row.status)).toEqual(["REVOKED","GRANTED"]);
  }, 60_000,
);
