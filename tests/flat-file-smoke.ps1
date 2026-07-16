# Filename: flat-file-smoke.ps1
# Revision : 1.7.0
# Description : Verifies the flat-file HumidorHQ shell, app metadata, auth, audit logging, changelog/todo access, connected CRUD endpoints, and PHP JSON sample data.
# Author : Jason Lamb (with help from Codex CLI)
# Created Date : 2026-07-15
# Modified Date : 2026-07-16 07:45 ET
# Changelog :
# 1.7.0 verify hidden utility navigation, purchase status tracking, and humidor sub-locations
# 1.6.6 verify purchase and catalog quantity display helpers
# 1.6.5 verify header technology label and API status pill are removed
# 1.6.4 verify Dashboard Data Health widget is removed and asset cache versions are current
# 1.6.3 verify screenshot-style dashboard shell and asset cache versions
# 1.6.2 verify warm dark visual theme and CSS cache version
# 1.6.1 verify TODO.md menu and API access
# 1.6.0 verify connected PO Lines create lots, balances, and inventory events
# 1.5.3 verify audit date-time is shown in Eastern Time format
# 1.5.2 verify managed records render before add/edit forms
# 1.5.1 verify cache-busted static asset URLs
# 1.5.0 verify authenticated CRUD record endpoints and management UI hooks
# 1.4.1 verify project metadata is wired into the main render path
# 1.4.0 verify metadata headers on tracked non-JSON files
# 1.3.0 verify app metadata revision and Eastern Time modified timestamp
# 1.2.0 verify audit logging, audit/changelog menu links, and audit placeholder
# 1.1.1 verify placeholder text is removed and ignored auth file has a tracked placeholder
# 1.1.0 verify PHP session authentication protects data routes
# 1.0.2 quote PHP document root paths that contain spaces
# 1.0.1 use separate PHP server stdout and stderr logs
# 1.0.0 initial release

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$indexPath = Join-Path $repoRoot 'index.html'
$appJsPath = Join-Path $repoRoot 'public\assets\js\app.js'
$appCssPath = Join-Path $repoRoot 'public\assets\css\app.css'
$apiIndexPath = Join-Path $repoRoot 'api\index.php'
$authPlaceholderPath = Join-Path $repoRoot 'data\auth-users.json.placeholder'
$auditPlaceholderPath = Join-Path $repoRoot 'data\audit-log.jsonl.placeholder'
$authUsersPath = Join-Path $repoRoot 'data\auth-users.json'
$authUsersBackupPath = Join-Path $env:TEMP 'humidorhq-auth-users.backup.json'
$auditLogPath = Join-Path $repoRoot 'data\audit-log.jsonl'
$runtimeCollections = @('vendors', 'catalog-cigars', 'storage-locations', 'purchases', 'purchase-lines', 'storage-sub-locations', 'lots', 'lot-location-balances', 'inventory-events', 'counters')
$runtimeBackups = @{}
foreach ($collection in $runtimeCollections) {
    $runtimePath = Join-Path $repoRoot "data\$collection.json"
    $runtimeBackups[$collection] = [pscustomobject]@{
        Path = $runtimePath
        BackupPath = Join-Path $env:TEMP "humidorhq-$collection.backup.json"
        HadFile = Test-Path -LiteralPath $runtimePath
    }
}
$authUsersHadFile = Test-Path -LiteralPath $authUsersPath

if (-not (Test-Path -LiteralPath $indexPath)) { throw 'index.html is missing.' }

$index = Get-Content -LiteralPath $indexPath -Raw
if ($index -match 'src/main\.tsx|\.tsx|vite|react') { throw 'index.html still references React, TypeScript, or Vite assets.' }
if ($index -match 'PHP / JSON / JavaScript|api-status|status-pill') { throw 'Header should not show technology label or API status pill.' }
if ($index -notmatch 'public/assets/js/app\.js\?v=1\.6\.0') { throw 'index.html does not load cache-busted public/assets/js/app.js.' }
if ($index -notmatch 'public/assets/css/app\.css\?v=1\.5\.5') { throw 'index.html does not load cache-busted public/assets/css/app.css.' }

foreach ($path in @($appJsPath, $appCssPath, $authPlaceholderPath, $auditPlaceholderPath)) {
    if (-not (Test-Path -LiteralPath $path)) { throw "Required flat-file artifact is missing: $path" }
}

