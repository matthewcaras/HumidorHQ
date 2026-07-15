# Filename: flat-file-smoke.ps1
# Revision : 1.0.2
# Description : Verifies the flat-file HumidorHQ shell uses plain assets and PHP JSON sample data.
# Author : Jason Lamb (with help from Codex CLI)
# Created Date : 2026-07-15
# Modified Date : 2026-07-15
# Changelog :
# 1.0.2 quote PHP document root paths that contain spaces
# 1.0.1 use separate PHP server stdout and stderr logs
# 1.0.0 initial release

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$indexPath = Join-Path $repoRoot 'index.html'
$appJsPath = Join-Path $repoRoot 'public\assets\js\app.js'
$appCssPath = Join-Path $repoRoot 'public\assets\css\app.css'
$apiIndexPath = Join-Path $repoRoot 'api\index.php'

if (-not (Test-Path -LiteralPath $indexPath)) {
    throw 'index.html is missing.'
}

$index = Get-Content -LiteralPath $indexPath -Raw
if ($index -match 'src/main\.tsx|\.tsx|vite|react') {
    throw 'index.html still references React, TypeScript, or Vite assets.'
}
if ($index -notmatch 'public/assets/js/app\.js') {
    throw 'index.html does not load public/assets/js/app.js.'
}
if ($index -notmatch 'public/assets/css/app\.css') {
    throw 'index.html does not load public/assets/css/app.css.'
}

foreach ($path in @($appJsPath, $appCssPath)) {
    if (-not (Test-Path -LiteralPath $path)) {
        throw "Required flat asset is missing: $path"
    }
}


$trackedFiles = & git -C $repoRoot ls-files
$disallowedTrackedFiles = $trackedFiles | Where-Object {
    $_ -match '\.(ts|tsx)$' -or
    $_ -in @('package.json', 'package-lock.json', 'eslint.config.js', 'vite.config.ts', 'prisma.config.ts', 'tsconfig.json', 'tsconfig.app.json', 'tsconfig.node.json') -or
    $_ -match '^(src|server|prisma)/'
}
if ($disallowedTrackedFiles.Count -gt 0) {
    throw "Tracked compile/runtime files remain: $($disallowedTrackedFiles -join ', ')"
}
$apiIndex = Get-Content -LiteralPath $apiIndexPath -Raw
if ($apiIndex -notmatch '/sample-data') {
    throw 'PHP API is missing the /sample-data route.'
}

$php = Get-Command php -ErrorAction Stop
$port = 8765
$serverOutLog = Join-Path $env:TEMP 'humidorhq-flat-file-smoke-php.out.log'
$serverErrLog = Join-Path $env:TEMP 'humidorhq-flat-file-smoke-php.err.log'
$phpArgs = "-S 127.0.0.1:$port -t `"$repoRoot`""
$process = Start-Process -FilePath $php.Source -ArgumentList $phpArgs -WorkingDirectory $repoRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput $serverOutLog -RedirectStandardError $serverErrLog
try {
    Start-Sleep -Milliseconds 700
    $health = Invoke-RestMethod "http://127.0.0.1:$port/api/health" -Method Get
    if ($health.data.status -ne 'ok') {
        throw 'PHP health endpoint did not return ok.'
    }

    $sample = Invoke-RestMethod "http://127.0.0.1:$port/api/sample-data" -Method Get
    if ($null -eq $sample.data.collections) {
        throw 'Sample-data endpoint did not return collection summaries.'
    }
    foreach ($name in @('catalog-cigars', 'vendors', 'storage-locations', 'inventory-events')) {
        if (-not $sample.data.collections.PSObject.Properties.Name.Contains($name)) {
            throw "Sample-data endpoint is missing $name."
        }
    }
} finally {
    if ($process -and -not $process.HasExited) {
        Stop-Process -Id $process.Id -Force
    }
}

Write-Host 'Flat-file smoke test passed.' -ForegroundColor Green

# Example Usage:
#   .\tests\flat-file-smoke.ps1

