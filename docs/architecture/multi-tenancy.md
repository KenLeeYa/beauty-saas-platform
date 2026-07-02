# Multi-Tenancy

The platform uses a shared database and shared schema. Tenant-owned tables include `tenant_id`; branch-owned records also include `branch_id`.

Requests must establish:

- authenticated user
- active tenant
- active membership
- permissions
- allowed branch IDs

The API must not trust `tenant_id` from request bodies. Repositories receive the verified request context and scope all reads and writes by tenant.
