# Unified Beauty Operations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the existing beauty-saas desktop backend as the owner interface and `public` booking tables as the sole authority while adding LINE mobile booking, safe staff dispatch, member benefits, and attendance/payroll in reviewed phases.

**Architecture:** Reuse the existing Next.js App Router, Prisma/PostgreSQL booking services, role/capability resolver, entitlements, and notification outbox. Adapt the candidate mobile UI and LINE login to those services; leave the candidate `line_booking` schema inert during cutover and never dual-write. Add small, transaction-scoped domain units for dispatch, wallet, and payroll when their phase starts.

**Tech Stack:** Node 24, Next.js 16, React 19, TypeScript strict, PostgreSQL/Supabase, Prisma 6, Zod 4, Vitest, Playwright, existing shadcn source components and React Hook Form. Package manager: npm (`packageManager: npm@11.16.0`).

**Spec:** `docs/superpowers/specs/2026-10-05-unified-beauty-operations.md` (approved). Executors must read it and `AGENTS.md` first.

## Global Constraints

- Original checkout `C:\Users\KY\Documents\Codex projects\beauty-saas-platform` stays untouched; execute in the writable MSI task workspace. Preserve the current loopback trial and its synthetic data; avoid its ports 45140/56863 except for deliberate trial validation.
- No new cloud project, paid service, credentials, live LINE configuration, customer-data transmission, production migration or deployment without a separate explicit activation decision. Never reuse PR366 release authorization.
- All new IDs, roles and database access are tenant- and branch-scoped. A URL slug or client-supplied role is never authorization. Validate input with Zod, use UTC storage and branch-local display, RLS, audit and idempotency for mutations.
- Only `public` booking tables may accept new reservations for a live store. Preserve legacy data and disable/route the candidate `line_booking` writer before any real entry link is enabled. No destructive drop in the transition.
- LINE Login subject is scoped to a verified provider/channel. An employee may link more than one proved LINE account, with manager approval and audit. Each device has a revocable server-side session. Customer and employee links are separate.
- Core booking, identity, skills and audit cannot be disabled as optional modules. Disabled paid/member modules must still permit reading and settling existing obligations.
- Customer money, gift credit, coupons, packages, employee commission and payroll each have separate immutable ledgers. Actual paid balance never silently expires. No live stored-value or payroll activation before policy/legal review.
- Prefer existing adapters and package versions. Do not create microservices. Do not commit with invented Git author identity; preserve a reviewable staged diff if identity is unset.

## Review Focus

1. Same LINE account on two supported devices and two distinct LINE accounts linked to one employee: revocation must affect only the intended session/link; an unapproved second account gains no access (Task 2).
2. Future unspecified booking competing with a walk-in for the last qualified staff member or bed: only one transaction may allocate that interval, while future booking does not increment the immediate rotation count (Tasks 4, 7).
3. Refunded mixed-tender transaction after payroll lock: return each original tender component and create a next-period commission adjustment without modifying closed payroll (Tasks 11, 15).
4. Entitlement or module switched off with existing wallet/package liabilities: new issuance stops, redemption/refund and audit remain possible (Tasks 12, 13).
5. Concurrent coupon scans, booking retries and outbox retries: one redemption, one booking and one notification job per idempotency key/event, with duplicate suppression at delivery (Tasks 4, 11, 13).

---

## Workspace and delivery order

Use the existing writable `beauty-saas-integration-candidate` branch as the review base. Its `line_booking` schema/UI and synthetic trial are prototypes, not the final authority. At execution start, capture `git status`, base HEAD, ignored local files and test ports; make a second isolated local checkout only if needed to keep the running trial stable. Review staged prototype changes before refactoring, and never reset or delete them wholesale. Each task below ends with a focused test, staged diff and reviewer gate. If Git author identity is still unset, do not fabricate it for a commit. Execute P0 in dependency order **1 → 5 → 2 → 3 → 4** so channel routing exists before LINE login is switched; thereafter proceed 6–16. P0 must pass before P1; P2 requires the P0 single booking core; P3 requires confirmed service and financial event contracts but may develop read-only attendance separately. Complete local phase gates before requesting any preview/cloud activation.

