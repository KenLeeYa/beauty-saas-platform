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

- Web: `http://127.0.0.1:3000`
- API health: `http://127.0.0.1:4000/api/v1/health/live`
- Mailpit: `http://127.0.0.1:8025`
- MinIO console: `http://127.0.0.1:9001`
