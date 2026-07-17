# Filename: copy-runtime-data.ps1
# Revision : 1.0.0
# Description : Guardedly copies HumidorHQ seed or legacy JSON into a new external runtime data directory.
# Author : Jason Lamb (with help from Codex CLI)
# Created Date : 2026-07-17
# Modified Date : 2026-07-17
# Changelog :
# 1.0.0 initial dry-run-first external runtime data copy with hash manifest and rollback

[CmdletBinding()]
param(
    [string]$SourceRoot,

    [Parameter(Mandatory = $true)]
    [string]$DestinationRoot,

    [Parameter(Mandatory = $true)]
    [string]$ManifestRoot,

    [switch]$Apply,

    [string]$Confirmation
)

$ErrorActionPreference = 'Stop'
$requiredConfirmation = 'COPY-HUMIDORHQ-RUNTIME-DATA'
$repoRoot = [System.IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$resolvedSourceRoot = if ([string]::IsNullOrWhiteSpace($SourceRoot)) {
    [System.IO.Path]::GetFullPath((Join-Path $repoRoot 'seed-data'))
} else {
    [System.IO.Path]::GetFullPath($SourceRoot)
}
$resolvedDestinationRoot = [System.IO.Path]::GetFullPath($DestinationRoot)
$resolvedManifestRoot = [System.IO.Path]::GetFullPath($ManifestRoot)
$pathComparison = if ($IsWindows -or $env:OS -eq 'Windows_NT') {
    [System.StringComparison]::OrdinalIgnoreCase
} else {
    [System.StringComparison]::Ordinal
}
$requiredFiles = @(
    'auth-users.json',
    'catalog-cigars.json',
    'counters.json',
    'inventory-events.json',
    'lot-location-balances.json',
    'lots.json',
    'purchase-lines.json',
    'purchases.json',
    'smoking-journal-entries.json',
    'storage-locations.json',
    'storage-sub-locations.json',
    'vendors.json'
)

function Test-SamePath {
    param([string]$Left, [string]$Right)
    return [string]::Equals(
        [System.IO.Path]::TrimEndingDirectorySeparator([System.IO.Path]::GetFullPath($Left)),
        [System.IO.Path]::TrimEndingDirectorySeparator([System.IO.Path]::GetFullPath($Right)),
        $pathComparison
    )
}

function Test-PathWithin {
    param([string]$Candidate, [string]$Parent)
    $candidatePath = [System.IO.Path]::TrimEndingDirectorySeparator([System.IO.Path]::GetFullPath($Candidate))
    $parentPath = [System.IO.Path]::TrimEndingDirectorySeparator([System.IO.Path]::GetFullPath($Parent))
    if ([string]::Equals($candidatePath, $parentPath, $pathComparison)) { return $true }
    return $candidatePath.StartsWith($parentPath + [System.IO.Path]::DirectorySeparatorChar, $pathComparison)
}

function Assert-ValidJsonFile {
    param([string]$Path)
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        throw "Required source file is missing: $([System.IO.Path]::GetFileName($Path))"
    }
    try {
        $null = Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json
    } catch {
        throw "Required source file is malformed: $([System.IO.Path]::GetFileName($Path))"
    }
}

if (-not (Test-Path -LiteralPath $resolvedSourceRoot -PathType Container)) {
    throw "SourceRoot does not exist: $resolvedSourceRoot"
}
if (Test-SamePath $resolvedSourceRoot $resolvedDestinationRoot) {
    throw 'SourceRoot and DestinationRoot must be different directories.'
}
if (Test-PathWithin $resolvedDestinationRoot $repoRoot) {
    throw 'DestinationRoot must be outside the HumidorHQ repository.'
}
if (Test-PathWithin $resolvedManifestRoot $repoRoot) {
    throw 'ManifestRoot must be outside the HumidorHQ repository.'
}
if ((Test-SamePath $resolvedManifestRoot $resolvedDestinationRoot) -or
    (Test-PathWithin $resolvedManifestRoot $resolvedDestinationRoot)) {
    throw 'ManifestRoot must be outside DestinationRoot.'
}
if ($Apply -and $Confirmation -cne $requiredConfirmation) {
    throw "Apply mode requires -Confirmation '$requiredConfirmation'."
}

foreach ($filename in $requiredFiles) {
    Assert-ValidJsonFile (Join-Path $resolvedSourceRoot $filename)
}
$optionalFiles = @()
$auditSource = Join-Path $resolvedSourceRoot 'audit-log.jsonl'
if (Test-Path -LiteralPath $auditSource -PathType Leaf) { $optionalFiles += 'audit-log.jsonl' }
$filesToCopy = @($requiredFiles + $optionalFiles)

if (Test-Path -LiteralPath $resolvedDestinationRoot) {
    if (-not (Test-Path -LiteralPath $resolvedDestinationRoot -PathType Container)) {
        throw 'DestinationRoot exists and is not a directory.'
    }
    if (@(Get-ChildItem -LiteralPath $resolvedDestinationRoot -Force).Count -gt 0) {
        throw 'DestinationRoot must be new or empty; this utility never overwrites runtime data.'
    }
}

