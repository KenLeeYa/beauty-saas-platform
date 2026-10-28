. "$PSScriptRoot\_env.ps1"

Add-CodexRuntimePath
$root = Get-RepoRoot
$logDir = Get-DevLogDir
$webPort = Get-BeautyWebPort
Set-Location $root

Write-Host "Ports:"
Get-NetTCPConnection -LocalPort $webPort,55321,55322,55323,55324 -ErrorAction SilentlyContinue |
  Select-Object LocalAddress,LocalPort,State,OwningProcess |
  Format-Table -AutoSize

Write-Host ""
Write-Host "HTTP checks:"
$webStatus = Test-HttpEndpoint "http://127.0.0.1:$webPort/api/health"
if (-not $webStatus) { $webStatus = "not ready" }
Write-Host "web /api/health: $webStatus"

$localAddress = Get-LocalIPv4Address
if ($localAddress) {
  Write-Host ""
  Write-Host "Phone / LAN: http://$($localAddress):$webPort/"
}

Write-Host ""
Write-Host "Supabase:"
Assert-CommandExists "npx"
$npx = Get-CommandExecutable "npx"
& $npx supabase status

Write-Host ""
Write-Host "Logs: $logDir"
