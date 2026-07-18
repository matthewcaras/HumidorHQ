# Filename: flat-file-smoke.ps1
# Revision : 1.15.0
# Description : Verifies HumidorHQ behavior against tracked seed data copied into an isolated external runtime root.
# Author : Jason Lamb (with help from Codex CLI)
# Created Date : 2026-07-15
# Modified Date : 2026-07-18 1:15 AM ET
# Changelog :
# 1.15.0 verify transactional idempotent partial receiving, status derivation, split placement, and over-receipt guards
# 1.14.0 verify local/validated dates, authoritative/unknown money, deterministic allocation, and Lot cache reconciliation
# 1.13.0 verify CSRF session tokens and authenticated mutation compatibility
# 1.12.0 use tracked seed data and verify external runtime-root startup enforcement
# 1.11.1 verify received-purchase line creation, reassignment, incomplete-line, and rejection hash guards
# 1.11.0 isolate all runtime data and verify Stage 0 move, immutability, deletion, journal, and integrity protections
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
$repositoryDataRoot = [System.IO.Path]::GetFullPath((Join-Path $repoRoot 'data'))
$seedDataRoot = [System.IO.Path]::GetFullPath((Join-Path $repoRoot 'seed-data'))
$testRoot = Join-Path ([System.IO.Path]::GetTempPath()) ('humidorhq-flat-file-smoke-' + [guid]::NewGuid().ToString('N'))
$testDataRoot = Join-Path $testRoot 'data'
$testRootFull = [System.IO.Path]::GetFullPath($testRoot)
$systemTempFull = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
if (-not $testRootFull.StartsWith($systemTempFull, [System.StringComparison]::OrdinalIgnoreCase) -or $testRootFull -eq $systemTempFull) {
    throw 'Smoke test temporary root did not resolve safely beneath the system temporary directory.'
}
[System.IO.Directory]::CreateDirectory($testDataRoot) | Out-Null

function Get-RepositoryDataHashes {
    $result = @{}
    Get-ChildItem -LiteralPath $repositoryDataRoot -File | Where-Object { $_.Extension -in @('.json', '.jsonl') } | ForEach-Object {
        $result[$_.Name] = (Get-FileHash -Algorithm SHA256 -LiteralPath $_.FullName).Hash
    }
    return $result
}

function Assert-RepositoryDataHashes {
    param([hashtable]$Expected)
    $actual = Get-RepositoryDataHashes
    if ($actual.Count -ne $Expected.Count) { throw 'Repository runtime data file set changed during the isolated smoke test.' }
    foreach ($name in $Expected.Keys) {
        if (-not $actual.ContainsKey($name) -or $actual[$name] -ne $Expected[$name]) {
            throw "Repository runtime data changed during the isolated smoke test: $name"
        }
    }
}

$sourceDataHashes = Get-RepositoryDataHashes
Get-ChildItem -LiteralPath $seedDataRoot -Filter '*.json' -File | ForEach-Object {
    Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $testDataRoot $_.Name)
}

$indexPath = Join-Path $repoRoot 'index.html'
$appJsPath = Join-Path $repoRoot 'public\assets\js\app.js'
$appCssPath = Join-Path $repoRoot 'public\assets\css\app.css'
$apiIndexPath = Join-Path $repoRoot 'api\index.php'
$bootstrapPath = Join-Path $repoRoot 'api\bootstrap.php'
$authPlaceholderPath = Join-Path $repoRoot 'data\auth-users.json.placeholder'
$auditPlaceholderPath = Join-Path $repoRoot 'data\audit-log.jsonl.placeholder'
$authUsersPath = Join-Path $testDataRoot 'auth-users.json'
$auditLogPath = Join-Path $testDataRoot 'audit-log.jsonl'

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

function Invoke-ExpectedApiError {
    param(
        [string]$Uri,
        [string]$Method,
        [Microsoft.PowerShell.Commands.WebRequestSession]$Session,
        [object]$Body,
        [int]$StatusCode,
        [string]$ErrorCode
    )
    $parameters = @{
        Uri = $Uri
        Method = $Method
        WebSession = $Session
        SkipHttpErrorCheck = $true
    }
    if ($null -ne $Body) {
        $parameters.ContentType = 'application/json'
        $parameters.Body = ($Body | ConvertTo-Json -Depth 8)
    }
    $response = Invoke-WebRequest @parameters
    if ($response.StatusCode -ne $StatusCode) {
        throw "Expected HTTP $StatusCode from $Method $Uri, got $($response.StatusCode)."
    }
    $payload = $response.Content | ConvertFrom-Json
    if ($payload.error.code -ne $ErrorCode) {
        throw "Expected error code $ErrorCode from $Method $Uri, got $($payload.error.code)."
    }
    return $payload
}

function Get-TestDataHashSnapshot {
    param([string]$DataRoot)
    $snapshot = @{}
    foreach ($name in @('purchases.json', 'purchase-lines.json', 'counters.json', 'lots.json', 'lot-location-balances.json', 'inventory-events.json', 'audit-log.jsonl')) {
        $path = Join-Path $DataRoot $name
        $snapshot[$name] = if (Test-Path -LiteralPath $path -PathType Leaf) {
            (Get-FileHash -Algorithm SHA256 -LiteralPath $path).Hash
        } else {
            $null
        }
    }
    return $snapshot
}

function Assert-TestDataHashSnapshot {
    param(
        [string]$DataRoot,
        [hashtable]$Expected,
        [string]$Context
    )
    $actual = Get-TestDataHashSnapshot -DataRoot $DataRoot
    foreach ($name in $Expected.Keys) {
        if ($actual[$name] -ne $Expected[$name]) {
            throw "$Context changed protected test data: $name"
        }
    }
}

if (-not (Test-Path -LiteralPath $indexPath)) { throw 'index.html is missing.' }

