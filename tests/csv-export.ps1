# Filename: csv-export.ps1
# Revision : 1.0.0
# Description : Verifies the authenticated read-only CSV ZIP export against an isolated related-record fixture.
# Author : Jason Lamb (with help from Codex CLI)
# Created Date : 2026-07-25
# Modified Date : 2026-07-25
# Changelog :
# 1.0.0 verify authentication, stable CSV content, joined context, secret exclusion, reversal status, and hash preservation

[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ('humidorhq-csv-export-test-' + [guid]::NewGuid().ToString('N'))
$tempApp = Join-Path $tempRoot 'app'
$tempData = Join-Path $tempApp 'data'
$serverProcess = $null
$php = (Get-Command php -ErrorAction SilentlyContinue).Source
if ([string]::IsNullOrWhiteSpace($php)) {
    throw 'php.exe was not found on PATH.'
}

function Set-JsonFixture {
    param([string]$Name, [object]$Value)
    $Value | ConvertTo-Json -Depth 12 -AsArray:($Value -is [array]) |
        Set-Content -LiteralPath (Join-Path $tempData "$Name.json") -Encoding utf8NoBOM
}

function Get-DataHashes {
    param([string]$Root)
    $result = [ordered]@{}
    foreach ($file in Get-ChildItem -LiteralPath $Root -File | Where-Object { $_.Name -match '\.(json|jsonl)$' } | Sort-Object Name) {
        $result[$file.Name] = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash
    }
    return $result
}

function Assert-HashMapsEqual {
    param([hashtable]$Before, [hashtable]$After, [string]$Context)
    if (($Before | ConvertTo-Json -Compress) -ne ($After | ConvertTo-Json -Compress)) {
        throw "$Context changed runtime JSON or the audit log."
    }
}

$sourceBefore = Get-DataHashes -Root (Join-Path $repoRoot 'data')
try {
    New-Item -ItemType Directory -Path $tempApp, $tempData | Out-Null
    Copy-Item -LiteralPath (Join-Path $repoRoot 'api') -Destination $tempApp -Recurse
    Copy-Item -LiteralPath (Join-Path $repoRoot 'seed-data') -Destination $tempApp -Recurse
    Copy-Item -LiteralPath (Join-Path $repoRoot 'backups') -Destination $tempApp -Recurse
    Copy-Item -LiteralPath (Join-Path $repoRoot 'CHANGELOG.md') -Destination $tempApp

    Set-JsonFixture 'catalog-cigars' @([ordered]@{
        id = 1; manufacturer = '=Formula Cigars'; series = 'Reserve'; vitola = 'Toro'; shape = 'Parejo'
        length = '6.00'; ringGauge = 52; wrapper = 'Habano'; binder = 'Nicaragua'; filler = 'Nicaragua'
        strength = 'Medium'; msrp = '8.00'; country = 'Nicaragua'; notes = 'Export fixture'
        buyAgainStatus = 'YES'; buyAgainNotes = 'Buy more'; isActive = $true
        createdAt = '2026-01-01T12:00:00Z'; updatedAt = '2026-01-01T12:00:00Z'
    })
    Set-JsonFixture 'vendors' @([ordered]@{
        id = 1; name = 'Vendor One'; website = 'https://example.test'; contactName = 'Buyer'
        email = 'vendor@example.test'; phone = '555-0100'; notes = ''; createdAt = '2026-01-01T12:00:00Z'; updatedAt = '2026-01-01T12:00:00Z'
    })
    Set-JsonFixture 'storage-locations' @([ordered]@{
        id = 1; name = 'Main Humidor'; type = 'HUMIDOR'; capacity = 100; notes = ''; isActive = $true
        createdAt = '2026-01-01T12:00:00Z'; updatedAt = '2026-01-01T12:00:00Z'
    })
    Set-JsonFixture 'storage-sub-locations' @([ordered]@{
        id = 1; storageLocationId = 1; name = 'Top Tray'; type = 'TRAY'; capacity = 50; notes = ''; isActive = $true
        createdAt = '2026-01-01T12:00:00Z'; updatedAt = '2026-01-01T12:00:00Z'
    })
    Set-JsonFixture 'purchases' @([ordered]@{
        id = 1; vendorId = 1; status = 'received'; purchaseDate = '2026-01-01'; expectedDate = $null
        receivedDate = '2026-01-02'; trackingNumber = '001234'; invoiceNumber = 'INV-1'; subtotal = '18.00'
        shipping = '0.00'; exciseTax = '0.00'; salesTax = '0.00'; discount = '0.00'; totalPaid = '18.00'
        notes = 'Purchase fixture'; createdAt = '2026-01-01T12:00:00Z'; updatedAt = '2026-01-02T12:00:00Z'
    })
    Set-JsonFixture 'purchase-lines' @([ordered]@{
        id = 1; purchaseId = 1; catalogCigarId = 1; storageLocationId = 1; storageSubLocationId = 1
        quantity = 3; unitCost = '6.00'; msrpPerCigar = '8.00'; lineSubtotal = '18.00'
        allocatedDiscount = '0.00'; allocatedShipping = '0.00'; allocatedSalesTax = '0.00'; allocatedExciseTax = '0.00'
        trueCostBasis = '18.00'; trueCostPerCigar = '6.000000'; msrpPerCigarResolved = '8.00'; notes = ''
        createdAt = '2026-01-01T12:00:00Z'; updatedAt = '2026-01-02T12:00:00Z'
    })
    Set-JsonFixture 'lots' @([ordered]@{
        id = 1; purchaseLineId = 1; purchaseId = 1; catalogCigarId = 1; initialQuantity = 3; currentQuantity = 2
        purchaseDateSnapshot = '2026-01-01'; receivedDateSnapshot = '2026-01-02'; actualCostPerCigar = '6.00'
        allocatedCostPerCigar = '6.000000'; costPerCigarSnapshot = '6.000000'; msrpPerCigar = '8.00'
        msrpPerCigarSnapshot = '8.00'; createdAt = '2026-01-02T12:00:00Z'; updatedAt = '2026-01-04T12:00:00Z'
    })
    Set-JsonFixture 'lot-location-balances' @([ordered]@{
        id = 1; purchaseLineId = 1; lotId = 1; storageLocationId = 1; storageSubLocationId = 1; quantity = 2
        createdAt = '2026-01-02T12:00:00Z'; updatedAt = '2026-01-04T12:00:00Z'
    })
    Set-JsonFixture 'inventory-events' @(
        [ordered]@{ id = 1; eventType = 'PURCHASE_RECEIPT'; lotId = 1; purchaseLineId = 1; purchaseId = 1; catalogCigarId = 1; storageLocationId = 1; storageSubLocationId = 1; quantity = 3; eventDate = '2026-01-02'; occurredAt = '2026-01-02T12:00:00Z'; costPerCigarAtEvent = '6.000000'; msrpPerCigarAtEvent = '8.00'; notes = ''; createdAt = '2026-01-02T12:00:00Z'; updatedAt = '2026-01-02T12:00:00Z' },
        [ordered]@{ id = 2; eventType = 'SMOKED'; lotId = 1; purchaseLineId = 1; purchaseId = 1; catalogCigarId = 1; fromStorageLocationId = 1; fromStorageSubLocationId = 1; quantity = 1; eventDate = '2026-01-03'; occurredAt = '2026-01-03T12:00:00Z'; costPerCigarAtEvent = '5.990000'; msrpPerCigarAtEvent = '8.00'; notes = 'Effective smoke'; createdAt = '2026-01-03T12:00:00Z'; updatedAt = '2026-01-03T12:00:00Z' },
        [ordered]@{ id = 3; eventType = 'SMOKED'; lotId = 1; purchaseLineId = 1; purchaseId = 1; catalogCigarId = 1; fromStorageLocationId = 1; fromStorageSubLocationId = 1; quantity = 1; eventDate = '2026-01-04'; occurredAt = '2026-01-04T12:00:00Z'; costPerCigarAtEvent = '5.990000'; msrpPerCigarAtEvent = '8.00'; notes = 'Mistaken smoke'; createdAt = '2026-01-04T12:00:00Z'; updatedAt = '2026-01-04T12:00:00Z' },
        [ordered]@{ id = 4; eventType = 'REVERSAL'; reversesInventoryEventId = 3; reversedEventType = 'SMOKED'; lotId = 1; purchaseLineId = 1; purchaseId = 1; catalogCigarId = 1; storageLocationId = 1; storageSubLocationId = 1; quantity = 1; eventDate = '2026-01-05'; occurredAt = '2026-01-05T12:00:00Z'; costPerCigarAtEvent = '6.000000'; msrpPerCigarAtEvent = '8.00'; notes = 'Correction'; createdAt = '2026-01-05T12:00:00Z'; updatedAt = '2026-01-05T12:00:00Z' }
    )
    Set-JsonFixture 'smoking-journal-entries' @(
        [ordered]@{ id = 1; inventoryEventId = 2; rating = 8; notes = 'Cedar and cream'; createdAt = '2026-01-03T12:00:00Z'; updatedAt = '2026-01-03T12:00:00Z' },
        [ordered]@{ id = 2; inventoryEventId = 3; rating = 6; notes = 'Reversed history'; createdAt = '2026-01-04T12:00:00Z'; updatedAt = '2026-01-04T12:00:00Z' }
    )
    Set-JsonFixture 'counters' ([ordered]@{
        'catalog-cigars' = 2; vendors = 2; 'storage-locations' = 2; 'storage-sub-locations' = 2
        purchases = 2; 'purchase-lines' = 2; lots = 2; 'lot-location-balances' = 2
        'inventory-events' = 5; 'smoking-journal-entries' = 3
    })

    $hashOutput = @(& $php -r "echo password_hash('csv-export-pass', PASSWORD_DEFAULT);" 2>&1)
    if ($LASTEXITCODE -ne 0) { throw "Could not generate CSV export test password hash. $($hashOutput -join ' ')" }
    Set-JsonFixture 'auth-users' @([ordered]@{
        username = 'csv-export-test'; passwordHash = ($hashOutput -join '').Trim()
        displayName = 'CSV Export Test'; isActive = $true
    })
    Set-Content -LiteralPath (Join-Path $tempData 'audit-log.jsonl') -Value '' -NoNewline -Encoding utf8NoBOM
    Copy-Item -LiteralPath (Join-Path $repoRoot 'data/.htaccess') -Destination $tempData

    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
    $listener.Start()
    $port = ([System.Net.IPEndPoint]$listener.LocalEndpoint).Port
    $listener.Stop()
    $serverOut = Join-Path $tempRoot 'php.out.log'
    $serverError = Join-Path $tempRoot 'php.err.log'
    $serverProcess = Start-Process -FilePath $php -ArgumentList "-d variables_order=EGPCS -S 127.0.0.1:$port -t `"$tempApp`"" -WorkingDirectory $tempApp -WindowStyle Hidden -PassThru -RedirectStandardOutput $serverOut -RedirectStandardError $serverError -Environment @{ HUMIDORHQ_DATA_ROOT = $tempData; HUMIDORHQ_TIMEZONE = 'UTC' }
    Start-Sleep -Milliseconds 700

    $anonymousSession = [Microsoft.PowerShell.Commands.WebRequestSession]::new()
    $anonymous = Invoke-WebRequest "http://127.0.0.1:$port/api/exports/csv" -WebSession $anonymousSession -SkipHttpErrorCheck
    if ($anonymous.StatusCode -ne 401) { throw "Anonymous CSV export returned HTTP $($anonymous.StatusCode), expected 401." }

    $session = [Microsoft.PowerShell.Commands.WebRequestSession]::new()
    $sessionState = Invoke-RestMethod "http://127.0.0.1:$port/api/session" -WebSession $session
    $session.Headers['X-CSRF-Token'] = [string]$sessionState.data.csrfToken
    $login = Invoke-RestMethod "http://127.0.0.1:$port/api/login" -Method Post -ContentType 'application/json' -Body (@{ username = 'csv-export-test'; password = 'csv-export-pass' } | ConvertTo-Json) -WebSession $session
    $session.Headers['X-CSRF-Token'] = [string]$login.data.csrfToken
    $fixtureBefore = Get-DataHashes -Root $tempData

    $zipPath = Join-Path $tempRoot 'data-export.zip'
    $download = Invoke-WebRequest "http://127.0.0.1:$port/api/exports/csv" -WebSession $session -OutFile $zipPath -PassThru
    if ($download.StatusCode -ne 200) { throw "Authenticated CSV export returned HTTP $($download.StatusCode)." }
    if ([string]$download.Headers['Content-Type'] -notmatch 'application/zip') { throw 'CSV export did not return application/zip.' }
    if ([string]$download.Headers['Content-Disposition'] -notmatch 'humidorhq-data-export-\d{8}-\d{6}\.zip') { throw 'CSV export filename was not timestamped as expected.' }
    Assert-HashMapsEqual -Before $fixtureBefore -After (Get-DataHashes -Root $tempData) -Context 'Authenticated CSV export'

    $extractRoot = Join-Path $tempRoot 'extracted'
    Expand-Archive -LiteralPath $zipPath -DestinationPath $extractRoot
    $expectedFiles = @(
        'catalog.csv', 'collection.csv', 'export-summary.csv', 'inventory-activity.csv',
        'purchase-lines.csv', 'purchases.csv', 'removal-history.csv', 'smoking-journal.csv'
    )
    $actualFiles = @(Get-ChildItem -LiteralPath $extractRoot -File | Sort-Object Name | Select-Object -ExpandProperty Name)
    if (($actualFiles -join '|') -ne (($expectedFiles | Sort-Object) -join '|')) {
        throw "CSV export filenames were unexpected: $($actualFiles -join ', ')"
    }
    if ($actualFiles -match 'auth|audit|counter|backup|lock|transaction') { throw 'CSV export included a prohibited filename.' }
    $allText = (Get-ChildItem -LiteralPath $extractRoot -File | ForEach-Object { Get-Content -LiteralPath $_.FullName -Raw }) -join "`n"
    if ($allText -match 'passwordHash|csv-export-pass') { throw 'CSV export exposed authentication data.' }

    $collection = @(Import-Csv -LiteralPath (Join-Path $extractRoot 'collection.csv'))
    $catalog = @(Import-Csv -LiteralPath (Join-Path $extractRoot 'catalog.csv'))
    $purchases = @(Import-Csv -LiteralPath (Join-Path $extractRoot 'purchases.csv'))
    $lines = @(Import-Csv -LiteralPath (Join-Path $extractRoot 'purchase-lines.csv'))
    $journals = @(Import-Csv -LiteralPath (Join-Path $extractRoot 'smoking-journal.csv'))
    $removals = @(Import-Csv -LiteralPath (Join-Path $extractRoot 'removal-history.csv'))
    $activity = @(Import-Csv -LiteralPath (Join-Path $extractRoot 'inventory-activity.csv'))
    $summary = @(Import-Csv -LiteralPath (Join-Path $extractRoot 'export-summary.csv'))

    if ($collection.Count -ne 1 -or $collection[0].'Quantity On Hand' -ne '2' -or $collection[0].Humidor -ne 'Main Humidor' -or $collection[0].Section -ne 'Top Tray' -or $collection[0].'Extended Cost Basis' -ne '12.00') { throw 'Collection CSV did not preserve joined quantities, locations, or authoritative cost.' }
    if ($catalog.Count -ne 1 -or $catalog[0].Manufacturer -ne "'=Formula Cigars" -or $catalog[0].'Average Rating' -ne '8.00' -or $catalog[0].'Rating Count' -ne '1') { throw 'Catalog CSV did not neutralize formulas or exclude reversed ratings.' }
    if ($purchases.Count -ne 1 -or $purchases[0].Vendor -ne 'Vendor One' -or $purchases[0].'Total Paid' -ne '18.00' -or $purchases[0].'Quantity Received' -ne '3') { throw 'Purchases CSV did not retain authoritative totals or receipt quantities.' }
    if ($lines.Count -ne 1 -or $lines[0].'Authoritative Cost Basis' -ne '18.00' -or $lines[0].'Authoritative Cost Per Cigar' -ne '6') { throw 'Purchase Lines CSV did not use the authoritative allocation.' }
    if ($journals.Count -ne 2 -or @($journals | Where-Object Status -eq 'Effective').Count -ne 1 -or @($journals | Where-Object Status -eq 'Reversed').Count -ne 1) { throw 'Smoking Journal CSV did not retain effective and reversed history.' }
    if ($removals.Count -ne 2 -or @($removals | Where-Object Status -eq 'Effective').Count -ne 1 -or @($removals | Where-Object Status -eq 'Reversed').Count -ne 1 -or @($removals | Where-Object 'Cost Per Cigar' -ne '6.000000').Count -ne 0) { throw 'Removal History CSV did not identify reversal status or use authoritative cost.' }
    if ($activity.Count -ne 4 -or @($activity | Where-Object 'Event Type' -eq 'REVERSAL').Count -ne 1) { throw 'Inventory Activity CSV did not include the complete ledger.' }
    if ($summary.Count -ne 7 -or ($summary | Where-Object File -eq 'inventory-activity.csv').'Row Count' -ne '4') { throw 'Export summary CSV did not reconcile file row counts.' }

    Assert-HashMapsEqual -Before $sourceBefore -After (Get-DataHashes -Root (Join-Path $repoRoot 'data')) -Context 'Isolated CSV export test'
    Write-Host 'PASS: authenticated read-only CSV ZIP export, joined context, formula safety, reversal status, secret exclusion, row counts, and runtime hash preservation.'
}
finally {
    if ($null -ne $serverProcess -and -not $serverProcess.HasExited) {
        Stop-Process -Id $serverProcess.Id -Force -ErrorAction SilentlyContinue
        $serverProcess.WaitForExit()
    }
    if (Test-Path -LiteralPath $tempRoot) {
        Remove-Item -LiteralPath $tempRoot -Recurse -Force
    }
}

# Example Usage:
#   pwsh -NoProfile -File .\tests\csv-export.ps1
