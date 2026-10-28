# Branch and Resource Server Directories: Local QA

## Scope and Runtime

- Workspace: `C:/Users/KY/Documents/Codex projects/beauty-saas-platform`.
- Branch: `codex/beauty-msi-continuation-20261009`; baseline HEAD `e207febf4b9e3b9483761354b863ef45ee7a91a6`, plus preserved local changes.
- Candidate build: `XdauVMbB_YxCZIzJH5TbI`; PID 47680, listening on `0.0.0.0:3100`.
- Retained loopback database: `beauty_msi_20261009`. No reset, reseed, migration or dependency installation.
- No commit, push, PR update, merge, deployment, GitHub Actions invocation, paid design service or real provider action.
- Software mobile QA only, not physical-device or native Zhuyin-keyboard evidence.

## Changes

- Authenticated location and resource GET routes validate search, offset, limit and resource status. Existing PATCH/POST CSRF and capability checks are unchanged.
- Branch pages contain eight records, resources six. PostgreSQL applies search, stable ordering, count and page limits; count and items share a repeatable-read snapshot. Literal percent and underscore characters are escaped rather than treated as wildcards.
- The existing branch-scoped context exposes only the selected branch in its accessible-ID projection. The new directory independently enumerates branches inside that verified organization: all branches for an authorized all-locations actor, otherwise only active location memberships for the authenticated profile. Inactive and foreign branches remain excluded. This does not grant write access to another branch without explicitly switching scope.
- Resources require `resource.read` and are restricted to the verified organization and selected branch. Search includes name, resource-type name and recognized type labels in Traditional Chinese, English and Vietnamese, regardless of the current interface language.
- Facility pages no longer bootstrap complete location/resource arrays. Other workspace consumers retain their existing data contracts. This is not a claim that every unrelated bootstrap query is bounded.
- Existing mobile sheets retain parent-owned location and resource drafts. Search, pagination, closing/reopening a sheet, language switches and failed requests do not reconstruct or clear those drafts. A different branch remains read-only until the user follows its explicit switch link.
- Failed reads show a retry control; late responses cannot replace a newer search; page-count shrink moves the user to a valid page. Successful branch mutations and image uploads update the remote row and selected snapshot. Resource creation refreshes the current server page; drafts clear only on successful creation.
- Mobile layouts retain compact icon controls, fixed sheet action bars and bounded list pages. Business names are preserved, not machine-translated. Unsaved drafts are in-memory, not durable across a full reload or actual branch navigation.

## Verification

- Initial new API test had a template-expression syntax error, corrected before behavioral verification. The meaningful RED then failed with `GET is not a function`; implementation turned it green.
- API suite: 33 passed in 28 files, final run at 18:46:25, 25.43 seconds. Includes actual authenticated route calls, tenant isolation, active/disabled branch memberships, forbidden resource role, malformed pagination, stable/nonoverlapping pages, out-of-range totals, literal search, type searches in three languages, and bounded facility bootstrap.
- Browser RED: the prior runtime did not send a GET when the directory search changed. Focused candidate flow passed in 14.81 seconds after adding late-response and shrinking-page coverage.
- Focused browser coverage: nine isolated branches and seven resources, page navigation, other-branch read-only detail, unsaved profile/address/description and resource name/type/kind, all three languages, GET failure/retry, PATCH/POST failure/retry, real save/reload/readback, stale response rejection and disappearing final pages.
- Dialog layout checks: 320x740, 390x844 and 844x390; horizontal bounds and the action footer remain inside the visual viewport. Screenshots were inspected.
- Initial full browser suite: 41 passed, two failed, starting at 18:47:21, 328.85 seconds. The existing concurrent-resource test asserted synchronously before the new GET completed; it now waits for the actual row and passed its focused rerun.
- The legacy booking regression also failed in isolation. Read-only API/DB inspection confirmed zero slots: the existing required resources had no weekly rules, and both eligible staff were fully allocated in the remaining October windows. A test-owned scheduled resource alone was insufficient and that intermediate failed rerun is retained here. The test now scans subsequent calendar months and chooses a slot outside the configured cancellation cutoff, without rewriting retained schedules or bookings. It waits for the actual availability response and matching rendered slots. The focused booking/reschedule/cancel flow passed at 18:59:32 in 10.88 seconds. Its owned resource is retired after use to preserve booking history.
- Final full browser rerun: 43 passed in 12 files, starting at 19:00:39, 364.15 seconds. The LAN showcase check covers both directories in three languages at widths 320, 390, 768 and 1440. Existing settings, media, role, booking, reassignment and language flows also pass. Earlier failures remain recorded above.
- Unit gate: 204 passed, 75 environment-gated skips, final run at 18:49:37. Skips are not successes; database and browser gates are separate.
- Typecheck and application build passed. Lint: zero errors, one pre-existing login navigation warning. Existing Prisma configuration deprecation and Vite configuration warnings remain nonblocking.

## Evidence and Tools

- `tests/facility-directory.integration.test.ts`
- `tests/facility-directory-ui.integration.test.ts`
- `.dev-logs/server-locations-draft-mobile.png`
- `.dev-logs/server-resources-page-mobile.png`
- `.dev-logs/server-resources-pagination-mobile.png`
- `.dev-logs/server-locations-showcase-mobile.png`
- `.dev-logs/server-resources-showcase-mobile.png`

Tests use `scripts/msi-local.mjs` with the existing credential file, whose contents are never included in reports. The project declares npm; npm scripts and the local wrapper run the installed lint, TypeScript, Vitest and Next tools without changing package-manager configuration.

CodeGraph and current source were used under the approved source-bound AOCI exception; no complete-system cognition claim is made. The final free code-only Graphify refresh produced 3,728 nodes and 9,487 edges. Forty SQL files still lack a parser, four existing test files are partially parsed, and 81 code files yield no symbols; no parser was installed.

Better Design was not retried because of its known quota limitation. Free local UI/UX Pro Max guidance informed form feedback, labels and responsive handling. Playwright/Edge supplies actual browser evidence, not a paid design review or native-device certification. Test fixtures are isolated and only their owned records are removed; previous demo/showcase records and test history are retained.

## Local Test Paths

- Showcase owner: `http://192.168.1.104:3100/api/line-booking/integrated-demo?store=showcase&role=owner`
- Branches: `http://192.168.1.104:3100/merchant/locations?organization=showcase&location=daan`
- Resources: `http://192.168.1.104:3100/merchant/resources?organization=showcase&location=daan`
- Retained demo owner: `http://192.168.1.104:3100/api/line-booking/integrated-demo?role=owner`; use `organization=demo&location=taipei` on the same merchant paths.

The LAN server remains running for user testing. Refresh old tabs to load the candidate build. OAuth, notification delivery, payments and production are outside this local task.
