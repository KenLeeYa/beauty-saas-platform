# Production readiness, 2026-10-06

## Decision

Do not publish the integrated candidate or apply its migrations to the existing
production database yet. The current deployment and existing `public` booking
records stay untouched. `book.kuanguard.com` is the selected future test hostname,
not an active endpoint.

## Verified current state

- Supabase project `beauty-saas-production` (`dfuhylsmhrysbmhpeylx`) is healthy.
  Read-only counts: 1 organization, 1 location, 1 booking, 1 customer and 2 staff.
  The production migration history ends at `20260806033307`; none of the 17
  `20261005*` integrated migrations is installed. `store_line_channels`,
  `mobile_store_entries`, and `line_oauth_states` are absent.
- Existing Vercel project `beauty-saas-platform`
  (`prj_S8ryMyEGjyenihjsJTU8QZqAUI2I`) has a READY production deployment
  `dpl_7SaEYs2imgCtkJRBzi68xtfM5PyK`. The project reports `live=false` and
  deployment SSO protection for all domains except custom domains. Its project
  domain is `beauty-saas-platform-roan.vercel.app`.
- Production environment variable *names* include database, Supabase, session,
  origin, payment and notification settings, but no `LINE_BOOKING_CHANNEL_SECRETS_JSON`.
  Values were not decrypted or copied. There is no production LINE channel table.
- `kuanguard.com` is a verified domain in the Vercel team, but its authoritative
  nameservers are Cloudflare (`liv.ns.cloudflare.com`, `sri.ns.cloudflare.com`).
  A public DNS query finds no `book.kuanguard.com` record, and that hostname is
  not bound to the Beauty Vercel project. No unrelated DNS record was changed.
