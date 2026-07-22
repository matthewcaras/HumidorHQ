# Filename: production-runtime-import.ps1
# Revision : 1.0.0
# Description : Rehearses the authenticated production runtime import workflow in isolated temporary data roots.
# Author : Jason Lamb (with help from Codex CLI)
# Created Date : 2026-07-22
# Modified Date : 2026-07-22
# Changelog :
# 1.0.0 initial release

[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$php = (Get-Command php -ErrorAction SilentlyContinue).Source
if ([string]::IsNullOrWhiteSpace($php)) {
    throw 'php.exe was not found on PATH.'
}

$sourceDataRoot = Join-Path $repoRoot 'data'
$allowedRuntimeFiles = @(
    'catalog-cigars.json',
    'counters.json',
    'inventory-events.json',
    'lot-location-balances.json',
    'lots.json',
    'purchase-lines.json',
    'purchases.json',
    'smoking-journal-entries.json',
    'storage-locations.json',
    'storage-sub-locations.json',
    'vendors.json'
)

function Assert-Equal {
    param($Expected, $Actual, [string]$Message)
    if ($Expected -ne $Actual) {
        throw "$Message Expected=$Expected Actual=$Actual"
    }
}

function Assert-True {
    param([bool]$Condition, [string]$Message)
    if (-not $Condition) {
        throw $Message
    }
}

function Get-RuntimeJsonHashes {
    param(
        [string]$Root,
        [string[]]$ExcludeNames = @()
    )
    $map = [ordered]@{}
    Get-ChildItem -LiteralPath $Root -File -Filter '*.json' |
        Sort-Object Name |
        ForEach-Object {
            if ($ExcludeNames -contains $_.Name) {
                return
            }
            $map[$_.Name] = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash
        }
    return $map
}

function Get-PhpPasswordHash {
    param([string]$Password)
    $result = & $php -r "echo password_hash('$Password', PASSWORD_DEFAULT);"
    if ([string]::IsNullOrWhiteSpace($result)) {
        throw 'Could not generate a password hash for the isolated test user.'
    }
    return $result.Trim()
}

function Get-StringSha256 {
    param([string]$Text)
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($Text)
    $hash = [System.Security.Cryptography.SHA256]::Create().ComputeHash($bytes)
    return ($hash | ForEach-Object { $_.ToString('x2') }) -join ''
}

function New-TestRuntimeRoot {
    param([string]$Root)
    New-Item -ItemType Directory -Path $Root -Force | Out-Null
    foreach ($template in Get-ChildItem -LiteralPath (Join-Path $repoRoot 'seed-data') -Force) {
        if ($template.Name -eq 'auth-users.json') {
            continue
        }
        Copy-Item -LiteralPath $template.FullName -Destination (Join-Path $Root $template.Name) -Force
    }
    Copy-Item -LiteralPath (Join-Path $repoRoot 'data/.htaccess') -Destination (Join-Path $Root '.htaccess') -Force
    Set-Content -LiteralPath (Join-Path $Root 'audit-log.jsonl') -Value '' -NoNewline -Encoding utf8NoBOM
    @(
        [pscustomobject]@{
            username = 'matt'
            passwordHash = Get-PhpPasswordHash -Password 'import-test-pass'
            displayName = 'Matt'
            isActive = $true
        }
    ) | ConvertTo-Json -Depth 4 -AsArray | Set-Content -LiteralPath (Join-Path $Root 'auth-users.json') -Encoding utf8NoBOM
}

function New-TestAppRoot {
    param([string]$Root)
    New-Item -ItemType Directory -Path $Root -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $repoRoot 'api') -Destination (Join-Path $Root 'api') -Recurse -Force
    Copy-Item -LiteralPath (Join-Path $repoRoot 'seed-data') -Destination (Join-Path $Root 'seed-data') -Recurse -Force
}

