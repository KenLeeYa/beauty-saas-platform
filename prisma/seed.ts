import { loadEnvConfig } from "@next/env";
import { Prisma, PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
import {
  addLocalDays,
  formatDateInTimeZone,
  zonedDateTimeToUtc,
} from "../src/server/time/timezone";

loadEnvConfig(process.cwd());

const DEMO_PASSWORD = "Beauty123!";

const ids = {
  organization: "11111111-1111-4111-8111-111111111111",
  location: "22222222-2222-4222-8222-222222222221",
  profiles: {
    owner: "33333333-3333-4333-8333-333333333301",
    admin: "33333333-3333-4333-8333-333333333302",
    manager: "33333333-3333-4333-8333-333333333303",
    frontDesk: "33333333-3333-4333-8333-333333333304",
    provider: "33333333-3333-4333-8333-333333333305",
    finance: "33333333-3333-4333-8333-333333333306",
    platformAdmin: "33333333-3333-4333-8333-333333333307",
    customer: "33333333-3333-4333-8333-333333333308",
    applicant: "33333333-3333-4333-8333-333333333309",
  },
  staff: {
    primary: "44444444-4444-4444-8444-444444444401",
    secondary: "44444444-4444-4444-8444-444444444402",
  },
  category: "55555555-5555-4555-8555-555555555501",
  services: {
    massage: "55555555-5555-4555-8555-555555555511",
    facial: "55555555-5555-4555-8555-555555555512",
    lashes: "55555555-5555-4555-8555-555555555513",
  },
  variants: {
    massage: "66666666-6666-4666-8666-666666666611",
    facial: "66666666-6666-4666-8666-666666666612",
    lashes: "66666666-6666-4666-8666-666666666613",
  },
  locationServices: {
    massage: "77777777-7777-4777-8777-777777777711",
    facial: "77777777-7777-4777-8777-777777777712",
    lashes: "77777777-7777-4777-8777-777777777713",
  },
  resourceType: "88888888-8888-4888-8888-888888888801",
  resources: {
    roomA: "88888888-8888-4888-8888-888888888811",
    roomB: "88888888-8888-4888-8888-888888888812",
  },
  subscription: "99999999-9999-4999-8999-999999999901",
  qa: {
    customers: {
      loyal: "b0000000-0000-4000-8000-000000000001",
      deposit: "b0000000-0000-4000-8000-000000000002",
      risk: "b0000000-0000-4000-8000-000000000003",
    },
    contacts: {
      loyal: "b1000000-0000-4000-8000-000000000001",
      deposit: "b1000000-0000-4000-8000-000000000002",
      risk: "b1000000-0000-4000-8000-000000000003",
    },
    tags: {
      vip: "b2000000-0000-4000-8000-000000000001",
      birthday: "b2000000-0000-4000-8000-000000000002",
      attention: "b2000000-0000-4000-8000-000000000003",
    },
    notes: {
      loyal: "b3000000-0000-4000-8000-000000000001",
      deposit: "b3000000-0000-4000-8000-000000000002",
      risk: "b3000000-0000-4000-8000-000000000003",
    },
    tagAssignments: {
      loyalVip: "b4000000-0000-4000-8000-000000000001",
      loyalBirthday: "b4000000-0000-4000-8000-000000000002",
      riskAttention: "b4000000-0000-4000-8000-000000000003",
    },
    bookings: {
      pendingPayment: "c0000000-0000-4000-8000-000000000001",
      pendingExpiry: "c0000000-0000-4000-8000-000000000009",
      confirmed: "c0000000-0000-4000-8000-000000000002",
      confirmedNoShow: "c0000000-0000-4000-8000-000000000010",
      checkedIn: "c0000000-0000-4000-8000-000000000003",
      inService: "c0000000-0000-4000-8000-000000000004",
      completed: "c0000000-0000-4000-8000-000000000005",
      cancelled: "c0000000-0000-4000-8000-000000000006",
      noShow: "c0000000-0000-4000-8000-000000000007",
      expired: "c0000000-0000-4000-8000-000000000008",
    },
    invoice: "d0000000-0000-4000-8000-000000000001",
    notifications: {
      outboxFailed: "e0000000-0000-4000-8000-000000000001",
      outboxDeadLetter: "e0000000-0000-4000-8000-000000000002",
      outboxSucceeded: "e0000000-0000-4000-8000-000000000003",
      jobFailed: "e1000000-0000-4000-8000-000000000001",
      jobDeadLetter: "e1000000-0000-4000-8000-000000000002",
      jobSucceeded: "e1000000-0000-4000-8000-000000000003",
      deliveryFailed: "e2000000-0000-4000-8000-000000000001",
      deliveryDeadLetter: "e2000000-0000-4000-8000-000000000002",
      deliverySucceeded: "e2000000-0000-4000-8000-000000000003",
    },
  },
} as const;

type SeedProfile = {
  id: string;
  email: string;
  displayName: string;
  platformRole?: "PLATFORM_ADMIN";
};

const profiles: SeedProfile[] = [
  {
    id: ids.profiles.owner,
    email: "merchant@lumi.test",
    displayName: "Lumi 店家負責人",
  },
  {
    id: ids.profiles.admin,
    email: "admin@lumi.test",
    displayName: "Lumi 組織管理員",
  },
  {
    id: ids.profiles.manager,
    email: "manager@lumi.test",
    displayName: "台北館店長",
  },
  {
    id: ids.profiles.frontDesk,
    email: "frontdesk@lumi.test",
    displayName: "台北館櫃台",
  },
  {
    id: ids.profiles.provider,
    email: "provider@lumi.test",
    displayName: "美容師 Yuki",
  },
  {
    id: ids.profiles.finance,
    email: "finance@lumi.test",
    displayName: "Lumi 財務",
  },
  {
    id: ids.profiles.platformAdmin,
    email: "platform@beauty.test",
    displayName: "平台管理員",
    platformRole: "PLATFORM_ADMIN",
  },
  {
    id: ids.profiles.customer,
    email: "customer@lumi.test",
    displayName: "林小姐",
  },
  {
    id: ids.profiles.applicant,
    email: "applicant@beauty.test",
    displayName: "新商家申請人",
  },
];

function assertLocalSeedTarget(): void {
  if (process.env.ALLOW_DEMO_SEED !== "true") {
    throw new Error("Demo seed requires ALLOW_DEMO_SEED=true.");
  }

  const databaseUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DIRECT_URL or DATABASE_URL is required.");
  }

  const hostname = new URL(databaseUrl).hostname;
  if (hostname !== "127.0.0.1" && hostname !== "localhost") {
    throw new Error(`Refusing to seed non-local database host: ${hostname}`);
  }
}

async function seedProfiles(
  transaction: Prisma.TransactionClient,
  passwordHash: string,
): Promise<void> {
  for (const profile of profiles) {
    await transaction.$executeRaw`
      insert into public.profiles (
        id,
        email,
        password_hash,
        display_name,
        platform_role,
        is_active
      )
      values (
        ${profile.id}::uuid,
        ${profile.email},
        ${passwordHash},
        ${profile.displayName},
        ${profile.platformRole ?? null}::public.user_role,
        true
      )
      on conflict (id) do update
      set
        email = excluded.email,
        password_hash = excluded.password_hash,
        display_name = excluded.display_name,
        platform_role = excluded.platform_role,
        is_active = true,
        updated_at = now()
    `;
  }
}

