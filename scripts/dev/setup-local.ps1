. "$PSScriptRoot\_env.ps1"

Add-CodexRuntimePath
$root = Get-RepoRoot
Set-Location $root

Assert-CommandExists "node"
Assert-CommandExists "pnpm"
Assert-CommandExists "docker"

Ensure-LocalEnvFile

Write-Host "Installing workspace dependencies..."
pnpm install

Write-Host "Starting local infrastructure..."
docker compose up -d postgres mailpit minio

Write-Host "Running verification checks..."
pnpm lint
pnpm typecheck
pnpm test

Write-Host ""
Write-Host "Local test environment is ready."
Write-Host "Start app servers with: pnpm local:start"
Write-Host "Check status with: pnpm local:status"
