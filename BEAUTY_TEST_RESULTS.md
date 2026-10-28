# Test evidence

## 2026-10-27 Server-paged branches and resources (local only)

Build `XdauVMbB_YxCZIzJH5TbI`, PID 47680, LAN `192.168.1.104:3100`.
Branches and resources now use verified, scoped server search and pagination
(eight and six rows). Branch listing respects active memberships; resources stay
inside the current branch. Facility bootstrap omits complete directory arrays.
Profile and resource drafts survive paging, three-language changes and read/write
retries. Late searches and shrinking final pages have browser regression coverage.

Final browser run: 43 passed in 12 files, starting at 19:00:39, 364.15 seconds.
Database: 33 passed in 28 files. Unit: 204 passed, 75 gated skips. Typecheck and
build passed; lint has zero errors and one existing login navigation warning.
The first full browser run had two failures: a synchronous assertion on the new
remote search, and a legacy booking fixture dependent on unavailable retained
resource schedules and fully allocated month-end staff. Tests now wait for the
rendered result and use an owned scheduled resource with bounded calendar scanning.
The intermediate failures and final verification are preserved in
`docs/operations/server-facility-directory-qa-2026-10-27.md`.

Original demo/showcase records and test history are retained. No upload, commit,
PR update, merge, deployment, database reset or external provider operation.
Mobile evidence uses software browsers, not a physical device or native IME.
The local LAN server remains running for user testing.

## 2026-10-27 Server-paged service and staff directories (local only)

Build `YxSeOfps8fzRnrVXCJv_8`, PID 34776, LAN `192.168.1.104:3100`.
Services and staff now use authenticated, tenant/branch-scoped server searches
and eight-row pages. Detail sheets, independent record drafts, required skills
and new-record forms survive paging, search, three-language switches and retries.
The bootstrap omits complete service/staff arrays on these two directory pages.

Final browser run: 41 passed in 11 files, starting at 18:11:47, 403.36 seconds.
Unit: 204 passed, 72 gated skips. Database: 32 passed in 27 files. Typecheck and
build passed; lint has zero errors and the existing login navigation warning.
An existing recovery test now waits for its named fixture before interacting.
The initial settings timeout, subsequent locator failure, focused checks and
final full rerun are preserved in
`docs/operations/server-service-staff-catalog-qa-2026-10-27.md`.

Existing test history and the independent Chinese showcase were retained.
No commit, push, PR update, merge, deployment, dependency installation, schema
migration, database reset or real provider action. Mobile evidence is software
based, not physical-device/native IME proof. The LAN server remains running.

## 2026-10-27 Server-paged skill catalog (local only)

Build `KAUENPw8_FIafHU17-36e`, PID 61300, LAN `192.168.1.104:3100`.
Skill maintenance, new/existing staff and service requirements now query eight-row
server pages. Search, pagination and three-language switching retain off-page
selections and form drafts; failed reads and writes are recoverable. The merchant
bootstrap no longer downloads the entire skill catalog.

Final browser run: 40 passed in 11 files, starting at 15:38:06, 312.41 seconds.
Unit: 204 passed, 70 gated skips. Database: 31 passed in 26 files. Typecheck and
build passed; lint has zero errors and the existing login navigation warning.
The initial UI failures and their regression corrections are recorded in
`docs/operations/server-skill-catalog-qa-2026-10-27.md` with paths and screenshots.

Existing demo/showcase records and prior local work were retained. No commit,
push, PR update, merge, deployment, dependency install, DB reset or real provider
action. Mobile evidence is software-based, not physical-device/native IME proof.

## 2026-10-27 Server directories and isolated Chinese showcase (local only)

Build `PTzHRcL2wMRTps3EjjiQu`, PID 27048, LAN `192.168.1.104:3100`.
Customer and booking directories now search and page on the server. Qualification
reviews use searchable six-row pages; skill pickers retain off-page selections.
An isolated `showcase/daan` tenant contains Chinese fictional data; creation and
reapplication preserved the other tenants' retained records.

Final browser run: 39 passed in 11 files, including three languages, responsive
screens, failed-request retry, delayed search responses, and immediate booking
mutations while directory reloads are held. Unit run: 204 passed, 68 gated skips.
Typecheck and local build passed; lint has no errors and one existing login
navigation warning. See `docs/operations/server-pagination-showcase-qa-2026-10-27.md`
for database evidence, paths, screenshots and remaining limits.

No commit, push, PR update, merge, deployment, dependency installation or real
provider action. Software mobile QA is not physical-phone or native IME proof.

## 2026-10-26 Shared application shell and compact CRM (local only)

Baseline: `e207febf4b9e3b9483761354b863ef45ee7a91a6` plus preserved local work,
branch `codex/beauty-msi-continuation-20261009`.
Final application build: `D3WD_GNkiDHerz_ySctsO`; trial PID 24000 on 0.0.0.0:3100.
Database: isolated loopback `beauty_msi_20261009`; providers disabled.
No commit, push, merge, deployment, dependency installation, schema migration,
paid design service or GitHub Actions invocation was performed.

### Changes and reproduced failures

- Reproduced the original header defect at the 640px breakpoint and in DevTools
  near 770px: a 44px-wide action displayed a 120px-high wrapped label. The shared
  header now keeps booking, language and logout controls as named 44px icons.
- Merchant workspace and operations share one navigation registry and shell.
  Mobile has four primary destinations plus More; desktop uses the same grouped
  destinations. Operations keeps four primary actions plus More at every width.
  Staff uses the shared header; platform tabs keep one layout and current-page
  state; anonymous booking login uses a bounded icon action.
- CRM now shows at most 20 compact rows per page from the existing bounded data
  projection. Detail dialogs contain birthday, deposit, blacklist, tags and notes.
  No new data authority or entitlement bypass was introduced.
- A new browser test reproduced a short-screen interaction failure: blurring
  search revealed the bottom navigation between pointer-down and pointer-up and
  intercepted the customer-row click. Removing focus-triggered navigation hiding
  restored the first click. The test covers a 390x420 viewport after reload.
- The saved-note test initially assumed the first customer had a unique name and
  phone. Shared synthetic fixtures disproved both assumptions. It now creates its
  own `QA app-shell` customer through the actual UI, then searches its unique
  synthetic phone and verifies the note after reload. No assertions were removed.

### Verification

| Check | Result | Evidence |
| --- | --- | --- |
| Root lint | Passed with existing warning | `npm run lint`: 0 errors, existing login `window.location.assign` warning |
| Typecheck | Passed | `npm run typecheck` |
| Unit suite | 187 passed / 44 skipped | `msi-local.mjs unit`; opt-in DB/browser/fixture skips are not passes |
| Database integrations | 26 passed, 24 files | `msi-local.mjs test`; scope, blacklist entitlements, booking/ledger and reassignment invariants |
| Complete local browser suite | 19 passed, 6 files | `msi-local.mjs ui`, no name filter, 165.33 seconds; 16 existing plus 3 new cases |
| Shell and CRM workflows | 3 passed | Stable controls at 320/390/639/640/767/768/1023/1024/1440; zh-TW/en/vi; menu focus; delayed navigation; 200% root text; reduced motion; detail drafts; 503 recovery and real note readback |
| Dependent workflows | Passed in browser suite | Merchant/staff/customer routing; public service cards and time sheets; booking/change/cancel; platform/applicant drafts; multi-service/multi-participant reassignment and conflict/retry |
| Local optimized build | Passed | Next production-mode build under test configuration, 61 generated pages; not a Production deployment |
| LAN | Passed, software browser | 192.168.1.104 is the current private adapter; local and LAN health 200; suite executes actual LAN customer selection |

Screenshots reviewed: `.dev-logs/app-shell-zh-TW-390.png`,
`.dev-logs/app-shell-vi-390.png`, `.dev-logs/app-shell-devtools-768.png`,
`.dev-logs/customer-details-app-390.png`, `.dev-logs/owner-operations-390.png`
and `.dev-logs/staff-workspace-vi.png`. The final full suite also refreshes
role, language, rescheduling and reassignment screenshots.

Limits: software Edge/Chrome viewport and VisualViewport tests are not physical
phone, native Zhuyin keyboard, screen-reader certification or live-provider proof.
The separate seed-dependent Playwright `e2e/` matrix was adapted to the new detail
entry but not rerun against this retained database; it must be rerun with its
deterministic fixtures before release. Current CRM pagination covers the loaded
maximum-100 projection, not server-wide search. No measured network-speed gain
or complete native-app parity is claimed. Existing source/build deprecation
warnings remain outside this UI change.

Trial: `http://192.168.1.104:3100/api/line-booking/integrated-demo?role=owner`,
then `http://192.168.1.104:3100/merchant/customers?organization=demo&location=taipei`.
Official research, adopted/deferred decisions and architecture boundaries are in
`docs/product/booking-platform-improvement-plan.md`.

## 2026-10-26 Service category filters and swipe cards (local only)

Baseline: `e207febf4b9e3b9483761354b863ef45ee7a91a6` plus preserved local work.
Final application build: `HMrC8q-0jrxTcG5vLbMas`; trial PID 42028 on 0.0.0.0:3100.
This supersedes earlier runtime identities. No commit, upload, merge, deployment,
dependency installation, schema migration or provider send was performed.

- `/book/demo/taipei` service selection uses existing catalog categories, an All
  filter and an uncategorized fallback. Filtering only changes browsing; selection,
  staff/contact state and existing hold-release authority stay in PublicBookingFlow.
  Current demo services share the existing popularity category; no existing service
  was reclassified. Category names and service names remain original business data.
