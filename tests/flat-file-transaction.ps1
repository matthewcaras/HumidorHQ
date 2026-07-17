# Filename: flat-file-transaction.ps1
# Revision : 1.0.0
# Description : Verifies serialized JSON writes, multi-file rollback, and interrupted transaction recovery.
# Author : Jason Lamb (with help from Codex CLI)
# Created Date : 2026-07-17
# Modified Date : 2026-07-17
# Changelog :
# 1.0.0 initial isolated transaction concurrency, rollback, and recovery coverage

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$seedRoot = Join-Path $repoRoot 'seed-data'
$testRoot = Join-Path ([System.IO.Path]::GetTempPath()) ('humidorhq-transaction-' + [guid]::NewGuid().ToString('N'))
$dataRoot = Join-Path $testRoot 'runtime'
$workerPath = Join-Path $repoRoot 'tests\transaction-worker.php'
$testPassed = $false

function Get-PhpCommand {
    $command = Get-Command php -ErrorAction SilentlyContinue
    if ($command) { return $command.Source }
    $candidates = @(
        (Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Packages\PHP.PHP.8.5_Microsoft.Winget.Source_8wekyb3d8bbwe\php.exe'),
        (Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Packages\PHP.PHP.8.4_Microsoft.Winget.Source_8wekyb3d8bbwe\php.exe'),
        (Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Packages\PHP.PHP.8.3_Microsoft.Winget.Source_8wekyb3d8bbwe\php.exe'),
        (Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Packages\PHP.PHP.8.2_Microsoft.Winget.Source_8wekyb3d8bbwe\php.exe'),
        'C:\php\php.exe'
    )
    $path = $candidates | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
    if (-not $path) { throw 'php.exe was not found.' }
    return $path
}

function Get-ProtectedHashes {
    return @{
        counters = (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $dataRoot 'counters.json')).Hash
        vendors = (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $dataRoot 'vendors.json')).Hash
    }
}

function Assert-ProtectedHashes {
    param([hashtable]$Expected, [string]$Context)
    $actual = Get-ProtectedHashes
    foreach ($name in $Expected.Keys) {
        if ($actual[$name] -ne $Expected[$name]) { throw "$Context changed $name.json." }
    }
}

function Start-Worker {
    param(
        [string]$Php,
        [string]$Action,
        [string]$Name,
        [int]$Index
    )
    $stdout = Join-Path $testRoot "worker-$Index.out.log"
    $stderr = Join-Path $testRoot "worker-$Index.err.log"
    $process = Start-Process -FilePath $Php -ArgumentList @($workerPath, $Action, $Name) -WorkingDirectory $repoRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput $stdout -RedirectStandardError $stderr
    return [pscustomobject]@{ Process = $process; Stdout = $stdout; Stderr = $stderr }
}

$previousRoot = $env:HUMIDORHQ_DATA_ROOT
$previousMode = $env:HUMIDORHQ_TEST_MODE
$previousFailure = $env:HUMIDORHQ_TEST_FAIL_TRANSACTION_AFTER_REPLACE
$previousCrash = $env:HUMIDORHQ_TEST_CRASH_TRANSACTION_AFTER_REPLACE
try {
    New-Item -ItemType Directory -Path $dataRoot -Force | Out-Null
    Get-ChildItem -LiteralPath $seedRoot -Filter '*.json' -File | ForEach-Object {
        Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $dataRoot $_.Name)
    }
    $php = Get-PhpCommand
    $env:HUMIDORHQ_DATA_ROOT = $dataRoot
    $env:HUMIDORHQ_TEST_MODE = '1'

    $workers = @()
    1..12 | ForEach-Object { $workers += Start-Worker -Php $php -Action 'add' -Name "Concurrent Vendor $_" -Index $_ }
    foreach ($worker in $workers) {
        $worker.Process.WaitForExit()
        if ($worker.Process.ExitCode -ne 0) {
            $diagnostic = Get-Content -Raw -LiteralPath $worker.Stderr
            throw "Concurrent worker failed with exit code $($worker.Process.ExitCode): $diagnostic"
        }
    }
    $vendors = @(Get-Content -Raw -LiteralPath (Join-Path $dataRoot 'vendors.json') | ConvertFrom-Json)
    $ids = @($vendors | ForEach-Object { [int]$_.id } | Sort-Object -Unique)
    $counters = Get-Content -Raw -LiteralPath (Join-Path $dataRoot 'counters.json') | ConvertFrom-Json
    if ($vendors.Count -ne 12 -or $ids.Count -ne 12 -or [int]$counters.vendors -ne 13) {
        throw 'Concurrent transactions lost a record or allocated a duplicate ID.'
    }
    Write-Output '[PASS] ConcurrentWritesSerialized'

    $rollbackHashes = Get-ProtectedHashes
    $env:HUMIDORHQ_TEST_FAIL_TRANSACTION_AFTER_REPLACE = '1'
    $rollbackWorker = Start-Worker -Php $php -Action 'failure' -Name 'Rollback Vendor' -Index 20
    $rollbackWorker.Process.WaitForExit()
    if ($rollbackWorker.Process.ExitCode -ne 0) { throw 'Injected transaction failure was not handled.' }
    Remove-Item Env:HUMIDORHQ_TEST_FAIL_TRANSACTION_AFTER_REPLACE -ErrorAction SilentlyContinue
    Assert-ProtectedHashes -Expected $rollbackHashes -Context 'Injected failure rollback'
    if (Test-Path -LiteralPath (Join-Path $dataRoot '.humidorhq-transaction.json')) { throw 'Rollback left a transaction journal behind.' }
    Write-Output '[PASS] MultiFileFailureRolledBack'

    $recoveryHashes = Get-ProtectedHashes
    $env:HUMIDORHQ_TEST_CRASH_TRANSACTION_AFTER_REPLACE = '1'
    $crashWorker = Start-Worker -Php $php -Action 'add' -Name 'Interrupted Vendor' -Index 30
    $crashWorker.Process.WaitForExit()
    if ($crashWorker.Process.ExitCode -ne 86) { throw "Expected simulated crash exit 86, got $($crashWorker.Process.ExitCode)." }
    Remove-Item Env:HUMIDORHQ_TEST_CRASH_TRANSACTION_AFTER_REPLACE -ErrorAction SilentlyContinue
    if (-not (Test-Path -LiteralPath (Join-Path $dataRoot '.humidorhq-transaction.json'))) { throw 'Simulated crash did not leave a recovery journal.' }
    $recoveryWorker = Start-Worker -Php $php -Action 'recover' -Name 'Recovery' -Index 31
    $recoveryWorker.Process.WaitForExit()
    if ($recoveryWorker.Process.ExitCode -ne 0) { throw 'Startup transaction recovery failed.' }
    Assert-ProtectedHashes -Expected $recoveryHashes -Context 'Interrupted transaction recovery'
    if (Test-Path -LiteralPath (Join-Path $dataRoot '.humidorhq-transaction.json')) { throw 'Recovery did not clear the transaction journal.' }
    Write-Output '[PASS] InterruptedTransactionRecovered'

    $testPassed = $true
    Write-Output 'Flat-file transaction test passed.'
} finally {
    $env:HUMIDORHQ_DATA_ROOT = $previousRoot
    $env:HUMIDORHQ_TEST_MODE = $previousMode
    $env:HUMIDORHQ_TEST_FAIL_TRANSACTION_AFTER_REPLACE = $previousFailure
    $env:HUMIDORHQ_TEST_CRASH_TRANSACTION_AFTER_REPLACE = $previousCrash
    if ($testPassed -and (Test-Path -LiteralPath $testRoot)) {
        Remove-Item -LiteralPath $testRoot -Recurse -Force
    } elseif (Test-Path -LiteralPath $testRoot) {
        Write-Warning "Transaction test diagnostics preserved at $testRoot"
    }
}

# Example Usage:
#   .\tests\flat-file-transaction.ps1
