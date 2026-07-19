# Filename: runtime-data-separation.ps1
# Revision : 1.1.0
# Description : Verifies in-application default runtime data and optional external override behavior.
# Author : Jason Lamb (with help from Codex CLI)
# Created Date : 2026-07-17
# Modified Date : 2026-07-19
# Changelog :
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

function Initialize-TestRuntime {
    param([string]$Destination)
    if (-not (Test-Path -LiteralPath $Destination -PathType Container)) {
        $null = New-Item -ItemType Directory -Path $Destination
    }
    Get-ChildItem -LiteralPath $seedDataRoot -Filter '*.json' -File | ForEach-Object {
        Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $Destination $_.Name)
    }
}

$repositoryHashesBefore = Get-DirectoryDataHashes $repositoryDataRoot
$seedHashesBefore = Get-DirectoryDataHashes $seedDataRoot
$previousDataRoot = $env:HUMIDORHQ_DATA_ROOT
try {
    $null = New-Item -ItemType Directory -Path $testRoot
    Install-CodeSnapshot $deploymentRoot
    Initialize-TestRuntime $runtimeRoot
    Initialize-TestRuntime $overrideRoot

    @([ordered]@{ id = 9001; purchaseDate = '2026-07-19'; status = 'pending'; subtotal = '12.34'; totalPaid = '12.34'; notes = 'runtime deployment sentinel' }) |
        ConvertTo-Json -Depth 5 -AsArray | Set-Content -LiteralPath (Join-Path $runtimeRoot 'purchases.json') -Encoding utf8
    $runtimeHashesBeforeDeployment = Get-DirectoryDataHashes $runtimeRoot

    $php = Get-PhpCommand
    $bootstrapPath = (Join-Path $deploymentRoot 'api\bootstrap.php').Replace('\', '/').Replace("'", "\'")
    Remove-Item Env:HUMIDORHQ_DATA_ROOT -ErrorAction SilentlyContinue
    $defaultOutput = (& $php -r "require '$bootstrapPath'; echo DATA_ROOT;") -join "`n"
    if ($LASTEXITCODE -ne 0 -or [System.IO.Path]::GetFullPath($defaultOutput.Trim()) -ne [System.IO.Path]::GetFullPath($runtimeRoot)) {
        throw 'Bootstrap did not default to APP_ROOT/data when HUMIDORHQ_DATA_ROOT was absent.'
    }

    $env:HUMIDORHQ_DATA_ROOT = $overrideRoot
    $overrideOutput = (& $php -r "require '$bootstrapPath'; echo DATA_ROOT;") -join "`n"
    if ($LASTEXITCODE -ne 0 -or [System.IO.Path]::GetFullPath($overrideOutput.Trim()) -ne [System.IO.Path]::GetFullPath($overrideRoot)) {
        throw 'Bootstrap did not retain the optional HUMIDORHQ_DATA_ROOT override.'
    }

    Install-CodeSnapshot $deploymentRoot
    Assert-HashesEqual $runtimeHashesBeforeDeployment (Get-DirectoryDataHashes $runtimeRoot) 'In-application runtime after code replacement'
    Assert-HashesEqual $repositoryHashesBefore (Get-DirectoryDataHashes $repositoryDataRoot) 'Repository runtime data'
    Assert-HashesEqual $seedHashesBefore (Get-DirectoryDataHashes $seedDataRoot) 'Tracked seed data'

    $denyRules = Get-Content -LiteralPath (Join-Path $runtimeRoot '.htaccess') -Raw
    if ($denyRules -notmatch 'Require all denied' -or $denyRules -notmatch 'Deny from all') {
        throw 'Deployed data/.htaccess does not deny direct browser access.'
    }

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