- A single native scroll-snap rail presents bounded cards with prices, duration,
  descriptions and configured service images. Mobile shows the next card edge;
  desktop shows multiple cards. Arrow buttons and Arrow/Home/End keyboard navigation
  supplement touch. Swipe/focus never selects or writes a hold; tapping a card does.
  Smooth arrow scrolling and 160ms selection feedback respect reduced-motion mode.
- Red/green browser regression first failed for the missing category controls.
  Two temporary services exercise distinct and uncategorized filters, long business
  names, three-language retention, Back/Next, real CDP touch events, no accidental
  selection, keyboard focus, bounded cards and zero hold requests while browsing.
  Cleanup disables their online offering and service; synthetic audit history remains.
- Visual QA found that the old sticky step footer obscured cards on short screens
  and with 200% text. The service-step footer now follows content in document flow.
  Regression asserts no card/footer overlap at 320x568, 390x844, 430x932, 768x1024,
  844x390 and 1440x900, and in Vietnamese with 200% text and reduced motion.
  Native touch momentum must settle before resizing; focused-card bounds are checked.
- Final-build browser suite: 16 passed in five files, 137.02 seconds, started 01:30.
  This includes actual local booking/change/cancel persistence and modal recovery.
  The strengthened touch-settle/focus assertion was rerun separately: one passed,
  15 intentionally filtered skips. Unit: 187 passed, 41 environment-gated skips.
  Database: 26 passed in 24 files. Build, typecheck and diff check passed; lint has
  zero errors and one pre-existing login navigation warning. Root npm is the active
  application; retained legacy pnpm workspaces are not covered by these results.
- Visual artifacts: `.dev-logs/service-picker-final-{320,390,1440}.png`,
  `.dev-logs/service-cards-*.png` and `service-cards-vi-large-text.png`.
  Used CodeGraph, AOCI, relevant TDD/Karpathy/QA skills and free local UI/UX Pro Max
  searches. Better Design remains quota-limited; this is not an external design review.
  A Chrome DevTools screenshot request stalled, so final screenshots and touch QA
  used Playwright with installed Edge. All device evidence is software emulation,
  not physical-phone, native Zhuyin, real OAuth, Email/LINE or payment-provider proof.
- Local trial remains available at `http://192.168.1.104:3100/book/demo/taipei`
  and `http://127.0.0.1:3100/book/demo/taipei`; current LAN address was read back.

## 2026-10-25 Customer booking step pages and time overlay (local only)

Baseline: `e207febf4b9e3b9483761354b863ef45ee7a91a6` plus preserved local work.
Application build: `OXUX9p6dAgJo9b-rZTjjX`; trial PID 33188 on 0.0.0.0:3100.
This supersedes the prior section's runtime/build identity, not its historical results.
No commit, push, merge, deployment, schema migration or provider send was performed.

- The active `/book/demo/taipei` flow now presents service, specialist and date
  selection as separate client-side views, followed by the existing contact step.
  Back/Next retain calendar month, selected service/staff and entered contact data.
  Rescheduling starts at date selection and uses a two-step progress indicator.
- Selecting a calendar day opens a mobile bottom sheet or centered desktop modal.
  Available times scroll inside the sheet; the date, selected time and confirmation
  action remain visible. Selecting a time alone performs no hold mutation; explicit
  confirmation rechecks current capacity and advances to contact/confirmation.
- Closing aborts pending availability; reopening reloads current slots. Empty dates,
  HTTP 503 and hold-conflict HTTP 409 have recoverable states. A stale request cannot
  overwrite another date. Cancel/Escape returns focus to the originating calendar day.
  Loading has a 15-second timeout; the sheet cannot dismiss during hold submission.
- Red/green regressions caught the old stacked layout, missing staff pressed state
  and a transient off-screen modal position on viewport resizing. State semantics,
  a non-transitioning sheet and settled viewport measurements address those cases.
- Focused browser tests cover 320x568, 390x844, 430x932 and 1280x800; Chrome DevTools
  also verified 844x390 landscape. Footer bounds and horizontal overflow checks pass.
  Visually inspected Chinese mobile and Vietnamese narrow/desktop screenshots under
  `.dev-logs/booking-time-mobile-zh.png` and `.dev-logs/booking-time-sheet-*.png`.
- Chinese, English and Vietnamese switching preserves selected times, active holds,
  contacts and consent. Tests replace held times, revisit earlier slots, change dates,
  inject availability/hold failures, retry and confirm actual local booking changes.
  Database readback verifies CONFIRMED, RESCHEDULED and cancelled lifecycle results.
- Full local browser suite: 15 passed in five files, 133.98 seconds, started 23:10.
  Selected Playwright reselection and customer routing: four passed across desktop
  and Pixel 7. Additional customer book/change/cancel and three-role mobile first
  screens: two passed, two intentional project-matrix skips, 12.0 seconds. The latter
  harness was updated for the current Chinese login label and explicit Taipei branch
  selection when retained synthetic branches exist; no seed reset was performed.
- Unit: 187 passed with 40 environment-gated skips (not passes). Local database:
  26 passed in 24 files. Typecheck, build and diff checks passed. Lint reports zero
  errors and one pre-existing login navigation warning. The root npm app is the
  validation target; retained pnpm workspaces are not validated by these commands.
- Test entry: `http://192.168.1.104:3100/book/demo/taipei` or loopback port 3100.
  The server remains available for the requested local trial. All mobile evidence
  is software emulation, not a physical phone or native Zhuyin keyboard test. Real
  OAuth, Email/LINE delivery, payment settlement and Production are outside this run.

## 2026-10-25 MSI software mobile QA and compact operations (local only)

Baseline: `e207febf4b9e3b9483761354b863ef45ee7a91a6` plus preserved local work.
Final application build: `PWfHlTZv5WvxJdaEcGSif`; trial PID 46260 on 0.0.0.0:3100.
The user explicitly selected software-only QA instead of a connected phone.
No commit, push, merge, deployment, dependency install, migration, provider send
or real customer operation was performed. Existing unrelated changes are retained.

- Tools: Chrome DevTools MCP touch emulation and Playwright with installed Edge;
  CodeGraph and AOCI for repository analysis. Relevant TDD, Karpathy and product
  QA skills were applied. Better Design remains quota-limited; free local UI/UX
  Pro Max searches supplied interaction guidance, not an external design review.
- Mobile operations previously used a two-row, approximately 123px navigation.
  Four common actions now remain visible with a fifth More icon/menu for payroll
  and multi-provider commission. Measured height is approximately 79px at 390px.
  Desktop retains all six actions. Menus support focus return and checked state.
- Traditional Chinese, English and Vietnamese retain readable short labels,
  full accessible names, existing language icons, and 44px-or-larger touch targets.
  Navigation tests cover 320/390/430px and 844x390 landscape; the broader role
  matrix covers 360/390/430/768/1280px without horizontal overflow.
- Reproduced failed logout losing its visible recovery path (and the shared
  control redirecting despite failure). The shared control now checks HTTP status,
  bounds the request to ten seconds, keeps the current page on failure, and offers
  translated retry/close actions. Merchant and shared surfaces use the same behavior.
  A later keyboard check found an unnamed error dialog and lost focus on dismissal;
  the regression failed first, then passed after naming and focus-return fixes.
- Logout regressions inject an offline request and HTTP 503, verify the existing
  session still reads 200, then remove the fault and perform actual local revocation:
  the cookie disappears, the login page opens and the session API returns 401.
  Both Escape and the close button return focus to logout; no page errors occur.
- Unit: 187 passed, 39 environment-gated skipped (not passes). Database suite:
  26 passed in 24 files. Final full browser suite: 14 passed in five files,
  128.65 seconds, started at 20:06 local time. Typecheck and production-mode local
  build passed. Lint has zero errors and one existing login navigation warning.
- Existing real local booking regressions passed: public/mobile slot competition,
  customer booking/change/cancel, reschedule load failure and retry, precise bundle
  participant reassignment, unchanged other staff/services/amounts, capacity 409
  with no mutation followed by successful retry, and three-language draft retention.
  VisualViewport simulations cover keyboard space and offset changes, reachable
  fields/actions, close/reopen and language switching. They are not native IME proof.
- Visually inspected narrow Vietnamese navigation, shared/merchant logout failure
  recovery and the 320px reassignment keyboard-space screenshot. Evidence includes
  `.dev-logs/msi-navigation-vi-320.png`, `.dev-logs/mobile-navigation-vi.png`,
  `.dev-logs/logout-recovery-shared-vi.png`,
  `.dev-logs/logout-recovery-merchant-vi.png`, and
  `.dev-logs/reassignment-keyboard-320-96.png`.
- Follow-up: old synthetic attendance branches remain in the local selector;
  introduce receipt-bound fixture cleanup before treating this database as a clean
  demonstration. No broad cleanup was attempted. Historical phone fixtures and
  earlier native-keyboard results below are not current physical-device evidence.
- Local owner entry: `http://127.0.0.1:3100/api/line-booking/integrated-demo?role=owner`.
  LAN entry: `http://192.168.1.104:3100/api/line-booking/integrated-demo?role=owner`.
  Operations: `/merchant/operations?organization=demo&location=taipei`.
  Server remains running for the requested local trial. Real OAuth, Email/LINE
  delivery, payment settlement, physical phones and native Zhuyin are not verified
  in this run; these software results are not a Production release claim.

## 2026-10-21 Notification locales, compact controls and native Zhuyin (local only)

Baseline: `e207febf4b9e3b9483761354b863ef45ee7a91a6` plus preserved local work.
Application build: `5sm1c-NUOC3XVOfqz_yOo`; trial PID 4976 on 0.0.0.0:3100.
LAN health readback returned `ok`. No commit, push, merge, deployment, dependency
installation, migration or real notification-provider send was performed.

