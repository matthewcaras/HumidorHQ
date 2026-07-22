# Filename: repair-purchase-headers.ps1
# Revision : 1.2.0
# Description : Applies the approved purchase-header-only subtotal and discount repair to an offline data root.
# Author : Jason Lamb (with help from Codex CLI)
# Created Date : 2026-07-17
# Modified Date : 2026-07-22
# Changelog :
# 1.2.0 align the approved header repair with the imported workbook dataset and compute aggregate validation from the approved repair set
# 1.1.0 extend the approved header repair to include the final four imported purchases that still lacked subtotals
# 1.0.0 initial preconditioned purchase-header repair with external backup and verification

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
$requiredConfirmation = 'APPLY-PURCHASE-HEADER-REPAIR'
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

function Assert-ExactMoneyString {
    param($Actual, [string]$Expected, [string]$Description)
    if ($Actual -isnot [string] -or $Actual -cne $Expected) {
        $actualDescription = if ($null -eq $Actual) { 'null' } else { "'$Actual' ($($Actual.GetType().Name))" }
        throw "Precondition failed: $Description expected exact string '$Expected'; found $actualDescription."
    }
}

function Convert-ToCents {
    param($Value, [string]$Description)
    if ($null -eq $Value -or [string]::IsNullOrWhiteSpace([string]$Value)) {
        throw "$Description is missing."
    }
    try {
        return [int][decimal]::Round(([decimal]([string]$Value)) * 100, 0, [System.MidpointRounding]::AwayFromZero)
    } catch {
        throw "$Description is not valid money."
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
        return ([System.BitConverter]::ToString(
            $algorithm.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($Text))
        )).Replace('-', '')
    } finally {
        $algorithm.Dispose()
    }
}

