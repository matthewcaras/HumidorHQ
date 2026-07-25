# Filename: check-data-integrity.ps1
# Revision : 1.5.0
# Description : Performs a read-only integrity review of HumidorHQ flat-file JSON data.
# Author : Jason Lamb (with help from Codex CLI)
# Created Date : 2026-07-17
# Modified Date : 2026-07-25
# Changelog :
# 1.5.0 reconcile authoritative purchase totals to line allocations and six-decimal per-cigar costs
# 1.4.1 treat critical lot cache and purchase-header reconciliation defects as errors
# 1.4.0 reconcile and validate effective append-only inventory adjustments
# 1.3.0 default to the repository data directory while retaining DataRoot and environment overrides
# 1.2.0 validate compensating-event references and calculate inventory from effective unreversed events
# 1.1.0 resolve the default data root from HUMIDORHQ_DATA_ROOT instead of repository data
# 1.0.0 initial read-only inventory, relationship, counter, and accounting checks

param(
    [string]$DataRoot
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$configuredDataRoot = if (-not [string]::IsNullOrWhiteSpace($DataRoot)) {
    $DataRoot
} elseif (-not [string]::IsNullOrWhiteSpace($env:HUMIDORHQ_DATA_ROOT)) {
    $env:HUMIDORHQ_DATA_ROOT
} else {
    Join-Path $repoRoot 'data'
}
$resolvedDataRoot = [System.IO.Path]::GetFullPath($configuredDataRoot)

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
    try { return [long][decimal]::Round(([decimal]$Value * 100), 0, [MidpointRounding]::AwayFromZero) } catch { return 0L }
}

function Test-KnownMoney {
    param($Value)
    if ($null -eq $Value -or [string]::IsNullOrWhiteSpace([string]$Value)) { return $false }
    try {
        $parsed = [decimal]$Value
        return $parsed -ge 0
    } catch {
        return $false
    }
}

function Format-Cents {
    param([long]$Value)
    return '$' + (([decimal]$Value / 100).ToString('N2', [Globalization.CultureInfo]::InvariantCulture))
}

function Format-DecimalMoney {
    param([decimal]$Value)
    return '$' + $Value.ToString('N2', [Globalization.CultureInfo]::InvariantCulture)
}

function Get-LineWeightCents {
    param($Line)
    foreach ($field in @('purchasePrice', 'lineSubtotal')) {
        if (Test-KnownMoney $Line.$field) {
            return Convert-ToCents $Line.$field
        }
    }
    if ((Test-KnownMoney $Line.unitCost) -and [int]($Line.quantity ?? 0) -gt 0) {
        return (Convert-ToCents $Line.unitCost) * [int]$Line.quantity
    }
    return $null
}

function Get-WeightedCentAllocations {
    param(
        [long]$TotalCents,
        [hashtable]$Weights
    )
    if ($TotalCents -lt 0 -or $Weights.Count -eq 0) { return @{} }
    $totalWeight = [long](($Weights.Values | Measure-Object -Sum).Sum ?? 0)
    if ($totalWeight -le 0) { return @{} }
    $allocations = @{}
    $remainders = @()
    $allocated = 0L
    foreach ($id in @($Weights.Keys | Sort-Object { [int]$_ })) {
        $weighted = $TotalCents * [long]$Weights[$id]
        $base = [long][math]::Floor($weighted / $totalWeight)
        $allocations[[int]$id] = $base
        $remainders += [pscustomobject]@{
            Id = [int]$id
            Remainder = $weighted % $totalWeight
        }
        $allocated += $base
    }
    $remaining = $TotalCents - $allocated
    $orderedRemainders = @($remainders | Sort-Object @{ Expression = 'Remainder'; Descending = $true }, @{ Expression = 'Id'; Descending = $false })
    for ($index = 0; $index -lt $remaining; $index++) {
        $id = [int]$orderedRemainders[$index % $orderedRemainders.Count].Id
        $allocations[$id] = [long]$allocations[$id] + 1
    }
    return $allocations
}