$jasonPagePath = Join-Path $repoRoot 'j\index.html'
if (-not (Test-Path -LiteralPath $jasonPagePath)) { throw 'Hidden Jason utility page is missing at j/index.html.' }
$jasonPage = Get-Content -LiteralPath $jasonPagePath -Raw
foreach ($jasonPageHook in @('../#Dashboard', '../#Changelog', '../#Audit', '../#Todo', 'TODO', 'Full Web View - 1200 x 800', 'iPhone 16 Pro', 'mobile-preview', 'Apply selected view')) {
    if ($jasonPage -notmatch [regex]::Escape($jasonPageHook)) { throw "Hidden Jason utility page is missing hook: $jasonPageHook" }
}
$mobilePagePath = Join-Path $repoRoot 'mobile\index.html'
if (-not (Test-Path -LiteralPath $mobilePagePath)) { throw 'Visible Mobile preview page is missing at mobile/index.html.' }
$mobilePage = Get-Content -LiteralPath $mobilePagePath -Raw
foreach ($mobilePageHook in @('Mobile Preview', '../#Dashboard', 'iPhone 16 Pro', 'site-preview', 'Apply selected view')) {
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
if ($index -notmatch 'sidebar-account' -or $index -notmatch 'sidebar-footer') { throw 'Sidebar account/footer containers are missing from index.html.' }
if ($index -notmatch 'public/assets/js/app\.js\?v=1\.10\.0') { throw 'index.html does not load cache-busted public/assets/js/app.js.' }
if ($index -notmatch 'public/assets/css/app\.css\?v=1\.9\.5') { throw 'index.html does not load cache-busted public/assets/css/app.css.' }
if ($index -notmatch 'public/favicon\.svg\?v=1\.1\.0') { throw 'index.html does not load the cache-busted cigar favicon.' }

foreach ($path in @($appJsPath, $appCssPath, $authPlaceholderPath, $auditPlaceholderPath)) {
    if (-not (Test-Path -LiteralPath $path)) { throw "Required flat-file artifact is missing: $path" }
}

$appJs = Get-Content -LiteralPath $appJsPath -Raw
if ($appJs -match 'queued for plain JavaScript conversion') { throw 'Plain JavaScript app still shows queued conversion placeholder text.' }
if ($appJs -notmatch 'project-meta') { throw 'Plain JavaScript app is missing project metadata rendering.' }
if ($appJs -notmatch 'dashboard-shell' -or $appJs -notmatch 'currentCollectionMetrics' -or $appJs -notmatch 'removalMetrics') { throw 'Plain JavaScript app is missing current dashboard financial calculation hooks.' }
if ($appJs -notmatch 'pageFromHash' -or $appJs -notmatch 'hashchange' -or $appJs -notmatch 'navigateToPage') { throw 'Plain JavaScript app is missing hash-based page routing.' }
if ($appJs -notmatch 'renderSidebarAccount' -or $appJs -match 'renderAccountBar\(' -or $appJs -notmatch 'sidebar-logout' -or $appJs -notmatch 'sidebar-mobile-link') { throw 'Signed-in controls and Mobile link must render in the sidebar footer.' }
if ($appJs -notmatch 'function renderReportsPage' -or $appJs -notmatch '<h3>Activity</h3>' -or $appJs -notmatch 'Purchase receipts, moves, smoked cigars, gifts, and discard events.') { throw 'Reports page must render the activity history section.' }
if ($appJs -notmatch 'function renderRemovalHistory' -or $appJs -notmatch 'function filteredRemovalEvents' -or $appJs -notmatch 'All Removals' -or $appJs -notmatch 'Quantity Included') { throw 'Reports page is missing the filterable removal history report.' }
if ($appJs -notmatch 'currentCollectionMetrics\(false\)' -or $appJs -notmatch 'Move all.*assigned cigars' -or $appJs -notmatch "inlineEdit: true") { throw 'Dashboard filter isolation or humidor edit/delete protections are missing.' }
$apiIndex = Get-Content -LiteralPath $apiIndexPath -Raw
if ($apiIndex -notmatch 'RECEIVED_INVENTORY_IMMUTABLE' -or $apiIndex -notmatch 'RECORD_REFERENCED') { throw 'API is missing Stage 0 immutability or referential guards.' }
$bootstrapSource = Get-Content -LiteralPath $bootstrapPath -Raw
foreach ($startupGuard in @('DATA_ROOT_NOT_CONFIGURED', 'DATA_ROOT_MISSING', 'DATA_ROOT_INSIDE_APP', 'DATA_ROOT_NOT_WRITABLE', 'DATA_FILE_MISSING', 'DATA_FILE_NOT_WRITABLE', 'DATA_FILE_INVALID_JSON')) {
    if ($bootstrapSource -notmatch [regex]::Escape($startupGuard)) { throw "Bootstrap is missing runtime startup guard: $startupGuard" }
}
if ($appJs -notmatch 'function renderPurchaseOverview' -or $appJs -notmatch 'En Route Cigars' -or $appJs -notmatch '\+ Add Purchase') { throw 'Purchases page must render its summary and on-demand add-purchase control.' }
if ($appJs -match "return '2026-07-16'" -or $appJs -match 'toISOString\(\)\.slice\(0, 10\)' -or $appJs -notmatch 'today\.getFullYear\(\)') { throw 'Date defaults must use the current local calendar date.' }
foreach ($moneyCompletenessHook in @('function hasKnownMoney', 'function sumMoneyValues', "return 'Unknown'", 'knownCostQuantity', 'costComplete')) {
    if ($appJs -notmatch [regex]::Escape($moneyCompletenessHook)) { throw "Unknown-money handling is missing hook: $moneyCompletenessHook" }
}
if ($appJs -notmatch 'function renderPurchaseRecords' -or $appJs -notmatch 'function renderPurchaseLineDetails' -or $appJs -notmatch 'Receive and Store Cigars') { throw 'Purchase records must expand to show cigars and retain receiving controls.' }
if ($appJs -notmatch 'receiptKeyForPurchaseLine' -or $appJs -notmatch '/receive`' -or $appJs -notmatch 'Avg Gifted Cost' -or $appJs -notmatch 'Avg Gifted MSRP') { throw 'Idempotent receipt controls or lifetime smoked/gifted averages are missing.' }
if ($appJs -notmatch 'lifetime-quantity-card') { throw 'Lifetime metric layout is missing its tall quantity card.' }
if ($index -match 'Flat-file collection manager' -or $appJs -match 'Smoked inventory events' -or $appJs -match 'Gifted inventory events') { throw 'Removed sidebar and consumption helper labels are still present.' }
if ($appJs -notmatch 'function render\(\)[\s\S]*renderProjectMeta\(\)') { throw 'Plain JavaScript app render path does not update project metadata.' }
foreach ($metaHook in @('modifiedParts', 'modifiedDate', 'modifiedTime')) {
    if ($appJs -notmatch [regex]::Escape($metaHook)) { throw "Plain JavaScript app is missing stacked project metadata hook: $metaHook" }
}
if ((Get-Content -LiteralPath $appCssPath -Raw) -notmatch 'grid-template-columns: 165px minmax\(0, 1fr\);') { throw 'Sidebar width should be reduced to 165px.' }
foreach ($consumptionCssHook in @('.lifetime-metric-grid .metric-card strong', 'font-size: 1.12rem', 'white-space: nowrap', '.lifetime-metric-grid .lifetime-quantity-card strong')) {
    if ((Get-Content -LiteralPath $appCssPath -Raw) -notmatch [regex]::Escape($consumptionCssHook)) { throw "CSS is missing Consumption Totals sizing hook: $consumptionCssHook" }
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

$appCss = Get-Content -LiteralPath $appCssPath -Raw
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
foreach ($route in @('/sample-data', '/login', '/audit', '/changelog', '/todo', '/app-meta', '/records/', '/inventory/move', '/purchase-lines/', '/receive', 'storage-sub-locations')) {
    if ($apiIndex -notmatch [regex]::Escape($route)) { throw "PHP API is missing the $route route." }
}

$php = Get-PhpCommand
$bootstrapRequirePath = $bootstrapPath.Replace('\\', '/').Replace("'", "\\'")
$startupDataRoot = $env:HUMIDORHQ_DATA_ROOT
try {
    Remove-Item Env:HUMIDORHQ_DATA_ROOT -ErrorAction SilentlyContinue
    $missingRootOutput = (& $php -r "require '$bootstrapRequirePath';" 2>&1) -join "`n"
    if ($LASTEXITCODE -eq 0 -or $missingRootOutput -notmatch 'DATA_ROOT_NOT_CONFIGURED') {
        throw 'Bootstrap did not reject a missing HUMIDORHQ_DATA_ROOT.'
    }
    $env:HUMIDORHQ_DATA_ROOT = $repositoryDataRoot
    $insideRootOutput = (& $php -r "require '$bootstrapRequirePath';" 2>&1) -join "`n"
    if ($LASTEXITCODE -eq 0 -or $insideRootOutput -notmatch 'DATA_ROOT_INSIDE_APP') {
        throw 'Bootstrap did not reject runtime data inside the repository.'
    }
} finally {
    $env:HUMIDORHQ_DATA_ROOT = $startupDataRoot
}
$hash = & $php -r "echo password_hash('testpass', PASSWORD_DEFAULT);"
if (-not $hash) { throw 'Could not generate password hash for auth smoke test.' }

@(
    [pscustomobject]@{ username = 'testuser'; passwordHash = $hash; displayName = 'Test User'; isActive = $true }
) | ConvertTo-Json -Depth 4 -AsArray | Set-Content -LiteralPath $authUsersPath -Encoding UTF8

$port = 8765
$serverOutLog = Join-Path $testRoot 'php.out.log'
$serverErrLog = Join-Path $testRoot 'php.err.log'
$phpArgs = "-S 127.0.0.1:$port -t `"$repoRoot`""
$previousDataRoot = $env:HUMIDORHQ_DATA_ROOT
$env:HUMIDORHQ_DATA_ROOT = $testDataRoot
$process = Start-Process -FilePath $php -ArgumentList $phpArgs -WorkingDirectory $repoRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput $serverOutLog -RedirectStandardError $serverErrLog
$env:HUMIDORHQ_DATA_ROOT = $previousDataRoot
$testFailure = $null
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

    if (-not $anonymousSession.data.csrfToken) { throw 'Anonymous session did not return a CSRF token.' }
    $session.Headers['X-CSRF-Token'] = [string]$anonymousSession.data.csrfToken
    $loginBody = @{ username = 'testuser'; password = 'testpass' } | ConvertTo-Json
    $login = Invoke-RestMethod "http://127.0.0.1:$port/api/login" -Method Post -ContentType 'application/json' -Body $loginBody -WebSession $session
    if ($login.data.authenticated -ne $true -or $login.data.user.username -ne 'testuser') { throw 'Login did not return an authenticated test user.' }
    if (-not $login.data.csrfToken) { throw 'Authenticated session did not return a CSRF token.' }
    $session.Headers['X-CSRF-Token'] = [string]$login.data.csrfToken

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

    $invalidPurchaseBase = @{ vendorId = [string]$linkedVendor.data.id; purchaseDate = '2026-02-30'; status = 'pending'; subtotal = '10'; shipping = '0'; exciseTax = '0'; salesTax = '0'; discount = '0'; totalPaid = '10' }
    Invoke-ExpectedApiError -Uri "http://127.0.0.1:$port/api/records/purchases" -Method Post -Session $session -Body $invalidPurchaseBase -StatusCode 422 -ErrorCode 'VALIDATION_ERROR' | Out-Null
    $invalidMoneyPurchase = $invalidPurchaseBase.Clone(); $invalidMoneyPurchase.purchaseDate = '2026-07-17'; $invalidMoneyPurchase.discount = '-1'
    Invoke-ExpectedApiError -Uri "http://127.0.0.1:$port/api/records/purchases" -Method Post -Session $session -Body $invalidMoneyPurchase -StatusCode 422 -ErrorCode 'VALIDATION_ERROR' | Out-Null
    $invalidPrecisionPurchase = $invalidPurchaseBase.Clone(); $invalidPrecisionPurchase.purchaseDate = '2026-07-17'; $invalidPrecisionPurchase.shipping = '0.001'
    Invoke-ExpectedApiError -Uri "http://127.0.0.1:$port/api/records/purchases" -Method Post -Session $session -Body $invalidPrecisionPurchase -StatusCode 422 -ErrorCode 'VALIDATION_ERROR' | Out-Null
    $partialStatusPurchase = $invalidPurchaseBase.Clone(); $partialStatusPurchase.purchaseDate = '2026-07-17'; $partialStatusPurchase.status = 'partially-received'
    Invoke-ExpectedApiError -Uri "http://127.0.0.1:$port/api/records/purchases" -Method Post -Session $session -Body $partialStatusPurchase -StatusCode 422 -ErrorCode 'VALIDATION_ERROR' | Out-Null

    $authoritativePurchaseBody = @{ vendorId = [string]$linkedVendor.data.id; purchaseDate = '2026-07-17'; status = 'pending'; subtotal = '10'; shipping = '1'; exciseTax = '0'; salesTax = '0'; discount = '1'; totalPaid = '999' }
    $authoritativePurchase = Invoke-RestMethod "http://127.0.0.1:$port/api/records/purchases" -Method Post -ContentType 'application/json' -Body ($authoritativePurchaseBody | ConvertTo-Json) -WebSession $session
    if ($authoritativePurchase.data.totalPaid -ne 10) { throw 'PHP did not override the client totalPaid with the authoritative formula.' }
    Invoke-RestMethod "http://127.0.0.1:$port/api/records/purchases/$($authoritativePurchase.data.id)" -Method Delete -WebSession $session | Out-Null

    $unknownPurchaseBody = @{ vendorId = [string]$linkedVendor.data.id; purchaseDate = '2026-07-17'; status = 'pending'; subtotal = '10'; totalPaid = '999' }
    $unknownPurchase = Invoke-RestMethod "http://127.0.0.1:$port/api/records/purchases" -Method Post -ContentType 'application/json' -Body ($unknownPurchaseBody | ConvertTo-Json) -WebSession $session
    if ($null -ne $unknownPurchase.data.totalPaid) { throw 'Missing purchase adjustments must keep totalPaid unknown.' }
    $unknownLine = Invoke-RestMethod "http://127.0.0.1:$port/api/records/purchase-lines" -Method Post -ContentType 'application/json' -Body (@{ purchaseId = [string]$unknownPurchase.data.id; catalogCigarId = [string]$createdCigar.data.id; quantity = '1'; purchasePrice = '10' } | ConvertTo-Json) -WebSession $session
    if ($null -ne $unknownLine.data.trueCostBasis -or $null -ne $unknownLine.data.trueCostPerCigar) { throw 'Missing header money must keep allocated line cost unknown.' }
    Invoke-RestMethod "http://127.0.0.1:$port/api/records/purchase-lines/$($unknownLine.data.id)" -Method Delete -WebSession $session | Out-Null
    Invoke-RestMethod "http://127.0.0.1:$port/api/records/purchases/$($unknownPurchase.data.id)" -Method Delete -WebSession $session | Out-Null

    $pennyPurchase = Invoke-RestMethod "http://127.0.0.1:$port/api/records/purchases" -Method Post -ContentType 'application/json' -Body (@{ vendorId = [string]$linkedVendor.data.id; purchaseDate = '2026-07-17'; status = 'pending'; subtotal = '0.03'; shipping = '0.01'; exciseTax = '0'; salesTax = '0'; discount = '0'; totalPaid = '0' } | ConvertTo-Json) -WebSession $session
    $pennyLines = @()
    1..3 | ForEach-Object {
        $pennyLines += Invoke-RestMethod "http://127.0.0.1:$port/api/records/purchase-lines" -Method Post -ContentType 'application/json' -Body (@{ purchaseId = [string]$pennyPurchase.data.id; catalogCigarId = [string]$createdCigar.data.id; quantity = '1'; purchasePrice = '0.01'; unitCost = '0.01' } | ConvertTo-Json) -WebSession $session
    }
    $storedPennyLines = @((Get-Content -Raw -LiteralPath (Join-Path $testDataRoot 'purchase-lines.json') | ConvertFrom-Json) | Where-Object { $_.purchaseId -eq $pennyPurchase.data.id } | Sort-Object id)
    if (($storedPennyLines | Measure-Object -Property allocatedShipping -Sum).Sum -ne 0.01 -or $storedPennyLines[0].allocatedShipping -ne 0.01 -or $storedPennyLines[1].allocatedShipping -ne 0 -or $storedPennyLines[2].allocatedShipping -ne 0) {
        throw 'Deterministic largest-remainder allocation did not reconcile the penny to stable line-ID order.'
    }
    foreach ($line in $pennyLines) { Invoke-RestMethod "http://127.0.0.1:$port/api/records/purchase-lines/$($line.data.id)" -Method Delete -WebSession $session | Out-Null }
    Invoke-RestMethod "http://127.0.0.1:$port/api/records/purchases/$($pennyPurchase.data.id)" -Method Delete -WebSession $session | Out-Null

    $emptyHumidorBody = @{ name = 'Empty Smoke Humidor'; type = 'Cabinet'; capacity = '10'; notes = 'temporary empty humidor' } | ConvertTo-Json
    $emptyHumidor = Invoke-RestMethod "http://127.0.0.1:$port/api/records/storage-locations" -Method Post -ContentType 'application/json' -Body $emptyHumidorBody -WebSession $session
    $emptySectionBody = @{ storageLocationId = "$($emptyHumidor.data.id)"; name = 'Empty Drawer'; type = 'Drawer'; capacity = '10'; notes = 'temporary empty section' } | ConvertTo-Json
    $emptySection = Invoke-RestMethod "http://127.0.0.1:$port/api/records/storage-sub-locations" -Method Post -ContentType 'application/json' -Body $emptySectionBody -WebSession $session
    Invoke-ExpectedApiError -Uri "http://127.0.0.1:$port/api/records/storage-locations/$($emptyHumidor.data.id)" -Method Delete -Session $session -Body $null -StatusCode 409 -ErrorCode 'RECORD_REFERENCED' | Out-Null
    $deletedEmptySection = Invoke-RestMethod "http://127.0.0.1:$port/api/records/storage-sub-locations/$($emptySection.data.id)" -Method Delete -WebSession $session
    if ($deletedEmptySection.data.id -ne $emptySection.data.id) { throw 'Unreferenced Humidor section deletion should remain permitted.' }
    $deletedEmptyHumidor = Invoke-RestMethod "http://127.0.0.1:$port/api/records/storage-locations/$($emptyHumidor.data.id)" -Method Delete -WebSession $session
    if ($deletedEmptyHumidor.data.id -ne $emptyHumidor.data.id) { throw 'Unreferenced Humidor deletion should remain permitted.' }

    $humidorBody = @{ name = 'Linked Smoke Humidor'; type = 'Cabinet'; capacity = '25'; notes = 'temporary linked smoke test record' } | ConvertTo-Json
    $createdHumidor = Invoke-RestMethod "http://127.0.0.1:$port/api/records/storage-locations" -Method Post -ContentType 'application/json' -Body $humidorBody -WebSession $session

    $sectionBody = @{ storageLocationId = "$($createdHumidor.data.id)"; name = 'Drawer 1'; type = 'Drawer'; capacity = '10'; notes = 'temporary linked smoke test section' } | ConvertTo-Json
    $createdSection = Invoke-RestMethod "http://127.0.0.1:$port/api/records/storage-sub-locations" -Method Post -ContentType 'application/json' -Body $sectionBody -WebSession $session
    if ($createdSection.data.name -ne 'Drawer 1' -or [string]$createdSection.data.storageLocationId -ne [string]$createdHumidor.data.id) { throw 'Storage sub-location create endpoint did not return the linked drawer record.' }

    $partialPurchaseBody = @{
        vendorId = [string]$linkedVendor.data.id; purchaseDate = '2026-07-16'; subtotal = '70'; receivedDate = ''
        status = 'pending'; invoiceNumber = 'SMOKE-PARTIAL-1'; shipping = '0'; exciseTax = '0'; salesTax = '0'
        discount = '0'; totalPaid = '70'; notes = ''
    }
    $partialPurchase = Invoke-RestMethod "http://127.0.0.1:$port/api/records/purchases" -Method Post -ContentType 'application/json' -Body ($partialPurchaseBody | ConvertTo-Json) -WebSession $session
    $partialLineOne = Invoke-RestMethod "http://127.0.0.1:$port/api/records/purchase-lines" -Method Post -ContentType 'application/json' -Body (@{
        purchaseId = [string]$partialPurchase.data.id; catalogCigarId = [string]$createdCigar.data.id
        quantity = '5'; purchasePrice = '50'; unitCost = '10'; msrpPerCigar = '9.50'; notes = 'partial line one'
    } | ConvertTo-Json) -WebSession $session
    $partialLineTwo = Invoke-RestMethod "http://127.0.0.1:$port/api/records/purchase-lines" -Method Post -ContentType 'application/json' -Body (@{
        purchaseId = [string]$partialPurchase.data.id; catalogCigarId = [string]$createdCigar.data.id
        quantity = '2'; purchasePrice = '20'; unitCost = '10'; msrpPerCigar = '9.50'; notes = 'partial line two'
    } | ConvertTo-Json) -WebSession $session

    $firstReceiptBody = @{
        quantity = '2'; receivedDate = '2026-07-17'; storageLocationId = [string]$createdHumidor.data.id
        storageSubLocationId = [string]$createdSection.data.id; idempotencyKey = 'receipt-smoke-partial-0001'; notes = 'first carton'
    }
    $firstReceipt = Invoke-RestMethod "http://127.0.0.1:$port/api/purchase-lines/$($partialLineOne.data.id)/receive" -Method Post -ContentType 'application/json' -Body ($firstReceiptBody | ConvertTo-Json) -WebSession $session
    if ($firstReceipt.data.idempotentReplay -ne $false -or $firstReceipt.data.receivedQuantity -ne 2 -or $firstReceipt.data.remainingQuantity -ne 3) {
        throw 'First partial receipt did not return the expected quantities.'
    }
    if ($firstReceipt.data.purchase.status -ne 'partially-received' -or $firstReceipt.data.purchase.receivedDate) {
        throw 'First partial receipt did not derive partially-received purchase status with no completion date.'
    }
    if ($firstReceipt.data.purchaseLine.receivedQuantity -ne 2 -or $firstReceipt.data.purchaseLine.receivedDate) {
        throw 'First partial receipt did not preserve ordered versus received line quantities.'
    }
    if ($firstReceipt.data.lot.initialQuantity -ne 2 -or $firstReceipt.data.lot.currentQuantity -ne 2 -or $firstReceipt.data.balance.quantity -ne 2) {
        throw 'First partial receipt did not create the expected Lot and location balance.'
    }
    if ($firstReceipt.data.inventoryEvent.quantity -ne 2 -or $firstReceipt.data.inventoryEvent.receiptKey -ne $firstReceiptBody.idempotencyKey) {
        throw 'First partial receipt did not create the expected idempotent receipt event.'
    }

    $firstReceiptHashes = Get-TestDataHashSnapshot -DataRoot $testDataRoot
    $firstReceiptReplay = Invoke-RestMethod "http://127.0.0.1:$port/api/purchase-lines/$($partialLineOne.data.id)/receive" -Method Post -ContentType 'application/json' -Body ($firstReceiptBody | ConvertTo-Json) -WebSession $session
    if ($firstReceiptReplay.data.idempotentReplay -ne $true -or $firstReceiptReplay.data.inventoryEvent.id -ne $firstReceipt.data.inventoryEvent.id) {
        throw 'An exact receipt retry did not return the original event as an idempotent replay.'
    }
    Assert-TestDataHashSnapshot -DataRoot $testDataRoot -Expected $firstReceiptHashes -Context 'Exact receipt replay'

    $receiptKeyConflict = $firstReceiptBody.Clone(); $receiptKeyConflict.quantity = '1'
    Invoke-ExpectedApiError -Uri "http://127.0.0.1:$port/api/purchase-lines/$($partialLineOne.data.id)/receive" -Method Post -Session $session -Body $receiptKeyConflict -StatusCode 409 -ErrorCode 'RECEIPT_IDEMPOTENCY_CONFLICT' | Out-Null
    $overReceipt = $firstReceiptBody.Clone(); $overReceipt.quantity = '4'; $overReceipt.idempotencyKey = 'receipt-smoke-partial-over-0002'
    Invoke-ExpectedApiError -Uri "http://127.0.0.1:$port/api/purchase-lines/$($partialLineOne.data.id)/receive" -Method Post -Session $session -Body $overReceipt -StatusCode 409 -ErrorCode 'RECEIPT_QUANTITY_EXCEEDED' | Out-Null
    $earlyReceipt = $firstReceiptBody.Clone(); $earlyReceipt.quantity = '1'; $earlyReceipt.receivedDate = '2026-07-15'; $earlyReceipt.idempotencyKey = 'receipt-smoke-partial-early-003'
    Invoke-ExpectedApiError -Uri "http://127.0.0.1:$port/api/purchase-lines/$($partialLineOne.data.id)/receive" -Method Post -Session $session -Body $earlyReceipt -StatusCode 422 -ErrorCode 'VALIDATION_ERROR' | Out-Null
    Assert-TestDataHashSnapshot -DataRoot $testDataRoot -Expected $firstReceiptHashes -Context 'Rejected partial receipt requests'

    $partialHeaderNotes = Invoke-RestMethod "http://127.0.0.1:$port/api/records/purchases/$($partialPurchase.data.id)" -Method Put -ContentType 'application/json' -Body (@{ notes = 'partial header notes remain editable' } | ConvertTo-Json) -WebSession $session
    if ($partialHeaderNotes.data.status -ne 'partially-received' -or $partialHeaderNotes.data.notes -ne 'partial header notes remain editable') {
        throw 'Safe header editing did not preserve derived partially-received status.'
    }
    $partialLineNotes = Invoke-RestMethod "http://127.0.0.1:$port/api/records/purchase-lines/$($partialLineOne.data.id)" -Method Put -ContentType 'application/json' -Body (@{ notes = 'partial line notes remain editable' } | ConvertTo-Json) -WebSession $session
    if ($partialLineNotes.data.receivedQuantity -ne 2 -or $partialLineNotes.data.notes -ne 'partial line notes remain editable') {
        throw 'Safe line editing did not preserve partial receipt fields.'
    }

    $secondReceiptBody = @{
        quantity = '3'; receivedDate = '2026-07-18'; storageLocationId = [string]$createdHumidor.data.id
        storageSubLocationId = ''; idempotencyKey = 'receipt-smoke-partial-0002'; notes = 'remaining first line'
    }
    $secondReceipt = Invoke-RestMethod "http://127.0.0.1:$port/api/purchase-lines/$($partialLineOne.data.id)/receive" -Method Post -ContentType 'application/json' -Body ($secondReceiptBody | ConvertTo-Json) -WebSession $session
    if ($secondReceipt.data.receivedQuantity -ne 5 -or $secondReceipt.data.remainingQuantity -ne 0 -or $secondReceipt.data.purchase.status -ne 'partially-received') {
        throw 'Completing one line did not leave the multi-line purchase partially received.'
    }
    if ($secondReceipt.data.purchaseLine.receivedDate -ne '2026-07-18' -or $secondReceipt.data.lot.initialQuantity -ne 5 -or $secondReceipt.data.lot.currentQuantity -ne 5) {
        throw 'Completing the first line did not reconcile its dates and Lot quantities.'
    }
    $partialLineOneBalances = @((Get-Content -LiteralPath (Join-Path $testDataRoot 'lot-location-balances.json') -Raw | ConvertFrom-Json) | Where-Object { $_.lotId -eq $secondReceipt.data.lot.id })
    if ($partialLineOneBalances.Count -ne 2 -or ($partialLineOneBalances | Measure-Object -Property quantity -Sum).Sum -ne 5) {
        throw 'Split partial receipts did not reconcile across exact location balances.'
    }
    $partialLineOneEvents = @((Get-Content -LiteralPath (Join-Path $testDataRoot 'inventory-events.json') -Raw | ConvertFrom-Json) | Where-Object { $_.purchaseLineId -eq $partialLineOne.data.id -and $_.eventType -eq 'purchase-receipt' })
    if ($partialLineOneEvents.Count -ne 2 -or ($partialLineOneEvents | Measure-Object -Property quantity -Sum).Sum -ne 5) {
        throw 'Partial receipt events did not reconcile to the first line ordered quantity.'
    }

    $finalReceiptBody = @{
        quantity = '2'; receivedDate = '2026-07-19'; storageLocationId = [string]$createdHumidor.data.id
        storageSubLocationId = [string]$createdSection.data.id; idempotencyKey = 'receipt-smoke-partial-0003'; notes = 'second line complete'
    }
    $finalReceipt = Invoke-RestMethod "http://127.0.0.1:$port/api/purchase-lines/$($partialLineTwo.data.id)/receive" -Method Post -ContentType 'application/json' -Body ($finalReceiptBody | ConvertTo-Json) -WebSession $session
    if ($finalReceipt.data.purchase.status -ne 'received' -or $finalReceipt.data.purchase.receivedDate -ne '2026-07-19') {
        throw 'Final line receipt did not derive the received purchase status and completion date.'
    }
    $completedReceiptHashes = Get-TestDataHashSnapshot -DataRoot $testDataRoot
    $afterCompleteBody = $finalReceiptBody.Clone(); $afterCompleteBody.idempotencyKey = 'receipt-smoke-after-complete-004'; $afterCompleteBody.quantity = '1'
    Invoke-ExpectedApiError -Uri "http://127.0.0.1:$port/api/purchase-lines/$($partialLineTwo.data.id)/receive" -Method Post -Session $session -Body $afterCompleteBody -StatusCode 409 -ErrorCode 'RECEIVED_INVENTORY_IMMUTABLE' | Out-Null
    Assert-TestDataHashSnapshot -DataRoot $testDataRoot -Expected $completedReceiptHashes -Context 'Receipt after purchase completion'

    $purchaseBody = @{ vendorId = "$($linkedVendor.data.id)"; purchaseDate = '2026-07-15'; subtotal = '50'; receivedDate = ''; status = 'pending'; invoiceNumber = 'SMOKE-PO-1'; shipping = '0'; exciseTax = '0'; salesTax = '0'; discount = '0'; totalPaid = '50'; notes = '' } | ConvertTo-Json
    $createdPurchase = Invoke-RestMethod "http://127.0.0.1:$port/api/records/purchases" -Method Post -ContentType 'application/json' -Body $purchaseBody -WebSession $session
    if ($createdPurchase.data.status -ne 'pending' -or $createdPurchase.data.subtotal -ne 50 -or $createdPurchase.data.invoiceNumber -ne 'SMOKE-PO-1') { throw 'Purchase create endpoint did not preserve status, subtotal, and invoice number.' }

    $lineBody = @{ purchaseId = "$($createdPurchase.data.id)"; catalogCigarId = "$($createdCigar.data.id)"; quantity = '5'; purchasePrice = '50'; unitCost = '10'; msrpPerCigar = '9.50'; notes = 'temporary linked smoke test record' } | ConvertTo-Json
    $createdLine = Invoke-RestMethod "http://127.0.0.1:$port/api/records/purchase-lines" -Method Post -ContentType 'application/json' -Body $lineBody -WebSession $session
    if ((-not $createdLine.data.id) -or $createdLine.data.createdLotId -or $createdLine.data.createdInventoryEventId) { throw 'Pending purchase lines should not create receipt inventory ids before the order is received.' }
    if ($createdLine.data.trueCostPerCigar -ne 10 -or $createdLine.data.allocatedShipping -ne 0 -or $createdLine.data.msrpPerCigarResolved -ne 9.5) { throw 'Purchase line create endpoint did not return allocated financial fields.' }

    $lots = Get-Content -LiteralPath (Join-Path $testDataRoot 'lots.json') -Raw | ConvertFrom-Json
    $pendingLot = $lots | Where-Object { $_.purchaseLineId -eq $createdLine.data.id } | Select-Object -First 1
    if ($pendingLot) { throw 'Pending purchase lines should not create lots before receipt and location assignment.' }

    $balances = Get-Content -LiteralPath (Join-Path $testDataRoot 'lot-location-balances.json') -Raw | ConvertFrom-Json
    $pendingBalance = $balances | Where-Object { $_.purchaseLineId -eq $createdLine.data.id } | Select-Object -First 1
    if ($pendingBalance) { throw 'Pending purchase lines should not create location balances before receipt and location assignment.' }

    $events = Get-Content -LiteralPath (Join-Path $testDataRoot 'inventory-events.json') -Raw | ConvertFrom-Json
    $pendingEvent = $events | Where-Object { $_.purchaseLineId -eq $createdLine.data.id -and $_.eventType -eq 'purchase-receipt' } | Select-Object -First 1
    if ($pendingEvent) { throw 'Pending purchase lines should not create receipt events before receipt and location assignment.' }

    $manualStatusHashes = Get-TestDataHashSnapshot -DataRoot $testDataRoot
    Invoke-ExpectedApiError -Uri "http://127.0.0.1:$port/api/records/purchases/$($createdPurchase.data.id)" -Method Put -Session $session -Body @{ status = 'received'; receivedDate = '2026-07-16' } -StatusCode 409 -ErrorCode 'RECEIPT_WORKFLOW_REQUIRED' | Out-Null
    Assert-TestDataHashSnapshot -DataRoot $testDataRoot -Expected $manualStatusHashes -Context 'Rejected manual purchase status transition'

    $fullReceiptBody = @{
        quantity = '5'; receivedDate = '2026-07-16'; storageLocationId = [string]$createdHumidor.data.id
        storageSubLocationId = [string]$createdSection.data.id; idempotencyKey = 'receipt-smoke-full-line-0001'; notes = 'temporary linked smoke test record'
    }
    $fullReceipt = Invoke-RestMethod "http://127.0.0.1:$port/api/purchase-lines/$($createdLine.data.id)/receive" -Method Post -ContentType 'application/json' -Body ($fullReceiptBody | ConvertTo-Json) -WebSession $session
    $receivedPurchase = $fullReceipt.data.purchase
    if ($receivedPurchase.status -ne 'received' -or $receivedPurchase.receivedDate -ne '2026-07-16') { throw 'Receive endpoint did not mark the completed order received.' }

    $lots = Get-Content -LiteralPath (Join-Path $testDataRoot 'lots.json') -Raw | ConvertFrom-Json
    $linkedLot = $lots | Where-Object { $_.purchaseLineId -eq $createdLine.data.id } | Select-Object -First 1
    if (-not $linkedLot -or $linkedLot.currentQuantity -ne 5 -or $linkedLot.catalogCigarId -ne $createdCigar.data.id -or $linkedLot.costPerCigarSnapshot -ne 10 -or $linkedLot.msrpPerCigarSnapshot -ne 9.5) { throw 'Received purchase line did not create the expected linked lot.' }

    $balances = Get-Content -LiteralPath (Join-Path $testDataRoot 'lot-location-balances.json') -Raw | ConvertFrom-Json
    $linkedBalance = $balances | Where-Object { $_.lotId -eq $linkedLot.id -and $_.storageLocationId -eq $createdHumidor.data.id } | Select-Object -First 1
    if (-not $linkedBalance -or $linkedBalance.quantity -ne 5 -or $linkedBalance.storageSubLocationId -ne $createdSection.data.id) { throw 'Received purchase line did not create the expected lot-location balance.' }

    $events = Get-Content -LiteralPath (Join-Path $testDataRoot 'inventory-events.json') -Raw | ConvertFrom-Json
    $linkedEvent = $events | Where-Object { $_.purchaseLineId -eq $createdLine.data.id -and $_.lotId -eq $linkedLot.id -and $_.eventType -eq 'purchase-receipt' } | Select-Object -First 1
    if (-not $linkedEvent -or $linkedEvent.quantity -ne 5 -or $linkedEvent.storageSubLocationId -ne $createdSection.data.id -or $linkedEvent.costPerCigarAtEvent -ne 10 -or $linkedEvent.msrpPerCigarAtEvent -ne 9.5) { throw 'Received purchase line did not create the expected purchase-receipt inventory event.' }

    $guardedPaths = @(
        (Join-Path $testDataRoot 'lot-location-balances.json'),
        (Join-Path $testDataRoot 'inventory-events.json'),
        (Join-Path $testDataRoot 'counters.json')
    )
    $guardedHashesBefore = @{}
    foreach ($path in $guardedPaths) { $guardedHashesBefore[$path] = (Get-FileHash -Algorithm SHA256 -LiteralPath $path).Hash }
    $sameLocationMove = @{
        sourceBalanceId = [string]$linkedBalance.id
        quantity = '1'
        toStorageLocationId = [string]$createdHumidor.data.id
        toStorageSubLocationId = [string]$createdSection.data.id
        notes = 'must be rejected'
    }
    Invoke-ExpectedApiError -Uri "http://127.0.0.1:$port/api/inventory/move" -Method Post -Session $session -Body $sameLocationMove -StatusCode 400 -ErrorCode 'VALIDATION_ERROR' | Out-Null
    foreach ($path in $guardedPaths) {
        if ((Get-FileHash -Algorithm SHA256 -LiteralPath $path).Hash -ne $guardedHashesBefore[$path]) {
            throw "Same-location move changed protected data: $path"
        }
    }

    $quantityEdit = @{
        purchaseId = [string]$createdPurchase.data.id; catalogCigarId = [string]$createdCigar.data.id
        storageLocationId = [string]$createdHumidor.data.id; storageSubLocationId = [string]$createdSection.data.id
        quantity = '6'; purchasePrice = '50'; unitCost = '10'; msrpPerCigar = '9.50'; notes = 'blocked quantity edit'
    }
    Invoke-ExpectedApiError -Uri "http://127.0.0.1:$port/api/records/purchase-lines/$($createdLine.data.id)" -Method Put -Session $session -Body $quantityEdit -StatusCode 409 -ErrorCode 'RECEIVED_INVENTORY_IMMUTABLE' | Out-Null

    $locationEdit = @{
        purchaseId = [string]$createdPurchase.data.id; catalogCigarId = [string]$createdCigar.data.id
        storageLocationId = ''; storageSubLocationId = ''
        quantity = '5'; purchasePrice = '50'; unitCost = '10'; msrpPerCigar = '9.50'; notes = 'blocked location edit'
    }
    Invoke-ExpectedApiError -Uri "http://127.0.0.1:$port/api/records/purchase-lines/$($createdLine.data.id)" -Method Put -Session $session -Body $locationEdit -StatusCode 409 -ErrorCode 'RECEIVED_INVENTORY_IMMUTABLE' | Out-Null
    Invoke-ExpectedApiError -Uri "http://127.0.0.1:$port/api/records/purchase-lines/$($createdLine.data.id)" -Method Delete -Session $session -Body $null -StatusCode 409 -ErrorCode 'RECEIVED_INVENTORY_IMMUTABLE' | Out-Null

    Invoke-ExpectedApiError -Uri "http://127.0.0.1:$port/api/records/catalog-cigars/$($createdCigar.data.id)" -Method Delete -Session $session -Body $null -StatusCode 409 -ErrorCode 'RECORD_REFERENCED' | Out-Null
    Invoke-ExpectedApiError -Uri "http://127.0.0.1:$port/api/records/vendors/$($linkedVendor.data.id)" -Method Delete -Session $session -Body $null -StatusCode 409 -ErrorCode 'RECORD_REFERENCED' | Out-Null
    Invoke-ExpectedApiError -Uri "http://127.0.0.1:$port/api/records/storage-locations/$($createdHumidor.data.id)" -Method Delete -Session $session -Body $null -StatusCode 409 -ErrorCode 'RECORD_REFERENCED' | Out-Null
    Invoke-ExpectedApiError -Uri "http://127.0.0.1:$port/api/records/storage-sub-locations/$($createdSection.data.id)" -Method Delete -Session $session -Body $null -StatusCode 409 -ErrorCode 'RECORD_REFERENCED' | Out-Null
    Invoke-ExpectedApiError -Uri "http://127.0.0.1:$port/api/records/purchases/$($createdPurchase.data.id)" -Method Delete -Session $session -Body $null -StatusCode 409 -ErrorCode 'RECORD_REFERENCED' | Out-Null

    $receivedDateEdit = @{
        vendorId = [string]$linkedVendor.data.id; purchaseDate = '2026-07-15'; subtotal = '50'; receivedDate = '2026-07-17'
        status = 'received'; invoiceNumber = 'SMOKE-PO-1'; expectedDate = ''; trackingNumber = ''; shipping = '0'
        exciseTax = '0'; salesTax = '0'; discount = '0'; totalPaid = '50'; notes = ''
    }
    Invoke-ExpectedApiError -Uri "http://127.0.0.1:$port/api/records/purchases/$($createdPurchase.data.id)" -Method Put -Session $session -Body $receivedDateEdit -StatusCode 409 -ErrorCode 'RECEIVED_INVENTORY_IMMUTABLE' | Out-Null
    Invoke-ExpectedApiError -Uri "http://127.0.0.1:$port/api/records/purchases/$($createdPurchase.data.id)" -Method Put -Session $session -Body @{ status = 'pending' } -StatusCode 409 -ErrorCode 'RECEIPT_WORKFLOW_REQUIRED' | Out-Null

    $draftPurchaseBody = @{ vendorId = [string]$linkedVendor.data.id; purchaseDate = '2026-07-17'; status = 'pending'; invoiceNumber = 'DRAFT-DELETE'; subtotal = '10'; shipping = '0'; exciseTax = '0'; salesTax = '0'; discount = '0'; totalPaid = '10'; notes = '' }
    $draftPurchase = Invoke-RestMethod "http://127.0.0.1:$port/api/records/purchases" -Method Post -ContentType 'application/json' -Body ($draftPurchaseBody | ConvertTo-Json) -WebSession $session
    $draftLineBody = @{ purchaseId = [string]$draftPurchase.data.id; catalogCigarId = [string]$createdCigar.data.id; quantity = '1'; purchasePrice = '10'; unitCost = '10'; msrpPerCigar = '9.50'; notes = 'unreceived draft' }
    $draftLine = Invoke-RestMethod "http://127.0.0.1:$port/api/records/purchase-lines" -Method Post -ContentType 'application/json' -Body ($draftLineBody | ConvertTo-Json) -WebSession $session
    $pendingLineEdit = Invoke-RestMethod "http://127.0.0.1:$port/api/records/purchase-lines/$($draftLine.data.id)" -Method Put -ContentType 'application/json' -Body (@{ quantity = '2'; storageLocationId = [string]$createdHumidor.data.id; storageSubLocationId = [string]$createdSection.data.id } | ConvertTo-Json) -WebSession $session
    if ($pendingLineEdit.data.quantity -ne 2 -or $pendingLineEdit.data.storageLocationId -ne $createdHumidor.data.id) { throw 'Pending-purchase line structural editing should remain permitted.' }
    $reassignmentHashes = Get-TestDataHashSnapshot -DataRoot $testDataRoot
    Invoke-ExpectedApiError -Uri "http://127.0.0.1:$port/api/records/purchase-lines/$($draftLine.data.id)" -Method Put -Session $session -Body @{ purchaseId = [string]$createdPurchase.data.id } -StatusCode 409 -ErrorCode 'RECEIVED_INVENTORY_IMMUTABLE' | Out-Null
    Assert-TestDataHashSnapshot -DataRoot $testDataRoot -Expected $reassignmentHashes -Context 'Rejected received-purchase reassignment'
    $deletedDraftLine = Invoke-RestMethod "http://127.0.0.1:$port/api/records/purchase-lines/$($draftLine.data.id)" -Method Delete -WebSession $session
    if ($deletedDraftLine.data.id -ne $draftLine.data.id) { throw 'Unreceived draft purchase line deletion should remain permitted.' }

    $incompletePurchaseBody = @{ vendorId = [string]$linkedVendor.data.id; purchaseDate = '2026-07-17'; status = 'pending'; invoiceNumber = 'INCOMPLETE-RECEIVED'; subtotal = '10'; shipping = '0'; exciseTax = '0'; salesTax = '0'; discount = '0'; totalPaid = '10'; notes = '' }
    $incompletePurchase = Invoke-RestMethod "http://127.0.0.1:$port/api/records/purchases" -Method Post -ContentType 'application/json' -Body ($incompletePurchaseBody | ConvertTo-Json) -WebSession $session
    $incompleteLineBody = @{ purchaseId = [string]$incompletePurchase.data.id; catalogCigarId = [string]$createdCigar.data.id; quantity = '1'; purchasePrice = '10'; unitCost = '10'; msrpPerCigar = '9.50'; notes = 'incomplete before receipt' }
    $incompleteLine = Invoke-RestMethod "http://127.0.0.1:$port/api/records/purchase-lines" -Method Post -ContentType 'application/json' -Body ($incompleteLineBody | ConvertTo-Json) -WebSession $session
    $isolatedPurchasesPath = Join-Path $testDataRoot 'purchases.json'
    $isolatedPurchases = @(Get-Content -LiteralPath $isolatedPurchasesPath -Raw | ConvertFrom-Json)
    foreach ($isolatedPurchaseRecord in $isolatedPurchases) {
        if ($isolatedPurchaseRecord.id -eq $incompletePurchase.data.id) {
            $isolatedPurchaseRecord.status = 'received'
            $isolatedPurchaseRecord.receivedDate = '2026-07-17'
        }
    }
    $isolatedPurchases | ConvertTo-Json -Depth 8 -AsArray | Set-Content -LiteralPath $isolatedPurchasesPath -Encoding UTF8

    $incompleteGuardHashes = Get-TestDataHashSnapshot -DataRoot $testDataRoot
    $incompleteLineCount = @((Get-Content -LiteralPath (Join-Path $testDataRoot 'purchase-lines.json') -Raw | ConvertFrom-Json)).Count
    Invoke-ExpectedApiError -Uri "http://127.0.0.1:$port/api/records/purchase-lines" -Method Post -Session $session -Body $incompleteLineBody -StatusCode 409 -ErrorCode 'RECEIVED_INVENTORY_IMMUTABLE' | Out-Null
    Invoke-ExpectedApiError -Uri "http://127.0.0.1:$port/api/records/purchase-lines/$($incompleteLine.data.id)" -Method Put -Session $session -Body @{ quantity = '2' } -StatusCode 409 -ErrorCode 'RECEIVED_INVENTORY_IMMUTABLE' | Out-Null
    Invoke-ExpectedApiError -Uri "http://127.0.0.1:$port/api/records/purchase-lines/$($incompleteLine.data.id)" -Method Put -Session $session -Body @{ storageLocationId = [string]$createdHumidor.data.id; storageSubLocationId = [string]$createdSection.data.id } -StatusCode 409 -ErrorCode 'RECEIVED_INVENTORY_IMMUTABLE' | Out-Null
    Invoke-ExpectedApiError -Uri "http://127.0.0.1:$port/api/records/purchase-lines/$($incompleteLine.data.id)" -Method Delete -Session $session -Body $null -StatusCode 409 -ErrorCode 'RECEIVED_INVENTORY_IMMUTABLE' | Out-Null
    Assert-TestDataHashSnapshot -DataRoot $testDataRoot -Expected $incompleteGuardHashes -Context 'Rejected incomplete received-line requests'
    $incompleteLineCountAfter = @((Get-Content -LiteralPath (Join-Path $testDataRoot 'purchase-lines.json') -Raw | ConvertFrom-Json)).Count
    if ($incompleteLineCountAfter -ne $incompleteLineCount) { throw 'Rejected received-line creation or deletion changed the line count.' }
    $incompleteNotesEdit = Invoke-RestMethod "http://127.0.0.1:$port/api/records/purchase-lines/$($incompleteLine.data.id)" -Method Put -ContentType 'application/json' -Body (@{ notes = 'notes-only edit remains allowed' } | ConvertTo-Json) -WebSession $session
    if ($incompleteNotesEdit.data.notes -ne 'notes-only edit remains allowed') { throw 'Notes-only editing should remain permitted for an incomplete line on a received purchase.' }

    $moveBody = @{ sourceBalanceId = "$($linkedBalance.id)"; quantity = '2'; toStorageLocationId = "$($createdHumidor.data.id)"; toStorageSubLocationId = ''; notes = 'temporary smoke move' } | ConvertTo-Json
    $moveResult = Invoke-RestMethod "http://127.0.0.1:$port/api/inventory/move" -Method Post -ContentType 'application/json' -Body $moveBody -WebSession $session
    if ($moveResult.data.quantityMoved -ne 2 -or $moveResult.data.lotId -ne $linkedLot.id) { throw 'Inventory move endpoint did not return the moved lot and quantity.' }

    $balancesAfterMove = Get-Content -LiteralPath (Join-Path $testDataRoot 'lot-location-balances.json') -Raw | ConvertFrom-Json
    $movedSource = $balancesAfterMove | Where-Object { $_.id -eq $linkedBalance.id } | Select-Object -First 1
    $movedDestination = $balancesAfterMove | Where-Object { $_.lotId -eq $linkedLot.id -and $_.storageLocationId -eq $createdHumidor.data.id -and ($_.storageSubLocationId -eq $null -or $_.storageSubLocationId -eq '') -and $_.id -ne $linkedBalance.id } | Select-Object -First 1
    if (-not $movedSource -or $movedSource.quantity -ne 3) { throw 'Inventory move did not reduce the source balance correctly.' }
    if (-not $movedDestination -or $movedDestination.quantity -ne 2) { throw 'Inventory move did not create the destination balance correctly.' }
    if (($balancesAfterMove | Where-Object { $_.lotId -eq $linkedLot.id } | Measure-Object -Property quantity -Sum).Sum -ne 5) { throw 'Valid partial move changed total lot quantity.' }

    $eventsAfterMove = Get-Content -LiteralPath (Join-Path $testDataRoot 'inventory-events.json') -Raw | ConvertFrom-Json
    $moveEvent = $eventsAfterMove | Where-Object { $_.eventType -eq 'move' -and $_.lotId -eq $linkedLot.id -and $_.quantity -eq 2 } | Select-Object -First 1
    if (-not $moveEvent -or $moveEvent.costPerCigarAtEvent -ne 10 -or $moveEvent.msrpPerCigarAtEvent -ne 9.5) { throw 'Inventory move did not preserve the lot cost and MSRP on the move event.' }

    $historyPaths = @('lots.json', 'lot-location-balances.json', 'inventory-events.json', 'counters.json') | ForEach-Object { Join-Path $testDataRoot $_ }
    $historyHashesBefore = @{}
    foreach ($path in $historyPaths) { $historyHashesBefore[$path] = (Get-FileHash -Algorithm SHA256 -LiteralPath $path).Hash }
    $safeHeaderEdit = Invoke-RestMethod "http://127.0.0.1:$port/api/records/purchases/$($createdPurchase.data.id)" -Method Put -ContentType 'application/json' -Body (@{ notes = 'safe header note' } | ConvertTo-Json) -WebSession $session
    if ($safeHeaderEdit.data.notes -ne 'safe header note') { throw 'Safe received-purchase notes-only edit was not preserved.' }
    $safeLineEdit = Invoke-RestMethod "http://127.0.0.1:$port/api/records/purchase-lines/$($createdLine.data.id)" -Method Put -ContentType 'application/json' -Body (@{ notes = 'safe line note' } | ConvertTo-Json) -WebSession $session
    if ($safeLineEdit.data.notes -ne 'safe line note') { throw 'Safe received-line notes-only edit was not preserved.' }
    foreach ($path in $historyPaths) {
        if ((Get-FileHash -Algorithm SHA256 -LiteralPath $path).Hash -ne $historyHashesBefore[$path]) {
            throw "Safe notes-only edit reconstructed received inventory history: $path"
        }
    }

    $removeBody = @{ sourceBalanceId = [string]$movedDestination.id; quantity = '1'; eventType = 'SMOKED'; notes = 'journal guard smoke test' } | ConvertTo-Json
    $removed = Invoke-RestMethod "http://127.0.0.1:$port/api/inventory/remove" -Method Post -ContentType 'application/json' -Body $removeBody -WebSession $session
    $lotAfterRemoval = @((Get-Content -Raw -LiteralPath (Join-Path $testDataRoot 'lots.json') | ConvertFrom-Json)) | Where-Object { $_.id -eq $linkedLot.id } | Select-Object -First 1
    $lotBalanceQuantity = @((Get-Content -Raw -LiteralPath (Join-Path $testDataRoot 'lot-location-balances.json') | ConvertFrom-Json) | Where-Object { $_.lotId -eq $linkedLot.id }) | Measure-Object -Property quantity -Sum
    if ($lotAfterRemoval.currentQuantity -ne $lotBalanceQuantity.Sum) { throw 'Lot currentQuantity did not reconcile to positive balances after removal.' }
    $journalBody = @{ rating = 8; notes = 'must remain linked' } | ConvertTo-Json
    $journal = Invoke-RestMethod "http://127.0.0.1:$port/api/inventory-events/$($removed.data.inventoryEventId)/smoking-journal" -Method Put -ContentType 'application/json' -Body $journalBody -WebSession $session
    if ($journal.data.journalEntry.inventoryEventId -ne $removed.data.inventoryEventId) { throw 'Smoking Journal entry did not link to the smoked event.' }
    Invoke-ExpectedApiError -Uri "http://127.0.0.1:$port/api/records/purchase-lines/$($createdLine.data.id)" -Method Delete -Session $session -Body $null -StatusCode 409 -ErrorCode 'RECEIVED_INVENTORY_IMMUTABLE' | Out-Null
    $journalAfterBlockedDelete = Invoke-RestMethod "http://127.0.0.1:$port/api/inventory-events/$($removed.data.inventoryEventId)/smoking-journal" -Method Get -WebSession $session
    if ($journalAfterBlockedDelete.data.journalEntry.inventoryEventId -ne $removed.data.inventoryEventId) { throw 'Blocked purchase-line deletion orphaned or removed its Smoking Journal entry.' }

    $integrityFixtureRoot = Join-Path $testRoot 'integrity-defects'
    [System.IO.Directory]::CreateDirectory($integrityFixtureRoot) | Out-Null
    $fixtureCollections = @{
        'catalog-cigars' = @(@{ id = 1; manufacturer = 'Fixture'; series = 'One' }, @{ id = 1; manufacturer = 'Fixture'; series = 'Duplicate' })
        'vendors' = @(@{ id = 1; name = 'Fixture Vendor' })
        'storage-locations' = @(@{ id = 1; name = 'Fixture Humidor' })
        'storage-sub-locations' = @(@{ id = 1; storageLocationId = 1; name = 'Fixture Section' })
        'purchases' = @(
            @{ id = 1; vendorId = 999; subtotal = $null; shipping = 0; exciseTax = 0; salesTax = 0; discount = -1; totalPaid = 1 },
            @{ id = 2; vendorId = 1; subtotal = 10; shipping = 0; exciseTax = 0; salesTax = 0; discount = 0; totalPaid = 5 }
        )
        'purchase-lines' = @(
            @{ id = 1; purchaseId = 1; catalogCigarId = 999; storageLocationId = 999; storageSubLocationId = 999; quantity = 1 },
            @{ id = 2; purchaseId = 2; catalogCigarId = 1; storageLocationId = 1; storageSubLocationId = 1; quantity = 5 }
        )
        'lots' = @(@{ id = 1; purchaseLineId = 2; purchaseId = 2; catalogCigarId = 1; initialQuantity = 5; currentQuantity = 99 })
        'lot-location-balances' = @(
            @{ id = 1; lotId = 1; purchaseLineId = 2; storageLocationId = 0; storageSubLocationId = $null; quantity = 2 },
            @{ id = 2; lotId = 1; purchaseLineId = 2; storageLocationId = 1; storageSubLocationId = 1; quantity = 1 }
        )
        'inventory-events' = @(
            @{ id = 1; eventType = 'purchase-receipt'; lotId = 1; catalogCigarId = 1; storageLocationId = 1; quantity = 5 },
            @{ id = 2; eventType = 'SMOKED'; lotId = 1; catalogCigarId = 999; fromStorageLocationId = 1; quantity = 1 },
            @{ id = 3; eventType = 'GIFTED'; lotId = 1; catalogCigarId = 1; fromStorageLocationId = 1; quantity = 1 },
            @{ id = 4; eventType = 'DISCARDED'; lotId = 1; catalogCigarId = 1; fromStorageLocationId = 1; quantity = 1 },
            @{ id = 5; eventType = 'move'; lotId = 1; catalogCigarId = 1; fromStorageLocationId = 1; fromStorageSubLocationId = 1; toStorageLocationId = 1; toStorageSubLocationId = 1; quantity = 1 }
        )
        'smoking-journal-entries' = @(@{ id = 1; inventoryEventId = 999; rating = 8 })
    }
    foreach ($entry in $fixtureCollections.GetEnumerator()) {
        $entry.Value | ConvertTo-Json -Depth 8 -AsArray | Set-Content -LiteralPath (Join-Path $integrityFixtureRoot ($entry.Key + '.json')) -Encoding UTF8
    }
    $fixtureCounters = @{
        'catalog-cigars' = 1; 'vendors' = 1; 'storage-locations' = 1; 'storage-sub-locations' = 1
        'purchases' = 1; 'purchase-lines' = 1; 'lots' = 1; 'lot-location-balances' = 1
        'inventory-events' = 1; 'smoking-journal-entries' = 1
    }
    $fixtureCounters | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $integrityFixtureRoot 'counters.json') -Encoding UTF8
    $fixtureHashesBefore = @{}
    Get-ChildItem -LiteralPath $integrityFixtureRoot -File | ForEach-Object { $fixtureHashesBefore[$_.Name] = (Get-FileHash -Algorithm SHA256 -LiteralPath $_.FullName).Hash }
    $powerShellExe = (Get-Process -Id $PID).Path
    $integrityChecker = Join-Path $repoRoot 'tools\check-data-integrity.ps1'
    $integrityOutLog = Join-Path $testRoot 'integrity.out.log'
    $integrityErrLog = Join-Path $testRoot 'integrity.err.log'
    $integrityProcess = Start-Process -FilePath $powerShellExe -ArgumentList @('-NoProfile', '-File', $integrityChecker, '-DataRoot', $integrityFixtureRoot) -WindowStyle Hidden -Wait -PassThru -RedirectStandardOutput $integrityOutLog -RedirectStandardError $integrityErrLog
    $integrityOutput = ((Get-Content -LiteralPath $integrityOutLog -Raw) + (Get-Content -LiteralPath $integrityErrLog -Raw))
    if ($integrityProcess.ExitCode -eq 0) { throw 'Integrity checker should return nonzero for critical fixture defects.' }
    foreach ($code in @(
        'POSITIVE_BALANCE_QUANTITY', 'RECEIPT_QUANTITY', 'SMOKED_QUANTITY', 'GIFTED_QUANTITY', 'DISCARDED_QUANTITY',
        'EXPECTED_CURRENT_QUANTITY', 'DISTINCT_LOT_COUNT', 'SPLIT_LOT_COUNT', 'LOT_CURRENT_MISMATCH', 'MISSING_CATALOG',
        'MISSING_VENDOR', 'MISSING_HUMIDOR', 'MISSING_SECTION', 'BALANCE_LOCATION_ZERO', 'ORPHAN_JOURNAL', 'DUPLICATE_ID',
        'COUNTER_NOT_AHEAD', 'SAME_LOCATION_MOVE', 'PURCHASE_TOTAL_MISMATCH', 'NEGATIVE_DISCOUNT', 'MISSING_SUBTOTAL'
    )) {
        if ($integrityOutput -notmatch [regex]::Escape("[$code]")) {
            Write-Host $integrityOutput
            throw "Integrity checker did not report fixture defect code: $code"
        }
    }
    Get-ChildItem -LiteralPath $integrityFixtureRoot -File | ForEach-Object {
        if ((Get-FileHash -Algorithm SHA256 -LiteralPath $_.FullName).Hash -ne $fixtureHashesBefore[$_.Name]) {
            throw "Integrity checker wrote to fixture file: $($_.Name)"
        }
    }
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
} catch {
    $testFailure = $_
    Write-Host 'Flat-file smoke test failed. PHP diagnostics follow.' -ForegroundColor Red
    if (Test-Path -LiteralPath $serverOutLog) { Get-Content -LiteralPath $serverOutLog | Write-Host }
    if (Test-Path -LiteralPath $serverErrLog) { Get-Content -LiteralPath $serverErrLog | Write-Host }
} finally {
    if ($process -and -not $process.HasExited) { Stop-Process -Id $process.Id -Force }
    $env:HUMIDORHQ_DATA_ROOT = $previousDataRoot
    try {
        Assert-RepositoryDataHashes -Expected $sourceDataHashes
    } catch {
        if ($null -eq $testFailure) {
            $testFailure = $_
        } else {
            Write-Host $_.Exception.Message -ForegroundColor Red
        }
    }
    if (Test-Path -LiteralPath $testRootFull -PathType Container) {
        Remove-Item -LiteralPath $testRootFull -Recurse -Force
    }
}

if ($null -ne $testFailure) { throw $testFailure }

Write-Host 'Flat-file smoke test passed.' -ForegroundColor Green

# Example Usage:
#   .\tests\flat-file-smoke.ps1

