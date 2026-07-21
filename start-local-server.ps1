# Filename: start-local-server.ps1
# Revision : 1.5.1
# Description : Validates runtime data, starts the local PHP server, and opens HumidorHQ in Chrome.
# Created Date : 2026-07-15
# Modified Date : 2026-07-19
# Changelog :
# 1.5.1 generate short session-local auth credentials and print them to the terminal
# 1.5.0 default local runtime to local-data and seed a throwaway local auth user
# 1.4.0 default local runtime to a disposable temp directory so repo data is never used
# 1.3.1 allow startup without auth-users.json so PHP can return AUTH_USERS_SETUP_REQUIRED
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

function Get-ListenerProcessCommandLine {
    param([int]$ProcessId)

    try {
        $process = Get-CimInstance Win32_Process -Filter "ProcessId = $ProcessId"
    } catch {
        return $null
    }
    return $process.CommandLine
}

function Get-RunningHumidorServer {
    param(
        [string]$HostName,
        [string]$RepositoryRoot
    )

    for ($candidate = 8000; $candidate -le 65535; $candidate++) {
        $listenerPid = Get-LocalListenerPid -Port $candidate -HostName $HostName
        if (-not $listenerPid) {
            continue
        }

        $commandLine = Get-ListenerProcessCommandLine -ProcessId $listenerPid
        if ([string]::IsNullOrWhiteSpace($commandLine)) {
            continue
        }

        if ($commandLine -like "*-S*" -and $commandLine -like "*$RepositoryRoot*") {
            return [pscustomobject]@{
                Port = $candidate
                ProcessId = $listenerPid
            }
        }
    }

    return $null
}

function Resolve-AvailablePort {
    param(
        [int]$StartingPort,
        [string]$HostName
    )

    for ($candidate = $StartingPort; $candidate -le 65535; $candidate++) {
        if (-not (Get-LocalListenerPid -Port $candidate -HostName $HostName)) {
            return $candidate
        }
    }

    throw "No available port was found starting at $StartingPort."
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

function Resolve-HumidorRuntimeDataRoot {
    param([string]$RequestedRoot, [string]$RepositoryRoot)

    $configuredRoot = if (-not [string]::IsNullOrWhiteSpace($RequestedRoot)) {
        $RequestedRoot
    } elseif (-not [string]::IsNullOrWhiteSpace($env:HUMIDORHQ_DATA_ROOT)) {
        $env:HUMIDORHQ_DATA_ROOT
    } else {
        Join-Path $RepositoryRoot 'local-data'
    }
    if (-not (Test-Path -LiteralPath $configuredRoot -PathType Container)) {
        New-Item -ItemType Directory -Path $configuredRoot -Force | Out-Null
    }
    $resolvedRoot = [System.IO.Path]::GetFullPath((Resolve-Path -LiteralPath $configuredRoot).Path)
    return $resolvedRoot
}

function Get-LocalAuthSeed {
    $bytes = New-Object byte[] 8
    [System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
    $token = [System.BitConverter]::ToString($bytes) -replace '-', ''
    return [pscustomobject]@{
        Username = "local-$($token.Substring(0, 4).ToLowerInvariant())"
        Password = $token.Substring(4, 8).ToLowerInvariant()
    }
}

function Ensure-LocalAuthUser {
    param([string]$RuntimeDataRoot)

    $authPath = Join-Path $RuntimeDataRoot 'auth-users.json'
    $needsSeed = $true
    if (Test-Path -LiteralPath $authPath -PathType Leaf) {
        try {
            $existingUsers = Get-Content -LiteralPath $authPath -Raw | ConvertFrom-Json
            $needsSeed = -not ($existingUsers -is [System.Array]) -or $existingUsers.Count -eq 0
        } catch {
            throw 'auth-users.json exists but is not valid JSON.'
        }
    }

    if (-not $needsSeed) {
        return
    }

    $seed = Get-LocalAuthSeed
    $previousDataRoot = $env:HUMIDORHQ_DATA_ROOT
    try {
        $env:HUMIDORHQ_DATA_ROOT = $RuntimeDataRoot
        $createAuth = Start-Process -FilePath $script:phpPath -ArgumentList @('tools/create-auth-user.php', $seed.Username, $seed.Password, 'Local Test User') -WorkingDirectory $script:repoRoot -NoNewWindow -Wait -PassThru
    } finally {
        $env:HUMIDORHQ_DATA_ROOT = $previousDataRoot
    }

    if ($createAuth.ExitCode -ne 0) {
        throw 'Could not create the disposable local auth user.'
    }

    Write-Host "Created disposable local auth credentials in $authPath." -ForegroundColor Yellow
    Write-Host "Local login: $($seed.Username) / $($seed.Password)" -ForegroundColor Yellow
}

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$runtimeDataRoot = Resolve-HumidorRuntimeDataRoot -RequestedRoot $DataRoot -RepositoryRoot $repoRoot
$php = Get-PhpCommand
$script:repoRoot = $repoRoot
$script:phpPath = if ($php.PSObject.Properties.Name -contains 'Source') { $php.Source } else { $php.FullName }
Ensure-LocalAuthUser -RuntimeDataRoot $runtimeDataRoot

$runningServer = Get-RunningHumidorServer -HostName $HostName -RepositoryRoot $repoRoot
if ($runningServer) {
    $url = "http://${HostName}:$($runningServer.Port)/"
    Write-Host "HumidorHQ is already running at $url on process $($runningServer.ProcessId)." -ForegroundColor Green
    Open-LocalSiteInChrome -Url $url
    return
}

$resolvedPort = Resolve-AvailablePort -StartingPort $Port -HostName $HostName
$url = "http://${HostName}:$resolvedPort/"
if ($resolvedPort -ne $Port) {
    Write-Host "Port $Port is already in use. Using $resolvedPort instead." -ForegroundColor Yellow
}

$args = @('-S', "${HostName}:$resolvedPort", '-t', $repoRoot)
$previousDataRoot = $env:HUMIDORHQ_DATA_ROOT
try {
    $env:HUMIDORHQ_DATA_ROOT = $runtimeDataRoot
    $process = Start-Process -FilePath $script:phpPath -ArgumentList $args -WorkingDirectory $repoRoot -WindowStyle Hidden -PassThru
} finally {
    $env:HUMIDORHQ_DATA_ROOT = $previousDataRoot
}
Start-Sleep -Milliseconds 500

$listenerPid = Get-LocalListenerPid -Port $resolvedPort -HostName $HostName
if (-not $listenerPid) {
    throw "PHP server did not start on $url. Check PHP output or port availability."
}

Write-Host "HumidorHQ local server started at $url with process $($process.Id)." -ForegroundColor Green
Write-Host "Runtime data: $runtimeDataRoot" -ForegroundColor Green
Open-LocalSiteInChrome -Url $url

# Example Usage:
#   .\start-local-server.ps1
#   .\start-local-server.ps1 -Port 8080
#   .\start-local-server.ps1 -HostName "127.0.0.1" -Port 8000
#   .\start-local-server.ps1 -DataRoot "C:\HumidorHQ\runtime-data"