function Start-TestServer {
    param(
        [string]$AppRoot,
        [string]$DataRoot,
        [bool]$TestMode = $false
    )
    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
    $listener.Start()
    $port = ([System.Net.IPEndPoint]$listener.LocalEndpoint).Port
    $listener.Stop()
    $env:HUMIDORHQ_DATA_ROOT = $DataRoot
    if ($TestMode) {
        $env:HUMIDORHQ_TEST_MODE = '1'
    } else {
        Remove-Item Env:HUMIDORHQ_TEST_MODE -ErrorAction SilentlyContinue
    }
    $serverOut = Join-Path $DataRoot 'php.out.log'
    $serverErr = Join-Path $DataRoot 'php.err.log'
    $process = Start-Process -FilePath $php -ArgumentList @('-S', "127.0.0.1:$port", '-t', $AppRoot) -WorkingDirectory $AppRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput $serverOut -RedirectStandardError $serverErr
    $baseUrl = "http://127.0.0.1:$port"
    for ($attempt = 0; $attempt -lt 40; $attempt++) {
        try {
            $probe = Invoke-WebRequest "$baseUrl/api/session" -SkipHttpErrorCheck
            if ($probe.StatusCode -eq 200) {
                return [pscustomobject]@{ Process = $process; BaseUrl = $baseUrl }
            }
        } catch {
        }
        Start-Sleep -Milliseconds 250
    }
    throw "The isolated PHP test server did not start on $baseUrl."
}

function New-HttpClient {
    $handler = [System.Net.Http.HttpClientHandler]::new()
    $handler.CookieContainer = [System.Net.CookieContainer]::new()
    $client = [System.Net.Http.HttpClient]::new($handler)
    $client.Timeout = [TimeSpan]::FromSeconds(30)
    return [pscustomobject]@{
        Client = $client
        Handler = $handler
        CookieJar = $handler.CookieContainer
    }
}

function Invoke-ApiRequest {
    param(
        [System.Net.Http.HttpClient]$Client,
        [string]$Method,
        [string]$Path,
        [object]$Body = $null,
        [hashtable]$Headers = @{},
        [string]$ContentType = 'application/json'
    )
    $request = [System.Net.Http.HttpRequestMessage]::new([System.Net.Http.HttpMethod]::new($Method), $Path)
    foreach ($key in $Headers.Keys) {
        $null = $request.Headers.TryAddWithoutValidation($key, [string]$Headers[$key])
    }
    if ($null -ne $Body) {
        if ($Body -is [System.Net.Http.HttpContent]) {
            $request.Content = $Body
        } else {
            $json = if ($Body -is [string]) { $Body } else { $Body | ConvertTo-Json -Depth 16 }
            $request.Content = [System.Net.Http.StringContent]::new($json, [System.Text.Encoding]::UTF8, $ContentType)
        }
    }
    $response = $Client.SendAsync($request).GetAwaiter().GetResult()
    $raw = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
    $parsed = $null
    if (-not [string]::IsNullOrWhiteSpace($raw)) {
        $parsed = $raw | ConvertFrom-Json
    }
    return [pscustomobject]@{
        StatusCode = [int]$response.StatusCode
        Body = $parsed
        Raw = $raw
    }
}

function New-MultipartUpload {
    param(
        [string]$ZipPath,
        [string]$Confirmation,
        [string]$SimulateFailure = ''
    )
    $multipart = [System.Net.Http.MultipartFormDataContent]::new()
    $null = $multipart.Add([System.Net.Http.StringContent]::new($Confirmation, [System.Text.Encoding]::UTF8), 'confirmation')
    if (-not [string]::IsNullOrWhiteSpace($SimulateFailure)) {
        $null = $multipart.Add([System.Net.Http.StringContent]::new($SimulateFailure, [System.Text.Encoding]::UTF8), 'simulateFailure')
    }
    $stream = [System.IO.File]::OpenRead($ZipPath)
    $fileContent = [System.Net.Http.StreamContent]::new($stream)
    $fileContent.Headers.ContentType = [System.Net.Http.Headers.MediaTypeHeaderValue]::Parse('application/zip')
    $null = $multipart.Add($fileContent, 'package', [System.IO.Path]::GetFileName($ZipPath))
    return [pscustomobject]@{ Content = $multipart; Stream = $stream }
}

function Invoke-ExpectedError {
    param(
        [System.Net.Http.HttpClient]$Client,
        [string]$Method,
        [string]$Path,
        [int]$ExpectedStatus,
        [string]$ExpectedCode,
        [object]$Body = $null,
        [hashtable]$Headers = @{},
        [string]$ContentType = 'application/json'
    )
    $result = Invoke-ApiRequest -Client $Client -Method $Method -Path $Path -Body $Body -Headers $Headers -ContentType $ContentType
    Assert-Equal $ExpectedStatus $result.StatusCode "Unexpected HTTP status for $Method $Path."
    Assert-True ($null -ne $result.Body.error) "Expected an error response for $Method $Path."
    Assert-Equal $ExpectedCode $result.Body.error.code "Unexpected error code for $Method $Path."
    return $result
}

