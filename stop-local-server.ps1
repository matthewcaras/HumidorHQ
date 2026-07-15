# Filename: stop-local-server.ps1
# Revision : 1.0.1
# Description : Stops the HumidorHQ local PHP development server by localhost port.
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

function Get-LocalListenerPids {
    param(
        [int]$Port,
        [string]$HostName
    )

    $pattern = [regex]::Escape("${HostName}:$Port")
    netstat -ano |
        Select-String -Pattern $pattern |
        Where-Object { $_.Line -match 'LISTENING' } |
        ForEach-Object {
            if ($_.Line -match '\s+(\d+)\s*$') {
                [int]$matches[1]
            }
        } |
        Select-Object -Unique
}

$listeners = @(Get-LocalListenerPids -Port $Port -HostName $HostName)
if ($listeners.Count -eq 0) {
    Write-Host "No HumidorHQ local server is listening at http://${HostName}:$Port/." -ForegroundColor Yellow
    return
}

foreach ($processId in $listeners) {
    $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
    if (-not $process) {
        continue
    }
    if ($process.ProcessName -ne 'php') {
        throw "Port $Port is owned by $($process.ProcessName) process $($process.Id), not php. Stop it manually if needed."
    }
    Stop-Process -Id $process.Id -Force
    Write-Host "Stopped HumidorHQ local server process $($process.Id) at http://${HostName}:$Port/." -ForegroundColor Green
}

# Example Usage:
#   .\stop-local-server.ps1
#   .\stop-local-server.ps1 -Port 8080
#   .\stop-local-server.ps1 -HostName "127.0.0.1" -Port 8000