## Phase P0 — single booking core, LINE identity and mobile entry

### Task 1: Freeze authority and map current contracts

**Files:** Create `docs/architecture/line-public-core-contract.md`; modify `docs/line-booking-integration-plan.md`; test `src/server/public-booking/*.test.ts` and `src/server/authorization/capabilities.test.ts` (existing tests).

**Interfaces:** Consume existing `getPublicCatalog`, `getPublicAvailability`, `createBookingHold`, `confirmPublicBooking`, `cancelPublicBooking`, `reschedulePublicBooking` and merchant booking APIs. Produce a written route-to-domain mapping for customer booking, staff manual booking, change, calendar, notification and role resolution; state which candidate routes will delegate to these services and which will be retired.

- [ ] Run existing old-core hold/confirm/change tests and record current route and schema behavior. In Task 4, write the cross-interface contract test that initially fails while the candidate still writes `line_booking`.
- [ ] Map every `/api/line-booking/*` and `/api/public/*` mutation to one existing domain operation; add an explicit no-dual-write invariant in the contract document.
- [ ] Run focused existing public booking/authorization tests, then review the mapping and schema differences before the next task.

### Task 2: Verified, revocable LINE-to-person links

**Files:** Create `supabase/migrations/20261005000100_line_identity_links.sql`, `src/server/auth/line-identity.ts`, `src/server/auth/line-mobile-session.ts`, `src/server/auth/line-linking.ts`, matching `*.test.ts`; modify `src/app/api/line-booking/login/route.ts`, `callback/route.ts`, `src/lib/line-booking/identity.ts` and authorization context integration.

**Interfaces:** `verifyLineIdentity(idToken, expectedChannel, nonce): Promise<{providerId:string; subject:string}>`; `resolveLineActor(sessionToken, organizationId, locationId): Promise<VerifiedMobileActor>` where `VerifiedMobileActor` includes `kind:'employee'|'customer'`, verified organization/location IDs, optional profile/staff/customer IDs and `ReadonlySet<Capability>`. The server returns an opaque session cookie; the database stores its hash, expiry, device session ID and revocation. The link table keys on organization, provider and hashed subject, with separate employee/customer targets and audited approval state.

- [ ] Write failing tests for provider mismatch, expired/replayed OAuth state, employee with two proved accounts, one account on two sessions, unlink/offboarding revocation, inactive membership, cross-store access, and no name/phone auto-merge.
- [ ] Add the append-only approval/revocation migration with tenant FK/RLS, unique active-link constraints and dry-run SQL check on synthetic DB. Do not import real LINE identities.
- [ ] Implement link approval only after both LINE identities were individually verified and an authorized owner/manager approved; keep existing desktop email/Google session behavior unchanged.
- [ ] Run the focused auth tests plus `npm run typecheck`, `npm run lint` and migration rollback rehearsal. Review cookie scope, secret handling, audit and no customer/employee identity confusion.

### Task 3: One catalog and booking policy for mobile

**Files:** Modify `src/app/api/line-booking/catalog/route.ts`, `availability/route.ts`, `src/app/line-booking/[store]/booking-experience.tsx`; create `src/server/mobile/catalog.ts`, `availability.ts`, tests. Reuse `src/server/public-booking/catalog.ts`, `availability.ts`, `src/server/time/timezone.ts` and existing `location_booking_policies`.

**Interfaces:** `getMobileCatalog(actor: VerifiedMobileActor)` and `getMobileAvailability(actor: VerifiedMobileActor, serviceVariantId, staffPreference, localDate)` return existing public service/variant/staff IDs and slots. No query to `line_booking` tables. Optional module display comes from existing `getEntitlement` plus store configuration, not client flags.