$appJs = Get-Content -LiteralPath $appJsPath -Raw
if ($appJs -match 'queued for plain JavaScript conversion') { throw 'Plain JavaScript app still shows queued conversion placeholder text.' }
if ($appJs -notmatch 'project-meta') { throw 'Plain JavaScript app is missing project metadata rendering.' }
if ($appJs -notmatch 'dashboard-shell') { throw 'Plain JavaScript app is missing the screenshot-style dashboard shell.' }
if ($appJs -notmatch 'function render\(\)[\s\S]*renderProjectMeta\(\)') { throw 'Plain JavaScript app render path does not update project metadata.' }
foreach ($crudText in @('Vendors:', 'PurchaseLines:', '/records/', 'apiPut', 'apiDelete', 'renderManagedForm')) {
    if ($appJs -notmatch [regex]::Escape($crudText)) { throw "Plain JavaScript app is missing CRUD UI hook: $crudText" }
}
if ($appJs -notmatch 'function renderManagedPage\(view, pageConfig\) \{\s*renderManagedTable\(view, pageConfig\)\s*renderManagedForm\(view, pageConfig\)') { throw 'Managed pages must render current records before add/edit forms.' }
foreach ($menuText in @('Vendors', 'Purchases', 'Humidors')) {
    if ($appJs -notmatch $menuText) { throw "Plain JavaScript app is missing $menuText menu link." }
}
foreach ($hiddenPage in @('Audit', 'Changelog', 'Todo', 'PurchaseLines')) {
    if ($appJs -notmatch "id: '$hiddenPage',[^`r`n]+hidden: true") { throw "Plain JavaScript app should keep $hiddenPage available but hidden from the menu." }
}
foreach ($quantityHook in @('purchasedQuantityForPurchase', 'purchasedQuantityForCatalog', 'onHandQuantityForCatalog', 'Qty Purchased', 'On Hand')) {
    if ($appJs -notmatch [regex]::Escape($quantityHook)) { throw "Plain JavaScript app is missing quantity display hook: $quantityHook" }
}
foreach ($workflowHook in @('purchaseStatusOptions', 'In Route', 'Partially Received', 'trackingNumber', 'storage-sub-locations', 'humidorSectionCount', 'sectionName')) {
    if ($appJs -notmatch [regex]::Escape($workflowHook)) { throw "Plain JavaScript app is missing workflow hook: $workflowHook" }
}

$appCss = Get-Content -LiteralPath $appCssPath -Raw
if ($appCss -match '`r`n') { throw 'CSS contains literal PowerShell newline escape text.' }

$trackedFiles = & git -C $repoRoot ls-files
$headerFailures = @()
foreach ($trackedFile in $trackedFiles) {
    if ($trackedFile -match '\.json$') {
        continue
    }
    $trackedPath = Join-Path $repoRoot $trackedFile
    if (-not (Test-Path -LiteralPath $trackedPath)) {
        continue
    }
    $head = (Get-Content -LiteralPath $trackedPath -TotalCount 12 -ErrorAction Stop) -join "`n"
    foreach ($field in @('Filename', 'Revision', 'Description', 'Modified Date')) {
        if ($head -notmatch [regex]::Escape($field)) {
            $headerFailures += "$trackedFile missing $field"
        }
    }
}
if ($headerFailures.Count -gt 0) {
    throw "Missing file metadata headers: $($headerFailures -join '; ')"
}

$disallowedTrackedFiles = $trackedFiles | Where-Object {
    $_ -match '\.(ts|tsx)$' -or
    $_ -in @('package.json', 'package-lock.json', 'eslint.config.js', 'vite.config.ts', 'prisma.config.ts', 'tsconfig.json', 'tsconfig.app.json', 'tsconfig.node.json') -or
    $_ -match '^(src|server|prisma)/'
}
if ($disallowedTrackedFiles.Count -gt 0) { throw "Tracked compile/runtime files remain: $($disallowedTrackedFiles -join ', ')" }

$apiIndex = Get-Content -LiteralPath $apiIndexPath -Raw
foreach ($route in @('/sample-data', '/login', '/audit', '/changelog', '/todo', '/app-meta', '/records/', 'purchase-lines', 'storage-sub-locations')) {
    if ($apiIndex -notmatch [regex]::Escape($route)) { throw "PHP API is missing the $route route." }
}

$php = Get-Command php -ErrorAction Stop
$hash = & $php.Source -r "echo password_hash('testpass', PASSWORD_DEFAULT);"
if (-not $hash) { throw 'Could not generate password hash for auth smoke test.' }

