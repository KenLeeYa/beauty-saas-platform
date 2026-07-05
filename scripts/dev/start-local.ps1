. "$PSScriptRoot\_env.ps1"

Add-CodexRuntimePath
$root = Get-RepoRoot
$logDir = Get-DevLogDir
Set-Location $root

Assert-CommandExists "pnpm"
Assert-CommandExists "docker"

Ensure-LocalEnvFile
$pnpm = (Get-Command "pnpm").Source

Write-Host "Starting local infrastructure..."
docker compose up -d postgres mailpit minio

$pidFile = Join-Path $logDir "pids.json"
if (Test-Path -LiteralPath $pidFile) {
  Write-Host "Existing pid file found. Run pnpm local:stop first if you need a clean restart."
}

Write-Host "Starting API on http://127.0.0.1:4000 ..."
$apiProcess = Start-Process `
  -FilePath $pnpm `
  -ArgumentList @("--filter", "@beauty-saas/api", "dev") `
  -WorkingDirectory $root `
  -RedirectStandardOutput (Join-Path $logDir "api.log") `
  -RedirectStandardError (Join-Path $logDir "api.err.log") `
  -WindowStyle Hidden `
  -PassThru

Write-Host "Starting web on http://127.0.0.1:3000 ..."
$webProcess = Start-Process `
  -FilePath $pnpm `
  -ArgumentList @("--filter", "@beauty-saas/web", "exec", "next", "dev", "--hostname", "127.0.0.1", "--port", "3000") `
  -WorkingDirectory $root `
  -RedirectStandardOutput (Join-Path $logDir "web.log") `
  -RedirectStandardError (Join-Path $logDir "web.err.log") `
  -WindowStyle Hidden `
  -PassThru

@{
  api = $apiProcess.Id
  web = $webProcess.Id
  startedAt = (Get-Date).ToString("o")
} | ConvertTo-Json | Set-Content -LiteralPath $pidFile -Encoding UTF8

Start-Sleep -Seconds 8

Write-Host ""
Write-Host "Local app servers started."
Write-Host "Web: http://127.0.0.1:3000"
Write-Host "API health: http://127.0.0.1:4000/api/v1/health/live"
Write-Host "Mailpit: http://127.0.0.1:8025"
Write-Host "MinIO console: http://127.0.0.1:9001"
Write-Host ""
pnpm local:status
