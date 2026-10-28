# Service and Staff Server Directories: Local QA

## Scope and Runtime

- Workspace: `C:/Users/KY/Documents/Codex projects/beauty-saas-platform`.
- Branch: `codex/beauty-msi-continuation-20261009`.
- Baseline HEAD: `e207febf4b9e3b9483761354b863ef45ee7a91a6`, plus preserved local changes.
- Candidate build: `YxSeOfps8fzRnrVXCJv_8`; local server PID 34776, listening on `0.0.0.0:3100`.
- Database: retained loopback database `beauty_msi_20261009`. No reset, reseed, schema migration or dependency installation.
- No commit, push, PR update, merge, deployment, GitHub Actions invocation, paid design service, or real provider action.
- Software mobile QA only. These results do not certify a physical phone or native Zhuyin keyboard.

## Changes

- Authenticated service and staff GET routes validate search/offset/limit and resolve organization and branch from the session context. Mutating routes retain their CSRF and capability checks.
- Search and eight-row pages are computed in PostgreSQL with stable sort-order/ID ties and consistent count/page snapshots. Literal `%` and `_` are not wildcard operators. Staff search includes partial skill names.
- Service group options cover the whole accessible branch, independent of the current page or search. Service eligibility and staff qualified-service counts retain required-skill, effective-assignment, active-staff and branch rules.
- Service/staff pages no longer bootstrap complete service and staff arrays. Other workspace consumers retain their existing projections; this does not remove every legacy projection limit elsewhere.
- Detail sheets are independent of paged cards. Service buffers, required skills, staff skills and new-record drafts remain parent-owned, keyed by the correct record identity. Changing page, search or language does not rebuild these drafts from visible checkboxes.
- Loading, empty search results, failed-read retry, immediate mutation feedback and late-response cancellation use the existing shared page loader. Newly added interface copy supports Traditional Chinese, English and Vietnamese. Stored business names are not translated.

## Red/Green and Verification

- API red: the new public-route regression failed because `GET` did not exist. After implementation, all 32 database tests in 27 files passed, including scope, roles, invalid input, stable pages, eligibility counts and bounded bootstrap.
- Browser red: on the prior build, typing a search did not send the required GET request. The new mobile regression then passed against the candidate build.
- Focused mobile flow covers nine services and nine staff, first/last pages, separate record drafts, reopening new-record drafts after paging, all three languages, failed GET/PATCH retries, actual save/reload/readback, and an old held GET arriving after a newer search result.
- Dialog tests cover 320x740, 390x844 and 844x390. Footer position and horizontal bounds are checked after responsive layout settles.
- A separate LAN browser pass loaded the Chinese showcase via its owner entry and checked both pages at widths 320, 390, 768 and 1440. No horizontal overflow or JavaScript page errors; all four staff portraits loaded.
- Unit gate: 204 passed, 72 environment-gated skips. Skips are not counted as successes; database and browser gates are run separately.
- Typecheck and build passed. Lint: zero errors, one pre-existing `login-form.tsx` navigation warning. Vite configuration and Prisma package-configuration deprecation warnings remain nonblocking.
- Initial full browser suite: 40 passed, one existing settings-flow timeout (585.47 seconds total). That settings case passed alone in 9.14 seconds without source changes or increased timeout. The timeout's cause was not proven.
- Second full browser suite: 40 passed, one existing recovery-test locator failure (419.02 seconds total). The test clicked a repeated summary before its mocked reload replaced 30 retained real rows. It now waits for and scopes the action to the named synthetic list item. An initial exact-text wait also failed because the service name shares a span with the date and staff; the final list-item locator passed the focused case in 3.55 seconds. No application behavior, assertions or timeout limits were relaxed.
- Final ordered browser suite: 41 passed in 11 files, starting at 18:11:47 local time, 403.36 seconds total. This includes the new directory flow and the existing settings, media, customer, booking, reassignment, locale and recovery flows. Earlier failed runs remain recorded rather than being relabeled as passes.

## Evidence and Tool Boundaries

Screenshots are local under `.dev-logs/`:

- `server-services-draft-mobile.png`
- `server-staff-draft-mobile.png`
- `server-services-showcase-mobile.png`
- `server-staff-showcase-mobile.png`

Tests run through `scripts/msi-local.mjs` with the existing local credential file, which is not copied into this report. The root package declares `npm@11.16.0`; `pnpm lint` refused to run because of that package-manager declaration. Lint/typecheck use npm scripts, and the local wrapper invokes the same installed Vitest/Prisma/Next tools with explicit loopback test configuration. The package-manager configuration was not changed.

CodeGraph and current source were used under the approved source-bound AOCI exception; no complete-system cognition claim is made. Graphify's final free code-only refresh produced 3,710 nodes and 9,524 edges. Its existing limitations remain: missing SQL parser for 40 SQL files, four partial test-file parses, and 79 code files without extracted symbols. No parser dependency was installed.

Better Design was not retried because of its known quota limitation. Local UI/UX Pro Max search supplied loading, search and responsive guidance. Chrome DevTools MCP could not open its occupied browser profile; independent Playwright/Edge browser execution supplied the UI evidence instead. No existing browser was terminated to bypass that conflict.

Only test-owned temporary directory fixtures are cleaned up. Prior demo/showcase records and their history are retained. Real notification, payment and OAuth providers are outside this task.

## Local Test Paths

- Showcase owner: `http://192.168.1.104:3100/api/line-booking/integrated-demo?store=showcase&role=owner`
- Services: `http://192.168.1.104:3100/merchant/services?organization=showcase&location=daan`
- Staff: `http://192.168.1.104:3100/merchant/staff?organization=showcase&location=daan`
- Existing retained demo: use `organization=demo&location=taipei` on the same merchant paths, after entering `/api/line-booking/integrated-demo?role=owner`.

The server remains available on the LAN for user testing. Reload old tabs to use the candidate build.
