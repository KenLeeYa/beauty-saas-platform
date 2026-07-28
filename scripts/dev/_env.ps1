$ErrorActionPreference = "Stop"

function Get-RepoRoot {
  return (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
}

function Add-CodexRuntimePath {
  $runtimeRoot = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies"
  $paths = @(
    (Join-Path $runtimeRoot "node\bin"),
    (Join-Path $runtimeRoot "bin"),
    (Join-Path $runtimeRoot "native\git\cmd")
  )

  foreach ($path in $paths) {
    if ((Test-Path -LiteralPath $path) -and ($env:Path -notlike "*$path*")) {
      $env:Path = "$path;$env:Path"
    }
  }
}

function Assert-CommandExists {
  param([Parameter(Mandatory = $true)][string]$Name)

  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Required command '$Name' was not found on PATH."
  }
}

function Get-CommandExecutable {
  param([Parameter(Mandatory = $true)][string]$Name)

  $command = Get-Command $Name -ErrorAction Stop
  if ($command.Source -like "*.ps1") {
    $cmdPath = Join-Path (Split-Path -Parent $command.Source) "$Name.cmd"
    if (Test-Path -LiteralPath $cmdPath) {
      return $cmdPath
    }
  }

  return $command.Source
}

function Sync-LocalEnvFile {
  $root = Get-RepoRoot
  $localEnv = Join-Path $root ".env.local"
  $npx = Get-CommandExecutable "npx"
  $previousErrorAction = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  $statusLines = & $npx supabase status -o env 2>&1
  $statusExitCode = $LASTEXITCODE
  $ErrorActionPreference = $previousErrorAction
  if ($statusExitCode -ne 0) {
    throw "Local Supabase is not running."
  }

  $values = @{}
  foreach ($line in $statusLines) {
    if ($line -match '^([A-Z0-9_]+)=(.*)$') {
      $values[$matches[1]] = $matches[2].Trim('"')
    }
  }

  foreach ($required in @("API_URL", "DB_URL", "PUBLISHABLE_KEY", "SERVICE_ROLE_KEY")) {
    if (-not $values[$required]) {
      throw "Supabase status did not return $required."
    }
  }

  $webPort = Get-BeautyWebPort
  $localAddress = Get-LocalIPv4Address
  $origins = @(
    "http://127.0.0.1:$webPort",
    "http://localhost:$webPort"
  )
  if ($localAddress) {
    $origins += "http://$($localAddress):$webPort"
  }

  $contents = @(
    "NODE_ENV=development",
    "APP_ENV=local",
    "NEXT_PUBLIC_APP_URL=http://127.0.0.1:$webPort",
    "PUBLIC_APP_ORIGINS=$($origins -join ',')",
    "",
    "DATABASE_URL=$($values.DB_URL)?pgbouncer=true&connection_limit=10",
    "DIRECT_URL=$($values.DB_URL)",
    "PRISMA_CONNECTION_LIMIT=10",
    "PRISMA_POOL_TIMEOUT_SECONDS=20",
    "",
    "NEXT_PUBLIC_SUPABASE_URL=$($values.API_URL)",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$($values.PUBLISHABLE_KEY)",
    "SUPABASE_SERVICE_ROLE_KEY=$($values.SERVICE_ROLE_KEY)",
    "NEXT_PUBLIC_GOOGLE_LOGIN_ENABLED=false",
    "",
    "SESSION_SECRET=local-only-session-secret-beauty-saas-2026",
    "CSRF_SECRET=local-only-csrf-secret-beauty-saas-2026",
    "ABUSE_HASH_SECRET=local-only-abuse-hash-secret-beauty-saas-2026",
    "TOKEN_DERIVATION_SECRET=local-only-token-secret-beauty-saas-2026",
    "TRUSTED_CLIENT_IP_HEADER=",
    "",
    "NEXT_PUBLIC_TURNSTILE_SITE_KEY=",
    "TURNSTILE_SECRET_KEY=",
    "TURNSTILE_EXPECTED_HOSTNAME=localhost",
    "TURNSTILE_ALLOW_TEST_KEYS=true",
    "",
    "CRON_SECRET=local-only-cron-secret-beauty-saas-2026",
    "RESEND_API_KEY=",
    "EMAIL_FROM=no-reply@example.com",
    "LINE_CHANNEL_SECRET=",
    "LINE_CHANNEL_ACCESS_TOKEN=",
    "",
    "ALLOW_DEMO_SEED=true",
    "ENABLE_LOCAL_AUTH_STUB=true",
    "PAYMENT_PROVIDER=manual",
    "NOTIFICATION_PROVIDER=disabled"
  )
  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  $content = ($contents -join [Environment]::NewLine) + [Environment]::NewLine
  [System.IO.File]::WriteAllText($localEnv, $content, $utf8NoBom)
  Write-Host "Synchronized .env.local with the running local Supabase stack."
}

function Get-DevLogDir {
  $root = Get-RepoRoot
  $logDir = Join-Path $root ".dev-logs"
  New-Item -ItemType Directory -Force -Path $logDir | Out-Null
  return $logDir
}

function Get-BeautyWebPort {
  if (-not $env:BEAUTY_WEB_PORT) {
    return 3100
  }

  try {
    $port = [int]$env:BEAUTY_WEB_PORT
  } catch {
    throw "BEAUTY_WEB_PORT must be a valid port number."
  }

  if ($port -lt 1 -or $port -gt 65535) {
    throw "BEAUTY_WEB_PORT must be between 1 and 65535."
  }

  return $port
}

function Get-LocalIPv4Address {
  $configurations = Get-NetIPConfiguration -ErrorAction SilentlyContinue |
    Where-Object { $_.NetAdapter.Status -eq "Up" -and $_.IPv4DefaultGateway -and $_.IPv4Address }

  foreach ($configuration in $configurations) {
    foreach ($address in @($configuration.IPv4Address.IPAddress)) {
      if ($address -and $address -ne "127.0.0.1" -and $address -notlike "169.254.*") {
        return $address
      }
    }
  }

  return $null
}

function Test-HttpEndpoint {
  param(
    [Parameter(Mandatory = $true)][string]$Url,
    [int]$TimeoutSeconds = 2
  )

  try {
    $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec $TimeoutSeconds
    return $response.StatusCode
  } catch {
    return $null
  }
}

function Assert-PortAvailable {
  param([Parameter(Mandatory = $true)][int]$Port)

  $owner = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
    Select-Object -First 1
  if ($owner) {
    throw "Port $Port is already in use by process $($owner.OwningProcess)."
  }
}
