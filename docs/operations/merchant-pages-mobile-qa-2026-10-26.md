# Merchant Pages Mobile QA - 2026-10-26

## Scope And Candidate

- Local-only continuation: calendar, booking management, services and staff.
- No commit, push, PR update, merge, cloud configuration or deployment.
- Branch: `codex/beauty-msi-continuation-20261009`.
- Base HEAD: `e207febf4b9e3b9483761354b863ef45ee7a91a6`; candidate includes the preserved dirty working tree, not only this commit.
- Next build: `JLA3n4EJb80NpNPTaWiPB`; 61 generated routes.
- Trial process: PID 53612, `0.0.0.0:3100`; isolated existing MSI database on loopback port 56863.
- LAN health readback: HTTP 200 with `status: ok` at `http://192.168.1.104:3100/api/health`.

## Delivered Interaction

- Calendar keeps the month and selected-day summary on the main page. Selecting a date opens a focused day sheet with appointments and opening-hours tabs.
- Custom hours, closed days and regular hours keep the existing scoped API and schedule safeguards. Saving a day no longer requires scrolling past every appointment.
- Booking, service and staff directories show at most eight entries per page. Search and filters remain outside detail views.
- Booking status reasons and payment confirmation use the shared sheet instead of a native reason prompt or a separate overlay implementation.
- Services retain category selection, images, online-booking control and buffer editing. Staff retain images, titles and skills. Create forms open separately from the directory.
- Shared `MerchantSheet` owns focus entry/return, busy dismissal guards, localized feedback, visual-viewport sizing and a separate action footer. Short detail views size to their content.
- The same row hierarchy and icon controls apply across screen widths. Inputs and actions use stable dimensions; long text wraps or has an accessible full label.
- Controlled drafts live above dialogs and are not keyed by locale. Closing/reopening an editor or selecting zh-TW, en or vi retains unfinished input. Successful creation clears only that draft.

## Reproduced Defects And Fixes

1. Calendar at 390 x 844 originally had a 7,173px page height. It now fits an 844px viewport with the month and day summary; detail content scrolls separately.
2. A time value in a schedule-row React key remounted the input after edits. Controlled time inputs now retain positional keys while their values change.
3. A nested booking render component could remount rows on workspace updates. It is now a render helper, retaining the opener for focus return.
4. The reason textarea and booking-status filter needed explicit accessible labels; regression failures exposed both. Labels no longer include entered values or option text.
5. Existing locale QA expected the background page heading while an accessible modal hid it. The test now verifies the active create-sheet title, while retaining draft assertions.

## Current Verification

| Gate | Result |
| --- | --- |
| `npm run lint` | Passed: zero errors; one existing login navigation warning at `src/components/login-form.tsx:216` |
| `npm run typecheck` | Passed |
| MSI `unit` | 187 passed; 49 opt-in cases skipped, not counted as passes |
| MSI `test` | 26 passed across 24 files |
| MSI `build` | Passed, including Prisma generation and Next compilation |
| MSI `ui`, without a name filter | 24 passed across seven files; latest run started 12:28:06 and completed in 172.09 seconds |

The root Next application uses the existing npm/MSI commands. Retained legacy pnpm applications were not revalidated.

Five new browser scenarios cover:

- Month compactness, same-day drafts, service/staff form drafts, focus restoration, and close/reopen retention.
- Four pages in three languages at 320, 390, 640, 768, 1024 and 1440px, bounded rows, no horizontal overflow, and enlarged text.
- Daily-hours injected 503 with no database write, retained input, real retry, database readback, reload, and restoration to regular hours.
- Real-core synthetic booking, deposit confirmation when required, retained search/reason, cancellation 503 with unchanged status, real retry and reload readback.
- Service creation 503/retry, buffer save/reload, online-booking toggle readback, staff creation/reload, and recoverable photo-upload failure.

The complete local UI runner also exercised existing customer booking/rescheduling, multi-service/multi-person reassignment, role routing, logout recovery, CRM and multilingual flows. Console assertions in the new scenarios passed.

Screenshot evidence is under ignored `.dev-logs/merchant-{calendar,bookings,services,staff}-compact-vi-390.png` and `merchant-{calendar,bookings,services,staff}-detail-390.png`. Calendar, booking/service directories and the resized staff detail were visually reviewed.

## Boundaries And Follow-Up

- Keyboard checks use a software VisualViewport height/offset simulation, short viewports, focus and hit-testing. They are not physical-phone or native Zhuyin composition evidence.
- Photos were tested through the file control and a failed-upload response. Actual object-storage upload and Email/LINE/Google providers were not activated or certified.
- `e2e/role-functional-matrix.spec.ts` selectors were updated for the new dialogs, but this deterministic-seed suite was not run against the retained MSI database. It is distinct from the passing seven-file local UI runner.
- Pagination/search operate on the existing server projection; bookings remain capped at 500 loaded records. This is not server-wide pagination or reporting completeness.
- Draft retention covers locale changes, viewport changes and editor dismissal within the mounted view. It does not promise recovery after leaving the route or reloading the browser.
- No schema, API authorization, payment-provider or domain-service behavior was changed. The modular monolith and verified tenant/branch context remain intact.
- Synthetic schedules were restored, test bookings cancelled, and test services/staff disabled. Audit/history remains intentionally preserved.
- Vite reported its existing future native-config-loader warning; this did not fail the current test runner.

## Local Trial

1. Open `http://192.168.1.104:3100/api/line-booking/integrated-demo?role=owner` for the local synthetic merchant session. This is not real OAuth.
2. Visit `/merchant/calendar?organization=demo&location=taipei`; select a date and switch between appointments and opening hours.
3. Visit `/merchant/bookings?organization=demo&location=taipei`; search, open a booking, and inspect available status actions.
4. Visit `/merchant/services?organization=demo&location=taipei` or `/merchant/staff?organization=demo&location=taipei`; use search, the add icon, or an existing row.
5. Enter an unsaved draft, use the language icon inside the sheet to cycle all three languages, and close/reopen the sheet to verify retention.

The trial service is intentionally left running for the requested same-network testing. Use the current private adapter address if the LAN address changes.
