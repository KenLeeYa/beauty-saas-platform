$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$taskRoot = (Resolve-Path (Join-Path $repoRoot '..')).Path
$localDir = Join-Path $taskRoot 'line-booking\.local'
$credentialFile = Join-Path $localDir 'pg.env'
$pidFile = Join-Path $localDir 'integrated.pid'
$port = 45144
if (-not (Test-Path -LiteralPath $credentialFile)) { throw 'Local synthetic database credentials missing.' }
if (-not (Test-Path -LiteralPath (Join-Path $repoRoot '.next\BUILD_ID'))) { throw 'Build the candidate first.' }
if (Test-Path -LiteralPath $pidFile) {
  $saved = [int](Get-Content -LiteralPath $pidFile -Raw)
  $process = Get-Process -Id $saved -ErrorAction SilentlyContinue
  if ($process -and $process.ProcessName -eq 'node' -and
      (netstat -ano | Where-Object { $_ -match ('^\s*TCP\s+127\.0\.0\.1:45144\s+\S+\s+LISTENING\s+' + $saved + '\s*$') })) {
    Write-Output "Integrated trial: http://127.0.0.1:$port/line-booking/synthetic-beauty-line"
    foreach($role in @('customer','receptionist','beautician','owner')) {
      Write-Output ("{0}: http://127.0.0.1:{1}/api/line-booking/integrated-demo?role={0}" -f $role,$port)
    }
    exit 0
  }
  Remove-Item -LiteralPath $pidFile
}
if (netstat -ano | Where-Object { $_ -match '^\s*TCP\s+127\.0\.0\.1:45144\s+\S+\s+LISTENING' }) {
  throw "Port $port is already in use."
}
$vars = @{}
Get-Content -LiteralPath $credentialFile | ForEach-Object {
  $parts=$_.Split('=',2); if ($parts.Count -eq 2) { $vars[$parts[0]]=$parts[1] }
}
$databaseUrl='postgresql://{0}:{1}@127.0.0.1:56863/beauty_unified_test_20261005_v2' -f
  $vars.POSTGRES_USER,[Uri]::EscapeDataString($vars.POSTGRES_PASSWORD)
$keys=@('DATABASE_URL','DIRECT_URL','APP_ENV','UNIFIED_LOCAL_TRIAL',
  'LINE_BOOKING_LOCAL_DEMO','NEXT_PUBLIC_APP_URL','PUBLIC_APP_ORIGINS')
$previous=@{}
foreach($key in $keys) { $previous[$key]=[Environment]::GetEnvironmentVariable($key,'Process') }
try {
  $env:DATABASE_URL=$databaseUrl
  $env:DIRECT_URL=$databaseUrl
  $env:APP_ENV='test'
  $env:UNIFIED_LOCAL_TRIAL='true'
  $env:LINE_BOOKING_LOCAL_DEMO='false'
  $env:NEXT_PUBLIC_APP_URL="http://127.0.0.1:$port"
  $env:PUBLIC_APP_ORIGINS="http://127.0.0.1:$port"
  $node=(Get-Command node).Source
  $startArgs=@{
    FilePath=$node
    ArgumentList=@('node_modules/next/dist/bin/next','start','-p',"$port",'-H','127.0.0.1')
    WorkingDirectory=$repoRoot
    WindowStyle='Hidden'
    RedirectStandardOutput=(Join-Path $localDir 'integrated.stdout.log')
    RedirectStandardError=(Join-Path $localDir 'integrated.stderr.log')
    PassThru=$true
  }
  $process=Start-Process @startArgs
} finally {
  foreach($key in $keys) { [Environment]::SetEnvironmentVariable($key,$previous[$key],'Process') }
  $vars.Clear(); $databaseUrl=$null
}
Set-Content -LiteralPath $pidFile -Value $process.Id -Encoding ascii
$ready=$false
for($attempt=0;$attempt -lt 30;$attempt++) {
  try {
    $response=Invoke-WebRequest -Uri "http://127.0.0.1:$port/api/health" -UseBasicParsing -TimeoutSec 5
    if($response.StatusCode -eq 200) { $ready=$true; break }
  } catch {}
  Start-Sleep -Seconds 1
}
if(-not $ready) { throw 'Integrated trial did not become ready; inspect integrated.stderr.log.' }
Write-Output "Integrated trial: http://127.0.0.1:$port/line-booking/synthetic-beauty-line"
foreach($role in @('customer','receptionist','beautician','owner')) {
  Write-Output ("{0}: http://127.0.0.1:{1}/api/line-booking/integrated-demo?role={0}" -f $role,$port)
}