- Language selection now uses a 44px icon in existing headers, opening a menu
  instead of a native select or separate top bar. Shared logout is also an icon.
  Accessible labels, focus states and touch targets remain; failed preference saves
  preserve the previous locale and form state. The menu works inside modal focus boundaries.
- All 12 notification events render subject, text and escaped HTML in zh-TW, en
  and vi. The dispatcher reads the recipient customer's current preferred_language
  on each attempt, including retry, not the merchant's UI language or stale payload.
  Date display retains the branch timezone; business names are never translated.
- Verified mobile customer or booking-tracking capability can persist notification
  preference. Writes bind customer and organization, exclude inactive/anonymized
  records, and complete before the browser cookie changes. Merchant selection does
  not change customer preference. New anonymous customers receive request locale;
  matching a returning customer's phone alone cannot overwrite their preference.
  This is not cross-device account-profile preference synchronization.
- Unit: 187 passed, 37 environment-gated skipped (not passes). Database: 26 passed
  in 24 files. Full browser suite: 12 passed in five files, 125.78 seconds, completed
  at 12:31 local time. Typecheck and build passed; lint has zero errors and one
  existing login navigation warning. Desktop checks cover 320/390/768/1440 widths.
- New worker regression exercises the public dispatch cycle with mocked persistence
  and provider boundaries: failed English delivery, Vietnamese retry and Chinese
  delivery use the latest recipient preference. It is not real Email/LINE delivery.
- Physical Android CPH2599, Chrome and native Gboard Traditional Chinese Zhuyin:
  ADB taps entered phonetic composition and committed Chinese candidates, without
  paste, DOM fill or injected composition events. Native keyboard opening, closing,
  reopening, reason-field visibility and reachable confirmation were observed.
- Real-phone multi-service/multi-participant booking: reassigned both affected
  secondary staff allocations, pending count 2 -> 1 -> 0. Database readback confirms
  two STAFF_REASSIGNED events, retained primary staff on both segments and unchanged
  total of 200000 minor units. First fixture was cancelled/deactivated after verification.
- Real busy-allocation conflict first exposed an unhelpful generic error. A database
  regression failed before the fix, then passed after mapping only the named staff
  exclusion violation to localized CONFLICT/409. No broad exception bypass was added.
- On the final build, another synthetic phone fixture verified Chinese, English and
  Vietnamese conflict messages, unchanged Chinese reason and replacement selection,
  a visible confirmation button above the native keyboard, and successful retry
  after removing only the fixture conflict. One second-service review remains for
  manual testing; fictional audit history remains intentionally retained.
- Native evidence: `.dev-logs/physical-ime-composing.png`,
  `.dev-logs/physical-final-composition.png`,
  `.dev-logs/physical-vi-error-keyboard.png`, and
  `.dev-logs/physical-phone-readback.json` (first completed fixture).
- Phone fixture lifecycle is guarded to APP_ENV=test and the exact loopback MSI
  database. `phone-fixture` supports prepare/block/unblock/verify/cleanup through
  BEAUTY_PHYSICAL_FIXTURE; no production or real customer data is used.
- Test route: `http://192.168.1.104:3100/merchant/operations?organization=demo&location=taipei`.
  Select the reassignment tab, then the remaining synthetic review. Local owner
  login: `http://192.168.1.104:3100/api/line-booking/integrated-demo?role=owner`.
  Server remains available at the user's request. Real OAuth, provider delivery,
  other handset/IME combinations and Production remain outside this verification.

## 2026-10-21 Site copy and request-local API validation (local only)

Baseline: `e207febf4b9e3b9483761354b863ef45ee7a91a6` plus preserved local work.
Application build: `HYt5J8YPEbQJ0XuT4Ce02`; trial PID 54592 on 0.0.0.0:3100.
LAN health readback: `http://192.168.1.104:3100/api/health` returned `ok`.
No commit, upload, merge, deployment, dependency install or migration.

- Request-local errors resolve the existing language cookie, then Accept-Language,
  then Traditional Chinese. Root merchant/public/auth/admin and mobile error
  boundaries receive the request explicitly. No process-global locale or change
  to status codes, ownership, CSRF, rate limits, domain error identity or validation rules.
- Added public copy for authentication, subscription, catalog/media, booking,
  setup, CRM, notification administration and all audited literal Zod refinements.
  Required/type/format/range/enum/unsupported-field failures retain field paths
  without echoing values or underlying database/provider diagnostics.
- Known public English/Vietnamese errors can be translated again after a language
  change. Applicant validation lists field labels and reasons in a wrapping alert;
  save failure and language refresh preserve the controlled draft. Login email,
  store-code placeholder and pre-verification guidance now use the dictionaries.
- Static coverage scans all active src TSX raw Han copy and literal translation
  calls, public AppError text and schema refinements. It also guards request
  propagation to shared API error helpers. This is not proof for arbitrary dynamic
  data, third-party widgets, external notification templates or the retired apps/web.
- Red/green: three new response tests first failed on Chinese-only output.
  The expanded audit exposed additional missing messages before they were added.
- Final unit run: 163 passed, 36 environment-gated skipped (not counted as passes).
  Database integration: 26 passed in 24 files. Full browser suite: 12 passed in
  five files, 123.60 seconds, starting 11:04:44 local time.
- Browser applicant flow uses real local password login, real invalid saves in
  all three locales (400 BAD_REQUEST with translated desiredSlug issue), language
  changes without another save, unchanged drafts and zero application rows on
  failure, then successful save/reload/submit with version and status readback.
  Existing merchant/staff/platform drafts, scope choices, customer reschedule,
  multi-service/participant reassignment and failure/retry suites also passed.
- 320/390/768/1440 viewport checks passed; applicant-validation-vi screenshots
  under .dev-logs show wrapping field errors and reachable in-flow actions.
  Desktop Edge emulation is not a new physical-phone or native IME verification.
- Build and typecheck passed. Lint: zero errors, one pre-existing login navigation
  warning. No dependency changes; existing Prisma/Vite deprecation notices remain.
- Business names, customer inputs, stored reasons and command enums stay original.
  No real OAuth, Turnstile, notification delivery, payment or Production validation.

## 2026-10-21 Applicant and scope-selector three-language increment (local only)

Baseline: `e207febf4b9e3b9483761354b863ef45ee7a91a6` plus preserved local work.
Application build: `JIuwPqcojCZK_bs4NAtxg`; trial PID 24984 on 0.0.0.0:3100.
LAN health was read back as `ok` at `http://192.168.1.104:3100/api/health`.
No commit, push, merge, deployment, provider call, dependency install or migration.

- Applicant form/status/history and organization/location selectors now use
  Traditional Chinese, English and Vietnamese. Status, industry, role, field,
  save/submit feedback and known applicant errors are localized. Stored names,
  notes, identifiers, industry enums, timestamps and authorized destinations remain unchanged.
- Mobile forms use tighter section spacing, 16px inputs, wrapping action labels
  and safe-area padding. Actions remain in document flow, not over inputs.
  Selector rows wrap long names. Screenshot review caught a vertically squeezed
  Vietnamese logout label at 320px; fixed nonshrinking header controls and added
  a height regression. URL/category/note controls have explicit accessible labels.
- Initial copy guard failed on 29 untranslated applicant literals. Final guard
  covers 21 surfaces plus dynamic applicant states/categories/selection copy.
- The new browser case signs in through the real local password form with a
  unique fictional applicant, edits every field, changes NAIL category, cycles
  three locales, injects save HTTP 503, retries through the real endpoint, reloads
  the saved draft and submits it. Database readback verifies draft text/category,
  no language-triggered writes, one version increment and final SUBMITTED state.
- Temporary organization memberships and a branch exercise two organization choices,
  branch names/role translations, unchanged destinations through language refresh,
  selection of demo/taipei and unknown-organization rejection. Temporary memberships,
  branch and organization are removed; applicant is deactivated and application/audit
  history is retained. Existing tenants, customers and bookings are not reset.

Fresh verification: root lint zero errors (one pre-existing login navigation warning),
typecheck, production-mode build and diff whitespace check passed. Initial build
hit Windows Prisma DLL locking; stopped only the owned trial process, then rebuilt
and restarted without resetting the database. Unit suite: **155 passed / 36 gated
skips**. Database suite: **26 passed in 24 files**. Full UI suite, no name filter:
**12 passed in 5 files**, 09:26:40 start, 117.35 seconds. Output is ignored
`.dev-logs/onboarding-final-ui.log`; skips are not counted as passes.

Screenshots and overflow checks cover 320/390/768/1440 widths for applicant drafts,
submitted status, organization choices and branch choices in Vietnamese, including
long persisted names. Evidence prefixes: `.dev-logs/applicant-*` and
`.dev-logs/scope-*`. These are desktop Edge viewports, not new physical-phone or
native IME evidence. Existing multilingual booking/reassignment and role suites
also passed. OAuth, notification language, cross-device preferences and Production
remain outside this increment. Application approval/provisioning is not rerun here.

AOCI: the initial attestation failed field-format validation. After context refresh,
all 24 chunks / 547 entries were freshly delivered and host-confirmed; the new
attestation passed 10/10 challenges (100% coverage, 90% framework mastery).
The pre-maintenance index is stale for this increment; final alignment requires
the bound source updates and Verify, Check and Guide, not attestation alone.
Formal closing uses Maintain followed by Verify, Check and Guide separately.

Phone trial: sign in at `http://192.168.1.104:3100/?next=/onboarding`, use
`/onboarding/edit` for editable drafts and `/onboarding/status` for submitted state.
Authorized merchants use `/select-organization` and
`/select-location?organization=demo`. Only membership-backed choices appear.

## 2026-10-21 Legacy booking/platform three-language increment (local only)