async function seedOrganization(
  transaction: Prisma.TransactionClient,
): Promise<void> {
  await transaction.$executeRaw`
    insert into public.organizations (
      id,
      name,
      slug,
      business_name,
      email,
      phone,
      status,
      trial_ends_at,
      public_profile_enabled
    )
    values (
      ${ids.organization}::uuid,
      'Lumi Beauty',
      'demo',
      'Lumi Beauty 光感美學',
      'hello@lumi.test',
      '02-2345-6789',
      'TRIALING',
      now() + interval '14 days',
      true
    )
    on conflict (id) do update
    set
      name = excluded.name,
      slug = excluded.slug,
      business_name = excluded.business_name,
      email = excluded.email,
      phone = excluded.phone,
      status = excluded.status,
      trial_ends_at = excluded.trial_ends_at,
      public_profile_enabled = excluded.public_profile_enabled,
      disabled_at = null,
      updated_at = now()
  `;

  await transaction.$executeRaw`
    insert into public.locations (
      id,
      organization_id,
      name,
      slug,
      code,
      description,
      address,
      phone,
      timezone,
      currency,
      booking_state,
      online_booking_enabled,
      is_active
    )
    values (
      ${ids.location}::uuid,
      ${ids.organization}::uuid,
      '台北光感館',
      'taipei',
      'TPE',
      '預約制美容、美體與舒壓服務',
      '台北市信義區測試路 88 號',
      '02-2345-6789',
      'Asia/Taipei',
      'TWD',
      'OPEN',
      true,
      true
    )
    on conflict (id) do update
    set
      name = excluded.name,
      slug = excluded.slug,
      code = excluded.code,
      description = excluded.description,
      address = excluded.address,
      phone = excluded.phone,
      timezone = excluded.timezone,
      currency = excluded.currency,
      booking_state = excluded.booking_state,
      online_booking_enabled = excluded.online_booking_enabled,
      is_active = true,
      disabled_at = null,
      updated_at = now()
  `;

  await transaction.$executeRaw`
    insert into public.location_business_hours (
      organization_id,
      location_id,
      day_of_week,
      segment_index,
      opens_at,
      closes_at,
      is_closed
    )
    select
      ${ids.organization}::uuid,
      ${ids.location}::uuid,
      day_of_week,
      0,
      '10:00'::time,
      '20:00'::time,
      false
    from generate_series(0, 6) as day_of_week
    on conflict (location_id, day_of_week, segment_index) do update
    set
      opens_at = excluded.opens_at,
      closes_at = excluded.closes_at,
      is_closed = excluded.is_closed,
      updated_at = now()
  `;
}

async function seedMemberships(
  transaction: Prisma.TransactionClient,
): Promise<void> {
  const organizationRoles = [
    [ids.profiles.owner, "ORGANIZATION_OWNER", true, true],
    [ids.profiles.admin, "ORGANIZATION_ADMIN", true, false],
    [ids.profiles.finance, "FINANCE_VIEWER", true, false],
  ] as const;

  for (const [profileId, role, allLocations, isPrimaryOwner] of organizationRoles) {
    await transaction.$executeRaw`
      insert into public.organization_memberships (
        organization_id,
        profile_id,
        role,
        status,
        all_locations,
        is_primary_owner,
        joined_at
      )
      values (
        ${ids.organization}::uuid,
        ${profileId}::uuid,
        ${role}::public.user_role,
        'ACTIVE',
        ${allLocations},
        ${isPrimaryOwner},
        now()
      )
      on conflict (organization_id, profile_id, role) do update
      set
        status = 'ACTIVE',
        all_locations = excluded.all_locations,
        is_primary_owner = excluded.is_primary_owner,
        disabled_at = null,
        joined_at = coalesce(
          public.organization_memberships.joined_at,
          now()
        ),
        updated_at = now()
    `;
  }

  const locationRoles = [
    [ids.profiles.manager, "LOCATION_MANAGER"],
    [ids.profiles.frontDesk, "FRONT_DESK"],
    [ids.profiles.provider, "SERVICE_PROVIDER"],
  ] as const;

  for (const [profileId, role] of locationRoles) {
    await transaction.$executeRaw`
      insert into public.location_memberships (
        organization_id,
        location_id,
        profile_id,
        role,
        status,
        joined_at
      )
      values (
        ${ids.organization}::uuid,
        ${ids.location}::uuid,
        ${profileId}::uuid,
        ${role}::public.user_role,
        'ACTIVE',
        now()
      )
      on conflict (location_id, profile_id, role) do update
      set
        status = 'ACTIVE',
        disabled_at = null,
        joined_at = coalesce(public.location_memberships.joined_at, now()),
        updated_at = now()
    `;
  }
}

async function seedSubscription(
  transaction: Prisma.TransactionClient,
): Promise<void> {
  await transaction.$executeRaw`
    insert into public.subscriptions (
      id,
      organization_id,
      plan_version_id,
      status,
      is_current,
      billing_period_start,
      billing_period_end,
      trial_ends_at
    )
    values (
      ${ids.subscription}::uuid,
      ${ids.organization}::uuid,
      '00000000-0000-4000-8000-000000000201'::uuid,
      'TRIALING',
      true,
      current_date,
      current_date + 13,
      now() + interval '14 days'
    )
    on conflict (id) do update
    set
      plan_version_id = excluded.plan_version_id,
      status = excluded.status,
      is_current = true,
      billing_period_start = excluded.billing_period_start,
      billing_period_end = excluded.billing_period_end,
      trial_ends_at = excluded.trial_ends_at,
      suspended_at = null,
      cancelled_at = null,
      updated_at = now()
  `;

  await transaction.$executeRaw`
    insert into public.merchant_setup_progress (
      organization_id,
      brand_completed_at,
      location_completed_at,
      business_hours_completed_at,
      service_completed_at,
      staff_completed_at,
      resource_completed_at,
      policies_completed_at,
      notifications_completed_at,
      go_live_at,
      last_step
    )
    values (
      ${ids.organization}::uuid,
      now(),
      now(),
      now(),
      now(),
      now(),
      now(),
      now(),
      now(),
      now(),
      'GO_LIVE'
    )
    on conflict (organization_id) do update
    set
      brand_completed_at = excluded.brand_completed_at,
      location_completed_at = excluded.location_completed_at,
      business_hours_completed_at = excluded.business_hours_completed_at,
      service_completed_at = excluded.service_completed_at,
      staff_completed_at = excluded.staff_completed_at,
      resource_completed_at = excluded.resource_completed_at,
      policies_completed_at = excluded.policies_completed_at,
      notifications_completed_at = excluded.notifications_completed_at,
      go_live_at = excluded.go_live_at,
      last_step = excluded.last_step,
      updated_at = now()
  `;

  await transaction.$executeRaw`
    insert into public.organization_feature_overrides (
      id,
      organization_id,
      feature_key,
      override_type,
      reason,
      created_by
    )
    values (
      '99999999-9999-4999-8999-999999999902'::uuid,
      ${ids.organization}::uuid,
      'CUSTOMER_BLACKLIST'::public.feature_key,
      'ALLOW',
      '本機示範租戶啟用黑名單加值功能',
      ${ids.profiles.platformAdmin}::uuid
    )
    on conflict (id) do update
    set
      override_type = 'ALLOW',
      reason = excluded.reason,
      effective_at = now(),
      expires_at = null,
      revoked_at = null,
      revoked_by = null
  `;
}

