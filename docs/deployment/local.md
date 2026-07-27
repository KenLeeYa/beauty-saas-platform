# Local Deployment

Start local dependencies:

```bash
docker compose up
```

Start apps:

```bash
pnpm install
pnpm dev
```

On Windows, use the local helper scripts:

```powershell
pnpm local:setup
pnpm local:start
pnpm local:status
pnpm local:stop
```

Local URLs:

- Web: `http://127.0.0.1:3100`
- Booking center: `http://127.0.0.1:3100/booking-center`
- API health: `http://127.0.0.1:4000/api/v1/health/live`
- Mailpit: `http://127.0.0.1:8025`
- MinIO console: `http://127.0.0.1:9001`

The web server listens on all local network interfaces. `pnpm local:start` and
`pnpm local:status` print a `Phone / LAN` URL that another device on the same
Wi-Fi can open. Port `3100` is reserved for this project so StallOrder can keep
its default Next.js port `3000` when both services run on the same machine.

To override the beauty web port for one PowerShell session:

```powershell
$env:BEAUTY_WEB_PORT=3200
pnpm local:start
```

Browser requests use the same-origin `/api/v1` path. Next.js forwards those
requests to the Nest API configured by `API_URL`, so phones do not try to call
their own `127.0.0.1`.