Baseline: `e207febf4b9e3b9483761354b863ef45ee7a91a6` plus preserved local work.
Final application build: `Fwb7N4nx4U--sGqQ70_2M`; trial PID 38716 on 0.0.0.0:3100.
No commit, push, merge, deployment, provider call, dependency install or migration.

### Delivered scope

- Traditional Chinese, English and Vietnamese now cover the active root legacy
  public booking and tracking pages, platform overview, organization details,
  billing, application review and feature override controls. Retired `apps/web`
  scaffolding is unchanged. Branch OPEN is presented as open for booking, not
  the invoice-specific open-payment status.
- Language refresh preserves selected date/time, anonymous session and hold,
  contact fields, notes and consent; localized announcements derive from current
  state. Billing and entitlement drafts retain user-entered values and errors
  can be redisplayed in the selected language without submitting a command.
- Public availability failures include an explicit retry action. Request IDs use
  the existing random-byte helper so LAN HTTP does not require crypto.randomUUID.
- Narrow platform tables become labelled rows; controls wrap, inputs use mobile
  sizing, and available booking times use a bounded scroll area. Persisted names,
  descriptions, reasons, timezone and currency are not translated or rewritten.

### Fresh verification

- Root lint: zero errors, one pre-existing login navigation warning. Typecheck,
  Prisma/Next production-mode build and `git diff --check`: passed.
- MSI unit suite: 150 passed, 35 gated skips. Local database suite: 26 passed in
  24 files. Skips are not passes.
- Final MSI UI suite: **11 passed in 5 files**, 08:51 run, 115.78 seconds, with
  no test-name filter. Output: ignored `.dev-logs/legacy-final-ui.log`.
- New platform regression visits overview/detail/review in all three languages,
  preserves invoice and feature-override drafts, injects HTTP 409 failures and
  checks unchanged invoice/override counts. It does not issue a real invoice or
  approve an application.
- New public regression uses the real LAN HTTP origin, holds a real local slot,
  preserves contact/consent/date/time across three locales without another hold
  or premature booking, confirms in Vietnamese, reads the persisted booking,
  retries an injected HTTP 503 availability failure, reschedules and cancels.
  Database readback proves old RESCHEDULED state and no remaining confirmed
  booking for its synthetic customer. Cleanup deactivates that customer and
  preserves audited booking history.
- Existing merchant/staff draft, multi-item/multi-provider reassignment,
  conflict/retry, role and mobile booking regressions remain green.
- Checked 320/390/768/1440 viewport widths, document/table overflow and saved
  screenshots. Visually inspected booking/tracking plus platform overview,
  billing, features and 320px organization detail. Artifacts remain under ignored
  `.dev-logs/legacy-*.png` paths and contain fictional data only.

### Limits and remaining work

Initial new tests exposed incorrect Prisma model and ambiguous selectors; those
tests were corrected to the real invoice delegate, scoped main alerts and stable
date attributes. Availability retry accepts a legitimate empty day and searches
another available date instead of assuming every retry must return slots.

This evidence uses desktop Edge with responsive viewports and a local synthetic
database, not a new physical Android/iOS keyboard test or real OAuth, payment,
notification or Production verification. The application-review queue was visited,
but the full approval/provisioning journey was not rerun. Applicant and organization/
location selector screens, account preference sync and notification language remain
follow-up work; full-site localization is not claimed.

Local trial: `http://192.168.1.104:3100/`; booking: `/book/demo/taipei`;
platform: `/admin/organizations` and `/admin/billing` (platform-admin session required).
Owner shortcut: `/api/line-booking/integrated-demo?role=owner`.

## 2026-10-21 Merchant/staff three-language mobile increment (local only)

Baseline: `e207febf4b9e3b9483761354b863ef45ee7a91a6` plus preserved local work.
Final application build: `SruKBIzEtBUDMYvWJdmlQ`; PID 60280 on 0.0.0.0:3100.
No commit, push, merge, deployment, provider call, dependency install or migration.

### Delivered scope

- Added `vi` / `vi-*` detection and Vietnamese manual selection alongside
  Traditional Chinese and English. Explicit browser preference still wins over
  weighted Accept-Language; unsupported languages fall back to Traditional Chinese.
- Migrated merchant workspace navigation, calendar, bookings, catalog, CRM,
  settings/setup, branch/team/subscription/billing views, notifications, operations,
  qualification reassignment, staff calendar, attendance and reception exceptions.
  Known safe operational errors and benefit/commission results use the same dictionaries.
- Business names, customer input, IDs, UTC instants, branch timezone, currency and
  authorization remain unchanged. No customer content goes to a translation service.
- Merchant component identity now depends only on authorized organization, location
  and view. Refreshed server lists update without remounting unsaved forms.
- Mobile operations navigation uses two rows with wrapping labels; staff has a
  compact date selector; month cells have compact counts and full accessible labels.
  Reassignment includes a language selector while retaining its fixed action area.

### Fresh verification

- `npm run lint`: zero errors, one existing internal-navigation warning in login.
- `npm run typecheck` and local Prisma/Next production-mode build: passed.
- MSI unit suite: 142 passed, 33 gated skips; skips are not passes.
- MSI local database suite: 26 passed in 24 files.
- MSI UI suite: 9 passed in 5 files on the final build, including the final CRM
  draft addition (01:00 run, 93.39 seconds). Covers:
  - SSR/device Vietnamese, explicit persistence/reload, auto reset and failed-save
    recovery; origin and strict-body rejection remain enforced.
  - Three-language round trips preserve service/staff/resource creation, brand
    settings, new customer name/phone/birthday/tag, operating-policy drafts and
    staff selected date. A concurrent resource-list insert appears after refresh
    without erasing the open resource form; that fixture is deleted afterward.
  - Precise bundle reassignment preserves target, reason and unrelated arrangements
    through all three locales before and after a real conflict; retry succeeds
    with database allocation, booking version and financial snapshot checks.
  - Customer reschedule loading failure/empty/malformed/network/timeout/stale
    responses, retry, English confirmation/cancellation and database readback.
  - Paid-blacklist negative/positive flows, role isolation, responsive widths
    320/390/768/1440 and simulated keyboard viewport/hit-target checks.
- LAN browser owner/staff entry at `192.168.1.104:3100` detected Vietnamese and
  had no horizontal overflow at 390px. LAN database-backed health returned ok.
- Inspected reassignment Vietnamese error/retained-arrangement screenshot and
  merchant service, owner operations and staff viewport screenshots under
  `.dev-logs/`; these are ignored local artifacts.

### Defects caught and limits

The first UI regression could not match the status selector's label after text
wrapping; an explicit localized accessible name was added. The next run exposed
a real mobile focus/blur layout shift: the navigation changed from fixed to normal
flow, moving the clicked disclosure or button before activation. Focus now hides
the still-fixed navigation without reflow. Regression checks stable field bounds,
first-click disclosure opening and real customer-status commands.

This is browser/viewport and local synthetic-database evidence, not a new physical
Android/iOS keyboard test or real Google/LINE, billing, notification or Production
verification. Full-site translation is not claimed: legacy public booking/manage,
merchant application and some platform-admin/selector screens remain unmigrated.
Account preference sync, notification language and a complete stable API error-code
catalog remain follow-up work. Browser preference can persist across account logout.

Local trial remains running:
- Merchant: `http://192.168.1.104:3100/api/line-booking/integrated-demo?role=owner`
- Staff: `http://192.168.1.104:3100/api/line-booking/integrated-demo?role=beautician`
- Reassignment: `/merchant/operations?organization=demo&location=taipei`
  then choose the reassignment workspace. Desktop staff route: `/staff/taipei`.

## 2026-10-20 Language selection and mobile continuation (local only)

Baseline: `e207febf4b9e3b9483761354b863ef45ee7a91a6` plus preserved local changes.
Final application build: `uiiW6F_1yTv8Zl5IzhlCn`; local process 51816 on port 3100.
No commit, push, merge, deployment, dependency install or schema migration.

### Implemented scope

- Server-selected `zh-TW` / `en`: explicit browser cookie, then quality-ranked
  Accept-Language, then Traditional Chinese. Manual override, persistent reload,
  and follow-device reset share one selector, including inside reschedule.
- Local typed dictionaries cover login, common logout/dialog controls, mobile
  customer booking/reschedule/member presentation and platform plans/navigation.
  Other merchant/staff, legacy public booking and platform admin screens still
  need migration. This is not a claim of site-wide bilingual completion.
- Preferences are browser-local, not account-synchronized. Customer notification
  language, tenant authorization, business names, UTC instants, branch timezone
  and currency are unchanged. No customer data reaches translation providers.
- Mobile login collapses LINE staff sign-in; platform navigation exposes all
  four entries; plans use labelled two-column rows below desktop widths.

### Current verification

- `npm run typecheck` and the local Prisma/Next production-mode build: passed.
- `npm run lint`: no errors; the existing LINE OAuth full-navigation warning
  remains in login-form.tsx.
- `node scripts/msi-local.mjs unit <local credential file>`: 129 passed,
  32 skipped. Gated suites are not counted as passes.
- `node scripts/msi-local.mjs test <local credential file>`: 26 passed in 24 files.
- `node scripts/msi-local.mjs ui <local credential file>` with LAN host:
  8 passed in 5 files on the final build, including:
  - English/Taiwanese/unsupported browser preference and matching SSR HTML lang;
    manual persistence, reset, unknown/foreign-origin preference rejection.
  - Failed preference save retains old language and can retry; login email
    draft and booking name/phone survive live language changes.
  - Reschedule loading failure/empty/malformed/network/timeout/stale responses;
    failed submit retains date/time; changing language translates the visible
    error without clearing those selections.
  - Real English confirmation marks original RESCHEDULED and creates a
    CONFIRMED replacement with identical service/staff; cancellation persists;
    English membership balance is readable afterward.
  - Existing synthetic roles, paid blacklist guards, multi-item/multi-person
    reassignment and responsive viewport checks still pass.
