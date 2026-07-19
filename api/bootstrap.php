<?php
declare(strict_types=1);
/*
 * Filename: bootstrap.php
 * Revision: 1.7.0
 * Description: Initializes, defines, and validates the configurable HumidorHQ runtime data root.
 * Modified Date: 2026-07-19 12:15 ET
 */

define('APP_ROOT', dirname(__DIR__));
define('API_ROOT', __DIR__);

function data_root_startup_failure(string $code, string $message): never
{
    if (PHP_SAPI === 'cli') {
        fwrite(STDERR, '[' . $code . '] ' . $message . PHP_EOL);
        exit(1);
    }
    if (!headers_sent()) {
        http_response_code(503);
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');
        header('X-Content-Type-Options: nosniff');
        header('X-Frame-Options: SAMEORIGIN');
        header('Referrer-Policy: no-referrer');
    }
    echo json_encode([
        'error' => [
            'code' => $code,
            'message' => $message,
        ],
    ], JSON_UNESCAPED_SLASHES);
    exit(1);
}

function runtime_seed_filenames(): array
{
    return [
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
        'vendors.json',
    ];
}

function prepare_runtime_data_directory(string $path): string
{
    if (file_exists($path) && !is_dir($path)) {
        data_root_startup_failure('DATA_ROOT_NOT_DIRECTORY', 'The configured runtime data path is not a directory.');
    }
    if (!is_dir($path) && !mkdir($path, 0770, true) && !is_dir($path)) {
        data_root_startup_failure('DATA_ROOT_CREATE_FAILED', 'The runtime data directory could not be created.');
    }
    $resolved = realpath($path);
    if ($resolved === false) {
        data_root_startup_failure('DATA_ROOT_MISSING', 'The configured runtime data directory does not exist.');
    }
    $resolved = rtrim($resolved, "\\/");
    if (!is_readable($resolved) || !is_writable($resolved)) {
        data_root_startup_failure('DATA_ROOT_NOT_WRITABLE', 'The runtime data directory must be readable and writable by PHP.');
    }
    return $resolved;
}

function validated_runtime_seed_templates(): array
{
    $seedRoot = APP_ROOT . DIRECTORY_SEPARATOR . 'seed-data';
    $templates = [];
    foreach (runtime_seed_filenames() as $filename) {
        $path = $seedRoot . DIRECTORY_SEPARATOR . $filename;
        if (!is_file($path) || !is_readable($path)) {
            data_root_startup_failure('DATA_SEED_MISSING', 'A required runtime seed template is missing: ' . $filename);
        }
        $raw = file_get_contents($path);
        try {
            $decoded = is_string($raw) ? json_decode($raw, true, 512, JSON_THROW_ON_ERROR) : null;
        } catch (JsonException) {
            $decoded = null;
        }
        $validShape = is_array($decoded)
            && ($filename === 'counters.json' ? !array_is_list($decoded) : array_is_list($decoded));
        if (!$validShape) {
            data_root_startup_failure('DATA_SEED_INVALID_JSON', 'A runtime seed template has an invalid JSON structure: ' . $filename);
        }
        if ($filename === 'counters.json') {
            foreach (array_map(static fn (string $name): string => substr($name, 0, -5), runtime_seed_filenames()) as $collection) {
                if ($collection === 'counters') {
                    continue;
                }
                if (!isset($decoded[$collection]) || !is_int($decoded[$collection]) || $decoded[$collection] < 1) {
                    data_root_startup_failure('DATA_SEED_INVALID_JSON', 'The counters seed template is missing a valid counter for: ' . $collection);
                }
            }
        }
        $templates[$filename] = $raw;
    }
    return $templates;
}

function validated_runtime_access_template(): string
{
    $path = APP_ROOT . DIRECTORY_SEPARATOR . 'seed-data' . DIRECTORY_SEPARATOR . '.htaccess';
    $contents = is_file($path) && is_readable($path) ? file_get_contents($path) : false;
    if (!is_string($contents) || !str_contains($contents, 'Require all denied') || !str_contains($contents, 'Deny from all')) {
        data_root_startup_failure('DATA_SEED_MISSING', 'The runtime access-protection template is missing or invalid.');
    }
    return $contents;
}

