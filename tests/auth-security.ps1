# Filename: auth-security.ps1
# Revision : 1.0.1
# Description : Verifies HumidorHQ throttling, audit, CSRF, session-expiry, cookie, and response-header controls.
# Author : Jason Lamb (with help from Codex CLI)
# Created Date : 2026-07-17
# Modified Date : 2026-07-22
# Changelog :
# 1.0.1 verify backup route authentication and executable PHP discovery
# 1.0.0 initial isolated authentication security regression coverage

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$seedRoot = Join-Path $repoRoot 'seed-data'
$testRoot = Join-Path ([System.IO.Path]::GetTempPath()) ('humidorhq-auth-' + [guid]::NewGuid().ToString('N'))
$dataRoot = Join-Path $testRoot 'runtime'
$testPassed = $false
$server = $null

function Get-PhpCommand {
    $command = Get-Command php -ErrorAction SilentlyContinue
    $candidates = @(
        (Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Packages\PHP.PHP.8.5_Microsoft.Winget.Source_8wekyb3d8bbwe\php.exe'),
        (Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Packages\PHP.PHP.8.4_Microsoft.Winget.Source_8wekyb3d8bbwe\php.exe'),
        (Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Packages\PHP.PHP.8.3_Microsoft.Winget.Source_8wekyb3d8bbwe\php.exe'),
        (Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Packages\PHP.PHP.8.2_Microsoft.Winget.Source_8wekyb3d8bbwe\php.exe'),
        'C:\php\php.exe'
    )
    if ($command) {
        return $command.Source
    }
    $path = $candidates | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
    if (-not $path) { throw 'php.exe was not found.' }
    return $path
}

function Invoke-ExpectedError {
    param(
        [string]$Uri,
        [string]$Method,
        [Microsoft.PowerShell.Commands.WebRequestSession]$Session,
        [object]$Body,
        [int]$Status,
        [string]$Code
    )
    $params = @{ Uri = $Uri; Method = $Method; WebSession = $Session; SkipHttpErrorCheck = $true }
    if ($null -ne $Body) { $params.ContentType = 'application/json'; $params.Body = ($Body | ConvertTo-Json) }
    $response = Invoke-WebRequest @params
    $payload = $response.Content | ConvertFrom-Json
    if ($response.StatusCode -ne $Status -or $payload.error.code -ne $Code) {
        throw "Expected HTTP $Status/$Code, got $($response.StatusCode)/$($payload.error.code)."
    }
}

function Start-AuthServer {
    param([string]$Php, [int]$Port, [int]$IdleSeconds, [int]$AbsoluteSeconds)
    $env:HUMIDORHQ_SESSION_IDLE_SECONDS = [string]$IdleSeconds
    $env:HUMIDORHQ_SESSION_ABSOLUTE_SECONDS = [string]$AbsoluteSeconds
    $stdout = Join-Path $testRoot "php-$Port.out.log"
    $stderr = Join-Path $testRoot "php-$Port.err.log"
    $process = Start-Process -FilePath $Php -ArgumentList @('-S', "127.0.0.1:$Port", '-t', $repoRoot) -WorkingDirectory $repoRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput $stdout -RedirectStandardError $stderr
    Start-Sleep -Milliseconds 700
    return [pscustomobject]@{ Process = $process; Stdout = $stdout; Stderr = $stderr; BaseUrl = "http://127.0.0.1:$Port/api" }
}

function Stop-AuthServer {
    param($Server)
    if ($null -ne $Server -and -not $Server.Process.HasExited) {
        Stop-Process -Id $Server.Process.Id -Force
        $Server.Process.WaitForExit()
    }
}

function New-AuthenticatedSession {
    param([string]$BaseUrl)
    $session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
    $anonymous = Invoke-RestMethod "$BaseUrl/session" -WebSession $session
    $session.Headers['X-CSRF-Token'] = [string]$anonymous.data.csrfToken
    $login = Invoke-RestMethod "$BaseUrl/login" -Method Post -ContentType 'application/json' -Body (@{ username = 'testuser'; password = 'testpass' } | ConvertTo-Json) -WebSession $session
    $session.Headers['X-CSRF-Token'] = [string]$login.data.csrfToken
    return $session
}

$savedEnvironment = @{}
foreach ($name in @('HUMIDORHQ_DATA_ROOT','HUMIDORHQ_TEST_MODE','HUMIDORHQ_LOGIN_USERNAME_LIMIT','HUMIDORHQ_LOGIN_CLIENT_LIMIT','HUMIDORHQ_LOGIN_WINDOW_SECONDS','HUMIDORHQ_LOGIN_LOCK_SECONDS','HUMIDORHQ_SESSION_IDLE_SECONDS','HUMIDORHQ_SESSION_ABSOLUTE_SECONDS')) {
    $savedEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
}

try {
    New-Item -ItemType Directory -Path $dataRoot -Force | Out-Null
    Get-ChildItem -LiteralPath $seedRoot -Filter '*.json' -File | ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $dataRoot $_.Name) }
    $php = Get-PhpCommand
    $hashOut = Join-Path $testRoot 'php-hash.out'
    $hashErr = Join-Path $testRoot 'php-hash.err'
    try {
        $hashProcess = Start-Process -FilePath $php -ArgumentList @('-r', "echo password_hash('testpass', PASSWORD_DEFAULT);") -WindowStyle Hidden -Wait -PassThru -RedirectStandardOutput $hashOut -RedirectStandardError $hashErr
        if ($hashProcess.ExitCode -ne 0) {
            $hashErrorText = if (Test-Path -LiteralPath $hashErr) { Get-Content -LiteralPath $hashErr -Raw } else { '' }
            throw "Could not generate password hash for auth smoke test. $hashErrorText"
        }
        $hash = (Get-Content -LiteralPath $hashOut -Raw).Trim()
        if (-not $hash) { throw 'Could not generate password hash for auth smoke test.' }
    } finally {
        Remove-Item -LiteralPath $hashOut, $hashErr -ErrorAction SilentlyContinue
    }
    @([pscustomobject]@{ username = 'testuser'; passwordHash = $hash; displayName = 'Test User'; isActive = $true }) | ConvertTo-Json -AsArray | Set-Content -LiteralPath (Join-Path $dataRoot 'auth-users.json') -Encoding UTF8

    $env:HUMIDORHQ_DATA_ROOT = $dataRoot
    $env:HUMIDORHQ_TEST_MODE = '1'
    $env:HUMIDORHQ_LOGIN_USERNAME_LIMIT = '3'
    $env:HUMIDORHQ_LOGIN_CLIENT_LIMIT = '10'
    $env:HUMIDORHQ_LOGIN_WINDOW_SECONDS = '60'
    $env:HUMIDORHQ_LOGIN_LOCK_SECONDS = '60'

    $server = Start-AuthServer -Php $php -Port 8771 -IdleSeconds 2 -AbsoluteSeconds 60
    $session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
    $anonymousResponse = Invoke-WebRequest "$($server.BaseUrl)/session" -WebSession $session
    $anonymous = $anonymousResponse.Content | ConvertFrom-Json
    if (-not $anonymous.data.csrfToken) { throw 'Anonymous session did not provide a CSRF token.' }
    foreach ($header in @('X-Content-Type-Options','X-Frame-Options','Referrer-Policy','Permissions-Policy','Content-Security-Policy','Cache-Control')) {
        if (-not $anonymousResponse.Headers[$header]) { throw "API response is missing $header." }
    }
    $cookieHeader = [string]$anonymousResponse.Headers['Set-Cookie']
    if ($cookieHeader -notmatch 'HttpOnly' -or $cookieHeader -notmatch 'SameSite=Strict') { throw 'Session cookie is missing HttpOnly or SameSite=Strict.' }
    foreach ($backupPath in @('/backups', '/backups/import', '/backups/preview', '/backups/restore')) {
        $response = Invoke-WebRequest "$($server.BaseUrl)$backupPath" -Method Post -ContentType 'application/json' -Body '{}' -WebSession $session -SkipHttpErrorCheck
        if ($response.StatusCode -ne 401) { throw "Anonymous request to $backupPath returned HTTP $($response.StatusCode), expected 401." }
    }

    Invoke-ExpectedError -Uri "$($server.BaseUrl)/login" -Method Post -Session $session -Body @{ username = 'testuser'; password = 'testpass' } -Status 403 -Code 'CSRF_INVALID'
    $session.Headers['X-CSRF-Token'] = [string]$anonymous.data.csrfToken
    1..3 | ForEach-Object {
        Invoke-ExpectedError -Uri "$($server.BaseUrl)/login" -Method Post -Session $session -Body @{ username = 'blocked-user'; password = 'wrong-password' } -Status 401 -Code 'AUTH_INVALID_CREDENTIALS'
    }
    Invoke-ExpectedError -Uri "$($server.BaseUrl)/login" -Method Post -Session $session -Body @{ username = 'blocked-user'; password = 'wrong-password' } -Status 429 -Code 'AUTH_RATE_LIMITED'
    $stateText = Get-Content -Raw -LiteralPath (Join-Path $dataRoot '.auth-login-state.json')
    if ($stateText -match 'blocked-user|wrong-password') { throw 'Login throttle state exposed a username or password.' }
    $auditText = Get-Content -Raw -LiteralPath (Join-Path $dataRoot 'audit-log.jsonl')
    if ($auditText -notmatch 'failed login' -or $auditText -notmatch 'rate-limited' -or $auditText -match 'wrong-password') { throw 'Failed-login audit coverage is incomplete or exposed a password.' }
    Write-Output '[PASS] ThrottlingAndFailedLoginAudit'

    $loginResponse = Invoke-WebRequest "$($server.BaseUrl)/login" -Method Post -ContentType 'application/json' -Body (@{ username = 'testuser'; password = 'testpass' } | ConvertTo-Json) -WebSession $session
    $login = $loginResponse.Content | ConvertFrom-Json
    if (-not $login.data.authenticated -or -not $login.data.csrfToken) { throw 'Valid login did not authenticate and rotate the CSRF token.' }
    Invoke-ExpectedError -Uri "$($server.BaseUrl)/audit/page" -Method Post -Session $session -Body @{ page = 'Dashboard'; action = 'view' } -Status 403 -Code 'CSRF_INVALID'
    $session.Headers['X-CSRF-Token'] = [string]$login.data.csrfToken
    $logged = Invoke-RestMethod "$($server.BaseUrl)/audit/page" -Method Post -ContentType 'application/json' -Body (@{ page = 'Dashboard'; action = 'view' } | ConvertTo-Json) -WebSession $session
    if (-not $logged.data.logged) { throw 'Valid CSRF token did not permit an authenticated mutation.' }
    Write-Output '[PASS] CsrfEnforcedAndAccepted'

    Start-Sleep -Seconds 3
    $expired = Invoke-RestMethod "$($server.BaseUrl)/session" -WebSession $session
    if ($expired.data.authenticated) { throw 'Idle session timeout did not expire the session.' }
    Write-Output '[PASS] IdleSessionExpired'
    Stop-AuthServer -Server $server
    $server = $null

    $server = Start-AuthServer -Php $php -Port 8772 -IdleSeconds 60 -AbsoluteSeconds 2
    $absoluteSession = New-AuthenticatedSession -BaseUrl $server.BaseUrl
    Start-Sleep -Seconds 3
    $absoluteExpired = Invoke-RestMethod "$($server.BaseUrl)/session" -WebSession $absoluteSession
    if ($absoluteExpired.data.authenticated) { throw 'Absolute session timeout did not expire the session.' }
    Write-Output '[PASS] AbsoluteSessionExpired'

    $authSource = Get-Content -Raw -LiteralPath (Join-Path $repoRoot 'api\lib\Auth.php')
    foreach ($hook in @('HUMIDORHQ_FORCE_SECURE_COOKIES','HUMIDORHQ_TRUST_PROXY_HEADERS','HTTP_X_FORWARDED_PROTO','session.use_strict_mode')) {
        if ($authSource -notmatch [regex]::Escape($hook)) { throw "Authentication source is missing $hook." }
    }
    Write-Output '[PASS] SecureCookieAndProxyControlsPresent'
    $testPassed = $true
    Write-Output 'Authentication security test passed.'
} finally {
    Stop-AuthServer -Server $server
    foreach ($name in $savedEnvironment.Keys) { [Environment]::SetEnvironmentVariable($name, $savedEnvironment[$name], 'Process') }
    if ($testPassed -and (Test-Path -LiteralPath $testRoot)) {
        Remove-Item -LiteralPath $testRoot -Recurse -Force
    } elseif (Test-Path -LiteralPath $testRoot) {
        Write-Warning "Authentication test diagnostics preserved at $testRoot"
    }
}

# Example Usage:
#   .\tests\auth-security.ps1
