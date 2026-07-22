# Filename: backup-restore.ps1
# Revision : 1.0.0
# Description : Rehearses guarded runtime backup, import, preview, and restore in a temporary app copy.
# Author : Jason Lamb (with help from Codex CLI)
# Created Date : 2026-07-19
# Modified Date : 2026-07-19
# Changelog :
# 1.0.0 initial release

[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ('humidorhq-backup-test-' + [guid]::NewGuid().ToString('N'))
$tempApp = Join-Path $tempRoot 'app'
$tempData = Join-Path $tempApp 'data'
$serverProcess = $null

function Get-SourceRuntimeHashes {
    $paths = Get-ChildItem -LiteralPath (Join-Path $repoRoot 'data') -File -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -match '\.(json|jsonl)$' } |
        Sort-Object Name
    $result = [ordered]@{}
    foreach ($path in $paths) {
        $result[$path.Name] = (Get-FileHash -LiteralPath $path.FullName -Algorithm SHA256).Hash
    }
    return $result
}

function Assert-HashMapsEqual([hashtable]$Before, [hashtable]$After) {
    if (($Before | ConvertTo-Json -Compress) -ne ($After | ConvertTo-Json -Compress)) {
        throw 'Repository runtime JSON or audit-log hashes changed during isolated backup tests.'
    }
}