- Screenshots inspected: `.dev-logs/reschedule-english-390.png`,
  `.dev-logs/plans-english-390.png`, `.dev-logs/login-locale-en-US-390.png`.
  Width tests cover 320/390/768/1440; the reschedule compact-height case remains.
- Loopback and LAN `/api/health` return ok. LAN browser customer entry passes.

### Test issue and remaining boundaries

The first UI run timed out waiting for an alternative slot on the original
booking date; its exact response was not captured, so capacity exhaustion is not
a proven root cause. The regression had assumed the original date retained
capacity. It now queries and asserts successful real availability for a later
replacement date rather than relying on that assumption or faking successful
capacity. Subsequent complete UI runs passed.

Browser/viewport evidence does not prove native Android Zhuyin, iOS keyboard,
real Google/LINE OAuth, notifications, billing or Production. No physical phone
keyboard test was run for this increment. Account language synchronization,
all-page translation, complete API error-code dictionaries and notification
localization remain explicitly unimplemented.

Local trial: `http://192.168.1.104:3100/`; customer shortcut:
`/api/line-booking/integrated-demo?role=customer`. Server and existing test
database are retained at the user's request; credentials were not recorded.

## 2026-10-20 Reschedule recovery and mobile entitlements (local only)

Baseline: `e207febf4b9e3b9483761354b863ef45ee7a91a6` plus existing and current
uncommitted local changes. Local build ID: `EnEWX4xMh9Tuu1UPgh-Sj`.
No push, merge, deployment, Production mutation or live provider operation.
The retained root Next application uses npm; legacy pnpm workspaces are separate.

### Changes and observed defects

- Customer LINE booking reschedule now distinguishes loading, empty availability
  and load failure. HTTP failure, malformed successful payload, network failure
  and a 15-second timeout show a Traditional Chinese retry action.
- A changed date clears the old selection; aborted/superseded requests cannot
  replace the latest date's slots. Failed submission preserves the draft and
  shows the error inside the dialog. Successful submission closes before refresh.
- Mobile rescheduling uses a bottom sheet with original booking context,
  independently scrolling content and persistent selection/actions. Testing
  reproduced an offscreen Tailwind translate and transient resize overflow;
  responsive translate utilities and disabled geometry transitions fixed both.
- Shared dialog close labels, platform subscription/override states and feature
  names use Traditional Chinese. Entitlement rows stack label/value information
  on narrow screens instead of requiring a wide table.
- Language detection is a documented proposal, not an enabled partial
  translation feature. Commercial references, adoption decisions and remaining
  page/error gaps are in `docs/product/booking-platform-improvement-plan.md`.

### Fresh validation

| Check | Result |
| --- | --- |
| `npm run typecheck` | Passed |
| `npm run lint` | 0 errors; one existing internal-navigation warning at `src/components/login-form.tsx:221` |
| Isolated local build via `scripts/msi-local.mjs build` | Passed with the build ID above |
| Local unit selection | 115 passed, 31 skipped; skips are not passes |
| Database integration selection | 26 passed in 24 files |
| Local browser selection | 7 passed in 4 files; final run began 22:53:46 and took 62.50 seconds |
| LAN `/api/health` at `192.168.1.104:3100` | Live database-backed response `{"status":"ok"}` |

The browser regression creates a synthetic deposit-exempt customer, confirms a
real booking, exercises failed availability/retry and failed submission/retry,
then submits an actual successful reschedule (HTTP 200). Database readback
asserts the original is `RESCHEDULED`, the replacement is `CONFIRMED` and keeps
the same service variant and assigned staff. Cancelling the replacement ends in
`CANCELLED`. An earlier pending-payment fixture correctly received HTTP 409;
the fixture was corrected without weakening the unpaid-confirmed eligibility rule.

Availability failures (503, malformed JSON shape, aborted connection, delayed
request timeout), stale-response ordering and submission conflict are injected
browser responses. Successful creation/reschedule/cancellation use the real
local backend and database. Platform entitlement revocation failure is a network
abort: the Chinese error is visible and the override remains unrevoked in the DB;
the temporary test override is removed in cleanup.

Viewport checks cover 320, 390, 768 and 1440 CSS pixels, action containment/hit
testing, horizontal overflow, Escape/focus return and a 390x480 compact height.
Screenshots remain under ignored `.dev-logs/`, including
`reschedule-load-error-390.png`, `reschedule-compact-390.png`,
`reschedule-retry-1440.png` and `platform-entitlements-390.png`.
These are browser viewport checks, not new physical Android/iOS keyboard proof.
The October 19 physical Zhuyin evidence applies to its tested reassignment
surface only; this new customer reschedule sheet still needs native-device QA.

### Local trial and remaining scope

The server remains available on `0.0.0.0:3100`. Same-network synthetic entries:

- Customer: `http://192.168.1.104:3100/api/line-booking/integrated-demo?role=customer`
- Owner: `http://192.168.1.104:3100/api/line-booking/integrated-demo?role=owner`

Customer path: My bookings / `我的預約` -> an eligible confirmed unpaid booking
-> `改期` -> date/time -> `確認改期`. Synthetic role entry is not real LINE OAuth.
Public `/book` and LINE `/line-booking` are distinct UI surfaces; this increment
does not claim every screen is fully localized or every operational flow covered.
No schema, RLS, entitlement authorization or payment eligibility changes were made
in this increment. Native keyboard QA, full dictionary extraction and remaining
admin/operations page improvements remain follow-up work.

## 2026-10-19 Traditional Chinese member/mobile continuation (local only)

Baseline: `e207febf4b9e3b9483761354b863ef45ee7a91a6` plus uncommitted local
changes. This section supersedes earlier English-keyboard-only and untranslated
benefit/error limitations for the surfaces below. No push, merge, deployment,
Production data change or live provider operation was performed.

Scope: customer member summary, employee attendance, receptionist exception
review, mobile booking shell, merchant benefit presentation and shared HTTP
error presentation. This is an incremental app-style improvement, not a claim
that every platform page or commercial workflow has been redesigned.

| Check | Result | Evidence |
| --- | --- | --- |
| Root lint / typecheck | Passed with existing warning | Zero lint errors; existing login-form internal navigation warning remains; typecheck passed |
| Unit suite | 115 passed, 29 skipped | 35 passed files / 27 skipped files; newly included TSX tests exercise money, expiry, malformed results and localized errors; skips are opt-in DB/UI cases, not passes |
| Database integration | 26 passed in 24 files | Synthetic loopback database `beauty_msi_20261009`; real tenant/branch, booking, ledger and attendance regressions |
| Browser suite | 6 passed in 4 files | Final rebuilt candidate: role entry, booking/cancellation, precise reassignment, owner operations, member/attendance/exception recovery |
| Build | Passed locally | Next build generated 60 pages; restarted latest candidate on `0.0.0.0:3100`, PID 32416 at validation time |
| Error presentation | Passed within tested boundary | Shared AppError public text and Zod issues are Traditional Chinese; internal messages/status classification remain stable; unknown errors do not expose SQL/secret details; legacy mobile string envelope retained |
| Member UI | Passed | Structured principal/bonus/total, remaining quantity, expiry in branch timezone, empty/expired states and collapsed identifiers replace raw JSON; initial GET failure and retry tested |
| Nonzero member visual fixture | Passed, mocked response | 12345 paid + 1000 bonus minor units renders $133.45; package 3/5 and Taipei midnight expiry checked at 360/390/768/1280px; not a real top-up or benefit issue |
| Merchant benefits | Passed | Real local customer balance read; failed read clears stale result; retry restores structured result; consent/status and less-used mutations collapsed |
| Attendance / exception recovery | Passed within tested scope | Attendance initial failure then actual retry; reception inline reason retained after aborted request; acknowledgement success UI uses a mocked queue response, while real service review is covered by DB integration |
| Physical Android Zhuyin | Passed | Native Zhuyin key taps and candidate selection entered Chinese test text; no DOM fill or synthetic text insertion; keyboard open, close and reopen preserve the reason |
| Keyboard action reachability | Passed | Visual viewport 428.33px open versus 712.33px closed; confirm button 344.33-388.33px, 44px high with 40px keyboard gap; hit-test true; reason field remains visible |
| Real failure and retry on phone | Passed | Unavailable replacement returns actual HTTP 409 with Chinese message; reason and DB state retained; selecting available replacement and confirming with keyboard open returns actual 200 |
| Multi-item / multi-person preservation | Passed | Failed DB snapshot unchanged; successful booking version 2 to 3; only selected shoulder-service primary staff changed; other facial service, collaborator, resource allocations and financial amounts unchanged; Chinese reason persisted in booking event |
| Visual review | Passed for sampled surfaces | Opened member mobile/tablet, attendance, merchant benefits and desktop booking screenshots; scoped app-mode Taste lint: 0 failures/0 warnings. Inspector: 0 failures, desktop unused-canvas warning reviewed as intentional centered content width |
| Initial test failures | Fixed and rerun | Synthetic receptionist shortcut corrected; attendance heading locator constrained to section heading after dynamic page title introduced; final browser suite passed without weakening workflow assertions |

Ignored local evidence: `.dev-logs/zhuyin-results.json`, `zhuyin-before.json`,
`zhuyin-after.json`, `zhuyin-keyboard-open.png`, `zhuyin-keyboard-closed.png`,
`zhuyin-failed.png`, `zhuyin-retry-keyboard.png`, `zhuyin-success.png`,
`member-app-*.png`, `attendance-app-360.png`, `merchant-benefits-mobile.png`,
and `.dev-logs/taste-mobile/after/`. Gboard commits generated DOM input events;
composition events were not observed and are not claimed as tested.