- [ ] Write failing tests for two locations with overlapping slugs, service duration override, pre/post buffer, leave, resource quantity, closed day, unsupported staff, timezone boundary and entitlement-off UI/API.
- [ ] Delegate to the old public catalog/availability services, mapping only presentation fields. Preserve current mobile step flow and qualified-staff share link.
- [ ] Run focused Vitest and 390px mobile Edge flow; compare mobile slots against the old public page for the same synthetic location/date.

### Task 4: Book/change/calendar through `public` only

**Files:** Modify `src/app/api/line-booking/booking/route.ts`, `[id]/route.ts`, `my-bookings/route.ts`, `calendar/route.ts`, `src/app/line-booking/[store]/booking-experience.tsx`; create `src/server/mobile/booking.ts`, `calendar.ts`, tests; adapt old `src/server/public-booking/hold.ts`, `booking.ts` only where an authenticated LINE actor needs an interface. Preserve the existing `notification_outbox` path.

**Interfaces:** Define `ValidatedBookingCommand` in `src/server/mobile/booking.ts` from the shared Zod request schema. `createMobileBooking(actor: VerifiedMobileActor, command: ValidatedBookingCommand)` delegates to the old hold→confirm transaction and returns the `public.bookings.id`; `changeMobileBooking` uses the old cancel/reschedule rules; `getMobileCalendar` masks other staff customer details. Manual phone/private-LINE entry is allowed only for `booking.create`, with no fabricated customer LINE subject. Idempotency keys bind to actor, location and operation.

- [ ] Write failing synthetic DB tests: mobile customer and staff manual entries resolve to the same `public.bookings.id` seen by merchant desktop, last bed race, duplicate retry, owner/staff/customer visibility, no cross-tenant change, cancel and reschedule policy, outbox duplicate retry. Assert `line_booking.bookings` count never changes.
- [ ] Refactor routes to the existing domain services and RLS-backed verified contexts; remove any booking SQL that writes the candidate schema. Keep the old owner desktop screens functional.
- [ ] Run `npm test`, targeted PostgreSQL tests, old desktop/mobile Playwright flows and `npm run build`. Compare booking IDs and resource allocations in both interfaces; write reconciliation counts before disabling candidate writes for non-demo traffic.
- [ ] Gate activation: only after local and protected preview match, keep the old `line_booking` data read-only for reconciliation. Roll back by disabling the new entry route, not deleting confirmed bookings.

### Task 5: Per-store LINE channel and module visibility

**Files:** Create `supabase/migrations/20261005000200_store_line_channels.sql`, `src/server/notifications/line-channel-registry.ts`, tests; modify `src/server/notifications/line-webhook.ts`, `adapters.ts`, `src/components/merchant-workspace.tsx`, `src/components/merchant-route.tsx` and relevant API guards.

**Interfaces:** `resolveStoreLineChannel(organizationId, locationId, channelId)` returns only an authorized provider/channel configuration reference; actual secrets stay server-only. `canShowModule(context, featureKey)` combines existing plan entitlement and store activation, while `requireModule` enforces the same decision at API boundaries.

- [ ] Test channel routing, raw webhook signature against the matching channel, wrong-provider rejection, disabled notification fallback, and module hidden in nav but also 403 at page/API.
- [ ] Add configuration references/migration and dry-run on synthetic DB; do not create credentials or change a real OA.
- [ ] Wire the old notification outbox adapter, then run webhook, entitlement, notification retry and desktop navigation regressions. P0 ends with local demo intact and one `public` booking core.

## Phase P1 — service capability and atomic walk-in dispatch

### Task 6: Effective-dated staff-service capability

**Files:** Modify `prisma/schema.prisma`, add `supabase/migrations/20261005010100_staff_capability_terms.sql`; create `src/server/staff/service-capability.ts`, tests; modify `src/server/merchant/management.ts`, `src/app/api/merchant/staff/route.ts` and merchant staff settings UI.

