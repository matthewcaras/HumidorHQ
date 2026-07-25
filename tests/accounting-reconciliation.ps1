# Filename: accounting-reconciliation.ps1
# Revision : 1.0.0
# Description : Verifies read-only purchase allocation and high-precision per-cigar integrity checks.
# Author : Jason Lamb (with help from Codex CLI)
# Created Date : 2026-07-25
# Modified Date : 2026-07-25
# Changelog :
# 1.0.0 initial isolated authoritative-total and six-decimal cost reconciliation coverage

[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$tempRoot = Join-Path ([IO.Path]::GetTempPath()) ('humidorhq-accounting-test-' + [guid]::NewGuid().ToString('N'))
$dataRoot = Join-Path $tempRoot 'data'
$testPassed = $false

function Get-RuntimeHashes {
    param([string]$Root)
    $map = [ordered]@{}
    Get-ChildItem -LiteralPath $Root -File -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -match '\.(json|jsonl)$' } |
        Sort-Object Name |
        ForEach-Object { $map[$_.Name] = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash }
    return $map
}

function Assert-HashesEqual {
    param($Expected, $Actual, [string]$Message)
    if (($Expected | ConvertTo-Json -Compress) -ne ($Actual | ConvertTo-Json -Compress)) {
        throw $Message
    }
}

function Set-JsonArray {
    param([string]$Name, [object[]]$Rows)
    $Rows | ConvertTo-Json -Depth 12 -AsArray |
        Set-Content -LiteralPath (Join-Path $dataRoot "$Name.json") -Encoding utf8NoBOM
}

