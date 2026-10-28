$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$pidFile = Join-Path $repoRoot '.dev-logs/msi.pid'
if (-not (Test-Path -LiteralPath $pidFile)) { Write-Output 'No recorded MSI trial process.'; exit 0 }
$trialPid = [int](Get-Content -LiteralPath $pidFile -Raw)
$trialProcess = Get-CimInstance Win32_Process -Filter "ProcessId=$trialPid"
$nextPath = Join-Path $repoRoot 'node_modules/next/dist/bin/next'
if ($trialProcess) {
  if ($trialProcess.Name -ne 'node.exe' -or -not $trialProcess.CommandLine.Contains($nextPath)) {
    throw 'Recorded PID is not the owned MSI trial process.'
  }
  Stop-Process -Id $trialPid
}
Remove-Item -LiteralPath $pidFile
Write-Output 'MSI trial stopped; database and volume preserved.'