function Copy-ZipVariant {
    param(
        [string]$SourceZip,
        [string]$TargetZip,
        [hashtable]$EntryOverrides = @{},
        [hashtable]$ExtraEntries = @{},
        [scriptblock]$ManifestMutator = $null
    )
    $source = [System.IO.Compression.ZipFile]::OpenRead($SourceZip)
    $stream = [System.IO.File]::Open($TargetZip, [System.IO.FileMode]::CreateNew)
    $target = [System.IO.Compression.ZipArchive]::new($stream, [System.IO.Compression.ZipArchiveMode]::Create, $false)
    try {
        foreach ($entry in $source.Entries) {
            $name = $entry.FullName
            $raw = $null
            if ($EntryOverrides.ContainsKey($name)) {
                $raw = [string]$EntryOverrides[$name]
            } else {
                $reader = [System.IO.StreamReader]::new($entry.Open())
                try {
                    $raw = $reader.ReadToEnd()
                } finally {
                    $reader.Dispose()
                }
            }
            if ($name -eq 'manifest.json' -and $null -ne $ManifestMutator) {
                $manifest = $raw | ConvertFrom-Json
                $raw = (& $ManifestMutator $manifest) | ConvertTo-Json -Depth 16 -Compress
            }
            $zipEntry = $target.CreateEntry($name, [System.IO.Compression.CompressionLevel]::Optimal)
            $writer = [System.IO.StreamWriter]::new($zipEntry.Open(), [System.Text.UTF8Encoding]::new($false))
            try {
                $writer.Write($raw)
            } finally {
                $writer.Dispose()
            }
        }
        foreach ($name in $ExtraEntries.Keys) {
            $zipEntry = $target.CreateEntry($name, [System.IO.Compression.CompressionLevel]::Optimal)
            $writer = [System.IO.StreamWriter]::new($zipEntry.Open(), [System.Text.UTF8Encoding]::new($false))
            try {
                $writer.Write([string]$ExtraEntries[$name])
            } finally {
                $writer.Dispose()
            }
        }
    } finally {
        $target.Dispose()
        $stream.Dispose()
        $source.Dispose()
    }
}

