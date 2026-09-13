[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$HarnieVersion = "0.1.0-rc.9"
$HarnieReleaseBase = "https://boringinfra.company/harnie/releases/v$HarnieVersion"
$HarnieArchive = "harnie-$HarnieVersion.tgz"
$HarnieChecksum = "$HarnieArchive.sha256"

function Fail-HarnieInstall {
  param([Parameter(Mandatory = $true)][string]$Message)
  throw "harnie installer: $Message"
}

function Get-RequiredCommand {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][string]$FailureMessage
  )

  $Command = Get-Command $Name -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($null -eq $Command) {
    Fail-HarnieInstall $FailureMessage
  }
  return $Command
}

$InstallDirectory = $null

try {
  $NodeCommand = Get-RequiredCommand "node" "Node.js 22.23 or newer in the Node 22 release line is required"
  $NpmCommand = Get-RequiredCommand "npm" "npm is required"

  $NodeVersion = ((& $NodeCommand.Source -p "process.versions.node") | Out-String).Trim()
  if ($LASTEXITCODE -ne 0 -or $NodeVersion -notmatch '^(?<major>\d+)\.(?<minor>\d+)\.(?<patch>\d+)') {
    Fail-HarnieInstall "could not determine the Node.js version"
  }
  if ([int]$Matches.major -ne 22 -or [int]$Matches.minor -lt 23) {
    Fail-HarnieInstall "Node.js 22.23 or newer in the Node 22 release line is required; found $NodeVersion"
  }

  $InstallDirectory = Join-Path ([System.IO.Path]::GetTempPath()) "harnie-install-$([Guid]::NewGuid().ToString('N'))"
  [System.IO.Directory]::CreateDirectory($InstallDirectory) | Out-Null
  $ArchivePath = Join-Path $InstallDirectory $HarnieArchive
  $ChecksumPath = Join-Path $InstallDirectory $HarnieChecksum

  Write-Host "Downloading Harnie $HarnieVersion..."
  Invoke-WebRequest -UseBasicParsing -Uri "$HarnieReleaseBase/$HarnieArchive" -OutFile $ArchivePath
  Invoke-WebRequest -UseBasicParsing -Uri "$HarnieReleaseBase/$HarnieChecksum" -OutFile $ChecksumPath

  $ChecksumContents = (Get-Content -LiteralPath $ChecksumPath -Raw).Trim()
  if ($ChecksumContents -notmatch '^(?<hash>[A-Fa-f0-9]{64})(?:\s+\*?.+)?$') {
    Fail-HarnieInstall "the checksum file is malformed"
  }
  $ExpectedHash = $Matches.hash.ToLowerInvariant()
  $ActualHash = (Get-FileHash -LiteralPath $ArchivePath -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($ActualHash -ne $ExpectedHash) {
    Fail-HarnieInstall "checksum verification failed"
  }

  & $NpmCommand.Source install --global $ArchivePath
  if ($LASTEXITCODE -ne 0) {
    Fail-HarnieInstall "npm failed to install Harnie"
  }

  $HarnieCommand = Get-RequiredCommand "harnie" "npm installed Harnie, but harnie is not on PATH"
  $InstalledVersion = ((& $HarnieCommand.Source --version) | Out-String).Trim()
  if ($LASTEXITCODE -ne 0) {
    Fail-HarnieInstall "Harnie was installed but could not be run"
  }
  if ($InstalledVersion -ne "harnie $HarnieVersion") {
    Fail-HarnieInstall "expected harnie $HarnieVersion, found $InstalledVersion"
  }

  Write-Host ""
  Write-Host "Harnie $HarnieVersion installed successfully."
  Write-Host "Run ``harnie init`` to create your local store."
}
catch {
  # Keep `irm ... | iex` failures terminating without closing the caller's
  # interactive PowerShell session.
  throw $_.Exception
}
finally {
  if ($null -ne $InstallDirectory -and (Test-Path -LiteralPath $InstallDirectory)) {
    Remove-Item -LiteralPath $InstallDirectory -Recurse -Force
  }
}
