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
