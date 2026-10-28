# Merchant Business Pages Mobile QA - 2026-10-26

## Scope And Candidate

- Local-only reports, subscription, billing and initial merchant setup improvements.
- No commit, push, PR update, merge, cloud configuration, paid-provider activation or deployment.
- Branch: `codex/beauty-msi-continuation-20261009`.
- Base HEAD: `e207febf4b9e3b9483761354b863ef45ee7a91a6`. The candidate includes the preserved dirty working tree, not just this commit.
- Final Next build: `BWnf3MI4ydP3S-2DS-SEd`, 61 generated routes; trial PID 40384 on `0.0.0.0:3100`.
- Final LAN readback: `http://192.168.1.104:3100/api/health` returned `{"status":"ok"}`.
- The existing isolated MSI database on loopback port 56863 was preserved. No reset, reseed or migration was needed.
- Free local UI/UX Pro Max searches informed progressive disclosure, mobile controls and draft retention. Better Design remained quota-limited and was not retried; this is not a Better Design review or certification.
- Existing neutral/teal styling, Lucide icons, MerchantShell, MerchantSheet and the modular monolith were retained. No runtime dependency or schema was added.

## Delivered Interaction

- Reports use compact counts, completed-booking value, service/status segments and six-row pagination. The loaded-booking count is visible; results still come from the existing bounded projection, not a new accounting/reporting API.
- Subscription shows the current plan, status and period, with focused plan-rights and invoice-history entries. Only the two effective features supplied by the current backend projection are presented; no invented tier comparison or payment control is shown.
- Billing replaces a horizontally scrolling table with six-row invoice lists, all/unpaid filters and a detail sheet. Only issued/overdue invoices with an outstanding balance are included in unpaid. Void, paid and draft invoices do not acquire a fictional amount due.
- Setup uses Business, Booking and Launch stages with progress and focused sheets. Operating days/hours and booking/deposit policies are controlled parent-owned drafts; language, resizing and close/reopen do not clear them.
- Completed setup steps link to the existing calendar/settings instead of showing editable defaults as saved data. Changing routes or reloading does not promise unsaved-draft recovery.
- Invalid fields in hidden policy sections reveal the relevant section and receive focus. Action footers stay outside the sheet's scrolling body. Existing API capability, entitlement and tenant/branch checks remain authoritative.
- Launch requires existing prerequisites and an explicit confirmation sheet. This QA did not activate a merchant or an external notification provider.

## Reproduced Defects And Corrections

1. The former billing table measured 680px inside a 366px mobile content area. The first new browser assertion failed against it; the table was replaced by bounded labelled rows and detail sheets.
2. Saving initial policies after a pre-existing percentage cancellation rule returned HTTP 500 with PostgreSQL `cancellation_policies_late_fee_check`. Changing to `DEPOSIT_FORFEIT` retained incompatible percentage columns. The service now clears both fixed and percentage values for late/no-show fee modes. A failing unit regression preceded the fix; real browser retry and database readback verify it.
3. The first complete UI run passed 31/32: a new test pressed Escape immediately after HTTP 200, before the success state rendered. Busy dismissal protection correctly retained the sheet. The test now waits for visible success, `aria-busy=false` and actual dismissal before using the page language menu.
4. A later complete run passed 31/32 and exposed an existing service-carousel focus defect: interrupting smooth movement with ArrowRight/Home left the first focused card clipped by 24-32px. Instant alignment alone was insufficient. A guarded next-animation-frame alignment cancels the residual compositor offset; cleanup cancels the frame. The regression now repeats the sequence three times and asserts focus, unchanged selection and full visibility. Eight repetitions against the rebuilt application passed with scrollLeft zero, without injected page behavior.

## Verification

