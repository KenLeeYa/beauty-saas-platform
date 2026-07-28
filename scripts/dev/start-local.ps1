. "$PSScriptRoot\_env.ps1"

Add-CodexRuntimePath
$root = Get-RepoRoot
$logDir = Get-DevLogDir
$webPort = Get-BeautyWebPort
Set-Location $root

Assert-CommandExists "node"
Assert-CommandExists "npx"

$pidFile = Join-Path $logDir "pids.json"
if (Test-Path -LiteralPath $pidFile) {
  $existing = Get-Content -LiteralPath $pidFile | ConvertFrom-Json
  if ($existing.web -and (Get-Process -Id $existing.web -ErrorAction SilentlyContinue)) {
    Write-Host "Beauty web is already running."
    & "$PSScriptRoot\status-local.ps1"
    exit 0
  }
  Remove-Item -LiteralPath $pidFile -Force
}

$npx = Get-CommandExecutable "npx"
$previousErrorAction = $ErrorActionPreference
$ErrorActionPreference = "Continue"
& $npx supabase status *> $null
$statusExitCode = $LASTEXITCODE
$ErrorActionPreference = $previousErrorAction
if ($statusExitCode -ne 0) {
  Write-Host "Starting local Supabase..."
  & $npx supabase start
  if ($LASTEXITCODE -ne 0) {
    throw "Local Supabase failed to start."
  }
}

Sync-LocalEnvFile
Assert-PortAvailable $webPort

Write-Host "Starting web on all network interfaces (port $webPort) ..."
$node = Get-CommandExecutable "node"
$nextCli = Join-Path $root "node_modules\next\dist\bin\next"
$webProcess = Start-Process `
  -FilePath $node `
  -ArgumentList @("`"$nextCli`"", "dev", "--hostname", "0.0.0.0", "--port", "$webPort") `
  -WorkingDirectory $root `
  -RedirectStandardOutput (Join-Path $logDir "web.log") `
  -RedirectStandardError (Join-Path $logDir "web.err.log") `
  -WindowStyle Hidden `
  -PassThru

@{
  web = $webProcess.Id
  webPort = $webPort
  startedAt = (Get-Date).ToString("o")
} | ConvertTo-Json | Set-Content -LiteralPath $pidFile -Encoding UTF8

$healthUrl = "http://127.0.0.1:$webPort/api/health"
$deadline = (Get-Date).AddSeconds(90)
do {
  Start-Sleep -Seconds 2
  $healthStatus = Test-HttpEndpoint $healthUrl
} until ($healthStatus -eq 200 -or (Get-Date) -gt $deadline)

if ($healthStatus -ne 200) {
  throw "Beauty web did not become healthy. Check $logDir."
}

$localAddress = Get-LocalIPv4Address

Write-Host ""
Write-Host "Beauty local environment started."
Write-Host "Login: http://127.0.0.1:$webPort/"
Write-Host "Customer booking: http://127.0.0.1:$webPort/book/demo/taipei"
Write-Host "Merchant workspace: http://127.0.0.1:$webPort/merchant"
if ($localAddress) {
  Write-Host "Phone / LAN: http://$($localAddress):$webPort/"
}
Write-Host "API health: $healthUrl"
Write-Host "Supabase Studio: http://127.0.0.1:55323"
Write-Host ""
& "$PSScriptRoot\status-local.ps1"
