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

function Ensure-LocalEnvFile {
  $root = Get-RepoRoot
  $localEnv = Join-Path $root ".env.local"
  $exampleEnv = Join-Path $root ".env.example"

  if (-not (Test-Path -LiteralPath $localEnv)) {
    Copy-Item -LiteralPath $exampleEnv -Destination $localEnv
    Write-Host "Created .env.local from .env.example"
  }
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

function Stop-LocalPortOwners {
  param([Parameter(Mandatory = $true)][int[]]$Ports)

  Get-NetTCPConnection -LocalPort $Ports -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique |
    Where-Object { $_ -gt 0 } |
    ForEach-Object {
      $process = Get-Process -Id $_ -ErrorAction SilentlyContinue
      if ($process) {
        Stop-Process -Id $_ -Force
        Write-Host "Stopped port owner process $_"
      }
    }
}
