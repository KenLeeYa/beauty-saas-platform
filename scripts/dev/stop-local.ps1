. "$PSScriptRoot\_env.ps1"

Add-CodexRuntimePath
$root = Get-RepoRoot
$logDir = Get-DevLogDir
$pidFile = Join-Path $logDir "pids.json"
$webPort = Get-BeautyWebPort
Set-Location $root

if (Test-Path -LiteralPath $pidFile) {
  $pids = Get-Content -LiteralPath $pidFile | ConvertFrom-Json
  if ($pids.web) {
    $process = Get-Process -Id $pids.web -ErrorAction SilentlyContinue
    if ($process -and $process.ProcessName -eq "node") {
      Stop-Process -Id $pids.web -Force
      Write-Host "Stopped Beauty web process $($pids.web)"
    }
  }
  Remove-Item -LiteralPath $pidFile -Force
}

Assert-CommandExists "npx"
$npx = Get-CommandExecutable "npx"
Write-Host "Stopping local Supabase..."
& $npx supabase stop

Write-Host "Local test environment stopped."
