# Filename: repair-inventory-only.ps1
# Revision : 1.0.0
# Description : Applies the narrowly scoped Balance 66 and Lot quantity-cache repair to an offline data root.
# Author : Jason Lamb (with help from Codex CLI)
# Created Date : 2026-07-17
# Modified Date : 2026-07-17
# Changelog :
# 1.0.0 initial preconditioned inventory-only repair with external backup and verification

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$DataRoot,

    [Parameter(Mandatory = $true)]
    [string]$BackupRoot,

    [switch]$Apply,

    [switch]$AllowRepositoryData,

    [string]$Confirmation
)

$ErrorActionPreference = 'Stop'
$requiredConfirmation = 'APPLY-INVENTORY-REPAIR'
$repoRoot = [System.IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$repositoryDataRoot = [System.IO.Path]::GetFullPath((Join-Path $repoRoot 'data'))
$resolvedDataRoot = [System.IO.Path]::GetFullPath($DataRoot)
$resolvedBackupRoot = [System.IO.Path]::GetFullPath($BackupRoot)
$pathComparison = if ($IsWindows -or $env:OS -eq 'Windows_NT') {
    [System.StringComparison]::OrdinalIgnoreCase
} else {
    [System.StringComparison]::Ordinal
}

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

function Read-JsonFile {
    param([string]$Path)
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        throw "Required data file is missing: $([System.IO.Path]::GetFileName($Path))"
    }
    try {
        return @(Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json)
    } catch {
        throw "Required data file is malformed: $([System.IO.Path]::GetFileName($Path))"
    }
}

function Get-SingleRecord {
    param([object[]]$Rows, [int]$Id, [string]$CollectionName)
    $matches = @($Rows | Where-Object { [int]$_.id -eq $Id })
    if ($matches.Count -ne 1) {
        throw "Precondition failed: expected exactly one $CollectionName record with id $Id; found $($matches.Count)."
    }
    return $matches[0]
}

function Assert-Equal {
    param($Actual, $Expected, [string]$Description)
    if ($null -eq $Expected) {
        if ($null -ne $Actual -and [string]$Actual -ne '') {
            throw "Precondition failed: $Description expected null; found '$Actual'."
        }
        return
    }
    if ([string]$Actual -ne [string]$Expected) {
        throw "Precondition failed: $Description expected '$Expected'; found '$Actual'."
    }
}

function Get-FileHashValue {
    param([string]$Path)
    return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash
}

function Get-TextHash {
    param([string]$Text)
    $algorithm = [System.Security.Cryptography.SHA256]::Create()
    try {
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($Text)
        return ([System.BitConverter]::ToString($algorithm.ComputeHash($bytes))).Replace('-', '')
    } finally {
        $algorithm.Dispose()
    }
}

function Get-SnapshotHash {
    param([object[]]$Lots, [object[]]$Events)
    $snapshot = [ordered]@{
        lots = @($Lots | Sort-Object { [int]$_.id } | ForEach-Object {
            [ordered]@{
                id = $_.id
                actualCostPerCigar = $_.actualCostPerCigar
                allocatedCostPerCigar = $_.allocatedCostPerCigar
                costPerCigarSnapshot = $_.costPerCigarSnapshot
                msrpPerCigarSnapshot = $_.msrpPerCigarSnapshot
            }
        })
        events = @($Events | Sort-Object { [int]$_.id } | ForEach-Object {
            [ordered]@{
                id = $_.id
                costPerCigarAtEvent = $_.costPerCigarAtEvent
                msrpPerCigarAtEvent = $_.msrpPerCigarAtEvent
            }
        })
    }
    return Get-TextHash ($snapshot | ConvertTo-Json -Depth 8 -Compress)
}

function Get-CollectionSemanticHash {
    param([object[]]$Rows)
    return Get-TextHash ($Rows | ConvertTo-Json -Depth 100 -Compress)
}

function Normalize-EventType {
    param($Value)
    return ([string]$Value).Trim().ToUpperInvariant().Replace('_', '-').Replace(' ', '-')
}

function Write-JsonCandidate {
    param([object[]]$Rows, [string]$Path)
    $json = if ($Rows.Count -eq 0) { '[]' } else { $Rows | ConvertTo-Json -Depth 100 }
    [System.IO.File]::WriteAllText($Path, $json + [Environment]::NewLine, [System.Text.UTF8Encoding]::new($false))
    $null = Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json
}

