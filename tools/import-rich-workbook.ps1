# Filename: import-rich-workbook.ps1
# Revision : 1.1.0
# Description : Imports the HumidorHQ rich Excel workbook into the local flat-file JSON data model.
# Author : Jason Lamb (with help from Codex CLI)
# Created Date : 2026-07-16
# Modified Date : 2026-07-17
# Changelog :
# 1.1.0 require an isolated data root or explicit destructive override
# 1.0.0 initial release

param(
    [string]$WorkbookPath = 'C:\Users\mcaras\OneDrive\Documents\HumidorHQ_Rich_Import_Workbook.xlsx',
    [string]$DataRoot,
    [switch]$ForceDestructive
)

$ErrorActionPreference = 'Stop'

function Convert-ToTrimmedString {
    param([object]$Value)
    return ([string]$Value).Trim()
}

function Convert-ToNullableString {
    param([object]$Value)
    $text = Convert-ToTrimmedString $Value
    return $(if ($text -eq '') { $null } else { $text })
}

function Convert-ToBool {
    param([object]$Value, [bool]$Default = $true)
    $text = (Convert-ToTrimmedString $Value).ToLowerInvariant()
    if ($text -eq '') { return $Default }
    return $text -in @('yes', 'true', '1', 'y')
}

function Convert-ToNullableInt {
    param([object]$Value)
    $text = Convert-ToTrimmedString $Value
    if ($text -eq '') { return $null }
    return [int][math]::Round([double]$text, 0)
}

function Convert-ToMoneyString {
    param([object]$Value)
    $text = Convert-ToTrimmedString $Value
    if ($text -eq '') { return $null }
    $negative = $false
    if ($text.StartsWith('(') -and $text.EndsWith(')')) {
        $negative = $true
        $text = $text.Trim('(', ')')
    }
    $text = $text.Replace('$', '').Replace(',', '')
    if ($text.StartsWith('+')) { $text = $text.Substring(1) }
    if ($negative -and -not $text.StartsWith('-')) { $text = '-' + $text }
    $value = [decimal]$text
    return ('{0:0.00}' -f $value)
}

function Convert-ToDateString {
    param([object]$Value)
    $text = Convert-ToTrimmedString $Value
    if ($text -eq '') { return $null }
    $parsed = [datetime]::Parse($text, [System.Globalization.CultureInfo]::InvariantCulture)
    return $parsed.ToString('yyyy-MM-dd')
}

function New-IsoTimestamp {
    return [datetime]::UtcNow.ToString("yyyy-MM-dd'T'HH:mm:ss'Z'")
}

function Read-WorksheetRows {
    param(
        [object]$Workbook,
        [string]$SheetName,
        [int]$HeaderRow = 3
    )

    $sheet = $Workbook.Worksheets.Item($SheetName)
    $used = $sheet.UsedRange
    $columnCount = $used.Columns.Count
    $rowCount = $used.Rows.Count
    $headers = @()
    for ($column = 1; $column -le $columnCount; $column++) {
        $headers += (Convert-ToTrimmedString $used.Cells.Item($HeaderRow, $column).Text)
    }

    $rows = @()
    for ($row = $HeaderRow + 1; $row -le $rowCount; $row++) {
        $record = [ordered]@{}
        $hasData = $false
        for ($column = 1; $column -le $columnCount; $column++) {
            $header = $headers[$column - 1]
            if ($header -eq '') { continue }
            $value = Convert-ToTrimmedString $used.Cells.Item($row, $column).Text
            if ($value -ne '') { $hasData = $true }
            $record[$header] = $value
        }
        if ($hasData) {
            $rows += [pscustomobject]$record
        }
    }
    return $rows
}

