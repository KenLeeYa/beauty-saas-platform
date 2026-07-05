. "$PSScriptRoot\_env.ps1"

Add-CodexRuntimePath
$root = Get-RepoRoot
$logDir = Get-DevLogDir
$pidFile = Join-Path $logDir "pids.json"
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

Get-NetTCPConnection -LocalPort 3000,4000 -ErrorAction SilentlyContinue |
  Select-Object -ExpandProperty OwningProcess -Unique |
  ForEach-Object {
    $process = Get-Process -Id $_ -ErrorAction SilentlyContinue
    if ($process) {
      Stop-Process -Id $_ -Force
      Write-Host "Stopped port owner process $_"
    }
  }

Write-Host "Stopping local infrastructure..."
docker compose stop postgres mailpit minio

Write-Host "Local test environment stopped."
