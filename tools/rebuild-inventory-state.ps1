# Filename: rebuild-inventory-state.ps1
# Revision : 1.0.0
# Description : Rebuilds lot balances and purchase-receipt inventory events from purchases, purchase lines, lots, and non-receipt events.
# Author : OpenAI Codex
# Created Date : 2026-07-16
# Modified Date : 2026-07-16
# Changelog :
# 1.0.0 initial rebuild utility after purchase-sync scoping fix

$ErrorActionPreference = 'Stop'

function Load-JsonFile {
    param([string]$Path)
    if (-not (Test-Path -LiteralPath $Path)) {
        throw "Missing file: $Path"
    }
    return Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json
}

function Save-JsonFile {
    param(
        [string]$Path,
        [object]$Data
    )
    $json = $Data | ConvertTo-Json -Depth 10
    [System.IO.File]::WriteAllText($Path, $json + [Environment]::NewLine, [System.Text.UTF8Encoding]::new($false))
}

function Normalize-LocationKey {
    param($LocationId, $SubLocationId)
    $sub = if ($null -eq $SubLocationId -or "$SubLocationId" -eq '') { '' } else { [string]$SubLocationId }
    return "$LocationId|$sub"
}

function Ensure-BalanceBucket {
    param(
        [hashtable]$Buckets,
        [int]$LotId,
        [int]$PurchaseLineId,
        [int]$PurchaseId,
        [int]$LocationId,
        $SubLocationId
    )
    $key = Normalize-LocationKey $LocationId $SubLocationId
    if (-not $Buckets.ContainsKey($key)) {
        $Buckets[$key] = [ordered]@{
            purchaseLineId = $PurchaseLineId
            purchaseId = $PurchaseId
            lotId = $LotId
            storageLocationId = $LocationId
            storageSubLocationId = if ($null -eq $SubLocationId -or "$SubLocationId" -eq '') { $null } else { [int]$SubLocationId }
            quantity = 0
        }
    }
    return $Buckets[$key]
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$purchasesPath = Join-Path $repoRoot 'data\purchases.json'
$linesPath = Join-Path $repoRoot 'data\purchase-lines.json'
$lotsPath = Join-Path $repoRoot 'data\lots.json'
$eventsPath = Join-Path $repoRoot 'data\inventory-events.json'
$balancesPath = Join-Path $repoRoot 'data\lot-location-balances.json'
$countersPath = Join-Path $repoRoot 'data\counters.json'

$purchases = @(Load-JsonFile $purchasesPath)
$purchaseLines = @(Load-JsonFile $linesPath)
$lots = @(Load-JsonFile $lotsPath)
$events = @(Load-JsonFile $eventsPath)
$counters = Load-JsonFile $countersPath

$purchasesById = @{}
foreach ($purchase in $purchases) { $purchasesById[[int]$purchase.id] = $purchase }
$linesById = @{}
foreach ($line in $purchaseLines) { $linesById[[int]$line.id] = $line }

$nonReceiptEvents = @($events | Where-Object { $_.eventType -ne 'purchase-receipt' })
$receiptEvents = New-Object System.Collections.Generic.List[object]
$rebuiltBalances = New-Object System.Collections.Generic.List[object]
$nextBalanceId = 1

foreach ($lot in $lots) {
    $purchaseLineId = [int]($lot.purchaseLineId ?? 0)
    if ($purchaseLineId -lt 1 -or -not $linesById.ContainsKey($purchaseLineId)) {
        continue
    }
    $line = $linesById[$purchaseLineId]
    $purchaseId = [int]($line.purchaseId ?? $lot.purchaseId ?? 0)
    if ($purchaseId -lt 1 -or -not $purchasesById.ContainsKey($purchaseId)) {
        continue
    }
    $purchase = $purchasesById[$purchaseId]
    if ([string]$purchase.status -ne 'received') {
        continue
    }
    $locationId = [int]($line.storageLocationId ?? 0)
    if ($locationId -lt 1) {
        continue
    }

    $lotId = [int]$lot.id
    $buckets = @{}
    $rootBucket = Ensure-BalanceBucket $buckets $lotId $purchaseLineId $purchaseId $locationId $line.storageSubLocationId
    $rootBucket.quantity = [int]($line.quantity ?? $lot.initialQuantity ?? 0)

    $receiptEvents.Add([pscustomobject][ordered]@{
        id = 0
        purchaseLineId = $purchaseLineId
        purchaseId = $purchaseId
        lotId = $lotId
        catalogCigarId = [int]($line.catalogCigarId ?? $lot.catalogCigarId ?? 0)
        storageLocationId = $locationId
        storageSubLocationId = if ($null -eq $line.storageSubLocationId -or "$($line.storageSubLocationId)" -eq '') { $null } else { [int]$line.storageSubLocationId }
        eventType = 'purchase-receipt'
        quantity = [int]($line.quantity ?? $lot.initialQuantity ?? 0)
        eventDate = $purchase.receivedDate ?? $purchase.purchaseDate ?? $lot.receivedDateSnapshot ?? $lot.purchaseDateSnapshot
        occurredAt = $purchase.receivedDate ?? $purchase.purchaseDate ?? $lot.receivedDateSnapshot ?? $lot.purchaseDateSnapshot
        costPerCigarAtEvent = $line.trueCostPerCigar ?? $lot.allocatedCostPerCigar ?? $lot.costPerCigarSnapshot
        msrpPerCigarAtEvent = $line.msrpPerCigarResolved ?? $line.msrpPerCigar ?? $lot.msrpPerCigarSnapshot
        notes = $line.notes ?? ''
        createdAt = $lot.createdAt
        updatedAt = $lot.updatedAt
    })

    $lotEvents = @($nonReceiptEvents | Where-Object { [int]($_.lotId ?? 0) -eq $lotId } | Sort-Object @{ Expression = { $_.eventDate ?? $_.occurredAt ?? $_.updatedAt ?? '' } }, @{ Expression = { [int]$_.id } })
    foreach ($event in $lotEvents) {
        $type = [string]$event.eventType
        $quantity = [int]($event.quantity ?? 0)
        if ($quantity -lt 1) {
            continue
        }

        if ($type -eq 'move') {
            $fromKey = Normalize-LocationKey ([int]($event.fromStorageLocationId ?? 0)) $event.fromStorageSubLocationId
            if ($buckets.ContainsKey($fromKey)) {
                $buckets[$fromKey].quantity -= $quantity
            }
            $toBucket = Ensure-BalanceBucket $buckets $lotId $purchaseLineId $purchaseId ([int]($event.storageLocationId ?? 0)) $event.storageSubLocationId
            $toBucket.quantity += $quantity
            continue
        }

        if ($type -in @('SMOKED', 'GIFTED', 'DISCARDED')) {
            $fromKey = Normalize-LocationKey ([int]($event.fromStorageLocationId ?? 0)) $event.fromStorageSubLocationId
            if ($buckets.ContainsKey($fromKey)) {
                $buckets[$fromKey].quantity -= $quantity
            }
        }
    }

    foreach ($bucket in $buckets.Values) {
        if ([int]$bucket.quantity -le 0) {
            continue
        }
        $rebuiltBalances.Add([pscustomobject][ordered]@{
            id = $nextBalanceId
            purchaseLineId = $bucket.purchaseLineId
            purchaseId = $bucket.purchaseId
            lotId = $bucket.lotId
            storageLocationId = $bucket.storageLocationId
            storageSubLocationId = $bucket.storageSubLocationId
            quantity = [int]$bucket.quantity
            createdAt = $lot.createdAt
            updatedAt = $lot.updatedAt
        })
        $nextBalanceId++
    }
}

$nextEventId = 1
$allEvents = New-Object System.Collections.Generic.List[object]
foreach ($receiptEvent in $receiptEvents) {
    $receiptEvent.id = $nextEventId
    $nextEventId++
    $allEvents.Add($receiptEvent)
}
foreach ($event in ($nonReceiptEvents | Sort-Object {[int]$_.id})) {
    $event.id = $nextEventId
    $nextEventId++
    $allEvents.Add($event)
}

$counters.'lot-location-balances' = $nextBalanceId
$counters.'inventory-events' = $nextEventId

Save-JsonFile -Path $balancesPath -Data $rebuiltBalances
Save-JsonFile -Path $eventsPath -Data $allEvents
Save-JsonFile -Path $countersPath -Data $counters

Write-Host "Rebuilt $($rebuiltBalances.Count) balance rows and $($allEvents.Count) inventory events." -ForegroundColor Green
