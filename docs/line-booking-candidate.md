# LINE booking candidate on existing infrastructure

This candidate starts from the clean tracked state of `C:\Users\KY\Documents\Codex projects\beauty-saas-platform`, commit `974ab637e6c1a6d1cc58ae45f6d6a89546a723be`. The original checkout and its untracked files were not edited. The new booking architecture is confined to `src/app/line-booking`, `src/app/api/line-booking`, `src/lib/line-booking`, and two `line_booking` schema migrations. It does not read or alter the old `public` booking tables.

## Routing and data

- Store OA rich menu and mini-shop entry: `/line-booking/{storeSlug}`. Staff share links add `?staff={staffId}`. These are plain entry URLs, not proprietary mini-shop APIs.
- APIs: `/api/line-booking/*`. No matching paths exist in this source checkout's root `src/app` tree. The deployed CLI artifact did not expose a complete route manifest, so compare it at preview time.
- New tables and SQL functions live in the private `line_booking` schema. PostgreSQL range exclusions and a store advisory lock prevent staff/resource overlaps. Separate actor and customer identity fields keep manual bookings accurate. Holds expire, confirmations and changes write audit and outbox records, and calendar responses hide other staff customer details.
- OAuth uses each store's LINE Login channel and provider-scoped subject. The browser receives a signed HTTP-only session. External LINE calls are limited to Login token exchange/verification; the notification sender is disabled by default. No private LINE chat is read.

## Local validation

- `npm run lint`, `npm run typecheck`, `npm run test`: passed; 62 Vitest tests.
- `npm run build`: passed using an ignored `.env.local` copied from `.env.example` with placeholders. No real secrets were used.
- `node --test tests/line-booking.postgres.mjs`: 8/8 passed against an approved loopback-only PostgreSQL 17 container, including concurrent bookings, idempotency, tenant/staff access, manual booking, cancellation, rescheduling, expiring holds, confirmation, and outbox creation.
- `node --test tests/line-booking.experience.mjs`: 1/1 passed in mobile Edge at 390 px using synthetic data; it exercises customer booking/change/cancel, staff manual booking, owner agenda, and other-staff busy-only visibility. The test does not exercise a real LINE channel.
- The local trial runs on loopback port 45140 against the synthetic test container `line-booking-test-20261004` on loopback port 56863. The dedicated named volume and access-restricted ignored credential file in the sibling `line-booking/.local/` remain for audit.
- Repository `AGENTS.md` asks for `pnpm` checks, but this checkout's package manager is configured as npm and rejects `pnpm` commands. The equivalent npm scripts above passed.

## Migration and activation sequence

1. Review the candidate diff and compare its base commit with the current CLI deployment. Local root `AGENTS.md`, `package.json`, and `vercel.json` SHA-1 hashes matched the latest deployment file listing, but the deployed commit was not exposed.
2. Validate the SQL migrations on a copy of the existing Supabase database and run database advisors. Apply `20261004114217_line_booking_schema.sql` then `20261004114219_line_booking_functions.sql` only after approval. They create new objects; they do not migrate historical bookings.
3. Select a server-only PostgreSQL connection credential with least privilege for `line_booking`, and configure `LINE_BOOKING_DATABASE_URL`, `LINE_BOOKING_SESSION_SECRET`, and `LINE_BOOKING_CHANNEL_SECRETS_JSON` in the existing Vercel project. Do not place them in `NEXT_PUBLIC_` values. Do not set `LINE_BOOKING_DATABASE_SSL=false` for a non-loopback host.
4. Configure each store's provider and channel IDs, callback URL `/api/line-booking/callback`, and seed its catalog, staff skills, work/leave windows, and resources. Test with a LINE sandbox/test channel before public entry links.
5. Integrate an approved outbox scheduler and OA sender with duplicate suppression. The current sender is a disabled mock; bookings still commit if notification delivery is unavailable.
6. Verify preview routes, customer/staff permissions, mobile booking and changes, and old application regressions. Only then connect the existing store rich menu and mini-shop links. No production deployment or LINE setting was changed by this work.

## Rollback

Remove the new entry links first. If the integrated deployment causes a problem, restore the previous Vercel deployment and stop any new outbox scheduler. Preserve the `line_booking` schema and audit records for reconciliation; do not drop tables or overwrite the old `public` booking data. Review confirmed bookings and pending notifications before another cutover.
