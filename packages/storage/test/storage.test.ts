import { describe, expect, it } from "vitest";
import { assertTenantScopedObjectKey, customerPhotoKey } from "../src/index.js";

describe("storage tenant scope", () => {
  it("builds tenant-scoped customer photo keys", () => {
    expect(customerPhotoKey({ tenantId: "t1", customerId: "c1", objectId: "o1", extension: ".jpg" })).toBe(
      "tenants/t1/customers/c1/photos/o1.jpg"
    );
  });

  it("rejects object keys from another tenant", () => {
    expect(() => assertTenantScopedObjectKey("tenant-a", "tenants/tenant-b/file.jpg")).toThrow();
  });
});