if ($authUsersHadFile) { Copy-Item -LiteralPath $authUsersPath -Destination $authUsersBackupPath -Force }
foreach ($backup in $runtimeBackups.Values) {
    if ($backup.HadFile) { Copy-Item -LiteralPath $backup.Path -Destination $backup.BackupPath -Force }
}
if (Test-Path -LiteralPath $auditLogPath) { Remove-Item -LiteralPath $auditLogPath -Force }

@(
    [pscustomobject]@{ username = 'testuser'; passwordHash = $hash; displayName = 'Test User'; isActive = $true }
) | ConvertTo-Json -Depth 4 -AsArray | Set-Content -LiteralPath $authUsersPath -Encoding UTF8

$port = 8765
$serverOutLog = Join-Path $env:TEMP 'humidorhq-flat-file-smoke-php.out.log'
$serverErrLog = Join-Path $env:TEMP 'humidorhq-flat-file-smoke-php.err.log'
$phpArgs = "-S 127.0.0.1:$port -t `"$repoRoot`""
$process = Start-Process -FilePath $php.Source -ArgumentList $phpArgs -WorkingDirectory $repoRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput $serverOutLog -RedirectStandardError $serverErrLog
try {
    Start-Sleep -Milliseconds 700
    $session = New-Object Microsoft.PowerShell.Commands.WebRequestSession

    $health = Invoke-RestMethod "http://127.0.0.1:$port/api/health" -Method Get -WebSession $session
    if ($health.data.status -ne 'ok') { throw 'PHP health endpoint did not return ok.' }

    $meta = Invoke-RestMethod "http://127.0.0.1:$port/api/app-meta" -Method Get -WebSession $session
    if ($meta.data.revision -notmatch '^\d+\.\d+\.\d+$') { throw 'App metadata revision is missing or invalid.' }
    if ($meta.data.modifiedEt -notmatch 'ET$') { throw 'App metadata modified timestamp is not labeled ET.' }

    $anonymousSession = Invoke-RestMethod "http://127.0.0.1:$port/api/session" -Method Get -WebSession $session
    if ($anonymousSession.data.authenticated -ne $false) { throw 'Anonymous session should not be authenticated.' }

    $anonymousSample = Invoke-WebRequest "http://127.0.0.1:$port/api/sample-data" -Method Get -WebSession $session -SkipHttpErrorCheck
    if ($anonymousSample.StatusCode -ne 401) { throw "Sample-data should require authentication. Expected 401, got $($anonymousSample.StatusCode)." }

    $loginBody = @{ username = 'testuser'; password = 'testpass' } | ConvertTo-Json
    $login = Invoke-RestMethod "http://127.0.0.1:$port/api/login" -Method Post -ContentType 'application/json' -Body $loginBody -WebSession $session
    if ($login.data.authenticated -ne $true -or $login.data.user.username -ne 'testuser') { throw 'Login did not return an authenticated test user.' }

    $sample = Invoke-RestMethod "http://127.0.0.1:$port/api/sample-data" -Method Get -WebSession $session
    if ($null -eq $sample.data.collections) { throw 'Sample-data endpoint did not return collection summaries.' }
    foreach ($name in @('catalog-cigars', 'vendors', 'storage-locations', 'storage-sub-locations', 'purchase-lines', 'lots', 'lot-location-balances', 'inventory-events')) {
        if (-not $sample.data.collections.PSObject.Properties.Name.Contains($name)) { throw "Sample-data endpoint is missing $name." }
    }

    $vendorBody = @{ name = 'Smoke Test Vendor'; website = 'https://example.com'; phone = '555-0100'; notes = 'temporary smoke test record' } | ConvertTo-Json
    $createdVendor = Invoke-RestMethod "http://127.0.0.1:$port/api/records/vendors" -Method Post -ContentType 'application/json' -Body $vendorBody -WebSession $session
    if ($createdVendor.data.name -ne 'Smoke Test Vendor' -or (-not $createdVendor.data.id)) { throw 'Vendor create endpoint did not return the created record.' }

    $vendorList = Invoke-RestMethod "http://127.0.0.1:$port/api/records/vendors" -Method Get -WebSession $session
    $listedVendor = $vendorList.data.records | Where-Object { $_.id -eq $createdVendor.data.id } | Select-Object -First 1
    if (-not $listedVendor) { throw 'Vendor list endpoint did not include the created record.' }

    $updatedVendorBody = @{ name = 'Smoke Test Vendor Updated'; website = 'https://example.com'; phone = '555-0101'; notes = 'temporary smoke test record' } | ConvertTo-Json
    $updatedVendor = Invoke-RestMethod "http://127.0.0.1:$port/api/records/vendors/$($createdVendor.data.id)" -Method Put -ContentType 'application/json' -Body $updatedVendorBody -WebSession $session
    if ($updatedVendor.data.name -ne 'Smoke Test Vendor Updated') { throw 'Vendor update endpoint did not return the updated record.' }

    $deletedVendor = Invoke-RestMethod "http://127.0.0.1:$port/api/records/vendors/$($createdVendor.data.id)" -Method Delete -WebSession $session
    if ($deletedVendor.data.id -ne $createdVendor.data.id) { throw 'Vendor delete endpoint did not return the deleted record.' }

    $linkedVendorBody = @{ name = 'Linked Smoke Vendor'; website = 'https://example.com'; phone = '555-0200'; notes = 'temporary linked smoke test record' } | ConvertTo-Json
    $linkedVendor = Invoke-RestMethod "http://127.0.0.1:$port/api/records/vendors" -Method Post -ContentType 'application/json' -Body $linkedVendorBody -WebSession $session

    $catalogBody = @{ manufacturer = 'Smoke'; series = 'Connected'; vitola = 'Robusto'; shape = 'Parejo'; length = '5'; ringGauge = '50'; wrapper = 'Test'; binder = 'Test'; filler = 'Test'; country = 'Test'; strength = 'Medium'; msrp = '9.50'; notes = 'temporary linked smoke test record' } | ConvertTo-Json
    $createdCigar = Invoke-RestMethod "http://127.0.0.1:$port/api/records/catalog-cigars" -Method Post -ContentType 'application/json' -Body $catalogBody -WebSession $session

    $humidorBody = @{ name = 'Linked Smoke Humidor'; type = 'Cabinet'; capacity = '25'; notes = 'temporary linked smoke test record' } | ConvertTo-Json
    $createdHumidor = Invoke-RestMethod "http://127.0.0.1:$port/api/records/storage-locations" -Method Post -ContentType 'application/json' -Body $humidorBody -WebSession $session

    $sectionBody = @{ storageLocationId = "$($createdHumidor.data.id)"; name = 'Drawer 1'; type = 'Drawer'; capacity = '10'; notes = 'temporary linked smoke test section' } | ConvertTo-Json
    $createdSection = Invoke-RestMethod "http://127.0.0.1:$port/api/records/storage-sub-locations" -Method Post -ContentType 'application/json' -Body $sectionBody -WebSession $session
    if ($createdSection.data.name -ne 'Drawer 1' -or $createdSection.data.storageLocationId -ne $createdHumidor.data.id) { throw 'Storage sub-location create endpoint did not return the linked drawer record.' }

    $purchaseBody = @{ vendorId = "$($linkedVendor.data.id)"; purchaseDate = '2026-07-15'; expectedDate = '2026-07-18'; receivedDate = ''; status = 'in-route'; trackingNumber = 'TRACK-1'; invoiceNumber = 'SMOKE-PO-1'; shipping = '0'; exciseTax = '0'; salesTax = '0'; discount = '0'; totalPaid = '50'; notes = 'temporary linked smoke test record' } | ConvertTo-Json
    $createdPurchase = Invoke-RestMethod "http://127.0.0.1:$port/api/records/purchases" -Method Post -ContentType 'application/json' -Body $purchaseBody -WebSession $session
    if ($createdPurchase.data.status -ne 'in-route' -or $createdPurchase.data.expectedDate -ne '2026-07-18' -or $createdPurchase.data.trackingNumber -ne 'TRACK-1') { throw 'Purchase create endpoint did not preserve status, expected date, and tracking number.' }

    $lineBody = @{ purchaseId = "$($createdPurchase.data.id)"; catalogCigarId = "$($createdCigar.data.id)"; storageLocationId = "$($createdHumidor.data.id)"; quantity = '5'; unitCost = '10'; notes = 'temporary linked smoke test record' } | ConvertTo-Json
    $createdLine = Invoke-RestMethod "http://127.0.0.1:$port/api/records/purchase-lines" -Method Post -ContentType 'application/json' -Body $lineBody -WebSession $session
    if ((-not $createdLine.data.id) -or (-not $createdLine.data.createdLotId) -or (-not $createdLine.data.createdInventoryEventId)) { throw 'Purchase line create endpoint did not return linked inventory ids.' }

    $lots = Get-Content -LiteralPath (Join-Path $repoRoot 'data\lots.json') -Raw | ConvertFrom-Json
    $linkedLot = $lots | Where-Object { $_.id -eq $createdLine.data.createdLotId -and $_.purchaseLineId -eq $createdLine.data.id } | Select-Object -First 1
    if (-not $linkedLot -or $linkedLot.currentQuantity -ne 5 -or $linkedLot.catalogCigarId -ne $createdCigar.data.id) { throw 'Purchase line did not create the expected linked lot.' }

    $balances = Get-Content -LiteralPath (Join-Path $repoRoot 'data\lot-location-balances.json') -Raw | ConvertFrom-Json
    $linkedBalance = $balances | Where-Object { $_.lotId -eq $linkedLot.id -and $_.storageLocationId -eq $createdHumidor.data.id } | Select-Object -First 1
    if (-not $linkedBalance -or $linkedBalance.quantity -ne 5) { throw 'Purchase line did not create the expected lot-location balance.' }

    $events = Get-Content -LiteralPath (Join-Path $repoRoot 'data\inventory-events.json') -Raw | ConvertFrom-Json
    $linkedEvent = $events | Where-Object { $_.id -eq $createdLine.data.createdInventoryEventId -and $_.lotId -eq $linkedLot.id -and $_.eventType -eq 'purchase-receipt' } | Select-Object -First 1
    if (-not $linkedEvent -or $linkedEvent.quantity -ne 5) { throw 'Purchase line did not create the expected purchase-receipt inventory event.' }
    $pageAuditBody = @{ page = 'Dashboard'; action = 'view' } | ConvertTo-Json
    $pageAudit = Invoke-RestMethod "http://127.0.0.1:$port/api/audit/page" -Method Post -ContentType 'application/json' -Body $pageAuditBody -WebSession $session
    if ($pageAudit.data.logged -ne $true) { throw 'Page audit endpoint did not confirm logging.' }

    $audit = Invoke-RestMethod "http://127.0.0.1:$port/api/audit" -Method Get -WebSession $session
    if ($audit.data.records.Count -lt 2) { throw 'Audit endpoint did not return expected activity records.' }
    $dashboardRecord = $audit.data.records | Where-Object { $_.user -eq 'testuser' -and $_.page -eq 'Dashboard' -and $_.action -eq 'view' } | Select-Object -First 1
    if (-not $dashboardRecord) { throw 'Audit log is missing the Dashboard page view record.' }
    if ($dashboardRecord.dateTime -notmatch '^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} ET$') { throw "Audit date-time should use Eastern Time display format. Got $($dashboardRecord.dateTime)" }

    $changelog = Invoke-RestMethod "http://127.0.0.1:$port/api/changelog" -Method Get -WebSession $session
    if ($changelog.data.content -notmatch 'Changelog') { throw 'Changelog endpoint did not return CHANGELOG.md content.' }

    $logout = Invoke-RestMethod "http://127.0.0.1:$port/api/logout" -Method Post -WebSession $session
    if ($logout.data.authenticated -ne $false) { throw 'Logout did not clear the authenticated session.' }
} finally {
    if ($process -and -not $process.HasExited) { Stop-Process -Id $process.Id -Force }
    if ($authUsersHadFile) {
        Copy-Item -LiteralPath $authUsersBackupPath -Destination $authUsersPath -Force
        if ([System.IO.File]::Exists($authUsersBackupPath)) { [System.IO.File]::Delete($authUsersBackupPath) }
    } else {
        Remove-Item -LiteralPath $authUsersPath -Force -ErrorAction SilentlyContinue
    }
    foreach ($backup in $runtimeBackups.Values) {
        if ($backup.HadFile) {
            Copy-Item -LiteralPath $backup.BackupPath -Destination $backup.Path -Force
            if ([System.IO.File]::Exists($backup.BackupPath)) { [System.IO.File]::Delete($backup.BackupPath) }
        } else {
            Remove-Item -LiteralPath $backup.Path -Force -ErrorAction SilentlyContinue
        }
    }
    Remove-Item -LiteralPath $auditLogPath -Force -ErrorAction SilentlyContinue
}

Write-Host 'Flat-file smoke test passed.' -ForegroundColor Green

# Example Usage:
#   .\tests\flat-file-smoke.ps1