function create_runtime_file_if_missing(string $target, string $contents): void
{
    if (file_exists($target)) {
        return;
    }
    $temporary = $target . '.init.tmp.' . bin2hex(random_bytes(6));
    $handle = fopen($temporary, 'x+b');
    if ($handle === false) {
        data_root_startup_failure('DATA_FILE_CREATE_FAILED', 'A temporary runtime initialization file could not be created.');
    }
    try {
        $offset = 0;
        $length = strlen($contents);
        while ($offset < $length) {
            $written = fwrite($handle, substr($contents, $offset));
            if ($written === false || $written === 0) {
                data_root_startup_failure('DATA_FILE_CREATE_FAILED', 'A runtime initialization file could not be written.');
            }
            $offset += $written;
        }
        if (!fflush($handle)) {
            data_root_startup_failure('DATA_FILE_CREATE_FAILED', 'A runtime initialization file could not be flushed.');
        }
        if (function_exists('fsync')) {
            fsync($handle);
        }
    } finally {
        fclose($handle);
    }

    if (file_exists($target)) {
        unlink($temporary);
        return;
    }
    if (!rename($temporary, $target)) {
        if (file_exists($target)) {
            unlink($temporary);
            return;
        }
        unlink($temporary);
        data_root_startup_failure('DATA_FILE_CREATE_FAILED', 'A runtime file could not be installed atomically: ' . basename($target));
    }
}

function initialize_runtime_data(string $dataRoot): void
{
    $lockPath = $dataRoot . DIRECTORY_SEPARATOR . '.runtime-initialization.lock';
    $lock = fopen($lockPath, 'c');
    if ($lock === false || !flock($lock, LOCK_EX)) {
        if (is_resource($lock)) {
            fclose($lock);
        }
        data_root_startup_failure('DATA_INITIALIZATION_LOCK_FAILED', 'Runtime initialization could not obtain its exclusive lock.');
    }
    try {
        $missing = array_values(array_filter(
            runtime_seed_filenames(),
            static fn (string $filename): bool => !file_exists($dataRoot . DIRECTORY_SEPARATOR . $filename)
        ));
        if ($missing !== []) {
            $templates = validated_runtime_seed_templates();
            foreach ($missing as $filename) {
                create_runtime_file_if_missing($dataRoot . DIRECTORY_SEPARATOR . $filename, $templates[$filename]);
            }
        }
        if (!file_exists($dataRoot . DIRECTORY_SEPARATOR . '.htaccess')) {
            create_runtime_file_if_missing(
                $dataRoot . DIRECTORY_SEPARATOR . '.htaccess',
                validated_runtime_access_template()
            );
        }
        create_runtime_file_if_missing($dataRoot . DIRECTORY_SEPARATOR . 'audit-log.jsonl', '');
    } finally {
        flock($lock, LOCK_UN);
        fclose($lock);
    }
}

function validate_runtime_data_root(string $dataRoot): void
{
    if (!is_dir($dataRoot)) {
        data_root_startup_failure('DATA_ROOT_NOT_DIRECTORY', 'The configured runtime data path is not a directory.');
    }
    if (!is_readable($dataRoot) || !is_writable($dataRoot)) {
        data_root_startup_failure('DATA_ROOT_NOT_WRITABLE', 'The runtime data directory must be readable and writable by PHP.');
    }

    $authPath = $dataRoot . DIRECTORY_SEPARATOR . 'auth-users.json';
    if (!is_file($authPath)) {
        data_root_startup_failure(
            'AUTH_USERS_SETUP_REQUIRED',
            'Runtime collections were initialized, but auth-users.json is missing. Create credentials securely with tools/create-auth-user.php.'
        );
    }
    $requiredJsonFiles = array_merge(['auth-users.json'], runtime_seed_filenames());
    foreach ($requiredJsonFiles as $filename) {
        $path = $dataRoot . DIRECTORY_SEPARATOR . $filename;
        if (!is_file($path)) {
            data_root_startup_failure('DATA_FILE_MISSING', 'A required runtime JSON file is missing: ' . $filename);
        }
        if (!is_readable($path) || !is_writable($path)) {
            data_root_startup_failure('DATA_FILE_NOT_WRITABLE', 'A runtime JSON file is not readable and writable: ' . $filename);
        }
        $raw = file_get_contents($path);
        $decoded = is_string($raw) ? json_decode($raw, true) : null;
        if (!is_array($decoded)) {
            data_root_startup_failure('DATA_FILE_INVALID_JSON', 'A runtime JSON file is malformed: ' . $filename);
        }
    }

    $auditPath = $dataRoot . DIRECTORY_SEPARATOR . 'audit-log.jsonl';
    if (file_exists($auditPath) && (!is_file($auditPath) || !is_readable($auditPath) || !is_writable($auditPath))) {
        data_root_startup_failure('AUDIT_FILE_NOT_WRITABLE', 'The runtime audit log must be readable and writable by PHP.');
    }
}

