# Bounded production pilot sequence

Status: prepared locally. No production migration, deployment, DNS, secret, or
tenant configuration change is recorded by this runbook.

## Why a production copy is preferred but not an absolute pilot gate

The 17 candidate migrations create new tables and policies. Their only change
to a pre-existing table adds three defaulted columns and a range check to
`service_staff_assignments` (four production rows at the read-only check).
The production schema has 83 tables. All remain in the migrated local schema,
with matching column signatures for 82; the one difference is that intentional
assignment extension. All 627 existing production constraint, RLS policy, and
noninternal trigger names remain present. A synthetic fixture reproducing the
live 20 historical holds and 19 nonblocking hold allocations passed the full
migration sequence and 25 integrated tests, including cross-tenant access.

A scrubbed production copy would still catch differences in actual row values,
SQL object *definitions* beyond their names, production roles/settings, and
lock duration. A restore drill would measure operational recovery time. Neither
requires exporting PII for the current local checks. For a single-store pilot,
use live read-only preflight and smoke checks at each step; obtain a scrubbed
copy before broad rollout if one is available without new paid infrastructure.

## Order of operations

1. Immediately before the change, record the latest listed physical backup,
   migration head, counts of bookings, holds, staff assignments and Storage
   objects, and verify the existing owner can still sign in with Supabase
   password. Scheduled backups are daily and exclude Storage object bytes.
2. Have the user enter `LINE_BOOKING_CHANNEL_SECRETS_JSON` directly in the
   Vercel Beauty project **Production** environment as
   `{"2011887008":"<LINE Login channel secret>"}`. Confirm the key exists by
   metadata only. Do not read, log, or copy the value. Outbound Messaging API
   access tokens are not needed for this pilot.
3. Apply only the 17 ordered `20261005*` migrations while the new store entry
   is absent. Verify every version is recorded, old booking and owner login
   remain functional, row counts have not unexpectedly changed, and the three
   assignment defaults are valid. Apply the database migrations **before**
   deploying this build: the new session resolver queries
   `line_desktop_sessions` even for existing password sessions.
4. Insert only nonsecret per-store references for provider `2005605742` and
   LINE Login channel `2011887008`; keep the store entry disabled. The
   Messaging API channel `2011886962` may be recorded disabled, with delivery
   provider unchanged. Create a unique test entry slug in disabled state.
5. Set the canonical app origin to `https://book.kuanguard.com` in
   `NEXT_PUBLIC_APP_URL` and `PUBLIC_APP_ORIGINS` for the production build.
   Deploy the candidate to the existing Beauty Vercel project. Check its
   protected deployment URL first for health, owner password login, existing
   public booking, role checks, and no unexpected payment/notification action.
   Then bind only `book.kuanguard.com` and its required `book` DNS record;
   custom domains bypass the project's current Vercel SSO protection, so the
   application login and tenant guards must be working before DNS exposure.
6. In a short test window, enable only the chosen entry slug. An existing
   authenticated owner starts `/api/merchant/line-links/start` with CSRF and
   store scope. The exact LINE Login callback verifies the channel, provider,
   signed subject, state and nonce; it creates a pending link for the already
   authenticated profile. A `team.manage` owner approves that request. The
   owner can then test LINE backoffice login. No name, phone, or matching email
   is used to grant access. Keep Supabase password login available. Google
   provider is enabled, but first-owner Google login and redirect settings
   still need a direct test before relying on Google.
7. Test one synthetic customer's mobile booking, a manual receptionist entry,
   owner calendar, beautician busy-only scope, collision, cancel/reschedule,
   and session revocation. Avoid real customer messages. The LINE Login channel
   is currently Developing; confirm who can use it before a wider public test.
   Only after this pilot works should rich-menu and staff share links be sent
   to actual customers. Keep benefit value, payment, payroll, marketing and
   outbound LINE delivery disabled.

## Rollback

Disable `mobile_store_entries.is_enabled` for the test store and remove any
new rich-menu/share link exposure. Preserve the new tables and booking rows.
If the candidate application causes a regression, redeploy the prior Beauty
Vercel release; the additive schema allows the prior code to continue. Verify
owner password login and the existing `/book/...` flow after rollback. Do not
restore the entire database for an application regression: a daily restore can
discard bookings created since the selected backup, causes downtime, and does
not restore Storage object contents. Reserve database restore for confirmed
data corruption after separately preserving post-backup transactions and
Storage objects.
