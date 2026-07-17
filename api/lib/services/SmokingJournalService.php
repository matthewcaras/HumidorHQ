<?php
declare(strict_types=1);
/*
 * Filename: SmokingJournalService.php
 * Revision: 1.1.0
 * Description: PHP application source file for the HumidorHQ flat-file app.
 * Modified Date: 2026-07-17 17:30 ET
 */

const JOURNAL_PROTECTED_BODY_FIELDS = [
    'inventoryEventId',
    'eventType',
    'eventDate',
    'quantity',
    'lotId',
    'fromStorageSubLocationId',
    'sourceLocation',
    'costPerCigarAtEvent',
    'msrpPerCigarAtEvent',
    'createdAt',
    'updatedAt',
];

function smoking_journal_inventory_event_id_param(string $value): int
{
    return positive_int_param($value, 'InventoryEvent id', 'JOURNAL_VALIDATION_ERROR');
}

function journal_error(string $code, string $message, int $status): never
{
    throw new ApiError($code, $message, $status);
}

function smoking_journal_find_event(int $inventoryEventId): array
{
    $event = find_by_id('inventory-events', $inventoryEventId);
    if ($event === null) {
        journal_error('JOURNAL_EVENT_NOT_FOUND', 'Smoking event was not found.', 404);
    }
    if (($event['eventType'] ?? null) !== 'SMOKED') {
        journal_error('JOURNAL_EVENT_NOT_SMOKED', 'Smoking Journal entries can only be attached to smoked events.', 409);
    }
    return $event;
}

function smoking_journal_parse_input(array $input): array
{
    foreach (JOURNAL_PROTECTED_BODY_FIELDS as $field) {
        if (array_key_exists($field, $input)) {
            journal_error('JOURNAL_VALIDATION_ERROR', $field . ' cannot be supplied in the request body.', 400);
        }
    }
    foreach (array_keys($input) as $field) {
        if ($field !== 'rating' && $field !== 'notes') {
            journal_error('JOURNAL_VALIDATION_ERROR', 'Only rating and notes may be supplied.', 400);
        }
    }
    if (!array_key_exists('rating', $input) || !is_int($input['rating'])) {
        journal_error('JOURNAL_INVALID_RATING', 'rating must be a whole number from 1 to 10.', 400);
    }
    if ($input['rating'] < 1 || $input['rating'] > 10) {
        journal_error('JOURNAL_INVALID_RATING', 'rating must be from 1 to 10.', 400);
    }
    $notes = null;
    if (array_key_exists('notes', $input)) {
        if (!is_string($input['notes'])) {
            journal_error('JOURNAL_VALIDATION_ERROR', 'notes must be a string.', 400);
        }
        $trimmed = trim($input['notes']);
        if ($trimmed !== '') {
            if (strlen($trimmed) > 2000) {
                journal_error('JOURNAL_VALIDATION_ERROR', 'notes must be 2000 characters or fewer.', 400);
            }
            $notes = $trimmed;
        }
    }
    return ['rating' => $input['rating'], 'notes' => $notes];
}

function smoking_journal_catalog_cigar(?array $lot): ?array
{
    if ($lot === null) {
        return null;
    }
    $catalogCigar = null;
    if (isset($lot['catalogCigar']) && is_array($lot['catalogCigar'])) {
        $catalogCigar = $lot['catalogCigar'];
    } elseif (isset($lot['catalogCigarId'])) {
        $catalogCigar = find_by_id('catalog-cigars', (int) $lot['catalogCigarId']);
    }
    if ($catalogCigar === null) {
        return null;
    }
    return [
        'id' => (int) ($catalogCigar['id'] ?? 0),
        'manufacturer' => (string) ($catalogCigar['manufacturer'] ?? ''),
        'series' => (string) ($catalogCigar['series'] ?? ''),
        'vitola' => (string) ($catalogCigar['vitola'] ?? ''),
        'wrapper' => $catalogCigar['wrapper'] ?? null,
        'isActive' => (bool) ($catalogCigar['isActive'] ?? true),
    ];
}

