# Beauty release candidate: 2026-10-28

## Scope and ownership

The user authorized updating PR #2, merging the current Beauty changes and deploying
Production. This does not activate payment, marketing, outbound notification,
stored-value or payroll providers. Preserve retained local fixtures and all existing
Production records. Exclude unrelated `.agents`, `.gitmodules`, vendor and derived
CodeGraph artifacts from the application release.

The candidate starts at `e207febf4b9e3b9483761354b863ef45ee7a91a6` plus the reviewed
local application changes. Its local build ID is `R3tprV7ZGnb7JtdHDWVWh`.
PR #2 targets `main` from `feat/stallorder-backend-architecture`.

## Current verification

- Zod GHSA-mrhx-c7xc-m3w5 reproduced: a bounded oversized array visited all 1,000
  elements before rejecting under 4.4.3. The regression requires zero element visits.
- Raised the declared Zod minimum to 4.6.6; npm resolved 4.6.7. The focused security
  suite passes 9 tests and npm audit reports zero vulnerabilities. No audit exception
  or CI severity threshold was changed.
- Root lint: zero errors, one existing Next navigation warning. Typecheck, production
  build and source-only production-readiness checks pass.
- Unit suite: 205 passed; 75 environment-gated cases skipped, not passed.
- Retained PostgreSQL integration suite: 33 passed across 28 files.
- Full software-browser suite: 43 passed across 12 files, started 20:28:30 Asia/Taipei,
  duration 408.89 seconds. Includes three-language drafts, server directories, role
  boundaries, reassignment, booking and failure/retry interactions.
- The first browser attempt had 37 passes and six connection timeouts against the old
  LAN address 192.168.1.104. Adapter readback showed 192.168.1.102; restarting the same
  build with that allowed origin and rerunning all 43 tests passed. No test assertion
  was relaxed. The retained database was not reset or reseeded.

## Production preflight

- Supabase project `dfuhylsmhrysbmhpeylx`, `beauty-saas-production`, organization
  KuanGuard. All 30 existing migration versions were compared with their repository
  SQL. Every persisted statement matched in order; only inter-statement whitespace,
  terminators and standalone comments were ignored. No substantive source remained.
- Pending additive migrations: `20261018010000`, `20261026010000`, `20261026020000`.
  They force existing RLS, create/backfill a tenant skill catalog and add an empty
  default required-skills array. They do not rewrite bookings or staff assignments.
- In-app Supabase dashboard shows seven physical backups. Latest: 2026-10-27
  22:03:54 UTC (2026-10-28 06:03:54 Asia/Taipei). No restore was executed. Storage
  currently contains zero object rows; database backups do not cover object bytes.
- Baseline counts: one organization, location, customer, booking and booking segment.
- Vercel project `prj_S8ryMyEGjyenihjsJTU8QZqAUI2I`, team
  `team_MMfsiG94K9Zy3e6w7Ccc9xY4`. Bind both identifiers explicitly in every CLI child;
  inherited project variables initially selected a different project on a read-only
  metadata call. No write was made to that project.
- Prior Production deployment: `dpl_7SaEYs2imgCtkJRBzi68xtfM5PyK`.
  Alias: https://beauty-saas-platform-roan.vercel.app . Public baseline smoke passed.
  The Codex in-app browser confirmed an authenticated preview merchant dashboard.

## Evidence boundaries and remaining release gates

This receipt records pre-release evidence, not a completed release. Current-candidate
GitHub checks, clean migration/pgTAP checks, merge identity, additive Production
migration readback, deployment identity and affected live workflows must pass before
claiming release completion. Publish those outcomes on PR #2 and in the handoff.
The retained-MSI suite is not the separate seed-dependent onboarding E2E suite.
Software mobile and viewport tests are not physical Zhuyin keyboard evidence. Real
LINE/Google callback changes, notification delivery, payments, payroll settlement and
Storage upload/restore are not established by these tests and are not activated here.
