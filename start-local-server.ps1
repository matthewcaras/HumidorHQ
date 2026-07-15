# Filename: start-local-server.ps1
# Revision : 1.0.1
# Description : Starts the HumidorHQ local PHP development server on 127.0.0.1.
# Created Date : 2026-07-15
# Modified Date : 2026-07-15
# Changelog :
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

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$php = Get-Command php -ErrorAction Stop
$existingPid = Get-LocalListenerPid -Port $Port -HostName $HostName

if ($existingPid) {
    Write-Host "HumidorHQ is already listening at http://${HostName}:$Port/ on process $existingPid." -ForegroundColor Green
    return
}

$args = @('-S', "${HostName}:$Port", '-t', $repoRoot)
$process = Start-Process -FilePath $php.Source -ArgumentList $args -WorkingDirectory $repoRoot -WindowStyle Hidden -PassThru
Start-Sleep -Milliseconds 500

$listenerPid = Get-LocalListenerPid -Port $Port -HostName $HostName
if (-not $listenerPid) {
    throw "PHP server did not start on http://${HostName}:$Port/. Check PHP output or port availability."
}

Write-Host "HumidorHQ local server started at http://${HostName}:$Port/ with process $($process.Id)." -ForegroundColor Green

# Example Usage:
#   .\start-local-server.ps1
#   .\start-local-server.ps1 -Port 8080
#   .\start-local-server.ps1 -HostName "127.0.0.1" -Port 8000
