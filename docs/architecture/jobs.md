# Jobs

Phase one uses a PostgreSQL job table. Workers should select runnable jobs with `FOR UPDATE SKIP LOCKED`.

The `JobQueue` interface allows BullMQ or another queue provider to replace PostgreSQL jobs later.
