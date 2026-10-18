import {z} from 'zod';

// Read-only shape of the existing public tables, scoped to one organization and location.
const uuid = z.string().uuid();
const scoped = z.object({organization_id: uuid});
export const legacySnapshot = z.object({
  organization_id: uuid,
  location: scoped.extend({id: uuid, slug: z.string(), timezone: z.string()}),
  services: z.array(scoped.extend({id: uuid, name: z.string(), is_active: z.boolean()})),
  variants: z.array(scoped.extend({id: uuid, service_id: uuid, duration_minutes: z.number().int(), pre_buffer_minutes: z.number().int(), post_buffer_minutes: z.number().int(), is_active: z.boolean()})),
  location_services: z.array(scoped.extend({id: uuid, location_id: uuid, service_variant_id: uuid, duration_override_minutes: z.number().int().nullable(), is_active: z.boolean(), online_booking_enabled: z.boolean()})),
  staff_profiles: z.array(scoped.extend({id: uuid, display_name: z.string(), is_active: z.boolean()})),
  service_staff_assignments: z.array(scoped.extend({location_service_id: uuid, staff_profile_id: uuid, is_active: z.boolean(), online_booking_enabled: z.boolean()})),
  resource_types: z.array(scoped.extend({id: uuid, kind: z.string()})),
  resources: z.array(scoped.extend({id: uuid, location_id: uuid, resource_type_id: uuid, name: z.string(), is_active: z.boolean()})),
  service_resource_requirements: z.array(scoped.extend({service_variant_id: uuid, resource_type_id: uuid, quantity: z.number().int(), is_required: z.boolean()})),
  bookings: z.array(scoped.extend({id: uuid, location_id: uuid, status: z.string(), source: z.string(), customer_name: z.string(), phone: z.string()})),
  booking_segments: z.array(scoped.extend({location_id: uuid, booking_id: uuid, service_variant_id: uuid.nullable(), assigned_staff_id: uuid.nullable(), starts_at: z.string().datetime({offset: true}), ends_at: z.string().datetime({offset: true}), pre_buffer_minutes: z.number().int(), post_buffer_minutes: z.number().int()})),
  booking_resource_allocations: z.array(scoped.extend({location_id: uuid, booking_id: uuid.nullable(), resource_id: uuid, starts_at: z.string().datetime({offset: true}), ends_at: z.string().datetime({offset: true}), is_blocking: z.boolean()})),
});
export type LegacySnapshot = z.infer<typeof legacySnapshot>;
export type ImportIssue = {code: string; id: string};