function smoking_journal_location_snapshot(?array $source): ?array
{
    if ($source === null) {
        return null;
    }
    $storageLocation = null;
    if (isset($source['storageLocation']) && is_array($source['storageLocation'])) {
        $storageLocation = $source['storageLocation'];
    } elseif (isset($source['storageLocationId'])) {
        $storageLocation = find_by_id('storage-locations', (int) $source['storageLocationId']);
    }
    if ($storageLocation === null) {
        return null;
    }
    $locationActive = (bool) ($storageLocation['isActive'] ?? true);
    $subLocationActive = (bool) ($source['isActive'] ?? true);
    return [
        'storageLocationId' => (int) ($storageLocation['id'] ?? 0),
        'storageLocationName' => (string) ($storageLocation['name'] ?? ''),
        'storageLocationIsActive' => $locationActive,
        'storageSubLocationId' => (int) ($source['id'] ?? 0),
        'storageSubLocationName' => (string) ($source['name'] ?? ''),
        'storageSubLocationKind' => (string) ($source['kind'] ?? 'GENERAL'),
        'storageSubLocationIsActive' => $subLocationActive,
        'isArchived' => !$locationActive || !$subLocationActive,
    ];
}

function smoking_journal_entry_public(?array $entry): ?array
{
    if ($entry === null) {
        return null;
    }
    return [
        'id' => (int) $entry['id'],
        'inventoryEventId' => (int) $entry['inventoryEventId'],
        'rating' => (int) $entry['rating'],
        'notes' => $entry['notes'] ?? null,
        'createdAt' => (string) $entry['createdAt'],
        'updatedAt' => (string) $entry['updatedAt'],
    ];
}

function smoking_journal_build_response(array $event, ?array $entry): array
{
    $lot = isset($event['lot']) && is_array($event['lot'])
        ? $event['lot']
        : (isset($event['lotId']) ? find_by_id('lots', (int) $event['lotId']) : null);
    $source = isset($event['fromStorageSubLocation']) && is_array($event['fromStorageSubLocation'])
        ? $event['fromStorageSubLocation']
        : (isset($event['fromStorageSubLocationId']) ? find_by_id('storage-sub-locations', (int) $event['fromStorageSubLocationId']) : null);

    return [
        'journalEntry' => smoking_journal_entry_public($entry),
        'inventoryEvent' => [
            'id' => (int) $event['id'],
            'eventType' => 'SMOKED',
            'quantity' => (int) ($event['quantity'] ?? 0),
            'eventDate' => (string) ($event['eventDate'] ?? ''),
            'createdAt' => (string) ($event['createdAt'] ?? ''),
            'lotId' => (int) ($event['lotId'] ?? 0),
            'catalogCigar' => smoking_journal_catalog_cigar($lot),
            'sourceLocation' => smoking_journal_location_snapshot($source),
            'costPerCigarAtEvent' => decimal_to_string($event['costPerCigarAtEvent'] ?? null),
            'msrpPerCigarAtEvent' => decimal_to_string($event['msrpPerCigarAtEvent'] ?? null),
        ],
    ];
}

function get_smoking_journal(int $inventoryEventId): array
{
    $event = smoking_journal_find_event($inventoryEventId);
    $entry = find_first_by_field('smoking-journal-entries', 'inventoryEventId', $inventoryEventId);
    return smoking_journal_build_response($event, $entry);
}

function upsert_smoking_journal(int $inventoryEventId, array $input): array
{
    if (!data_transaction_active()) {
        return with_data_transaction(static fn (): array => upsert_smoking_journal($inventoryEventId, $input));
    }
    $event = smoking_journal_find_event($inventoryEventId);
    $data = smoking_journal_parse_input($input);
    $now = now_iso();
    $entry = upsert_by_field(
        'smoking-journal-entries',
        'inventoryEventId',
        $inventoryEventId,
        function () use ($inventoryEventId, $data, $now): array {
            return [
                'id' => next_id('smoking-journal-entries'),
                'inventoryEventId' => $inventoryEventId,
                'rating' => $data['rating'],
                'notes' => $data['notes'],
                'createdAt' => $now,
                'updatedAt' => $now,
            ];
        },
        function (array $existing) use ($data, $now): array {
            $existing['rating'] = $data['rating'];
            $existing['notes'] = $data['notes'];
            $existing['updatedAt'] = $now;
            return $existing;
        }
    );
    return smoking_journal_build_response($event, $entry);
}

function delete_smoking_journal(int $inventoryEventId): array
{
    if (!data_transaction_active()) {
        return with_data_transaction(static fn (): array => delete_smoking_journal($inventoryEventId));
    }
    $event = smoking_journal_find_event($inventoryEventId);
    delete_by_field('smoking-journal-entries', 'inventoryEventId', $inventoryEventId);
    return smoking_journal_build_response($event, null);
}


