import {describe, expect, it} from 'vitest';
import {previewLegacyImport} from './legacy-adapter';

const ids = {
  org: '00000000-0000-4000-8000-000000000001', loc: '00000000-0000-4000-8000-000000000002',
  service: '00000000-0000-4000-8000-000000000003', variant: '00000000-0000-4000-8000-000000000004',
  locService: '00000000-0000-4000-8000-000000000005', staff: '00000000-0000-4000-8000-000000000006',
  type: '00000000-0000-4000-8000-000000000007', bed: '00000000-0000-4000-8000-000000000008',
  booking: '00000000-0000-4000-8000-000000000009',
};
const scoped = {organization_id: ids.org};
function fixture() {
  return {
    organization_id: ids.org, location: {...scoped, id: ids.loc, slug: 'synthetic', timezone: 'Asia/Taipei'},
    services: [{...scoped, id: ids.service, name: 'Massage', is_active: true}],
    variants: [{...scoped, id: ids.variant, service_id: ids.service, duration_minutes: 60, pre_buffer_minutes: 0, post_buffer_minutes: 15, is_active: true}],
    location_services: [{...scoped, id: ids.locService, location_id: ids.loc, service_variant_id: ids.variant, duration_override_minutes: null, is_active: true, online_booking_enabled: true}],
    staff_profiles: [{...scoped, id: ids.staff, display_name: 'Staff', is_active: true}],
    service_staff_assignments: [{...scoped, location_service_id: ids.locService, staff_profile_id: ids.staff, is_active: true, online_booking_enabled: true}],
    resource_types: [{...scoped, id: ids.type, kind: 'BED'}],
    resources: [{...scoped, id: ids.bed, location_id: ids.loc, resource_type_id: ids.type, name: 'Bed 1', is_active: true}],
    service_resource_requirements: [{...scoped, service_variant_id: ids.variant, resource_type_id: ids.type, quantity: 1, is_required: true}],
    bookings: [{...scoped, id: ids.booking, location_id: ids.loc, status: 'CONFIRMED', source: 'PHONE', customer_name: 'Example', phone: '0900000000'}],
    booking_segments: [{...scoped, location_id: ids.loc, booking_id: ids.booking, service_variant_id: ids.variant, assigned_staff_id: ids.staff, starts_at: '2030-01-01T02:00:00.000Z', ends_at: '2030-01-01T03:00:00.000Z', pre_buffer_minutes: 0, post_buffer_minutes: 15}],
    booking_resource_allocations: [{...scoped, location_id: ids.loc, booking_id: ids.booking, resource_id: ids.bed, starts_at: '2030-01-01T02:00:00.000Z', ends_at: '2030-01-01T03:15:00.000Z', is_blocking: true}],
  };
}

describe('legacy public booking dry-run adapter', () => {
  it('maps a scoped single service and resource without writing or exposing contact details in issues', () => {
    const plan = previewLegacyImport(fixture(), new Date('2029-01-01T00:00:00Z'));
    expect(plan.issues).toEqual([]);
    expect(plan.services[0]).toMatchObject({id: ids.variant, duration_minutes: 60, buffer_minutes: 15});
    expect(plan.requirements).toEqual([{service_id: ids.variant, resource_id: ids.bed}]);
    expect(plan.bookings[0]).toMatchObject({id: ids.booking, source: 'phone', finish: '2030-01-01T03:15:00.000Z'});
  });
  it('rejects mixed-tenant input before producing candidate rows', () => {
    const input = fixture(); input.resources[0].organization_id = '00000000-0000-4000-8000-000000000099';
    const plan = previewLegacyImport(input);
    expect(plan.services).toEqual([]);
    expect(plan.issues[0].code).toBe('cross_tenant');
  });
  it('reports alternative beds, unsupported status, and multiple segments for review', () => {
    const input = fixture();
    input.resources.push({...input.resources[0], id: '00000000-0000-4000-8000-000000000010'});
    input.bookings.push({...input.bookings[0], id: '00000000-0000-4000-8000-000000000011', status: 'PENDING_PAYMENT'});
    input.booking_segments.push({...input.booking_segments[0]});
    const codes = previewLegacyImport(input, new Date('2029-01-01T00:00:00Z')).issues.map(issue => issue.code);
    expect(codes).toContain('resource_choice_requires_design');
    expect(codes).toContain('status_needs_review');
    expect(codes).toContain('multi_segment_booking');
  });
});
