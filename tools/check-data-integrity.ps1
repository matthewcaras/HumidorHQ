# Filename: check-data-integrity.ps1
# Revision : 1.1.0
# Description : Performs a read-only integrity review of HumidorHQ flat-file JSON data.
# Author : Jason Lamb (with help from Codex CLI)
# Created Date : 2026-07-17
# Modified Date : 2026-07-17
# Changelog :
# 1.1.0 resolve the default data root from HUMIDORHQ_DATA_ROOT instead of repository data
# 1.0.0 initial read-only inventory, relationship, counter, and accounting checks

param(
    [string]$DataRoot
)

$ErrorActionPreference = 'Stop'
$configuredDataRoot = if ([string]::IsNullOrWhiteSpace($DataRoot)) { $env:HUMIDORHQ_DATA_ROOT } else { $DataRoot }
if ([string]::IsNullOrWhiteSpace($configuredDataRoot)) {
    throw 'DataRoot is required. Pass -DataRoot or set HUMIDORHQ_DATA_ROOT to the external runtime directory.'
}
$resolvedDataRoot = if ([string]::IsNullOrWhiteSpace($DataRoot)) {
    [System.IO.Path]::GetFullPath($configuredDataRoot)
} else {
    [System.IO.Path]::GetFullPath($configuredDataRoot)
}

$errorCount = 0
$warningCount = 0

function Write-IntegrityMessage {
    param(
        [ValidateSet('INFO', 'WARNING', 'ERROR')][string]$Level,
        [string]$Code,
        [string]$Message
    )
    if ($Level -eq 'ERROR') { $script:errorCount++ }
    if ($Level -eq 'WARNING') { $script:warningCount++ }
    Write-Output "[$Level][$Code] $Message"
}

function Read-Collection {
    param([string]$Name)
    $path = Join-Path $resolvedDataRoot ($Name + '.json')
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
        Write-IntegrityMessage ERROR 'MISSING_DATA_FILE' "Required collection is missing: $Name.json"
        return @()
    }
    try {
        $parsed = Get-Content -LiteralPath $path -Raw | ConvertFrom-Json
        if ($null -eq $parsed) { return @() }
        return @($parsed)
    } catch {
        Write-IntegrityMessage ERROR 'MALFORMED_JSON' "Collection could not be parsed: $Name.json"
        return @()
    }
}

function Get-IdSet {
    param([object[]]$Rows)
    $set = @{}
    foreach ($row in $Rows) {
        $id = [int]($row.id ?? 0)
        if ($id -gt 0) { $set[$id] = $true }
    }
    return $set
}

function Convert-ToCents {
    param($Value)
    if ($null -eq $Value -or [string]$Value -eq '') { return 0L }
    try { return [long][math]::Round(([decimal]$Value * 100), 0) } catch { return 0L }
}

function Normalize-EventType {
    param($Value)
    return ([string]$Value).Trim().ToUpperInvariant().Replace('_', '-').Replace(' ', '-')
}

function Normalize-OptionalId {
    param($Value)
    if ($null -eq $Value -or [string]$Value -eq '') { return 0 }
    $id = [int]$Value
    return $(if ($id -gt 0) { $id } else { 0 })
}

if (-not (Test-Path -LiteralPath $resolvedDataRoot -PathType Container)) {
    Write-IntegrityMessage ERROR 'DATA_ROOT_MISSING' "Data root does not exist: $resolvedDataRoot"
    Write-Output '[SUMMARY] Errors=1 Warnings=0'
    exit 1
}

$collectionNames = @(
    'catalog-cigars', 'vendors', 'storage-locations', 'storage-sub-locations',
    'purchases', 'purchase-lines', 'lots', 'lot-location-balances',
    'inventory-events', 'smoking-journal-entries'
)
$collections = @{}
foreach ($name in $collectionNames) { $collections[$name] = @(Read-Collection $name) }

