import { describe, expect, it } from "vitest";

import {
  createCustomerNoteSchema,
  customerTagCommandSchema,
} from "./schemas";

describe("CRM command schemas", () => {
  it("accepts strict tag creation and assignment commands", () => {
    expect(
      customerTagCommandSchema.parse({
        action: "CREATE",
        name: "高回訪",
        color: "#0f766e",
      }),
    ).toEqual({ action: "CREATE", name: "高回訪", color: "#0f766e" });
    expect(
      customerTagCommandSchema.parse({
        action: "ASSIGN",
        customerId: "11111111-1111-4111-8111-111111111111",
        tagId: "22222222-2222-4222-8222-222222222222",
      }),
    ).toMatchObject({ action: "ASSIGN" });
  });

  it("rejects invalid colors and unknown fields", () => {
    expect(() =>
      customerTagCommandSchema.parse({
        action: "CREATE",
        name: "VIP",
        color: "teal",
      }),
    ).toThrow();
    expect(() =>
      createCustomerNoteSchema.parse({
        customerId: "11111111-1111-4111-8111-111111111111",
        note: "偏好安靜服務",
        sensitivity: "STANDARD",
        organizationId: "untrusted",
      }),
    ).toThrow();
  });
});
