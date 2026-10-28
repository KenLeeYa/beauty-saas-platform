import { expect, it } from "vitest";

import { mapPublicCatalogToMobile } from "./catalog-mapper";
import type { PublicCatalog } from "../public-booking/catalog";

it("preserves public variant IDs, duration and qualified staff in mobile catalog", () => {
  const catalog = {
    location: { timezone: "Asia/Taipei" },
    services: [{ id: "service-1", name: "Massage", variants: [
      { id: "variant-60", name: "60 minutes", durationMinutes: 60, staff: [{ id: "staff-1", displayName: "A" }] },
      { id: "variant-90", name: "90 minutes", durationMinutes: 90, staff: [{ id: "staff-2", displayName: "B" }] },
    ] }],
  } as PublicCatalog;
  const mobile = mapPublicCatalogToMobile(catalog);
  expect(mobile.services.map((service) => service.id)).toEqual(["variant-60", "variant-90"]);
  expect(mobile.services[1].duration_minutes).toBe(90);
  expect(mobile.skills).toEqual([
    { staff_id: "staff-1", service_id: "variant-60" },
    { staff_id: "staff-2", service_id: "variant-90" },
  ]);
});
