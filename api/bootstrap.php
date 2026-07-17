<?php
declare(strict_types=1);
/*
 * Filename: bootstrap.php
 * Revision: 1.1.0
 * Description: PHP application source file for the HumidorHQ flat-file app.
 * Modified Date: 2026-07-17 12:00 ET
 */

define('APP_ROOT', dirname(__DIR__));
define('API_ROOT', __DIR__);
$configuredDataRoot = trim((string) getenv('HUMIDORHQ_DATA_ROOT'));
define('DATA_ROOT', $configuredDataRoot !== ''
    ? rtrim($configuredDataRoot, "\\/")
    : APP_ROOT . DIRECTORY_SEPARATOR . 'data');

require_once API_ROOT . '/lib/Errors.php';
require_once API_ROOT . '/lib/Response.php';
require_once API_ROOT . '/lib/Validation.php';
require_once API_ROOT . '/lib/JsonStore.php';
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