function Assert-RepairMetrics {
    param([object[]]$Balances, [object[]]$Lots, [object[]]$Events)
    $positiveInventory = [int](($Balances | Where-Object { [int]$_.quantity -gt 0 } | Measure-Object quantity -Sum).Sum ?? 0)
    $receipts = 0
    $removals = 0
    foreach ($event in $Events) {
        $type = Normalize-EventType $event.eventType
        $quantity = [int]($event.quantity ?? 0)
        if ($type -in @('PURCHASE-RECEIPT', 'RECEIPT', 'RECEIVED')) { $receipts += $quantity }
        if ($type -in @('SMOKED', 'GIFTED', 'DISCARDED', 'DISCARD', 'DAMAGED')) { $removals += $quantity }
    }
    $locationZeroCount = @($Balances | Where-Object { [int]($_.storageLocationId ?? 0) -eq 0 }).Count
    $lotMismatchCount = 0
    foreach ($lot in $Lots) {
        $lotId = [int]$lot.id
        $balanceQuantity = [int](($Balances | Where-Object { [int]$_.lotId -eq $lotId -and [int]$_.quantity -gt 0 } | Measure-Object quantity -Sum).Sum ?? 0)
        if ([int]($lot.currentQuantity ?? 0) -ne $balanceQuantity) { $lotMismatchCount++ }
    }

    $expected = [ordered]@{
        Receipts = 910
        Removals = 17
        PositiveInventory = 893
        Lots = 80
        LocationZeroBalances = 0
        LotCurrentQuantityMismatches = 0
    }
    $actual = [ordered]@{
        Receipts = $receipts
        Removals = $removals
        PositiveInventory = $positiveInventory
        Lots = $Lots.Count
        LocationZeroBalances = $locationZeroCount
        LotCurrentQuantityMismatches = $lotMismatchCount
    }
    foreach ($key in $expected.Keys) {
        if ([int]$actual[$key] -ne [int]$expected[$key]) {
            throw "Postcondition failed: $key expected $($expected[$key]); found $($actual[$key])."
        }
        Write-Output "[PASS] $key=$($actual[$key])"
    }
}

if (-not (Test-Path -LiteralPath $resolvedDataRoot -PathType Container)) {
    throw "DataRoot does not exist: $resolvedDataRoot"
}
if (Test-SamePath $resolvedDataRoot $resolvedBackupRoot) {
    throw 'BackupRoot must be outside DataRoot.'
}
if (Test-PathWithin $resolvedBackupRoot $resolvedDataRoot) {
    throw 'BackupRoot must not be DataRoot or a child of DataRoot.'
}
if ($Apply -and $Confirmation -cne $requiredConfirmation) {
    throw "Apply mode requires -Confirmation '$requiredConfirmation'."
}
if ((Test-SamePath $resolvedDataRoot $repositoryDataRoot) -and -not $AllowRepositoryData) {
    throw 'Repository runtime data is protected. Use an isolated copied DataRoot, or explicitly pass -AllowRepositoryData for a separately authorized live repair.'
}

$balancesPath = Join-Path $resolvedDataRoot 'lot-location-balances.json'
$lotsPath = Join-Path $resolvedDataRoot 'lots.json'
$eventsPath = Join-Path $resolvedDataRoot 'inventory-events.json'
$journalPath = Join-Path $resolvedDataRoot 'smoking-journal-entries.json'
$countersPath = Join-Path $resolvedDataRoot 'counters.json'
$purchasesPath = Join-Path $resolvedDataRoot 'purchases.json'
$purchaseLinesPath = Join-Path $resolvedDataRoot 'purchase-lines.json'
$locationsPath = Join-Path $resolvedDataRoot 'storage-locations.json'
$sectionsPath = Join-Path $resolvedDataRoot 'storage-sub-locations.json'

$balances = Read-JsonFile $balancesPath
$lots = Read-JsonFile $lotsPath
$events = Read-JsonFile $eventsPath
$journals = Read-JsonFile $journalPath
$locations = Read-JsonFile $locationsPath
$sections = Read-JsonFile $sectionsPath
$null = Read-JsonFile $countersPath
$null = Read-JsonFile $purchasesPath
$null = Read-JsonFile $purchaseLinesPath

$balance66 = Get-SingleRecord $balances 66 'balance'
Assert-Equal $balance66.lotId 65 'balance 66 lotId'
Assert-Equal $balance66.purchaseLineId 65 'balance 66 purchaseLineId'
Assert-Equal $balance66.purchaseId 31 'balance 66 purchaseId'
Assert-Equal $balance66.storageLocationId 0 'balance 66 storageLocationId'
Assert-Equal $balance66.storageSubLocationId $null 'balance 66 storageSubLocationId'
Assert-Equal $balance66.quantity 3 'balance 66 quantity'

