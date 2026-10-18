# Test evidence

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
