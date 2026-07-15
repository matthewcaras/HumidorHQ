# Filename: start-local-server.ps1
# Revision : 1.1.0
# Description : Starts the HumidorHQ local PHP development server on 127.0.0.1 and opens it in Chrome.
# Created Date : 2026-07-15
# Modified Date : 2026-07-15
# Changelog :
# 1.1.0 open the local HumidorHQ URL in Chrome after confirming the server is listening
# 1.0.1 use netstat for listener checks because Get-NetTCPConnection can hang on some Windows sessions
# 1.0.0 initial release

param(
    [int]$Port = 8000,
    [string]$HostName = '127.0.0.1'
)

$ErrorActionPreference = 'Stop'

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

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$php = Get-Command php -ErrorAction Stop
$url = "http://${HostName}:$Port/"
$existingPid = Get-LocalListenerPid -Port $Port -HostName $HostName

if ($existingPid) {
    Write-Host "HumidorHQ is already listening at $url on process $existingPid." -ForegroundColor Green
    Open-LocalSiteInChrome -Url $url
    return
}

$args = @('-S', "${HostName}:$Port", '-t', $repoRoot)
$process = Start-Process -FilePath $php.Source -ArgumentList $args -WorkingDirectory $repoRoot -WindowStyle Hidden -PassThru
Start-Sleep -Milliseconds 500

$listenerPid = Get-LocalListenerPid -Port $Port -HostName $HostName
if (-not $listenerPid) {
    throw "PHP server did not start on $url. Check PHP output or port availability."
}

Write-Host "HumidorHQ local server started at $url with process $($process.Id)." -ForegroundColor Green
Open-LocalSiteInChrome -Url $url

# Example Usage:
#   .\start-local-server.ps1
#   .\start-local-server.ps1 -Port 8080
#   .\start-local-server.ps1 -HostName "127.0.0.1" -Port 8000
