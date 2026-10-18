# Migration From Massage Manager

## Scope

The legacy repository is a behavior reference, not an authentication or schema
source. Beauty keeps Supabase Auth, organization and location scoping, UTC
timestamps, PostgreSQL RLS, and trusted Next.js mutations.

## Mapping

| Legacy concept | Beauty target |
| --- | --- |
| Shop | Organization |
| Shop location | Location |
| Appointment item | Service, ServiceVariant, LocationService |
| Therapist | Profile, StaffProfile, StaffLocationAssignment |
| Customer | Customer with normalized contact hashes |
| Appointment | Booking, BookingSegment, BookingEvent |

Every imported object must carry a stable source identifier in the reviewed
mapping report. Target UUIDs are deterministic so repeated dry-runs produce the
same proposed mapping.

## Import Gate

No production export is currently checked into this repository. The importer
therefore supports validation and dry-run reports only. It rejects `--apply`
until a real export has been reviewed, sensitive fields have been classified,
and an approved source contract has been added.

```powershell
npm run import:massage -- --input .\export.json --report .\report.json
```

The input must declare organizations, locations, services, integer minor-unit
prices, IANA timezones, and source IDs. Strict parsing rejects unknown fields.
The report includes proposed IDs, totals, duplicate identifiers, duplicate
slugs, and timezone errors.

## Apply Design

When a real export is approved, apply mode will use one database transaction per
organization, verified organization and location scope on every write, and
upserts keyed by reviewed source mappings. It must never overwrite an existing
record that was not created by the same source mapping.

Customer deduplication will normalize email and E.164 phone values and compare
their keyed hashes within one organization. Ambiguous matches go to an error
report for manual resolution. Legacy local timestamps must include their source
timezone and convert to UTC before insert.

## Rollback

Each apply batch will receive an import batch ID. Rollback may remove only rows
created by that batch and must refuse when later business activity references
them. Database backup and restore verification are required before the first
production import.
