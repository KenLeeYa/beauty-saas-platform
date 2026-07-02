# Queue Migration

Queue payloads are provider-neutral. To move from PostgreSQL jobs to BullMQ, replay pending jobs through `JobQueue` and leave completed job history in PostgreSQL.
