# Backend Parity Matrix

## Scope

Beauty and StallOrder share architecture and security invariants, not production
runtime data. Each product has an independent repository, Supabase project,
database, Auth tenant, Storage buckets, secrets, migrations, backups, staging,
and production environment.

| StallOrder component | Beauty component | Shared invariant | Beauty-specific difference | Status | Evidence |
| --- | --- | --- | --- | --- | --- |
| Organization | Organization | Tenant, billing, entitlement, and isolation boundary | Beauty organization owns locations and customer CRM | In progress | `supabase/migrations` |
| Stall | Location | Child operational scope with parent consistency checks | Salon, studio, branch, or service location | In progress | `prisma/schema.prisma` |
| Product / StallProduct | Service / ServiceVariant / LocationService | Server-owned catalog, snapshot on transaction | Duration, buffers, staff skills, resources, deposits | In progress | `src/server/catalog` |
| Order / OrderItem | Booking / BookingSegment | State machine, immutable snapshots, atomic transitions | Time ranges, allocations, cancellation and reschedule | In progress | `src/server/bookings` |
| OrderSession | PublicBookingSession | Short-lived high-entropy token stored as a hash | Organization, location, device, and booking-policy scope | In progress | `src/server/public-booking` |
| QR public ordering | Public booking flow | Turnstile, strict CORS, request ID, rate limits, idempotency | Catalog, availability, hold, confirm, manage | In progress | `src/app/api/public` |
| StallMembership | LocationMembership | Membership is authorization evidence; client scope is untrusted | Front desk and service-provider roles | In progress | `src/server/authorization` |
| AuthSession | AuthSession | 256-bit token, SHA-256 at rest, eight-hour expiry, server revoke | `beauty_session` and session-bound CSRF | In progress | `src/server/auth` |
| Plan / Subscription | PlanVersion / Subscription | Versioned contracts and server-side entitlement resolution | Staff, service, resource, CRM, storage, booking limits | In progress | `src/server/entitlements` |
| AdditionalStallApproval | OrganizationFeatureOverride | Platform-admin-only override with audit and expiry | ALLOW, DENY, or LIMIT by Beauty feature key | In progress | `src/server/entitlements` |
| Payment | BookingPayment | Integer minor units, server calculation, audit | Deposit, cancellation fee, manual proof, refund | In progress | `src/server/payments` |
| Invoice | SaaS Invoice | Separate from customer transactions | Manual phase-one Beauty subscription billing | In progress | `src/server/billing` |
| OperationalEvent | OperationalEvent | Authorized Realtime signal followed by authoritative refetch | Booking, staff, resource, and notification events | In progress | `src/server/reporting` |
| DailyStallSummary | DailyLocationSummary | Bounded rebuild and dashboard reads from summaries | Staff utilization, service mix, no-show and revisit metrics | In progress | `src/server/reporting` |
| Google OAuth callback | Google OAuth callback | Supabase PKCE identity plus independent application session | Onboarding or role-specific Beauty destination | In progress | `src/app/auth` |
| RLS inventory | Beauty RLS inventory | Every exposed business table is enabled and forced RLS | Includes CRM sensitivity and staff/resource overlap | In progress | Supabase advisors and production SQL verification |

## Source Decisions

1. The attached master prompt controls domain and completion requirements.
2. `Stallorder-Platform` commit `ce08b9a` supplies the current stack and security patterns.
3. `massage-booking-manager` commit `61aa926` supplies behavior only; its
   Cloudflare, Hono, D1, Drizzle, SQLite, and Google session code is not reused.
4. The legacy Beauty `pnpm` workspace remains temporarily as migration evidence.
   The root npm/Next.js application is the production runtime.

## Verification Ledger

The status column changes to `Complete` only after the named migration, unit or
integration test, pgTAP test, and browser flow have actually passed. Commands and
exit results are recorded in `docs/TEST_PLAN.md`.