$destination = Get-SingleRecord $locations 1 'storage location'
$destinationSection = Get-SingleRecord $sections 11 'storage section'
Assert-Equal $destinationSection.storageLocationId 1 'section 11 storageLocationId'

$lotRepairs = @(
    [ordered]@{ id = 30; before = 21; after = 16 },
    [ordered]@{ id = 54; before = 5; after = 2 },
    [ordered]@{ id = 65; before = 21; after = 20 },
    [ordered]@{ id = 70; before = 10; after = 2 }
)
foreach ($repair in $lotRepairs) {
    $lot = Get-SingleRecord $lots $repair.id 'Lot'
    Assert-Equal $lot.currentQuantity $repair.before "Lot $($repair.id) currentQuantity"
}

$sourceFiles = @(Get-ChildItem -LiteralPath $resolvedDataRoot -File | Where-Object { $_.Extension -in @('.json', '.jsonl') } | Sort-Object Name)
$beforeHashes = @{}
foreach ($file in $sourceFiles) { $beforeHashes[$file.Name] = Get-FileHashValue $file.FullName }
$beforeSnapshotHash = Get-SnapshotHash $lots $events
$beforeBalanceSemanticHash = Get-CollectionSemanticHash $balances
$beforeLotSemanticHash = Get-CollectionSemanticHash $lots
$beforeBalanceCount = $balances.Count
$beforeEventCount = $events.Count
$beforeJournalCount = $journals.Count
$beforeBalanceQuantityHash = Get-TextHash (($balances | Sort-Object { [int]$_.id } | ForEach-Object { "$(($_.id)):$($_.quantity)" }) -join '|')

Write-Output '[PASS] Exact before-value preconditions matched.'
if (-not $Apply) {
    Write-Output '[DRY RUN] No backup or data changes were made. Pass -Apply with the exact confirmation token to execute.'
    exit 0
}

if (-not (Test-Path -LiteralPath $resolvedBackupRoot -PathType Container)) {
    $null = New-Item -ItemType Directory -Path $resolvedBackupRoot -Force
}
$timestamp = Get-Date -Format 'yyyyMMdd-HHmmssfff'
$backupDirectory = Join-Path $resolvedBackupRoot "humidorhq-inventory-repair-$timestamp"
if (Test-Path -LiteralPath $backupDirectory) { throw "Backup destination already exists: $backupDirectory" }
$null = New-Item -ItemType Directory -Path $backupDirectory

$manifestRows = @()
foreach ($file in $sourceFiles) {
    $backupPath = Join-Path $backupDirectory $file.Name
    Copy-Item -LiteralPath $file.FullName -Destination $backupPath
    $sourceHash = Get-FileHashValue $file.FullName
    $backupHash = Get-FileHashValue $backupPath
    if ($sourceHash -ne $backupHash) { throw "Backup verification failed for $($file.Name)." }
    $manifestRows += [pscustomobject]@{
        File = $file.Name
        Length = $file.Length
        SHA256 = $sourceHash
    }
}
$manifestPath = Join-Path $backupDirectory 'sha256-manifest.csv'
$manifestRows | Export-Csv -LiteralPath $manifestPath -NoTypeInformation -Encoding utf8
Write-Output "[PASS] Timestamped backup and hash manifest created: $backupDirectory"

$balance66.storageLocationId = 1
$balance66.storageSubLocationId = 11
foreach ($repair in $lotRepairs) {
    (Get-SingleRecord $lots $repair.id 'Lot').currentQuantity = $repair.after
}

