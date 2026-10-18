# Storage

Object storage goes through `ObjectStorageProvider`. Object keys must include tenant scope, for example:

```text
tenants/{tenantId}/customers/{customerId}/photos/{uuid}.jpg
```

Storage metadata is stored in PostgreSQL.
