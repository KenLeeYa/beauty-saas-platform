import { createHash } from "node:crypto";
import {
  readFileSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { z } from "zod";

const serviceSchema = z
  .object({
    sourceId: z.string().min(1),
    name: z.string().min(1).max(120),
    durationMinutes: z.number().int().min(5).max(1_440),
    priceMinor: z.number().int().nonnegative(),
    currency: z.string().length(3).default("TWD"),
  })
  .strict();

const locationSchema = z
  .object({
    sourceId: z.string().min(1),
    name: z.string().min(1).max(120),
    slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    timezone: z.string().min(1),
    services: z.array(serviceSchema),
  })
  .strict();

const organizationSchema = z
  .object({
    sourceId: z.string().min(1),
    name: z.string().min(1).max(120),
    slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    locations: z.array(locationSchema).min(1),
  })
  .strict();

export const massageImportSchema = z
  .object({
    source: z.literal("massage-booking-manager"),
    exportedAt: z.iso.datetime(),
    organizations: z.array(organizationSchema).min(1),
  })
  .strict();

type Mapping = {
  entity: "organization" | "location" | "service";
  sourceId: string;
  targetId: string;
};

export type MassageImportReport = {
  mode: "dry-run";
  source: "massage-booking-manager";
  exportedAt: string;
  totals: {
    organizations: number;
    locations: number;
    services: number;
  };
  mappings: Mapping[];
  errors: string[];
};

function deterministicUuid(entity: Mapping["entity"], sourceId: string): string {
  const hash = createHash("sha256")
    .update(`beauty-saas:${entity}:${sourceId}`)
    .digest("hex")
    .slice(0, 32)
    .split("");
  hash[12] = "4";
  hash[16] = ["8", "9", "a", "b"][Number.parseInt(hash[16], 16) % 4];
  return [
    hash.slice(0, 8).join(""),
    hash.slice(8, 12).join(""),
    hash.slice(12, 16).join(""),
    hash.slice(16, 20).join(""),
    hash.slice(20).join(""),
  ].join("-");
}

function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format();
    return true;
  } catch {
    return false;
  }
}

export function buildMassageImportReport(input: unknown): MassageImportReport {
  const source = massageImportSchema.parse(input);
  const mappings: Mapping[] = [];
  const errors: string[] = [];
  const sourceKeys = new Set<string>();
  const organizationSlugs = new Set<string>();
  let locationCount = 0;
  let serviceCount = 0;

  function mapSource(
    entity: Mapping["entity"],
    sourceId: string,
  ): void {
    const sourceKey = `${entity}:${sourceId}`;
    if (sourceKeys.has(sourceKey)) {
      errors.push(`Duplicate ${entity} sourceId: ${sourceId}`);
      return;
    }
    sourceKeys.add(sourceKey);
    mappings.push({
      entity,
      sourceId,
      targetId: deterministicUuid(entity, sourceId),
    });
  }

  for (const organization of source.organizations) {
    mapSource("organization", organization.sourceId);
    if (organizationSlugs.has(organization.slug)) {
      errors.push(`Duplicate organization slug: ${organization.slug}`);
    }
    organizationSlugs.add(organization.slug);
    const locationSlugs = new Set<string>();

    for (const location of organization.locations) {
      locationCount += 1;
      mapSource("location", location.sourceId);
      if (locationSlugs.has(location.slug)) {
        errors.push(
          `Duplicate location slug in ${organization.slug}: ${location.slug}`,
        );
      }
      locationSlugs.add(location.slug);
      if (!isValidTimeZone(location.timezone)) {
        errors.push(
          `Invalid timezone for location ${location.sourceId}: ${location.timezone}`,
        );
      }

      for (const service of location.services) {
        serviceCount += 1;
        mapSource("service", service.sourceId);
      }
    }
  }

  return {
    mode: "dry-run",
    source: source.source,
    exportedAt: source.exportedAt,
    totals: {
      organizations: source.organizations.length,
      locations: locationCount,
      services: serviceCount,
    },
    mappings,
    errors,
  };
}

function argumentValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function main(): void {
  const inputPath = argumentValue("--input");
  const reportPath = argumentValue("--report");
  const apply = process.argv.includes("--apply");

  if (!inputPath) {
    throw new Error(
      "Usage: npm run import:massage -- --input <export.json> [--report <report.json>]",
    );
  }
  if (apply) {
    throw new Error(
      "Apply mode is disabled until a real export is reviewed and its source contract is approved.",
    );
  }

  const input = JSON.parse(readFileSync(resolve(inputPath), "utf8")) as unknown;
  const report = buildMassageImportReport(input);
  const output = `${JSON.stringify(report, null, 2)}\n`;

  if (reportPath) {
    writeFileSync(resolve(reportPath), output, "utf8");
  } else {
    process.stdout.write(output);
  }

  if (report.errors.length > 0) {
    process.exitCode = 1;
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  main();
}
