# Rollback and compatibility

## Local

Stop the PID recorded by `.dev-logs/msi.pid` using `scripts/stop-msi-local.ps1`. Keep the synthetic database and Docker volume. The imported candidate is commit `9cf6dfe`; previous committed source remains `974ab63` on the original feature branch. Use a separate worktree to inspect older code; do not reset the dirty current workspace.

## Future controlled Production pilot

Read back the current Production deployment immediately before release; historical fallback was `dpl_7SaEYs2imgCtkJRBzi68xtfM5PyK`. Disable the single mobile store entry and remove new public entry exposure before rolling application code back. Preserve valid bookings, identity audit and financial records. Retain additive tables and columns rather than dropping them.

The new app session resolver requires `line_desktop_sessions`, so migration compatibility must be checked before deploying the candidate. Older application compatibility with the additive schema needs affected-flow verification on a representative database, not just schema names. After fallback verify owner password login, booking lookup, availability and cancellation against the actual restored deployment.

Do not restore the full production database for an application regression: that can discard post-backup bookings and accounting events, and database backups exclude Storage object bytes. For confirmed data corruption, separately preserve later transactions and Storage inventory, obtain the specific recovery authorization, rehearse restore in isolation, and reconcile reservations, member liabilities, refunds, commission adjustments and locked payroll before traffic returns.