$catalogIds = Get-IdSet $collections['catalog-cigars']
$vendorIds = Get-IdSet $collections['vendors']
$humidorIds = Get-IdSet $collections['storage-locations']
$sectionIds = Get-IdSet $collections['storage-sub-locations']
$lotIds = Get-IdSet $collections['lots']
$eventIds = Get-IdSet $collections['inventory-events']

foreach ($section in $collections['storage-sub-locations']) {
    $parentLocationId = Normalize-OptionalId $section.storageLocationId
    if ($parentLocationId -eq 0 -or -not $humidorIds.ContainsKey($parentLocationId)) {
        Write-IntegrityMessage ERROR 'MISSING_HUMIDOR' "Humidor section id $($section.id) references a missing parent Humidor."
    }
}

foreach ($name in $collectionNames) {
    $groups = @($collections[$name] | Where-Object { $null -ne $_ -and $null -ne $_.id } | Group-Object { [int]$_.id } | Where-Object Count -gt 1)
    foreach ($group in $groups) {
        Write-IntegrityMessage ERROR 'DUPLICATE_ID' "$name contains duplicate id $($group.Name)."
    }
}

$positiveBalanceQuantity = 0
foreach ($balance in $collections['lot-location-balances']) {
    $quantity = [int]($balance.quantity ?? 0)
    if ($quantity -gt 0) { $positiveBalanceQuantity += $quantity }
    $locationId = Normalize-OptionalId $balance.storageLocationId
    if ($locationId -eq 0) {
        Write-IntegrityMessage ERROR 'BALANCE_LOCATION_ZERO' "Balance id $($balance.id) uses storage location id 0 or no location."
    } elseif (-not $humidorIds.ContainsKey($locationId)) {
        Write-IntegrityMessage ERROR 'MISSING_HUMIDOR' "Balance id $($balance.id) references missing Humidor id $locationId."
    }
    $sectionId = Normalize-OptionalId $balance.storageSubLocationId
    if ($sectionId -gt 0 -and -not $sectionIds.ContainsKey($sectionId)) {
        Write-IntegrityMessage ERROR 'MISSING_SECTION' "Balance id $($balance.id) references missing section id $sectionId."
    }
}

$receiptQuantity = 0
$smokedQuantity = 0
$giftedQuantity = 0
$discardedQuantity = 0
foreach ($event in $collections['inventory-events']) {
    $quantity = [int]($event.quantity ?? 0)
    switch (Normalize-EventType $event.eventType) {
        'PURCHASE-RECEIPT' { $receiptQuantity += $quantity }
        'RECEIPT' { $receiptQuantity += $quantity }
        'SMOKED' { $smokedQuantity += $quantity }
        'GIFTED' { $giftedQuantity += $quantity }
        'DISCARDED' { $discardedQuantity += $quantity }
    }

    foreach ($field in @('storageLocationId', 'fromStorageLocationId', 'toStorageLocationId')) {
        $locationId = Normalize-OptionalId $event.$field
        if ($locationId -gt 0 -and -not $humidorIds.ContainsKey($locationId)) {
            Write-IntegrityMessage ERROR 'MISSING_HUMIDOR' "Inventory event id $($event.id) field $field references missing Humidor id $locationId."
        }
    }
    foreach ($field in @('storageSubLocationId', 'fromStorageSubLocationId', 'toStorageSubLocationId')) {
        $sectionId = Normalize-OptionalId $event.$field
        if ($sectionId -gt 0 -and -not $sectionIds.ContainsKey($sectionId)) {
            Write-IntegrityMessage ERROR 'MISSING_SECTION' "Inventory event id $($event.id) field $field references missing section id $sectionId."
        }
    }
    if ((Normalize-EventType $event.eventType) -eq 'MOVE') {
        $sameLocation = (Normalize-OptionalId $event.fromStorageLocationId) -eq (Normalize-OptionalId ($event.toStorageLocationId ?? $event.storageLocationId))
        $sameSection = (Normalize-OptionalId $event.fromStorageSubLocationId) -eq (Normalize-OptionalId ($event.toStorageSubLocationId ?? $event.storageSubLocationId))
        if ($sameLocation -and $sameSection) {
            Write-IntegrityMessage ERROR 'SAME_LOCATION_MOVE' "MOVE event id $($event.id) has the same source and destination."
        }
    }
}