async function seedCatalog(
  transaction: Prisma.TransactionClient,
): Promise<void> {
  await transaction.$executeRaw`
    insert into public.service_categories (
      id,
      organization_id,
      name,
      description,
      sort_order,
      is_active
    )
    values (
      ${ids.category}::uuid,
      ${ids.organization}::uuid,
      '人氣保養',
      '舒壓、美容與美睫預約服務',
      10,
      true
    )
    on conflict (id) do update
    set
      name = excluded.name,
      description = excluded.description,
      sort_order = excluded.sort_order,
      is_active = true,
      updated_at = now()
  `;

  const services = [
    [
      ids.services.massage,
      "深層舒壓",
      "針對肩頸與全身疲勞的客製舒壓。",
      10,
    ],
    [
      ids.services.facial,
      "光感臉部護理",
      "清潔、保濕與亮膚的完整臉部護理。",
      20,
    ],
    [
      ids.services.lashes,
      "自然款美睫",
      "依眼型調整的自然輕盈美睫設計。",
      30,
    ],
  ] as const;

  for (const [serviceId, name, description, sortOrder] of services) {
    await transaction.$executeRaw`
      insert into public.services (
        id,
        organization_id,
        category_id,
        name,
        description,
        booking_notice,
        online_booking_enabled,
        is_active,
        sort_order
      )
      values (
        ${serviceId}::uuid,
        ${ids.organization}::uuid,
        ${ids.category}::uuid,
        ${name},
        ${description},
        '如需取消或改期，請於預約前 24 小時操作。',
        true,
        true,
        ${sortOrder}
      )
      on conflict (id) do update
      set
        category_id = excluded.category_id,
        name = excluded.name,
        description = excluded.description,
        booking_notice = excluded.booking_notice,
        online_booking_enabled = true,
        is_active = true,
        sort_order = excluded.sort_order,
        updated_at = now()
    `;
  }

  const variants = [
    [ids.variants.massage, ids.services.massage, "60 分鐘", 60, 180000, 10],
    [ids.variants.facial, ids.services.facial, "90 分鐘", 90, 260000, 10],
    [ids.variants.lashes, ids.services.lashes, "120 分鐘", 120, 320000, 15],
  ] as const;

  for (
    const [
      variantId,
      serviceId,
      name,
      durationMinutes,
      priceMinor,
      bufferMinutes,
    ] of variants
  ) {
    await transaction.$executeRaw`
      insert into public.service_variants (
        id,
        organization_id,
        service_id,
        name,
        duration_minutes,
        price_minor,
        pre_buffer_minutes,
        post_buffer_minutes,
        deposit_fixed_minor,
        is_default,
        is_active,
        created_at
      )
      values (
        ${variantId}::uuid,
        ${ids.organization}::uuid,
        ${serviceId}::uuid,
        ${name},
        ${durationMinutes},
        ${priceMinor},
        ${bufferMinutes},
        ${bufferMinutes},
        50000,
        true,
        true,
        now()
      )
      on conflict (id) do update
      set
        name = excluded.name,
        duration_minutes = excluded.duration_minutes,
        price_minor = excluded.price_minor,
        pre_buffer_minutes = excluded.pre_buffer_minutes,
        post_buffer_minutes = excluded.post_buffer_minutes,
        deposit_fixed_minor = excluded.deposit_fixed_minor,
        deposit_percentage = null,
        is_default = true,
        is_active = true,
        updated_at = now()
    `;
  }

  const locationServices = [
    [
      ids.locationServices.massage,
      ids.services.massage,
      ids.variants.massage,
      10,
    ],
    [
      ids.locationServices.facial,
      ids.services.facial,
      ids.variants.facial,
      20,
    ],
    [
      ids.locationServices.lashes,
      ids.services.lashes,
      ids.variants.lashes,
      30,
    ],
  ] as const;

  for (
    const [locationServiceId, serviceId, variantId, sortOrder] of locationServices
  ) {
    await transaction.$executeRaw`
      insert into public.location_services (
        id,
        organization_id,
        location_id,
        service_id,
        service_variant_id,
        online_booking_enabled,
        is_active,
        sort_order
      )
      values (
        ${locationServiceId}::uuid,
        ${ids.organization}::uuid,
        ${ids.location}::uuid,
        ${serviceId}::uuid,
        ${variantId}::uuid,
        true,
        true,
        ${sortOrder}
      )
      on conflict (id) do update
      set
        online_booking_enabled = true,
        is_active = true,
        sort_order = excluded.sort_order,
        updated_at = now()
    `;
  }
}

async function seedStaffAndResources(
  transaction: Prisma.TransactionClient,
): Promise<void> {
  const staff = [
    [
      ids.staff.primary,
      ids.profiles.provider,
      "Yuki",
      "資深美容師",
      ["舒壓", "臉部護理", "美睫"],
      10,
    ],
    [
      ids.staff.secondary,
      null,
      "Mina",
      "美容顧問",
      ["舒壓", "臉部護理"],
      20,
    ],
  ] as const;

  for (
    const [staffId, linkedProfileId, displayName, title, skills, sortOrder] of staff
  ) {
    await transaction.$executeRaw`
      insert into public.staff_profiles (
        id,
        organization_id,
        linked_profile_id,
        display_name,
        title,
        bio,
        skills,
        public_visible,
        is_active,
        sort_order
      )
      values (
        ${staffId}::uuid,
        ${ids.organization}::uuid,
        ${linkedProfileId}::uuid,
        ${displayName},
        ${title},
        '重視節奏與顧客感受的專業服務。',
        ${skills}::text[],
        true,
        true,
        ${sortOrder}
      )
      on conflict (id) do update
      set
        linked_profile_id = excluded.linked_profile_id,
        display_name = excluded.display_name,
        title = excluded.title,
        skills = excluded.skills,
        public_visible = true,
        is_active = true,
        sort_order = excluded.sort_order,
        disabled_at = null,
        updated_at = now()
    `;

    await transaction.$executeRaw`
      insert into public.staff_location_assignments (
        organization_id,
        staff_profile_id,
        location_id,
        is_primary,
        is_active
      )
      values (
        ${ids.organization}::uuid,
        ${staffId}::uuid,
        ${ids.location}::uuid,
        true,
        true
      )
      on conflict (staff_profile_id, location_id) do update
      set
        is_primary = true,
        is_active = true,
        updated_at = now()
    `;

    await transaction.$executeRaw`
      insert into public.staff_availability_rules (
        organization_id,
        location_id,
        staff_profile_id,
        day_of_week,
        segment_index,
        starts_at,
        ends_at,
        effective_from,
        is_active
      )
      select
        ${ids.organization}::uuid,
        ${ids.location}::uuid,
        ${staffId}::uuid,
        day_of_week,
        0,
        '10:00'::time,
        '20:00'::time,
        '2026-01-01'::date,
        true
      from generate_series(0, 6) as day_of_week
      on conflict (
        location_id,
        staff_profile_id,
        day_of_week,
        segment_index,
        effective_from
      ) do update
      set
        starts_at = excluded.starts_at,
        ends_at = excluded.ends_at,
        is_active = true,
        updated_at = now()
    `;
  }

  for (const staffId of [ids.staff.primary, ids.staff.secondary]) {
    for (const variantId of Object.values(ids.variants)) {
      await transaction.$executeRaw`
        insert into public.staff_service_assignments (
          organization_id,
          staff_profile_id,
          service_variant_id,
          is_active
        )
        values (
          ${ids.organization}::uuid,
          ${staffId}::uuid,
          ${variantId}::uuid,
          true
        )
        on conflict (staff_profile_id, service_variant_id) do update
        set is_active = true, updated_at = now()
      `;
    }

    for (const locationServiceId of Object.values(ids.locationServices)) {
      await transaction.$executeRaw`
        insert into public.service_staff_assignments (
          organization_id,
          location_service_id,
          staff_profile_id,
          online_booking_enabled,
          is_active
        )
        values (
          ${ids.organization}::uuid,
          ${locationServiceId}::uuid,
          ${staffId}::uuid,
          true,
          true
        )
        on conflict (location_service_id, staff_profile_id) do update
        set
          online_booking_enabled = true,
          is_active = true,
          updated_at = now()
      `;
    }
  }

  await transaction.$executeRaw`
    insert into public.resource_types (
      id,
      organization_id,
      name,
      kind,
      description,
      is_active
    )
    values (
      ${ids.resourceType}::uuid,
      ${ids.organization}::uuid,
      '美容療程室',
      'SPA_ROOM',
      '可安排舒壓、美容與美睫療程的獨立空間。',
      true
    )
    on conflict (id) do update
    set
      name = excluded.name,
      kind = excluded.kind,
      description = excluded.description,
      is_active = true,
      updated_at = now()
  `;

  const resources = [
    [ids.resources.roomA, "光感 A 室", 10],
    [ids.resources.roomB, "光感 B 室", 20],
  ] as const;

  for (const [resourceId, name, sortOrder] of resources) {
    await transaction.$executeRaw`
      insert into public.resources (
        id,
        organization_id,
        location_id,
        resource_type_id,
        name,
        description,
        is_active,
        sort_order
      )
      values (
        ${resourceId}::uuid,
        ${ids.organization}::uuid,
        ${ids.location}::uuid,
        ${ids.resourceType}::uuid,
        ${name},
        '本機測試可預約療程室',
        true,
        ${sortOrder}
      )
      on conflict (id) do update
      set
        name = excluded.name,
        description = excluded.description,
        is_active = true,
        sort_order = excluded.sort_order,
        disabled_at = null,
        updated_at = now()
    `;
  }

  for (const variantId of Object.values(ids.variants)) {
    await transaction.$executeRaw`
      insert into public.service_resource_requirements (
        organization_id,
        service_variant_id,
        resource_type_id,
        quantity,
        is_required
      )
      values (
        ${ids.organization}::uuid,
        ${variantId}::uuid,
        ${ids.resourceType}::uuid,
        1,
        true
      )
      on conflict (service_variant_id, resource_type_id) do update
      set quantity = 1, is_required = true, updated_at = now()
    `;
  }
}

