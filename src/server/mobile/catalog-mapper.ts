import type { PublicCatalog } from "../public-booking/catalog";

export type MobileCatalog = {
  timezone: string;
  services: { id: string; name: string; duration_minutes: number }[];
  staff: { id: string; name: string }[];
  skills: { staff_id: string; service_id: string }[];
};

export function mapPublicCatalogToMobile(catalog: PublicCatalog): MobileCatalog {
  const staff = new Map<string, { id: string; name: string }>();
  const services: MobileCatalog["services"] = [];
  const skills: MobileCatalog["skills"] = [];
  for (const service of catalog.services) {
    for (const variant of service.variants) {
      services.push({ id: variant.id, name: `${service.name} · ${variant.name}`,
        duration_minutes: variant.durationMinutes });
      for (const person of variant.staff) {
        staff.set(person.id, { id: person.id, name: person.displayName });
        skills.push({ staff_id: person.id, service_id: variant.id });
      }
    }
  }
  return { timezone: catalog.location.timezone, services, staff: [...staff.values()], skills };
}