LAN trial remains available at `http://192.168.1.104:3100` using
`/api/line-booking/integrated-demo?role=owner` or `?role=customer` (also
`beautician` and `receptionist`). Owner reassignment lives at
`/merchant/operations?organization=demo&location=taipei`, then `預約改派`.
These are synthetic role shortcuts, not Google/LINE OAuth validation.

Not covered: iOS keyboard, every Android IME, real payment/benefit issuance,
legal payroll, provider notifications, fresh migration rehearsal or Production.
Names, identifiers and user-entered content are not translated. Existing local
test data is retained; no database reset was performed.

## 2026-10-19 mobile operations and physical Android QA (local only)

Baseline: `e207febf4b9e3b9483761354b863ef45ee7a91a6` plus the local UI and
regression-test changes. No commit, push, merge, deployment or provider write.
The existing synthetic database and LAN server remain available for user testing.

Scope: the six merchant operations workspaces, their static Traditional Chinese
labels, mobile bottom navigation, labelled mobile table rows, progressive forms,
formatted payroll/allocation previews and the focused reassignment dialog.
This is not a completed platform-wide redesign. Names and user-entered data are
not translated. Raw benefit diagnostic results remain in a collapsed disclosure;
some server-originated errors still need a comprehensive localization pass.

| Check | Result | Evidence |
| --- | --- | --- |
| Root gates | Passed with existing warning | npm lint: 0 errors / 1 existing login-navigation warning; typecheck; production-mode local build, 60 generated pages |
| Unit regression | Passed subset | 104 passed / 29 skipped; 33 passed files / 27 skipped files; integration gates are not counted as passes |
| Browser regression | Passed | Final local UI run at 21:49: 5 tests / 4 files, including role/LAN, customer, operations, precise reassignment and real failure/retry |
| Responsive operations | Passed | Six tabs at 360, 390, 768 and 1280px; one visible workspace, no horizontal overflow; screenshots inspected at mobile and desktop widths |
| Physical pre-redesign flows | Passed within tested scope | Android CPH2599, Android 16, Chrome 155: A secondary and B primary 11:00 segment each returned real 409 then 200; native selection, keyboard close/reopen and retained drafts; database preservation assertions |
| Physical keyboard defect | Reproduced and repaired | Previous footer touched the IME boundary; mobile keyboard-open footer now reserves 40 CSS px, with a regression requiring at least 32px |
| New UI physical retry | Passed | A secondary 13:00 segment: real 409 for time-off staff, reason preserved, native Android picker selects available replacement, confirmation while English QWERTY keyboard is open returns 200 |
| New UI keyboard visibility | Passed for tested keyboard | Actual IME shown; visual viewport 457.33px; textarea and both buttons hit-testable; action bottom 417.33px; closing/reopening preserves draft; OS screenshots inspected |
| New UI persistence | Passed | A version 2 to 3; exactly one participant replaced; all service segments, other participants, resource allocations and financial/policy snapshots unchanged; reload removes resolved item |
| Remaining device coverage | Not run | New-version Zhuyin keyboard, iOS and landscape; full financial mutation and every platform page are outside this UI pass |
| Production | Not performed | Local-only user instruction remains in force |

Local artifacts (ignored, synthetic data only):
`.dev-logs/mobile-device-qa-20261019-new-ui-results.json`,
`.dev-logs/mobile-device-qa-20261019-new-ui-after.json`,
`.dev-logs/android-app-keyboard-fixed.png`,
`.dev-logs/android-app-retry-keyboard.png`,
`.dev-logs/android-app-reassignment-success.png`,
`.dev-logs/operations-app-{360,390,768,1280}.png`.

Phone entry: `http://192.168.1.104:3100/merchant/operations?organization=demo&location=taipei`.
If the synthetic session expires, open
`http://192.168.1.104:3100/api/line-booking/integrated-demo?role=owner`.
Select `預約改派`, then `實機1019 B 主責改派｜肩頸舒壓`
(2026-10-22 13:00). This remaining case is deliberately preserved for manual QA:
select `實機1019｜休假替補`, enter a reason, open/close the keyboard, and confirm
the rejection preserves the draft. Select `實機1019｜可用替補` and retry only
when ready to consume the fixture. The 11:00 service and its participants must
remain unchanged. Local shortcuts are not real OAuth or production credentials.

## 2026-10-18 keyboard-safe focused reassignment (PR #2 candidate)

Baseline: `13446ab74dac498d5e78edd509a34cef2b18316a` plus the preceding
focused-dialog increment and this keyboard fix. Delivery is limited to PR #2;
no merge, deployment, schema change or external provider mutation is authorized.

The dialog now follows VisualViewport height, width and offsets, with a window
size fallback. It binds listeners after the Radix portal actually mounts and
cleans them up on close. After resize/focus it scrolls only the dialog body to
reveal the active field. Geometry transitions are disabled only on this dialog:
the inherited 100ms transition otherwise made the scroll calculation use an
intermediate height. Shared dialog behavior is unchanged.

| Check | Result | Evidence |
| --- | --- | --- |
| Reproduction | Failed before fix | VisualViewport-only resize left the footer below the keyboard; the first implementation also missed delayed portal mounting and then read transitioning geometry |
| Keyboard regression | Passed | Layout viewport stays 320x640 / 390x844 while synthetic VisualViewport shrinks to 320-420px and pans 0-96px; active textarea/select and confirm are within bounds, unclipped and hit-testable |
| Lifecycle and recovery | Passed | Keyboard expand/collapse, focused field switch, close/reopen with already-reduced viewport, localized real 409 with retained draft, retry PATCH 200 and remaining-item refresh |
| Responsive regression | Passed | 320x640, 390x844, 390x420, 768x900 and 1440x900; no horizontal overflow; confirm stays in bounds |
| Root gates | Passed | Lint 0 errors / 1 preexisting login-navigation warning; typecheck; final production-mode local build; 104 unit passes, 29 integration-gated skips |
| Database regression | Passed | 26 tests / 24 files; exact primary/secondary participant, service/resource, financial snapshot, tenant/branch and version preservation |
| Browser regression | Passed | 5 tests / 4 files, final run 18:10 local time; customer, four roles/LAN, operations and both reassignment cases |
| LAN inspection | Passed locally | Host browser via 192.168.1.104:3100; synthetic keyboard geometry, Chinese manual fixture, cancel without submission |
| Release guard | Checked before push | PR #2 OPEN at baseline; Vercel project has no Git link, GitHub deployment list/hooks empty and inspected workflows perform checks only; no provider configuration changed |
| Physical device | Not run | VisualViewport is simulated in real Edge, not an actual iOS/Android keyboard or native selection sheet; physical-device acceptance remains separate |

Evidence screenshots are ignored local artifacts:
`.dev-logs/reassignment-keyboard-<height>-<offset>.png` and
`.dev-logs/keyboard-final-lan-390.png`. The area outside the simulated visual
viewport is still captured; it is not a rendered OS keyboard.
The existing local server and manual fixtures remain available for phone testing.

## 2026-10-18 focused mobile reassignment (local only)

Baseline: `13446ab74dac498d5e78edd509a34cef2b18316a` plus this uncommitted
local increment. No commit, push, merge, deployment or provider write.
The existing isolated `beauty_msi_20261009` database was preserved.

Selecting a review item opens the existing Radix dialog: full viewport on
phones and a centered two-column layout on desktop. Replacement and reason
are adjacent to retained arrangements; actions remain outside the scrollable
body. Cancel/Escape returns focus without writing. Failed commands retain input;
successful commands close the dialog before refreshing the versioned worklist.
Shared page heading, branch display, reassignment/manual controls and domain
errors are Traditional Chinese. Other operations modules are outside this
localization scope; this is not a platform-wide translation claim.

| Check | Result | Evidence |
| --- | --- | --- |
| Root gates | Passed | Lint 0 errors / 1 preexisting login-navigation warning; npm typecheck; isolated production-mode build; 104 unit passes, 29 environment-gated skips |
| Database regression | Passed | 26 tests / 24 files; primary/secondary multi-service preservation, qualification, capacity, tenant/branch and stale-version cases |
| Browser regression | Passed | 5 tests / 4 files, final run 16:55 local time; customer flow, four roles, operations, single and bundled reassignment |
| Focused dialog | Passed | Cancel preserves DB snapshot and returns focus; reopening clears draft; Escape closes; real off-shift 409 retains target/reason and localized error; retry persists and refreshes remaining work |
| Responsive geometry | Passed | 320x640, 390x844, 390x420, 768x900, 1440x900; no horizontal overflow and complete confirm button within viewport; short-height case simulates reduced space, not a physical phone keyboard |
| Harness corrections | Resolved | Initial geometry assertion ran during opening animation; wait for animation completion. Initial remaining-item assertion ran during refresh; wait for the actual remaining item. Neither correction weakens layout or data assertions |
| LAN manual entry | Passed locally | 192.168.1.104:3100 owner shortcut, focused dialog and cancel; four manual review items remain for October 19/20; no manual test booking submitted |
| Preserved user fixtures | Passed | Two synthetic bookings with two services/two providers each remain available. Automated bundle fixtures are cancelled and released separately |
| Release/provider/device | Not performed | No remote changes, real OAuth, notifications, payment or physical-phone testing |

Screenshots: ignored `.dev-logs/bundle-reassignment-<width>-<height>.png`
and viewport-only `.dev-logs/focused-reassignment-final-390.png`.
The server remains running on 0.0.0.0:3100 at the user's request.

## 2026-10-18 multi-service and multi-provider reassignment

Baseline: `dcbd7913b766f5ea3ecd7c5d4436b901406138f5` plus this increment.
This supersedes the multi-service restriction in the preceding increment below.
Only the isolated loopback `beauty_msi_20261009` database and local Edge were used.