async function seedPolicies(
  transaction: Prisma.TransactionClient,
): Promise<void> {
  await transaction.$executeRaw`
    insert into public.location_booking_policies (
      id,
      organization_id,
      location_id,
      slot_interval_minutes,
      minimum_lead_minutes,
      maximum_advance_days,
      hold_minutes,
      customer_cancellation_enabled,
      customer_reschedule_enabled,
      cancellation_cutoff_hours,
      reminder_hours,
      deposits_enabled
    )
    values (
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'::uuid,
      ${ids.organization}::uuid,
      ${ids.location}::uuid,
      15,
      60,
      60,
      10,
      true,
      true,
      24,
      '{24,3}',
      true
    )
    on conflict (location_id) do update
    set
      slot_interval_minutes = excluded.slot_interval_minutes,
      minimum_lead_minutes = excluded.minimum_lead_minutes,
      maximum_advance_days = excluded.maximum_advance_days,
      hold_minutes = excluded.hold_minutes,
      customer_cancellation_enabled = true,
      customer_reschedule_enabled = true,
      cancellation_cutoff_hours = excluded.cancellation_cutoff_hours,
      reminder_hours = excluded.reminder_hours,
      deposits_enabled = true,
      updated_at = now()
  `;

  await transaction.$executeRaw`
    insert into public.deposit_policies (
      id,
      organization_id,
      location_id,
      name,
      mode,
      fixed_amount_minor,
      payment_window_minutes,
      is_active
    )
    values (
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2'::uuid,
      ${ids.organization}::uuid,
      ${ids.location}::uuid,
      '公開預約訂金',
      'FIXED',
      50000,
      15,
      true
    )
    on conflict (id) do update
    set
      name = excluded.name,
      mode = excluded.mode,
      fixed_amount_minor = excluded.fixed_amount_minor,
      payment_window_minutes = excluded.payment_window_minutes,
      is_active = true,
      updated_at = now()
  `;

  await transaction.$executeRaw`
    insert into public.cancellation_policies (
      id,
      organization_id,
      location_id,
      name,
      free_cancellation_hours,
      late_fee_mode,
      late_fee_percentage,
      no_show_fee_mode,
      no_show_fee_percentage,
      is_active
    )
    values (
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3'::uuid,
      ${ids.organization}::uuid,
      ${ids.location}::uuid,
      '一般取消規則',
      24,
      'PERCENTAGE',
      20,
      'PERCENTAGE',
      50,
      true
    )
    on conflict (id) do update
    set
      name = excluded.name,
      free_cancellation_hours = excluded.free_cancellation_hours,
      late_fee_mode = excluded.late_fee_mode,
      late_fee_percentage = excluded.late_fee_percentage,
      no_show_fee_mode = excluded.no_show_fee_mode,
      no_show_fee_percentage = excluded.no_show_fee_percentage,
      is_active = true,
      updated_at = now()
  `;
}

type QaCustomerSeed = {
  id: string;
  contactId: string;
  displayName: string;
  phone: string;
  birthday: string;
  depositMode: "DEFAULT" | "REQUIRED" | "EXEMPT";
  isBlacklisted: boolean;
  blacklistReason: string | null;
  completedCount: number;
  cancelledCount: number;
  noShowCount: number;
  totalSpendMinor: bigint;
  noteId: string;
  note: string;
  noteSensitivity: "STANDARD" | "SENSITIVE";
};

async function cleanupTransientRoleQaData(
  transaction: Prisma.TransactionClient,
): Promise<void> {
  await transaction.$executeRaw`
    delete from public.customer_notes
    where organization_id = ${ids.organization}::uuid
      and customer_id in (
        select id
        from public.customers
        where organization_id = ${ids.organization}::uuid
          and display_name like 'QA 顧客 %'
      )
  `;
  await transaction.$executeRaw`
    delete from public.customer_tag_assignments
    where organization_id = ${ids.organization}::uuid
      and customer_id in (
        select id
        from public.customers
        where organization_id = ${ids.organization}::uuid
          and display_name like 'QA 顧客 %'
      )
  `;
  await transaction.$executeRaw`
    delete from public.customers
    where organization_id = ${ids.organization}::uuid
      and display_name like 'QA 顧客 %'
  `;
  await transaction.$executeRaw`
    delete from public.customer_tags
    where organization_id = ${ids.organization}::uuid
      and name like 'QA-%'
  `;
}