**Interfaces:** `isStaffQualified(locationId, staffProfileId, serviceVariantId, at, channel): Promise<boolean>`; `setStaffCapability(context, command)` accepts effective start/end, online-selectable and walk-in-eligible flags and appends audit. Existing `service_staff_assignments` remain the canonical mapping, extended instead of duplicated.

- [ ] Test front-desk permitted manage scope versus provider denied, effective boundaries, disqualified new booking, future booking exception list after deactivation, and historic segment snapshot unchanged.
- [ ] Add additive migration/backfill from active assignments with default flags, run count and tenant-scope dry-run, then add UI/API and server-side validation.
- [ ] Run tests, Prisma validation, migration dry-run and desktop service/staff flows; no live migration.

### Task 7: Unified rotation and last-capacity transaction

**Files:** Create `supabase/migrations/20261005010200_dispatch_events.sql`, `src/server/booking/dispatch.ts`, tests; extend existing availability/allocation transaction rather than a second scheduler; modify front-desk booking API and mobile staff agenda.

**Interfaces:** `assignUnspecifiedBooking(context, serviceVariantId, interval, mode:'future'|'immediate', idempotencyKey)` returns staff/resource IDs and rotation event in one transaction. Rotation scope is location × shift × skill group; immediate successful assignment increments count. Future assignment reserves capacity but does not advance immediate count.

- [ ] Test qualification/on-shift/rest/leave, soon-upcoming appointment overlap, room/bed conflict, deterministic tie-break, skip/re-entry, pre-start cancellation compensation, post-start no silent reversal, owner override reason, and two simultaneous front-desk requests for one bed.
- [ ] Implement transaction lock and allocation exclusion with an append-only dispatch event; ensure a failed transaction leaves neither booking nor rotation increment.
- [ ] Run race test repeatedly on synthetic PostgreSQL, then browser flows for walk-in, phone booking, online specified and unspecified booking in the same owner calendar. Review fairness counters against event replay.

### Task 8: Reassignment and optional staff modules

**Files:** Create `src/server/booking/reassignment.ts`, tests; modify `src/server/staff/data.ts`, `src/components/staff-workspace.tsx` or new mobile view, merchant schedule UI and `src/server/notifications/dispatcher.ts`.

**Interfaces:** `listAtRiskFutureBookings(staffId, from)` and `reassignFutureBooking(context, bookingId, targetStaffId, reason)` preserve the original booking and hold old allocation until new allocation succeeds.

- [ ] Test leave, offboarding, skill removal, failed reassignment, masked other-staff details, customer notification job, and audit.
- [ ] Add front-desk pending queue and staff phone agenda; module hiding does not remove existing bookings or entitlement checks.
- [ ] Run owner desktop, staff mobile and customer flows before P1 review gate.

## Phase P2 — CRM, benefits, wallet, coupons and commission inputs

### Task 9: VIP, blacklist and marketing consent

**Files:** Extend `src/modules/crm/server/customer-service.ts`, `src/modules/crm/components/customer-management.tsx`, `src/server/merchant/management.ts`; add `supabase/migrations/20261005020100_customer_status_rules.sql` and tests.

**Interfaces:** `getBookingEligibility(organizationId, locationId, customerId)` returns allowed/blocked without disclosing restricted reasons; `setCustomerStatus` records actor, reason, review/expiry and scope. Birthday eligibility reads minimum needed date parts; consent for marketing is independent from transactional notifications.

- [ ] Test branch versus organization blacklist, expiry/appeal, provider's minimal view, VIP flag audit, birthday one-use-per-year and no marketing push without consent.
- [ ] Add additive status/audit fields, migration dry-run and CRM UI. Reuse old public booking blacklist check for every mobile/desktop channel.
- [ ] Run CRM and public-booking tests plus role/tenant isolation review.

### Task 10: Versioned promotion and member entitlement policies

