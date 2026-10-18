import { describe, expect, it } from "vitest";
import { allocateProviderPool } from "./allocation-math";

const a = "11111111-1111-4111-8111-111111111111";
const b = "22222222-2222-4222-8222-222222222222";

describe("explicit multi-provider allocation", () => {
  it("splits percentage with deterministic rounding and full pool conservation", () => {
    expect(allocateProviderPool(101,"PERCENT",[
      { staffProfileId: a, shareBps: 6000 },
      { staffProfileId: b, shareBps: 4000 },
    ]).map(line => line.quotedMinor)).toEqual([60,41]);
  });
  it("accepts manager fixed amounts within the commission pool", () => {
    expect(allocateProviderPool(400,"FIXED",[
      { staffProfileId: a, fixedMinor: 200 },
      { staffProfileId: b, fixedMinor: 100 },
    ]).map(line => line.quotedMinor)).toEqual([200,100]);
  });
  it("rejects over-allocation, duplicate providers and mixed methods", () => {
    expect(() => allocateProviderPool(100,"PERCENT",[
      { staffProfileId: a, shareBps: 6000 },
      { staffProfileId: b, shareBps: 5000 },
    ])).toThrow();
    expect(() => allocateProviderPool(100,"FIXED",[
      { staffProfileId: a, fixedMinor: 60 },
      { staffProfileId: b, fixedMinor: 50 },
    ])).toThrow();
    expect(() => allocateProviderPool(100,"PERCENT",[
      { staffProfileId: a, shareBps: 6000 },
      { staffProfileId: a, shareBps: 4000 },
    ])).toThrow();
  });
});
