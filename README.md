# Beauty SaaS Platform

System name: 美業多租戶管理平台

This repository is a pnpm + Turborepo monorepo for a multi-tenant beauty, massage, nail, eyelash, spa, and service-business SaaS platform.

## Workspace

- `apps/web`: Next.js App Router frontend.
- `apps/api`: NestJS modular monolith API.
- `apps/worker`: background worker entrypoint.
- `packages/database`: Drizzle schema and database contracts.
- `packages/authorization`: RBAC, permission maps, tenant/branch scope helpers.
- `packages/storage`: object storage provider interface and tenant-scoped key helpers.
- `packages/queue`: queue provider interface and job payload contracts.
- `packages/shared`: shared domain constants and API types.
- `packages/validation`: Zod validation schemas.
- `packages/config`: environment validation.

## Local Development

```bash
pnpm install
pnpm dev
```

Useful checks:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Multi-Tenancy Rules

- Never trust `tenant_id` from request bodies.
- Every business repository must receive a verified tenant context.
- Tenant-owned tables must carry `tenant_id` and use PostgreSQL RLS.
- Branch-scoped data must carry `branch_id` when the domain requires it.
- Use provider interfaces for storage, queues, email, and database access so infrastructure can move from Supabase to Neon, RDS, Cloud SQL, or other PostgreSQL providers.