**Files:** Create `supabase/migrations/20261005020200_member_policies.sql`, `src/server/members/policy.ts`, tests and merchant settings UI. Keep package/discount/coupon terms distinct.

**Interfaces:** `quotePromotion(context, serviceSegments, customerId, at): Quote` returns list price, discounts, stacking outcome, cap, eligibility and policy version; `publishPromotion` rejects conflicting priority or invalid effective dates. Mother's Day relationship is a minimal front-desk attestation, not a family identity database.

- [ ] Test Mother's Day 20% with dates, branch/service scope, cap, manual attestation, birthday/VIP conflict, old booking price snapshot, and attempted mid-service rule change.
- [ ] Dry-run policy migration; add quote preview before publish and retain original terms on issued benefits.
- [ ] Run quote tests and mobile/desktop price display equality checks.

### Task 11: Split ledgers, redemption and refund

**Files:** Create `supabase/migrations/20261005020300_member_ledgers.sql`, `src/server/members/ledger.ts`, `redemption.ts`, `refund.ts`, tests; reuse existing `booking_payments` and `booking_refunds` as settlement links, not a second payments system.

**Interfaces:** `reserveEntitlement`, `redeemEntitlement`, `releaseReservation`, `refundSettlement` operate with transaction ID and idempotency key. Separate paid principal, promotional bonus, discount coupon and service-package ledgers. The checkout record carries exact original-tender allocation and rounding policy; QR redemption uses a short-lived, one-use server check.

- [ ] Test 10,000 paid + 1,000 bonus display, 1,000 principal-first redemption, integer 10:1 split 909/91, last-balance race, double QR scan, offline refusal, partial refund to original components, cross-tenant access and no paid-balance expiry by default.
- [ ] Add RLS-backed append-only ledger and synthetic migration dry-run; define money in the project's minor units. Do not activate real stored value before contract classification, liability and refund review.
- [ ] Run ledger race/rollback tests and reconcile sums to old payment records. Gate on legal/product terms and protected preview before any issuance.

### Task 12: Effective-dated commission rules and preview

**Files:** Create `supabase/migrations/20261005020400_commission_rules.sql`, `src/server/payroll/commission-quote.ts`, tests and merchant rule preview UI; avoid payroll payout in this phase.

**Interfaces:** `quoteCommission(completedSegments, tenderAllocation, ruleVersion): CommissionLine[]` selects one primary rule per segment/employee/tender component; supports original 1,000×40%=400, discounted 800×40%=320, paid-only 600×40%=240, or independent fixed 300. Top-up bonus is a separate event, off by default.

- [ ] Test effective date snapshot, conflicting rule publication rejected, multiple staff sum cap, payment fee/tax basis flag, package allocation, no commission on both top-up and redemption, and refund-linked negative quote.
- [ ] Dry-run rule migration; expose read-only quote preview and audit without writing wage ledger. Review contractual basis and approvals before P3.

### Task 13: Member and module UI gate

**Files:** Add mobile member view under `src/app/line-booking/[store]` or a nested route, merchant benefits UI and `src/server/entitlements/service.ts` integration; tests.

**Interfaces:** Mobile customer sees balances and issued terms for their own account only; staff redemption API receives verified member and store context. `MEMBERSHIPS_PACKAGES` and store switches control new issuance but never erase outstanding read/redeem/refund rights.

- [ ] Test owner/customer/staff visibility, disabled module with liability, duplicate outbox/redemption retry and screen-reader labels/390px layout.
- [ ] Wire UI to Tasks 9–12, run mobile/browser and financial reconciliation tests. Keep real LINE pushes and stored-value activation disabled.

## Phase P3 — attendance and payroll

### Task 14: Immutable attendance and corrections

**Files:** Create `supabase/migrations/20261005030100_attendance_events.sql`, `src/server/staff/attendance.ts`, tests, staff mobile clock view and manager desktop review.