Entry: merchant operations -> booking reassignment -> qualification review.
Each affected blocking staff allocation now has its own review item, including
secondary providers. The merchant confirms one service/participant at a time;
the booking version must be refreshed before processing another affected item.
Confirmation displays the selected replacement and retained arrangements, excludes
existing participants from the target selector, and focuses the selector on entry.

| Check | Result | Evidence |
| --- | --- | --- |
| Before-fix reproduction | Failed as expected | Two expired secondary-provider assignments were absent from the worklist (expected 2, received 0) |
| Precise replacement | Passed | Two services with two providers each; replacing one secondary provider preserves both segment snapshots and every other staff allocation, including IDs and buffered intervals |
| Financial/resource preservation | Passed | Two actual resource allocations, prices, discount, deposit and policy snapshot compare equal before/after reassignment |
| Primary replacement | Passed | Only the selected service's primary identity/name changes; other service and secondary-provider allocations remain unchanged |
| Sequential changes | Passed | Same replacement provider can take both non-overlapping services; one remaining review after first confirmation, none after second, two distinct outbox events |
| Authorization and selection | Passed | Provider, foreign tenant and branch rejected; missing version, ambiguous legacy command, mismatched segment/allocation and already-participating target rejected without mutation |
| Failure and concurrency | Passed | Actual GiST occupancy collision rolls back allocation and event writes; off-shift and unqualified replacements rejected; stale confirmation rejected; existing same-version race retains one winner |
| Dispatch accounting | Passed | An IMMEDIATE claim for the other service/provider receives no compensation or reassignment events; existing owner-only and one-time dispatch tests still pass |
| Local UI | Passed | 5 tests across 4 files, final run 16:22 local time; actual PATCH conflict retains data/form, retry succeeds, remaining service stays queued; customer, operations and four-role/LAN regressions pass |
| Responsive inspection | Passed | Edge screenshots manually inspected at 390px and 1440px; no horizontal overflow or page errors; full-page screenshot waits for paint after scrolling controls into view |
| Local DB suite | Passed | 26 tests / 24 files; multi-service scenarios also rerun in final browser suite against the live local server |
| Root gates | Passed | Lint 0 errors / 1 preexisting login-navigation warning; typecheck; production build; 104 unit tests passed / 29 gated tests skipped; npm audit 0 vulnerabilities |
| Schema/RLS | Not changed | No migration, policy, grant or table changes; tenant/branch tests exercise scoped service queries, not a new local pgTAP run |
| Release boundary | Held | PR #2 only, no merge/deploy or provider writes; Vercel Git link readback remains null before push |

Ignored evidence: `.dev-logs/multi-*.log` and `bundle-reassignment-{390,1440}.png`.
Synthetic bookings are cancelled and their allocations released after each new
bundle test; synthetic staff/resources are deactivated, preserving audit history.
Legacy manual lookup remains a single-service/single-provider compatibility path.
Missing allocation links fail closed; immediate dispatch retains its existing
one-time owner override policy. No physical-phone, live provider, notification
delivery or Production verification is claimed. AOCI closing and pushed-revision
CI readbacks are recorded separately on PR #2 after files stabilize.

## 2026-10-18 qualification-change review and confirmed reassignment

Baseline: `cc97237046386c49034536d83ca19d245adf0841` plus this PR increment.
Only the synthetic loopback `beauty_msi_20261009` database was used. This
section supersedes the qualification-review follow-up in the older sections.

Merchant entry: operations workspace -> booking reassignment -> qualification
review. Saving qualification terms returns the affected pending count in the
same transaction. The worklist is derived from persisted qualification events,
current terms and future unstarted CONFIRMED/PENDING_PAYMENT bookings; it is
not a separate task table. Opening or refreshing the view recomputes the list,
including after concurrent confirmations. Nothing automatically cancels a
booking or chooses a replacement. The merchant selects a target and reason,
then explicitly confirms; the server rechecks qualification, shift and capacity.

| Check | Result | Evidence |
| --- | --- | --- |
| Qualification boundaries | Passed | Effective-from after service start and effective-until equal to start create pending items; until one millisecond after start remains valid; repeated changes produce one item per affected segment |
| Existing booking preservation | Passed | Qualification changes leave original assignment/capacity unchanged; online and walk-in intake flags alone do not invalidate existing appointments |
| Worklist lifecycle | Passed | Qualification restoration, cancellation and successful reassignment remove the item on requery; cancellation and pagination fixtures roll back |
| Scope and authorization | Passed | Provider denied; foreign tenant/branch list excludes the booking; wrong-branch qualification mutation rejected |
| Concurrent confirmation | Passed | Two commands with the same expected booking version yield one success and one 409; repeated stale confirmation rejected; exactly one replacement blocking allocation and one outbox event |
| Failed reassignment | Passed | Target time off returns 409 while original assignment and pending item remain; stale version does not mutate booking |
| Bounded pagination | Passed | 52+ synthetic segments span 50-row pages with stable ordering and no duplicate IDs; empty out-of-range page preserves total; multi-segment items are flagged for individual handling |
| HTTP and browser workflow | Passed | Actual authenticated capability PATCH returns pending count; Edge 390x844 opens worklist, selects replacement, confirms PATCH, observes success and removed item, then reloads and verifies persistence; no page errors or horizontal overflow |
| Full local DB regression | Passed | 25 tests / 24 files, final run at 15:15 local time; includes paid CRM, identity, tenant, booking, member and payroll regressions |
| Full local UI regression | Passed | 4/4 suites, final run at 15:16 local time; customer booking/cancellation, four-role routing, operations and the new qualification-review workflow; role suite also checks private-LAN entry at 192.168.1.104 |
| Root quality gates | Passed | Lint: 0 errors, 1 preexisting login-navigation warning; typecheck; local production build; source readiness; root unit suite 104 passed / 28 gated tests skipped |
| Dependency audit | Passed | npm audit --audit-level moderate: 0 vulnerabilities, no exceptions |
| Resolved test/tool failures | Resolved | Initial missing-module red test; invalid pagination-fixture duration corrected without weakening DB constraints; premature UI run retried after server health; Windows Prisma DLL lock resolved by serializing DB tests and build |
| Schema/RLS change | Not applicable | No schema, policy, grant or migration changed; no new local pgTAP claim. Existing migration CI remains a separate pushed-revision gate |
| Release boundary | Held | PR #2 update only; no merge or deployment, no provider writes or money movement |

Local screenshots/logs remain ignored under `.dev-logs/qualification-*`.
Test-runner failure output now redacts synthetic session/CSRF cookies and
authorization headers in addition to database credentials.

Limits: qualification is evaluated at service start, consistent with the booking
engine. Multi-service or multi-provider bookings are visible but retain the
existing individual-handling restriction. No background push notification,
physical-phone test, real OAuth, external delivery or Production verification
is claimed by this increment. The legacy manual booking lookup remains available
under a collapsed section. CI readback and AOCI closing are recorded separately
on the PR after the source becomes stable.

## 2026-10-18 paid CRM and staff-read security regression

Baseline: `7a725cda196c0f86924840687f6f7ea7ef813e2b` plus the security changes
in this PR update. Tests used only `beauty_msi_20261009` on loopback PostgreSQL,
Node 24.18.0, and local Edge; no provider or Production writes were performed.

| Check | Result | Evidence |
| --- | --- | --- |
| Before-fix reproduction | Failed as expected | 5/9 focused assertions failed; DB regressions reproduced a disabled-CRM status write returning 200 and an unlinked own-read context returning branch bookings |
| Blacklist add-on enforcement | Passed | Status service requires CUSTOMER_BLACKLIST for both enable and clear, matching the existing customer-edit policy; DENY returns 403 for organization/location scopes with no events or success audit; ALLOW permits mutation and eligibility readback |
| CRM activation enforcement | Passed | Disabled CRM rejects status writes, including VIP, and marketing-consent reads through real authenticated route handlers; VIP does not require the blacklist add-on |
| Staff read confinement | Passed | Unlinked own-read context fails 403 before business queries; linked reads constrain organization, location and assigned staff, including the returned segment; owner-wide reads remain valid |
| Focused unit regressions | Passed | 11 assertions across customer-status.test.ts and merchant/data.test.ts |
| Root quality gates | Passed | Lint: 0 errors, 1 preexisting login navigation warning; typecheck; local production build; source readiness check |
| Unit suite | Passed subset | 104 passed, 28 intentionally gated integration/UI tests skipped; skips are not passes |
| Database suite | Passed | 25 tests in 24 files, including new paid-feature HTTP cases, disabled-module reads/writes and staff data readback |
| Browser suite | Passed | 3/3 actual Edge suites: customer booking/reselection/cancellation, role routing and operations; 390px blacklist deny/allow/clear and VIP controls with database readback; LAN address 192.168.1.104 |
| Browser test correction | Resolved | Initial new status test used an exact label that included nested select-option text; corrected the locator to the existing accessible label, then all browser suites passed; no application bypass or timeout increase |
| Dependency audit | Passed | npm audit --audit-level moderate: 0 vulnerabilities; no audit exceptions |
| Schema/RLS change | Not applicable to this increment | No migration, grant or RLS policy changed; the earlier fresh-Supabase 29/29 result below is historical, not a new local run |
| Release boundary | Held | Update PR #2 only; no merge or deployment. CI results are recorded on the pushed revision, separately from these local results |

Paid-feature failure leaves existing blacklist rules effective; this change does
not silently remove restrictions on subscription loss. Clearing a blacklist
continues to require the add-on, consistent with the existing customer-edit API.
Subscription-loss remediation policy remains a product decision, not an implied
free bypass. Module gates and paid entitlements do not replace role or tenant checks.