$configuredDataRoot = trim((string) getenv('HUMIDORHQ_DATA_ROOT'));
if ($configuredDataRoot === '') {
    $configuredDataRoot = APP_ROOT . DIRECTORY_SEPARATOR . 'data';
}
require_once API_ROOT . '/lib/Errors.php';
require_once API_ROOT . '/lib/JsonStore.php';
$resolvedDataRoot = prepare_runtime_data_directory($configuredDataRoot);
try {
    recover_interrupted_data_transaction($resolvedDataRoot);
} catch (Throwable) {
    data_root_startup_failure('DATA_TRANSACTION_RECOVERY_FAILED', 'An interrupted runtime data transaction could not be recovered safely.');
}
initialize_runtime_data($resolvedDataRoot);
validate_runtime_data_root($resolvedDataRoot);
define('DATA_ROOT', $resolvedDataRoot);

require_once API_ROOT . '/lib/Response.php';
require_once API_ROOT . '/lib/Validation.php';
require_once API_ROOT . '/lib/DataRepository.php';
require_once API_ROOT . '/lib/Auth.php';
require_once API_ROOT . '/lib/Audit.php';
require_once API_ROOT . '/lib/utils/InventoryAccounting.php';

function request_method(): string
{
    $method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
    if ($method === 'POST' && isset($_SERVER['HTTP_X_HTTP_METHOD_OVERRIDE'])) {
        return strtoupper((string) $_SERVER['HTTP_X_HTTP_METHOD_OVERRIDE']);
    }
    return $method;
}

function request_path(): string
{
    $uri = parse_url((string) ($_SERVER['REQUEST_URI'] ?? '/'), PHP_URL_PATH) ?: '/';
    $script = str_replace('\\', '/', dirname((string) ($_SERVER['SCRIPT_NAME'] ?? '/api/index.php')));
    if ($script !== '/' && str_starts_with($uri, $script)) {
        $uri = substr($uri, strlen($script));
    }
    $uri = '/' . trim($uri, '/');
    if ($uri === '/index.php') {
        return '/';
    }
    if (str_starts_with($uri, '/index.php/')) {
        return substr($uri, strlen('/index.php')) ?: '/';
    }
    return $uri;
}

function request_json(): array
{
    $raw = file_get_contents('php://input');
    if (!is_string($raw) || trim($raw) === '') {
        return [];
    }
    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) {
        throw new ApiError('REQUEST_INVALID_JSON', 'Request body must be valid JSON.', 400);
    }
    return $decoded;
}

function now_iso(): string
{
    return gmdate('Y-m-d\TH:i:s\Z');
}

function application_timezone(): DateTimeZone
{
    $configured = trim((string) getenv('HUMIDORHQ_TIMEZONE'));
    try {
        return new DateTimeZone($configured !== '' ? $configured : 'America/Indiana/Indianapolis');
    } catch (Throwable) {
        throw new ApiError('CONFIG_INVALID_TIMEZONE', 'HUMIDORHQ_TIMEZONE is not a valid timezone identifier.', 500);
    }
}

function today_local_date(): string
{
    return (new DateTimeImmutable('now', application_timezone()))->format('Y-m-d');
}




