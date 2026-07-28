import { describe, expect, it } from "vitest";

import { adminBillingActionSchema } from "../admin/billing-schemas";
import { organizationFeatureOverrideSchema } from "../admin/feature-schemas";
import { createMerchantServiceSchema } from "../merchant/schemas";
import {
  adminMerchantApplicationReviewSchema,
  merchantApplicationFormSchema,
} from "../onboarding/schemas";
import { confirmPublicBookingSchema } from "../public-booking/schemas";
import { merchantSetupActionSchema } from "../setup/schemas";

describe("strict API schemas", () => {
  it("rejects client-supplied tenant scope and price controls", () => {
    expect(
      createMerchantServiceSchema.safeParse({
        name: "臉部護理",
        variantName: "60 分鐘",
        description: "",
        durationMinutes: 60,
        priceMinor: 180_000,
        tenant_id: "attacker-controlled",
      }).success,
    ).toBe(false);
  });

  it("rejects restricted merchant application fields", () => {
    expect(
      merchantApplicationFormSchema.safeParse({
        businessName: "測試美容",
        contactName: "王小姐",
        contactEmail: "owner@example.test",
        contactPhone: "0912345678",
        industryType: "BEAUTY",
        desiredSlug: "test-beauty",
        initialLocationName: "台北店",
        initialLocationAddress: "台北市測試路 1 號",
        submit: true,
        status: "APPROVED",
        reviewerProfileId: "attacker-controlled",
      }).success,
    ).toBe(false);
  });

  it("rejects client price and status fields in public confirmation", () => {
    expect(
      confirmPublicBookingSchema.safeParse({
        holdToken: "a".repeat(64),
        customer: {
          displayName: "林小姐",
          phone: "0912345678",
          priceMinor: 1,
        },
        consents: {
          service: true,
          marketing: false,
        },
        status: "COMPLETED",
      }).success,
    ).toBe(false);
  });

  it("requires review reasons and valid feature limits", () => {
    expect(
      adminMerchantApplicationReviewSchema.safeParse({
        action: "REQUEST_INFO",
        expectedVersion: 1,
      }).success,
    ).toBe(false);
    expect(
      organizationFeatureOverrideSchema.safeParse({
        action: "SET",
        featureKey: "MULTI_LOCATION",
        overrideType: "LIMIT",
        reason: "商務核准",
      }).success,
    ).toBe(false);
  });

  it("validates setup windows and billing amounts", () => {
    expect(
      merchantSetupActionSchema.safeParse({
        action: "BUSINESS_HOURS",
        days: [1, 2, 3],
        opensAt: "20:00",
        closesAt: "10:00",
      }).success,
    ).toBe(false);
    expect(
      adminBillingActionSchema.safeParse({
        action: "CONFIRM_PAYMENT",
        invoiceId: "00000000-0000-4000-8000-000000000001",
        amountMinor: -1,
        reference: "TEST-001",
      }).success,
    ).toBe(false);
  });
});
