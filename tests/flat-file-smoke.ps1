# Filename: flat-file-smoke.ps1
# Revision : 1.12.3
# Description : Verifies the flat-file HumidorHQ shell, app metadata, auth, dashboard and collection hooks, connected CRUD endpoints, purchase builder lifecycle flow, inline collection actions, collection filters, responsive table wrappers, and PHP JSON sample data.
# Author : Jason Lamb (with help from Codex CLI)
# Created Date : 2026-07-15
# Modified Date : 2026-07-17 8:45 AM ET
# Changelog :
# 1.12.3 reuse loaded CSS content for static hook checks
# 1.12.2 verify private utility shortcut is documented as !jnl
# 1.12.1 verify authenticated chrome, private utility gate, raw markdown denial rules, and shortcut buffer reset
# 1.12.0 verify prefixed page keyboard shortcuts
# 1.11.1 verify mobile menu collapses vertically and footer moves below content
# 1.11.0 verify collapsible main menu, /j utility menu, and !jnl shortcut
# 1.10.9 verify Mobile preview defaults to iPhone 16 Pro without full web preset
# 1.10.8 verify visible Mobile preview page, sidebar link, no-wrap currency values, and narrower menu
# 1.10.7 verify Consumption Totals metric font sizing and latest CSS asset
# 1.10.6 verify stacked sidebar modified timestamp and narrower sidebar assets
# 1.10.5 verify Jason utility back links, TODO label, full preview default, and latest asset versions
# 1.10.4 verify hidden Jason utility page links and mobile preview controls
# 1.10.3 skip binary screenshot and image assets during text metadata header validation
# 1.10.2 verify empty humidor section cleanup during deletion
# 1.10.1 verify unfiltered dashboard totals, inline humidor editing, protected deletion, and latest assets
# 1.10.0 verify removal report filters, calculated values, event history, and latest assets
# 1.9.3 verify simplified dashboard and sidebar labels plus latest JS asset version
# 1.9.2 verify paired lifetime cost/MSRP average layout and latest asset versions
# 1.9.1 verify dashboard summary order, lifetime averages, receive defaults, and cigar favicon
# 1.9.0 verify purchases summary, toggled order builder, and expandable purchase records
# 1.8.10 verify dual on-hand and en-route dashboard card plus latest asset versions
# 1.8.9 verify dashboard en-route metric text and latest JS cache version
# 1.8.8 verify purchase records sort and latest JS cache version
# 1.8.7 verify purchase draft state survives add-cigar renders
# 1.8.6 verify purchase builder subtotal reconciliation hooks and stored line purchase prices
# 1.8.5 verify pending-to-received purchase lifecycle plus inline catalog creation hooks
# 1.8.4 verify collection humidor and drawer filters plus catalog inline edit
# 1.8.3 verify dashboard activity relocation and responsive table wrappers
# 1.8.2 verify inline collection actions and current cache-busted asset versions
# 1.8.1 verify partial-lot move workflow and current cache-busted asset versions
# 1.8.0 verify dashboard financial hooks, collection inventory view, inline purchase-line allocation, and winget PHP fallback
# 1.7.3 verify read-only internal collections load for dependent pages
# 1.7.2 verify signed-in controls render in the sidebar footer
# 1.7.1 verify Dashboard public links and hash-based page refresh routing
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
$rootHtaccessPath = Join-Path $repoRoot '.htaccess'
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