- An authenticated read-only view of [Scheduled Backups](https://supabase.com/dashboard/project/dfuhylsmhrysbmhpeylx/database/backups/scheduled)
  shows seven daily **PHYSICAL** backups through 2026-10-05 22:03:46 UTC;
  each has a Restore control. This verifies listed restore points, not a tested
  restore. The candidate migrations were tested against local synthetic data,
  not a scrubbed copy of the existing production data.
- Read-only counts on 2026-10-06 found two Storage buckets, zero Storage
  objects, and zero `customer_media` rows. [Supabase database backups](https://supabase.com/docs/guides/platform/backups)
  cover Storage metadata but **exclude object contents**. Inventory and preserve
  Storage separately before any restore or migration that touches attachments;
  recheck counts immediately before release because content can change.

## Expanded no-PII migration rehearsal

A read-only `information_schema.columns` fingerprint from production covers 83
`public` tables; no customer rows or credential values were exported. On a fresh
local PostgreSQL database (`beauty_unified_rehearsal_20261006_v10`), the 13
currently installed production migration files were applied, the repository's
synthetic seed was loaded, and all 17 integrated migrations applied in order,
including `20261005030500_line_desktop_login.sql` for LINE backoffice sessions.
The post-migration local schema retains all 83
production table names. Column signatures match for 82 existing tables; the
expected exception is `service_staff_assignments`, which gains the three
capability-term columns. The fresh rehearsal has 119 `public` tables, including
`line_desktop_sessions`.

An additional fresh local database (`beauty_unified_rehearsal_20261006_v12`)
used [synthetic aggregate-shaped fixtures](../../tests/fixtures/production-aggregate-shape.sql)
before applying all 17 candidate migrations. Read-only production aggregates,
without identifiers or customer values, show one completed `ONLINE` test
booking, 20 historical holds (14 expired, five cancelled, one confirmed),
19 nonblocking staff and resource allocations attached to holds, one active
owner membership across locations, one active service-provider location
membership, and two active staff profiles. The fixture reproduces the hold
status and historical allocation pattern with invented values; the baseline
synthetic seed deliberately has more bookings and customers to exercise other
flows. The full 13-baseline-plus-17-candidate migration sequence passed on
this fixture. Afterward, all 83 production table names remained present and
82 column signatures still matched; `service_staff_assignments` is the expected
additive exception. The local integrated suite passed 25 tests in 24 files,
including booking/resource contention, manual booking, cancellation,
rescheduling, role and cross-tenant access, LINE identity, and hiding the new
entry without deleting bookings.
Read-only system-catalog comparison also found all 627 current production
constraint, RLS policy, and noninternal trigger **names** on the local
post-migration schema (924 total local items). This checks preservation of
existing objects by name, not equality of every policy expression or behavior.

This is structurally representative but still not a restored, scrubbed production
snapshot. A restored copy would chiefly measure restore duration and expose
unobserved row-value or environment assumptions. Given the small production
dataset and the additive migrations, it is a preferred extra check for a broad
release, not an automatic prerequisite to a bounded single-store pilot.

## Release sequence once gates are satisfied

1. Record the most recent listed restore point. If a no-cost scrubbed
   production-shaped copy is available, rehearse all 17 migrations on it;
   otherwise use the aggregate-shaped rehearsal above and limit exposure to
   a single test store until the live smoke checks pass. A listed backup is not
   a restore test. Do not restore
   the production project merely to test the backup: Supabase says restoration
   makes the project inaccessible during the operation and rolls data back.
   Preserve Storage objects separately; the database backup does not contain
   their bytes. The two older `20261004*` prototype migrations were moved to
   the recoverable local archive and must never be applied to production.
2. Validate one isolated test merchant and test member, or an equivalent
   tenant-isolated dataset. Do not send marketing to existing customers. Keep
   `MEMBER_VALUE_TEST_ONLY`, `PAYROLL_TEST_ONLY`, real payment and wage posting
   disabled. Verify customer, receptionist, beautician and owner scopes.
3. Once the app is safe to expose, bind `book.kuanguard.com` to the existing
   Beauty Vercel project and add only the `book` CNAME in Cloudflare using the
   exact Vercel value returned for this project. Because custom domains bypass
   the project's current SSO setting, confirm the intended access protection
   before this step. Do not change any other `kuanguard.com` record. The user
   approved a public login endpoint, but deployment still depends on
   configured authentication and a passing protected pilot.
4. Set the single canonical `NEXT_PUBLIC_APP_URL` to
   `https://book.kuanguard.com` and allow that origin in `PUBLIC_APP_ORIGINS`.
   LINE Login authorizes and exchanges the code using
   `https://book.kuanguard.com/api/line-booking/callback`. A later hostname move
   requires updating both app origin settings and the registered LINE callback,
   then replacing store rich-menu/share URLs. No LIFF endpoint is required by
   the current OAuth route; LIFF registration is a separate decision.
5. Configure a store-scoped LINE Login channel reference and a server-only
   `LINE_BOOKING_CHANNEL_SECRETS_JSON` mapping after explicit credential-setting
   approval. Register the exact callback URL in LINE Developers. Only then
   enable the store entry and perform live test-member LINE login and booking.
   Notification delivery remains disabled until separately configured.

## Backoffice identity and LINE account activation

The candidate login page offers LINE, Google (when the existing Supabase Google
provider is enabled), and the existing password flow. LINE backoffice login is
available only after the employee authenticates through an existing account,
requests a verified LINE link, and a store owner or other authorized manager
approves it. Owner, receptionist, and beautician accounts retain their existing
profiles and role checks. A revoked LINE link invalidates its desktop sessions.
Google OAuth will not attach a new provider subject to an existing profile by
matching email alone; an existing owner who has not linked Google must continue
using an already verified sign-in method until an authenticated linking flow is
available. Do not disable the existing method during rollout.

Read-only production metadata shows the Vercel production environment has
`NEXT_PUBLIC_GOOGLE_LOGIN_ENABLED`, `NEXT_PUBLIC_SUPABASE_URL`, and
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` keys, without reading their values.
The Supabase Google provider is enabled, as verified in the authenticated
dashboard. Supabase Auth currently has four `email` identities and no Google identity;
all four app profiles have `auth_user_id`, and no app profile has a local
`password_hash`. The production password route uses Supabase Auth, so this
does not prove password login is disabled. The redirect allowlist, Vercel
flag's value, and an existing owner's first Google login remain unverified.
Verify these with a test owner before any login-method cutover.

LINE activation needs two same-provider channel references in
`store_line_channels`: one `LOGIN` channel ID and one `MESSAGING` channel ID,
each with the actual provider ID and store location. The server needs
`LINE_BOOKING_CHANNEL_SECRETS_JSON` for OAuth/token and webhook verification;
outbound messaging additionally needs
`LINE_BOOKING_CHANNEL_ACCESS_TOKENS_JSON` and an enabled notification provider.
The existing callback is saved as
`https://book.kuanguard.com/api/line-booking/callback`. Set
`NEXT_PUBLIC_APP_URL` and `PUBLIC_APP_ORIGINS` to that canonical origin, and
create the disabled `mobile_store_entries` row before enabling the store entry.
The current production Vercel environment metadata has neither LINE JSON key.
Do not place credentials in SQL, source, browser logs, or this document.
For an initial login-only test, the user should enter
`LINE_BOOKING_CHANNEL_SECRETS_JSON` directly in the **Production** environment
of Vercel project `beauty-saas-platform` as a JSON object whose key is LINE
Login channel ID `2011887008` and whose value is that channel's secret.
No Messaging API access token is required for login. Before enabling incoming
Messaging webhooks, add channel ID `2011886962` with its own channel secret to
the same JSON. Outbound LINE notifications separately require the Messaging
channel access token in `LINE_BOOKING_CHANNEL_ACCESS_TOKENS_JSON`, plus the
existing `NOTIFICATION_PROVIDER=line` setting; leave this off for login-only
testing. The two channel IDs and provider ID are nonsecret configuration
references and must be recorded in `store_line_channels` only after the schema
migration. The disabled entry row can be prepared without exposing booking.

The user-authorized LINE setup created provider `2005605742`, **KuanBook 預約**
Official Account `@622fexlw`, Messaging API channel `2011886962`, and LINE
Login channel `2011887008` under that provider. The callback saved in LINE
Developers is `https://book.kuanguard.com/api/line-booking/callback`.
The LINE Login channel is still in Developing status. No channel secrets or
long-lived Messaging API token were copied into this repository or Vercel.
The code's synthetic channel and token responses remain local fixtures; live
LINE login, webhook receipt, and outbound delivery have not been verified.

No production migration, deployment, DNS mapping, LINE credential, callback,
marketing send, payment or payroll setting was changed in this inspection.
