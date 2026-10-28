# Merchant Settings Mobile QA - 2026-10-26

## Scope And Candidate

- Local-only continuation: branch management, spaces/equipment and merchant settings.
- No commit, push, PR update, merge, cloud configuration or deployment.
- Branch: `codex/beauty-msi-continuation-20261009`.
- Base HEAD: `e207febf4b9e3b9483761354b863ef45ee7a91a6`; the candidate includes the preserved dirty working tree, not just this commit.
- Final Next build: `TbzRsz7_MUhCR60ctNUD3`; 61 generated routes.
- Trial process: PID 24500, listening on `0.0.0.0:3100`; existing isolated MSI database on loopback port 56863 was preserved.
- LAN readback: `http://192.168.1.104:3100/api/health` returned HTTP 200 with `status: ok`.
- Existing neutral/teal styling was retained. Free local UI/UX Pro Max searches informed grouped settings, focused forms and state retention; Better Design remained quota-limited and was not retried. This is not a Better Design review or certification.

## Delivered Interaction

- Branches use a searchable, eight-row directory. Opening the current branch reveals a shared sheet with profile and booking-state sections. Another branch provides its existing authorized scope-switch link, not cross-branch editing.
- Branch booking state is staged until Save. Selecting Open, Paused or Closed alone performs no write.
- Spaces/equipment use a searchable six-row directory, defaulting to active resources with an All option. Resource kinds and filter labels are localized. Adding a resource opens a focused form; successful creation clears only that draft.
- Merchant settings expose compact brand, booking/deposit and notification entries, plus public-booking and branch links. Brand profile/images and booking/deposit sections share the same sheet interaction.
- Shared `MerchantSheet` keeps the action footer separate from its scrollable content, handles focus and busy dismissal, and follows VisualViewport changes. No second dialog framework was added.
- Drafts are parent-owned and are not keyed by locale. zh-TW, en and vi changes, viewport changes and close/reopen retain unfinished input within the mounted view.
- Hidden booking-policy fields still participate in validation. An invalid field reveals its section and receives focus instead of silently preventing Save.
- Existing scoped APIs, capability checks, ObjectStorageProvider and the modular monolith were retained. No schema, authorization or domain-service change was made.

## Reproduced Defects And Corrections

1. The first focused regression failed against the previous inline branch view. Branch, resource and settings editors now use shared sheets rather than expanding all forms on the page.
2. A duplicate translation key blocked the first candidate build; the existing translation was reused.
3. An orphaned SubmitButton helper was removed after lint identified it. The unrelated existing login warning remains.
4. Invalid values in a hidden booking-policy section could prevent submission without exposing the field. A regression now verifies section recovery and focus.
5. Inactive historical QA resources dominated the first directory page. Active-only default filtering and six-row paging keep the usable inventory visible without deleting history.
6. The new All label was initially untranslated. The source-copy guard caught it; English/Vietnamese copy and direct browser label assertions were added before the final green run.

## Verification

| Gate | Result |
| --- | --- |
| `npm run lint` | Passed: zero errors; one pre-existing login navigation warning at `src/components/login-form.tsx:216` |
| `npm run typecheck` | Passed |
| MSI `unit` | 187 passed; 53 opt-in tests skipped, not counted as passes; final run started 13:55:11 |
| MSI `test` | 26 passed across 24 files during this increment; no domain/schema changes followed |
| MSI `build` | Passed, including Prisma generation and Next compilation |
| MSI `ui`, without a name filter | Final 28 passed across eight files; started 13:55:53, duration 220.27 seconds |
| `git diff --check` | Passed |

The root Next application uses the existing npm/MSI commands. Retained legacy pnpm applications were not revalidated. Existing Prisma configuration deprecation and Vite future native-loader warnings did not fail current commands.

Four new browser scenarios in `tests/merchant-settings-ui.integration.test.ts` cover:

- All three pages and languages at 320, 390, 640, 768, 1024 and 1440px; bounded rows, active/all labels and no horizontal overflow.
- Branch/resource/brand/policy draft equality across language changes, resized viewports and editor close/reopen; field/footer visibility and hit-testing under a simulated 380px VisualViewport with 24px offset.
- Branch state staging, failed image selection, a 503 with no database state change, real state retry, draft retention and 200% text checks.
- Branch profile and brand save failures followed by real PATCH retries, database readback and browser reload.
- Resource creation failure followed by real creation, exactly one stored resource and cleared successful draft; policy tab retention, hidden-field validation, failed-save retry and reloaded policy values.

The full runner also rechecked customer booking/rescheduling, multi-service/multi-person reassignment, CRM, role routing, logout and existing multilingual workflows. New draft-flow page-error assertions passed.

Chrome DevTools mobile mode measured the final settings page at 390 x 844 with a 390 x 844 document; all five setting/link entries ended above 497px. Final Playwright screenshots under ignored `.dev-logs/merchant-{settings,resources,locations}-compact.png` and corresponding editor screenshots were inspected. Resources showed four active items on the first page; the branch sheet retained its footer and wrapping labels.

## Data And Evidence Boundaries

- Branch state, address, organization business name and booking-policy values were restored after mutation tests. Newly created synthetic resources were disabled; their types and audit/history were retained. Tests do not clear existing user work.
- Synthetic local role shortcuts are not real OAuth. Real Email/LINE, Google sign-in and successful object-storage uploads were not activated or certified. Image testing covered the file control and a recoverable failed response.
- Keyboard evidence is software viewport/VisualViewport, focus and hit-testing only, not physical-phone or native Zhuyin composition.
- `e2e/role-functional-matrix.spec.ts` selectors were updated for the sheets and staged state save, but the deterministic-seed suite was not executed against the retained MSI database. It is separate from the passing eight-file local UI runner.
- Search and paging use the existing loaded projection, not server-wide pagination. Draft recovery after leaving the route or reloading is not promised; persisted successful saves were verified separately.
- Resource editing/activation was not invented where the existing API only supports creation.

## Local Trial

1. Open `http://192.168.1.104:3100/api/line-booking/integrated-demo?role=owner` for a synthetic local merchant session.
2. Open `/merchant/locations?organization=demo&location=taipei`, select the current branch and inspect Profile/Booking state. State changes apply only after Save.
3. Open `/merchant/resources?organization=demo&location=taipei`, switch active/all, search, and use the add icon.
4. Open `/merchant/settings?organization=demo&location=taipei`, then open brand, booking/deposit or notification settings.
5. Enter an unsaved draft, switch all three languages through the sheet's language icon, close/reopen and verify values remain.

The server is intentionally retained for same-network testing. Use the current private adapter address if the LAN IP changes.
