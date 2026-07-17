# Filename: runtime-data-separation.ps1
# Revision : 1.0.0
# Description : Verifies external runtime initialization and proves code deployment cannot alter runtime JSON.
# Author : Jason Lamb (with help from Codex CLI)
# Created Date : 2026-07-17
# Modified Date : 2026-07-17
# Changelog :
# 1.0.0 initial isolated runtime-root, startup validation, and deployment-preservation coverage

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$repositoryDataRoot = [System.IO.Path]::GetFullPath((Join-Path $repoRoot 'data'))
$seedDataRoot = [System.IO.Path]::GetFullPath((Join-Path $repoRoot 'seed-data'))
$testRoot = Join-Path ([System.IO.Path]::GetTempPath()) ('humidorhq-runtime-separation-' + [guid]::NewGuid().ToString('N'))
$runtimeRoot = Join-Path $testRoot 'external-runtime'
$manifestRoot = Join-Path $testRoot 'copy-manifests'
$deploymentRoot = Join-Path $testRoot 'deployed-code'
$testRootFull = [System.IO.Path]::GetFullPath($testRoot)
$systemTempFull = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
if (-not $testRootFull.StartsWith($systemTempFull, [System.StringComparison]::OrdinalIgnoreCase) -or $testRootFull -eq $systemTempFull) {
    throw 'Runtime separation test root did not resolve safely beneath the system temporary directory.'
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
    if (-not $path) { throw 'PHP was not found for runtime separation verification.' }
    return $path
}

function Install-CodeSnapshot {
    param([string]$Destination)
    if (Test-Path -LiteralPath $Destination) {
        $resolved = [System.IO.Path]::GetFullPath($Destination)
        if (-not $resolved.StartsWith($testRootFull + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) {
            throw 'Deployment test destination escaped the temporary test root.'
        }
        Remove-Item -LiteralPath $resolved -Recurse -Force
    }
    $null = New-Item -ItemType Directory -Path $Destination
    foreach ($directory in @('api', 'public', 'seed-data')) {
        Copy-Item -LiteralPath (Join-Path $repoRoot $directory) -Destination (Join-Path $Destination $directory) -Recurse
    }
    foreach ($file in @('index.html', 'README.md', 'CHANGELOG.md')) {
        Copy-Item -LiteralPath (Join-Path $repoRoot $file) -Destination (Join-Path $Destination $file)
    }
    if (Test-Path -LiteralPath (Join-Path $Destination 'data')) {
        throw 'Simulated code deployment unexpectedly included repository runtime data.'
    }
}

$repositoryHashesBefore = Get-DirectoryDataHashes $repositoryDataRoot
$seedHashesBefore = Get-DirectoryDataHashes $seedDataRoot
$previousDataRoot = $env:HUMIDORHQ_DATA_ROOT
try {
    $null = New-Item -ItemType Directory -Path $testRoot
    & (Join-Path $repoRoot 'tools\copy-runtime-data.ps1') `
        -SourceRoot $seedDataRoot `
        -DestinationRoot $runtimeRoot `
        -ManifestRoot $manifestRoot
    if (-not $? -or (Test-Path -LiteralPath $runtimeRoot) -or (Test-Path -LiteralPath $manifestRoot)) {
        throw 'Runtime copy dry run created files or directories.'
    }
    & (Join-Path $repoRoot 'tools\copy-runtime-data.ps1') `
        -SourceRoot $seedDataRoot `
        -DestinationRoot $runtimeRoot `
        -ManifestRoot $manifestRoot `
        -Apply `
        -Confirmation 'COPY-HUMIDORHQ-RUNTIME-DATA'
    if (-not $?) { throw 'Seed-to-runtime copy failed.' }

    $purchasesPath = Join-Path $runtimeRoot 'purchases.json'
    @([ordered]@{
        id = 9001
        purchaseDate = '2026-07-17'
        status = 'pending'
        subtotal = '12.34'
        shipping = '0.00'
        exciseTax = '0.00'
        salesTax = '0.00'
        discount = '0.00'
        totalPaid = '12.34'
        notes = 'runtime deployment sentinel'
    }) | ConvertTo-Json -Depth 5 -AsArray | Set-Content -LiteralPath $purchasesPath -Encoding utf8
    $runtimeHashesBeforeDeployment = Get-DirectoryDataHashes $runtimeRoot

    $overwriteRejected = $false
    try {
        & (Join-Path $repoRoot 'tools\copy-runtime-data.ps1') `
            -SourceRoot $seedDataRoot `
            -DestinationRoot $runtimeRoot `
            -ManifestRoot $manifestRoot `
            -Apply `
            -Confirmation 'COPY-HUMIDORHQ-RUNTIME-DATA'
    } catch {
        if ($_.Exception.Message -notmatch 'never overwrites runtime data') { throw }
        $overwriteRejected = $true
    }
    if (-not $overwriteRejected) { throw 'Runtime copy did not reject the nonempty destination.' }
    Assert-HashesEqual $runtimeHashesBeforeDeployment (Get-DirectoryDataHashes $runtimeRoot) 'Runtime after rejected overwrite'

    $php = Get-PhpCommand
    $env:HUMIDORHQ_DATA_ROOT = $runtimeRoot
    $bootstrapPath = (Join-Path $repoRoot 'api\bootstrap.php').Replace('\\', '/').Replace("'", "\\'")
    $bootstrapOutput = (& $php -r "require '$bootstrapPath'; echo DATA_ROOT;") -join "`n"
    if ($LASTEXITCODE -ne 0 -or [System.IO.Path]::GetFullPath($bootstrapOutput.Trim()) -ne [System.IO.Path]::GetFullPath($runtimeRoot)) {
        throw 'Bootstrap did not accept the valid external runtime root.'
    }

    Install-CodeSnapshot $deploymentRoot
    Assert-HashesEqual $runtimeHashesBeforeDeployment (Get-DirectoryDataHashes $runtimeRoot) 'External runtime after first code deployment'
    Set-Content -LiteralPath (Join-Path $deploymentRoot 'deployment-version.txt') -Value 'replacement build' -Encoding utf8
    Install-CodeSnapshot $deploymentRoot
    Assert-HashesEqual $runtimeHashesBeforeDeployment (Get-DirectoryDataHashes $runtimeRoot) 'External runtime after replacement code deployment'
    Assert-HashesEqual $repositoryHashesBefore (Get-DirectoryDataHashes $repositoryDataRoot) 'Repository legacy data'
    Assert-HashesEqual $seedHashesBefore (Get-DirectoryDataHashes $seedDataRoot) 'Tracked seed data'

    if (@(Get-ChildItem -LiteralPath $manifestRoot -Filter 'humidorhq-runtime-copy-*.json' -File).Count -ne 1) {
        throw 'Runtime copy did not produce exactly one external hash manifest.'
    }
    Write-Output '[PASS] ValidExternalRuntimeAccepted'
    Write-Output '[PASS] DryRunAndOverwriteGuards'
    Write-Output '[PASS] DeploymentExcludedRepositoryData'
    Write-Output '[PASS] CodeReplacementPreservedRuntimeHashes'
    Write-Output '[PASS] RepositoryAndSeedHashesUnchanged'
} finally {
    $env:HUMIDORHQ_DATA_ROOT = $previousDataRoot
    if (Test-Path -LiteralPath $testRootFull) { Remove-Item -LiteralPath $testRootFull -Recurse -Force }
}

Write-Output 'Runtime data separation test passed.'

# Example Usage:
#   .\tests\runtime-data-separation.ps1
