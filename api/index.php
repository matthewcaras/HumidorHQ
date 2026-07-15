<?php
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';
require_once API_ROOT . '/lib/services/SmokingJournalService.php';

try {
    $path = request_path();
    $method = request_method();

    if ($path === '/health' && $method === 'GET') {
        json_success(['status' => 'ok', 'app' => 'Humidor HQ']);
    }

    if (preg_match('#^/inventory-events/([1-9][0-9]*)/smoking-journal$#', $path, $matches)) {
        $inventoryEventId = smoking_journal_inventory_event_id_param($matches[1]);
        if ($method === 'GET') {
            json_success(get_smoking_journal($inventoryEventId));
        }
        if ($method === 'PUT') {
            json_success(upsert_smoking_journal($inventoryEventId, request_json()));
        }
        if ($method === 'DELETE') {
            json_success(delete_smoking_journal($inventoryEventId));
        }
        json_error('METHOD_NOT_ALLOWED', 'Method not allowed.', 405);
    }

    json_error('ROUTE_NOT_FOUND', 'The requested endpoint was not found.', 404);
} catch (Throwable $error) {
    handle_api_error($error);
}
