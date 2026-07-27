. "$PSScriptRoot\_env.ps1"

Add-CodexRuntimePath
$root = Get-RepoRoot
$logDir = Get-DevLogDir
$webPort = Get-BeautyWebPort
Set-Location $root

Write-Host "Ports:"
Get-NetTCPConnection -LocalPort $webPort,4000,5432,8025,9000,9001 -ErrorAction SilentlyContinue |
  Select-Object LocalAddress,LocalPort,State,OwningProcess |
  Format-Table -AutoSize

Write-Host ""
Write-Host "HTTP checks:"
$webStatus = Test-HttpEndpoint "http://127.0.0.1:$webPort"
$apiStatus = Test-HttpEndpoint "http://127.0.0.1:4000/api/v1/health/live"
if (-not $webStatus) { $webStatus = "not ready" }
if (-not $apiStatus) { $apiStatus = "not ready" }
Write-Host "web /: $webStatus"
Write-Host "api /health/live: $apiStatus"

$localAddress = Get-LocalIPv4Address
if ($localAddress) {
  Write-Host ""
  Write-Host "Phone / LAN: http://$($localAddress):$webPort/booking-center"
}

Write-Host ""
Write-Host "Docker services:"
try {
  $dockerJob = Start-Job -ScriptBlock {
    Set-Location $using:root
    docker compose ps
  }

  if (Wait-Job $dockerJob -Timeout 8) {
    Receive-Job $dockerJob
  } else {
    Stop-Job $dockerJob
    Write-Host "Docker status check timed out. Services may still be running; try 'docker compose ps' directly."
  }
} finally {
  if ($dockerJob) {
    Remove-Job $dockerJob -Force -ErrorAction SilentlyContinue
  }
}

Write-Host ""
Write-Host "Logs: $logDir"
