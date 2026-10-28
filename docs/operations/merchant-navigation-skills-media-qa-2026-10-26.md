# Merchant Navigation, Skills and Image Controls: Local QA

Date: 2026-10-26 (Asia/Taipei).

## Candidate and Boundaries

- Workspace: `C:/Users/KY/Documents/Codex projects/beauty-saas-platform`.
- Branch: `codex/beauty-msi-continuation-20261009`.
- Base commit: `e207febf4b9e3b9483761354b863ef45ee7a91a6` plus retained local changes. This is not evidence that the base commit alone contains this candidate.
- Next build: `rbDKYqzk01do_v1x6232L`; local listener PID 31720 on `0.0.0.0:3100` at verification.
- LAN origin: `http://192.168.1.104:3100`.
- Database: retained synthetic `beauty_msi_20261009` on loopback port 56863. No reset, reseed or Docker lifecycle change.
- The final build includes all application edits, including the narrow-screen staff toolbar correction. Documentation and cognition maintenance are separate from runtime.
- No commit, push, merge, deployment, provider activation or paid service operation.

## Changes and Reproduced Problems

1. `/merchant/team` previously used the same `renderStaff` branch as `/merchant/staff`. The URL was distinct but the content was wrong. A failing browser assertion reproduced the staff search on the team page.
2. Team now lists authorized account memberships, roles, status and organization/branch scope. It is read-only; this change does not add account invitations, role editing or privilege escalation. `team.read` is checked on the server and the navigation entry is hidden without that capability.
3. Staff now has a manager-created organization skill catalog and checkbox assignment for new and existing staff. Skill drafts survive language changes and sheet reopening. Duplicate names, unknown skills, foreign tenant/staff/branch, unauthorized roles and stale snapshots are rejected.
4. Descriptive profile skills are distinct from service qualifications. Saving skills does not modify `service_staff_assignments`, their effective intervals, availability or existing bookings. Qualification/reassignment remains under the existing operations workflow.
5. Five upload controls now occupy the bottom-right corner of their image: service image, staff photo, branch exterior, brand cover and brand logo. Each has a named 44px button, disabled/loading state and a hidden file input that resets to support retrying the same file.
6. The operations navigation label now matches its actual `營運管理` heading rather than naming only its attendance/payroll subset.
7. A post-pass 320px visual inspection found the new skill-catalog button wrapping below the search/add controls. Scoped grid tracks now keep search plus both 44px icon buttons on one row; read-only staff and team search still use the full available width. Browser assertions compare control centers at 320/390/768/1440px to prevent recurrence.

## Navigation Coverage

The browser clicks every listed destination at 390px and 1440px, checking its scoped href, actual pathname, exact page heading and horizontal overflow:

`dashboard`, `calendar`, `bookings`, `customers`, `operations`, `services`, `staff`, `resources`, `locations`, `team`, `reports`, `subscription`, `billing`, `settings`, `setup`.

Team search retains its value through English, Vietnamese and Traditional Chinese. A receptionist cannot see the team link and direct navigation returns 403. This checks the primary merchant navigation registry, not every possible action of every platform-admin or retired legacy screen.

## Local Migration and Security

Applied `20261026010000_staff_skill_catalog.sql` once to the exact retained local database, without recreating it. It creates an organization-scoped catalog, backfills existing skill text into selectable entries, and installs forced RLS and reviewed read grants. Existing staff text is not rewritten. The before/after migration booking count remained 1,111; five catalog entries were initially backfilled. Later regression fixtures can change those counts.

The local rehearsal database has a historical null `auth.uid()` stub. The RLS regression binds a synthetic JWT identity only inside a rolled-back transaction, uses the actual `authenticated` role and verifies that only the owned organization's skill rows are readable. The original function definition is checked after rollback. No persistent identity helper, policy or bypass-role relaxation is made. Authenticated direct INSERT remains denied. This is local policy evidence, not actual Supabase Auth or Production RLS verification.

## Verification

