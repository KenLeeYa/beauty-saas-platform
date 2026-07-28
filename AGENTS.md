# AGENTS.md

## Project Rules

1. Use TypeScript strict mode.
2. Avoid `any`; prefer explicit domain types or `unknown` with validation.
3. All business data must consider tenant scope.
4. Branch-owned data must consider branch scope.
5. Validate API input with DTOs or Zod schemas.
6. Do not trust `tenant_id` from request bodies.
7. Repositories must receive a verified tenant context.
8. Tenant tables must use PostgreSQL RLS policies.
9. Schema changes must include migrations.
10. Migrations must not overwrite production data.
11. Do not commit secrets, tokens, connection strings, or real customer data.
12. Store all business timestamps in UTC.
13. Display branch-local time using the branch timezone.
14. Object storage must go through `ObjectStorageProvider`.
15. Queues must go through `JobQueue`.
16. Do not introduce microservices for phase-one features.
17. Do not hard-bind business logic to Supabase, Cloudflare, or any single vendor.
18. Add tenant isolation tests for data-access changes.
19. Add branch scope tests for branch-owned data.
20. Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` before delivery when tooling is available.