async function seedQaCustomers(
  transaction: Prisma.TransactionClient,
): Promise<void> {
  const tags = [
    [ids.qa.tags.vip, "VIP 常客", "#0f766e"],
    [ids.qa.tags.birthday, "本月生日", "#db2777"],
    [ids.qa.tags.attention, "高風險留意", "#dc2626"],
  ] as const;

  for (const [tagId, name, color] of tags) {
    await transaction.$executeRaw`
      insert into public.customer_tags (
        id,
        organization_id,
        name,
        color
      )
      values (
        ${tagId}::uuid,
        ${ids.organization}::uuid,
        ${name},
        ${color}
      )
      on conflict (id) do update
      set
        name = excluded.name,
        color = excluded.color,
        updated_at = now()
    `;
  }

  const customers: QaCustomerSeed[] = [
    {
      id: ids.qa.customers.loyal,
      contactId: ids.qa.contacts.loyal,
      displayName: "QA 王小美（VIP 常客）",
      phone: "0900000001",
      birthday: "1992-08-18",
      depositMode: "EXEMPT",
      isBlacklisted: false,
      blacklistReason: null,
      completedCount: 12,
      cancelledCount: 0,
      noShowCount: 0,
      totalSpendMinor: 3_860_000n,
      noteId: ids.qa.notes.loyal,
      note: "偏好安靜服務，肩頸力道中等；生日優惠待確認。",
      noteSensitivity: "STANDARD",
    },
    {
      id: ids.qa.customers.deposit,
      contactId: ids.qa.contacts.deposit,
      displayName: "QA 陳怡君（需訂金）",
      phone: "0900000002",
      birthday: "1988-11-06",
      depositMode: "REQUIRED",
      isBlacklisted: false,
      blacklistReason: null,
      completedCount: 1,
      cancelledCount: 1,
      noShowCount: 0,
      totalSpendMinor: 180_000n,
      noteId: ids.qa.notes.deposit,
      note: "首次線上預約曾逾時，後續預約需先確認訂金。",
      noteSensitivity: "SENSITIVE",
    },
    {
      id: ids.qa.customers.risk,
      contactId: ids.qa.contacts.risk,
      displayName: "QA 林雅婷（黑名單）",
      phone: "0900000003",
      birthday: "1995-02-14",
      depositMode: "REQUIRED",
      isBlacklisted: true,
      blacklistReason: "近三個月爽約 2 次、臨時取消 4 次",
      completedCount: 2,
      cancelledCount: 4,
      noShowCount: 2,
      totalSpendMinor: 520_000n,
      noteId: ids.qa.notes.risk,
      note: "再次開放預約前請由店長電話確認。",
      noteSensitivity: "SENSITIVE",
    },
  ];

  for (const customer of customers) {
    await transaction.$executeRaw`
      insert into public.customers (
        id,
        organization_id,
        display_name,
        birthday,
        contact_preference,
        source,
        deposit_mode,
        is_blacklisted,
        blacklist_reason,
        blacklisted_at,
        is_active
      )
      values (
        ${customer.id}::uuid,
        ${ids.organization}::uuid,
        ${customer.displayName},
        ${customer.birthday}::date,
        'PHONE',
        'OTHER',
        ${customer.depositMode}::public.customer_deposit_mode,
        ${customer.isBlacklisted},
        ${customer.blacklistReason},
        ${customer.isBlacklisted ? new Date() : null}::timestamptz,
        true
      )
      on conflict (id) do update
      set
        display_name = excluded.display_name,
        birthday = excluded.birthday,
        contact_preference = excluded.contact_preference,
        source = excluded.source,
        deposit_mode = excluded.deposit_mode,
        is_blacklisted = excluded.is_blacklisted,
        blacklist_reason = excluded.blacklist_reason,
        blacklisted_at = excluded.blacklisted_at,
        is_active = true,
        anonymized_at = null,
        updated_at = now()
    `;

    await transaction.$executeRaw`
      insert into public.customer_contacts (
        id,
        organization_id,
        customer_id,
        contact_type,
        value,
        normalized_value,
        is_primary,
        is_verified
      )
      values (
        ${customer.contactId}::uuid,
        ${ids.organization}::uuid,
        ${customer.id}::uuid,
        'PHONE',
        ${customer.phone},
        ${`+886${customer.phone.slice(1)}`},
        true,
        true
      )
      on conflict (id) do update
      set
        customer_id = excluded.customer_id,
        value = excluded.value,
        normalized_value = excluded.normalized_value,
        is_primary = true,
        is_verified = true,
        updated_at = now()
    `;

    await transaction.$executeRaw`
      insert into public.customer_metrics (
        customer_id,
        organization_id,
        last_service_at,
        completed_count,
        cancelled_count,
        no_show_count,
        total_spend_minor,
        average_ticket_minor,
        estimated_ltv_minor,
        expected_return_date
      )
      values (
        ${customer.id}::uuid,
        ${ids.organization}::uuid,
        now() - interval '14 days',
        ${customer.completedCount},
        ${customer.cancelledCount},
        ${customer.noShowCount},
        ${customer.totalSpendMinor},
        ${customer.completedCount > 0
          ? Number(customer.totalSpendMinor / BigInt(customer.completedCount))
          : 0},
        ${customer.totalSpendMinor * 2n},
        current_date + 30
      )
      on conflict (customer_id) do update
      set
        last_service_at = excluded.last_service_at,
        completed_count = excluded.completed_count,
        cancelled_count = excluded.cancelled_count,
        no_show_count = excluded.no_show_count,
        total_spend_minor = excluded.total_spend_minor,
        average_ticket_minor = excluded.average_ticket_minor,
        estimated_ltv_minor = excluded.estimated_ltv_minor,
        expected_return_date = excluded.expected_return_date,
        updated_at = now()
    `;

    await transaction.$executeRaw`
      insert into public.customer_notes (
        id,
        organization_id,
        customer_id,
        sensitivity,
        note,
        created_by
      )
      values (
        ${customer.noteId}::uuid,
        ${ids.organization}::uuid,
        ${customer.id}::uuid,
        ${customer.noteSensitivity}::public.customer_note_sensitivity,
        ${customer.note},
        ${ids.profiles.owner}::uuid
      )
      on conflict (id) do update
      set
        sensitivity = excluded.sensitivity,
        note = excluded.note,
        updated_by = ${ids.profiles.owner}::uuid,
        deleted_at = null,
        updated_at = now()
    `;
  }

  const tagAssignments = [
    [
      ids.qa.tagAssignments.loyalVip,
      ids.qa.customers.loyal,
      ids.qa.tags.vip,
    ],
    [
      ids.qa.tagAssignments.loyalBirthday,
      ids.qa.customers.loyal,
      ids.qa.tags.birthday,
    ],
    [
      ids.qa.tagAssignments.riskAttention,
      ids.qa.customers.risk,
      ids.qa.tags.attention,
    ],
  ] as const;

  for (const [assignmentId, customerId, tagId] of tagAssignments) {
    await transaction.$executeRaw`
      insert into public.customer_tag_assignments (
        id,
        organization_id,
        customer_id,
        tag_id,
        assigned_by
      )
      values (
        ${assignmentId}::uuid,
        ${ids.organization}::uuid,
        ${customerId}::uuid,
        ${tagId}::uuid,
        ${ids.profiles.owner}::uuid
      )
      on conflict (customer_id, tag_id) do update
      set assigned_by = excluded.assigned_by
    `;
  }
}

type QaBookingSeed = {
  id: string;
  segmentId: string;
  staffAllocationId: string;
  resourceAllocationId: string;
  customerId: string;
  staffId: string;
  staffName: string;
  resourceId: string;
  serviceId: string;
  variantId: string;
  serviceName: string;
  variantName: string;
  dayOffset: number;
  startsAt: string;
  durationMinutes: number;
  totalMinor: number;
  depositRequiredMinor: number;
  paidMinor: number;
  refundedMinor: number;
  status:
    | "PENDING_PAYMENT"
    | "CONFIRMED"
    | "CHECKED_IN"
    | "IN_SERVICE"
    | "COMPLETED"
    | "NO_SHOW"
    | "CANCELLED"
    | "EXPIRED";
  paymentStatus: "UNPAID" | "PAID" | "REFUNDED";
  isBlocking: boolean;
};

