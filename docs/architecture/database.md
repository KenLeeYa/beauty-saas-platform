# Database

PostgreSQL is the system of record. Drizzle defines schema in `packages/database`; SQL migrations live in `infrastructure/migrations`.

Tenant tables use RLS with `app.current_tenant_id`:

```sql
select set_config('app.current_tenant_id', $1, true);
```