Write-Output "[DRY RUN] Source files validated: $($filesToCopy.Count)"
Write-Output "[DRY RUN] Destination: $resolvedDestinationRoot"
Write-Output "[DRY RUN] Manifest directory: $resolvedManifestRoot"
if (-not $Apply) {
    Write-Output '[DRY RUN] No directories or files were created. Pass -Apply with the exact confirmation token to copy.'
    exit 0
}

$destinationCreated = $false
$manifestCreated = $false
$copiedPaths = @()
$manifestPath = $null
try {
    if (-not (Test-Path -LiteralPath $resolvedDestinationRoot -PathType Container)) {
        $null = New-Item -ItemType Directory -Path $resolvedDestinationRoot
        $destinationCreated = $true
    }
    if (-not (Test-Path -LiteralPath $resolvedManifestRoot -PathType Container)) {
        $null = New-Item -ItemType Directory -Path $resolvedManifestRoot -Force
        $manifestCreated = $true
    }

    $manifestRows = @()
    foreach ($filename in $filesToCopy) {
        $sourcePath = Join-Path $resolvedSourceRoot $filename
        $destinationPath = Join-Path $resolvedDestinationRoot $filename
        if (Test-Path -LiteralPath $destinationPath) {
            throw "Destination file unexpectedly exists: $filename"
        }
        Copy-Item -LiteralPath $sourcePath -Destination $destinationPath
        $copiedPaths += $destinationPath
        $sourceHash = (Get-FileHash -LiteralPath $sourcePath -Algorithm SHA256).Hash
        $destinationHash = (Get-FileHash -LiteralPath $destinationPath -Algorithm SHA256).Hash
        if ($sourceHash -ne $destinationHash) {
            throw "Hash verification failed after copying: $filename"
        }
        $manifestRows += [ordered]@{
            file = $filename
            bytes = (Get-Item -LiteralPath $destinationPath).Length
            sha256 = $sourceHash
        }
    }

    $timestamp = Get-Date -Format 'yyyyMMdd-HHmmssfff'
    $manifestPath = Join-Path $resolvedManifestRoot "humidorhq-runtime-copy-$timestamp.json"
    $manifest = [ordered]@{
        createdAtUtc = [datetime]::UtcNow.ToString("yyyy-MM-dd'T'HH:mm:ss'Z'")
        sourceRoot = $resolvedSourceRoot
        destinationRoot = $resolvedDestinationRoot
        files = $manifestRows
    }
    [System.IO.File]::WriteAllText(
        $manifestPath,
        (($manifest | ConvertTo-Json -Depth 6) + [Environment]::NewLine),
        [System.Text.UTF8Encoding]::new($false)
    )

    foreach ($filename in $requiredFiles) {
        Assert-ValidJsonFile (Join-Path $resolvedDestinationRoot $filename)
    }
    Write-Output "[SUCCESS] Copied and hash-verified $($filesToCopy.Count) runtime files."
    Write-Output "[SUCCESS] Manifest: $manifestPath"
    Write-Output '[NEXT] Set HUMIDORHQ_DATA_ROOT to the destination. If auth-users.json is empty, create a user before starting the app.'
} catch {
    foreach ($path in $copiedPaths) {
        Remove-Item -LiteralPath $path -Force -ErrorAction SilentlyContinue
    }
    if ($manifestPath) { Remove-Item -LiteralPath $manifestPath -Force -ErrorAction SilentlyContinue }
    if ($destinationCreated -and (Test-Path -LiteralPath $resolvedDestinationRoot)) {
        Remove-Item -LiteralPath $resolvedDestinationRoot -Force -ErrorAction SilentlyContinue
    }
    if ($manifestCreated -and (Test-Path -LiteralPath $resolvedManifestRoot) -and
        (@(Get-ChildItem -LiteralPath $resolvedManifestRoot -Force).Count -eq 0)) {
        Remove-Item -LiteralPath $resolvedManifestRoot -Force -ErrorAction SilentlyContinue
    }
    throw "Runtime data copy failed and created files were removed. $($_.Exception.Message)"
}

# Example Usage:
#   # Preview a new empty runtime initialized from tracked seed data:
#   .\tools\copy-runtime-data.ps1 -DestinationRoot 'C:\HumidorHQ\runtime-data' -ManifestRoot 'C:\HumidorHQ\migration-manifests'
#   # Preserve current legacy local data in a new external runtime directory:
#   .\tools\copy-runtime-data.ps1 -SourceRoot '.\data' -DestinationRoot 'C:\HumidorHQ\runtime-data' -ManifestRoot 'C:\HumidorHQ\migration-manifests' -Apply -Confirmation 'COPY-HUMIDORHQ-RUNTIME-DATA'
