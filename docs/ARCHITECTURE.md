# Architecture

## Deployment Topology

Each Beauty environment contains one Next.js application and one independent
Supabase project:

```text
Merchant, staff, and platform browsers
  -> Next.js Server Components and trusted Route Handlers
  -> Prisma over a server-only PostgreSQL connection
  -> Supabase PostgreSQL

Public customer browser
  -> Next.js public booking Route Handlers
  -> fixed service-role operations and transactions
  -> Supabase PostgreSQL

Google OAuth
  -> Supabase Auth PKCE
  -> Next.js callback
  -> hashed application session
```

Staging and production never share databases, Auth users, Storage buckets,
secrets, Route Handler deployments, migration history, or backup policy with
StallOrder.

## Boundaries

- `organizations.id` is the tenant, billing, entitlement, and isolation boundary.
- `locations.id` is the branch or studio boundary inside an organization.
- Browser-supplied organization, location, role, price, duration, status, and
  availability values are never authorization evidence.
- Auth proves identity. Active organization and location memberships grant access.
- Trusted Prisma queries include server-resolved organization and location scope
  even though PostgreSQL RLS remains enabled as defense in depth.
- Public browsers cannot write business tables directly.

## Runtime Modules

```text
src/app                 Next.js pages and route handlers
src/components          interactive UI
src/server/auth         Supabase identity and application sessions
src/server/authorization capability and object-scope enforcement
src/server/tenant       organization and location context
src/server/entitlements versioned plan and override resolution
src/server/catalog      services, variants, add-ons, and assignments
src/server/staff        skills, schedules, exceptions, and time off
src/server/resources    rooms, beds, chairs, and equipment
src/server/customers    CRM, dedupe, consent, notes, and private media
src/server/availability availability intersection engine
src/server/bookings     holds, allocations, state machine, and events
src/server/payments     deposits, manual payments, fees, and refunds
src/server/notifications outbox, adapters, retry, and delivery
src/server/reporting    daily summaries, exports, and Realtime signals
src/server/audit        structured audit events
src/server/rate-limit   authenticated and public rate limits
supabase/migrations     database source of truth
src/app/api/public      public booking trust boundary
src/app/api/webhooks    signed provider webhook boundary
src/app/api/cron        authenticated scheduled-job boundary
```

## Current Supabase Changes Considered

- New public-schema tables are not automatically exposed to the Data API, so
  migrations use explicit grants and never depend on implicit defaults.
- Custom tables and functions are not created in the managed `auth`, `storage`,
  or `realtime` schemas.
- Next.js SSR uses publishable keys and request-scoped Supabase clients.
- Server authorization validates identity and does not trust `user_metadata`.
- Realtime is a notification channel, never the source of truth.

## Legacy Migration

The previous NestJS API, worker, Drizzle schema, and `pnpm` workspace remain in
the repository only until equivalent Next.js/Supabase paths are verified. They
are excluded from the root TypeScript and ESLint builds and are not part of the
production start command.
