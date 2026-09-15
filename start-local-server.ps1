# Filename: start-local-server.ps1
# Revision : 1.3.2
# Description : Validates runtime data, starts the local PHP server, and opens HumidorHQ in Chrome.
# Created Date : 2026-07-15
# Modified Date : 2026-07-20
# Changelog :
# 1.3.2 clear the OneDrive read-only attribute on the runtime data directory so PHP does not abort with DATA_ROOT_NOT_WRITABLE
# 1.3.1 quote the PHP docroot so repository paths containing spaces start correctly, and poll for the listener with a clearer failure message
# 1.3.0 default runtime data to the repository data directory while retaining an optional override
# 1.2.0 require and validate an external HUMIDORHQ_DATA_ROOT before starting PHP
# 1.1.1 look for PHP in standard winget install folders when PATH has not refreshed yet
# 1.1.0 open the local HumidorHQ URL in Chrome after confirming the server is listening
# 1.0.1 use netstat for listener checks because Get-NetTCPConnection can hang on some Windows sessions
# 1.0.0 initial release

param(
    [int]$Port = 8000,
    [string]$HostName = '127.0.0.1',
    [string]$DataRoot
)

$ErrorActionPreference = 'Stop'

function Get-PhpCommand {
    $phpCommand = Get-Command php -ErrorAction SilentlyContinue
    if ($phpCommand) {
        return $phpCommand
    }

    $candidatePaths = @(
        (Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Packages\PHP.PHP.8.5_Microsoft.Winget.Source_8wekyb3d8bbwe\php.exe'),
        (Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Packages\PHP.PHP.8.4_Microsoft.Winget.Source_8wekyb3d8bbwe\php.exe'),
        (Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Packages\PHP.PHP.8.3_Microsoft.Winget.Source_8wekyb3d8bbwe\php.exe'),
        (Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Packages\PHP.PHP.8.2_Microsoft.Winget.Source_8wekyb3d8bbwe\php.exe'),
        (Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Packages\PHP.PHP.8.1_Microsoft.Winget.Source_8wekyb3d8bbwe\php.exe'),
        'C:\php\php.exe'
    )

    $phpPath = $candidatePaths | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -First 1
    if (-not $phpPath) {
        throw 'PHP was not found on PATH or in the standard winget install locations.'
    }

    return Get-Item -LiteralPath $phpPath
}

function Get-LocalListenerPid {
    param(
        [int]$Port,
        [string]$HostName
    )

    $pattern = [regex]::Escape("${HostName}:$Port")
    $line = netstat -ano | Select-String -Pattern $pattern | Where-Object { $_.Line -match 'LISTENING' } | Select-Object -First 1
    if (-not $line) {
        return $null
    }
    if ($line.Line -match '\s+(\d+)\s*$') {
        return [int]$matches[1]
    }
    return $null
}

function Open-LocalSiteInChrome {
    param(
        [string]$Url
    )

    $chromeCommand = Get-Command chrome.exe -ErrorAction SilentlyContinue
    $chromePaths = @(
        (Join-Path $env:ProgramFiles 'Google\Chrome\Application\chrome.exe'),
        (Join-Path ${env:ProgramFiles(x86)} 'Google\Chrome\Application\chrome.exe'),
        (Join-Path $env:LocalAppData 'Google\Chrome\Application\chrome.exe')
    )
    $chromePath = if ($chromeCommand) {
        $chromeCommand.Source
    } else {
        $chromePaths | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -First 1
    }

    if (-not $chromePath) {
        throw 'Google Chrome was not found. Install Chrome or open the HumidorHQ URL manually.'
    }

    Start-Process -FilePath $chromePath -ArgumentList $Url
    Write-Host "Opened $Url in Chrome." -ForegroundColor Green
}

function Clear-RuntimeReadOnlyAttribute {
    # OneDrive marks synced folders (and sometimes files) read-only. That attribute does not
    # block writes, but PHP's is_writable() reports a read-only directory as unwritable, which
    # makes the application bootstrap abort with DATA_ROOT_NOT_WRITABLE. Clear it on each launch.
    param([string]$DataRoot)

    $readOnly = [System.IO.FileAttributes]::ReadOnly
    try {
        $dir = Get-Item -LiteralPath $DataRoot -Force
        if ($dir.Attributes -band $readOnly) {
            $dir.Attributes = $dir.Attributes -band (-bnot $readOnly)
        }
        Get-ChildItem -LiteralPath $DataRoot -File -Force -ErrorAction SilentlyContinue | ForEach-Object {
            if ($_.Attributes -band $readOnly) {
                $_.Attributes = $_.Attributes -band (-bnot $readOnly)
            }
        }
    } catch {
        Write-Warning "Could not clear the read-only attribute on $DataRoot. If PHP reports DATA_ROOT_NOT_WRITABLE, run: attrib -r `"$DataRoot`""
    }
}

function Resolve-HumidorRuntimeDataRoot {
    param([string]$RequestedRoot, [string]$RepositoryRoot)

    $configuredRoot = if (-not [string]::IsNullOrWhiteSpace($RequestedRoot)) {
        $RequestedRoot
    } elseif (-not [string]::IsNullOrWhiteSpace($env:HUMIDORHQ_DATA_ROOT)) {
        $env:HUMIDORHQ_DATA_ROOT
    } else {
        Join-Path $RepositoryRoot 'data'
    }
    if (-not (Test-Path -LiteralPath $configuredRoot -PathType Container)) {
        throw "Runtime data directory does not exist: $configuredRoot"
    }
    $resolvedRoot = [System.IO.Path]::GetFullPath((Resolve-Path -LiteralPath $configuredRoot).Path)
    Clear-RuntimeReadOnlyAttribute -DataRoot $resolvedRoot
    $requiredFiles = @(
        'auth-users.json', 'catalog-cigars.json', 'counters.json', 'inventory-events.json',
        'lot-location-balances.json', 'lots.json', 'purchase-lines.json', 'purchases.json',
        'smoking-journal-entries.json', 'storage-locations.json', 'storage-sub-locations.json', 'vendors.json'
    )
    foreach ($filename in $requiredFiles) {
        $path = Join-Path $resolvedRoot $filename
        if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
            throw "Required runtime data file is missing: $filename"
        }
        try {
            $null = Get-Content -LiteralPath $path -Raw | ConvertFrom-Json
        } catch {
            throw "Required runtime data file is malformed: $filename"
        }
    }
    return $resolvedRoot
}

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$runtimeDataRoot = Resolve-HumidorRuntimeDataRoot -RequestedRoot $DataRoot -RepositoryRoot $repoRoot
$php = Get-PhpCommand
$url = "http://${HostName}:$Port/"
$existingPid = Get-LocalListenerPid -Port $Port -HostName $HostName

if ($existingPid) {
    Write-Host "HumidorHQ is already listening at $url on process $existingPid." -ForegroundColor Green
    Open-LocalSiteInChrome -Url $url
    return
}

# Quote the docroot so a repository path containing spaces is passed to PHP as a single argument.
$phpArgs = @('-S', "${HostName}:$Port", '-t', "`"$repoRoot`"")
$phpPath = if ($php.PSObject.Properties.Name -contains 'Source') { $php.Source } else { $php.FullName }
$previousDataRoot = $env:HUMIDORHQ_DATA_ROOT
try {
    $env:HUMIDORHQ_DATA_ROOT = $runtimeDataRoot
    $process = Start-Process -FilePath $phpPath -ArgumentList $phpArgs -WorkingDirectory $repoRoot -WindowStyle Hidden -PassThru
} finally {
    $env:HUMIDORHQ_DATA_ROOT = $previousDataRoot
}

# Poll for the listener rather than relying on a single fixed delay; PHP may exit immediately on a startup error.
$listenerPid = $null
foreach ($attempt in 1..20) {
    if ($process.HasExited) {
        throw "PHP exited immediately (exit code $($process.ExitCode)) and did not start on $url. Run PHP manually to see the error: php -S ${HostName}:$Port -t `"$repoRoot`""
    }
    $listenerPid = Get-LocalListenerPid -Port $Port -HostName $HostName
    if ($listenerPid) { break }
    Start-Sleep -Milliseconds 250
}
if (-not $listenerPid) {
    throw "PHP server did not start on $url within the expected time. Check PHP output or port availability."
}

Write-Host "HumidorHQ local server started at $url with process $($process.Id)." -ForegroundColor Green
Write-Host "Runtime data: $runtimeDataRoot" -ForegroundColor Green
Open-LocalSiteInChrome -Url $url

# Example Usage:
#   .\start-local-server.ps1
#   .\start-local-server.ps1 -Port 8080
#   .\start-local-server.ps1 -HostName "127.0.0.1" -Port 8000
#   .\start-local-server.ps1 -DataRoot "C:\HumidorHQ\runtime-data"