**Interfaces:** `recordClockEvent(actor, locationId, kind, occurredAt, idempotencyKey)` and `approveClockCorrection(manager, eventId, correctedAt, reason)` append records; current attendance is derived. LINE login and booking status never synthesize clock events.

- [ ] Test two devices/double-tap dedupe, overnight and cross-location shift, breaks, unapproved overtime retained, correction audit, employee export and retention configuration (Taiwan applicability review).
- [ ] Add RLS/additive migration and dry-run, then mobile/desktop review UI; run time-zone, tenant, role and device revocation checks.

### Task 15: Payroll rules, locked ledger and refunds

**Files:** Create `supabase/migrations/20261005030200_payroll_ledger.sql`, `src/server/payroll/rules.ts`, `calculation.ts`, `approval.ts`, tests and restricted owner/payroll UI.

**Interfaces:** `calculatePayrollPeriod(employeeId, period, effectiveRules)` creates traceable draft lines from actual attendance, completed-service commission and approved corrections. `approvePayrollPeriod` locks source versions; `createPayrollAdjustment` appends next-period reversal after refunds, never mutates closed lines. No bank transfer API.

- [ ] Test hourly/base pay, leave, overtime rule version, manual correction, paid+bonus commission, multiple staff, partial refund after lock, withheld/unapproved time visible for review, employee-only payslip and front-desk denied.
- [ ] Dry-run schema and compare synthetic period against human-calculated fixture; publish printable/downloadable itemized payslip only after manager approval.
- [ ] Run full regressions and at least one manual reconciliation period before any payroll activation; local legal/policy review is an explicit gate.

### Task 16: Phase acceptance and controlled release package

**Files:** Create `docs/operations/unified-booking-release.md`, `docs/operations/financial-reconciliation.md`, synthetic runbooks/tests; update existing local trial guide. No deployment in this task.

**Interfaces:** Per-phase release checklist includes booking ID/allocations, identity links, obligations, outbox and ledger counts; rollback disables new entry/issuance while retaining data and settlement access.

- [ ] Run `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, PostgreSQL race tests, and Playwright desktop/mobile flows on synthetic data. Use npm because this checkout rejects pnpm despite its AGENTS wording.
- [ ] Compare old desktop and LINE mobile same booking ID, customer, staff, resource and status; verify cross-tenant, owner/staff/customer permissions and optional module-off behavior.
- [ ] Record migration dry-run output, data-reconciliation totals, advisor findings, local trial URL and known mock integrations; identify separate approval needed for real channels, stored value, payroll and production deployment. Do not push or deploy as part of planning or local testing.

## Activation and rollback boundaries

- **P0:** Keep current `line_booking` local trial running with synthetic data while the new mobile routes are adapted. Before a live store entry is enabled, ensure only `public` writes and reconcile any prototype confirmed bookings manually; no automatic production import. If mobile fails, disable that entry and use existing public/desktop routes.
- **P1:** Dispatch can be feature-gated per synthetic/test location. Rollback stops new unspecified assignments but leaves already assigned bookings and audit intact for manual handling.
- **P2:** Do not issue paid balances before contract/legal classification, refund policy, money reconciliation and owner approval. Rollback stops new sales/issuance, keeps member redemption/refund and liability access.
- **P3:** Run payroll in shadow/reconciliation mode until a reviewed period matches expectations. Rollback returns to existing payroll process while retaining attendance and draft events; closed entries are adjusted, never deleted.

## Plan self-review

- Spec sections 1–3 map to P0 Tasks 1–5; dispatch to P1 Tasks 6–8; CRM, wallet, promotions and commission inputs to P2 Tasks 9–13; attendance/payroll to P3 Tasks 14–16.
- Each phase can produce independently tested software and has a separate activation gate. P2 legal terms and P3 payroll calculation are not hidden inside P0 release.
- Review Focus conditions appear as named tests in Tasks 2, 4, 7, 11, 12, 13 and 15. The plan does not authorize cloud writes, LINE settings or production data movement.
