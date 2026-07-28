import { describe, expect, it } from "vitest";

import { buildMassageImportReport } from "./import-massage-data";

describe("massage import dry-run", () => {
  it("builds deterministic mappings without writing data", () => {
    const input = {
      source: "massage-booking-manager",
      exportedAt: "2026-07-28T00:00:00.000Z",
      organizations: [
        {
          sourceId: "shop-1",
          name: "Example Studio",
          slug: "example-studio",
          locations: [
            {
              sourceId: "location-1",
              name: "Taipei",
              slug: "taipei",
              timezone: "Asia/Taipei",
              services: [
                {
                  sourceId: "service-1",
                  name: "Example Service",
                  durationMinutes: 60,
                  priceMinor: 120_000,
                  currency: "TWD",
                },
              ],
            },
          ],
        },
      ],
    };

    const first = buildMassageImportReport(input);
    const second = buildMassageImportReport(input);

    expect(first.errors).toEqual([]);
    expect(first.totals).toEqual({
      organizations: 1,
      locations: 1,
      services: 1,
    });
    expect(first.mappings).toEqual(second.mappings);
  });

  it("reports duplicate source identifiers and invalid timezones", () => {
    const report = buildMassageImportReport({
      source: "massage-booking-manager",
      exportedAt: "2026-07-28T00:00:00.000Z",
      organizations: [
        {
          sourceId: "shop-1",
          name: "Example Studio",
          slug: "example-studio",
          locations: [
            {
              sourceId: "location-1",
              name: "Taipei",
              slug: "taipei",
              timezone: "Not/A_Timezone",
              services: [
                {
                  sourceId: "service-1",
                  name: "Service A",
                  durationMinutes: 60,
                  priceMinor: 120_000,
                },
                {
                  sourceId: "service-1",
                  name: "Service B",
                  durationMinutes: 90,
                  priceMinor: 180_000,
                },
              ],
            },
          ],
        },
      ],
    });

    expect(report.errors).toContain(
      "Duplicate service sourceId: service-1",
    );
    expect(report.errors).toContain(
      "Invalid timezone for location location-1: Not/A_Timezone",
    );
  });
});