async function seedQaBookings(
  transaction: Prisma.TransactionClient,
): Promise<void> {
  const today = formatDateInTimeZone(new Date(), "Asia/Taipei");
  const bookings: QaBookingSeed[] = [
    {
      id: ids.qa.bookings.confirmed,
      segmentId: "c1000000-0000-4000-8000-000000000002",
      staffAllocationId: "c2000000-0000-4000-8000-000000000002",
      resourceAllocationId: "c3000000-0000-4000-8000-000000000002",
      customerId: ids.qa.customers.loyal,
      staffId: ids.staff.primary,
      staffName: "Yuki",
      resourceId: ids.resources.roomA,
      serviceId: ids.services.massage,
      variantId: ids.variants.massage,
      serviceName: "深層舒壓",
      variantName: "60 分鐘",
      dayOffset: 0,
      startsAt: "10:00",
      durationMinutes: 60,
      totalMinor: 180_000,
      depositRequiredMinor: 50_000,
      paidMinor: 50_000,
      refundedMinor: 0,
      status: "CONFIRMED",
      paymentStatus: "PAID",
      isBlocking: true,
    },
    {
      id: ids.qa.bookings.checkedIn,
      segmentId: "c1000000-0000-4000-8000-000000000003",
      staffAllocationId: "c2000000-0000-4000-8000-000000000003",
      resourceAllocationId: "c3000000-0000-4000-8000-000000000003",
      customerId: ids.qa.customers.deposit,
      staffId: ids.staff.secondary,
      staffName: "Mina",
      resourceId: ids.resources.roomB,
      serviceId: ids.services.facial,
      variantId: ids.variants.facial,
      serviceName: "光感臉部護理",
      variantName: "90 分鐘",
      dayOffset: 0,
      startsAt: "11:30",
      durationMinutes: 90,
      totalMinor: 260_000,
      depositRequiredMinor: 50_000,
      paidMinor: 50_000,
      refundedMinor: 0,
      status: "CHECKED_IN",
      paymentStatus: "PAID",
      isBlocking: true,
    },
    {
      id: ids.qa.bookings.confirmedNoShow,
      segmentId: "c1000000-0000-4000-8000-000000000010",
      staffAllocationId: "c2000000-0000-4000-8000-000000000010",
      resourceAllocationId: "c3000000-0000-4000-8000-000000000010",
      customerId: ids.qa.customers.risk,
      staffId: ids.staff.primary,
      staffName: "Yuki",
      resourceId: ids.resources.roomA,
      serviceId: ids.services.massage,
      variantId: ids.variants.massage,
      serviceName: "深層舒壓",
      variantName: "60 分鐘",
      dayOffset: 0,
      startsAt: "17:00",
      durationMinutes: 60,
      totalMinor: 180_000,
      depositRequiredMinor: 50_000,
      paidMinor: 50_000,
      refundedMinor: 0,
      status: "CONFIRMED",
      paymentStatus: "PAID",
      isBlocking: true,
    },
    {
      id: ids.qa.bookings.inService,
      segmentId: "c1000000-0000-4000-8000-000000000004",
      staffAllocationId: "c2000000-0000-4000-8000-000000000004",
      resourceAllocationId: "c3000000-0000-4000-8000-000000000004",
      customerId: ids.qa.customers.loyal,
      staffId: ids.staff.primary,
      staffName: "Yuki",
      resourceId: ids.resources.roomA,
      serviceId: ids.services.lashes,
      variantId: ids.variants.lashes,
      serviceName: "自然款美睫",
      variantName: "120 分鐘",
      dayOffset: 0,
      startsAt: "14:00",
      durationMinutes: 120,
      totalMinor: 320_000,
      depositRequiredMinor: 50_000,
      paidMinor: 50_000,
      refundedMinor: 0,
      status: "IN_SERVICE",
      paymentStatus: "PAID",
      isBlocking: true,
    },
    {
      id: ids.qa.bookings.pendingPayment,
      segmentId: "c1000000-0000-4000-8000-000000000001",
      staffAllocationId: "c2000000-0000-4000-8000-000000000001",
      resourceAllocationId: "c3000000-0000-4000-8000-000000000001",
      customerId: ids.qa.customers.deposit,
      staffId: ids.staff.primary,
      staffName: "Yuki",
      resourceId: ids.resources.roomA,
      serviceId: ids.services.massage,
      variantId: ids.variants.massage,
      serviceName: "深層舒壓",
      variantName: "60 分鐘",
      dayOffset: 2,
      startsAt: "18:00",
      durationMinutes: 60,
      totalMinor: 180_000,
      depositRequiredMinor: 50_000,
      paidMinor: 0,
      refundedMinor: 0,
      status: "PENDING_PAYMENT",
      paymentStatus: "UNPAID",
      isBlocking: true,
    },
    {
      id: ids.qa.bookings.pendingExpiry,
      segmentId: "c1000000-0000-4000-8000-000000000009",
      staffAllocationId: "c2000000-0000-4000-8000-000000000009",
      resourceAllocationId: "c3000000-0000-4000-8000-000000000009",
      customerId: ids.qa.customers.risk,
      staffId: ids.staff.secondary,
      staffName: "Mina",
      resourceId: ids.resources.roomB,
      serviceId: ids.services.massage,
      variantId: ids.variants.massage,
      serviceName: "深層舒壓",
      variantName: "60 分鐘",
      dayOffset: 3,
      startsAt: "18:30",
      durationMinutes: 60,
      totalMinor: 180_000,
      depositRequiredMinor: 50_000,
      paidMinor: 0,
      refundedMinor: 0,
      status: "PENDING_PAYMENT",
      paymentStatus: "UNPAID",
      isBlocking: true,
    },
    {
      id: ids.qa.bookings.completed,
      segmentId: "c1000000-0000-4000-8000-000000000005",
      staffAllocationId: "c2000000-0000-4000-8000-000000000005",
      resourceAllocationId: "c3000000-0000-4000-8000-000000000005",
      customerId: ids.qa.customers.loyal,
      staffId: ids.staff.primary,
      staffName: "Yuki",
      resourceId: ids.resources.roomA,
      serviceId: ids.services.massage,
      variantId: ids.variants.massage,
      serviceName: "深層舒壓",
      variantName: "60 分鐘",
      dayOffset: -1,
      startsAt: "10:00",
      durationMinutes: 60,
      totalMinor: 180_000,
      depositRequiredMinor: 50_000,
      paidMinor: 180_000,
      refundedMinor: 0,
      status: "COMPLETED",
      paymentStatus: "PAID",
      isBlocking: false,
    },
    {
      id: ids.qa.bookings.cancelled,
      segmentId: "c1000000-0000-4000-8000-000000000006",
      staffAllocationId: "c2000000-0000-4000-8000-000000000006",
      resourceAllocationId: "c3000000-0000-4000-8000-000000000006",
      customerId: ids.qa.customers.risk,
      staffId: ids.staff.secondary,
      staffName: "Mina",
      resourceId: ids.resources.roomB,
      serviceId: ids.services.facial,
      variantId: ids.variants.facial,
      serviceName: "光感臉部護理",
      variantName: "90 分鐘",
      dayOffset: -2,
      startsAt: "12:00",
      durationMinutes: 90,
      totalMinor: 260_000,
      depositRequiredMinor: 50_000,
      paidMinor: 50_000,
      refundedMinor: 50_000,
      status: "CANCELLED",
      paymentStatus: "REFUNDED",
      isBlocking: false,
    },
    {
      id: ids.qa.bookings.noShow,
      segmentId: "c1000000-0000-4000-8000-000000000007",
      staffAllocationId: "c2000000-0000-4000-8000-000000000007",
      resourceAllocationId: "c3000000-0000-4000-8000-000000000007",
      customerId: ids.qa.customers.risk,
      staffId: ids.staff.primary,
      staffName: "Yuki",
      resourceId: ids.resources.roomA,
      serviceId: ids.services.lashes,
      variantId: ids.variants.lashes,
      serviceName: "自然款美睫",
      variantName: "120 分鐘",
      dayOffset: -3,
      startsAt: "15:00",
      durationMinutes: 120,
      totalMinor: 320_000,
      depositRequiredMinor: 50_000,
      paidMinor: 50_000,
      refundedMinor: 0,
      status: "NO_SHOW",
      paymentStatus: "PAID",
      isBlocking: false,
    },
    {
      id: ids.qa.bookings.expired,
      segmentId: "c1000000-0000-4000-8000-000000000008",
      staffAllocationId: "c2000000-0000-4000-8000-000000000008",
      resourceAllocationId: "c3000000-0000-4000-8000-000000000008",
      customerId: ids.qa.customers.risk,
      staffId: ids.staff.secondary,
      staffName: "Mina",
      resourceId: ids.resources.roomB,
      serviceId: ids.services.massage,
      variantId: ids.variants.massage,
      serviceName: "深層舒壓",
      variantName: "60 分鐘",
      dayOffset: 1,
      startsAt: "18:30",
      durationMinutes: 60,
      totalMinor: 180_000,
      depositRequiredMinor: 50_000,
      paidMinor: 0,
      refundedMinor: 0,
      status: "EXPIRED",
      paymentStatus: "UNPAID",
      isBlocking: false,
    },
  ];

  const bookingIds = bookings.map((booking) =>
    Prisma.sql`${booking.id}::uuid`,
  );
  await transaction.$executeRaw`
    delete from public.notification_outbox
    where organization_id = ${ids.organization}::uuid
      and booking_id in (${Prisma.join(bookingIds)})
  `;
  await transaction.$executeRaw`
    delete from public.booking_payments
    where organization_id = ${ids.organization}::uuid
      and booking_id in (${Prisma.join(bookingIds)})
  `;

  for (const booking of bookings) {
    const date = addLocalDays(today, booking.dayOffset);
    const startsAt = zonedDateTimeToUtc(
      date,
      booking.startsAt,
      "Asia/Taipei",
    );
    const endsAt = new Date(
      startsAt.getTime() + booking.durationMinutes * 60_000,
    );
    const confirmedAt =
      booking.status === "PENDING_PAYMENT" || booking.status === "EXPIRED"
        ? null
        : new Date(startsAt.getTime() - 24 * 60 * 60_000);
    const checkedInAt = ["CHECKED_IN", "IN_SERVICE", "COMPLETED"].includes(
      booking.status,
    )
      ? startsAt
      : null;
    const serviceStartedAt = ["IN_SERVICE", "COMPLETED"].includes(
      booking.status,
    )
      ? startsAt
      : null;
    const completedAt = booking.status === "COMPLETED" ? endsAt : null;
    const cancelledAt =
      booking.status === "CANCELLED"
        ? new Date(startsAt.getTime() - 12 * 60 * 60_000)
        : null;
    const expiredAt =
      booking.status === "EXPIRED"
        ? new Date(startsAt.getTime() - 60 * 60_000)
        : null;

    await transaction.$executeRaw`
      insert into public.bookings (
        id,
        organization_id,
        location_id,
        customer_id,
        source,
        status,
        payment_status,
        subtotal_minor,
        total_minor,
        deposit_required_minor,
        paid_minor,
        refunded_minor,
        currency,
        policy_snapshot,
        public_note,
        internal_note,
        tracking_token_hash,
        version,
        is_test,
        confirmed_at,
        checked_in_at,
        service_started_at,
        completed_at,
        cancelled_at,
        expired_at,
        created_by,
        updated_by
      )
      values (
        ${booking.id}::uuid,
        ${ids.organization}::uuid,
        ${ids.location}::uuid,
        ${booking.customerId}::uuid,
        'OTHER',
        ${booking.status}::public.booking_status,
        ${booking.paymentStatus}::public.booking_payment_status,
        ${booking.totalMinor},
        ${booking.totalMinor},
        ${booking.depositRequiredMinor},
        ${booking.paidMinor},
        ${booking.refundedMinor},
        'TWD',
        ${JSON.stringify({ source: "LOCAL_QA_SEED", depositsEnabled: true })}::jsonb,
        '本機自動化 QA 測試資料',
        'LOCAL_QA_SEED',
        ${`local-qa-${booking.id}`},
        1,
        true,
        ${confirmedAt}::timestamptz,
        ${checkedInAt}::timestamptz,
        ${serviceStartedAt}::timestamptz,
        ${completedAt}::timestamptz,
        ${cancelledAt}::timestamptz,
        ${expiredAt}::timestamptz,
        ${ids.profiles.owner}::uuid,
        ${ids.profiles.owner}::uuid
      )
      on conflict (id) do update
      set
        customer_id = excluded.customer_id,
        source = excluded.source,
        status = excluded.status,
        payment_status = excluded.payment_status,
        subtotal_minor = excluded.subtotal_minor,
        discount_minor = 0,
        total_minor = excluded.total_minor,
        deposit_required_minor = excluded.deposit_required_minor,
        paid_minor = excluded.paid_minor,
        refunded_minor = excluded.refunded_minor,
        cancellation_fee_minor = 0,
        policy_snapshot = excluded.policy_snapshot,
        public_note = excluded.public_note,
        internal_note = excluded.internal_note,
        version = 1,
        is_test = true,
        confirmed_at = excluded.confirmed_at,
        checked_in_at = excluded.checked_in_at,
        service_started_at = excluded.service_started_at,
        completed_at = excluded.completed_at,
        cancelled_at = excluded.cancelled_at,
        expired_at = excluded.expired_at,
        updated_by = excluded.updated_by,
        updated_at = now()
    `;

    await transaction.$executeRaw`
      insert into public.booking_segments (
        id,
        organization_id,
        location_id,
        booking_id,
        service_id,
        service_variant_id,
        assigned_staff_id,
        service_name_snapshot,
        variant_name_snapshot,
        staff_name_snapshot,
        starts_at,
        ends_at,
        duration_minutes,
        price_minor,
        resource_requirements_snapshot
      )
      values (
        ${booking.segmentId}::uuid,
        ${ids.organization}::uuid,
        ${ids.location}::uuid,
        ${booking.id}::uuid,
        ${booking.serviceId}::uuid,
        ${booking.variantId}::uuid,
        ${booking.staffId}::uuid,
        ${booking.serviceName},
        ${booking.variantName},
        ${booking.staffName},
        ${startsAt},
        ${endsAt},
        ${booking.durationMinutes},
        ${booking.totalMinor},
        ${JSON.stringify([{ resourceTypeId: ids.resourceType, quantity: 1 }])}::jsonb
      )
      on conflict (id) do update
      set
        booking_id = excluded.booking_id,
        service_id = excluded.service_id,
        service_variant_id = excluded.service_variant_id,
        assigned_staff_id = excluded.assigned_staff_id,
        service_name_snapshot = excluded.service_name_snapshot,
        variant_name_snapshot = excluded.variant_name_snapshot,
        staff_name_snapshot = excluded.staff_name_snapshot,
        starts_at = excluded.starts_at,
        ends_at = excluded.ends_at,
        duration_minutes = excluded.duration_minutes,
        price_minor = excluded.price_minor,
        resource_requirements_snapshot = excluded.resource_requirements_snapshot,
        updated_at = now()
    `;

    await transaction.$executeRaw`
      insert into public.booking_staff_allocations (
        id,
        organization_id,
        location_id,
        booking_id,
        booking_segment_id,
        staff_profile_id,
        starts_at,
        ends_at,
        is_blocking
      )
      values (
        ${booking.staffAllocationId}::uuid,
        ${ids.organization}::uuid,
        ${ids.location}::uuid,
        ${booking.id}::uuid,
        ${booking.segmentId}::uuid,
        ${booking.staffId}::uuid,
        ${startsAt},
        ${endsAt},
        ${booking.isBlocking}
      )
      on conflict (id) do update
      set
        booking_id = excluded.booking_id,
        booking_segment_id = excluded.booking_segment_id,
        staff_profile_id = excluded.staff_profile_id,
        starts_at = excluded.starts_at,
        ends_at = excluded.ends_at,
        is_blocking = excluded.is_blocking,
        updated_at = now()
    `;

    await transaction.$executeRaw`
      insert into public.booking_resource_allocations (
        id,
        organization_id,
        location_id,
        booking_id,
        booking_segment_id,
        resource_id,
        starts_at,
        ends_at,
        is_blocking
      )
      values (
        ${booking.resourceAllocationId}::uuid,
        ${ids.organization}::uuid,
        ${ids.location}::uuid,
        ${booking.id}::uuid,
        ${booking.segmentId}::uuid,
        ${booking.resourceId}::uuid,
        ${startsAt},
        ${endsAt},
        ${booking.isBlocking}
      )
      on conflict (id) do update
      set
        booking_id = excluded.booking_id,
        booking_segment_id = excluded.booking_segment_id,
        resource_id = excluded.resource_id,
        starts_at = excluded.starts_at,
        ends_at = excluded.ends_at,
        is_blocking = excluded.is_blocking,
        updated_at = now()
    `;
  }
}

