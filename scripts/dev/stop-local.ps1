. "$PSScriptRoot\_env.ps1"

Add-CodexRuntimePath
$root = Get-RepoRoot
$logDir = Get-DevLogDir
$pidFile = Join-Path $logDir "pids.json"
$webPort = Get-BeautyWebPort
Set-Location $root

if (Test-Path -LiteralPath $pidFile) {
  $pids = Get-Content -LiteralPath $pidFile | ConvertFrom-Json
  foreach ($processId in @($pids.api, $pids.web)) {
    if ($processId) {
      $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
      if ($process) {
        Stop-Process -Id $processId -Force
        Write-Host "Stopped process $processId"
      }
    }
  }
  Remove-Item -LiteralPath $pidFile -Force
}

Stop-LocalPortOwners -Ports @($webPort, 4000)

Write-Host "Stopping local infrastructure..."
docker compose stop postgres mailpit minio

Write-Host "Local test environment stopped."
