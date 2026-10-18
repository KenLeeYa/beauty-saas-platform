# Integrated local trial

Build with `npm run build`, then run
`powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-integrated-local-trial.ps1`.
The script uses the existing loopback synthetic PostgreSQL database. It does not
start or reconfigure Docker, LINE, payments, or any cloud service.

Role links:

- Customer: http://127.0.0.1:45144/api/line-booking/integrated-demo?role=customer
- Receptionist: http://127.0.0.1:45144/api/line-booking/integrated-demo?role=receptionist
- Beautician: http://127.0.0.1:45144/api/line-booking/integrated-demo?role=beautician
- Owner: http://127.0.0.1:45144/api/line-booking/integrated-demo?role=owner

These links mint short-lived synthetic sessions for the fixed demo store only.
The route requires `APP_ENV=test`, `UNIFIED_LOCAL_TRIAL=true`, and a loopback
request. Reservations use the existing `public` booking core.

The separate `line_booking` prototype and its port 45140 were retired on
2026-10-06. Its local-only files are recoverable from the timestamped
`legacy-line-booking-backup-*` directory beside the candidate. The shared
synthetic database and integrated trial remain available.
