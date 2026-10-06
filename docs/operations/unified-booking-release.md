# Unified booking candidate: local release runbook

Status: local implementation candidate, 2026-10-05. No production deploy, cloud write, LINE configuration change, customer-data transfer, or paid service activation was performed.

## Architecture and entry

Store rich menus, beautician share links, and the existing store entry should resolve to `/line-booking/{store}` with an optional staff preselection. The server rechecks that selection. Mobile booking uses the existing `public` catalog, availability, holds, booking and allocation tables; merchant phone and personal-LINE bookings use the same authority. The older `line_booking` prototype entry was retired and its local-only files archived. Provider-scoped LINE identity links and per-store channel references are additive. Unconfigured LINE delivery fails closed while the confirmed booking remains recorded. The existing notification outbox owns retries.

## Migration and activation sequence

1. Record the listed database restore point, preserve Storage objects separately, record migration head, inventory all store entries and channel IDs, and rehearse on a scrubbed production-shaped copy. Apply the seventeen `20261005*` SQL files in lexical order. Reconcile row counts and constraints before and after each phase. The current migration evidence is from synthetic local PostgreSQL only.
2. Keep mobile entry links disabled until login callback origins, per-store provider/channel identifiers, approved server-side secret mappings, scoped staff claims, and outbox delivery are verified for each store. No credentials are stored in source or the migration.
3. P0: verify customer self-booking, staff manual booking, one-bed contention, cancel/reschedule, same booking ID across merchant and mobile, owner calendar, staff busy-only view, and idempotent retries. Roll back by hiding the new entry and using the existing public page; retain booked rows and audit.
4. P1: enable unspecified-staff assignment only after capability dates, rotation counts, future leave, room/bed/equipment limits, and front-desk exception handling are reviewed. Existing assignments stay authoritative if the switch is turned off.
5. P2: treat wallet, coupons, packages and promotion policy as test-only financial experiments. Paid value needs approved contract terms, liability, refund and redemption reconciliation, consumer disclosures, and protected preview. Stop new issuance on rollback while preserving read, redeem and refund access for outstanding value.
6. P3: run attendance and payroll beside the existing process. Review local legal and labor policy, retention, pay rules, manager correction audit and one manually reconciled period. Payroll writes are test-only; do not use calculated amounts for bank transfer. Reversals after a locked period belong in the next period.

## Acceptance evidence and remaining work

- `npm run lint`, `npm run typecheck`, `npm test` (81 passed), and `npm run build` pass in the isolated branch. Synthetic PostgreSQL suite: 22 files, 23 tests passed; a 390px Edge booking/cancel flow and desktop operations review passed. All test accounts and transactions are synthetic.
- To rerun the database suite, seed a local PostgreSQL database with the existing beauty-saas seed plus the seventeen additive migrations, set `DATABASE_URL` and `DIRECT_URL` to that loopback database and `APP_ENV=test`, then run `npm run test:unified`. The script refuses a non-loopback database. Browser checks also require a local Next server and `UNIFIED_UI_TEST_URL`.
- A fresh local PostgreSQL rehearsal applied the 13 existing baseline migrations, loaded the synthetic seed, and then applied all 17 integrated migrations in lexical order. The two retired prototype migrations are archived outside this candidate and are not part of the production sequence. This validates ordering against synthetic data with local stubs for external Supabase services; it is not a scrubbed production snapshot.
- Confirmed coverage includes multi-device identity, concurrent resource race, manual entry, reschedule/cancel, staff capability, dispatch and reassignment, scoped CRM status, policy quote, principal/bonus ledger, attendance correction, and locked payroll refund adjustment.
- The desktop operations review now covers future booking reassignment, attendance correction/export, overtime approval, shadow payroll draft/approval, refund adjustment, customer status, benefit issuance/lifecycle, promotion draft/checkout preview/application, and commission draft/preview/publication. Booking cancellation automatically releases outstanding synthetic benefit and wallet reservations. Promotion checkout is synthetic and does not change the live booking payment path. Coupon/package lifecycle is synthetic and is not bound to a payment processor or contract liability record. Real LINE callbacks, outbox delivery, production-shaped migration and production secrets have not been verified. Keep these capabilities disabled for stores until those gaps and their acceptance tests are closed.
- A release operator must compare old desktop and mobile views for one synthetic booking ID, customer, staff, resource and status, then repeat with restricted roles and a second tenant. Reconcile identity links, active holds, allocations, notification jobs, benefit liabilities and payroll lines with the worksheet in `financial-reconciliation.md`.

This branch is a reviewable local candidate. Pushing, publishing a PR, deploying, changing real LINE settings and activating money or payroll each require a separate release decision.

The task-by-task implementation audit is in [unified-plan-audit.md](unified-plan-audit.md).
