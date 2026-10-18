. "$PSScriptRoot\_env.ps1"

Add-CodexRuntimePath
$root = Get-RepoRoot
Set-Location $root

Assert-CommandExists "node"
Assert-CommandExists "npm"
Assert-CommandExists "npx"

$npm = Get-CommandExecutable "npm"
$npx = Get-CommandExecutable "npx"
$null = Import-LocalGoogleOAuthEnvironment

Write-Host "Installing dependencies..."
& $npm install
if ($LASTEXITCODE -ne 0) {
  throw "npm install failed."
}

Write-Host "Starting local Supabase..."
& $npx supabase start
if ($LASTEXITCODE -ne 0) {
  throw "Local Supabase failed to start."
}

Sync-LocalEnvFile

Write-Host "Resetting the local database from migrations and seed..."
& $npx supabase db reset
if ($LASTEXITCODE -ne 0) {
  throw "Local database reset failed."
}

Write-Host "Seeding local role and booking fixtures..."
& $npm run db:seed
if ($LASTEXITCODE -ne 0) {
  throw "Local demo seed failed."
}

Write-Host "Running verification checks..."
& $npm run lint
& $npm run typecheck
& $npm run test
& $npm run db:test
& $npm run db:lint

Write-Host ""
Write-Host "Local test environment is ready."
Write-Host "Start app servers with: npm run local:start"
Write-Host "Check status with: npm run local:status"
