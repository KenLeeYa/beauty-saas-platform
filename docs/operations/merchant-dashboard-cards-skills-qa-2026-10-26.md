# Merchant dashboard, cards and skill eligibility: local QA

## Candidate and scope

- Date: 2026-10-26, Asia/Taipei.
- Workspace: `C:/Users/KY/Documents/Codex projects/beauty-saas-platform`.
- Branch: `codex/beauty-msi-continuation-20261009`; base HEAD: `e207febf4b9e3b9483761354b863ef45ee7a91a6`.
- Evidence belongs to the dirty local working tree, not that base commit. Existing unrelated changes were preserved.
- Optimized Next build: `NbZqhBqUw02wdd1uEa38v`; local server PID at verification: `73272`, port `3100`, LAN host `192.168.1.104`.
- Retained synthetic database: `beauty_msi_20261009`, loopback port `56863`. No reset or reseed was performed.
- No commit, upload, push, PR update, merge or deployment was performed. External providers remain disabled.

## Delivered behavior

1. Reports show four KPIs, service revenue ranking and all nine booking statuses together. There are no report tabs or report pagination. Revenue includes completed bookings only. The displayed loaded-record count explicitly bounds this operational dashboard; it is not a full accounting report.
2. Customer and staff directories use responsive cards with eight records per page, search and existing detail sheets. Staff cards show skills and eligible-service count; customer cards show contact, status and visit/spend summaries. Locale changes retain controlled search, selections and open-editor drafts.
3. Administrators create the organization's skill catalog, select skills for staff, and select required skills in each branch service's detail sheet. That sheet lists currently eligible staff. All selected requirements must match; an empty requirement list preserves existing assignment behavior.
4. Skills narrow the existing `service_staff_assignments` authority. They do not grant a new assignment, override effective qualification dates, activate a person or bypass branch/online availability. Catalog, availability, hold, confirmation, reschedule and reassignment enforce the requirement.
5. The customer staff-selection step shows only eligible people. With no eligible person, it shows an empty-state message and blocks continuing or automatic assignment. Back navigation and language changes preserve valid selections and contact drafts.
6. Staff or service skill changes record qualification history and surface affected future bookings in the existing review queue. They do not automatically cancel bookings, change staff allocations or alter amounts. Merchants review and reassign explicitly.

## Migration and preservation

`20261026020000_service_required_skills.sql` adds an empty-default, non-null `text[]` requirement field to `location_services`, with at most 30 non-null entries. Prisma reflects the same field. This is additive and does not rewrite service assignments or booking data.

The guarded local apply compared counts before and after: **1,185 bookings and 1,818 service assignments were preserved**. The table retained enabled and forced RLS. Later tests added their own synthetic history, so these are migration-time counts, not final database totals.

## Verification results

| Gate | Current result |
| --- | --- |
| Root lint | Passed, zero errors; one existing login navigation warning at `src/components/login-form.tsx:216` |
| Root TypeScript | Passed |
| Unit suite | 194 passed; 62 integration/UI cases intentionally skipped in this unit invocation |
| Serial database suite | 28 passed across 25 files |
| Optimized build | Passed, 62 generated routes |
| Serial retained-data browser suite | 35 passed across 10 files, 271.41 seconds |
| Mobile visual review | Dashboard, customer/staff cards, service requirements and qualified-person selection inspected at 390 x 844 |

Commands used the production root npm scripts and the guarded MSI harness, not the retained legacy pnpm applications: `npm run lint`, `npm run typecheck`, and `node scripts/msi-local.mjs unit|test|build|ui <local-credential-file>`. The final database suite finished before the full UI suite; the UI name filter was removed.

Relevant regressions include:

