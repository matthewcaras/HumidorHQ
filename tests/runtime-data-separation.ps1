# Filename: runtime-data-separation.ps1
# Revision : 1.2.0
# Description : Verifies create-only first-run initialization, default runtime data, and optional overrides.
# Author : Jason Lamb (with help from Codex CLI)
# Created Date : 2026-07-17
# Modified Date : 2026-07-19
# Changelog :
# 1.2.0 verify atomic first-run seeding, secure auth setup failure, idempotency, and existing-file preservation
# 1.1.0 verify APP_ROOT/data default, optional override, access denial, and code-only deployment preservation
# 1.0.0 initial isolated runtime-root, startup validation, and deployment-preservation coverage

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$repositoryDataRoot = [System.IO.Path]::GetFullPath((Join-Path $repoRoot 'data'))
$seedDataRoot = [System.IO.Path]::GetFullPath((Join-Path $repoRoot 'seed-data'))
$testRoot = Join-Path ([System.IO.Path]::GetTempPath()) ('humidorhq-runtime-location-' + [guid]::NewGuid().ToString('N'))
$deploymentRoot = Join-Path $testRoot 'deployed-code'
$runtimeRoot = Join-Path $deploymentRoot 'data'
$overrideRoot = Join-Path $testRoot 'optional-override'
$createdRoot = Join-Path $testRoot 'created-runtime'
$testRootFull = [System.IO.Path]::GetFullPath($testRoot)
$systemTempFull = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
if (-not $testRootFull.StartsWith($systemTempFull, [System.StringComparison]::OrdinalIgnoreCase) -or $testRootFull -eq $systemTempFull) {
    throw 'Runtime location test root did not resolve safely beneath the system temporary directory.'
}

function Get-DirectoryDataHashes {
    param([string]$Root)
    $hashes = @{}
    if (-not (Test-Path -LiteralPath $Root -PathType Container)) { return $hashes }
    Get-ChildItem -LiteralPath $Root -File | Where-Object { $_.Extension -in @('.json', '.jsonl') } | ForEach-Object {
        $hashes[$_.Name] = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash
    }
    return $hashes
}

function Assert-HashesEqual {
    param([hashtable]$Expected, [hashtable]$Actual, [string]$Description)
    if ($Expected.Count -ne $Actual.Count) { throw "$Description file count changed." }
    foreach ($name in $Expected.Keys) {
        if (-not $Actual.ContainsKey($name) -or $Expected[$name] -ne $Actual[$name]) {
            throw "$Description changed: $name"
        }
    }
}

