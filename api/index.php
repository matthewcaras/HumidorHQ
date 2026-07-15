<?php
declare(strict_types=1);
/*
 * Filename: index.php
 * Revision: 1.0.0
 * Description: PHP application source file for the HumidorHQ flat-file app.
 * Modified Date: 2026-07-15 00:13 ET
 */

require_once __DIR__ . '/bootstrap.php';
require_once API_ROOT . '/lib/services/SmokingJournalService.php';

function sample_data_collections(): array
{
    $collections = [
        'catalog-cigars',
        'vendors',
        'storage-locations',
        'storage-sub-locations',
        'purchases',
        'purchase-lines',
        'lots',
        'lot-location-balances',
        'inventory-events',
        'smoking-journal-entries',
    ];

    $summary = [];
    foreach ($collections as $collection) {
        $rows = load_collection($collection);
        $summary[$collection] = [
            'count' => count($rows),
            'source' => 'data/' . $collection . '.json',
        ];
    }

    return [
        'generatedAt' => now_iso(),
        'collections' => $summary,
    ];
}


function app_meta_payload(): array
{
    $changelogPath = APP_ROOT . DIRECTORY_SEPARATOR . 'CHANGELOG.md';
    $content = file_exists($changelogPath) ? file_get_contents($changelogPath) : '';
    $revision = '0.0.0';
    if (is_string($content) && preg_match('/^##\s+(\d+\.\d+\.\d+)\s+-/m', $content, $matches)) {
        $revision = $matches[1];
    }

    $paths = [
        APP_ROOT . DIRECTORY_SEPARATOR . 'CHANGELOG.md',
        APP_ROOT . DIRECTORY_SEPARATOR . 'README.md',
        APP_ROOT . DIRECTORY_SEPARATOR . 'index.html',
        APP_ROOT . DIRECTORY_SEPARATOR . 'api',
        APP_ROOT . DIRECTORY_SEPARATOR . 'public',
        APP_ROOT . DIRECTORY_SEPARATOR . 'data',
        APP_ROOT . DIRECTORY_SEPARATOR . 'tests',
        APP_ROOT . DIRECTORY_SEPARATOR . 'tools',
    ];
    $latest = 0;
    foreach ($paths as $path) {
        if (is_file($path)) {
            $latest = max($latest, (int) filemtime($path));
            continue;
        }
        if (!is_dir($path)) {
            continue;
        }
        $iterator = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator($path, FilesystemIterator::SKIP_DOTS)
        );
        foreach ($iterator as $fileInfo) {
            if (!$fileInfo->isFile()) {
                continue;
            }
            $name = $fileInfo->getFilename();
            if ($name === 'auth-users.json' || $name === 'audit-log.jsonl' || str_ends_with($name, '.lock') || str_contains($name, '.tmp')) {
                continue;
            }
            $latest = max($latest, (int) $fileInfo->getMTime());
        }
    }

    $modified = new DateTimeImmutable('@' . ($latest > 0 ? $latest : time()));
    $modified = $modified->setTimezone(new DateTimeZone('America/New_York'));

    return [
        'revision' => $revision,
        'modifiedEt' => $modified->format('Y-m-d g:i A') . ' ET',
    ];
}
function changelog_payload(): array
{
    $path = APP_ROOT . DIRECTORY_SEPARATOR . 'CHANGELOG.md';
    $content = file_exists($path) ? file_get_contents($path) : '';
    if (!is_string($content)) {
        throw new ApiError('CHANGELOG_READ_FAILED', 'Changelog could not be read.', 500);
    }
    return ['content' => $content];
}

try {
    $path = request_path();
    $method = request_method();

    if ($path === '/health' && $method === 'GET') {
        json_success(['status' => 'ok', 'app' => 'Humidor HQ']);
    }

    if ($path === '/app-meta' && $method === 'GET') {
        json_success(app_meta_payload());
    }

    if ($path === '/session' && $method === 'GET') {
        json_success(session_payload());
    }

    if ($path === '/login' && $method === 'POST') {
        $payload = login_with_credentials(request_json());
        audit_record('Authentication', 'login');
        json_success($payload);
    }

    if ($path === '/logout' && $method === 'POST') {
        audit_record('Authentication', 'logout');
        json_success(logout_current_user());
    }

    if ($path === '/sample-data' && $method === 'GET') {
        require_auth();
        audit_record('Dashboard', 'load sample data');
        json_success(sample_data_collections());
    }

    if ($path === '/audit/page' && $method === 'POST') {
        require_auth();
        $input = audit_page_input(request_json());
        audit_record($input['page'], $input['action']);
        json_success(['logged' => true]);
    }

    if ($path === '/audit' && $method === 'GET') {
        require_auth();
        audit_record('Audit', 'view');
        json_success(get_audit_records());
    }

    if ($path === '/changelog' && $method === 'GET') {
        require_auth();
        audit_record('Changelog', 'view');
        json_success(changelog_payload());
    }

    if (preg_match('#^/inventory-events/([1-9][0-9]*)/smoking-journal$#', $path, $matches)) {
        require_auth();
        $inventoryEventId = smoking_journal_inventory_event_id_param($matches[1]);
        if ($method === 'GET') {
            audit_record('Smoking Journal', 'view', ['inventoryEventId' => $inventoryEventId]);
            json_success(get_smoking_journal($inventoryEventId));
        }
        if ($method === 'PUT') {
            audit_record('Smoking Journal', 'save', ['inventoryEventId' => $inventoryEventId]);
            json_success(upsert_smoking_journal($inventoryEventId, request_json()));
        }
        if ($method === 'DELETE') {
            audit_record('Smoking Journal', 'delete', ['inventoryEventId' => $inventoryEventId]);
            json_success(delete_smoking_journal($inventoryEventId));
        }
        json_error('METHOD_NOT_ALLOWED', 'Method not allowed.', 405);
    }

    json_error('ROUTE_NOT_FOUND', 'The requested endpoint was not found.', 404);
} catch (Throwable $error) {
    handle_api_error($error);
}









