import { loadEnvConfig } from "@next/env";
import { expect, it } from "vitest";

import type { CommissionRuleVersion,
  CompletedCommissionSegment } from "./commission-quote";

const at = new Date("2026-10-05T10:00:00Z");
const segment: CompletedCommissionSegment = { id: "segment", organizationId: "org",
  locationId: "branch", serviceVariantId: "service", staffProfileIds: ["staff"],
  listPriceMinor: 1000, discountedPriceMinor: 800, paymentFeeMinor: 0,
  taxMinor: 0, completedAt: at };
const base: CommissionRuleVersion = { id: "rule", version: 1, priority: 1,
  organizationId: "org", locationId: null, serviceVariantId: null,
  staffProfileId: null, basis: "ORIGINAL", rateBps: 4000, fixedMinor: null,
  excludeFeeTax: false, effectiveFrom: new Date("2026-01-01T00:00:00Z"),
  effectiveUntil: new Date("2027-01-01T00:00:00Z") };

it.skipIf(!process.env.UNIFIED_TEST_DATABASE_URL)("quotes original, discounted, paid-only and fixed commission independently", async () => {
  loadEnvConfig(process.cwd());
  const { quoteCommission } = await import("./commission-quote");
  expect(quoteCommission([segment], { paidMinor: 600, bonusMinor: 200 }, [base])[0]
    .commissionMinor).toBe(400);
  expect(quoteCommission([segment], { paidMinor: 600, bonusMinor: 200 },
    [{ ...base, basis: "DISCOUNTED" }])[0].commissionMinor).toBe(320);
  expect(quoteCommission([segment], { paidMinor: 600, bonusMinor: 200 },
    [{ ...base, basis: "PAID_COMPONENT" }])[0].commissionMinor).toBe(240);
  expect(quoteCommission([segment], { paidMinor: 600, bonusMinor: 200 },
    [{ ...base, basis: "FIXED", rateBps: null, fixedMinor: 300 }])[0]
    .commissionMinor).toBe(300);
  expect(quoteCommission([segment], { paidMinor: 600, bonusMinor: 200 },
    [base], "TOPUP")).toEqual([]);
});

it.skipIf(!process.env.UNIFIED_TEST_DATABASE_URL)("uses the original rule window, fee/tax basis, sum cap and refund reversal", async () => {
  loadEnvConfig(process.cwd());
  const { quoteCommission } = await import("./commission-quote");
  const oldRule = { ...base, id: "old", priority: 1 };
  const laterRule = { ...base, id: "later", version: 2, priority: 10,
    effectiveFrom: new Date("2026-11-01T00:00:00Z") };
  expect(quoteCommission([segment], { paidMinor: 800, bonusMinor: 0 },
    [oldRule, laterRule])[0].ruleId).toBe("old");
  const feeRule = { ...base, basis: "DISCOUNTED" as const,
    excludeFeeTax: true };
  expect(quoteCommission([{ ...segment, paymentFeeMinor: 50, taxMinor: 50 }],
    { paidMinor: 800, bonusMinor: 0 }, [feeRule])[0])
    .toMatchObject({ basisMinor: 700, commissionMinor: 280 });
  const multi = quoteCommission([{ ...segment, staffProfileIds: ["a", "b"] }],
    { paidMinor: 800, bonusMinor: 0 }, [{ ...base, rateBps: 6000 }]);
  expect(multi.reduce((sum, line) => sum + line.commissionMinor, 0)).toBe(800);
  expect(quoteCommission([{ ...segment, refundMinor: 400 }],
    { paidMinor: 800, bonusMinor: 0 }, [base])[0].commissionMinor).toBe(-200);
  const earned = quoteCommission([segment], { paidMinor: 600, bonusMinor: 200 },
    [{ ...base, basis: "PAID_COMPONENT" }])[0].commissionMinor;
  const reversed = quoteCommission([{ ...segment, refundMinor: 400 }],
    { paidMinor: 600, bonusMinor: 200 },
    [{ ...base, basis: "PAID_COMPONENT" }])[0].commissionMinor;
  expect({ earned, reversed, net: earned + reversed })
    .toEqual({ earned: 240, reversed: -120, net: 120 });
});