function Get-PhpCommand {
    $command = Get-Command php -ErrorAction SilentlyContinue
    if ($command) { return $command.Source }
    $candidates = @(
        (Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Packages\PHP.PHP.8.5_Microsoft.Winget.Source_8wekyb3d8bbwe\php.exe'),
        (Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Packages\PHP.PHP.8.4_Microsoft.Winget.Source_8wekyb3d8bbwe\php.exe'),
        (Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Packages\PHP.PHP.8.3_Microsoft.Winget.Source_8wekyb3d8bbwe\php.exe'),
        'C:\php\php.exe'
    )
    $path = $candidates | Where-Object { $_ -and (Test-Path -LiteralPath $_ -PathType Leaf) } | Select-Object -First 1
    if (-not $path) { throw 'PHP was not found for runtime location verification.' }
    return $path
}

function Install-CodeSnapshot {
    param([string]$Destination)
    if (-not (Test-Path -LiteralPath $Destination -PathType Container)) {
        $null = New-Item -ItemType Directory -Path $Destination
    }
    foreach ($directory in @('api', 'public', 'seed-data')) {
        $target = Join-Path $Destination $directory
        if (Test-Path -LiteralPath $target) { Remove-Item -LiteralPath $target -Recurse -Force }
        Copy-Item -LiteralPath (Join-Path $repoRoot $directory) -Destination $target -Recurse
    }
    foreach ($file in @('index.html', 'README.md', 'CHANGELOG.md')) {
        Copy-Item -LiteralPath (Join-Path $repoRoot $file) -Destination (Join-Path $Destination $file) -Force
    }
    $dataDirectory = Join-Path $Destination 'data'
    if (-not (Test-Path -LiteralPath $dataDirectory -PathType Container)) {
        $null = New-Item -ItemType Directory -Path $dataDirectory
    }
    Copy-Item -LiteralPath (Join-Path $repositoryDataRoot '.htaccess') -Destination (Join-Path $dataDirectory '.htaccess') -Force
}

$repositoryHashesBefore = Get-DirectoryDataHashes $repositoryDataRoot
$seedHashesBefore = Get-DirectoryDataHashes $seedDataRoot
$runtimeFilenames = @(
    'catalog-cigars.json', 'counters.json', 'inventory-events.json', 'lot-location-balances.json',
    'lots.json', 'purchase-lines.json', 'purchases.json', 'smoking-journal-entries.json',
    'storage-locations.json', 'storage-sub-locations.json', 'vendors.json'
)
foreach ($filename in $runtimeFilenames) {
    $trackedTemplate = (& git -C $repoRoot ls-files -- "seed-data/$filename") -join ''
    if ($LASTEXITCODE -ne 0 -or $trackedTemplate -ne "seed-data/$filename") {
        throw "Required runtime seed template is not tracked: $filename"
    }
}
$previousDataRoot = $env:HUMIDORHQ_DATA_ROOT
try {
    $null = New-Item -ItemType Directory -Path $testRoot
    Install-CodeSnapshot $deploymentRoot

    $php = Get-PhpCommand
    $bootstrapPath = (Join-Path $deploymentRoot 'api\bootstrap.php').Replace('\', '/').Replace("'", "\'")
    Remove-Item Env:HUMIDORHQ_DATA_ROOT -ErrorAction SilentlyContinue

    $firstRunOutput = (& $php -r "require '$bootstrapPath';" 2>&1) -join "`n"
    if ($LASTEXITCODE -eq 0 -or $firstRunOutput -notmatch 'AUTH_USERS_SETUP_REQUIRED') {
        throw 'First-run initialization did not stop with the secure auth-users setup message.'
    }
    foreach ($filename in $runtimeFilenames) {
        $runtimePath = Join-Path $runtimeRoot $filename
        $seedPath = Join-Path $seedDataRoot $filename
        if (-not (Test-Path -LiteralPath $runtimePath -PathType Leaf)) { throw "First-run initialization missed $filename." }
        if ((Get-FileHash -LiteralPath $runtimePath -Algorithm SHA256).Hash -ne (Get-FileHash -LiteralPath $seedPath -Algorithm SHA256).Hash) {
            throw "Initialized runtime file does not match its validated seed: $filename"
        }
        $null = Get-Content -LiteralPath $runtimePath -Raw | ConvertFrom-Json
    }
    if (-not (Test-Path -LiteralPath (Join-Path $runtimeRoot 'audit-log.jsonl') -PathType Leaf)) {
        throw 'First-run initialization did not create audit-log.jsonl.'
    }
    if ((Get-Item -LiteralPath (Join-Path $runtimeRoot 'audit-log.jsonl')).Length -ne 0) {
        throw 'First-run initialization did not create an empty audit log.'
    }
    $defaultDenyRules = Get-Content -LiteralPath (Join-Path $runtimeRoot '.htaccess') -Raw
    if ($defaultDenyRules -notmatch 'Require all denied' -or $defaultDenyRules -notmatch 'Deny from all') {
        throw 'First-run runtime directory is missing direct-access denial rules.'
    }
    [System.IO.File]::WriteAllText((Join-Path $runtimeRoot 'auth-users.json'), "[]`n", [System.Text.UTF8Encoding]::new($false))
    $runtimeHashesAfterFirstRun = Get-DirectoryDataHashes $runtimeRoot

    $defaultOutput = (& $php -r "require '$bootstrapPath'; echo DATA_ROOT;") -join "`n"
    if ($LASTEXITCODE -ne 0 -or [System.IO.Path]::GetFullPath($defaultOutput.Trim()) -ne [System.IO.Path]::GetFullPath($runtimeRoot)) {
        throw 'Bootstrap did not default to APP_ROOT/data after secure auth setup.'
    }
    Assert-HashesEqual $runtimeHashesAfterFirstRun (Get-DirectoryDataHashes $runtimeRoot) 'Second default bootstrap'

    $null = New-Item -ItemType Directory -Path $overrideRoot
    [System.IO.File]::WriteAllText((Join-Path $overrideRoot 'auth-users.json'), "[]`n", [System.Text.UTF8Encoding]::new($false))
    $preservedVendor = "[{`"id`":77,`"name`":`"Preserved Vendor`"}]`n"
    [System.IO.File]::WriteAllText((Join-Path $overrideRoot 'vendors.json'), $preservedVendor, [System.Text.UTF8Encoding]::new($false))
    $vendorHashBefore = (Get-FileHash -LiteralPath (Join-Path $overrideRoot 'vendors.json') -Algorithm SHA256).Hash
    $env:HUMIDORHQ_DATA_ROOT = $overrideRoot
    $overrideOutput = (& $php -r "require '$bootstrapPath'; echo DATA_ROOT;") -join "`n"
    if ($LASTEXITCODE -ne 0 -or [System.IO.Path]::GetFullPath($overrideOutput.Trim()) -ne [System.IO.Path]::GetFullPath($overrideRoot)) {
        throw 'Bootstrap did not retain the optional HUMIDORHQ_DATA_ROOT override.'
    }
    if ((Get-FileHash -LiteralPath (Join-Path $overrideRoot 'vendors.json') -Algorithm SHA256).Hash -ne $vendorHashBefore) {
        throw 'Initialization overwrote an existing runtime file.'
    }
    $overrideDenyRules = Get-Content -LiteralPath (Join-Path $overrideRoot '.htaccess') -Raw
    if ($overrideDenyRules -notmatch 'Require all denied' -or $overrideDenyRules -notmatch 'Deny from all') {
        throw 'Optional runtime directory is missing direct-access denial rules.'
    }
    $overrideHashesAfterFirstRun = Get-DirectoryDataHashes $overrideRoot
    $null = & $php -r "require '$bootstrapPath';"
    if ($LASTEXITCODE -ne 0) { throw 'Second optional-override bootstrap failed.' }
    Assert-HashesEqual $overrideHashesAfterFirstRun (Get-DirectoryDataHashes $overrideRoot) 'Second optional-override bootstrap'

    $env:HUMIDORHQ_DATA_ROOT = $createdRoot
    $createdRootOutput = (& $php -r "require '$bootstrapPath';" 2>&1) -join "`n"
    if ($LASTEXITCODE -eq 0 -or $createdRootOutput -notmatch 'AUTH_USERS_SETUP_REQUIRED' -or
        -not (Test-Path -LiteralPath $createdRoot -PathType Container)) {
        throw 'Bootstrap did not create and initialize a missing runtime directory safely.'
    }
    foreach ($filename in $runtimeFilenames) {
        if (-not (Test-Path -LiteralPath (Join-Path $createdRoot $filename) -PathType Leaf)) {
            throw "Created runtime directory is missing $filename."
        }
    }

    Install-CodeSnapshot $deploymentRoot
    Assert-HashesEqual $runtimeHashesAfterFirstRun (Get-DirectoryDataHashes $runtimeRoot) 'In-application runtime after code replacement'
    Assert-HashesEqual $repositoryHashesBefore (Get-DirectoryDataHashes $repositoryDataRoot) 'Repository runtime data'
    Assert-HashesEqual $seedHashesBefore (Get-DirectoryDataHashes $seedDataRoot) 'Tracked seed data'

    $denyRules = Get-Content -LiteralPath (Join-Path $runtimeRoot '.htaccess') -Raw
    if ($denyRules -notmatch 'Require all denied' -or $denyRules -notmatch 'Deny from all') {
        throw 'Deployed data/.htaccess does not deny direct browser access.'
    }

    Write-Output '[PASS] EmptyRuntimeInitializedFromTrackedSeeds'
    Write-Output '[PASS] MissingAuthRequiresSecureSetup'
    Write-Output '[PASS] SecondBootstrapIsIdempotent'
    Write-Output '[PASS] ExistingRuntimeFilesPreservedByteForByte'
    Write-Output '[PASS] MissingRuntimeDirectoryCreatedSafely'
    Write-Output '[PASS] RepositoryDataDefaultAccepted'
    Write-Output '[PASS] OptionalOverrideAccepted'
    Write-Output '[PASS] CodeReplacementPreservedRuntimeHashes'
    Write-Output '[PASS] DataHtaccessDeniesDirectAccess'
    Write-Output '[PASS] RepositoryAndSeedHashesUnchanged'
} finally {
    $env:HUMIDORHQ_DATA_ROOT = $previousDataRoot
    if (Test-Path -LiteralPath $testRootFull) { Remove-Item -LiteralPath $testRootFull -Recurse -Force }
}

Write-Output 'Runtime data location test passed.'

# Example Usage:
#   .\tests\runtime-data-separation.ps1
