# Test evidence

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
