<?php
declare(strict_types=1);

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

try {
    $path = request_path();
    $method = request_method();

    if ($path === '/health' && $method === 'GET') {
        json_success(['status' => 'ok', 'app' => 'Humidor HQ']);
    }

    if ($path === '/session' && $method === 'GET') {
        json_success(session_payload());
    }

    if ($path === '/login' && $method === 'POST') {
        json_success(login_with_credentials(request_json()));
    }

    if ($path === '/logout' && $method === 'POST') {
        json_success(logout_current_user());
    }

    if ($path === '/sample-data' && $method === 'GET') {
        require_auth();
        json_success(sample_data_collections());
    }

    if (preg_match('#^/inventory-events/([1-9][0-9]*)/smoking-journal$#', $path, $matches)) {
        require_auth();
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
