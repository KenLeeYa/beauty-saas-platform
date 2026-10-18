# Production migration application record

Target: `beauty-saas-production` (`dfuhylsmhrysbmhpeylx`). Applied on
2026-10-06 from this candidate repository with Supabase CLI 2.110.0.

## Applied versions

The linked migration list initially showed 13 installed baseline versions,
ending `20260806033307`. `supabase db push --linked --dry-run` listed exactly
17 pending `20261005*` repository files, from
`20261005000100_line_identity_links.sql` through
`20261005030500_line_desktop_login.sql`. It showed no prototype, seed, or
unrelated migration. `supabase db push --linked --yes` completed successfully.
The subsequent linked list showed 30 installed versions, including each of the
17 new repository versions once.

The CLI preserved the repository's migration version IDs. The connected MCP
`apply_migration` action was not used because it does not accept a version ID.
No database password or access token was copied into a command, source file,
or this record. CLI telemetry was disabled to avoid writing outside the task
workspace.

## Read-only postchecks

Counts were unchanged: 1 organization, 1 location, 1 booking, 20 booking
holds, 1 customer, 2 staff, 4 service-staff assignments, and 0 Storage
objects. The new required assignment fields had zero nulls. The new store
entry, LINE channel, and desktop-session tables exist. Three tenant config
rows were then created for the isolated test store: entry
`preview-line-pilot` and the `LOGIN` (`2011887008`) and `MESSAGING`
(`2011886962`) channel references under provider `2005605742`. All three
rows were verified **disabled**. They contain no channel secrets or tokens.

This check records the schema result; an authenticated owner login check and
public booking smoke test are separate release checks.

## Application rollback

If the new application fails, disable the test entry and restore the previous
Vercel deployment. Keep the additive schema and all bookings. A daily database
restore is not an application rollback: it could discard bookings created
after the backup, and Supabase database backups exclude Storage object bytes.