async function seedQaBillingAndNotifications(
  transaction: Prisma.TransactionClient,
): Promise<void> {
  const today = formatDateInTimeZone(new Date(), "Asia/Taipei");
  const periodStart = new Date(`${today.slice(0, 7)}-01T00:00:00.000Z`);
  const periodEnd = new Date(
    Date.UTC(
      Number(today.slice(0, 4)),
      Number(today.slice(5, 7)),
      0,
    ),
  );

  await transaction.$executeRaw`
    insert into public.invoices (
      id,
      organization_id,
      subscription_id,
      invoice_number,
      status,
      currency,
      period_start,
      period_end,
      subtotal_minor,
      total_minor,
      amount_paid_minor,
      issued_at,
      due_at
    )
    values (
      ${ids.qa.invoice}::uuid,
      ${ids.organization}::uuid,
      ${ids.subscription}::uuid,
      'LOCAL-QA-0001',
      'ISSUED',
      'TWD',
      ${periodStart}::date,
      ${periodEnd}::date,
      100000,
      100000,
      0,
      now() - interval '2 days',
      now() + interval '12 days'
    )
    on conflict (id) do update
    set
      status = 'ISSUED',
      period_start = excluded.period_start,
      period_end = excluded.period_end,
      subtotal_minor = excluded.subtotal_minor,
      tax_minor = 0,
      total_minor = excluded.total_minor,
      amount_paid_minor = 0,
      issued_at = excluded.issued_at,
      due_at = excluded.due_at,
      paid_at = null,
      voided_at = null,
      updated_at = now()
  `;

  const integrations = [
    ["e3000000-0000-4000-8000-000000000001", "LINE", "ACTIVE", null],
    [
      "e3000000-0000-4000-8000-000000000002",
      "EMAIL",
      "ERROR",
      "LOCAL_QA_PROVIDER_TIMEOUT",
    ],
  ] as const;

  for (const [integrationId, channel, status, errorCode] of integrations) {
    await transaction.$executeRaw`
      insert into public.notification_integrations (
        id,
        organization_id,
        channel,
        status,
        configuration,
        last_verified_at,
        last_error_code
      )
      values (
        ${integrationId}::uuid,
        ${ids.organization}::uuid,
        ${channel}::public.notification_channel,
        ${status}::public.notification_integration_status,
        ${JSON.stringify({ source: "LOCAL_QA_SEED" })}::jsonb,
        now() - interval '1 hour',
        ${errorCode}
      )
      on conflict (organization_id, channel) do update
      set
        status = excluded.status,
        configuration = excluded.configuration,
        last_verified_at = excluded.last_verified_at,
        last_error_code = excluded.last_error_code,
        updated_at = now()
    `;
  }

  const notifications = [
    {
      outboxId: ids.qa.notifications.outboxFailed,
      jobId: ids.qa.notifications.jobFailed,
      deliveryId: ids.qa.notifications.deliveryFailed,
      bookingId: ids.qa.bookings.confirmed,
      customerId: ids.qa.customers.loyal,
      eventType: "BOOKING_REMINDER_1H",
      channel: "EMAIL",
      jobStatus: "FAILED",
      deliveryStatus: "FAILED",
      attemptCount: 2,
      maxAttempts: 5,
      errorCode: "LOCAL_QA_PROVIDER_TIMEOUT",
      attemptNumber: 2,
    },
    {
      outboxId: ids.qa.notifications.outboxDeadLetter,
      jobId: ids.qa.notifications.jobDeadLetter,
      deliveryId: ids.qa.notifications.deliveryDeadLetter,
      bookingId: ids.qa.bookings.pendingPayment,
      customerId: ids.qa.customers.deposit,
      eventType: "BOOKING_PAYMENT_PENDING",
      channel: "LINE",
      jobStatus: "DEAD_LETTER",
      deliveryStatus: "FAILED",
      attemptCount: 5,
      maxAttempts: 5,
      errorCode: "LOCAL_QA_RECIPIENT_UNREACHABLE",
      attemptNumber: 5,
    },
    {
      outboxId: ids.qa.notifications.outboxSucceeded,
      jobId: ids.qa.notifications.jobSucceeded,
      deliveryId: ids.qa.notifications.deliverySucceeded,
      bookingId: ids.qa.bookings.completed,
      customerId: ids.qa.customers.loyal,
      eventType: "BOOKING_COMPLETED",
      channel: "LINE",
      jobStatus: "SUCCEEDED",
      deliveryStatus: "SENT",
      attemptCount: 1,
      maxAttempts: 5,
      errorCode: null,
      attemptNumber: 1,
    },
  ] as const;

  for (const notification of notifications) {
    await transaction.$executeRaw`
      insert into public.notification_outbox (
        id,
        organization_id,
        location_id,
        booking_id,
        customer_id,
        event_type,
        payload,
        idempotency_key,
        dispatched_at
      )
      values (
        ${notification.outboxId}::uuid,
        ${ids.organization}::uuid,
        ${ids.location}::uuid,
        ${notification.bookingId}::uuid,
        ${notification.customerId}::uuid,
        ${notification.eventType}::public.notification_event_type,
        ${JSON.stringify({ source: "LOCAL_QA_SEED" })}::jsonb,
        ${`local-qa-${notification.outboxId}`},
        now() - interval '30 minutes'
      )
      on conflict (id) do update
      set
        event_type = excluded.event_type,
        payload = excluded.payload,
        dispatched_at = excluded.dispatched_at
    `;

    await transaction.$executeRaw`
      insert into public.notification_jobs (
        id,
        organization_id,
        outbox_id,
        channel,
        status,
        scheduled_at,
        attempt_count,
        max_attempts,
        next_attempt_at,
        last_error_code,
        completed_at
      )
      values (
        ${notification.jobId}::uuid,
        ${ids.organization}::uuid,
        ${notification.outboxId}::uuid,
        ${notification.channel}::public.notification_channel,
        ${notification.jobStatus}::public.notification_job_status,
        now() - interval '45 minutes',
        ${notification.attemptCount},
        ${notification.maxAttempts},
        now() - interval '15 minutes',
        ${notification.errorCode},
        ${notification.jobStatus === "SUCCEEDED" ? new Date() : null}::timestamptz
      )
      on conflict (id) do update
      set
        channel = excluded.channel,
        status = excluded.status,
        scheduled_at = excluded.scheduled_at,
        attempt_count = excluded.attempt_count,
        max_attempts = excluded.max_attempts,
        next_attempt_at = excluded.next_attempt_at,
        locked_at = null,
        locked_by = null,
        last_error_code = excluded.last_error_code,
        completed_at = excluded.completed_at,
        updated_at = now()
    `;

    await transaction.$executeRaw`
      insert into public.notification_deliveries (
        id,
        organization_id,
        notification_job_id,
        channel,
        status,
        attempt_number,
        error_code,
        response_metadata,
        started_at,
        delivered_at
      )
      values (
        ${notification.deliveryId}::uuid,
        ${ids.organization}::uuid,
        ${notification.jobId}::uuid,
        ${notification.channel}::public.notification_channel,
        ${notification.deliveryStatus}::public.notification_delivery_status,
        ${notification.attemptNumber},
        ${notification.errorCode},
        ${JSON.stringify({ source: "LOCAL_QA_SEED" })}::jsonb,
        now() - interval '30 minutes',
        ${notification.deliveryStatus === "SENT" ? new Date() : null}::timestamptz
      )
      on conflict (id) do update
      set
        status = excluded.status,
        attempt_number = excluded.attempt_number,
        error_code = excluded.error_code,
        response_metadata = excluded.response_metadata,
        started_at = excluded.started_at,
        delivered_at = excluded.delivered_at
    `;
  }
}

async function main(): Promise<void> {
  assertLocalSeedTarget();

  const prisma = new PrismaClient();
  const passwordHash = await hash(DEMO_PASSWORD, 12);

  try {
    await prisma.$transaction(
      async (transaction) => {
        await transaction.$executeRawUnsafe(
          "alter table public.bookings disable trigger bookings_transition_before_update",
        );
        try {
          await seedProfiles(transaction, passwordHash);
          await seedOrganization(transaction);
          await seedMemberships(transaction);
          await seedSubscription(transaction);
          await seedCatalog(transaction);
          await seedStaffAndResources(transaction);
          await seedPolicies(transaction);
          await cleanupTransientRoleQaData(transaction);
          await seedQaCustomers(transaction);
          await seedQaBookings(transaction);
          await seedQaBillingAndNotifications(transaction);
        } finally {
          await transaction.$executeRawUnsafe(
            "alter table public.bookings enable trigger bookings_transition_before_update",
          );
        }
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        timeout: 30_000,
      },
    );

    console.log(
      `Seeded Beauty demo organization, ${profiles.length} local accounts, and deterministic role QA data.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
