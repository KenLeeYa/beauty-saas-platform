import { Prisma, PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";

const EXPECTED_PROJECT_REF = "dfuhylsmhrysbmhpeylx";

const ids = {
  organization: "a1000000-0000-4000-8000-000000000001",
  location: "a2000000-0000-4000-8000-000000000001",
  profiles: {
    merchant: "a3000000-0000-4000-8000-000000000001",
    provider: "a3000000-0000-4000-8000-000000000002",
    platform: "a3000000-0000-4000-8000-000000000003",
    customer: "a3000000-0000-4000-8000-000000000004",
  },
  staff: "a4000000-0000-4000-8000-000000000001",
  category: "a5000000-0000-4000-8000-000000000001",
  service: "a5100000-0000-4000-8000-000000000001",
  variant: "a5200000-0000-4000-8000-000000000001",
  locationService: "a5300000-0000-4000-8000-000000000001",
  resourceType: "a6000000-0000-4000-8000-000000000001",
  resource: "a6100000-0000-4000-8000-000000000001",
  subscription: "a7000000-0000-4000-8000-000000000001",
  bookingPolicy: "a8000000-0000-4000-8000-000000000001",
  depositPolicy: "a8000000-0000-4000-8000-000000000002",
  cancellationPolicy: "a8000000-0000-4000-8000-000000000003",
};

const accounts = [
  {
    key: "merchant",
    email: "merchant.qa@beauty-preview.test",
    displayName: "Beauty Preview 店家",
    platformRole: null,
  },
  {
    key: "provider",
    email: "provider.qa@beauty-preview.test",
    displayName: "Preview 美容師",
    platformRole: null,
  },
  {
    key: "platform",
    email: "platform.qa@beauty-preview.test",
    displayName: "Beauty 平台 QA",
    platformRole: "PLATFORM_ADMIN",
  },
  {
    key: "customer",
    email: "customer.qa@beauty-preview.test",
    displayName: "Preview 顧客",
    platformRole: null,
  },
];

function requiredEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

function assertProductionTarget() {
  if (
    process.env.ALLOW_PRODUCTION_QA_BOOTSTRAP !== "true" ||
    process.env.APP_ENV !== "production"
  ) {
    throw new Error(
      "Production QA bootstrap requires explicit production flags.",
    );
  }

  const databaseUrl = new URL(requiredEnvironment("DATABASE_URL"));
  const supabaseUrl = new URL(
    requiredEnvironment("NEXT_PUBLIC_SUPABASE_URL"),
  );
  if (
    !databaseUrl.username.includes(EXPECTED_PROJECT_REF) ||
    !supabaseUrl.hostname.startsWith(`${EXPECTED_PROJECT_REF}.`)
  ) {
    throw new Error("Refusing to bootstrap an unexpected project.");
  }
}

async function findAuthUserByEmail(supabase, email) {
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 100,
    });
    if (error) {
      throw error;
    }

    const user = data.users.find(
      (candidate) => candidate.email?.toLowerCase() === email,
    );
    if (user) {
      return user;
    }
    if (data.users.length < 100) {
      return null;
    }
  }

  throw new Error("Auth user lookup exceeded the safety page limit.");
}

async function ensureAuthUsers(password) {
  const supabase = createClient(
    requiredEnvironment("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnvironment("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
  const authUsers = new Map();

  for (const account of accounts) {
    const email = account.email.toLowerCase();
    const existing = await findAuthUserByEmail(supabase, email);
    if (existing) {
      const { data, error } = await supabase.auth.admin.updateUserById(
        existing.id,
        {
          password,
          email_confirm: true,
          user_metadata: {
            display_name: account.displayName,
          },
          app_metadata: {
            qa_fixture: true,
          },
        },
      );
      if (error) {
        throw error;
      }
      authUsers.set(account.key, data.user);
      continue;
    }

    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        display_name: account.displayName,
      },
      app_metadata: {
        qa_fixture: true,
      },
    });
    if (error) {
      throw error;
    }
    authUsers.set(account.key, data.user);
  }

  return authUsers;
}