function Get-PhpCommand {
    $phpCommand = Get-Command php -ErrorAction SilentlyContinue
    if ($phpCommand) {
        return $phpCommand.Source
    }

    $candidatePaths = @(
        (Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Packages\PHP.PHP.8.5_Microsoft.Winget.Source_8wekyb3d8bbwe\php.exe'),
        (Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Packages\PHP.PHP.8.4_Microsoft.Winget.Source_8wekyb3d8bbwe\php.exe'),
        (Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Packages\PHP.PHP.8.3_Microsoft.Winget.Source_8wekyb3d8bbwe\php.exe'),
        (Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Packages\PHP.PHP.8.2_Microsoft.Winget.Source_8wekyb3d8bbwe\php.exe'),
        'C:\php\php.exe'
    )

    $phpPath = $candidatePaths | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -First 1
    if (-not $phpPath) {
        throw 'php.exe was not found on PATH or in the standard winget install locations.'
    }
    return $phpPath
}

if (-not (Test-Path -LiteralPath $indexPath)) { throw 'index.html is missing.' }

$jasonPagePath = Join-Path $repoRoot 'j\index.php'
if (-not (Test-Path -LiteralPath $jasonPagePath)) { throw 'Hidden Jason utility page is missing at j/index.php.' }
$jasonPage = Get-Content -LiteralPath $jasonPagePath -Raw
foreach ($jasonPageHook in @('current_auth_user', 'Location: ../', '../#Dashboard', '../#Changelog', '../#Audit', '../#Todo', 'TODO', 'Full Web View - 1200 x 800', 'iPhone 16 Pro', 'mobile-preview', 'Apply selected view', 'jason-menu-toggle', 'menu-collapsed', 'humidorhq-jason-menu-collapsed')) {
    if ($jasonPage -notmatch [regex]::Escape($jasonPageHook)) { throw "Hidden Jason utility page is missing hook: $jasonPageHook" }
}
$mobilePagePath = Join-Path $repoRoot 'mobile\index.php'
if (-not (Test-Path -LiteralPath $mobilePagePath)) { throw 'Visible Mobile preview page is missing at mobile/index.php.' }
$mobilePage = Get-Content -LiteralPath $mobilePagePath -Raw
foreach ($mobilePageHook in @('current_auth_user', 'Location: ../', 'Mobile Preview', '../#Dashboard', 'iPhone 16 Pro', 'site-preview', 'Apply selected view')) {
    if ($mobilePage -notmatch [regex]::Escape($mobilePageHook)) { throw "Visible Mobile preview page is missing hook: $mobilePageHook" }
}
foreach ($privateMobileHook in @('../#Changelog', '../#Audit', '../#Todo', 'Jason Tools')) {
    if ($mobilePage -match [regex]::Escape($privateMobileHook)) { throw "Visible Mobile preview page should not expose Jason-only hook: $privateMobileHook" }
}
foreach ($removedMobileHook in @('Full Web View - 1200 x 800', 'data-mode="full"', 'device-frame full-preview')) {
    if ($mobilePage -match [regex]::Escape($removedMobileHook)) { throw "Visible Mobile preview page should not expose removed full-web hook: $removedMobileHook" }
}
if ($mobilePage -notmatch [regex]::Escape('<p class="size-readout" id="size-readout">iPhone 16 Pro - 402 x 874</p>')) { throw 'Visible Mobile preview should default to iPhone 16 Pro readout.' }
$index = Get-Content -LiteralPath $indexPath -Raw
if ($index -match 'src/main\.tsx|\.tsx|vite|react') { throw 'index.html still references React, TypeScript, or Vite assets.' }
if ($index -match 'PHP / JSON / JavaScript|api-status|status-pill') { throw 'Header should not show technology label or API status pill.' }
if ($index -notmatch 'auth-pending' -or $index -notmatch 'sidebar-account' -or $index -notmatch 'sidebar-footer' -or $index -notmatch 'sidebar-toggle') { throw 'Authenticated shell containers are missing from index.html.' }
if ($index -notmatch 'public/assets/js/app\.js\?v=1\.11\.2') { throw 'index.html does not load cache-busted public/assets/js/app.js.' }
if ($index -notmatch 'public/assets/css/app\.css\?v=1\.6\.2') { throw 'index.html does not load cache-busted public/assets/css/app.css.' }
if ($index -notmatch 'public/favicon\.svg\?v=1\.1\.0') { throw 'index.html does not load the cache-busted cigar favicon.' }

foreach ($path in @($appJsPath, $appCssPath, $authPlaceholderPath, $auditPlaceholderPath, $rootHtaccessPath)) {
    if (-not (Test-Path -LiteralPath $path)) { throw "Required flat-file artifact is missing: $path" }
}

$rootHtaccess = Get-Content -LiteralPath $rootHtaccessPath -Raw
foreach ($htaccessHook in @('<FilesMatch "\.(md|markdown)$">', 'Require all denied')) {
    if ($rootHtaccess -notmatch [regex]::Escape($htaccessHook)) { throw "Root .htaccess is missing raw markdown denial hook: $htaccessHook" }
}

$appJs = Get-Content -LiteralPath $appJsPath -Raw
if ($appJs -match 'queued for plain JavaScript conversion') { throw 'Plain JavaScript app still shows queued conversion placeholder text.' }
if ($appJs -notmatch 'project-meta') { throw 'Plain JavaScript app is missing project metadata rendering.' }
if ($appJs -notmatch 'dashboard-shell' -or $appJs -notmatch 'currentCollectionMetrics' -or $appJs -notmatch 'removalMetrics') { throw 'Plain JavaScript app is missing current dashboard financial calculation hooks.' }
if ($appJs -notmatch 'pageFromHash' -or $appJs -notmatch 'hashchange' -or $appJs -notmatch 'navigateToPage') { throw 'Plain JavaScript app is missing hash-based page routing.' }
if ($appJs -notmatch 'renderSidebarAccount' -or $appJs -match 'renderAccountBar\(' -or $appJs -notmatch 'sidebar-logout' -or $appJs -notmatch 'sidebar-mobile-link') { throw 'Signed-in controls and Mobile link must render in the sidebar footer.' }
foreach ($sidebarHook in @('SIDEBAR_COLLAPSED_KEY', 'sidebarCollapsed', 'applySidebarCollapsed', 'installSidebarToggle', 'SHORTCUT_PREFIX', 'PAGE_SHORTCUTS', 'PRIVATE_PAGE_SHORTCUT', "command: '!jnl'", 'installKeyboardShortcuts', 'event.key.length !== 1', 'isAuthenticated()', 'auth-pending', 'is-unauthenticated')) {
    if ($appJs -notmatch [regex]::Escape($sidebarHook)) { throw "Plain JavaScript app is missing sidebar or shortcut hook: $sidebarHook" }
}
foreach ($pageShortcutHook in @("token: 'das', page: 'Dashboard'", "token: 'col', page: 'Collection'", "token: 'cat', page: 'Catalog'", "token: 'ven', page: 'Vendors'", "token: 'pur', page: 'Purchases'", "token: 'hum', page: 'Humidors'", "token: 'rep', page: 'Reports'", "SHORTCUT_PREFIX = '!'")) {
    if ($appJs -notmatch [regex]::Escape($pageShortcutHook)) { throw "Plain JavaScript app is missing page shortcut hook: $pageShortcutHook" }
}
if ($appJs -notmatch 'function renderReportsPage' -or $appJs -notmatch '<h3>Activity</h3>' -or $appJs -notmatch 'Purchase receipts, moves, smoked cigars, gifts, and discard events.') { throw 'Reports page must render the activity history section.' }
if ($appJs -notmatch 'function renderRemovalHistory' -or $appJs -notmatch 'function filteredRemovalEvents' -or $appJs -notmatch 'All Removals' -or $appJs -notmatch 'Quantity Included') { throw 'Reports page is missing the filterable removal history report.' }
if ($appJs -notmatch 'currentCollectionMetrics\(false\)' -or $appJs -notmatch 'Move all.*assigned cigars' -or $appJs -notmatch "inlineEdit: true") { throw 'Dashboard filter isolation or humidor edit/delete protections are missing.' }
$apiIndex = Get-Content -LiteralPath $apiIndexPath -Raw
if ($apiIndex -notmatch 'save_collection\(''storage-sub-locations'', \$sections\)' -or $apiIndex -notmatch 'linkedSectionIds') { throw 'API is missing empty humidor section cleanup.' }
if ($appJs -notmatch 'function renderPurchaseOverview' -or $appJs -notmatch 'En Route Cigars' -or $appJs -notmatch '\+ Add Purchase') { throw 'Purchases page must render its summary and on-demand add-purchase control.' }
if ($appJs -notmatch 'function renderPurchaseRecords' -or $appJs -notmatch 'function renderPurchaseLineDetails' -or $appJs -notmatch 'Edit / Receive') { throw 'Purchase records must expand to show cigars and retain receiving controls.' }
if ($appJs -notmatch "\{ \.\.\.purchase, status: 'received' \}" -or $appJs -notmatch 'Avg Gifted Cost' -or $appJs -notmatch 'Avg Gifted MSRP') { throw 'Receive defaults and lifetime smoked/gifted averages are missing.' }
if ($appJs -notmatch 'lifetime-quantity-card') { throw 'Lifetime metric layout is missing its tall quantity card.' }
if ($index -match 'Flat-file collection manager' -or $appJs -match 'Smoked inventory events' -or $appJs -match 'Gifted inventory events') { throw 'Removed sidebar and consumption helper labels are still present.' }
if ($appJs -notmatch 'function render\(\)[\s\S]*renderProjectMeta\(\)') { throw 'Plain JavaScript app render path does not update project metadata.' }
foreach ($metaHook in @('modifiedParts', 'modifiedDate', 'modifiedTime')) {
    if ($appJs -notmatch [regex]::Escape($metaHook)) { throw "Plain JavaScript app is missing stacked project metadata hook: $metaHook" }
}
$appCss = Get-Content -LiteralPath $appCssPath -Raw
if ($appCss -notmatch 'grid-template-columns: 165px minmax\(0, 1fr\);') { throw 'Sidebar width should be reduced to 165px.' }
foreach ($sidebarCssHook in @('sidebar-toggle', 'app-shell.sidebar-collapsed', 'grid-template-columns: 58px minmax(0, 1fr)', 'grid-template-rows: minmax(0, 1fr) auto', 'order: 2', 'max-height: 42vh')) {
    if ($appCss -notmatch [regex]::Escape($sidebarCssHook)) { throw "CSS is missing collapsible sidebar hook: $sidebarCssHook" }
}
foreach ($consumptionCssHook in @('.lifetime-metric-grid .metric-card strong', 'font-size: 1.12rem', 'white-space: nowrap', '.lifetime-metric-grid .lifetime-quantity-card strong')) {
    if ($appCss -notmatch [regex]::Escape($consumptionCssHook)) { throw "CSS is missing Consumption Totals sizing hook: $consumptionCssHook" }
}
foreach ($hiddenToolHook in @('renderHiddenPageTools', 'Jason Tools', 'href="j/"', "label: 'TODO'", 'pageLabel(state.activePage)')) {
    if ($appJs -notmatch [regex]::Escape($hiddenToolHook)) { throw "Plain JavaScript app is missing hidden utility hook: $hiddenToolHook" }
}
foreach ($crudText in @('Vendors:', '/records/', 'apiPut', 'apiDelete', 'renderManagedForm', 'renderPurchaseLinesPanel', 'renderHumidorSectionsPanel')) {
    if ($appJs -notmatch [regex]::Escape($crudText)) { throw "Plain JavaScript app is missing CRUD UI hook: $crudText" }
}
foreach ($menuText in @('Vendors', 'Purchases', 'Humidors')) {
    if ($appJs -notmatch $menuText) { throw "Plain JavaScript app is missing $menuText menu link." }
}
foreach ($hiddenPage in @('Audit', 'Changelog', 'Todo', 'PurchaseLines')) {
    if ($appJs -notmatch "id: '$hiddenPage',[^`r`n]+hidden: true") { throw "Plain JavaScript app should keep $hiddenPage available but hidden from the menu." }
}
foreach ($quantityHook in @('purchasedQuantityForPurchase', 'purchasedQuantityForCatalog', 'onHandQuantityForCatalog', 'Qty Purchased', 'On Hand')) {
    if ($appJs -notmatch [regex]::Escape($quantityHook)) { throw "Plain JavaScript app is missing quantity display hook: $quantityHook" }
}
foreach ($workflowHook in @('purchaseStatusOptions', 'pending', 'received', 'purchaseDraftLines', 'subtotal', 'showPurchaseCatalogCreate', 'purchasePrice', 'msrpPerCigar', 'storageSubLocationId', 'trueCostPerCigar', 'currentSavings', 'collectionSort', 'collectionSectionFilterId', 'inline-move-form', 'table-scroll', '/inventory/move', '/inventory/remove', 'inlineEdit: true')) {
    if ($appJs -notmatch [regex]::Escape($workflowHook)) { throw "Plain JavaScript app is missing workflow hook: $workflowHook" }
}

if ($appCss -match 'display: contents') { throw 'CSS should not use display: contents on landmark/sidebar layout containers.' }
foreach ($cssAuthHook in @('body.auth-pending .sidebar', 'grid-template-rows: minmax(0, 1fr) auto', 'grid-row: 2', 'order: 2')) {
    if ($appCss -notmatch [regex]::Escape($cssAuthHook)) { throw "CSS is missing authenticated layout hook: $cssAuthHook" }
}

if ($appCss -match '`r`n') { throw 'CSS contains literal PowerShell newline escape text.' }

$trackedFiles = & git -C $repoRoot ls-files
$headerFailures = @()
foreach ($trackedFile in $trackedFiles) {
    if ($trackedFile -match '\.(json|png|jpg|jpeg|gif|webp|bmp|ico)$') {
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
foreach ($route in @('/sample-data', '/login', '/audit', '/changelog', '/todo', '/app-meta', '/records/', '/inventory/move', 'purchase-lines', 'storage-sub-locations')) {
    if ($apiIndex -notmatch [regex]::Escape($route)) { throw "PHP API is missing the $route route." }
}

$php = Get-PhpCommand
$hash = & $php -r "echo password_hash('testpass', PASSWORD_DEFAULT);"
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
$process = Start-Process -FilePath $php -ArgumentList $phpArgs -WorkingDirectory $repoRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput $serverOutLog -RedirectStandardError $serverErrLog
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
    foreach ($protectedPage in @('/j/', '/mobile/')) {
        $anonymousPage = Invoke-WebRequest "http://127.0.0.1:$port$protectedPage" -Method Get -WebSession $session
        if ($anonymousPage.Content -notmatch 'Sign In' -or $anonymousPage.Content -match 'Mobile Preview|Jason Tools') { throw "Anonymous $protectedPage page should land on sign-in only." }
    }

    $loginBody = @{ username = 'testuser'; password = 'testpass' } | ConvertTo-Json
    $login = Invoke-RestMethod "http://127.0.0.1:$port/api/login" -Method Post -ContentType 'application/json' -Body $loginBody -WebSession $session
    if ($login.data.authenticated -ne $true -or $login.data.user.username -ne 'testuser') { throw 'Login did not return an authenticated test user.' }

    $sample = Invoke-RestMethod "http://127.0.0.1:$port/api/sample-data" -Method Get -WebSession $session
    if ($null -eq $sample.data.collections) { throw 'Sample-data endpoint did not return collection summaries.' }
    foreach ($name in @('catalog-cigars', 'vendors', 'storage-locations', 'storage-sub-locations', 'purchase-lines', 'lots', 'lot-location-balances', 'inventory-events')) {
        if (-not $sample.data.collections.PSObject.Properties.Name.Contains($name)) { throw "Sample-data endpoint is missing $name." }
    }

    foreach ($readOnlyCollection in @('lots', 'lot-location-balances', 'inventory-events')) {
        $readOnlyList = Invoke-RestMethod "http://127.0.0.1:$port/api/records/$readOnlyCollection" -Method Get -WebSession $session
        if ($null -eq $readOnlyList.data.records) { throw "Read-only collection endpoint did not return records for $readOnlyCollection." }
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

    $emptyHumidorBody = @{ name = 'Empty Smoke Humidor'; type = 'Cabinet'; capacity = '10'; notes = 'temporary empty humidor' } | ConvertTo-Json
    $emptyHumidor = Invoke-RestMethod "http://127.0.0.1:$port/api/records/storage-locations" -Method Post -ContentType 'application/json' -Body $emptyHumidorBody -WebSession $session
    $emptySectionBody = @{ storageLocationId = "$($emptyHumidor.data.id)"; name = 'Empty Drawer'; type = 'Drawer'; capacity = '10'; notes = 'temporary empty section' } | ConvertTo-Json
    $emptySection = Invoke-RestMethod "http://127.0.0.1:$port/api/records/storage-sub-locations" -Method Post -ContentType 'application/json' -Body $emptySectionBody -WebSession $session
    $deletedEmptyHumidor = Invoke-RestMethod "http://127.0.0.1:$port/api/records/storage-locations/$($emptyHumidor.data.id)" -Method Delete -WebSession $session
    if ($deletedEmptyHumidor.data.id -ne $emptyHumidor.data.id) { throw 'Empty humidor delete endpoint did not return the deleted record.' }
    $sectionListAfterDelete = Invoke-RestMethod "http://127.0.0.1:$port/api/records/storage-sub-locations" -Method Get -WebSession $session
    if ($sectionListAfterDelete.data.records | Where-Object { $_.id -eq $emptySection.data.id }) { throw 'Deleting an empty humidor did not remove its empty section.' }

    $humidorBody = @{ name = 'Linked Smoke Humidor'; type = 'Cabinet'; capacity = '25'; notes = 'temporary linked smoke test record' } | ConvertTo-Json
    $createdHumidor = Invoke-RestMethod "http://127.0.0.1:$port/api/records/storage-locations" -Method Post -ContentType 'application/json' -Body $humidorBody -WebSession $session

    $sectionBody = @{ storageLocationId = "$($createdHumidor.data.id)"; name = 'Drawer 1'; type = 'Drawer'; capacity = '10'; notes = 'temporary linked smoke test section' } | ConvertTo-Json
    $createdSection = Invoke-RestMethod "http://127.0.0.1:$port/api/records/storage-sub-locations" -Method Post -ContentType 'application/json' -Body $sectionBody -WebSession $session
    if ($createdSection.data.name -ne 'Drawer 1' -or [string]$createdSection.data.storageLocationId -ne [string]$createdHumidor.data.id) { throw 'Storage sub-location create endpoint did not return the linked drawer record.' }

    $purchaseBody = @{ vendorId = "$($linkedVendor.data.id)"; purchaseDate = '2026-07-15'; subtotal = '50'; receivedDate = ''; status = 'pending'; invoiceNumber = 'SMOKE-PO-1'; shipping = '0'; exciseTax = '0'; salesTax = '0'; discount = '0'; totalPaid = '50'; notes = '' } | ConvertTo-Json
    $createdPurchase = Invoke-RestMethod "http://127.0.0.1:$port/api/records/purchases" -Method Post -ContentType 'application/json' -Body $purchaseBody -WebSession $session
    if ($createdPurchase.data.status -ne 'pending' -or $createdPurchase.data.subtotal -ne 50 -or $createdPurchase.data.invoiceNumber -ne 'SMOKE-PO-1') { throw 'Purchase create endpoint did not preserve status, subtotal, and invoice number.' }

    $lineBody = @{ purchaseId = "$($createdPurchase.data.id)"; catalogCigarId = "$($createdCigar.data.id)"; quantity = '5'; purchasePrice = '50'; unitCost = '10'; msrpPerCigar = '9.50'; notes = 'temporary linked smoke test record' } | ConvertTo-Json
    $createdLine = Invoke-RestMethod "http://127.0.0.1:$port/api/records/purchase-lines" -Method Post -ContentType 'application/json' -Body $lineBody -WebSession $session
    if ((-not $createdLine.data.id) -or $createdLine.data.createdLotId -or $createdLine.data.createdInventoryEventId) { throw 'Pending purchase lines should not create receipt inventory ids before the order is received.' }
    if ($createdLine.data.trueCostPerCigar -ne 10 -or $createdLine.data.allocatedShipping -ne 0 -or $createdLine.data.msrpPerCigarResolved -ne 9.5) { throw 'Purchase line create endpoint did not return allocated financial fields.' }

    $lots = Get-Content -LiteralPath (Join-Path $repoRoot 'data\lots.json') -Raw | ConvertFrom-Json
    $pendingLot = $lots | Where-Object { $_.purchaseLineId -eq $createdLine.data.id } | Select-Object -First 1
    if ($pendingLot) { throw 'Pending purchase lines should not create lots before receipt and location assignment.' }

    $balances = Get-Content -LiteralPath (Join-Path $repoRoot 'data\lot-location-balances.json') -Raw | ConvertFrom-Json
    $pendingBalance = $balances | Where-Object { $_.purchaseLineId -eq $createdLine.data.id } | Select-Object -First 1
    if ($pendingBalance) { throw 'Pending purchase lines should not create location balances before receipt and location assignment.' }

    $events = Get-Content -LiteralPath (Join-Path $repoRoot 'data\inventory-events.json') -Raw | ConvertFrom-Json
    $pendingEvent = $events | Where-Object { $_.purchaseLineId -eq $createdLine.data.id -and $_.eventType -eq 'purchase-receipt' } | Select-Object -First 1
    if ($pendingEvent) { throw 'Pending purchase lines should not create receipt events before receipt and location assignment.' }

    $receivedPurchaseBody = @{ vendorId = "$($linkedVendor.data.id)"; purchaseDate = '2026-07-15'; subtotal = '50'; receivedDate = '2026-07-16'; status = 'received'; invoiceNumber = 'SMOKE-PO-1'; shipping = '0'; exciseTax = '0'; salesTax = '0'; discount = '0'; totalPaid = '50'; notes = '' } | ConvertTo-Json
    $receivedPurchase = Invoke-RestMethod "http://127.0.0.1:$port/api/records/purchases/$($createdPurchase.data.id)" -Method Put -ContentType 'application/json' -Body $receivedPurchaseBody -WebSession $session
    if ($receivedPurchase.data.status -ne 'received' -or $receivedPurchase.data.receivedDate -ne '2026-07-16') { throw 'Purchase update endpoint did not mark the order received.' }

    $assignLineBody = @{ purchaseId = "$($createdPurchase.data.id)"; catalogCigarId = "$($createdCigar.data.id)"; storageLocationId = "$($createdHumidor.data.id)"; storageSubLocationId = "$($createdSection.data.id)"; quantity = '5'; purchasePrice = '50'; unitCost = '10'; msrpPerCigar = '9.50'; notes = 'temporary linked smoke test record' } | ConvertTo-Json
    $assignedLine = Invoke-RestMethod "http://127.0.0.1:$port/api/records/purchase-lines/$($createdLine.data.id)" -Method Put -ContentType 'application/json' -Body $assignLineBody -WebSession $session

    $lots = Get-Content -LiteralPath (Join-Path $repoRoot 'data\lots.json') -Raw | ConvertFrom-Json
    $linkedLot = $lots | Where-Object { $_.purchaseLineId -eq $createdLine.data.id } | Select-Object -First 1
    if (-not $linkedLot -or $linkedLot.currentQuantity -ne 5 -or $linkedLot.catalogCigarId -ne $createdCigar.data.id -or $linkedLot.costPerCigarSnapshot -ne 10 -or $linkedLot.msrpPerCigarSnapshot -ne 9.5) { throw 'Received purchase line did not create the expected linked lot.' }

    $balances = Get-Content -LiteralPath (Join-Path $repoRoot 'data\lot-location-balances.json') -Raw | ConvertFrom-Json
    $linkedBalance = $balances | Where-Object { $_.lotId -eq $linkedLot.id -and $_.storageLocationId -eq $createdHumidor.data.id } | Select-Object -First 1
    if (-not $linkedBalance -or $linkedBalance.quantity -ne 5 -or $linkedBalance.storageSubLocationId -ne $createdSection.data.id) { throw 'Received purchase line did not create the expected lot-location balance.' }

    $events = Get-Content -LiteralPath (Join-Path $repoRoot 'data\inventory-events.json') -Raw | ConvertFrom-Json
    $linkedEvent = $events | Where-Object { $_.purchaseLineId -eq $createdLine.data.id -and $_.lotId -eq $linkedLot.id -and $_.eventType -eq 'purchase-receipt' } | Select-Object -First 1
    if (-not $linkedEvent -or $linkedEvent.quantity -ne 5 -or $linkedEvent.storageSubLocationId -ne $createdSection.data.id -or $linkedEvent.costPerCigarAtEvent -ne 10 -or $linkedEvent.msrpPerCigarAtEvent -ne 9.5) { throw 'Received purchase line did not create the expected purchase-receipt inventory event.' }

    $moveBody = @{ sourceBalanceId = "$($linkedBalance.id)"; quantity = '2'; toStorageLocationId = "$($createdHumidor.data.id)"; toStorageSubLocationId = ''; notes = 'temporary smoke move' } | ConvertTo-Json
    $moveResult = Invoke-RestMethod "http://127.0.0.1:$port/api/inventory/move" -Method Post -ContentType 'application/json' -Body $moveBody -WebSession $session
    if ($moveResult.data.quantityMoved -ne 2 -or $moveResult.data.lotId -ne $linkedLot.id) { throw 'Inventory move endpoint did not return the moved lot and quantity.' }

    $balancesAfterMove = Get-Content -LiteralPath (Join-Path $repoRoot 'data\lot-location-balances.json') -Raw | ConvertFrom-Json
    $movedSource = $balancesAfterMove | Where-Object { $_.id -eq $linkedBalance.id } | Select-Object -First 1
    $movedDestination = $balancesAfterMove | Where-Object { $_.lotId -eq $linkedLot.id -and $_.storageLocationId -eq $createdHumidor.data.id -and ($_.storageSubLocationId -eq $null -or $_.storageSubLocationId -eq '') -and $_.id -ne $linkedBalance.id } | Select-Object -First 1
    if (-not $movedSource -or $movedSource.quantity -ne 3) { throw 'Inventory move did not reduce the source balance correctly.' }
    if (-not $movedDestination -or $movedDestination.quantity -ne 2) { throw 'Inventory move did not create the destination balance correctly.' }

    $eventsAfterMove = Get-Content -LiteralPath (Join-Path $repoRoot 'data\inventory-events.json') -Raw | ConvertFrom-Json
    $moveEvent = $eventsAfterMove | Where-Object { $_.eventType -eq 'move' -and $_.lotId -eq $linkedLot.id -and $_.quantity -eq 2 } | Select-Object -First 1
    if (-not $moveEvent -or $moveEvent.costPerCigarAtEvent -ne 10 -or $moveEvent.msrpPerCigarAtEvent -ne 9.5) { throw 'Inventory move did not preserve the lot cost and MSRP on the move event.' }
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

