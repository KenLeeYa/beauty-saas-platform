# Local trial guide

Use Node 24 and the repository's npm lockfile. Start only the existing synthetic PostgreSQL container:

```powershell
docker start line-booking-test-20261004
npm ci --no-audit --no-fund
$credentialFile = 'C:/Users/KY/Documents/Codex/2026-10-04/task-4/line-booking/.local/pg.env'
node scripts/msi-local.mjs setup $credentialFile
node scripts/msi-local.mjs unit $credentialFile
node scripts/msi-local.mjs test $credentialFile
node scripts/msi-local.mjs build $credentialFile
$env:BEAUTY_LOCAL_LAN_HOST = '192.168.1.102'
node scripts/msi-local.mjs start $credentialFile
node scripts/msi-local.mjs ui $credentialFile
```

`setup` creates a distinct synthetic database from the previous synthetic migration rehearsal; it does not reset or alter the source. It requires that historical local database, and is not a fresh Supabase installation script. Do not supply a production credential file. Credentials are read in process and are never written to reports or command arguments.

## Role entry points

- Customer: `http://127.0.0.1:3100/api/line-booking/integrated-demo?role=customer`
- Receptionist: same endpoint with `role=receptionist`.
- Beautician: same endpoint with `role=beautician`.
- Owner: same endpoint with `role=owner`, redirected to operations review.
- Same-network phone: replace `127.0.0.1` with the configured private LAN host. Confirm the actual active adapter address before use.

These entry links mint synthetic sessions and do not test real LINE/Google sign-in. Use separate browser contexts for independent roles. Returning to the customer entry clears prior merchant cookies. Existing obligations and manual operations remain server-authorized.

## Trial scenarios

Customer: choose service/staff, date, time, change date, choose again, enter synthetic contact fields, confirm, open My bookings, reschedule dialog, cancel. Receptionist: open store agenda and manual booking; owner: review walk-in timing, member policy, commission, attendance and payroll. Beautician: own appointment scope and attendance. Real notifications, payment capture and payroll bank transfer remain disabled.

Build before browser QA; avoid regenerating Prisma while database tests or the trial server hold its Windows DLL. Logs and screenshots are under `.dev-logs/`. To stop the trial use `scripts/stop-msi-local.ps1`; stop the synthetic container only after you finish manual testing. Shared StallOrder containers must remain untouched.