async function seedProfiles(transaction, authUsers) {
  for (const account of accounts) {
    const authUser = authUsers.get(account.key);
    if (!authUser) {
      throw new Error(`Missing Auth user for ${account.key}.`);
    }

    await transaction.profiles.upsert({
      where: {
        id: ids.profiles[account.key],
      },
      update: {
        auth_user_id: authUser.id,
        email: account.email,
        display_name: account.displayName,
        platform_role: account.platformRole,
        password_hash: null,
        is_active: true,
      },
      create: {
        id: ids.profiles[account.key],
        auth_user_id: authUser.id,
        email: account.email,
        display_name: account.displayName,
        platform_role: account.platformRole,
        is_active: true,
      },
    });
  }
}

async function seedOrganization(transaction) {
  await transaction.organizations.upsert({
    where: {
      id: ids.organization,
    },
    update: {
      name: "Beauty Preview",
      slug: "preview",
      business_name: "Beauty Preview 測試商家",
      email: "merchant.qa@beauty-preview.test",
      phone: "02-0000-0000",
      status: "TRIALING",
      trial_ends_at: new Date("2030-12-31T15:59:59.000Z"),
      public_profile_enabled: true,
      is_test: true,
      disabled_at: null,
    },
    create: {
      id: ids.organization,
      name: "Beauty Preview",
      slug: "preview",
      business_name: "Beauty Preview 測試商家",
      email: "merchant.qa@beauty-preview.test",
      phone: "02-0000-0000",
      status: "TRIALING",
      trial_ends_at: new Date("2030-12-31T15:59:59.000Z"),
      public_profile_enabled: true,
      is_test: true,
    },
  });

  await transaction.locations.upsert({
    where: {
      id: ids.location,
    },
    update: {
      organization_id: ids.organization,
      name: "台北 Preview 館",
      slug: "taipei",
      code: "PREVIEW-TPE",
      description: "Beauty SaaS 外部功能測試據點",
      address: "台北市測試區 Preview 路 1 號",
      phone: "02-0000-0000",
      timezone: "Asia/Taipei",
      currency: "TWD",
      booking_state: "OPEN",
      online_booking_enabled: true,
      is_active: true,
      disabled_at: null,
    },
    create: {
      id: ids.location,
      organization_id: ids.organization,
      name: "台北 Preview 館",
      slug: "taipei",
      code: "PREVIEW-TPE",
      description: "Beauty SaaS 外部功能測試據點",
      address: "台北市測試區 Preview 路 1 號",
      phone: "02-0000-0000",
      timezone: "Asia/Taipei",
      currency: "TWD",
      booking_state: "OPEN",
      online_booking_enabled: true,
      is_active: true,
    },
  });

  for (let dayOfWeek = 0; dayOfWeek <= 6; dayOfWeek += 1) {
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
      values (
        ${ids.organization}::uuid,
        ${ids.location}::uuid,
        ${dayOfWeek},
        0,
        '10:00'::time,
        '20:00'::time,
        false
      )
      on conflict (location_id, day_of_week, segment_index) do update
      set
        opens_at = excluded.opens_at,
        closes_at = excluded.closes_at,
        is_closed = false,
        updated_at = now()
    `;
  }
}

async function seedMemberships(transaction) {
  await transaction.organization_memberships.upsert({
    where: {
      organization_id_profile_id_role: {
        organization_id: ids.organization,
        profile_id: ids.profiles.merchant,
        role: "ORGANIZATION_OWNER",
      },
    },
    update: {
      status: "ACTIVE",
      all_locations: true,
      is_primary_owner: true,
      disabled_at: null,
    },
    create: {
      organization_id: ids.organization,
      profile_id: ids.profiles.merchant,
      role: "ORGANIZATION_OWNER",
      status: "ACTIVE",
      all_locations: true,
      is_primary_owner: true,
      joined_at: new Date(),
    },
  });

  await transaction.location_memberships.upsert({
    where: {
      location_id_profile_id_role: {
        location_id: ids.location,
        profile_id: ids.profiles.provider,
        role: "SERVICE_PROVIDER",
      },
    },
    update: {
      organization_id: ids.organization,
      status: "ACTIVE",
      disabled_at: null,
    },
    create: {
      organization_id: ids.organization,
      location_id: ids.location,
      profile_id: ids.profiles.provider,
      role: "SERVICE_PROVIDER",
      status: "ACTIVE",
      joined_at: new Date(),
    },
  });
}

async function seedCatalog(transaction) {
  await transaction.service_categories.upsert({
    where: {
      id: ids.category,
    },
    update: {
      name: "Preview 精選服務",
      description: "外部測試用服務分類",
      sort_order: 10,
      is_active: true,
    },
    create: {
      id: ids.category,
      organization_id: ids.organization,
      name: "Preview 精選服務",
      description: "外部測試用服務分類",
      sort_order: 10,
      is_active: true,
    },
  });

  await transaction.services.upsert({
    where: {
      id: ids.service,
    },
    update: {
      category_id: ids.category,
      name: "經典舒壓護理",
      description: "結合肩頸舒壓與保濕護理的預約服務。",
      booking_notice: "如需取消或改期，請於預約前 24 小時操作。",
      online_booking_enabled: true,
      is_active: true,
      sort_order: 10,
    },
    create: {
      id: ids.service,
      organization_id: ids.organization,
      category_id: ids.category,
      name: "經典舒壓護理",
      description: "結合肩頸舒壓與保濕護理的預約服務。",
      booking_notice: "如需取消或改期，請於預約前 24 小時操作。",
      online_booking_enabled: true,
      is_active: true,
      sort_order: 10,
    },
  });

  await transaction.service_variants.upsert({
    where: {
      id: ids.variant,
    },
    update: {
      service_id: ids.service,
      name: "60 分鐘",
      duration_minutes: 60,
      price_minor: 180000,
      pre_buffer_minutes: 10,
      post_buffer_minutes: 10,
      deposit_fixed_minor: 50000,
      deposit_percentage: null,
      is_default: true,
      is_active: true,
    },
    create: {
      id: ids.variant,
      organization_id: ids.organization,
      service_id: ids.service,
      name: "60 分鐘",
      duration_minutes: 60,
      price_minor: 180000,
      pre_buffer_minutes: 10,
      post_buffer_minutes: 10,
      deposit_fixed_minor: 50000,
      is_default: true,
      is_active: true,
    },
  });

  await transaction.location_services.upsert({
    where: {
      id: ids.locationService,
    },
    update: {
      organization_id: ids.organization,
      location_id: ids.location,
      service_id: ids.service,
      service_variant_id: ids.variant,
      online_booking_enabled: true,
      is_active: true,
      sort_order: 10,
    },
    create: {
      id: ids.locationService,
      organization_id: ids.organization,
      location_id: ids.location,
      service_id: ids.service,
      service_variant_id: ids.variant,
      online_booking_enabled: true,
      is_active: true,
      sort_order: 10,
    },
  });
}

async function seedStaffAndResources(transaction) {
  await transaction.staff_profiles.upsert({
    where: {
      id: ids.staff,
    },
    update: {
      linked_profile_id: ids.profiles.provider,
      display_name: "Yuki",
      title: "Preview 美容師",
      bio: "Beauty SaaS 預約流程測試人員",
      skills: ["舒壓", "護理"],
      public_visible: true,
      is_active: true,
      sort_order: 10,
      disabled_at: null,
    },
    create: {
      id: ids.staff,
      organization_id: ids.organization,
      linked_profile_id: ids.profiles.provider,
      display_name: "Yuki",
      title: "Preview 美容師",
      bio: "Beauty SaaS 預約流程測試人員",
      skills: ["舒壓", "護理"],
      public_visible: true,
      is_active: true,
      sort_order: 10,
    },
  });

  await transaction.staff_location_assignments.upsert({
    where: {
      staff_profile_id_location_id: {
        staff_profile_id: ids.staff,
        location_id: ids.location,
      },
    },
    update: {
      organization_id: ids.organization,
      is_primary: true,
      is_active: true,
    },
    create: {
      organization_id: ids.organization,
      staff_profile_id: ids.staff,
      location_id: ids.location,
      is_primary: true,
      is_active: true,
    },
  });

  for (let dayOfWeek = 0; dayOfWeek <= 6; dayOfWeek += 1) {
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
      values (
        ${ids.organization}::uuid,
        ${ids.location}::uuid,
        ${ids.staff}::uuid,
        ${dayOfWeek},
        0,
        '10:00'::time,
        '20:00'::time,
        '2026-01-01'::date,
        true
      )
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

  await transaction.staff_service_assignments.upsert({
    where: {
      staff_profile_id_service_variant_id: {
        staff_profile_id: ids.staff,
        service_variant_id: ids.variant,
      },
    },
    update: {
      organization_id: ids.organization,
      is_active: true,
    },
    create: {
      organization_id: ids.organization,
      staff_profile_id: ids.staff,
      service_variant_id: ids.variant,
      is_active: true,
    },
  });
  await transaction.service_staff_assignments.upsert({
    where: {
      location_service_id_staff_profile_id: {
        location_service_id: ids.locationService,
        staff_profile_id: ids.staff,
      },
    },
    update: {
      organization_id: ids.organization,
      online_booking_enabled: true,
      is_active: true,
    },
    create: {
      organization_id: ids.organization,
      location_service_id: ids.locationService,
      staff_profile_id: ids.staff,
      online_booking_enabled: true,
      is_active: true,
    },
  });

  await transaction.resource_types.upsert({
    where: {
      id: ids.resourceType,
    },
    update: {
      name: "Preview 療程室",
      kind: "SPA_ROOM",
      description: "外部測試用療程空間",
      is_active: true,
    },
    create: {
      id: ids.resourceType,
      organization_id: ids.organization,
      name: "Preview 療程室",
      kind: "SPA_ROOM",
      description: "外部測試用療程空間",
      is_active: true,
    },
  });
  await transaction.resources.upsert({
    where: {
      id: ids.resource,
    },
    update: {
      organization_id: ids.organization,
      location_id: ids.location,
      resource_type_id: ids.resourceType,
      name: "Preview A 室",
      description: "外部預約流程測試空間",
      is_active: true,
      sort_order: 10,
      disabled_at: null,
    },
    create: {
      id: ids.resource,
      organization_id: ids.organization,
      location_id: ids.location,
      resource_type_id: ids.resourceType,
      name: "Preview A 室",
      description: "外部預約流程測試空間",
      is_active: true,
      sort_order: 10,
    },
  });
  await transaction.service_resource_requirements.upsert({
    where: {
      service_variant_id_resource_type_id: {
        service_variant_id: ids.variant,
        resource_type_id: ids.resourceType,
      },
    },
    update: {
      organization_id: ids.organization,
      quantity: 1,
      is_required: true,
    },
    create: {
      organization_id: ids.organization,
      service_variant_id: ids.variant,
      resource_type_id: ids.resourceType,
      quantity: 1,
      is_required: true,
    },
  });
}

async function seedPoliciesAndSubscription(transaction) {
  await transaction.location_booking_policies.upsert({
    where: {
      location_id: ids.location,
    },
    update: {
      organization_id: ids.organization,
      slot_interval_minutes: 15,
      minimum_lead_minutes: 60,
      maximum_advance_days: 60,
      hold_minutes: 10,
      customer_cancellation_enabled: true,
      customer_reschedule_enabled: true,
      cancellation_cutoff_hours: 24,
      reminder_hours: [24, 1],
    },
    create: {
      id: ids.bookingPolicy,
      organization_id: ids.organization,
      location_id: ids.location,
      slot_interval_minutes: 15,
      minimum_lead_minutes: 60,
      maximum_advance_days: 60,
      hold_minutes: 10,
      customer_cancellation_enabled: true,
      customer_reschedule_enabled: true,
      cancellation_cutoff_hours: 24,
      reminder_hours: [24, 1],
    },
  });
  await transaction.deposit_policies.upsert({
    where: {
      id: ids.depositPolicy,
    },
    update: {
      name: "Preview 公開預約訂金",
      mode: "FIXED",
      fixed_amount_minor: 50000,
      percentage: null,
      payment_window_minutes: 15,
      is_active: true,
    },
    create: {
      id: ids.depositPolicy,
      organization_id: ids.organization,
      location_id: ids.location,
      name: "Preview 公開預約訂金",
      mode: "FIXED",
      fixed_amount_minor: 50000,
      payment_window_minutes: 15,
      is_active: true,
    },
  });
  await transaction.cancellation_policies.upsert({
    where: {
      id: ids.cancellationPolicy,
    },
    update: {
      name: "Preview 一般取消規則",
      free_cancellation_hours: 24,
      late_fee_mode: "PERCENTAGE",
      late_fee_percentage: new Prisma.Decimal(20),
      no_show_fee_mode: "PERCENTAGE",
      no_show_fee_percentage: new Prisma.Decimal(50),
      is_active: true,
    },
    create: {
      id: ids.cancellationPolicy,
      organization_id: ids.organization,
      location_id: ids.location,
      name: "Preview 一般取消規則",
      free_cancellation_hours: 24,
      late_fee_mode: "PERCENTAGE",
      late_fee_percentage: new Prisma.Decimal(20),
      no_show_fee_mode: "PERCENTAGE",
      no_show_fee_percentage: new Prisma.Decimal(50),
      is_active: true,
    },
  });

  const planVersion = await transaction.plan_versions.findFirst({
    where: {
      retired_at: null,
      plans: {
        code: "STANDARD",
        is_active: true,
      },
    },
    orderBy: {
      version: "desc",
    },
    select: {
      id: true,
    },
  });
  if (!planVersion) {
    throw new Error("STANDARD plan version is missing.");
  }

  await transaction.subscriptions.upsert({
    where: {
      id: ids.subscription,
    },
    update: {
      organization_id: ids.organization,
      plan_version_id: planVersion.id,
      status: "TRIALING",
      is_current: true,
      billing_period_start: new Date("2026-07-28T00:00:00.000Z"),
      billing_period_end: new Date("2030-12-31T00:00:00.000Z"),
      trial_ends_at: new Date("2030-12-31T15:59:59.000Z"),
      suspended_at: null,
      cancelled_at: null,
    },
    create: {
      id: ids.subscription,
      organization_id: ids.organization,
      plan_version_id: planVersion.id,
      status: "TRIALING",
      is_current: true,
      billing_period_start: new Date("2026-07-28T00:00:00.000Z"),
      billing_period_end: new Date("2030-12-31T00:00:00.000Z"),
      trial_ends_at: new Date("2030-12-31T15:59:59.000Z"),
    },
  });
  await transaction.merchant_setup_progress.upsert({
    where: {
      organization_id: ids.organization,
    },
    update: {
      brand_completed_at: new Date(),
      location_completed_at: new Date(),
      business_hours_completed_at: new Date(),
      service_completed_at: new Date(),
      staff_completed_at: new Date(),
      resource_completed_at: new Date(),
      policies_completed_at: new Date(),
      notifications_completed_at: new Date(),
      go_live_at: new Date(),
      last_step: "GO_LIVE",
    },
    create: {
      organization_id: ids.organization,
      brand_completed_at: new Date(),
      location_completed_at: new Date(),
      business_hours_completed_at: new Date(),
      service_completed_at: new Date(),
      staff_completed_at: new Date(),
      resource_completed_at: new Date(),
      policies_completed_at: new Date(),
      notifications_completed_at: new Date(),
      go_live_at: new Date(),
      last_step: "GO_LIVE",
    },
  });

  for (const channel of ["LINE", "EMAIL", "SMS"]) {
    await transaction.notification_integrations.upsert({
      where: {
        organization_id_channel: {
          organization_id: ids.organization,
          channel,
        },
      },
      update: {
        status: "DISABLED",
        secret_reference: null,
        sender_reference: null,
        configuration: {},
        last_error_code: null,
      },
      create: {
        organization_id: ids.organization,
        channel,
        status: "DISABLED",
        configuration: {},
      },
    });
  }
}

async function main() {
  assertProductionTarget();
  const password = requiredEnvironment("PRODUCTION_QA_PASSWORD");
  if (
    password.length < 16 ||
    !/[A-Z]/.test(password) ||
    !/[a-z]/.test(password) ||
    !/\d/.test(password) ||
    !/[^A-Za-z0-9]/.test(password)
  ) {
    throw new Error("PRODUCTION_QA_PASSWORD does not meet policy.");
  }

  const authUsers = await ensureAuthUsers(password);
  const prisma = new PrismaClient();
  try {
    await prisma.$transaction(
      async (transaction) => {
        await seedProfiles(transaction, authUsers);
        await seedOrganization(transaction);
        await seedMemberships(transaction);
        await seedCatalog(transaction);
        await seedStaffAndResources(transaction);
        await seedPoliciesAndSubscription(transaction);
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        timeout: 60_000,
      },
    );
  } finally {
    await prisma.$disconnect();
  }

  console.log(
    JSON.stringify({
      organization: "preview",
      location: "taipei",
      isTest: true,
      accounts: accounts.map(({ email, displayName }) => ({
        email,
        displayName,
      })),
    }),
  );
}

await main();