$sourceHashesBefore = Get-RuntimeHashes -Root (Join-Path $repoRoot 'data')
try {
    New-Item -ItemType Directory -Path $dataRoot -Force | Out-Null
    Get-ChildItem -LiteralPath (Join-Path $repoRoot 'seed-data') -File |
        Copy-Item -Destination $dataRoot -Force

    $timestamp = '2026-07-25T12:00:00Z'
    Set-JsonArray 'catalog-cigars' @(
        [ordered]@{ id = 1; manufacturer = 'Accounting'; series = 'Fixture'; isActive = $true; createdAt = $timestamp; updatedAt = $timestamp }
    )
    Set-JsonArray 'vendors' @(
        [ordered]@{ id = 1; name = 'Accounting Vendor'; isActive = $true; createdAt = $timestamp; updatedAt = $timestamp }
    )
    Set-JsonArray 'storage-locations' @(
        [ordered]@{ id = 1; name = 'Accounting Humidor'; isActive = $true; createdAt = $timestamp; updatedAt = $timestamp }
    )
    Set-JsonArray 'purchases' @(
        [ordered]@{
            id = 1; vendorId = 1; purchaseDate = '2026-07-25'; receivedDate = '2026-07-25'; status = 'received'
            subtotal = '1.00'; shipping = '0.00'; exciseTax = '0.00'; salesTax = '0.00'; discount = '0.00'
            totalPaid = '1.00'; createdAt = $timestamp; updatedAt = $timestamp
        }
    )
    Set-JsonArray 'purchase-lines' @(
        [ordered]@{
            id = 1; purchaseId = 1; catalogCigarId = 1; storageLocationId = 1; storageSubLocationId = $null
            quantity = 3; purchasePrice = '1.00'; lineSubtotal = '1.00'; allocatedShipping = '0.00'
            allocatedExciseTax = '0.00'; allocatedSalesTax = '0.00'; allocatedDiscount = '0.00'
            trueCostBasis = '1.00'; trueCostPerCigar = '0.333333'; createdAt = $timestamp; updatedAt = $timestamp
        }
    )
    Set-JsonArray 'lots' @(
        [ordered]@{
            id = 1; purchaseLineId = 1; purchaseId = 1; catalogCigarId = 1; initialQuantity = 3; currentQuantity = 3
            receivedDateSnapshot = '2026-07-25'; costPerCigarSnapshot = '0.333333'; createdAt = $timestamp; updatedAt = $timestamp
        }
    )
    Set-JsonArray 'lot-location-balances' @(
        [ordered]@{
            id = 1; lotId = 1; purchaseLineId = 1; purchaseId = 1; catalogCigarId = 1
            storageLocationId = 1; storageSubLocationId = $null; quantity = 3; createdAt = $timestamp; updatedAt = $timestamp
        }
    )
    Set-JsonArray 'inventory-events' @(
        [ordered]@{
            id = 1; eventType = 'purchase-receipt'; lotId = 1; purchaseLineId = 1; purchaseId = 1
            catalogCigarId = 1; storageLocationId = 1; quantity = 3; eventDate = '2026-07-25'
            costPerCigarAtEvent = '0.333333'; createdAt = $timestamp; updatedAt = $timestamp
        }
    )
    Set-JsonArray 'storage-sub-locations' @()
    Set-JsonArray 'smoking-journal-entries' @()

    $countersPath = Join-Path $dataRoot 'counters.json'
    $counters = Get-Content -LiteralPath $countersPath -Raw | ConvertFrom-Json
    foreach ($name in @('catalog-cigars', 'vendors', 'storage-locations', 'purchases', 'purchase-lines', 'lots', 'lot-location-balances', 'inventory-events')) {
        $counters.PSObject.Properties[$name].Value = 2
    }
    $counters | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $countersPath -Encoding utf8NoBOM

    $cleanHashes = Get-RuntimeHashes -Root $dataRoot
    $cleanOutput = @(& pwsh -NoProfile -File (Join-Path $repoRoot 'tools/check-data-integrity.ps1') -DataRoot $dataRoot)
    $cleanText = $cleanOutput -join "`n"
    if ($LASTEXITCODE -ne 0 -or $cleanText -notmatch '\[SUMMARY\] Errors=0 Warnings=0') {
        throw "Clean accounting fixture failed integrity validation.`n$($cleanOutput -join "`n")"
    }
    if ($cleanText -notmatch 'Stored authoritative purchase totalPaid: \$1\.00' -or $cleanText -notmatch 'Deterministic line allocation total: \$1\.00') {
        throw 'Clean accounting fixture did not report reconciled authoritative totals.'
    }
    Assert-HashesEqual $cleanHashes (Get-RuntimeHashes -Root $dataRoot) 'The integrity checker wrote to the clean fixture.'

    $linesPath = Join-Path $dataRoot 'purchase-lines.json'
    $lines = @(Get-Content -LiteralPath $linesPath -Raw | ConvertFrom-Json)
    $lines[0].trueCostPerCigar = '0.33'
    Set-JsonArray 'purchase-lines' $lines
    $lotsPath = Join-Path $dataRoot 'lots.json'
    $lots = @(Get-Content -LiteralPath $lotsPath -Raw | ConvertFrom-Json)
    $lots[0].costPerCigarSnapshot = '0.33'
    Set-JsonArray 'lots' $lots
    $eventsPath = Join-Path $dataRoot 'inventory-events.json'
    $events = @(Get-Content -LiteralPath $eventsPath -Raw | ConvertFrom-Json)
    $events[0].costPerCigarAtEvent = '0.33'
    Set-JsonArray 'inventory-events' $events

    $roundedHashes = Get-RuntimeHashes -Root $dataRoot
    $roundedOutput = @(& pwsh -NoProfile -File (Join-Path $repoRoot 'tools/check-data-integrity.ps1') -DataRoot $dataRoot)
    $roundedText = $roundedOutput -join "`n"
    foreach ($code in @('LINE_UNIT_COST_ROUNDING_MISMATCH', 'LOT_COST_SNAPSHOT_MISMATCH', 'EVENT_COST_SNAPSHOT_MISMATCH')) {
        if ($roundedText -notmatch [regex]::Escape("[$code]")) {
            throw "Integrity checker did not detect $code."
        }
    }
    if ($LASTEXITCODE -ne 0 -or $roundedText -notmatch '\[SUMMARY\] Errors=0 Warnings=3') {
        throw "Rounded accounting fixture returned an unexpected result.`n$roundedText"
    }
    Assert-HashesEqual $roundedHashes (Get-RuntimeHashes -Root $dataRoot) 'The integrity checker wrote to the rounded fixture.'
    Assert-HashesEqual $sourceHashesBefore (Get-RuntimeHashes -Root (Join-Path $repoRoot 'data')) 'Repository runtime data changed during accounting tests.'

    $testPassed = $true
    Write-Host 'PASS: authoritative purchase allocation, six-decimal unit costs, mismatch detection, and read-only hash preservation.'
}
finally {
    if ($testPassed -and (Test-Path -LiteralPath $tempRoot)) {
        Remove-Item -LiteralPath $tempRoot -Recurse -Force
    } elseif (Test-Path -LiteralPath $tempRoot) {
        Write-Warning "Accounting test diagnostics preserved at $tempRoot"
    }
}

# Example Usage:
#   pwsh -NoProfile -File .\tests\accounting-reconciliation.ps1