$expectedCurrentQuantity = $receiptQuantity - $smokedQuantity - $giftedQuantity - $discardedQuantity
Write-IntegrityMessage INFO 'POSITIVE_BALANCE_QUANTITY' "Positive balance quantity: $positiveBalanceQuantity"
Write-IntegrityMessage INFO 'RECEIPT_QUANTITY' "Receipt quantity: $receiptQuantity"
Write-IntegrityMessage INFO 'SMOKED_QUANTITY' "Smoked quantity: $smokedQuantity"
Write-IntegrityMessage INFO 'GIFTED_QUANTITY' "Gifted quantity: $giftedQuantity"
Write-IntegrityMessage INFO 'DISCARDED_QUANTITY' "Discarded quantity: $discardedQuantity"
Write-IntegrityMessage INFO 'EXPECTED_CURRENT_QUANTITY' "Expected current quantity: $expectedCurrentQuantity"
if ($positiveBalanceQuantity -ne $expectedCurrentQuantity) {
    Write-IntegrityMessage ERROR 'BALANCE_TOTAL_MISMATCH' "Positive balances ($positiveBalanceQuantity) do not equal receipts less removals ($expectedCurrentQuantity)."
}

$positiveBalancesByLot = @($collections['lot-location-balances'] | Where-Object { [int]($_.quantity ?? 0) -gt 0 } | Group-Object { [int]($_.lotId ?? 0) })
$splitLots = @($positiveBalancesByLot | Where-Object Count -gt 1)
Write-IntegrityMessage INFO 'DISTINCT_LOT_COUNT' "Distinct Lot count: $($lotIds.Count)"
Write-IntegrityMessage INFO 'SPLIT_LOT_COUNT' "Split Lots: $($splitLots.Count)"
foreach ($lot in $collections['lots']) {
    $lotId = [int]($lot.id ?? 0)
    $balanceQuantity = [int](($collections['lot-location-balances'] | Where-Object { [int]($_.lotId ?? 0) -eq $lotId -and [int]($_.quantity ?? 0) -gt 0 } | Measure-Object -Property quantity -Sum).Sum ?? 0)
    if ([int]($lot.currentQuantity ?? 0) -ne $balanceQuantity) {
        Write-IntegrityMessage WARNING 'LOT_CURRENT_MISMATCH' "Lot id $lotId currentQuantity does not match its positive balance quantity."
    }
}