function Save-JsonCollection {
    param(
        [string]$Path,
        [object]$Data
    )
    $json = $Data | ConvertTo-Json -Depth 8
    [System.IO.File]::WriteAllText($Path, $json + [Environment]::NewLine, [System.Text.UTF8Encoding]::new($false))
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$repositoryDataRoot = [System.IO.Path]::GetFullPath((Join-Path $repoRoot 'data'))
$resolvedDataRoot = if ([string]::IsNullOrWhiteSpace($DataRoot)) {
    $repositoryDataRoot
} else {
    [System.IO.Path]::GetFullPath($DataRoot)
}
if ($resolvedDataRoot -eq $repositoryDataRoot -and -not $ForceDestructive) {
    throw 'SAFETY STOP: importing into the repository data directory is destructive. Supply -DataRoot with an isolated temporary/test directory, or deliberately pass -ForceDestructive.'
}
if (-not (Test-Path -LiteralPath $resolvedDataRoot -PathType Container)) {
    throw "Data root does not exist: $resolvedDataRoot"
}
if ($ForceDestructive) {
    Write-Warning "DESTRUCTIVE OVERRIDE ENABLED: JSON collections under $resolvedDataRoot will be replaced."
}
if (-not (Test-Path -LiteralPath $WorkbookPath)) {
    throw "Workbook not found: $WorkbookPath"
}

$backupRoot = Join-Path $env:TEMP ('humidorhq-import-backup-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
[System.IO.Directory]::CreateDirectory($backupRoot) | Out-Null

$dataFiles = @(
    'catalog-cigars.json',
    'vendors.json',
    'storage-locations.json',
    'storage-sub-locations.json',
    'purchases.json',
    'purchase-lines.json',
    'lots.json',
    'lot-location-balances.json',
    'inventory-events.json',
    'smoking-journal-entries.json',
    'counters.json'
)

foreach ($file in $dataFiles) {
    $source = Join-Path $resolvedDataRoot $file
    if (Test-Path -LiteralPath $source) {
        Copy-Item -LiteralPath $source -Destination (Join-Path $backupRoot $file) -Force
    }
}

$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false
$workbook = $excel.Workbooks.Open($WorkbookPath, $null, $true)

try {
    $catalogRows = Read-WorksheetRows -Workbook $workbook -SheetName 'Catalog'
    $vendorRows = Read-WorksheetRows -Workbook $workbook -SheetName 'Vendors'
    $humidorRows = Read-WorksheetRows -Workbook $workbook -SheetName 'Humidors'
    $purchaseRows = Read-WorksheetRows -Workbook $workbook -SheetName 'Purchases'
    $lotRows = Read-WorksheetRows -Workbook $workbook -SheetName 'Purchase Lots'
    $inventoryRows = Read-WorksheetRows -Workbook $workbook -SheetName 'Current Inventory'
    $smokingRows = Read-WorksheetRows -Workbook $workbook -SheetName 'Smoking History'
    $giftRows = Read-WorksheetRows -Workbook $workbook -SheetName 'Gift-Discard History'
} finally {
    $workbook.Close($false)
    $excel.Quit()
    [System.Runtime.Interopservices.Marshal]::ReleaseComObject($workbook) | Out-Null
    [System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel) | Out-Null
    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()
}

$now = New-IsoTimestamp
$nextId = @{
    'catalog-cigars' = 1
    'vendors' = 1
    'storage-locations' = 1
    'storage-sub-locations' = 1
    'purchases' = 1
    'purchase-lines' = 1
    'lots' = 1
    'lot-location-balances' = 1
    'inventory-events' = 1
    'smoking-journal-entries' = 1
}

function Next-Id {
    param([string]$Collection)
    $id = $nextId[$Collection]
    $nextId[$Collection] = $id + 1
    return $id
}

$catalog = @()
$catalogByKey = @{}
foreach ($row in $catalogRows) {
    $key = Convert-ToTrimmedString $row.CatalogKey
    if ($key -eq '') { continue }
    $strengthValue = Convert-ToNullableString $row.Stength
    if (-not $strengthValue) {
        $strengthValue = Convert-ToNullableString $row.Strength
    }
    if (-not $strengthValue) {
        $strengthValue = 'Medium'
    }
    $record = [ordered]@{
        id = Next-Id 'catalog-cigars'
        manufacturer = Convert-ToTrimmedString $row.Manufacturer
        series = Convert-ToTrimmedString $row.Series
        vitola = Convert-ToTrimmedString $row.Vitola
        shape = Convert-ToNullableString $row.Shape
        length = Convert-ToNullableString $row.Length
        ringGauge = Convert-ToNullableInt $row.RingGauge
        wrapper = Convert-ToNullableString $row.Wrapper
        binder = Convert-ToNullableString $row.Binder
        filler = Convert-ToNullableString $row.Filler
        strength = $strengthValue
        msrp = Convert-ToMoneyString $row.MSRPPerCigar
        country = Convert-ToNullableString $row.Country
        notes = Convert-ToNullableString $row.Notes
        isActive = Convert-ToBool $row.IsActive $true
        createdAt = $now
        updatedAt = $now
    }
    $catalog += [pscustomobject]$record
    $catalogByKey[$key] = $record
}

$vendors = @()
$vendorByName = @{}
foreach ($row in $vendorRows) {
    $name = Convert-ToTrimmedString $row.VendorName
    if ($name -eq '') { continue }
    $record = [ordered]@{
        id = Next-Id 'vendors'
        name = $name
        website = Convert-ToNullableString $row.Website
        contactName = $null
        email = $null
        phone = $null
        notes = @(
            (Convert-ToNullableString $row.City),
            (Convert-ToNullableString $row.State),
            (Convert-ToNullableString $row.Country),
            (Convert-ToNullableString $row.Notes)
        ) | Where-Object { $_ } | ForEach-Object { $_ } | Join-String -Separator '; '
        createdAt = $now
        updatedAt = $now
    }
    if ($record.notes -eq '') { $record.notes = $null }
    $vendors += [pscustomobject]$record
    $vendorByName[$name] = $record
}

$storageLocations = @()
$storageSubLocations = @()
$humidorByName = @{}
$sectionKeyToRecord = @{}

foreach ($row in $humidorRows) {
    $humidorName = Convert-ToTrimmedString $row.HumidorName
    if ($humidorName -eq '') { continue }
    if (-not $humidorByName.ContainsKey($humidorName)) {
        $location = [ordered]@{
            id = Next-Id 'storage-locations'
            name = $humidorName
            type = 'Imported'
            capacity = Convert-ToNullableInt $row.Capacity
            notes = Convert-ToNullableString $row.Notes
            isActive = Convert-ToBool $row.IsActive $true
            createdAt = $now
            updatedAt = $now
        }
        $storageLocations += [pscustomobject]$location
        $humidorByName[$humidorName] = $location
    }

    $sectionName = Convert-ToTrimmedString $row.SectionName
    if ($sectionName -eq '') { continue }
    $sectionKey = $humidorName + '|' + $sectionName
    if ($sectionKeyToRecord.ContainsKey($sectionKey)) { continue }
    $section = [ordered]@{
        id = Next-Id 'storage-sub-locations'
        storageLocationId = $humidorByName[$humidorName].id
        name = $sectionName
        type = Convert-ToNullableString $row.SectionKind
        capacity = Convert-ToNullableInt $row.Capacity
        notes = Convert-ToNullableString $row.Notes
        isActive = Convert-ToBool $row.IsActive $true
        createdAt = $now
        updatedAt = $now
    }
    $storageSubLocations += [pscustomobject]$section
    $sectionKeyToRecord[$sectionKey] = $section
}

if (-not $humidorByName.ContainsKey('Pre Inventory')) {
    $importHumidor = [ordered]@{
        id = Next-Id 'storage-locations'
        name = 'Pre Inventory'
        type = 'Imported Holding'
        capacity = $null
        notes = 'Auto-created placeholder for imported lots without a current inventory location.'
        isActive = $true
        createdAt = $now
        updatedAt = $now
    }
    $storageLocations += [pscustomobject]$importHumidor
    $humidorByName['Pre Inventory'] = $importHumidor
}

if (-not $sectionKeyToRecord.ContainsKey('Pre Inventory|General')) {
    $importSection = [ordered]@{
        id = Next-Id 'storage-sub-locations'
        storageLocationId = $humidorByName['Pre Inventory'].id
        name = 'General'
        type = 'GENERAL'
        capacity = $null
        notes = 'Auto-created placeholder for imported current inventory.'
        isActive = $true
        createdAt = $now
        updatedAt = $now
    }
    $storageSubLocations += [pscustomobject]$importSection
    $sectionKeyToRecord['Pre Inventory|General'] = $importSection
}

$purchases = @()
$purchaseByExternalId = @{}
foreach ($row in $purchaseRows) {
    $purchaseExternalId = Convert-ToTrimmedString $row.PurchaseID
    if ($purchaseExternalId -eq '') { continue }
    $vendor = $vendorByName[(Convert-ToTrimmedString $row.VendorName)]
    $record = [ordered]@{
        id = Next-Id 'purchases'
        vendorId = $(if ($vendor) { $vendor.id } else { $null })
        status = 'received'
        purchaseDate = Convert-ToDateString $row.PurchaseDate
        expectedDate = $null
        receivedDate = Convert-ToDateString $row.PurchaseDate
        trackingNumber = $null
        invoiceNumber = @((Convert-ToNullableString $row.OrderNumber), $purchaseExternalId) | Where-Object { $_ } | Select-Object -First 1
        shipping = Convert-ToMoneyString $row.Shipping
        exciseTax = Convert-ToMoneyString $row.'Excise Tax'
        salesTax = Convert-ToMoneyString $row.'Sales Tax'
        discount = Convert-ToMoneyString $row.Discount
        totalPaid = Convert-ToMoneyString $row.TotalPaid
        notes = @(
            $(if ($row.DateConfidence) { 'DateConfidence=' + (Convert-ToTrimmedString $row.DateConfidence) } else { $null }),
            $(if ($row.Currency) { 'Currency=' + (Convert-ToTrimmedString $row.Currency) } else { $null }),
            $(if ($row.Notes) { Convert-ToTrimmedString $row.Notes } else { $null }),
            'Imported PurchaseID=' + $purchaseExternalId
        ) | Where-Object { $_ } | Join-String -Separator '; '
        createdAt = $now
        updatedAt = $now
    }
    $purchases += [pscustomobject]$record
    $purchaseByExternalId[$purchaseExternalId] = $record
}

$inventoryByLotExternalId = @{}
foreach ($row in $inventoryRows) {
    $lotExternalId = Convert-ToTrimmedString $row.LotID
    if ($lotExternalId -eq '') { continue }
    if (-not $inventoryByLotExternalId.ContainsKey($lotExternalId)) {
        $inventoryByLotExternalId[$lotExternalId] = @()
    }
    $inventoryByLotExternalId[$lotExternalId] += $row
}

$purchaseLines = @()
$lots = @()
$balances = @()
$events = @()
$journalEntries = @()
$lotExternalIdToLot = @{}
$lotExternalIdToPurchaseLine = @{}

foreach ($row in $lotRows) {
    $lotExternalId = Convert-ToTrimmedString $row.LotID
    $purchaseExternalId = Convert-ToTrimmedString $row.PurchaseID
    $catalogKey = Convert-ToTrimmedString $row.CatalogKey
    if ($lotExternalId -eq '' -or $purchaseExternalId -eq '' -or $catalogKey -eq '') { continue }
    if (-not $purchaseByExternalId.ContainsKey($purchaseExternalId)) { continue }
    if (-not $catalogByKey.ContainsKey($catalogKey)) { continue }

    $quantityPurchased = [int](Convert-ToTrimmedString $row.QuantityPurchased)
    $inventoryRowsForLot = if ($inventoryByLotExternalId.ContainsKey($lotExternalId)) { @($inventoryByLotExternalId[$lotExternalId]) } else { @() }
    $currentQuantity = 0
    if ($inventoryRowsForLot.Count -gt 0) {
        foreach ($inventoryRow in $inventoryRowsForLot) {
            $currentQuantity += [int](Convert-ToTrimmedString $inventoryRow.CurrentQuantity)
        }
    } else {
        $currentQuantity = $quantityPurchased
    }

    $fallbackSection = $sectionKeyToRecord['Pre Inventory|General']
    $storageLocationId = $fallbackSection.storageLocationId
    $storageSubLocationId = $fallbackSection.id
    if ($inventoryRowsForLot.Count -eq 1) {
        $singleInventoryRow = $inventoryRowsForLot[0]
        $humidorName = Convert-ToTrimmedString $singleInventoryRow.HumidorName
        $sectionName = Convert-ToTrimmedString $singleInventoryRow.SectionName
        if ($humidorByName.ContainsKey($humidorName)) {
            $storageLocationId = $humidorByName[$humidorName].id
        }
        if ($sectionKeyToRecord.ContainsKey($humidorName + '|' + $sectionName)) {
            $storageSubLocationId = $sectionKeyToRecord[$humidorName + '|' + $sectionName].id
        }
    }

    $actualCostPerCigar = Convert-ToMoneyString $row.ActualCostPerCigar
    $msrpAtPurchase = Convert-ToMoneyString $row.MSRPPerCigarAtPurchase
    $purchaseLine = [ordered]@{
        id = Next-Id 'purchase-lines'
        purchaseId = $purchaseByExternalId[$purchaseExternalId].id
        catalogCigarId = $catalogByKey[$catalogKey].id
        storageLocationId = $storageLocationId
        storageSubLocationId = $storageSubLocationId
        quantity = $quantityPurchased
        unitCost = $actualCostPerCigar
        msrpPerCigar = $msrpAtPurchase
        lineSubtotal = Convert-ToMoneyString $row.PurchasePriceAllocated
        allocatedDiscount = Convert-ToMoneyString $row.DiscountAllocated
        allocatedShipping = Convert-ToMoneyString $row.ShippingAllocated
        allocatedSalesTax = Convert-ToMoneyString $row.SalesTaxAllocation
        allocatedExciseTax = Convert-ToMoneyString $row.ExciseTaxAllocated
        trueCostBasis = ('{0:0.00}' -f (
            [decimal](Convert-ToMoneyString $row.PurchasePriceAllocated) +
            [decimal](Convert-ToMoneyString $row.ShippingAllocated) +
            [decimal](Convert-ToMoneyString $row.SalesTaxAllocation) +
            [decimal](Convert-ToMoneyString $row.ExciseTaxAllocated) -
            [decimal](Convert-ToMoneyString $row.DiscountAllocated)
        ))
        trueCostPerCigar = $actualCostPerCigar
        msrpPerCigarResolved = $msrpAtPurchase
        notes = @(
            $(if ($row.DateConfidence) { 'DateConfidence=' + (Convert-ToTrimmedString $row.DateConfidence) } else { $null }),
            $(if ($row.InventoryStatus) { 'InventoryStatus=' + (Convert-ToTrimmedString $row.InventoryStatus) } else { $null }),
            $(if ($row.Notes) { Convert-ToTrimmedString $row.Notes } else { $null }),
            'Imported LotID=' + $lotExternalId
        ) | Where-Object { $_ } | Join-String -Separator '; '
        createdAt = $now
        updatedAt = $now
    }
    $purchaseLines += [pscustomobject]$purchaseLine
    $lotExternalIdToPurchaseLine[$lotExternalId] = $purchaseLine

    $lot = [ordered]@{
        id = Next-Id 'lots'
        purchaseLineId = $purchaseLine.id
        purchaseId = $purchaseLine.purchaseId
        catalogCigarId = $purchaseLine.catalogCigarId
        initialQuantity = $quantityPurchased
        currentQuantity = $currentQuantity
        purchaseDateSnapshot = $purchaseByExternalId[$purchaseExternalId].purchaseDate
        receivedDateSnapshot = Convert-ToDateString $row.ReceivedDate
        actualCostPerCigar = $actualCostPerCigar
        allocatedCostPerCigar = $actualCostPerCigar
        costPerCigarSnapshot = $actualCostPerCigar
        msrpPerCigar = $msrpAtPurchase
        msrpPerCigarSnapshot = $msrpAtPurchase
        createdAt = $now
        updatedAt = $now
    }
    $lots += [pscustomobject]$lot
    $lotExternalIdToLot[$lotExternalId] = $lot

    $events += [pscustomobject][ordered]@{
        id = Next-Id 'inventory-events'
        eventType = 'purchase-receipt'
        lotId = $lot.id
        purchaseLineId = $purchaseLine.id
        purchaseId = $purchaseLine.purchaseId
        catalogCigarId = $purchaseLine.catalogCigarId
        storageLocationId = $purchaseLine.storageLocationId
        storageSubLocationId = $purchaseLine.storageSubLocationId
        quantity = $quantityPurchased
        eventDate = $(if ($lot.receivedDateSnapshot) { $lot.receivedDateSnapshot } else { $purchaseByExternalId[$purchaseExternalId].purchaseDate })
        occurredAt = $now
        costPerCigarAtEvent = $actualCostPerCigar
        msrpPerCigarAtEvent = $msrpAtPurchase
        notes = 'Imported purchase receipt for ' + $lotExternalId
        createdAt = $now
        updatedAt = $now
    }

    if ($inventoryRowsForLot.Count -gt 0) {
        foreach ($inventoryRow in $inventoryRowsForLot) {
            $humidorName = Convert-ToTrimmedString $inventoryRow.HumidorName
            $sectionName = Convert-ToTrimmedString $inventoryRow.SectionName
            $quantity = [int](Convert-ToTrimmedString $inventoryRow.CurrentQuantity)
            if ($quantity -le 0) { continue }

            $location = $humidorByName[$humidorName]
            $section = $sectionKeyToRecord[$humidorName + '|' + $sectionName]
            if (-not $location) { $location = $humidorByName['Pre Inventory'] }
            if (-not $section) { $section = $sectionKeyToRecord['Pre Inventory|General'] }

            $balances += [pscustomobject][ordered]@{
                id = Next-Id 'lot-location-balances'
                purchaseLineId = $purchaseLine.id
                lotId = $lot.id
                storageLocationId = $location.id
                storageSubLocationId = $section.id
                quantity = $quantity
                createdAt = $now
                updatedAt = $now
            }
        }
    } elseif ($currentQuantity -gt 0) {
        $balances += [pscustomobject][ordered]@{
            id = Next-Id 'lot-location-balances'
            purchaseLineId = $purchaseLine.id
            lotId = $lot.id
            storageLocationId = $fallbackSection.storageLocationId
            storageSubLocationId = $fallbackSection.id
            quantity = $currentQuantity
            createdAt = $now
            updatedAt = $now
        }
    }
}

foreach ($row in $smokingRows) {
    $lotExternalId = Convert-ToTrimmedString $row.LotID
    if ($lotExternalId -eq '' -or -not $lotExternalIdToLot.ContainsKey($lotExternalId)) { continue }
    $lot = $lotExternalIdToLot[$lotExternalId]
    $catalog = $catalogByKey[(Convert-ToTrimmedString $row.CatalogKey)]
    $humidorName = Convert-ToTrimmedString $row.SourceHumidor
    $sectionName = Convert-ToTrimmedString $row.SourceSection
    $section = $sectionKeyToRecord[$humidorName + '|' + $sectionName]
    $location = $humidorByName[$humidorName]
    $quantity = [int](Convert-ToTrimmedString $row.Quantity)
    if ($quantity -le 0) { continue }

    $event = [ordered]@{
        id = Next-Id 'inventory-events'
        eventType = 'SMOKED'
        lotId = $lot.id
        purchaseLineId = $lot.purchaseLineId
        purchaseId = $lot.purchaseId
        catalogCigarId = $(if ($catalog) { $catalog.id } else { $lot.catalogCigarId })
        fromStorageLocationId = $(if ($location) { $location.id } else { $null })
        fromStorageSubLocationId = $(if ($section) { $section.id } else { $null })
        quantity = $quantity
        eventDate = Convert-ToDateString $row.SmokeDate
        occurredAt = $now
        costPerCigarAtEvent = Convert-ToMoneyString $row.CostPerCigarAtEvent
        msrpPerCigarAtEvent = Convert-ToMoneyString $row.MSRPPerCigarAtEvent
        notes = @((Convert-ToNullableString $row.RecordedNotes), (Convert-ToNullableString $row.JournalNotes), 'Imported SmokeEventID=' + (Convert-ToTrimmedString $row.SmokeEventID)) | Where-Object { $_ } | Join-String -Separator '; '
        createdAt = $now
        updatedAt = $now
    }
    $events += [pscustomobject]$event

    $rating = Convert-ToNullableInt $row.Rating1to10
    $journalNotes = Convert-ToNullableString $row.JournalNotes
    if ($rating) {
        $journalEntries += [pscustomobject][ordered]@{
            id = Next-Id 'smoking-journal-entries'
            inventoryEventId = $event.id
            rating = $rating
            notes = $journalNotes
            createdAt = $now
            updatedAt = $now
        }
    }
}

foreach ($row in $giftRows) {
    $lotExternalId = Convert-ToTrimmedString $row.LotID
    if ($lotExternalId -eq '' -or -not $lotExternalIdToLot.ContainsKey($lotExternalId)) { continue }
    $lot = $lotExternalIdToLot[$lotExternalId]
    $catalog = $catalogByKey[(Convert-ToTrimmedString $row.CatalogKey)]
    $humidorName = Convert-ToTrimmedString $row.SourceHumidor
    $sectionName = Convert-ToTrimmedString $row.SourceSection
    $section = $sectionKeyToRecord[$humidorName + '|' + $sectionName]
    $location = $humidorByName[$humidorName]
    $quantity = [int](Convert-ToTrimmedString $row.Quantity)
    if ($quantity -le 0) { continue }

    $eventTypeRaw = (Convert-ToTrimmedString $row.EventType).ToUpperInvariant()
    $eventType = if ($eventTypeRaw -match 'GIFT') { 'GIFTED' } else { 'DISCARDED' }
    $events += [pscustomobject][ordered]@{
        id = Next-Id 'inventory-events'
        eventType = $eventType
        lotId = $lot.id
        purchaseLineId = $lot.purchaseLineId
        purchaseId = $lot.purchaseId
        catalogCigarId = $(if ($catalog) { $catalog.id } else { $lot.catalogCigarId })
        fromStorageLocationId = $(if ($location) { $location.id } else { $null })
        fromStorageSubLocationId = $(if ($section) { $section.id } else { $null })
        quantity = $quantity
        eventDate = Convert-ToDateString $row.EventDate
        occurredAt = $now
        costPerCigarAtEvent = Convert-ToMoneyString $row.CostPerCigarAtEvent
        msrpPerCigarAtEvent = Convert-ToMoneyString $row.MSRPPerCigarAtEvent
        notes = @((Convert-ToNullableString $row.Recipient), (Convert-ToNullableString $row.ReasonOrNotes), 'Imported EventID=' + (Convert-ToTrimmedString $row.EventID)) | Where-Object { $_ } | Join-String -Separator '; '
        createdAt = $now
        updatedAt = $now
    }
}

$counters = @{
    'catalog-cigars' = $nextId['catalog-cigars']
    'vendors' = $nextId['vendors']
    'storage-locations' = $nextId['storage-locations']
    'storage-sub-locations' = $nextId['storage-sub-locations']
    'purchases' = $nextId['purchases']
    'purchase-lines' = $nextId['purchase-lines']
    'lots' = $nextId['lots']
    'lot-location-balances' = $nextId['lot-location-balances']
    'inventory-events' = $nextId['inventory-events']
    'smoking-journal-entries' = $nextId['smoking-journal-entries']
}

Save-JsonCollection -Path (Join-Path $resolvedDataRoot 'catalog-cigars.json') -Data $catalog
Save-JsonCollection -Path (Join-Path $resolvedDataRoot 'vendors.json') -Data $vendors
Save-JsonCollection -Path (Join-Path $resolvedDataRoot 'storage-locations.json') -Data $storageLocations
Save-JsonCollection -Path (Join-Path $resolvedDataRoot 'storage-sub-locations.json') -Data $storageSubLocations
Save-JsonCollection -Path (Join-Path $resolvedDataRoot 'purchases.json') -Data $purchases
Save-JsonCollection -Path (Join-Path $resolvedDataRoot 'purchase-lines.json') -Data $purchaseLines
Save-JsonCollection -Path (Join-Path $resolvedDataRoot 'lots.json') -Data $lots
Save-JsonCollection -Path (Join-Path $resolvedDataRoot 'lot-location-balances.json') -Data $balances
Save-JsonCollection -Path (Join-Path $resolvedDataRoot 'inventory-events.json') -Data $events
Save-JsonCollection -Path (Join-Path $resolvedDataRoot 'smoking-journal-entries.json') -Data $journalEntries
Save-JsonCollection -Path (Join-Path $resolvedDataRoot 'counters.json') -Data $counters

Write-Host "Import complete from $WorkbookPath" -ForegroundColor Green
Write-Host "Backup of previous local data saved to $backupRoot" -ForegroundColor Yellow
Write-Host ("Catalog: " + $catalog.Count + ", Vendors: " + $vendors.Count + ", Humidors: " + $storageLocations.Count + ", Sections: " + $storageSubLocations.Count + ", Purchases: " + $purchases.Count + ", Lots: " + $lots.Count + ", Balances: " + $balances.Count + ", Events: " + $events.Count) -ForegroundColor Green

# Example Usage:
#   .\tools\import-rich-workbook.ps1 -DataRoot "$env:TEMP\humidorhq-import-test"
#   .\tools\import-rich-workbook.ps1 -WorkbookPath "C:\Path\HumidorHQ_Rich_Import_Workbook.xlsx" -DataRoot "C:\Temp\HumidorHQ-TestData"
#   .\tools\import-rich-workbook.ps1 -ForceDestructive
