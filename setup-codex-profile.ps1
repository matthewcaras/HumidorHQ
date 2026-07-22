# Filename: setup-codex-profile.ps1
# Revision : 1.0.1
# Description : Prompts for a HumidorHQ project folder, saves it to the current user's PowerShell profile, changes into that folder, and launches Codex.
# Author : Jason Lamb (with help from Codex CLI)
# Created Date : 2026-07-16
# Modified Date : 2026-07-17 8:45 AM ET
# Changelog :
# 1.0.1 use Regex instance replacement count when updating existing HumidorHQ profile shortcut
# 1.0.0 initial release

$ErrorActionPreference = 'Stop'

function ConvertTo-SingleQuotedPowerShellLiteral {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Value
    )

    return "'$($Value.Replace("'", "''"))'"
}

$profilePath = $PROFILE.CurrentUserCurrentHost
$profileDirectory = Split-Path -Parent $profilePath

if (-not (Test-Path -LiteralPath $profileDirectory -PathType Container)) {
    New-Item -ItemType Directory -Path $profileDirectory -Force | Out-Null
}

if (-not (Test-Path -LiteralPath $profilePath -PathType Leaf)) {
    New-Item -ItemType File -Path $profilePath -Force | Out-Null
    Write-Host "Created PowerShell profile: $profilePath" -ForegroundColor Green
}

Write-Host 'Enter the full path to the local HumidorHQ project folder.' -ForegroundColor Cyan
Write-Host 'Example: C:\Users\Matt\Documents\GitHub\HumidorHQ' -ForegroundColor DarkGray

$HumidorHQ = $null

do {
    $enteredPath = (Read-Host 'HumidorHQ project folder').Trim().Trim('"')

    if ([string]::IsNullOrWhiteSpace($enteredPath)) {
        Write-Host 'Path cannot be blank.' -ForegroundColor Yellow
        continue
    }

    if ($enteredPath -in @('?', 'help')) {
        Write-Host 'Paste the folder that contains index.html, api, data, and public.' -ForegroundColor Cyan
        Write-Host 'Example: C:\Users\Matt\Documents\GitHub\HumidorHQ' -ForegroundColor DarkGray
        continue
    }

    if (-not (Test-Path -LiteralPath $enteredPath -PathType Container)) {
        Write-Host "That folder does not exist: $enteredPath" -ForegroundColor Yellow
        Write-Host 'This script will not create the project folder. Clone or locate the repo, then paste that path.' -ForegroundColor Yellow
        continue
    }

    $requiredItems = @('index.html', 'api', 'data', 'public')
    $missingItems = $requiredItems | Where-Object { -not (Test-Path -LiteralPath (Join-Path $enteredPath $_)) }
    if ($missingItems.Count -gt 0) {
        Write-Host "That folder exists, but it does not look like HumidorHQ. Missing: $($missingItems -join ', ')" -ForegroundColor Yellow
        continue
    }

    $HumidorHQ = (Resolve-Path -LiteralPath $enteredPath).Path
} until ($HumidorHQ)

$profileLine = '$HumidorHQ = ' + (ConvertTo-SingleQuotedPowerShellLiteral -Value $HumidorHQ)
$profileContent = Get-Content -LiteralPath $profilePath -Raw -ErrorAction SilentlyContinue
if ($null -eq $profileContent) { $profileContent = '' }

$humidorProfileRegex = [regex]'(?m)^\s*\$HumidorHQ\s*=.*$'
if ($humidorProfileRegex.IsMatch($profileContent)) {
    $profileContent = $humidorProfileRegex.Replace($profileContent, $profileLine, 1)
} else {
    if ($profileContent.Length -gt 0) {
        if (-not $profileContent.EndsWith("`r`n") -and -not $profileContent.EndsWith("`n")) {
            $profileContent += "`r`n"
        }
        $profileContent += "`r`n"
    }
    $profileContent += "# HumidorHQ project shortcut`r`n$profileLine`r`n"
}

Set-Content -LiteralPath $profilePath -Value $profileContent -Encoding UTF8
Write-Host "Saved `$HumidorHQ to profile: $profilePath" -ForegroundColor Green
Write-Host "Use this later: cd `$HumidorHQ" -ForegroundColor Cyan

Set-Location -LiteralPath $HumidorHQ

if (-not (Get-Command codex -ErrorAction SilentlyContinue)) {
    Write-Host 'Codex CLI was not found on PATH. Open a new terminal after installing Codex, then run: cd $HumidorHQ; codex' -ForegroundColor Yellow
    return
}

codex

# Example Usage:
#   .\setup-codex-profile.ps1