$balancesCandidate = Join-Path $resolvedDataRoot '.lot-location-balances.repair.tmp'
$lotsCandidate = Join-Path $resolvedDataRoot '.lots.repair.tmp'
try {
    Write-JsonCandidate $balances $balancesCandidate
    Write-JsonCandidate $lots $lotsCandidate
    [System.IO.File]::Move($balancesCandidate, $balancesPath, $true)
    [System.IO.File]::Move($lotsCandidate, $lotsPath, $true)

    $afterBalances = Read-JsonFile $balancesPath
    $afterLots = Read-JsonFile $lotsPath
    $afterEvents = Read-JsonFile $eventsPath
    $afterJournals = Read-JsonFile $journalPath
    $afterBalance66 = Get-SingleRecord $afterBalances 66 'balance'
    Assert-Equal $afterBalance66.storageLocationId 1 'repaired balance 66 storageLocationId'
    Assert-Equal $afterBalance66.storageSubLocationId 11 'repaired balance 66 storageSubLocationId'
    Assert-Equal $afterBalance66.quantity 3 'repaired balance 66 quantity'
    foreach ($repair in $lotRepairs) {
        Assert-Equal (Get-SingleRecord $afterLots $repair.id 'Lot').currentQuantity $repair.after "repaired Lot $($repair.id) currentQuantity"
    }

    $normalizedBalances = @(($afterBalances | ConvertTo-Json -Depth 100) | ConvertFrom-Json)
    $normalizedBalance66 = Get-SingleRecord $normalizedBalances 66 'normalized balance'
    $normalizedBalance66.storageLocationId = 0
    $normalizedBalance66.storageSubLocationId = $null
    if ((Get-CollectionSemanticHash $normalizedBalances) -ne $beforeBalanceSemanticHash) {
        throw 'Postcondition failed: balance data changed outside the two approved Balance 66 location fields.'
    }
    $normalizedLots = @(($afterLots | ConvertTo-Json -Depth 100) | ConvertFrom-Json)
    foreach ($repair in $lotRepairs) {
        (Get-SingleRecord $normalizedLots $repair.id 'normalized Lot').currentQuantity = $repair.before
    }
    if ((Get-CollectionSemanticHash $normalizedLots) -ne $beforeLotSemanticHash) {
        throw 'Postcondition failed: Lot data changed outside the four approved currentQuantity fields.'
    }
    if ($afterBalances.Count -ne $beforeBalanceCount) { throw 'Postcondition failed: balance record count changed.' }
    if ($afterEvents.Count -ne $beforeEventCount) { throw 'Postcondition failed: event record count changed.' }
    if ($afterJournals.Count -ne $beforeJournalCount) { throw 'Postcondition failed: journal record count changed.' }
    $afterBalanceQuantityHash = Get-TextHash (($afterBalances | Sort-Object { [int]$_.id } | ForEach-Object { "$(($_.id)):$($_.quantity)" }) -join '|')
    if ($afterBalanceQuantityHash -ne $beforeBalanceQuantityHash) { throw 'Postcondition failed: one or more balance quantities changed.' }

    foreach ($file in $sourceFiles) {
        if ($file.Name -in @('lot-location-balances.json', 'lots.json')) { continue }
        $afterHash = Get-FileHashValue (Join-Path $resolvedDataRoot $file.Name)
        if ($afterHash -ne $beforeHashes[$file.Name]) { throw "Postcondition failed: protected file changed: $($file.Name)." }
    }
    if ((Get-SnapshotHash $afterLots $afterEvents) -ne $beforeSnapshotHash) {
        throw 'Postcondition failed: cost/MSRP snapshot hash changed.'
    }
    Assert-RepairMetrics $afterBalances $afterLots $afterEvents
    Write-Output '[PASS] Events, journals, counters, purchases, purchase lines, snapshots, and balance quantities are unchanged.'
    Write-Output '[SUCCESS] Inventory-only repair completed against the specified data root.'
} catch {
    foreach ($name in @('lot-location-balances.json', 'lots.json')) {
        $backupPath = Join-Path $backupDirectory $name
        if (Test-Path -LiteralPath $backupPath -PathType Leaf) {
            Copy-Item -LiteralPath $backupPath -Destination (Join-Path $resolvedDataRoot $name) -Force
        }
    }
    throw "Repair failed and touched collections were restored from the verified backup. $($_.Exception.Message)"
} finally {
    Remove-Item -LiteralPath $balancesCandidate -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $lotsCandidate -Force -ErrorAction SilentlyContinue
}

# Example Usage:
#   # Dry-run precondition check against an isolated copy:
#   .\tools\repair-inventory-only.ps1 -DataRoot "$env:TEMP\HumidorHQ-RepairData" -BackupRoot "$env:TEMP\HumidorHQ-RepairBackups"
#   # Apply to an isolated copy:
#   .\tools\repair-inventory-only.ps1 -DataRoot "$env:TEMP\HumidorHQ-RepairData" -BackupRoot "$env:TEMP\HumidorHQ-RepairBackups" -Apply -Confirmation 'APPLY-INVENTORY-REPAIR'
#   # Repository runtime data additionally requires -AllowRepositoryData; do not run without separate authorization.
