# Filename: package-production-import.ps1
# Revision : 1.0.0
# Description : Packages approved runtime JSON files into a signed production import ZIP.
# Author : Jason Lamb (with help from Codex CLI)
# Created Date : 2026-07-22
# Modified Date : 2026-07-22
# Changelog :
# 1.0.0 initial release

[CmdletBinding()]
param(
    [string]$SourceRoot,
    [string]$OutputPath,
    [string]$ImportId
)

$ErrorActionPreference = 'Stop'
$null = Add-Type -AssemblyName System.IO.Compression -ErrorAction SilentlyContinue
$null = Add-Type -AssemblyName System.IO.Compression.FileSystem -ErrorAction SilentlyContinue
$repoRoot = Split-Path -Parent $PSScriptRoot
$resolvedSourceRoot = if (-not [string]::IsNullOrWhiteSpace($SourceRoot)) {
    $SourceRoot
} else {
    Join-Path $repoRoot 'data'
}
$resolvedSourceRoot = [System.IO.Path]::GetFullPath($resolvedSourceRoot)
if (-not (Test-Path -LiteralPath $resolvedSourceRoot -PathType Container)) {
    throw "Source root does not exist: $resolvedSourceRoot"
}

$runtimeFiles = @(
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

function Get-JsonRecordCount {
    param(
        [Parameter(Mandatory)]
        [string]$Path,
        [Parameter(Mandatory)]
        [string]$Filename
    )
    $parsed = Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json
    if ($Filename -eq 'counters.json') {
        return @($parsed.PSObject.Properties).Count
    }
    return @($parsed).Count
}

function Get-ImportSummary {
    param([hashtable]$Files)
    $collections = @{}
    foreach ($name in $Files.Keys) {
        $collections[$name] = Get-Content -LiteralPath $Files[$name].Path -Raw | ConvertFrom-Json
    }

    $positiveBalanceQuantity = 0
    foreach ($balance in @($collections['lot-location-balances.json'])) {
        $quantity = [int]($balance.quantity ?? 0)
        if ($quantity -gt 0) {
            $positiveBalanceQuantity += $quantity
        }
    }

    $receiptQuantity = 0
    $removalQuantity = 0
    foreach ($event in @($collections['inventory-events.json'])) {
        $eventType = ([string]$event.eventType).Trim().ToUpperInvariant().Replace('_', '-').Replace(' ', '-')
        $quantity = [int]($event.quantity ?? 0)
        switch ($eventType) {
            'PURCHASE-RECEIPT' { $receiptQuantity += $quantity }
            'RECEIPT' { $receiptQuantity += $quantity }
            'SMOKED' { $removalQuantity += $quantity }
            'GIFTED' { $removalQuantity += $quantity }
            'DISCARDED' { $removalQuantity += $quantity }
        }
    }

    return [ordered]@{
        Receipts = $receiptQuantity
        Removals = $removalQuantity
        OnHand = $positiveBalanceQuantity
        LotCount = @($collections['lots.json']).Count
    }
}

$now = [DateTime]::UtcNow
$ImportId = if (-not [string]::IsNullOrWhiteSpace($ImportId)) {
    $ImportId
} else {
    'prodimport-{0}-{1}' -f $now.ToString('yyyyMMdd-HHmmss'), [guid]::NewGuid().ToString('N').Substring(0, 8)
}

$fileMap = @{}
foreach ($filename in $runtimeFiles) {
    $path = Join-Path $resolvedSourceRoot $filename
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
        throw "Required runtime JSON file is missing: $filename"
    }
    $fileMap[$filename] = [ordered]@{
        Path = $path
        Sha256 = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()
        Count = Get-JsonRecordCount -Path $path -Filename $filename
    }
}

$summary = Get-ImportSummary -Files $fileMap
if ($summary.Receipts -ne 911 -or $summary.Removals -ne 0 -or $summary.OnHand -ne 911 -or $summary.LotCount -ne 88) {
    throw "Source data totals do not match the required production import baseline. Receipts=$($summary.Receipts) Removals=$($summary.Removals) OnHand=$($summary.OnHand) Lots=$($summary.LotCount)"
}

$manifest = [ordered]@{
    format = 'humidorhq-production-import-package'
    version = 1
    importId = $ImportId
    createdAtUtc = $now.ToString('yyyy-MM-ddTHH:mm:ssZ')
    expectedReceipts = 911
    expectedRemovals = 0
    expectedOnHandQuantity = 911
    expectedLotCount = 88
    files = [ordered]@{}
}

foreach ($filename in $runtimeFiles) {
    $manifest.files[$filename] = [ordered]@{
        sha256 = $fileMap[$filename].Sha256
        count = [int]$fileMap[$filename].Count
    }
}

$outputDirectory = if (-not [string]::IsNullOrWhiteSpace($OutputPath)) {
    Split-Path -Parent $OutputPath
} else {
    Join-Path $repoRoot 'production-import'
}
if (-not [string]::IsNullOrWhiteSpace($outputDirectory)) {
    New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
}
$resolvedOutputPath = if (-not [string]::IsNullOrWhiteSpace($OutputPath)) {
    [System.IO.Path]::GetFullPath($OutputPath)
} else {
    Join-Path $outputDirectory ("humidorhq-production-import-{0}.zip" -f $ImportId)
}
if (Test-Path -LiteralPath $resolvedOutputPath) {
    throw "Output file already exists: $resolvedOutputPath"
}

$zipStream = $null
$zipArchive = $null
try {
    $zipStream = [System.IO.File]::Open($resolvedOutputPath, [System.IO.FileMode]::CreateNew)
    $zipArchive = [System.IO.Compression.ZipArchive]::new($zipStream, [System.IO.Compression.ZipArchiveMode]::Create, $false)

    $manifestJson = $manifest | ConvertTo-Json -Depth 8 -Compress
    $manifestEntry = $zipArchive.CreateEntry('manifest.json', [System.IO.Compression.CompressionLevel]::Optimal)
    $manifestWriter = [System.IO.StreamWriter]::new($manifestEntry.Open(), [System.Text.UTF8Encoding]::new($false))
    try {
        $manifestWriter.Write($manifestJson)
    } finally {
        $manifestWriter.Dispose()
    }

    foreach ($filename in $runtimeFiles) {
        $entry = $zipArchive.CreateEntry($filename, [System.IO.Compression.CompressionLevel]::Optimal)
        $entryStream = $entry.Open()
        try {
            $bytes = [System.IO.File]::ReadAllBytes($fileMap[$filename].Path)
            $entryStream.Write($bytes, 0, $bytes.Length)
        } finally {
            $entryStream.Dispose()
        }
    }
}
finally {
    if ($null -ne $zipArchive) {
        $zipArchive.Dispose()
    }
    if ($null -ne $zipStream) {
        $zipStream.Dispose()
    }
}

Write-Host "Production import package created: $resolvedOutputPath"
Write-Host ("Import ID: {0}" -f $ImportId)
Write-Host ("Receipts: {0} Removals: {1} On Hand: {2} Lots: {3}" -f $summary.Receipts, $summary.Removals, $summary.OnHand, $summary.LotCount)

# Example Usage:
#   pwsh -NoProfile -File .\tools\package-production-import.ps1 -SourceRoot .\data -OutputPath .\production-import\humidorhq-production-import.zip
