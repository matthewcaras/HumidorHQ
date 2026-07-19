<?php
declare(strict_types=1);
/*
 * Filename: bootstrap.php
 * Revision: 1.6.0
 * Description: Defines and validates the configurable HumidorHQ runtime data root before loading the API.
 * Modified Date: 2026-07-18 13:15 ET
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

function normalized_runtime_path(string $path): string
{
    $resolved = realpath($path);
    if ($resolved === false) {
        data_root_startup_failure('DATA_ROOT_MISSING', 'The configured runtime data directory does not exist.');
    }
    return rtrim($resolved, "\\/");
}

function validate_runtime_data_root(string $dataRoot): void
{
    if (!is_dir($dataRoot)) {
        data_root_startup_failure('DATA_ROOT_NOT_DIRECTORY', 'The configured runtime data path is not a directory.');
    }
    if (!is_readable($dataRoot) || !is_writable($dataRoot)) {
        data_root_startup_failure('DATA_ROOT_NOT_WRITABLE', 'The runtime data directory must be readable and writable by PHP.');
    }

    $requiredJsonFiles = [
        'auth-users.json',
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
$resolvedDataRoot = normalized_runtime_path($configuredDataRoot);
try {
    recover_interrupted_data_transaction($resolvedDataRoot);
} catch (Throwable) {
    data_root_startup_failure('DATA_TRANSACTION_RECOVERY_FAILED', 'An interrupted runtime data transaction could not be recovered safely.');
}
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