| Gate | Result |
| --- | --- |
| `npm run lint` | Passed, zero errors; one existing `login-form.tsx:216` internal navigation warning |
| `npm run typecheck` | Passed after final test changes |
| MSI `unit` | 191 passed; 61 opt-in cases skipped, not counted as passes |
| MSI `test` | 27 passed in 25 files, including real route and local DB skill/tenant/branch/RLS checks |
| MSI `build` | Passed, Next.js 16.4.2 |
| MSI `ui`, without name filter | 35 passed in 10 files, 236.90 seconds, against the final build |
| LAN health/listener | `/api/health` returned `status: ok`; port 3100 owned by PID 31720 |

The full browser suite includes existing booking, reassignment, localized drafts, merchant directory/settings/business workflows and the new navigation/skills/media cases. The new skill case injects a 503, then performs real POST/PATCH retries and verifies database state plus reload. It also tests duplicate creation, stale writes, draft reopening and unchanged service qualification rows.

Image cases use the actual file chooser and API to reject invalid PNG bytes twice, preserving form values. Success preview and pending-state dismissal guards use an explicitly intercepted 201 with a valid local PNG data URL; this proves frontend preview handling, not object-storage persistence. Actual Supabase Storage is not configured in this MSI trial, so successful provider upload remains unverified.

New dialogs are checked at 320/390/768/1440px and in all three locales. Visual review includes the 320x568 reduced-motion skill catalog and 390x844 staff assignment sheet. Existing shared-sheet tests cover software VisualViewport/keyboard geometry. No physical device or native Zhuyin keyboard was used.

Ignored local evidence:

- `.dev-logs/navigation-ui-full-20261026.log`
- `.dev-logs/navigation-unit-20261026.log`
- `.dev-logs/navigation-db-20261026.log`
- `.dev-logs/navigation-build-20261026.log`
- `.dev-logs/team-mobile-20261026.png`
- `.dev-logs/skill-catalog-320-20261026.png`
- `.dev-logs/staff-skills-mobile-20261026.png`
- `.dev-logs/staff-photo-mobile-20261026.png` (explicitly mocked image success)

Early QA failures were test-selector assumptions: branch rows are opened by `目前分店`, not the detail title `分店資料`; the new team search now uses semantic `type=search`. Both are covered by the final passing suite. The old seeded onboarding test was updated from comma-separated skill text to catalog creation and checkbox assignment, but that separate seed-dependent E2E was not executed against this retained database.

Synthetic staff are deactivated and test catalog entries removed in cleanup; audit history remains. Existing user data and unrelated dirty files are preserved. Real OAuth, Email/LINE delivery, financial providers and Production remain outside this validation.

## Try Locally

1. Open `http://192.168.1.104:3100/api/line-booking/integrated-demo?role=owner` on the same private network. This is a synthetic local login, not Google/LINE OAuth.
2. Open `/merchant/team?organization=demo&location=taipei` to inspect account memberships and role scope.
3. Open `/merchant/staff?organization=demo&location=taipei`, select the skill-catalog icon, create a skill, then select it in a new staff form or an existing staff detail and save.
4. Switch among Chinese, English and Vietnamese before saving; the current form and skill selections should remain intact. Navigating away or reloading is not a promised draft-recovery mechanism.
5. Open service/staff/branch/brand detail to find the upload icon inside the image. Invalid-file recovery is available locally; actual provider upload requires separately configured storage.

## Cognition Evidence

An earlier refresh's attestation was incomplete because its request and one format-only correction failed the tool schema. After the later context compaction, the complete 25-chunk index (566 existing entries) was delivered again. The live MCP input schema was inspected to resolve the exact `object_identity` field, without consulting source to reconstruct challenge answers. This fresh delivery was host-confirmed and passed all 10 challenge answers. The tool reported usable model cognition and strict verification, while governance remained dirty pending the current source-bound entry maintenance. Final maintenance and Verify/Check/Guide evidence are recorded separately by AOCI.