- Strict DTO validation, tenant/branch confinement, real other-branch denial, role/entitlement checks, unknown skills and stale expected-skills conflicts.
- AND matching for multiple skills and compatibility for services without requirements.
- Public catalog and slots exclude the unqualified person; direct hold bypass is rejected.
- Qualification changes after a hold cause confirmation and rescheduling to fail before customer/booking writes. Restoration permits the real flow again.
- Future-booking review appears on skill loss, clears on restoration, and preserves original segments, allocation identities and money until an explicit change.
- Browser-created skill, staff and service requirements use real local APIs, retry after an injected 503, and receive database/reload readback. An unsaved service buffer value remains intact while required skills save.
- Traditional Chinese, English and Vietnamese retain forms and selection. Card/skill controls are checked at 320, 390, 768 and 1440 pixels; the broader business-page suite covers six widths and the shared shell covers nine.
- Dashboard status labels are localized for all nine states, and rescheduled bookings do not inflate completed revenue.

## Problems found and fixed

- Raw booking status enum values appeared in the first dashboard screenshot. Explicit translation source keys and a nine-status regression replaced them.
- Existing merchant page tests addressed the removed row-only staff markup. Selectors and geometry checks now cover cards and rows.
- The service-carousel regression assumed no retained uncategorized services. It now checks the actual category count and its own fixture rather than assuming an empty retained database.
- An initial integration cleanup used a nonexistent Prisma hold-allocation model. Cleanup now follows the existing cancelled-hold lifecycle. The exact failed run's service/staff/catalog fixtures were deactivated or removed after identity verification; booking/audit history was retained.
- A reschedule fixture unexpectedly required a deposit. Only that synthetic test customer's override was made exempt; real branch policies were not relaxed.
- One CRM focus-return check failed during an earlier overlapping DB/UI run. It passed in isolation and in the final serial 35-case run. Concurrent fixtures are a plausible contributor, not a proven product root cause; no speculative focus code change was made.

## Evidence and limitations

Local screenshots are under `.dev-logs/`: `dashboard-mobile-final-viewport.png`, `customer-cards-mobile-final.png`, `staff-cards-mobile.png`, `service-skill-requirements-mobile.png` and `qualified-staff-mobile.png`. A full-page sticky-header capture can position fixed elements differently from the actual viewport; the viewport capture and DOM bounds were checked separately.

This is software-browser QA, not a physical-phone or native Zhuyin keyboard result. Real OAuth, Email/LINE delivery, payment settlement and Storage upload were not exercised. The seed-dependent Playwright role matrix was not run against the retained database.

Reports use the existing maximum-500 booking projection; CRM search/paging uses the existing maximum-100 customer projection. Server-wide reporting/search and cross-route/reload draft persistence are not claimed. Stored service names, customer names and skill labels remain original business data, not machine-translated content.

The free local UI/UX Pro Max guidance informed compact cards and progressive disclosure; Better Design remained quota-unavailable and was not retried. CodeGraph and a code-only Graphify graph supported change-impact review. Graphify was refreshed locally with `GRAPHIFY_BACKEND=none` (3,610 nodes, 9,226 edges); 40 SQL files were skipped for missing SQL parser support and three test files had extraction warnings. Source and executed tests, not graph edges, establish behavior. Rebuildable `graphify-out/` artifacts are excluded through Git and an explicit AOCI scope rule; application source coverage is retained.

## Local trial

1. Open `http://192.168.1.104:3100/api/line-booking/integrated-demo?role=owner` on the same private network.
2. Reports: `/merchant/reports?organization=demo&location=taipei`.
3. Customer cards: `/merchant/customers?organization=demo&location=taipei`.
4. Staff cards and skill catalog: `/merchant/staff?organization=demo&location=taipei`.
5. Service requirements: `/merchant/services?organization=demo&location=taipei`; open a service and select required skills.
6. Customer journey: `/book/demo/taipei`; select that service and continue to staff selection.
7. For a future booking affected by a skill removal, open `/merchant/operations?organization=demo&location=taipei` and its qualification-review workspace. Review retained arrangements before confirming reassignment.

The role shortcut is a local synthetic session, not real OAuth. The LAN address must still match the MSI adapter when testing later.