foreach ($line in $collections['purchase-lines']) {
    $catalogId = Normalize-OptionalId $line.catalogCigarId
    if ($catalogId -eq 0 -or -not $catalogIds.ContainsKey($catalogId)) {
        Write-IntegrityMessage ERROR 'MISSING_CATALOG' "Purchase line id $($line.id) references a missing Catalog cigar."
    }
    $locationId = Normalize-OptionalId $line.storageLocationId
    if ($locationId -gt 0 -and -not $humidorIds.ContainsKey($locationId)) {
        Write-IntegrityMessage ERROR 'MISSING_HUMIDOR' "Purchase line id $($line.id) references missing Humidor id $locationId."
    }
    $sectionId = Normalize-OptionalId $line.storageSubLocationId
    if ($sectionId -gt 0 -and -not $sectionIds.ContainsKey($sectionId)) {
        Write-IntegrityMessage ERROR 'MISSING_SECTION' "Purchase line id $($line.id) references missing section id $sectionId."
    }
}
foreach ($lot in $collections['lots']) {
    $catalogId = Normalize-OptionalId $lot.catalogCigarId
    if ($catalogId -eq 0 -or -not $catalogIds.ContainsKey($catalogId)) {
        Write-IntegrityMessage ERROR 'MISSING_CATALOG' "Lot id $($lot.id) references a missing Catalog cigar."
    }
}
foreach ($event in $collections['inventory-events']) {
    $catalogId = Normalize-OptionalId $event.catalogCigarId
    if ($catalogId -gt 0 -and -not $catalogIds.ContainsKey($catalogId)) {
        Write-IntegrityMessage ERROR 'MISSING_CATALOG' "Inventory event id $($event.id) references missing Catalog cigar id $catalogId."
    }
}
foreach ($purchase in $collections['purchases']) {
    $vendorId = Normalize-OptionalId $purchase.vendorId
    if ($vendorId -gt 0 -and -not $vendorIds.ContainsKey($vendorId)) {
        Write-IntegrityMessage ERROR 'MISSING_VENDOR' "Purchase id $($purchase.id) references missing Vendor id $vendorId."
    }
    if ($null -eq $purchase.subtotal -or [string]$purchase.subtotal -eq '') {
        Write-IntegrityMessage WARNING 'MISSING_SUBTOTAL' "Purchase id $($purchase.id) has no stored subtotal."
    }
    if ($null -ne $purchase.discount -and [string]$purchase.discount -ne '' -and [decimal]$purchase.discount -lt 0) {
        Write-IntegrityMessage WARNING 'NEGATIVE_DISCOUNT' "Purchase id $($purchase.id) has a negative discount."
    }
    if ($null -eq $purchase.totalPaid -or [string]$purchase.totalPaid -eq '') {
        Write-IntegrityMessage WARNING 'PURCHASE_TOTAL_UNKNOWN' "Purchase id $($purchase.id) has no stored totalPaid value."
    } else {
        $expectedTotalCents = (Convert-ToCents $purchase.subtotal) + (Convert-ToCents $purchase.shipping) + (Convert-ToCents $purchase.exciseTax) + (Convert-ToCents $purchase.salesTax) - (Convert-ToCents $purchase.discount)
        if ((Convert-ToCents $purchase.totalPaid) -ne $expectedTotalCents) {
            Write-IntegrityMessage WARNING 'PURCHASE_TOTAL_MISMATCH' "Purchase id $($purchase.id) totalPaid does not reconcile to subtotal + shipping + excise tax + sales tax - discount."
        }
    }
}

foreach ($journal in $collections['smoking-journal-entries']) {
    $inventoryEventId = Normalize-OptionalId $journal.inventoryEventId
    if ($inventoryEventId -eq 0 -or -not $eventIds.ContainsKey($inventoryEventId)) {
        Write-IntegrityMessage ERROR 'ORPHAN_JOURNAL' "Smoking Journal entry id $($journal.id) references a missing InventoryEvent."
    }
}

$countersPath = Join-Path $resolvedDataRoot 'counters.json'
$counters = $null
try {
    $counters = Get-Content -LiteralPath $countersPath -Raw | ConvertFrom-Json
} catch {
    Write-IntegrityMessage ERROR 'MALFORMED_COUNTERS' 'counters.json is missing or could not be parsed.'
}
if ($null -ne $counters) {
    foreach ($name in $collectionNames) {
        $maximum = [int](($collections[$name] | Measure-Object -Property id -Maximum).Maximum ?? 0)
        $counterProperty = $counters.PSObject.Properties[$name]
        $nextValue = if ($null -eq $counterProperty) { 0 } else { [int]$counterProperty.Value }
        if ($maximum -gt 0 -and $nextValue -le $maximum) {
            Write-IntegrityMessage ERROR 'COUNTER_NOT_AHEAD' "Counter $name ($nextValue) is not greater than current maximum id $maximum."
        }
    }
}

Write-Output "[SUMMARY] Errors=$errorCount Warnings=$warningCount"
if ($errorCount -gt 0) { exit 1 }
exit 0

# Example Usage:
#   .\tools\check-data-integrity.ps1 # uses HUMIDORHQ_DATA_ROOT
#   .\tools\check-data-integrity.ps1 -DataRoot "C:\Temp\HumidorHQ-TestData"