$repoHashesBefore = Get-RuntimeJsonHashes -Root $sourceDataRoot
$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ('humidorhq-production-import-test-' + [guid]::NewGuid().ToString('N'))
$tempApp = Join-Path $tempRoot 'app'
$tempData = Join-Path $tempApp 'data'
$server = $null
$rollbackServer = $null
try {
    New-Item -ItemType Directory -Path $tempRoot -Force | Out-Null
    New-TestAppRoot -Root $tempApp
    New-TestRuntimeRoot -Root $tempData

    $packagePath = Join-Path $tempRoot 'production-import.zip'
    & pwsh -NoProfile -File (Join-Path $repoRoot 'tools/package-production-import.ps1') -SourceRoot $sourceDataRoot -OutputPath $packagePath | Out-Null

    $zip = [System.IO.Compression.ZipFile]::OpenRead($packagePath)
    try {
        $expectedZipEntries = @((($allowedRuntimeFiles + 'manifest.json') | Sort-Object))
        $actualZipEntries = @($zip.Entries.FullName | Sort-Object)
        Assert-Equal ($expectedZipEntries -join ',') ($actualZipEntries -join ',') 'The production import package contained unexpected ZIP entries.'
    } finally {
        $zip.Dispose()
    }

    $server = Start-TestServer -AppRoot $tempApp -DataRoot $tempData
    $clientHolder = New-HttpClient
    $client = $clientHolder.Client

    Invoke-ExpectedError -Client $client -Method 'GET' -Path '/api/production-import' -ExpectedStatus 401 -ExpectedCode 'AUTH_REQUIRED' | Out-Null

    $session = Invoke-ApiRequest -Client $client -Method 'GET' -Path '/api/session'
    $csrf = [string]$session.Body.data.csrfToken
    $login = Invoke-ApiRequest -Client $client -Method 'POST' -Path '/api/login' -Headers @{ 'X-CSRF-Token' = $csrf } -Body (@{ username = 'matt'; password = 'import-test-pass' } | ConvertTo-Json)
    Assert-True ([bool]$login.Body.data.authenticated) 'Login did not authenticate the test user.'
    $csrf = [string]$login.Body.data.csrfToken

    $authHashBeforeImport = (Get-FileHash -LiteralPath (Join-Path $tempData 'auth-users.json') -Algorithm SHA256).Hash
    $auditHashBeforeImport = (Get-FileHash -LiteralPath (Join-Path $tempData 'audit-log.jsonl') -Algorithm SHA256).Hash

    $missingCsrfUpload = New-MultipartUpload -ZipPath $packagePath -Confirmation 'APPLY-HUMIDORHQ-PRODUCTION-IMPORT'
    try {
        Invoke-ExpectedError -Client $client -Method 'POST' -Path '/api/production-import' -ExpectedStatus 403 -ExpectedCode 'CSRF_INVALID' -Body $missingCsrfUpload.Content -ContentType 'multipart/form-data' | Out-Null
    } finally {
        $missingCsrfUpload.Content.Dispose()
        $missingCsrfUpload.Stream.Dispose()
    }

    $hashMismatchZip = Join-Path $tempRoot 'hash-mismatch.zip'
    Copy-ZipVariant -SourceZip $packagePath -TargetZip $hashMismatchZip -EntryOverrides @{ 'vendors.json' = '{"tampered":true}' }
    $hashMismatchUpload = New-MultipartUpload -ZipPath $hashMismatchZip -Confirmation 'APPLY-HUMIDORHQ-PRODUCTION-IMPORT'
    try {
        Invoke-ExpectedError -Client $client -Method 'POST' -Path '/api/production-import' -ExpectedStatus 409 -ExpectedCode 'PRODUCTION_IMPORT_HASH_MISMATCH' -Headers @{ 'X-CSRF-Token' = $csrf } -Body $hashMismatchUpload.Content -ContentType 'multipart/form-data' | Out-Null
    } finally {
        $hashMismatchUpload.Content.Dispose()
        $hashMismatchUpload.Stream.Dispose()
    }

    $malformedZip = Join-Path $tempRoot 'malformed-json.zip'
    $invalidJson = '{"broken":'
    Copy-ZipVariant -SourceZip $packagePath -TargetZip $malformedZip -EntryOverrides @{ 'vendors.json' = $invalidJson } -ManifestMutator {
        param($Manifest)
        $Manifest.files.'vendors.json'.sha256 = Get-StringSha256 -Text $invalidJson
        return $Manifest
    }
    $malformedUpload = New-MultipartUpload -ZipPath $malformedZip -Confirmation 'APPLY-HUMIDORHQ-PRODUCTION-IMPORT'
    try {
        Invoke-ExpectedError -Client $client -Method 'POST' -Path '/api/production-import' -ExpectedStatus 409 -ExpectedCode 'PRODUCTION_IMPORT_INVALID_JSON' -Headers @{ 'X-CSRF-Token' = $csrf } -Body $malformedUpload.Content -ContentType 'multipart/form-data' | Out-Null
    } finally {
        $malformedUpload.Content.Dispose()
        $malformedUpload.Stream.Dispose()
    }

    $unexpectedZip = Join-Path $tempRoot 'unexpected-file.zip'
    Copy-ZipVariant -SourceZip $packagePath -TargetZip $unexpectedZip -ExtraEntries @{ 'unexpected.json' = '[]' }
    $unexpectedUpload = New-MultipartUpload -ZipPath $unexpectedZip -Confirmation 'APPLY-HUMIDORHQ-PRODUCTION-IMPORT'
    try {
        Invoke-ExpectedError -Client $client -Method 'POST' -Path '/api/production-import' -ExpectedStatus 409 -ExpectedCode 'PRODUCTION_IMPORT_UNEXPECTED_FILE' -Headers @{ 'X-CSRF-Token' = $csrf } -Body $unexpectedUpload.Content -ContentType 'multipart/form-data' | Out-Null
    } finally {
        $unexpectedUpload.Content.Dispose()
        $unexpectedUpload.Stream.Dispose()
    }

    $pathTraversalZip = Join-Path $tempRoot 'path-traversal.zip'
    Copy-ZipVariant -SourceZip $packagePath -TargetZip $pathTraversalZip -ExtraEntries @{ '../evil.json' = '[]' }
    $pathTraversalUpload = New-MultipartUpload -ZipPath $pathTraversalZip -Confirmation 'APPLY-HUMIDORHQ-PRODUCTION-IMPORT'
    try {
        Invoke-ExpectedError -Client $client -Method 'POST' -Path '/api/production-import' -ExpectedStatus 409 -ExpectedCode 'PRODUCTION_IMPORT_INVALID_PACKAGE' -Headers @{ 'X-CSRF-Token' = $csrf } -Body $pathTraversalUpload.Content -ContentType 'multipart/form-data' | Out-Null
    } finally {
        $pathTraversalUpload.Content.Dispose()
        $pathTraversalUpload.Stream.Dispose()
    }

    $validUpload = New-MultipartUpload -ZipPath $packagePath -Confirmation 'APPLY-HUMIDORHQ-PRODUCTION-IMPORT'
    try {
        $import = Invoke-ApiRequest -Client $client -Method 'POST' -Path '/api/production-import' -Headers @{ 'X-CSRF-Token' = $csrf } -Body $validUpload.Content -ContentType 'multipart/form-data'
        Assert-Equal 201 $import.StatusCode 'The valid production import did not return HTTP 201.'
        Assert-Equal 'success' $import.Body.data.status 'The valid production import did not report success.'
        Assert-Equal 911 ([int]$import.Body.data.receipts) 'The valid production import reported the wrong receipt count.'
        Assert-Equal 0 ([int]$import.Body.data.removals) 'The valid production import reported the wrong removal count.'
        Assert-Equal 911 ([int]$import.Body.data.onHand) 'The valid production import reported the wrong on-hand count.'
        Assert-Equal 88 ([int]$import.Body.data.lotCount) 'The valid production import reported the wrong Lot count.'
        Assert-Equal 0 ([int]$import.Body.data.integrityErrors) 'The valid production import reported integrity errors.'
        Assert-Equal 0 ([int]$import.Body.data.integrityWarnings) 'The valid production import reported integrity warnings.'
    } finally {
        $validUpload.Content.Dispose()
        $validUpload.Stream.Dispose()
    }

    $status = Invoke-ApiRequest -Client $client -Method 'GET' -Path '/api/production-import'
    Assert-True ([bool]$status.Body.data.completed) 'Production import status did not mark the import completed.'
    Assert-True (-not [bool]$status.Body.data.enabled) 'Production import status did not disable the feature.'
    Assert-Equal 911 ([int]$status.Body.data.result.receipts) 'Production import status returned the wrong receipt total.'
    Assert-Equal 0 ([int]$status.Body.data.result.removals) 'Production import status returned the wrong removal total.'
    Assert-Equal 911 ([int]$status.Body.data.result.onHand) 'Production import status returned the wrong on-hand total.'
    Assert-Equal 88 ([int]$status.Body.data.result.lotCount) 'Production import status returned the wrong Lot count.'

    $authHashAfterImport = (Get-FileHash -LiteralPath (Join-Path $tempData 'auth-users.json') -Algorithm SHA256).Hash
    $auditHashAfterImport = (Get-FileHash -LiteralPath (Join-Path $tempData 'audit-log.jsonl') -Algorithm SHA256).Hash
    Assert-Equal $authHashBeforeImport $authHashAfterImport 'auth-users.json changed during the production import.'
    Assert-Equal $auditHashBeforeImport $auditHashAfterImport 'audit-log.jsonl changed during the production import.'

    $tempDataHashesAfterImport = Get-RuntimeJsonHashes -Root $tempData -ExcludeNames @('.production-import-complete.json')
    Assert-Equal ($allowedRuntimeFiles.Count + 1) $tempDataHashesAfterImport.Count 'The imported runtime data did not include the expected JSON collections.'

    $duplicateUpload = New-MultipartUpload -ZipPath $packagePath -Confirmation 'APPLY-HUMIDORHQ-PRODUCTION-IMPORT'
    try {
        Invoke-ExpectedError -Client $client -Method 'POST' -Path '/api/production-import' -ExpectedStatus 409 -ExpectedCode 'PRODUCTION_IMPORT_DISABLED' -Headers @{ 'X-CSRF-Token' = $csrf } -Body $duplicateUpload.Content -ContentType 'multipart/form-data' | Out-Null
    } finally {
        $duplicateUpload.Content.Dispose()
        $duplicateUpload.Stream.Dispose()
    }

    $rollbackRoot = Join-Path $tempRoot 'rollback'
    $rollbackApp = Join-Path $rollbackRoot 'app'
    $rollbackData = Join-Path $rollbackApp 'data'
    New-TestAppRoot -Root $rollbackApp
    New-TestRuntimeRoot -Root $rollbackData
    $rollbackServer = Start-TestServer -AppRoot $rollbackApp -DataRoot $rollbackData -TestMode $true
    $rollbackClientHolder = New-HttpClient
    $rollbackClient = $rollbackClientHolder.Client
    $rollbackSession = Invoke-ApiRequest -Client $rollbackClient -Method 'GET' -Path '/api/session'
    $rollbackCsrf = [string]$rollbackSession.Body.data.csrfToken
    $rollbackLogin = Invoke-ApiRequest -Client $rollbackClient -Method 'POST' -Path '/api/login' -Headers @{ 'X-CSRF-Token' = $rollbackCsrf } -Body (@{ username = 'matt'; password = 'import-test-pass' } | ConvertTo-Json)
    Assert-True ([bool]$rollbackLogin.Body.data.authenticated) 'Rollback test login failed.'
    $rollbackCsrf = [string]$rollbackLogin.Body.data.csrfToken

    $rollbackAuthBefore = (Get-FileHash -LiteralPath (Join-Path $rollbackData 'auth-users.json') -Algorithm SHA256).Hash
    $rollbackAuditBefore = (Get-FileHash -LiteralPath (Join-Path $rollbackData 'audit-log.jsonl') -Algorithm SHA256).Hash
    $rollbackRuntimeBefore = Get-RuntimeJsonHashes -Root $rollbackData -ExcludeNames @('.production-import-complete.json')

    $failureUpload = New-MultipartUpload -ZipPath $packagePath -Confirmation 'APPLY-HUMIDORHQ-PRODUCTION-IMPORT' -SimulateFailure 'after-commit'
    try {
        Invoke-ExpectedError -Client $rollbackClient -Method 'POST' -Path '/api/production-import' -ExpectedStatus 500 -ExpectedCode 'PRODUCTION_IMPORT_TEST_FAILURE' -Headers @{ 'X-CSRF-Token' = $rollbackCsrf } -Body $failureUpload.Content -ContentType 'multipart/form-data' | Out-Null
    } finally {
        $failureUpload.Content.Dispose()
        $failureUpload.Stream.Dispose()
    }

    $rollbackRuntimeAfter = Get-RuntimeJsonHashes -Root $rollbackData -ExcludeNames @('.production-import-complete.json')
    Assert-Equal ($rollbackRuntimeBefore | ConvertTo-Json -Compress) ($rollbackRuntimeAfter | ConvertTo-Json -Compress) 'Runtime JSON changed after the simulated-failure rollback rehearsal.'
    Assert-Equal $rollbackAuthBefore (Get-FileHash -LiteralPath (Join-Path $rollbackData 'auth-users.json') -Algorithm SHA256).Hash 'auth-users.json changed during the rollback rehearsal.'
    Assert-Equal $rollbackAuditBefore (Get-FileHash -LiteralPath (Join-Path $rollbackData 'audit-log.jsonl') -Algorithm SHA256).Hash 'audit-log.jsonl changed during the rollback rehearsal.'

    Write-Host 'PASS: authenticated production import route, tamper rejection, duplicate rejection, and rollback rehearsal all completed in isolated data roots.'
} finally {
    if ($null -ne $server -and $server.Process -and -not $server.Process.HasExited) {
        Stop-Process -Id $server.Process.Id -Force -ErrorAction SilentlyContinue
    }
    if ($null -ne $rollbackServer -and $rollbackServer.Process -and -not $rollbackServer.Process.HasExited) {
        Stop-Process -Id $rollbackServer.Process.Id -Force -ErrorAction SilentlyContinue
    }
    Remove-Item Env:HUMIDORHQ_DATA_ROOT -ErrorAction SilentlyContinue
    Remove-Item Env:HUMIDORHQ_TEST_MODE -ErrorAction SilentlyContinue
    if (Test-Path -LiteralPath $tempRoot) {
        Remove-Item -LiteralPath $tempRoot -Recurse -Force
    }
    $repoHashesAfter = Get-RuntimeJsonHashes -Root $sourceDataRoot
    if (($repoHashesBefore | ConvertTo-Json -Compress) -ne ($repoHashesAfter | ConvertTo-Json -Compress)) {
        throw 'Repository runtime JSON changed during production import rehearsal.'
    }
}

# Example Usage:
#   pwsh -NoProfile -File .\tests\production-runtime-import.ps1