function Format-IdList {
    param([object[]]$Ids)
    return (@($Ids | Sort-Object -Unique | ForEach-Object { [string]$_ }) -join ', ')
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
$purchaseIds = Get-IdSet $collections['purchases']
$lotIds = Get-IdSet $collections['lots']
$eventIds = Get-IdSet $collections['inventory-events']
$purchaseLinesByPurchaseId = @{}
foreach ($line in $collections['purchase-lines']) {
    $purchaseId = Normalize-OptionalId $line.purchaseId
    if (-not $purchaseLinesByPurchaseId.ContainsKey($purchaseId)) {
        $purchaseLinesByPurchaseId[$purchaseId] = @()
    }
    $purchaseLinesByPurchaseId[$purchaseId] = @($purchaseLinesByPurchaseId[$purchaseId]) + @($line)
}
$lotsByPurchaseLineId = @{}
foreach ($lot in $collections['lots']) {
    $purchaseLineId = Normalize-OptionalId $lot.purchaseLineId
    if (-not $lotsByPurchaseLineId.ContainsKey($purchaseLineId)) {
        $lotsByPurchaseLineId[$purchaseLineId] = @()
    }
    $lotsByPurchaseLineId[$purchaseLineId] = @($lotsByPurchaseLineId[$purchaseLineId]) + @($lot)
}
$eventsByPurchaseLineId = @{}
foreach ($event in $collections['inventory-events']) {
    $purchaseLineId = Normalize-OptionalId $event.purchaseLineId
    if (-not $eventsByPurchaseLineId.ContainsKey($purchaseLineId)) {
        $eventsByPurchaseLineId[$purchaseLineId] = @()
    }
    $eventsByPurchaseLineId[$purchaseLineId] = @($eventsByPurchaseLineId[$purchaseLineId]) + @($event)
}
$eventsById = @{}
foreach ($event in $collections['inventory-events']) {
    $eventId = [int]($event.id ?? 0)
    if ($eventId -gt 0) { $eventsById[$eventId] = $event }
}
$reversedEventIds = @{}
foreach ($event in $collections['inventory-events']) {
    if ((Normalize-EventType $event.eventType) -ne 'REVERSAL') { continue }
    $targetId = Normalize-OptionalId $event.reversesInventoryEventId
    if ($targetId -eq 0 -or -not $eventsById.ContainsKey($targetId)) {
        Write-IntegrityMessage ERROR 'REVERSAL_TARGET_MISSING' "REVERSAL event id $($event.id) references a missing Inventory Event."
        continue
    }
    if ((Normalize-EventType $eventsById[$targetId].eventType) -eq 'REVERSAL') {
        Write-IntegrityMessage ERROR 'REVERSAL_OF_REVERSAL' "REVERSAL event id $($event.id) targets another REVERSAL."
    }
    if ($reversedEventIds.ContainsKey($targetId)) {
        Write-IntegrityMessage ERROR 'DUPLICATE_EVENT_REVERSAL' "Inventory Event id $targetId has more than one REVERSAL."
    }
    if ([int]($event.quantity ?? 0) -ne [int]($eventsById[$targetId].quantity ?? 0)) {
        Write-IntegrityMessage ERROR 'REVERSAL_QUANTITY_MISMATCH' "REVERSAL event id $($event.id) quantity differs from its target."
    }
    $reversedEventIds[$targetId] = $true
}

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
$adjustmentNetQuantity = 0
foreach ($event in $collections['inventory-events']) {
    $eventId = [int]($event.id ?? 0)
    $quantity = [int]($event.quantity ?? 0)
    if (-not $reversedEventIds.ContainsKey($eventId)) {
        switch (Normalize-EventType $event.eventType) {
            'PURCHASE-RECEIPT' { $receiptQuantity += $quantity }
            'RECEIPT' { $receiptQuantity += $quantity }
            'SMOKED' { $smokedQuantity += $quantity }
            'GIFTED' { $giftedQuantity += $quantity }
            'DISCARDED' { $discardedQuantity += $quantity }
            'INVENTORY-ADJUSTMENT' {
                $direction = ([string]$event.adjustmentDirection).Trim().ToUpperInvariant()
                $quantityChange = [int]($event.quantityChange ?? 0)
                $beforeQuantity = [int]($event.balanceQuantityBefore ?? -1)
                $afterQuantity = [int]($event.balanceQuantityAfter ?? -1)
                $expectedChange = if ($direction -eq 'INCREASE') { $quantity } elseif ($direction -eq 'DECREASE') { -$quantity } else { 0 }
                if ($direction -notin @('INCREASE', 'DECREASE') -or $quantity -lt 1 -or $quantityChange -ne $expectedChange -or $beforeQuantity -lt 0 -or $afterQuantity -lt 0 -or ($afterQuantity - $beforeQuantity) -ne $quantityChange) {
                    Write-IntegrityMessage ERROR 'INVALID_INVENTORY_ADJUSTMENT' "Inventory Adjustment event id $($event.id) has inconsistent direction, quantity, or before/after values."
                } else {
                    $adjustmentNetQuantity += $quantityChange
                }
            }
        }
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

$expectedCurrentQuantity = $receiptQuantity + $adjustmentNetQuantity - $smokedQuantity - $giftedQuantity - $discardedQuantity
Write-IntegrityMessage INFO 'POSITIVE_BALANCE_QUANTITY' "Positive balance quantity: $positiveBalanceQuantity"
Write-IntegrityMessage INFO 'RECEIPT_QUANTITY' "Receipt quantity: $receiptQuantity"
Write-IntegrityMessage INFO 'SMOKED_QUANTITY' "Smoked quantity: $smokedQuantity"
Write-IntegrityMessage INFO 'GIFTED_QUANTITY' "Gifted quantity: $giftedQuantity"
Write-IntegrityMessage INFO 'DISCARDED_QUANTITY' "Discarded quantity: $discardedQuantity"
Write-IntegrityMessage INFO 'ADJUSTMENT_NET_QUANTITY' "Net inventory adjustment quantity: $adjustmentNetQuantity"
Write-IntegrityMessage INFO 'EXPECTED_CURRENT_QUANTITY' "Expected current quantity: $expectedCurrentQuantity"
if ($positiveBalanceQuantity -ne $expectedCurrentQuantity) {
    Write-IntegrityMessage ERROR 'BALANCE_TOTAL_MISMATCH' "Positive balances ($positiveBalanceQuantity) do not equal receipts plus net adjustments less removals ($expectedCurrentQuantity)."
}

$positiveBalancesByLot = @($collections['lot-location-balances'] | Where-Object { [int]($_.quantity ?? 0) -gt 0 } | Group-Object { [int]($_.lotId ?? 0) })
$splitLots = @($positiveBalancesByLot | Where-Object Count -gt 1)
Write-IntegrityMessage INFO 'DISTINCT_LOT_COUNT' "Distinct Lot count: $($lotIds.Count)"
Write-IntegrityMessage INFO 'SPLIT_LOT_COUNT' "Split Lots: $($splitLots.Count)"
foreach ($lot in $collections['lots']) {
    $lotId = [int]($lot.id ?? 0)
    $balanceQuantity = [int](($collections['lot-location-balances'] | Where-Object { [int]($_.lotId ?? 0) -eq $lotId -and [int]($_.quantity ?? 0) -gt 0 } | Measure-Object -Property quantity -Sum).Sum ?? 0)
    if ([int]($lot.currentQuantity ?? 0) -ne $balanceQuantity) {
        Write-IntegrityMessage ERROR 'LOT_CURRENT_MISMATCH' "Lot id $lotId currentQuantity does not match its positive balance quantity."
    }
}

foreach ($line in $collections['purchase-lines']) {
    $purchaseId = Normalize-OptionalId $line.purchaseId
    if ($purchaseId -eq 0 -or -not $purchaseIds.ContainsKey($purchaseId)) {
        Write-IntegrityMessage ERROR 'MISSING_PURCHASE' "Purchase line id $($line.id) references a missing Purchase."
    }
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
$authoritativePurchaseTotalCents = 0L
$authoritativeLineAllocationTotalCents = 0L
$storedLineBasisTotalCents = 0L
$extendedLineUnitCostTotal = [decimal]0
$lineBasisMismatchIds = @()
$lineUnitMismatchIds = @()
$lotSnapshotMismatchIds = @()
$eventSnapshotMismatchIds = @()
$componentMismatchPurchaseIds = @()
$subtotalVariancePurchaseIds = @()
$unallocatablePurchaseIds = @()

foreach ($purchase in $collections['purchases']) {
    $vendorId = Normalize-OptionalId $purchase.vendorId
    if ($vendorId -gt 0 -and -not $vendorIds.ContainsKey($vendorId)) {
        Write-IntegrityMessage ERROR 'MISSING_VENDOR' "Purchase id $($purchase.id) references missing Vendor id $vendorId."
    }
    if ($null -eq $purchase.subtotal -or [string]$purchase.subtotal -eq '') {
        Write-IntegrityMessage ERROR 'MISSING_SUBTOTAL' "Purchase id $($purchase.id) has no stored subtotal."
    }
    if ($null -ne $purchase.discount -and [string]$purchase.discount -ne '' -and [decimal]$purchase.discount -lt 0) {
        Write-IntegrityMessage ERROR 'NEGATIVE_DISCOUNT' "Purchase id $($purchase.id) has a negative discount."
    }
    if ($null -eq $purchase.totalPaid -or [string]$purchase.totalPaid -eq '') {
        Write-IntegrityMessage ERROR 'PURCHASE_TOTAL_UNKNOWN' "Purchase id $($purchase.id) has no stored totalPaid value."
    } else {
        $headerFields = @('subtotal', 'shipping', 'exciseTax', 'salesTax', 'discount', 'totalPaid')
        $unknownHeaderFields = @($headerFields | Where-Object { -not (Test-KnownMoney $purchase.$_) })
        if ($unknownHeaderFields.Count -gt 0) {
            Write-IntegrityMessage ERROR 'PURCHASE_MONEY_INVALID' "Purchase id $($purchase.id) has invalid or unknown money fields: $($unknownHeaderFields -join ', ')."
            continue
        }
        $expectedTotalCents = (Convert-ToCents $purchase.subtotal) + (Convert-ToCents $purchase.shipping) + (Convert-ToCents $purchase.exciseTax) + (Convert-ToCents $purchase.salesTax) - (Convert-ToCents $purchase.discount)
        $totalPaidCents = Convert-ToCents $purchase.totalPaid
        if ($totalPaidCents -ne $expectedTotalCents) {
            Write-IntegrityMessage ERROR 'PURCHASE_TOTAL_MISMATCH' "Purchase id $($purchase.id) totalPaid does not reconcile to subtotal + shipping + excise tax + sales tax - discount."
        }
        $authoritativePurchaseTotalCents += $totalPaidCents

        $purchaseId = [int]($purchase.id ?? 0)
        $purchaseLines = @($purchaseLinesByPurchaseId[$purchaseId])
        if ($purchaseLines.Count -eq 0) {
            continue
        }
        $weights = @{}
        foreach ($line in $purchaseLines) {
            $lineId = [int]($line.id ?? 0)
            $weight = Get-LineWeightCents $line
            if ($lineId -lt 1 -or $null -eq $weight -or $weight -le 0) {
                $weights = @{}
                break
            }
            $weights[$lineId] = [long]$weight
        }
        if ($weights.Count -ne $purchaseLines.Count) {
            $hasAccountingHistory = $false
            foreach ($line in $purchaseLines) {
                $lineId = [int]($line.id ?? 0)
                $relatedLots = @($lotsByPurchaseLineId[$lineId] | Where-Object {
                    $null -ne $_ -and [int]($_.id ?? 0) -gt 0
                })
                $relatedEvents = @($eventsByPurchaseLineId[$lineId] | Where-Object {
                    $null -ne $_ -and [int]($_.id ?? 0) -gt 0
                })
                if ($relatedLots.Count -gt 0 -or $relatedEvents.Count -gt 0) {
                    $hasAccountingHistory = $true
                    break
                }
            }
            if ($hasAccountingHistory) {
                $unallocatablePurchaseIds += $purchaseId
            }
            continue
        }
        $allocations = Get-WeightedCentAllocations -TotalCents $totalPaidCents -Weights $weights
        $allocatedPurchaseCents = [long](($allocations.Values | Measure-Object -Sum).Sum ?? 0)
        $authoritativeLineAllocationTotalCents += $allocatedPurchaseCents
        if ($allocatedPurchaseCents -ne $totalPaidCents) {
            Write-IntegrityMessage ERROR 'AUTHORITATIVE_ALLOCATION_MISMATCH' "Purchase id $purchaseId line allocations do not sum to totalPaid."
        }

        $lineSubtotalCents = [long](($weights.Values | Measure-Object -Sum).Sum ?? 0)
        if ($lineSubtotalCents -ne (Convert-ToCents $purchase.subtotal)) {
            $subtotalVariancePurchaseIds += $purchaseId
        }

        $componentMap = [ordered]@{
            allocatedShipping = 'shipping'
            allocatedExciseTax = 'exciseTax'
            allocatedSalesTax = 'salesTax'
            allocatedDiscount = 'discount'
        }
        foreach ($component in $componentMap.Keys) {
            $componentValues = @($purchaseLines | ForEach-Object { $_.$component })
            if ($componentValues.Count -ne $purchaseLines.Count -or @($componentValues | Where-Object { -not (Test-KnownMoney $_) }).Count -gt 0) {
                $componentMismatchPurchaseIds += $purchaseId
                break
            }
            $componentTotal = [long](($componentValues | ForEach-Object { Convert-ToCents $_ } | Measure-Object -Sum).Sum ?? 0)
            if ($componentTotal -ne (Convert-ToCents $purchase.($componentMap[$component]))) {
                $componentMismatchPurchaseIds += $purchaseId
                break
            }
        }

        foreach ($line in $purchaseLines) {
            $lineId = [int]($line.id ?? 0)
            $quantity = [int]($line.quantity ?? 0)
            if ($quantity -lt 1 -or -not $allocations.ContainsKey($lineId)) {
                $lineUnitMismatchIds += $lineId
                continue
            }
            $expectedLineCents = [long]$allocations[$lineId]
            if (Test-KnownMoney $line.trueCostBasis) {
                $storedBasisCents = Convert-ToCents $line.trueCostBasis
                $storedLineBasisTotalCents += $storedBasisCents
                if ($storedBasisCents -ne $expectedLineCents) {
                    $lineBasisMismatchIds += $lineId
                }
            } else {
                $lineBasisMismatchIds += $lineId
            }

            $expectedUnitCost = ([decimal]$expectedLineCents / 100) / $quantity
            if (Test-KnownMoney $line.trueCostPerCigar) {
                $extended = [decimal]$line.trueCostPerCigar * $quantity
                $extendedLineUnitCostTotal += $extended
                $extendedCents = [long][decimal]::Round($extended * 100, 0, [MidpointRounding]::AwayFromZero)
                if ($extendedCents -ne $expectedLineCents) {
                    $lineUnitMismatchIds += $lineId
                }
            } else {
                $lineUnitMismatchIds += $lineId
            }

            $relatedLots = @($lotsByPurchaseLineId[$lineId] | Where-Object {
                $null -ne $_ -and [int]($_.id ?? 0) -gt 0
            })
            foreach ($lot in $relatedLots) {
                if (-not (Test-KnownMoney $lot.costPerCigarSnapshot) -or [decimal]::Abs(([decimal]$lot.costPerCigarSnapshot) - $expectedUnitCost) -gt [decimal]'0.000001') {
                    $lotSnapshotMismatchIds += [int]($lot.id ?? 0)
                }
            }
            $relatedEvents = @($eventsByPurchaseLineId[$lineId] | Where-Object {
                $null -ne $_ -and [int]($_.id ?? 0) -gt 0
            })
            foreach ($event in $relatedEvents) {
                if (-not (Test-KnownMoney $event.costPerCigarAtEvent) -or [decimal]::Abs(([decimal]$event.costPerCigarAtEvent) - $expectedUnitCost) -gt [decimal]'0.000001') {
                    $eventSnapshotMismatchIds += [int]($event.id ?? 0)
                }
            }
        }
    }
}

Write-IntegrityMessage INFO 'AUTHORITATIVE_PURCHASE_TOTAL' "Stored authoritative purchase totalPaid: $(Format-Cents $authoritativePurchaseTotalCents)"
Write-IntegrityMessage INFO 'AUTHORITATIVE_LINE_ALLOCATION_TOTAL' "Deterministic line allocation total: $(Format-Cents $authoritativeLineAllocationTotalCents)"
Write-IntegrityMessage INFO 'STORED_LINE_BASIS_TOTAL' "Stored purchase-line trueCostBasis total: $(Format-Cents $storedLineBasisTotalCents)"
Write-IntegrityMessage INFO 'EXTENDED_UNIT_COST_TOTAL' "Stored quantity-times-trueCostPerCigar total: $(Format-DecimalMoney $extendedLineUnitCostTotal)"
if ($subtotalVariancePurchaseIds.Count -gt 0) {
    Write-IntegrityMessage INFO 'PURCHASE_SUBTOTAL_VARIANCE' "Header subtotal differs from line-weight subtotal for Purchase ids: $(Format-IdList $subtotalVariancePurchaseIds). totalPaid remains authoritative."
}
if ($unallocatablePurchaseIds.Count -gt 0) {
    Write-IntegrityMessage WARNING 'PURCHASE_ALLOCATION_UNKNOWN' "Purchases could not be deterministically allocated because line weights are missing or zero. Purchase ids: $(Format-IdList $unallocatablePurchaseIds)."
}
if ($componentMismatchPurchaseIds.Count -gt 0) {
    Write-IntegrityMessage WARNING 'LINE_COMPONENT_ALLOCATION_MISMATCH' "Stored line shipping, tax, excise-tax, or discount allocations do not reconcile to their purchase headers. Purchase ids: $(Format-IdList $componentMismatchPurchaseIds)."
}
if ($lineBasisMismatchIds.Count -gt 0) {
    Write-IntegrityMessage WARNING 'LINE_COST_BASIS_MISMATCH' "Stored trueCostBasis differs from the deterministic authoritative totalPaid allocation. Purchase line ids: $(Format-IdList $lineBasisMismatchIds)."
}
if ($lineUnitMismatchIds.Count -gt 0) {
    Write-IntegrityMessage WARNING 'LINE_UNIT_COST_ROUNDING_MISMATCH' "Stored quantity times trueCostPerCigar does not round back to the authoritative line allocation. Purchase line ids: $(Format-IdList $lineUnitMismatchIds)."
}
if ($lotSnapshotMismatchIds.Count -gt 0) {
    Write-IntegrityMessage WARNING 'LOT_COST_SNAPSHOT_MISMATCH' "Lot cost-per-cigar snapshots differ from the six-decimal authoritative allocation. Lot ids: $(Format-IdList $lotSnapshotMismatchIds)."
}
if ($eventSnapshotMismatchIds.Count -gt 0) {
    Write-IntegrityMessage WARNING 'EVENT_COST_SNAPSHOT_MISMATCH' "Inventory Event cost-per-cigar snapshots differ from the six-decimal authoritative allocation. Event ids: $(Format-IdList $eventSnapshotMismatchIds)."
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
#   .\tools\check-data-integrity.ps1 # defaults to repository data
#   .\tools\check-data-integrity.ps1 -DataRoot "C:\Temp\HumidorHQ-TestData"
