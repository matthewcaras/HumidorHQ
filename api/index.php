<?php
declare(strict_types=1);
/*
 * Filename: index.php
 * Revision: 1.3.1
 * Description: PHP API router and flat-file record workflow handlers for HumidorHQ.
 * Modified Date: 2026-07-16 09:45 ET
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
function todo_payload(): array
{
    $path = APP_ROOT . DIRECTORY_SEPARATOR . 'TODO.md';
    $content = file_exists($path) ? file_get_contents($path) : '';
    if (!is_string($content)) {
        throw new ApiError('TODO_READ_FAILED', 'Todo list could not be read.', 500);
    }
    return ['content' => $content];
}
function managed_collection_configs(): array
{
    return [
        'catalog-cigars' => [
            'page' => 'Catalog',
            'label' => 'Catalog Cigar',
            'required' => ['manufacturer', 'series'],
            'text' => ['manufacturer', 'series', 'vitola', 'shape', 'length', 'wrapper', 'binder', 'filler', 'country', 'strength', 'notes'],
            'int' => ['ringGauge'],
            'money' => ['msrp'],
        ],
        'vendors' => [
            'page' => 'Vendors',
            'label' => 'Vendor',
            'required' => ['name'],
            'text' => ['name', 'website', 'contactName', 'email', 'phone', 'notes'],
            'int' => [],
            'money' => [],
        ],
        'storage-locations' => [
            'page' => 'Humidors',
            'label' => 'Humidor',
            'required' => ['name'],
            'text' => ['name', 'type', 'notes'],
            'int' => ['capacity'],
            'money' => [],
        ],
        'storage-sub-locations' => [
            'page' => 'Humidor Sections',
            'label' => 'Humidor Section',
            'required' => ['storageLocationId', 'name'],
            'text' => ['name', 'type', 'notes'],
            'int' => ['storageLocationId', 'capacity'],
            'money' => [],
        ],
        'purchases' => [
            'page' => 'Purchases',
            'label' => 'Purchase',
            'required' => ['purchaseDate', 'status'],
            'text' => ['invoiceNumber', 'purchaseDate', 'expectedDate', 'receivedDate', 'status', 'trackingNumber', 'notes'],
            'int' => ['vendorId'],
            'money' => ['shipping', 'exciseTax', 'salesTax', 'discount', 'totalPaid'],
        ],
        'purchase-lines' => [
            'page' => 'PO Lines',
            'label' => 'Purchase Line',
            'required' => ['purchaseId', 'catalogCigarId', 'storageLocationId', 'quantity'],
            'text' => ['notes'],
            'int' => ['purchaseId', 'catalogCigarId', 'storageLocationId', 'quantity'],
            'money' => ['unitCost'],
        ],
        'lots' => [
            'page' => 'Reports',
            'label' => 'Lot',
            'readOnly' => true,
            'required' => [],
            'text' => [],
            'int' => [],
            'money' => [],
        ],
        'lot-location-balances' => [
            'page' => 'Reports',
            'label' => 'Location Balance',
            'readOnly' => true,
            'required' => [],
            'text' => [],
            'int' => [],
            'money' => [],
        ],
        'inventory-events' => [
            'page' => 'Reports',
            'label' => 'Inventory Event',
            'readOnly' => true,
            'required' => [],
            'text' => [],
            'int' => [],
            'money' => [],
        ],
    ];
}

function managed_collection_config(string $collection): array
{
    $configs = managed_collection_configs();
    if (!isset($configs[$collection])) {
        throw new ApiError('COLLECTION_NOT_MANAGED', 'This collection cannot be managed through this endpoint.', 404);
    }
    return $configs[$collection];
}

function clean_text_field(array $input, string $field): string
{
    return trim((string) ($input[$field] ?? ''));
}

function clean_optional_int(array $input, string $field): ?int
{
    $value = trim((string) ($input[$field] ?? ''));
    if ($value === '') {
        return null;
    }
    if (!preg_match('/^-?[0-9]+$/', $value)) {
        throw new ApiError('VALIDATION_ERROR', $field . ' must be a whole number.', 422);
    }
    return (int) $value;
}

function clean_optional_money(array $input, string $field): ?float
{
    $value = trim((string) ($input[$field] ?? ''));
    if ($value === '') {
        return null;
    }
    if (!is_numeric($value)) {
        throw new ApiError('VALIDATION_ERROR', $field . ' must be a number.', 422);
    }
    return round((float) $value, 2);
}

function clean_managed_record(string $collection, array $input, ?array $existing = null): array
{
    $config = managed_collection_config($collection);
    $record = $existing ?? [];

    foreach ($config['text'] as $field) {
        $record[$field] = clean_text_field($input, $field);
    }
    foreach ($config['int'] as $field) {
        $record[$field] = clean_optional_int($input, $field);
    }
    foreach ($config['money'] as $field) {
        $record[$field] = clean_optional_money($input, $field);
    }

    foreach ($config['required'] as $field) {
        if (trim((string) ($record[$field] ?? '')) === '') {
            throw new ApiError('VALIDATION_ERROR', $field . ' is required.', 422);
        }
    }

    if ($collection === 'purchases' && isset($record['vendorId']) && $record['vendorId'] !== null && !find_by_id('vendors', (int) $record['vendorId'])) {
        throw new ApiError('VALIDATION_ERROR', 'Selected vendor was not found.', 422);
    }
    if ($collection === 'purchases') {
        validate_purchase_status($record);
    }
    if ($collection === 'storage-sub-locations') {
        validate_storage_sub_location_links($record);
    }
    if ($collection === 'purchase-lines') {
        validate_purchase_line_links($record);
    }

    $record['updatedAt'] = now_iso();
    if (!isset($record['createdAt'])) {
        $record['createdAt'] = $record['updatedAt'];
    }
    return $record;
}

function validate_purchase_status(array $record): void
{
    $allowed = ['in-route', 'partially-received', 'received'];
    if (!in_array((string) ($record['status'] ?? ''), $allowed, true)) {
        throw new ApiError('VALIDATION_ERROR', 'status must be in-route, partially-received, or received.', 422);
    }
}

function validate_storage_sub_location_links(array $record): void
{
    $id = (int) ($record['storageLocationId'] ?? 0);
    if ($id < 1 || !find_by_id('storage-locations', $id)) {
        throw new ApiError('VALIDATION_ERROR', 'Selected humidor was not found.', 422);
    }
}

function validate_purchase_line_links(array $record): void
{
    $quantity = (int) ($record['quantity'] ?? 0);
    if ($quantity < 1) {
        throw new ApiError('VALIDATION_ERROR', 'quantity must be at least 1.', 422);
    }

    $links = [
        'purchaseId' => ['collection' => 'purchases', 'label' => 'Selected purchase'],
        'catalogCigarId' => ['collection' => 'catalog-cigars', 'label' => 'Selected catalog cigar'],
        'storageLocationId' => ['collection' => 'storage-locations', 'label' => 'Selected humidor'],
    ];
    foreach ($links as $field => $link) {
        $id = (int) ($record[$field] ?? 0);
        if ($id < 1 || !find_by_id($link['collection'], $id)) {
            throw new ApiError('VALIDATION_ERROR', $link['label'] . ' was not found.', 422);
        }
    }
}

function create_inventory_records_for_purchase_line(array $line): array
{
    $now = now_iso();
    $quantity = (int) $line['quantity'];
    $lot = [
        'id' => next_id('lots'),
        'purchaseLineId' => (int) $line['id'],
        'purchaseId' => (int) $line['purchaseId'],
        'catalogCigarId' => (int) $line['catalogCigarId'],
        'initialQuantity' => $quantity,
        'currentQuantity' => $quantity,
        'createdAt' => $now,
        'updatedAt' => $now,
    ];
    $lots = load_collection('lots');
    $lots[] = $lot;
    save_collection('lots', $lots);

    $balance = [
        'id' => next_id('lot-location-balances'),
        'lotId' => (int) $lot['id'],
        'storageLocationId' => (int) $line['storageLocationId'],
        'quantity' => $quantity,
        'createdAt' => $now,
        'updatedAt' => $now,
    ];
    $balances = load_collection('lot-location-balances');
    $balances[] = $balance;
    save_collection('lot-location-balances', $balances);

    $event = [
        'id' => next_id('inventory-events'),
        'eventType' => 'purchase-receipt',
        'lotId' => (int) $lot['id'],
        'purchaseLineId' => (int) $line['id'],
        'purchaseId' => (int) $line['purchaseId'],
        'catalogCigarId' => (int) $line['catalogCigarId'],
        'storageLocationId' => (int) $line['storageLocationId'],
        'quantity' => $quantity,
        'occurredAt' => $now,
        'notes' => 'Created from purchase line ' . (int) $line['id'],
        'createdAt' => $now,
        'updatedAt' => $now,
    ];
    $events = load_collection('inventory-events');
    $events[] = $event;
    save_collection('inventory-events', $events);

    return ['lot' => $lot, 'balance' => $balance, 'event' => $event];
}
function list_managed_records(string $collection): array
{
    managed_collection_config($collection);
    return ['records' => load_collection($collection)];
}

function create_managed_record(string $collection, array $input): array
{
    $config = managed_collection_config($collection);
    if ((bool) ($config['readOnly'] ?? false)) {
        throw new ApiError('COLLECTION_READ_ONLY', 'This collection is read-only through this endpoint.', 405);
    }
    $rows = load_collection($collection);
    $record = clean_managed_record($collection, $input);
    $record['id'] = next_id($collection);
    $rows[] = $record;
    save_collection($collection, $rows);
    if ($collection === 'purchase-lines') {
        $created = create_inventory_records_for_purchase_line($record);
        $record['createdLotId'] = $created['lot']['id'];
        $record['createdInventoryEventId'] = $created['event']['id'];
    }
    audit_record($config['page'], 'create ' . $config['label'], ['collection' => $collection, 'id' => $record['id']]);
    return $record;
}

function update_managed_record(string $collection, int $id, array $input): array
{
    $config = managed_collection_config($collection);
    if ((bool) ($config['readOnly'] ?? false)) {
        throw new ApiError('COLLECTION_READ_ONLY', 'This collection is read-only through this endpoint.', 405);
    }
    $rows = load_collection($collection);
    foreach ($rows as $index => $row) {
        if (is_array($row) && (int) ($row['id'] ?? 0) === $id) {
            $updated = clean_managed_record($collection, $input, $row);
            $updated['id'] = $id;
            $rows[$index] = $updated;
            save_collection($collection, $rows);
            audit_record($config['page'], 'update ' . $config['label'], ['collection' => $collection, 'id' => $id]);
            return $updated;
        }
    }
    throw new ApiError('RECORD_NOT_FOUND', $config['label'] . ' was not found.', 404);
}

function delete_managed_record(string $collection, int $id): array
{
    $config = managed_collection_config($collection);
    if ((bool) ($config['readOnly'] ?? false)) {
        throw new ApiError('COLLECTION_READ_ONLY', 'This collection is read-only through this endpoint.', 405);
    }
    $rows = load_collection($collection);
    foreach ($rows as $index => $row) {
        if (is_array($row) && (int) ($row['id'] ?? 0) === $id) {
            $deleted = $row;
            array_splice($rows, $index, 1);
            save_collection($collection, $rows);
            audit_record($config['page'], 'delete ' . $config['label'], ['collection' => $collection, 'id' => $id]);
            return $deleted;
        }
    }
    throw new ApiError('RECORD_NOT_FOUND', $config['label'] . ' was not found.', 404);
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


    if ($path === '/todo' && $method === 'GET') {
        require_auth();
        audit_record('Todo', 'view');
        json_success(todo_payload());
    }
    if (preg_match('#^/records/([a-z0-9\-]+)$#', $path, $matches)) {
        require_auth();
        $collection = $matches[1];
        if ($method === 'GET') {
            audit_record('Collection', 'list records', ['collection' => $collection]);
            json_success(list_managed_records($collection));
        }
        if ($method === 'POST') {
            json_success(create_managed_record($collection, request_json()), 201);
        }
        json_error('METHOD_NOT_ALLOWED', 'Method not allowed.', 405);
    }

    if (preg_match('#^/records/([a-z0-9\-]+)/([1-9][0-9]*)$#', $path, $matches)) {
        require_auth();
        $collection = $matches[1];
        $id = positive_int_param($matches[2], 'record id');
        if ($method === 'PUT') {
            json_success(update_managed_record($collection, $id, request_json()));
        }
        if ($method === 'DELETE') {
            json_success(delete_managed_record($collection, $id));
        }
        json_error('METHOD_NOT_ALLOWED', 'Method not allowed.', 405);
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

