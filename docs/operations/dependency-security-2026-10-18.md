# Dependency security and braces replacement

Date: 2026-10-18 (Asia/Taipei). Candidate baseline: `ace1785`.

## Scope and release authorization

The user authorized security repairs, tests and updating PR #2. The subsequent
decision explicitly holds merge and Production deployment; no audit exception
was approved. The later request asks for alternatives rather than waiting on an
unpatched dependency. This change removes the affected dependency instead of
allowlisting the advisory. The Security workflow remains unchanged and audits
both runtime and development dependencies at moderate severity or above.

Only the root npm application is covered by this dependency change. Retained
legacy pnpm applications and independently managed agent/vendor tooling are not
part of the production runtime or this audit result.

## What braces does

`braces` expands patterns such as `src/{app,server}/*.ts` or `{1..3}` and can
compile brace patterns to regex-compatible strings. It also exposes a parser
and AST operations. It is not a booking, identity, membership or payment module.

In this application it arrived through development tools:

```text
eslint-config-next -> @next/eslint-plugin-next -> fast-glob -> micromatch -> braces
shadcn CLI -> fast-glob / ts-morph -> micromatch -> braces
patch-package -> find-yarn-workspace-root -> micromatch -> braces
```

The advisory GHSA-vfj7-8cjw-p6xm describes stack exhaustion in recursive AST
walkers. The upstream advisory and npm metadata listed no patched braces
release on this date. A local reproducer reached a call-stack error before the
replacement. A depth-limit patch was considered but is not shipped: it would
retain the vulnerable package and require ongoing patch/audit-exception work.

## Alternatives and decision

| Option | Appropriate use | Decision |
| --- | --- | --- |
| `brace-expansion` | Bash-style alternatives and numeric ranges | Not a drop-in for braces AST/compile APIs; do not alias globally |
| `picomatch` | Glob matching and regex generation | Useful engine, not a full braces AST replacement |
| `tinyglobby` | Filesystem glob discovery, `glob` and `globSync` | Adopt only for Next ESLint's verified `globSync(pattern, {onlyDirectories:true})` consumer |
| Node `fs.globSync` | Native filesystem discovery | Different API/options; unnecessary adapter work for this consumer |
| Local braces fork or patch | Preserves the original API | Rejected in favor of removing all three dependency paths |

Changes:

- Upgrade Next and its ESLint config to 16.4.2, sharp to 0.35.5, Vitest to
  4.1.12 and concurrently to 10.0.6; refresh vulnerable transitive packages.
- Override only `@next/eslint-plugin-next`'s `fast-glob` dependency with the
  registry package `tinyglobby@0.2.17`. Its actual name and registry integrity
  remain visible in the lockfile. This is not a fake braces version.
- Remove the shadcn generator CLI. Existing generated React components stay.
  The only used generator stylesheet features are the dialog's `data-open`
  and `data-closed` variants; define these locally with equivalent selectors.
  Do not re-add the generator to the release dependency graph to add components.
- Remove patch-package and its minimatch patch, which were needed only because
  a global brace-expansion major-version override broke minimatch's import.
  Removing that override restores compatible upstream package resolution.
- Pin the Prisma config deepmerge dependency to its patched release without
  upgrading Prisma across a major version.

The replacement returns relative roots for some absolute glob inputs. Next's
consumer accepts relative filesystem paths. Tests compare resolved directories
and execute the actual Next lint rule on an internal-link violation to prove
the rule is not silently disabled. Do not broaden the override to unrelated
fast-glob consumers; future Next upgrades must rerun these compatibility tests.

## Verification

- Root `npm audit --audit-level moderate`: zero vulnerabilities after replacement;
  no `--omit=dev`, advisory allowlist or workflow weakening.
- Eight focused tests cover lockfile absence, actual installed replacement
  identity, default root, directory-only wildcard matching, Windows separators,
  brace alternatives, arrays/missing roots, bounded deep input in a subprocess,
  actual Next lint diagnostics and retained dialog state selectors.
- Full root checks and CI results are recorded in `BEAUTY_TEST_RESULTS.md`.
- Docker-dependent integration/browser QA must not be inferred from these tests.
  The shared engine is undergoing separately authorized maintenance; Beauty's
  container was stopped without deleting its data.
- AOCI delivery loaded all 353 formal entries, but attestation field validation
  and preexisting index drift remain unresolved. No alignment claim is made.

## Sources

- https://github.com/advisories/GHSA-vfj7-8cjw-p6xm
- https://github.com/micromatch/braces
- https://github.com/isaacs/brace-expansion
- https://github.com/micromatch/picomatch
- https://github.com/SuperchupuDev/tinyglobby

These findings were checked through AnySearch and current npm registry metadata.
Zero reported vulnerabilities is a dated dependency-audit result, not a claim
that the application has no security defects.
