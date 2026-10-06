# Production readiness, 2026-10-06

## Decision

Do not publish the integrated candidate or apply its migrations to the existing
production database yet. The current deployment and existing `public` booking
records stay untouched. `book.kuanguard.com` is the selected future test hostname,
not an active endpoint.

## Verified current state

- Supabase project `beauty-saas-production` (`dfuhylsmhrysbmhpeylx`) is healthy.
  Read-only counts: 1 organization, 1 location, 1 booking, 1 customer and 2 staff.
  The production migration history ends at `20260806033307`; none of the 16
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
- The Supabase organization is on the Pro plan, which documents scheduled backups, but an actual recoverable production restore point could not be verified with the
  available tools. A supported fresh Edge session opened the scheduled-backups URL but redirected to the Supabase sign-in page (HTTP 200); no restore-point metadata was visible. The candidate migrations were tested against an empty local
  synthetic database, not a scrubbed copy of the existing production schema.

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
This is structurally representative but still not a restored, scrubbed production
snapshot; actual backup availability, data distributions, triggers, policies,
and live-record migration behavior remain to be checked before cloud writes.
## Release sequence once gates are satisfied

1. Verify an available restore point and make a scrubbed production-shaped copy.
   Rehearse only the 17 integrated `20261005*` migrations there, including row
   counts, existing merchant booking flows, RLS, and rollback by disabling the
   new entry. The two older `20261004*` prototype migrations were moved to the
   recoverable local archive and must never be applied to production.
2. Validate one isolated test merchant and test member, or an equivalent
   tenant-isolated dataset. Do not send marketing to existing customers. Keep
   `MEMBER_VALUE_TEST_ONLY`, `PAYROLL_TEST_ONLY`, real payment and wage posting
   disabled. Verify customer, receptionist, beautician and owner scopes.
3. Once the app is safe to expose, bind `book.kuanguard.com` to the existing
   Beauty Vercel project and add only the `book` CNAME in Cloudflare using the
   exact Vercel value returned for this project. Because custom domains bypass
   the project's current SSO setting, confirm the intended access protection
   before this step. Do not change any other `kuanguard.com` record.
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

The requested new Official Account name is **KuanBook 預約**. Creating that
account and its LINE Login channel in the user's LINE Business account remains
an external activation step; no account, channel, credential, callback, rich
menu, or customer message was created by this repository change. Select the
intended LINE provider before enabling Messaging API because provider choice
is persistent. Record the exact channel ID, provider ID, secret, and callback
only through approved server-side configuration. The code's synthetic channel
and token responses are local test fixtures, not a live LINE integration.

No production migration, deployment, DNS mapping, LINE credential, callback,
marketing send, payment or payroll setting was changed in this inspection.
