# Current-run test evidence

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
| Final lint/typecheck/build | Passed | Root npm lint and typecheck; Next build generated 60 static pages after final runtime changes |
| Unit tests | 85 passed / 28 skipped in 57 files | 30 passed files / 27 skipped files; integration and browser cases run separately, not counted as unit passes |
| LAN HTTP browser defect | Fixed and verified | `crypto.randomUUID` unavailable outside secure context; client request identifiers now use `getRandomValues` with v4 bits, covered by unit and actual LAN browser tests |
| LAN trial | Passed: entry and browser date selection | `192.168.1.102:3100` actual browser loaded service and date controls without page errors; physical phone not tested |
| Fresh migration / actual Supabase pgTAP | Not run | Current trial is a clone of the historical synthetic rehearsal; provider auth/storage/cron are not full Supabase runtime |
| Real OAuth / provider delivery / physical phone | Not run | Synthetic session and provider mocks are only local evidence |

Failure cases are retained rather than described as successful releases. A passing subset does not complete the entire commercial platform or every prompt edge case.

AOCI complete refresh stopped on actual Host output truncation at Chunk 1/10. Formal index is stale after candidate import; no complete cognition/alignment claim is made. Set `overview_delivery.chunk_tokens` to a smaller valid value and restart full delivery before complete-system cognition verification.