Remaining follow-up: staff qualification changes still do not automatically
queue or reassign affected future bookings. That workflow gap is not fixed by
this authorization patch; existing manual future-booking review/reassignment
remains separate. Real Google/LINE OAuth, notification delivery, settlement,
physical-phone operation, and every commercial endpoint are not certified by
these synthetic tests. The legacy pnpm workspace is outside the root runtime.

## 2026-10-18 resumed database and browser QA

Revision: `7a725cda196c0f86924840687f6f7ea7ef813e2b`. These results supersede
the Docker-blocked row below. Only the synthetic loopback database
`beauty_msi_20261009` was changed; no Production database or provider was used.

| Check | Result | Evidence |
| --- | --- | --- |
| Fresh Supabase CI | Passed | Run 39086798491: migrations, 29/29 pgTAP assertions and database lint; CI 39086798507 and Security 39086798500 also passed on this revision |
| Local FORCE RLS migration | Passed | Applied `20261018010000_force_application_rls.sql` transactionally to the synthetic clone; public tables lacking FORCE RLS decreased from 36 to 0 |
| DB regression after migration | Passed | `msi-local.mjs test`: 25 tests in 24 files; tenant/branch boundaries, identity proof, booking concurrency, member ledger, attendance and payroll invariants |
| Browser regression after migration | Passed | `msi-local.mjs ui`: 3 tests in 3 files using actual Edge and synthetic authenticated identities |
| Customer flow | Passed within tested scope | Service/staff/date/time selection and reselection, required contact validation, confirmation with DB readback, cancellation with DB readback; reschedule dialog focus/Escape checked, reschedule submission covered by integration rather than browser |
| Staff and receptionist | Passed within tested scope | Assigned agenda entry, role-specific attendance visibility, no customer booking panel leakage, independent browser contexts |
| Owner operations | Passed within tested scope | One visible workspace, tab switching, walk-in timing save/readback, consent-history and benefit-rule reads, scoped attendance CSV |
| Responsive and LAN | Passed in browser | Widths 360/390/430/768/1280; no horizontal overflow or page errors in role cases. Final three-suite rerun used current LAN address `192.168.1.104:3100`; actual physical phone not tested |
| Visual inspection | Passed for sampled screens | Booking confirmation and owner operations screenshots at 390px show readable content without overlap; artifacts remain ignored under `.dev-logs/` |
| AOCI complete delivery | Passed | User-approved 4000-token setting; latest complete transport before final maintenance: 21/21 chunks, 483/483 entries, Challenge 10/10, no truncation. Transport verification and final governance alignment are separate evidence |
| AOCI maintenance and closing | Passed | All 203 original candidates applied; 13 selected entry refinements completed. Final Code volume: 528 entries; missing/stale/unbaselined/orphan 0; Verify and Check aligned; Guide complete=true, next_action=none. Two oversized PNG assets are technical skips; no Database volume is configured |
| Test resource cleanup | Passed | Beauty Next listener stopped; `line-booking-test-20261004` stopped with database and volume retained. Shared Docker Desktop remains available for another project's active test container |
| Merge, deployment and live provider verification | Not performed | PR #2 remains held. Real Google/LINE sign-in, notification delivery, payment settlement and physical-device testing are not established by synthetic QA |

No new runtime defect was reproduced in this continuation. These selected
regressions do not certify every commercial feature or authorize release.

Source-review follow-ups, not verified exploits: the newer customer-status
service does not resolve the paid blacklist entitlement; staff capability
changes do not automatically queue affected future bookings; merchant own-booking
filtering relies on callers establishing a linked staff profile. These need
focused negative tests before broader feature activation. Current evidence
does not claim every commercial endpoint is fully secured.

PR #2 readback remains OPEN/draft at the revision above, with CI, Security and
Database Migration Check successful. This documentation/index continuation is
kept local; a PR comment records the result without triggering new push CI.

## 2026-10-18 dependency security candidate

Baseline: `ace1785` plus this security change. Scope: root npm application on
Node 24.18.0 / npm 11.16.0. PR #2 update is authorized; merge and Production
deployment are held by the user's subsequent instruction.

| Check | Result | Evidence |
| --- | --- | --- |
| Clean install | Passed | `npm ci --no-audit --no-fund`, Prisma generation; initial Windows native-file lock resolved by stopping the test process before reinstalling |
| Full dependency audit | Passed | `npm audit --audit-level moderate`: 0 vulnerabilities, including dev dependencies; no exceptions |
| Vulnerable dependency removal | Passed | Root lockfile and installed graph contain neither braces nor micromatch; Next ESLint uses scoped tinyglobby alias |
| Replacement regression | Passed | 8 tests in `scripts/dependency-security.test.ts`, including actual Next lint diagnostics and bounded malicious input |
| Root lint | Passed with warning | 0 errors; 1 new Next lint warning on existing internal `window.location.assign` in login form |
| Typecheck | Passed | `npm run typecheck` after clean install |
| Unit suite | Passed subset | 93 passed / 28 skipped, 31 passed files / 27 skipped files; skipped integration/browser cases are not passes |
| Production build | Passed locally | `msi-local.mjs build`: Next 16.4.2 compiled and generated 60 pages using synthetic configuration, not a Production deployment |
| Source readiness | Passed | `npm run production:check`; Production secrets and live flows are not verified by this command |
| Dialog UI after CSS dependency removal | Passed | Actual Dialog component plus newly built CSS at 360/390/1280px: open/close, Escape, focus return, animation selector, no overflow/page errors; `.dev-logs/dependency-dialog-*.png` |
| Secret scan of unpublished history | Passed | Gitleaks scanned 33 commits from `origin/main..HEAD`, no leaks found |
| DB integration and complete role browser flows | Blocked, not rerun | Shared Docker maintenance; Beauty container stopped and no listener on 3100; no containers/volumes deleted |
| GitHub CI / security on `3aab3ea` | Passed | CI run 39084633168 and Security run 39084634291 |
| Fresh Supabase database on `3aab3ea` | Failed, repair added | Run 39084633165 applied migrations, then failed 1/24 assertions: 36 tables lacked FORCE RLS. Additive migration and actual owner-role regression added; see current PR checks for rerun |
| Production deployment / live verification | Not performed | User requested retaining the PR without merge/deployment |

See `docs/operations/dependency-security-2026-10-18.md` for alternatives, exact
dependency boundaries and replacement rationale. AOCI delivery completed all
10 chunks / 353 entries, but attestation schema validation and preexisting
index drift remain unresolved; complete index alignment is not claimed. A later
compaction reload hit Host truncation at chunk 1/10; complete current cognition
is unavailable until a smaller chunk setting and a new full delivery succeed.

## 2026-10-09 local continuation (historical)

Date: 2026-10-09 (Asia/Taipei). Source baseline: `9cf6dfe` plus the local continuation changes. Environment: loopback synthetic PostgreSQL, Node 24.18.0, npm 11.16.0; no Production writes.

| Check | Result | Evidence |
| --- | --- | --- |
| Lockfile installation | Passed | `npm ci --no-audit --no-fund`; Prisma generate and existing minimatch patch applied |
| Initial root lint | Failed, external scope | 38 errors in preexisting vendor examples; resolved by excluding `vendor/**` from root lint scope |
| Root lint and typecheck after scope fix | Passed | `npm run lint`, `npm run typecheck` |
| Initial integration pass | 24 passed / 1 failed | Runner incorrectly forced payroll test mode; corrected runner defaults |
| Corrected integration pass | 25 passed in 24 files | `node scripts/msi-local.mjs test <credential-file-path>` |
| Browser defect reproduction | Failed as expected | Date change left the next-step button enabled with a stale selection |
| Existing owner browser test | Passed | Operations view, walk-in save, consent readback and CSV scope |
| Corrected browser flow | Passed: 3 suites / 3 tests | Four synthetic roles, booking/cancellation, date/staff replacement, dialog focus, merchant walk-in/readback and CSV scope; 360/390/430/768/1280px screenshots under `.dev-logs/` |
| Role entry defect | Fixed and verified | Next request internal host differed from browser Host; public origin reconstructed then checked against private-network allowlist |
| Reception attendance defect | Fixed and verified | Backend correctly rejected receptionist; UI now hides the unavailable attendance entry, staff entry remains functional |
| Owner mobile density | Fixed and verified | Six workspaces, one visible section; browser tests switch views and assert visible-section count; owner screenshots cover all five viewport widths |
| Final lint/typecheck/build | Passed | Root npm lint and typecheck; Next build generated 60 static pages after final runtime changes |
| Unit tests | 85 passed / 28 skipped in 57 files | 30 passed files / 27 skipped files; integration and browser cases run separately, not counted as unit passes |
| LAN HTTP browser defect | Fixed and verified | `crypto.randomUUID` unavailable outside secure context; client request identifiers now use `getRandomValues` with v4 bits, covered by unit and actual LAN browser tests |
| LAN trial | Passed: entry and browser date selection | `192.168.1.102:3100` actual browser loaded service and date controls without page errors; physical phone not tested |
| Fresh migration / actual Supabase pgTAP | Not run | Current trial is a clone of the historical synthetic rehearsal; provider auth/storage/cron are not full Supabase runtime |
| Real OAuth / provider delivery / physical phone | Not run | Synthetic session and provider mocks are only local evidence |

Failure cases are retained rather than described as successful releases. A passing subset does not complete the entire commercial platform or every prompt edge case.

AOCI complete refresh stopped on actual Host output truncation at Chunk 1/10. Formal index is stale after candidate import; no complete cognition/alignment claim is made. Set `overview_delivery.chunk_tokens` to a smaller valid value and restart full delivery before complete-system cognition verification.