function Get-CollectionSemanticHash {
    param([object[]]$Rows)
    return Get-TextHash ($Rows | ConvertTo-Json -Depth 100 -Compress)
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

function Get-AllocationHash {
    param([object[]]$Lines)
    $allocations = @($Lines | Sort-Object { [int]$_.id } | ForEach-Object {
        [ordered]@{
            id = $_.id
            purchaseId = $_.purchaseId
            lineSubtotal = $_.lineSubtotal
            allocatedShipping = $_.allocatedShipping
            allocatedExciseTax = $_.allocatedExciseTax
            allocatedSalesTax = $_.allocatedSalesTax
            allocatedDiscount = $_.allocatedDiscount
            trueCostBasis = $_.trueCostBasis
            trueCostPerCigar = $_.trueCostPerCigar
            quantity = $_.quantity
        }
    })
    return Get-TextHash ($allocations | ConvertTo-Json -Depth 6 -Compress)
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

$approvedRepairs = @(
    [ordered]@{ id=1;  subtotal='84.90';  shipping='9.99'; excise='14.52'; tax='5.94';  discount='0.00';   total='115.35' },
    [ordered]@{ id=2;  subtotal='74.99';  shipping='0.00'; excise='12.91'; tax='5.36';  discount='-12.15'; total='81.11' },
    [ordered]@{ id=3;  subtotal='49.99';  shipping='0.00'; excise='6.42';  tax='3.60';  discount='-5.45';  total='54.56' },
    [ordered]@{ id=4;  subtotal='89.99';  shipping='0.00'; excise='16.63'; tax='7.47';  discount='-0.46';  total='113.63' },
    [ordered]@{ id=5;  subtotal='39.99';  shipping='0.00'; excise='7.29';  tax='3.03';  discount='-4.51';  total='45.80' },
    [ordered]@{ id=6;  subtotal='62.99';  shipping='0.00'; excise='12.41'; tax='4.84';  discount='-7.17';  total='73.07' },
    [ordered]@{ id=7;  subtotal='39.99';  shipping='0.00'; excise='7.44';  tax='3.04';  discount='-4.52';  total='45.95' },
    [ordered]@{ id=8;  subtotal='44.00';  shipping='0.00'; excise='13.97'; tax='3.29';  discount='-11.98'; total='49.28' },
    [ordered]@{ id=9;  subtotal='50.99';  shipping='0.00'; excise='8.40';  tax='3.27';  discount='-13.34'; total='49.32' },
    [ordered]@{ id=10; subtotal='134.97'; shipping='0.00'; excise='30.27'; tax='10.63'; discount='-15.63'; total='160.24' },
    [ordered]@{ id=11; subtotal='129.99'; shipping='0.00'; excise='24.12'; tax='8.97';  discount='-27.69'; total='135.39' },
    [ordered]@{ id=12; subtotal='99.98';  shipping='0.00'; excise='23.01'; tax='7.91';  discount='-11.63'; total='119.27' },
    [ordered]@{ id=13; subtotal='49.99';  shipping='0.00'; excise='9.37';  tax='3.81';  discount='-5.66';  total='57.51' },
    [ordered]@{ id=14; subtotal='37.50';  shipping='0.00'; excise='7.15';  tax='3.13';  discount='-0.50';  total='47.28' },
    [ordered]@{ id=15; subtotal='105.97'; shipping='0.00'; excise='18.85'; tax='5.83';  discount='-26.75'; total='103.90' },
    [ordered]@{ id=16; subtotal='52.99';  shipping='0.00'; excise='11.32'; tax='3.39';  discount='-16.69'; total='51.01' },
    [ordered]@{ id=17; subtotal='138.98'; shipping='0.00'; excise='24.32'; tax='9.62';  discount='-26.51'; total='146.41' },
    [ordered]@{ id=18; subtotal='55.98';  shipping='0.00'; excise='8.45';  tax='4.12';  discount='-6.19';  total='62.36' },
    [ordered]@{ id=19; subtotal='118.80'; shipping='0.00'; excise='23.61'; tax='9.14';  discount='-13.53'; total='138.02' },
    [ordered]@{ id=20; subtotal='44.99';  shipping='0.00'; excise='9.36';  tax='3.80';  discount='-0.65';  total='57.50' },
    [ordered]@{ id=21; subtotal='47.99';  shipping='0.00'; excise='9.63';  tax='3.69';  discount='-5.47';  total='55.84' },
    [ordered]@{ id=22; subtotal='74.98';  shipping='0.00'; excise='18.12'; tax='5.99';  discount='-8.77';  total='90.32' },
    [ordered]@{ id=23; subtotal='69.99';  shipping='0.00'; excise='16.08'; tax='6.17';  discount='-9.13';  total='83.11' },
    [ordered]@{ id=24; subtotal='57.99';  shipping='0.00'; excise='9.00';  tax='4.28';  discount='-6.43';  total='64.84' },
    [ordered]@{ id=25; subtotal='69.98';  shipping='0.00'; excise='12.64'; tax='4.04';  discount='-13.42'; total='73.24' },
    [ordered]@{ id=26; subtotal='64.99';  shipping='0.00'; excise='11.78'; tax='4.00';  discount='-19.74'; total='61.03' },
    [ordered]@{ id=27; subtotal='89.99';  shipping='0.00'; excise='13.61'; tax='5.36';  discount='-27.29'; total='81.67' },
    [ordered]@{ id=28; subtotal='69.98';  shipping='0.00'; excise='14.19'; tax='5.40';  discount='-7.00';  total='82.57' },
    [ordered]@{ id=29; subtotal='79.99';  shipping='0.00'; excise='15.04'; tax='6.09';  discount='-8.00';  total='93.12' },
    [ordered]@{ id=30; subtotal='88.50';  shipping='0.00'; excise='16.83'; tax='6.76';  discount='-8.86';  total='103.23' },
    [ordered]@{ id=31; subtotal='97.02';  shipping='0.00'; excise='22.15'; tax='6.79';  discount='0.00';   total='125.96' },
    [ordered]@{ id=32; subtotal='118.00'; shipping='0.00'; excise='27.81'; tax='7.02';  discount='-17.70'; total='135.13' },
    [ordered]@{ id=33; subtotal='38.86';  shipping='0.00'; excise='7.97';  tax='2.72';  discount='0.00';   total='49.55' },
    [ordered]@{ id=34; subtotal='163.43'; shipping='0.00'; excise='21.16'; tax='11.44'; discount='0.00';   total='196.03' },
    [ordered]@{ id=35; subtotal='99.00';  shipping='0.00'; excise='18.52'; tax='5.89';  discount='-14.85'; total='108.56' },
    [ordered]@{ id=36; subtotal='69.30';  shipping='0.00'; excise='15.22'; tax='4.85';  discount='0.00';   total='89.37' },
    [ordered]@{ id=37; subtotal='138.00'; shipping='0.00'; excise='24.87'; tax='9.66';  discount='0.00';   total='172.53' },
    [ordered]@{ id=38; subtotal='89.00';  shipping='0.00'; excise='19.44'; tax='6.23';  discount='0.00';   total='114.67' },
    [ordered]@{ id=39; subtotal='49.99';  shipping='0.00'; excise='10.82'; tax='3.50';  discount='0.00';   total='64.31' },
    [ordered]@{ id=40; subtotal='109.00'; shipping='0.00'; excise='24.63'; tax='7.63';  discount='0.00';   total='141.26' },
    [ordered]@{ id=41; subtotal='57.07';  shipping='0.00'; excise='0.00';  tax='4.00';  discount='0.00';   total='61.07' },
    [ordered]@{ id=42; subtotal='42.18';  shipping='0.00'; excise='0.00';  tax='2.95';  discount='0.00';   total='45.13' },
    [ordered]@{ id=43; subtotal='75.96';  shipping='0.00'; excise='0.00';  tax='5.32';  discount='0.00';   total='81.28' },
    [ordered]@{ id=44; subtotal='90.05';  shipping='0.00'; excise='0.00';  tax='6.30';  discount='0.00';   total='96.35' }
)

$expectedAggregateSubtotal = 0
$expectedAggregateTotalPaid = 0
foreach ($repair in $approvedRepairs) {
    $expectedAggregateSubtotal += (Convert-ToCents $repair.subtotal "approved subtotal for purchase $($repair.id)")
    $expectedAggregateTotalPaid += (Convert-ToCents $repair.total "approved totalPaid for purchase $($repair.id)")
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

$purchasesPath = Join-Path $resolvedDataRoot 'purchases.json'
$purchaseLinesPath = Join-Path $resolvedDataRoot 'purchase-lines.json'
$lotsPath = Join-Path $resolvedDataRoot 'lots.json'
$balancesPath = Join-Path $resolvedDataRoot 'lot-location-balances.json'
$eventsPath = Join-Path $resolvedDataRoot 'inventory-events.json'
$journalPath = Join-Path $resolvedDataRoot 'smoking-journal-entries.json'
$countersPath = Join-Path $resolvedDataRoot 'counters.json'

$purchases = Read-JsonFile $purchasesPath
$purchaseLines = Read-JsonFile $purchaseLinesPath
$lots = Read-JsonFile $lotsPath
$balances = Read-JsonFile $balancesPath
$events = Read-JsonFile $eventsPath
$journals = Read-JsonFile $journalPath
$null = Read-JsonFile $countersPath

foreach ($repair in $approvedRepairs) {
    $purchase = Get-SingleRecord $purchases $repair.id 'purchase'
    if ($null -ne $purchase.PSObject.Properties['subtotal']) {
        throw "Precondition failed: purchase $($repair.id) subtotal property must be absent."
    }
    Assert-ExactMoneyString $purchase.shipping $repair.shipping "purchase $($repair.id) shipping"
    Assert-ExactMoneyString $purchase.exciseTax $repair.excise "purchase $($repair.id) exciseTax"
    Assert-ExactMoneyString $purchase.salesTax $repair.tax "purchase $($repair.id) salesTax"
    Assert-ExactMoneyString $purchase.discount $repair.discount "purchase $($repair.id) discount"
    Assert-ExactMoneyString $purchase.totalPaid $repair.total "purchase $($repair.id) totalPaid"

    $normalizedDiscount = [math]::Abs((Convert-ToCents $repair.discount "purchase $($repair.id) discount"))
    $formulaTotal = (Convert-ToCents $repair.subtotal "purchase $($repair.id) subtotal") +
        (Convert-ToCents $repair.shipping "purchase $($repair.id) shipping") +
        (Convert-ToCents $repair.excise "purchase $($repair.id) exciseTax") +
        (Convert-ToCents $repair.tax "purchase $($repair.id) salesTax") -
        $normalizedDiscount
    if ($formulaTotal -ne (Convert-ToCents $repair.total "purchase $($repair.id) totalPaid")) {
        throw "Approved repair table is internally inconsistent for purchase $($repair.id)."
    }
}

$sourceFiles = @(Get-ChildItem -LiteralPath $resolvedDataRoot -File | Where-Object { $_.Extension -in @('.json', '.jsonl') } | Sort-Object Name)
$beforeHashes = @{}
foreach ($file in $sourceFiles) { $beforeHashes[$file.Name] = Get-FileHashValue $file.FullName }
$beforePurchaseSemanticHash = Get-CollectionSemanticHash $purchases
$beforeAllocationHash = Get-AllocationHash $purchaseLines
$beforeSnapshotHash = Get-SnapshotHash $lots $events
$beforePurchaseLineCount = $purchaseLines.Count
$beforeLotCount = $lots.Count
$beforeBalanceCount = $balances.Count
$beforeEventCount = $events.Count
$beforeJournalCount = $journals.Count

Write-Output '[PASS] Exact before-value preconditions matched for purchases 1-40.'
if (-not $Apply) {
    Write-Output '[DRY RUN] No backup or data changes were made. Pass -Apply with the exact confirmation token to execute.'
    exit 0
}

if (-not (Test-Path -LiteralPath $resolvedBackupRoot -PathType Container)) {
    $null = New-Item -ItemType Directory -Path $resolvedBackupRoot -Force
}
$timestamp = Get-Date -Format 'yyyyMMdd-HHmmssfff'
$backupDirectory = Join-Path $resolvedBackupRoot "humidorhq-purchase-header-repair-$timestamp"
if (Test-Path -LiteralPath $backupDirectory) { throw "Backup destination already exists: $backupDirectory" }
$null = New-Item -ItemType Directory -Path $backupDirectory

$manifestRows = @()
foreach ($file in $sourceFiles) {
    $backupPath = Join-Path $backupDirectory $file.Name
    Copy-Item -LiteralPath $file.FullName -Destination $backupPath
    $sourceHash = Get-FileHashValue $file.FullName
    $backupHash = Get-FileHashValue $backupPath
    if ($sourceHash -ne $backupHash) { throw "Backup verification failed for $($file.Name)." }
    $manifestRows += [pscustomobject]@{ File=$file.Name; Length=$file.Length; SHA256=$sourceHash }
}
$manifestPath = Join-Path $backupDirectory 'sha256-manifest.csv'
$manifestRows | Export-Csv -LiteralPath $manifestPath -NoTypeInformation -Encoding utf8
Write-Output "[PASS] Timestamped backup and hash manifest created: $backupDirectory"

foreach ($repair in $approvedRepairs) {
    $purchase = Get-SingleRecord $purchases $repair.id 'purchase'
    $purchase | Add-Member -MemberType NoteProperty -Name subtotal -Value $repair.subtotal
    $purchase.discount = ([math]::Abs([decimal]$repair.discount)).ToString('0.00', [System.Globalization.CultureInfo]::InvariantCulture)
}

$purchasesCandidate = Join-Path $resolvedDataRoot '.purchases.header-repair.tmp'
try {
    Write-JsonCandidate $purchases $purchasesCandidate
    [System.IO.File]::Move($purchasesCandidate, $purchasesPath, $true)

    $afterPurchases = Read-JsonFile $purchasesPath
    $afterPurchaseLines = Read-JsonFile $purchaseLinesPath
    $afterLots = Read-JsonFile $lotsPath
    $afterBalances = Read-JsonFile $balancesPath
    $afterEvents = Read-JsonFile $eventsPath
    $afterJournals = Read-JsonFile $journalPath

    $aggregateSubtotal = 0
    $aggregateTotalPaid = 0
    foreach ($repair in $approvedRepairs) {
        $purchase = Get-SingleRecord $afterPurchases $repair.id 'repaired purchase'
        Assert-ExactMoneyString $purchase.subtotal $repair.subtotal "repaired purchase $($repair.id) subtotal"
        $expectedDiscount = ([math]::Abs([decimal]$repair.discount)).ToString('0.00', [System.Globalization.CultureInfo]::InvariantCulture)
        Assert-ExactMoneyString $purchase.discount $expectedDiscount "repaired purchase $($repair.id) discount"
        Assert-ExactMoneyString $purchase.totalPaid $repair.total "repaired purchase $($repair.id) totalPaid"
        $aggregateSubtotal += Convert-ToCents $purchase.subtotal "repaired purchase $($repair.id) subtotal"
        $aggregateTotalPaid += Convert-ToCents $purchase.totalPaid "repaired purchase $($repair.id) totalPaid"
    }
    if ($aggregateSubtotal -ne $expectedAggregateSubtotal) { throw "Postcondition failed: aggregate subtotal expected $([decimal]$expectedAggregateSubtotal / 100); found $([decimal]$aggregateSubtotal / 100)." }
    if ($aggregateTotalPaid -ne $expectedAggregateTotalPaid) { throw "Postcondition failed: aggregate totalPaid expected $([decimal]$expectedAggregateTotalPaid / 100); found $([decimal]$aggregateTotalPaid / 100)." }

    $missingSubtotals = 0
    $negativeDiscounts = 0
    $totalMismatches = 0
    foreach ($purchase in $afterPurchases) {
        if ($null -eq $purchase.PSObject.Properties['subtotal'] -or $null -eq $purchase.subtotal -or [string]::IsNullOrWhiteSpace([string]$purchase.subtotal)) {
            $missingSubtotals++
            continue
        }
        $discountCents = Convert-ToCents $purchase.discount "purchase $($purchase.id) discount"
        if ($discountCents -lt 0) { $negativeDiscounts++ }
        $formulaTotal = (Convert-ToCents $purchase.subtotal "purchase $($purchase.id) subtotal") +
            (Convert-ToCents $purchase.shipping "purchase $($purchase.id) shipping") +
            (Convert-ToCents $purchase.exciseTax "purchase $($purchase.id) exciseTax") +
            (Convert-ToCents $purchase.salesTax "purchase $($purchase.id) salesTax") -
            $discountCents
        if ($formulaTotal -ne (Convert-ToCents $purchase.totalPaid "purchase $($purchase.id) totalPaid")) { $totalMismatches++ }
    }
    if ($missingSubtotals -ne 0) { throw "Postcondition failed: missing subtotals=$missingSubtotals." }
    if ($negativeDiscounts -ne 0) { throw "Postcondition failed: negative discounts=$negativeDiscounts." }
    if ($totalMismatches -ne 0) { throw "Postcondition failed: purchase total mismatches=$totalMismatches." }

    $normalizedPurchases = @(($afterPurchases | ConvertTo-Json -Depth 100) | ConvertFrom-Json)
    foreach ($repair in $approvedRepairs) {
        $purchase = Get-SingleRecord $normalizedPurchases $repair.id 'normalized purchase'
        $purchase.PSObject.Properties.Remove('subtotal')
        $purchase.discount = $repair.discount
    }
    if ((Get-CollectionSemanticHash $normalizedPurchases) -ne $beforePurchaseSemanticHash) {
        throw 'Postcondition failed: purchase data changed outside the approved subtotal and discount fields.'
    }

    foreach ($file in $sourceFiles) {
        if ($file.Name -eq 'purchases.json') { continue }
        if ((Get-FileHashValue (Join-Path $resolvedDataRoot $file.Name)) -ne $beforeHashes[$file.Name]) {
            throw "Postcondition failed: protected file changed: $($file.Name)."
        }
    }
    if ($afterPurchaseLines.Count -ne $beforePurchaseLineCount -or $afterLots.Count -ne $beforeLotCount -or
        $afterBalances.Count -ne $beforeBalanceCount -or $afterEvents.Count -ne $beforeEventCount -or
        $afterJournals.Count -ne $beforeJournalCount) {
        throw 'Postcondition failed: a protected collection record count changed.'
    }
    if ((Get-AllocationHash $afterPurchaseLines) -ne $beforeAllocationHash) { throw 'Postcondition failed: purchase-line allocation or quantity hash changed.' }
    if ((Get-SnapshotHash $afterLots $afterEvents) -ne $beforeSnapshotHash) { throw 'Postcondition failed: cost/MSRP snapshot hash changed.' }

    $receipts = 0
    $removals = 0
    foreach ($event in $afterEvents) {
        $type = Normalize-EventType $event.eventType
        $quantity = [int]($event.quantity ?? 0)
        if ($type -in @('PURCHASE-RECEIPT', 'RECEIPT', 'RECEIVED')) { $receipts += $quantity }
        if ($type -in @('SMOKED', 'GIFTED', 'DISCARDED', 'DISCARD', 'DAMAGED')) { $removals += $quantity }
    }
    $onHand = [int](($afterBalances | Where-Object { [int]$_.quantity -gt 0 } | Measure-Object quantity -Sum).Sum ?? 0)
    if ($receipts -ne 911 -or $removals -ne 0 -or $onHand -ne 911) {
        throw "Postcondition failed: inventory expected receipts=911, removals=0, onHand=911; found receipts=$receipts, removals=$removals, onHand=$onHand."
    }

    Write-Output '[PASS] MissingSubtotals=0'
    Write-Output '[PASS] NegativeDiscounts=0'
    Write-Output '[PASS] PurchaseTotalMismatches=0'
    Write-Output ("[PASS] AggregateSubtotal=" + ([decimal]$aggregateSubtotal / 100).ToString('0.00', [System.Globalization.CultureInfo]::InvariantCulture))
    Write-Output ("[PASS] AggregateTotalPaid=" + ([decimal]$aggregateTotalPaid / 100).ToString('0.00', [System.Globalization.CultureInfo]::InvariantCulture))
    Write-Output '[PASS] Receipts=911 Removals=0 OnHand=911'
    Write-Output '[PASS] Purchase lines, allocations, Lots, balances, events, journals, counters, quantities, IDs, and snapshots are unchanged.'
    Write-Output '[SUCCESS] Purchase-header-only repair completed against the specified data root.'
} catch {
    $backupPath = Join-Path $backupDirectory 'purchases.json'
    if (Test-Path -LiteralPath $backupPath -PathType Leaf) {
        Copy-Item -LiteralPath $backupPath -Destination $purchasesPath -Force
    }
    throw "Repair failed and purchases.json was restored from the verified backup. $($_.Exception.Message)"
} finally {
    Remove-Item -LiteralPath $purchasesCandidate -Force -ErrorAction SilentlyContinue
}

# Example Usage:
#   # Dry-run precondition check against an isolated copy:
#   .\tools\repair-purchase-headers.ps1 -DataRoot "$env:TEMP\HumidorHQ-PurchaseRepairData" -BackupRoot "$env:TEMP\HumidorHQ-PurchaseRepairBackups"
#   # Apply to an isolated copy:
#   .\tools\repair-purchase-headers.ps1 -DataRoot "$env:TEMP\HumidorHQ-PurchaseRepairData" -BackupRoot "$env:TEMP\HumidorHQ-PurchaseRepairBackups" -Apply -Confirmation 'APPLY-PURCHASE-HEADER-REPAIR'
#   # Repository runtime data additionally requires -AllowRepositoryData; do not run without separate authorization.
