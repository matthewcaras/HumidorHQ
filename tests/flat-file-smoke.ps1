# Filename: flat-file-smoke.ps1
# Revision : 1.4.1
# Description : Verifies the flat-file HumidorHQ shell, app metadata, auth, audit logging, changelog access, and PHP JSON sample data.
# Author : Jason Lamb (with help from Codex CLI)
# Created Date : 2026-07-15
# Modified Date : 2026-07-15 00:36 ET
# Changelog :
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
$authPlaceholderPath = Join-Path $repoRoot 'data\auth-users.placeholder'
$auditPlaceholderPath = Join-Path $repoRoot 'data\audit-log.placeholder'
$authUsersPath = Join-Path $repoRoot 'data\auth-users.json'
$authUsersBackupPath = Join-Path $env:TEMP 'humidorhq-auth-users.backup.json'
$auditLogPath = Join-Path $repoRoot 'data\audit-log.jsonl'
$authUsersHadFile = Test-Path -LiteralPath $authUsersPath

if (-not (Test-Path -LiteralPath $indexPath)) { throw 'index.html is missing.' }

$index = Get-Content -LiteralPath $indexPath -Raw
if ($index -match 'src/main\.tsx|\.tsx|vite|react') { throw 'index.html still references React, TypeScript, or Vite assets.' }
if ($index -notmatch 'public/assets/js/app\.js') { throw 'index.html does not load public/assets/js/app.js.' }
if ($index -notmatch 'public/assets/css/app\.css') { throw 'index.html does not load public/assets/css/app.css.' }

foreach ($path in @($appJsPath, $appCssPath, $authPlaceholderPath, $auditPlaceholderPath)) {
    if (-not (Test-Path -LiteralPath $path)) { throw "Required flat-file artifact is missing: $path" }
}

$appJs = Get-Content -LiteralPath $appJsPath -Raw
if ($appJs -match 'queued for plain JavaScript conversion') { throw 'Plain JavaScript app still shows queued conversion placeholder text.' }
if ($appJs -notmatch 'project-meta') { throw 'Plain JavaScript app is missing project metadata rendering.' }
if ($appJs -notmatch 'function render\(\)[\s\S]*renderProjectMeta\(\)') { throw 'Plain JavaScript app render path does not update project metadata.' }
foreach ($menuText in @('Audit', 'Changelog')) {
    if ($appJs -notmatch $menuText) { throw "Plain JavaScript app is missing $menuText menu link." }
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
foreach ($route in @('/sample-data', '/login', '/audit', '/changelog', '/app-meta')) {
    if ($apiIndex -notmatch [regex]::Escape($route)) { throw "PHP API is missing the $route route." }
}

$php = Get-Command php -ErrorAction Stop
$hash = & $php.Source -r "echo password_hash('testpass', PASSWORD_DEFAULT);"
if (-not $hash) { throw 'Could not generate password hash for auth smoke test.' }

if ($authUsersHadFile) { Copy-Item -LiteralPath $authUsersPath -Destination $authUsersBackupPath -Force }
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
    foreach ($name in @('catalog-cigars', 'vendors', 'storage-locations', 'inventory-events')) {
        if (-not $sample.data.collections.PSObject.Properties.Name.Contains($name)) { throw "Sample-data endpoint is missing $name." }
    }

    $pageAuditBody = @{ page = 'Dashboard'; action = 'view' } | ConvertTo-Json
    $pageAudit = Invoke-RestMethod "http://127.0.0.1:$port/api/audit/page" -Method Post -ContentType 'application/json' -Body $pageAuditBody -WebSession $session
    if ($pageAudit.data.logged -ne $true) { throw 'Page audit endpoint did not confirm logging.' }

    $audit = Invoke-RestMethod "http://127.0.0.1:$port/api/audit" -Method Get -WebSession $session
    if ($audit.data.records.Count -lt 2) { throw 'Audit endpoint did not return expected activity records.' }
    $dashboardRecord = $audit.data.records | Where-Object { $_.user -eq 'testuser' -and $_.page -eq 'Dashboard' -and $_.action -eq 'view' } | Select-Object -First 1
    if (-not $dashboardRecord) { throw 'Audit log is missing the Dashboard page view record.' }

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
    Remove-Item -LiteralPath $auditLogPath -Force -ErrorAction SilentlyContinue
}

Write-Host 'Flat-file smoke test passed.' -ForegroundColor Green

# Example Usage:
#   .\tests\flat-file-smoke.ps1