$sourceBefore = Get-SourceRuntimeHashes
try {
    New-Item -ItemType Directory -Path $tempApp, $tempData | Out-Null
    Copy-Item -LiteralPath (Join-Path $repoRoot 'api') -Destination $tempApp -Recurse
    Copy-Item -LiteralPath (Join-Path $repoRoot 'seed-data') -Destination $tempApp -Recurse
    Copy-Item -LiteralPath (Join-Path $repoRoot 'backups') -Destination $tempApp -Recurse
    New-Item -ItemType Directory -Path (Join-Path $tempApp 'tests') | Out-Null
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'backup-restore-harness.php') -Destination (Join-Path $tempApp 'tests')

    foreach ($seed in Get-ChildItem -LiteralPath (Join-Path $tempApp 'seed-data') -Filter '*.json') {
        if ($seed.Name -ne 'auth-users.example.json') {
            Copy-Item -LiteralPath $seed.FullName -Destination (Join-Path $tempData $seed.Name)
        }
    }
    $passwordHash = & php -r "echo password_hash('backup-test-pass', PASSWORD_DEFAULT);"
    @([ordered]@{ username = 'backup-test'; passwordHash = $passwordHash; displayName = 'Backup Test'; isActive = $true }) |
        ConvertTo-Json -Depth 4 -AsArray |
        Set-Content -LiteralPath (Join-Path $tempData 'auth-users.json') -Encoding utf8NoBOM
    Set-Content -LiteralPath (Join-Path $tempData 'audit-log.jsonl') -Value '' -NoNewline -Encoding utf8NoBOM
    Copy-Item -LiteralPath (Join-Path $repoRoot 'data/.htaccess') -Destination $tempData

    $env:HUMIDORHQ_DATA_ROOT = $tempData
    & php (Join-Path $tempApp 'tests/backup-restore-harness.php')
    if ($LASTEXITCODE -ne 0) { throw "Backup restore harness exited with code $LASTEXITCODE." }

    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
    $listener.Start()
    $port = ([System.Net.IPEndPoint]$listener.LocalEndpoint).Port
    $listener.Stop()
    $serverOut = Join-Path $tempRoot 'php.out.log'
    $serverError = Join-Path $tempRoot 'php.err.log'
    $serverProcess = Start-Process -FilePath php -ArgumentList "-S 127.0.0.1:$port -t `"$tempApp`"" -WorkingDirectory $tempApp -WindowStyle Hidden -PassThru -RedirectStandardOutput $serverOut -RedirectStandardError $serverError
    Start-Sleep -Milliseconds 700

    $webSession = [Microsoft.PowerShell.Commands.WebRequestSession]::new()
    $anonymous = Invoke-WebRequest "http://127.0.0.1:$port/api/backups" -WebSession $webSession -SkipHttpErrorCheck
    if ($anonymous.StatusCode -ne 401) { throw "Anonymous backup listing returned HTTP $($anonymous.StatusCode), expected 401." }
    $sessionState = Invoke-RestMethod "http://127.0.0.1:$port/api/session" -WebSession $webSession
    $webSession.Headers['X-CSRF-Token'] = [string]$sessionState.data.csrfToken
    $loginBody = @{ username = 'backup-test'; password = 'backup-test-pass' } | ConvertTo-Json
    $login = Invoke-RestMethod "http://127.0.0.1:$port/api/login" -Method Post -ContentType 'application/json' -Body $loginBody -WebSession $webSession
    $webSession.Headers['X-CSRF-Token'] = [string]$login.data.csrfToken
    $apiBackup = Invoke-RestMethod "http://127.0.0.1:$port/api/backups" -Method Post -ContentType 'application/json' -Body '{}' -WebSession $webSession
    $apiList = Invoke-RestMethod "http://127.0.0.1:$port/api/backups" -WebSession $webSession
    if ($apiList.data.backups.filename -notcontains $apiBackup.data.filename) { throw 'Authenticated API backup was not listed.' }
    $previewBody = @{ filename = $apiBackup.data.filename } | ConvertTo-Json
    $apiPreview = Invoke-RestMethod "http://127.0.0.1:$port/api/backups/preview" -Method Post -ContentType 'application/json' -Body $previewBody -WebSession $webSession
    $restoreBody = @{
        filename = $apiBackup.data.filename
        confirmation = 'RESTORE-HUMIDORHQ-BACKUP'
        expectedCurrentFingerprint = $apiPreview.data.currentManifest.fingerprint
    } | ConvertTo-Json
    $apiRestore = Invoke-RestMethod "http://127.0.0.1:$port/api/backups/restore" -Method Post -ContentType 'application/json' -Body $restoreBody -WebSession $webSession
    if (-not $apiRestore.data.safetyBackup) { throw 'Authenticated API restore did not create a safety backup.' }
    $download = Invoke-WebRequest "http://127.0.0.1:$port/api/backups/download?filename=$([uri]::EscapeDataString($apiBackup.data.filename))" -WebSession $webSession
    $downloadBundle = $download.Content | ConvertFrom-Json
    if ($downloadBundle.format -ne 'humidorhq-runtime-backup') { throw 'Authenticated backup download was invalid.' }
    Stop-Process -Id $serverProcess.Id -Force
    $serverProcess.WaitForExit()
    $serverProcess = $null

    Get-ChildItem -LiteralPath $tempData -Filter '*.json' | ForEach-Object {
        $null = Get-Content -Raw -LiteralPath $_.FullName | ConvertFrom-Json
    }
    $denyText = Get-Content -Raw -LiteralPath (Join-Path $tempApp 'backups/.htaccess')
    if ($denyText -notmatch 'Require all denied' -or $denyText -notmatch 'Deny from all') {
        throw 'Backup directory Apache denial rules are missing.'
    }
    Assert-HashMapsEqual $sourceBefore (Get-SourceRuntimeHashes)
    Write-Host 'PASS: isolated authenticated API backup/restore/download, tamper rejection, safety backup, JSON parsing, Apache deny rules, and source hash preservation.'
}
finally {
    if ($null -ne $serverProcess -and -not $serverProcess.HasExited) {
        Stop-Process -Id $serverProcess.Id -Force -ErrorAction SilentlyContinue
    }
    Remove-Item Env:HUMIDORHQ_DATA_ROOT -ErrorAction SilentlyContinue
    if (Test-Path -LiteralPath $tempRoot) {
        Remove-Item -LiteralPath $tempRoot -Recurse -Force
    }
}

# Example Usage:
#   pwsh -NoProfile -File .\tests\backup-restore.ps1
