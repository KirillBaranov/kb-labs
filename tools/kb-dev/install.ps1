#Requires -Version 5.1
<#
.SYNOPSIS
    kb-dev installer for Windows.
.DESCRIPTION
    Downloads kb-dev for Windows amd64, verifies the SHA-256 checksum,
    places the binary in %LOCALAPPDATA%\kb-labs\bin, and adds that directory
    to the current user's PATH.
.PARAMETER Version
    Install a specific release tag (example: v1.2.3). Defaults to latest.
.EXAMPLE
    iwr https://kblabs.ru/kb-dev/install.ps1 | iex
.EXAMPLE
    iwr https://kblabs.ru/kb-dev/install.ps1 -OutFile install.ps1; .\install.ps1 -Version v1.2.3
#>
param(
    [string]$Version = "latest"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$Repo   = "KirillBaranov/kb-labs"
$Binary = "kb-dev"
$Arch   = "amd64"
$File   = "${Binary}-windows-${Arch}.exe"
$Dest   = Join-Path $env:LOCALAPPDATA "kb-labs\bin\${Binary}.exe"

function Write-Info  { param($m) Write-Host "[INFO] $m" -ForegroundColor Cyan }
function Write-Ok    { param($m) Write-Host "[ OK ] $m" -ForegroundColor Green }
function Write-Warn  { param($m) Write-Host "[WARN] $m" -ForegroundColor Yellow }
function Write-Err   { param($m) Write-Host "[ERR ] $m" -ForegroundColor Red }

Write-Host ""
Write-Host "  KB Labs — kb-dev installer" -ForegroundColor White
Write-Host ""

$BaseUrl = $null
$ResolvedVersion = $null

if ($Version -eq "latest") {
    try {
        $releases = Invoke-RestMethod "https://api.github.com/repos/$Repo/releases?per_page=1"
        $ResolvedVersion = $releases[0].tag_name
        $BaseUrl = "https://github.com/$Repo/releases/download/$ResolvedVersion"
        Write-Info "Channel: latest (resolved to $ResolvedVersion)"
    } catch {
        Write-Warn "GitHub API unavailable; falling back to releases/latest/download."
        $BaseUrl = "https://github.com/$Repo/releases/latest/download"
    }
} else {
    $ResolvedVersion = $Version
    $BaseUrl = "https://github.com/$Repo/releases/download/$ResolvedVersion"
    Write-Info "Channel: pinned ($ResolvedVersion)"
}

$BinaryUrl   = "$BaseUrl/$File"
$ChecksumUrl = "$BaseUrl/checksums.txt"

Write-Info "Target: windows/$Arch  ->  $File"
Write-Host ""

$TmpBin = [System.IO.Path]::GetTempFileName()
$TmpSum = [System.IO.Path]::GetTempFileName()

try {
    Write-Info "Downloading $File..."
    Invoke-WebRequest -Uri $BinaryUrl -OutFile $TmpBin -UseBasicParsing

    Write-Info "Downloading checksums..."
    Invoke-WebRequest -Uri $ChecksumUrl -OutFile $TmpSum -UseBasicParsing

    $checksumLines = Get-Content $TmpSum
    $expectedLine  = $checksumLines | Where-Object { $_ -match "  ${File}$" } | Select-Object -First 1
    if (-not $expectedLine) {
        Write-Err "Checksum for $File not found in checksums.txt."
        exit 1
    }
    $Expected = ($expectedLine -split '\s+')[0]
    $Actual   = (Get-FileHash -Path $TmpBin -Algorithm SHA256).Hash.ToLower()

    if ($Expected.ToLower() -ne $Actual) {
        Write-Err "Checksum mismatch for $File."
        Write-Err "Expected: $Expected"
        Write-Err "Actual:   $Actual"
        exit 1
    }

    $BinDir = Split-Path $Dest
    if (-not (Test-Path $BinDir)) {
        New-Item -ItemType Directory -Path $BinDir -Force | Out-Null
    }
    Copy-Item -Path $TmpBin -Destination $Dest -Force

} finally {
    Remove-Item -Path $TmpBin -Force -ErrorAction SilentlyContinue
    Remove-Item -Path $TmpSum -Force -ErrorAction SilentlyContinue
}

$BinDir = Split-Path $Dest
$UserPath = [System.Environment]::GetEnvironmentVariable("PATH", "User")
if ($UserPath -notlike "*$BinDir*") {
    [System.Environment]::SetEnvironmentVariable("PATH", "$UserPath;$BinDir", "User")
    $env:PATH += ";$BinDir"
    Write-Warn "Added $BinDir to your PATH. Restart your terminal for it to take effect."
} else {
    Write-Info "$BinDir is already in your PATH."
}

Write-Host ""
Write-Ok "$Binary installed to $Dest"
Write-Ok "Checksum verified ($File)"
if ($ResolvedVersion) { Write-Ok "Version: $ResolvedVersion" }
Write-Host ""
Write-Host "Get started:" -ForegroundColor White
Write-Host "  kb-dev start" -ForegroundColor DarkGray
Write-Host "  kb-dev status" -ForegroundColor DarkGray
Write-Host ""