export function previewLegacyImport(raw: unknown, now = new Date()) {
  const snapshot = legacySnapshot.parse(raw);
  const issues: ImportIssue[] = [];
  const org = snapshot.organization_id;
  const loc = snapshot.location.id;
  const scopedRows = Object.entries(snapshot).filter(([key, value]) => key !== 'organization_id' && key !== 'location' && Array.isArray(value)) as [string, {organization_id: string}[]][];
  if (snapshot.location.organization_id !== org) issues.push({code: 'cross_tenant', id: loc});
  for (const [, rows] of scopedRows) for (const row of rows) if (row.organization_id !== org) issues.push({code: 'cross_tenant', id: row.organization_id});
  if (issues.length) return {services: [], staff: [], resources: [], skills: [], requirements: [], bookings: [], issues};

  const serviceById = new Map(snapshot.services.map(row => [row.id, row]));
  const variantById = new Map(snapshot.variants.map(row => [row.id, row]));
  const staffById = new Map(snapshot.staff_profiles.map(row => [row.id, row]));
  const typeById = new Map(snapshot.resource_types.map(row => [row.id, row]));
  const resources = snapshot.resources.filter(row => row.location_id === loc && row.is_active).flatMap(row => {
    const type = typeById.get(row.resource_type_id);
    const kind = type?.kind === 'ROOM' || type?.kind === 'SPA_ROOM' ? 'room' : type?.kind === 'BED' || type?.kind === 'EYELASH_BED' ? 'bed' : type?.kind === 'EQUIPMENT' ? 'equipment' : null;
    if (!kind) {issues.push({code: 'unsupported_resource_kind', id: row.id}); return [];}
    return [{id: row.id, name: row.name, kind, legacy_type_id: row.resource_type_id}];
  });
  const services = snapshot.location_services.filter(row => row.location_id === loc && row.is_active && row.online_booking_enabled).flatMap(row => {
    const variant = variantById.get(row.service_variant_id);
    const service = variant && serviceById.get(variant.service_id);
    if (!variant || !service || !variant.is_active || !service.is_active) {issues.push({code: 'missing_active_service', id: row.id}); return [];}
    if (variant.pre_buffer_minutes !== 0) issues.push({code: 'pre_buffer_not_supported', id: row.id});
    const duration = row.duration_override_minutes ?? variant.duration_minutes;
    if (duration < 1 || duration > 480 || variant.post_buffer_minutes < 0 || variant.post_buffer_minutes > 120) issues.push({code: 'duration_out_of_range', id: row.id});
    return [{id: variant.id, name: service.name, duration_minutes: duration, buffer_minutes: variant.post_buffer_minutes, legacy_location_service_id: row.id}];
  });
  const staff = snapshot.staff_profiles.filter(row => row.is_active).map(row => ({id: row.id, name: row.display_name}));
  const eligible = new Set(services.map(row => row.legacy_location_service_id));
  const skills = snapshot.service_staff_assignments.filter(row => eligible.has(row.location_service_id) && row.is_active && row.online_booking_enabled).flatMap(row => {
    const service = services.find(item => item.legacy_location_service_id === row.location_service_id);
    if (!service || !staffById.get(row.staff_profile_id)?.is_active) {issues.push({code: 'missing_active_staff', id: row.staff_profile_id}); return [];}
    return [{service_id: service.id, staff_id: row.staff_profile_id}];
  });
  const requirements = snapshot.service_resource_requirements.filter(row => services.some(service => service.id === row.service_variant_id) && row.is_required).flatMap(row => {
    const candidates = resources.filter(resource => resource.legacy_type_id === row.resource_type_id);
    if (row.quantity !== 1 || candidates.length !== 1) {issues.push({code: 'resource_choice_requires_design', id: row.service_variant_id}); return [];}
    return [{service_id: row.service_variant_id, resource_id: candidates[0].id}];
  });
  const segmentsByBooking = Map.groupBy(snapshot.booking_segments.filter(row => row.location_id === loc), row => row.booking_id);
  const bookings = snapshot.bookings.filter(row => row.location_id === loc && row.status === 'CONFIRMED').flatMap(row => {
    const segments = segmentsByBooking.get(row.id) || [];
    if (segments.length !== 1) {issues.push({code: 'multi_segment_booking', id: row.id}); return [];}
    const segment = segments[0];
    if (Date.parse(segment.starts_at) <= now.getTime()) return [];
    if (!segment.service_variant_id || !services.some(service => service.id === segment.service_variant_id) || !segment.assigned_staff_id || !staffById.get(segment.assigned_staff_id)?.is_active) {issues.push({code: 'unmapped_booking_reference', id: row.id}); return [];}
    if (segment.pre_buffer_minutes !== 0 || segment.post_buffer_minutes !== services.find(service => service.id === segment.service_variant_id)?.buffer_minutes) {issues.push({code: 'booking_buffer_mismatch', id: row.id}); return [];}
    const source = row.source === 'PHONE' ? 'phone' : row.source === 'LINE' ? 'personal-line' : null;
    if (!source) {issues.push({code: 'booking_source_needs_review', id: row.id}); return [];}
    if (row.source === 'LINE') issues.push({code: 'line_identity_needs_review', id: row.id});
    const expectedFinish = Date.parse(segment.starts_at) + (services.find(service => service.id === segment.service_variant_id)?.duration_minutes || 0) * 60000;
    if (Date.parse(segment.ends_at) !== expectedFinish) {issues.push({code: 'booking_duration_mismatch', id: row.id}); return [];}
    return [{id: row.id, service_id: segment.service_variant_id, staff_id: segment.assigned_staff_id, start: segment.starts_at, finish: new Date(expectedFinish + segment.post_buffer_minutes * 60000).toISOString(), source, customer_name: row.customer_name, phone: row.phone}];
  });
  for (const row of snapshot.bookings.filter(item => item.location_id === loc && !['CONFIRMED', 'CANCELLED', 'EXPIRED', 'RESCHEDULED'].includes(item.status))) issues.push({code: 'status_needs_review', id: row.id});
  for (const booking of bookings) {
    const allocated = snapshot.booking_resource_allocations.filter(row => row.location_id === loc && row.booking_id === booking.id && row.is_blocking).map(row => row.resource_id).sort();
    const expected = requirements.filter(row => row.service_id === booking.service_id).map(row => row.resource_id).sort();
    if (JSON.stringify(allocated) !== JSON.stringify(expected)) issues.push({code: 'resource_allocation_mismatch', id: booking.id});
    for (const other of bookings) if (other.id < booking.id && booking.start < other.finish && booking.finish > other.start && (booking.staff_id === other.staff_id || expected.some(id => requirements.some(item => item.service_id === other.service_id && item.resource_id === id)))) issues.push({code: 'booking_overlap', id: booking.id});
  }
  return {services, staff, resources, skills, requirements, bookings, issues};
}