| Gate | Result |
| --- | --- |
| `npm run lint` | Passed: zero errors; one pre-existing login navigation warning at `src/components/login-form.tsx:216` |
| `npm run typecheck` | Passed; the final build also reran TypeScript checking |
| MSI `unit` | Final 191 passed across 40 files; 57 opt-in tests skipped, not counted as passes; started 16:44:40 |
| MSI `test` | 26 passed across 24 files, started 16:14:46; backend remained unchanged afterward |
| MSI `build` | Passed, including Prisma generation and Next compilation |
| MSI `ui`, without a name filter | Final 32 passed across nine files; started 16:45:14, duration 208.60 seconds |
| `git diff --check` | Passed |

The root production application uses the existing npm/MSI commands. Retained legacy pnpm applications were not revalidated. Existing Prisma configuration deprecation and Vite future-loader warnings did not fail these commands.

Four new browser scenarios in `tests/merchant-business-ui.integration.test.ts` cover:

- All four pages in zh-TW, en and vi at 320, 390, 640, 768, 1024 and 1440px, no horizontal overflow, at least 44px controls and bounded lists.
- Report section retention; plan-rights translations, focus return and invoice filter/page/detail retention. Eight synthetic invoices exercise paging, void status and partial-payment readback without billing mutations.
- Operating-day/time and policy drafts across languages, viewport sizes and close/reopen; hidden invalid fields, 200% text, reduced motion and a simulated 380px VisualViewport with 24px offset. Focused field and Save button remain visible and pass hit-testing.
- Injected 503 followed by real successful operating-hours/policy saves, browser reload and database readback. Stored seven-day 11:15 opening, 95-minute lead time, 37 percent deposit and cleared cancellation values were verified before restoration.
- Notification setup failure followed by a real successful retry, preserving existing provider states and creating only disabled missing integrations. Test-booking failures remain retryable across locale changes. Go-live cancellation sends no command; explicit confirmation is tested with an intercepted 503 and no activation.

The complete nine-file runner includes the existing customer booking/reschedule, multi-service/multi-person reassignment, staff/merchant roles, CRM, logout and language workflows. Unit coverage includes three setup-policy tests for fee-mode consistency, scoped query/audit construction, role denial and entitlement denial before writes.

Chrome DevTools mobile screenshots and Playwright artifacts under ignored `.dev-logs/` were visually inspected: reports, subscription, billing, setup, invoice details, setup-success sheets, desktop reports at 1440x900 and Vietnamese plan rights at 320x740. The latter had no horizontal overflow. Persisted synthetic service names remain unchanged rather than being machine-translated.

## Data And Evidence Boundaries

- New test invoice IDs are deleted only within their synthetic prefix and organization. Setup progress, business hours, booking/deposit/cancellation policies are restored in `finally`; missing disabled notification fixtures are removed, and audit history is retained.
- Synthetic login shortcuts are not Google/LINE OAuth proof. No real Email/LINE delivery, payment, storage upload, payroll settlement or Production operation was activated or certified.
- Test-booking/go-live UI recovery is covered with failed requests, not successful activation. `e2e/merchant-onboarding.spec.ts` was updated for staged setup and confirmation dialogs but was not executed against this retained MSI database; it needs its deterministic seed and is distinct from the local nine-file runner.
- Software viewport/VisualViewport and focus checks are not physical-phone or native Zhuyin composition evidence.
- Reports, invoices and paging cover the existing loaded projection, not server-wide history. Persisted successful saves were verified separately from unsaved draft retention.
- This is a local UI and regression result, not authorization or proof for a release.

## Local Trial

1. Open `http://192.168.1.104:3100/api/line-booking/integrated-demo?role=owner` for a synthetic local merchant session.
2. Reports: `/merchant/reports?organization=demo&location=taipei`.
3. Subscription: `/merchant/subscription?organization=demo&location=taipei`.
4. Billing: `/merchant/billing?organization=demo&location=taipei`.
5. Setup: `/merchant/setup?organization=demo&location=taipei`.
6. Use the header or sheet language icon to switch Traditional Chinese, English and Vietnamese. Filters, open details and unfinished drafts remain within the mounted view. The existing demo is already set up; completed steps open their status and current-settings links.

The server is intentionally retained for same-network testing. The LAN address must match the active private adapter if it changes.
