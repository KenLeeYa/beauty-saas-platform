. "$PSScriptRoot\_env.ps1"

Add-CodexRuntimePath
$root = Get-RepoRoot
$logDir = Get-DevLogDir
Set-Location $root

Write-Host "Ports:"
Get-NetTCPConnection -LocalPort 3000,4000,5432,8025,9000,9001 -ErrorAction SilentlyContinue |
  Select-Object LocalAddress,LocalPort,State,OwningProcess |
  Format-Table -AutoSize

Write-Host ""
Write-Host "HTTP checks:"
$webStatus = Test-HttpEndpoint "http://127.0.0.1:3000"
$apiStatus = Test-HttpEndpoint "http://127.0.0.1:4000/api/v1/health/live"
if (-not $webStatus) { $webStatus = "not ready" }
if (-not $apiStatus) { $apiStatus = "not ready" }
Write-Host "web /: $webStatus"
Write-Host "api /health/live: $apiStatus"

Write-Host ""
Write-Host "Docker services:"
docker compose ps

Write-Host ""
Write-Host "Logs: $logDir"
