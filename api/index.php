<?php
declare(strict_types=1);
/*
 * Filename: index.php
 * Revision: 1.6.0
 * Description: PHP API router and flat-file record workflow handlers for HumidorHQ.
 * Modified Date: 2026-07-17 12:00 ET
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
            'source' => 'external-runtime/' . $collection . '.json',
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
        APP_ROOT . DIRECTORY_SEPARATOR . 'seed-data',
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
            'money' => ['subtotal', 'shipping', 'exciseTax', 'salesTax', 'discount', 'totalPaid'],
        ],
        'purchase-lines' => [
            'page' => 'PO Lines',
            'label' => 'Purchase Line',
            'required' => ['purchaseId', 'catalogCigarId', 'quantity'],
            'text' => ['notes'],
            'int' => ['purchaseId', 'catalogCigarId', 'storageLocationId', 'storageSubLocationId', 'quantity'],
            'money' => ['purchasePrice', 'unitCost', 'msrpPerCigar'],
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

function money_to_cents(mixed $value): int
{
    if ($value === null || $value === '') {
        return 0;
    }

    return (int) round((float) $value * 100);
}

function cents_to_money(int $value): float
{
    return round($value / 100, 2);
}

function line_subtotal_cents(array $line): int
{
    if (isset($line['purchasePrice']) && $line['purchasePrice'] !== null && $line['purchasePrice'] !== '') {
        return money_to_cents($line['purchasePrice']);
    }
    return (int) ($line['quantity'] ?? 0) * money_to_cents($line['unitCost'] ?? null);
}

function purchase_lookup_index(array $rows): array
{
    $indexed = [];
    foreach ($rows as $row) {
        if (is_array($row) && isset($row['id'])) {
            $indexed[(int) $row['id']] = $row;
        }
    }
    return $indexed;
}

function allocate_cents_by_weight(int $totalCents, array $weightsByKey): array
{
    $keys = array_keys($weightsByKey);
    if (count($keys) === 0) {
        return [];
    }

    $totalWeight = array_sum(array_map(
        static fn (mixed $weight): float => max(0.0, (float) $weight),
        array_values($weightsByKey)
    ));

    if ($totalWeight <= 0) {
        $totalWeight = (float) count($keys);
        $weightsByKey = array_fill_keys($keys, 1.0);
    }

    $allocated = [];
    $running = 0;
    $lastKey = $keys[array_key_last($keys)];

    foreach ($keys as $key) {
        if ($key === $lastKey) {
            $allocated[$key] = $totalCents - $running;
            break;
        }

        $share = (int) round($totalCents * ((float) $weightsByKey[$key] / $totalWeight));
        $allocated[$key] = $share;
        $running += $share;
    }

    return $allocated;
}

function purchase_line_ids_for_purchase(int $purchaseId): array
{
    return array_values(array_filter(
        load_collection('purchase-lines'),
        static fn (mixed $row): bool => is_array($row) && (int) ($row['purchaseId'] ?? 0) === $purchaseId
    ));
}

function normalized_relationship_id(mixed $value): ?int
{
    if ($value === null || trim((string) $value) === '') {
        return null;
    }
    $normalized = (int) $value;
    return $normalized > 0 ? $normalized : null;
}

function row_references_id(array $row, array $fields, int $id): bool
{
    foreach ($fields as $field) {
        if (normalized_relationship_id($row[$field] ?? null) === $id) {
            return true;
        }
    }
    return false;
}

function collection_references_id(string $collection, array $fields, int $id): bool
{
    foreach (load_collection($collection) as $row) {
        if (is_array($row) && row_references_id($row, $fields, $id)) {
            return true;
        }
    }
    return false;
}

function purchase_line_relationship_summary(int $purchaseLineId): array
{
    $lots = array_values(array_filter(
        load_collection('lots'),
        static fn (mixed $row): bool => is_array($row) && (int) ($row['purchaseLineId'] ?? 0) === $purchaseLineId
    ));
    $lotIds = array_map(static fn (array $row): int => (int) ($row['id'] ?? 0), $lots);
    $balances = array_values(array_filter(
        load_collection('lot-location-balances'),
        static fn (mixed $row): bool => is_array($row) && (
            (int) ($row['purchaseLineId'] ?? 0) === $purchaseLineId
            || in_array((int) ($row['lotId'] ?? 0), $lotIds, true)
        )
    ));
    $events = array_values(array_filter(
        load_collection('inventory-events'),
        static fn (mixed $row): bool => is_array($row) && (
            (int) ($row['purchaseLineId'] ?? 0) === $purchaseLineId
            || in_array((int) ($row['lotId'] ?? 0), $lotIds, true)
        )
    ));
    $eventIds = array_map(static fn (array $row): int => (int) ($row['id'] ?? 0), $events);
    $journalEntries = array_values(array_filter(
        load_collection('smoking-journal-entries'),
        static fn (mixed $row): bool => is_array($row)
            && in_array((int) ($row['inventoryEventId'] ?? 0), $eventIds, true)
    ));

    return [
        'lots' => $lots,
        'balances' => $balances,
        'events' => $events,
        'journalEntries' => $journalEntries,
        'hasHistory' => count($lots) > 0 || count($balances) > 0 || count($events) > 0 || count($journalEntries) > 0,
    ];
}

function purchase_relationship_summary(int $purchaseId): array
{
    $lines = purchase_line_ids_for_purchase($purchaseId);
    $lineIds = array_map(static fn (array $row): int => (int) ($row['id'] ?? 0), $lines);
    $lots = array_values(array_filter(
        load_collection('lots'),
        static fn (mixed $row): bool => is_array($row) && (
            (int) ($row['purchaseId'] ?? 0) === $purchaseId
            || in_array((int) ($row['purchaseLineId'] ?? 0), $lineIds, true)
        )
    ));
    $lotIds = array_map(static fn (array $row): int => (int) ($row['id'] ?? 0), $lots);
    $balances = array_values(array_filter(
        load_collection('lot-location-balances'),
        static fn (mixed $row): bool => is_array($row) && (
            (int) ($row['purchaseId'] ?? 0) === $purchaseId
            || in_array((int) ($row['purchaseLineId'] ?? 0), $lineIds, true)
            || in_array((int) ($row['lotId'] ?? 0), $lotIds, true)
        )
    ));
    $events = array_values(array_filter(
        load_collection('inventory-events'),
        static fn (mixed $row): bool => is_array($row) && (
            (int) ($row['purchaseId'] ?? 0) === $purchaseId
            || in_array((int) ($row['purchaseLineId'] ?? 0), $lineIds, true)
            || in_array((int) ($row['lotId'] ?? 0), $lotIds, true)
        )
    ));
    return [
        'lines' => $lines,
        'lots' => $lots,
        'balances' => $balances,
        'events' => $events,
        'hasRelationships' => count($lines) > 0 || count($lots) > 0 || count($balances) > 0 || count($events) > 0,
        'hasInventory' => count($lots) > 0 || count($balances) > 0 || count($events) > 0,
    ];
}

function purchase_inventory_is_locked(int $purchaseId): bool
{
    $purchase = find_by_id('purchases', $purchaseId);
    if ($purchase === null) {
        return false;
    }
    if (normalize_purchase_status_value((string) ($purchase['status'] ?? 'pending')) === 'received') {
        return true;
    }
    return (purchase_relationship_summary($purchaseId)['hasInventory'] ?? false) === true;
}

function purchase_line_is_inventory_locked(array $line, int $purchaseLineId): bool
{
    if ((purchase_line_relationship_summary($purchaseLineId)['hasHistory'] ?? false) === true) {
        return true;
    }
    $purchaseId = (int) ($line['purchaseId'] ?? 0);
    return $purchaseId > 0 && purchase_inventory_is_locked($purchaseId);
}

function managed_fields_changed(array $before, array $after, array $fields): array
{
    $changed = [];
    foreach ($fields as $field) {
        $beforeValue = $before[$field] ?? null;
        $afterValue = $after[$field] ?? null;
        if (in_array($field, ['purchaseId', 'catalogCigarId', 'storageLocationId', 'storageSubLocationId', 'quantity', 'vendorId'], true)) {
            $isChanged = normalized_relationship_id($beforeValue) !== normalized_relationship_id($afterValue);
        } elseif ($field === 'status') {
            $isChanged = normalize_purchase_status_value((string) $beforeValue) !== normalize_purchase_status_value((string) $afterValue);
        } else {
            $isChanged = (string) ($beforeValue ?? '') !== (string) ($afterValue ?? '');
        }
        if ($isChanged) {
            $changed[] = $field;
        }
    }
    return $changed;
}

function sync_purchase_inventory(int $purchaseId): void
{
    $purchase = find_by_id('purchases', $purchaseId);
    if (!$purchase) {
        return;
    }
    $purchaseStatus = normalize_purchase_status_value((string) ($purchase['status'] ?? 'pending'));
    $isReceived = $purchaseStatus === 'received';

    $allLines = load_collection('purchase-lines');
    $catalogById = purchase_lookup_index(load_collection('catalog-cigars'));
    $now = now_iso();

    $purchaseLines = [];
    foreach ($allLines as $row) {
        if (is_array($row) && (int) ($row['purchaseId'] ?? 0) === $purchaseId) {
            $purchaseLines[] = $row;
        }
    }

    $weights = [];
    foreach ($purchaseLines as $line) {
        $subtotal = line_subtotal_cents($line);
        $weights[(int) $line['id']] = $subtotal > 0 ? $subtotal : max(1, (int) ($line['quantity'] ?? 0));
    }

    $allocatedShipping = allocate_cents_by_weight(money_to_cents($purchase['shipping'] ?? null), $weights);
    $allocatedExciseTax = allocate_cents_by_weight(money_to_cents($purchase['exciseTax'] ?? null), $weights);
    $allocatedSalesTax = allocate_cents_by_weight(money_to_cents($purchase['salesTax'] ?? null), $weights);
    $allocatedDiscount = allocate_cents_by_weight(money_to_cents($purchase['discount'] ?? null), $weights);

    $updatedLinesById = [];
    foreach ($purchaseLines as $line) {
        $lineId = (int) $line['id'];
        if ((purchase_line_relationship_summary($lineId)['hasHistory'] ?? false) === true) {
            $updatedLinesById[$lineId] = $line;
            continue;
        }
        $quantity = max(1, (int) ($line['quantity'] ?? 0));
        $subtotalCents = line_subtotal_cents($line);
        $trueCostBasisCents = $subtotalCents
            + ($allocatedShipping[$lineId] ?? 0)
            + ($allocatedExciseTax[$lineId] ?? 0)
            + ($allocatedSalesTax[$lineId] ?? 0)
            - ($allocatedDiscount[$lineId] ?? 0);
        $catalog = $catalogById[(int) ($line['catalogCigarId'] ?? 0)] ?? null;
        $resolvedMsrp = $line['msrpPerCigar'] ?? ($catalog['msrp'] ?? null);

        $line['lineSubtotal'] = cents_to_money($subtotalCents);
        $line['allocatedShipping'] = cents_to_money($allocatedShipping[$lineId] ?? 0);
        $line['allocatedExciseTax'] = cents_to_money($allocatedExciseTax[$lineId] ?? 0);
        $line['allocatedSalesTax'] = cents_to_money($allocatedSalesTax[$lineId] ?? 0);
        $line['allocatedDiscount'] = cents_to_money($allocatedDiscount[$lineId] ?? 0);
        $line['trueCostBasis'] = cents_to_money($trueCostBasisCents);
        $line['trueCostPerCigar'] = cents_to_money((int) round($trueCostBasisCents / $quantity));
        $line['msrpPerCigarResolved'] = $resolvedMsrp === null || $resolvedMsrp === '' ? null : round((float) $resolvedMsrp, 2);
        $line['updatedAt'] = $now;
        $updatedLinesById[$lineId] = $line;
    }

    foreach ($allLines as $index => $row) {
        if (!is_array($row)) {
            continue;
        }
        $lineId = (int) ($row['id'] ?? 0);
        if (isset($updatedLinesById[$lineId])) {
            $allLines[$index] = $updatedLinesById[$lineId];
        }
    }
    save_collection('purchase-lines', $allLines);

    $lots = load_collection('lots');
    $balances = load_collection('lot-location-balances');
    $events = load_collection('inventory-events');
    $lotIndexByPurchaseLineId = [];
    $balanceIndexByPurchaseLineId = [];
    $eventIndexByPurchaseLineId = [];

    foreach ($lots as $index => $row) {
        if (is_array($row) && isset($row['purchaseLineId'])) {
            $lotIndexByPurchaseLineId[(int) $row['purchaseLineId']] = $index;
        }
    }
    foreach ($balances as $index => $row) {
        if (is_array($row) && isset($row['purchaseLineId'])) {
            $balanceIndexByPurchaseLineId[(int) $row['purchaseLineId']] = $index;
        }
    }
    foreach ($events as $index => $row) {
        if (is_array($row) && isset($row['purchaseLineId']) && (string) ($row['eventType'] ?? '') === 'purchase-receipt') {
            $eventIndexByPurchaseLineId[(int) $row['purchaseLineId']] = $index;
        }
    }

    foreach ($updatedLinesById as $lineId => $line) {
        $hasAssignedLocation = (int) ($line['storageLocationId'] ?? 0) > 0;
        if (!$isReceived || !$hasAssignedLocation) {
            continue;
        }

        if ((purchase_line_relationship_summary($lineId)['hasHistory'] ?? false) === true) {
            continue;
        }

        $catalog = $catalogById[(int) ($line['catalogCigarId'] ?? 0)] ?? null;
        $resolvedMsrp = $line['msrpPerCigarResolved'] ?? ($catalog['msrp'] ?? null);
        $lotRecord = [
            'purchaseLineId' => $lineId,
            'purchaseId' => $purchaseId,
            'catalogCigarId' => (int) $line['catalogCigarId'],
            'initialQuantity' => (int) $line['quantity'],
            'currentQuantity' => (int) $line['quantity'],
            'purchaseDateSnapshot' => $purchase['purchaseDate'] ?? null,
            'receivedDateSnapshot' => $purchase['receivedDate'] ?? null,
            'actualCostPerCigar' => $line['unitCost'] ?? null,
            'allocatedCostPerCigar' => $line['trueCostPerCigar'] ?? null,
            'costPerCigarSnapshot' => $line['trueCostPerCigar'] ?? null,
            'msrpPerCigar' => $resolvedMsrp === null || $resolvedMsrp === '' ? null : round((float) $resolvedMsrp, 2),
            'msrpPerCigarSnapshot' => $resolvedMsrp === null || $resolvedMsrp === '' ? null : round((float) $resolvedMsrp, 2),
            'updatedAt' => $now,
        ];

        if (isset($lotIndexByPurchaseLineId[$lineId])) {
            $lotIndex = $lotIndexByPurchaseLineId[$lineId];
            $existingLot = $lots[$lotIndex];
            $lotRecord['id'] = (int) $existingLot['id'];
            $lotRecord['createdAt'] = $existingLot['createdAt'] ?? $now;
            $lots[$lotIndex] = array_merge($existingLot, $lotRecord);
        } else {
            $lotRecord['id'] = next_id('lots');
            $lotRecord['createdAt'] = $now;
            $lots[] = $lotRecord;
            $lotIndex = array_key_last($lots);
        }

        $lotId = (int) $lots[$lotIndex]['id'];
        $balanceRecord = [
            'purchaseLineId' => $lineId,
            'lotId' => $lotId,
            'storageLocationId' => (int) $line['storageLocationId'],
            'storageSubLocationId' => $line['storageSubLocationId'] ?? null,
            'quantity' => (int) $line['quantity'],
            'updatedAt' => $now,
        ];
        if (isset($balanceIndexByPurchaseLineId[$lineId])) {
            $balanceIndex = $balanceIndexByPurchaseLineId[$lineId];
            $existingBalance = $balances[$balanceIndex];
            $balanceRecord['id'] = (int) $existingBalance['id'];
            $balanceRecord['createdAt'] = $existingBalance['createdAt'] ?? $now;
            $balances[$balanceIndex] = array_merge($existingBalance, $balanceRecord);
        } else {
            $balanceRecord['id'] = next_id('lot-location-balances');
            $balanceRecord['createdAt'] = $now;
            $balances[] = $balanceRecord;
        }

        $eventDate = $purchase['receivedDate'] ?? $purchase['purchaseDate'] ?? null;
        $eventRecord = [
            'purchaseLineId' => $lineId,
            'purchaseId' => $purchaseId,
            'lotId' => $lotId,
            'catalogCigarId' => (int) $line['catalogCigarId'],
            'storageLocationId' => (int) $line['storageLocationId'],
            'storageSubLocationId' => $line['storageSubLocationId'] ?? null,
            'eventType' => 'purchase-receipt',
            'quantity' => (int) $line['quantity'],
            'eventDate' => $eventDate,
            'occurredAt' => $eventDate,
            'costPerCigarAtEvent' => $line['trueCostPerCigar'] ?? null,
            'msrpPerCigarAtEvent' => $resolvedMsrp === null || $resolvedMsrp === '' ? null : round((float) $resolvedMsrp, 2),
            'notes' => $line['notes'] ?? '',
            'updatedAt' => $now,
        ];
        if (isset($eventIndexByPurchaseLineId[$lineId])) {
            $eventIndex = $eventIndexByPurchaseLineId[$lineId];
            $existingEvent = $events[$eventIndex];
            $eventRecord['id'] = (int) $existingEvent['id'];
            $eventRecord['createdAt'] = $existingEvent['createdAt'] ?? $now;
            $events[$eventIndex] = array_merge($existingEvent, $eventRecord);
        } else {
            $eventRecord['id'] = next_id('inventory-events');
            $eventRecord['createdAt'] = $now;
            $events[] = $eventRecord;
        }
    }

    save_collection('lots', $lots);
    save_collection('lot-location-balances', $balances);
    save_collection('inventory-events', $events);
}

function delete_purchase_line_inventory(int $purchaseLineId): void
{
    if ((purchase_line_relationship_summary($purchaseLineId)['hasHistory'] ?? false) === true) {
        throw new ApiError(
            'RECEIVED_INVENTORY_IMMUTABLE',
            'Received inventory history cannot be deleted. Use the future adjustment workflow to correct it.',
            409
        );
    }
}

function move_inventory(array $input): array
{
    $sourceBalanceId = positive_int_param($input['sourceBalanceId'] ?? null, 'source balance id', 'VALIDATION_ERROR');
    $quantity = positive_int_param($input['quantity'] ?? null, 'quantity', 'VALIDATION_ERROR');
    $toStorageLocationId = positive_int_param($input['toStorageLocationId'] ?? null, 'destination humidor id', 'VALIDATION_ERROR');
    $toStorageSubLocationId = clean_optional_int($input, 'toStorageSubLocationId');
    $notes = trim((string) ($input['notes'] ?? ''));

    $sourceBalance = find_by_id('lot-location-balances', $sourceBalanceId);
    if (!$sourceBalance) {
        throw new ApiError('VALIDATION_ERROR', 'Source balance was not found.', 404);
    }

    $currentQuantity = (int) ($sourceBalance['quantity'] ?? 0);
    if ($currentQuantity < $quantity) {
        throw new ApiError('VALIDATION_ERROR', 'Move quantity cannot exceed the current balance quantity.', 422);
    }

    $sourceStorageLocationId = normalized_relationship_id($sourceBalance['storageLocationId'] ?? null);
    $sourceStorageSubLocationId = normalized_relationship_id($sourceBalance['storageSubLocationId'] ?? null);
    if (
        $sourceStorageLocationId === normalized_relationship_id($toStorageLocationId)
        && $sourceStorageSubLocationId === normalized_relationship_id($toStorageSubLocationId)
    ) {
        throw new ApiError(
            'VALIDATION_ERROR',
            'Destination must be different from the current Humidor and section.',
            400
        );
    }

    $destinationHumidor = find_by_id('storage-locations', $toStorageLocationId);
    if (!$destinationHumidor) {
        throw new ApiError('VALIDATION_ERROR', 'Destination humidor was not found.', 422);
    }

    if ($toStorageSubLocationId !== null) {
        $destinationSection = find_by_id('storage-sub-locations', $toStorageSubLocationId);
        if (!$destinationSection) {
            throw new ApiError('VALIDATION_ERROR', 'Destination drawer or section was not found.', 422);
        }
        if ((int) ($destinationSection['storageLocationId'] ?? 0) !== $toStorageLocationId) {
            throw new ApiError('VALIDATION_ERROR', 'Destination drawer or section does not belong to the selected humidor.', 422);
        }
    }

    $lotId = (int) ($sourceBalance['lotId'] ?? 0);
    $lot = find_by_id('lots', $lotId);
    if (!$lot) {
        throw new ApiError('VALIDATION_ERROR', 'The source lot was not found.', 404);
    }

    $allBalances = load_collection('lot-location-balances');
    $now = now_iso();
    $destinationBalance = null;
    $destinationIndex = null;
    $sourceIndex = null;

    foreach ($allBalances as $index => $row) {
        if (!is_array($row)) {
            continue;
        }
        if ((int) ($row['id'] ?? 0) === $sourceBalanceId) {
            $sourceIndex = $index;
        }
        if (
            (int) ($row['lotId'] ?? 0) === $lotId
            && (int) ($row['storageLocationId'] ?? 0) === $toStorageLocationId
            && (($row['storageSubLocationId'] ?? null) === $toStorageSubLocationId || (int) ($row['storageSubLocationId'] ?? 0) === (int) ($toStorageSubLocationId ?? 0))
        ) {
            $destinationBalance = $row;
            $destinationIndex = $index;
        }
    }

    if ($sourceIndex === null) {
        throw new ApiError('VALIDATION_ERROR', 'Source balance index was not found.', 404);
    }

    $allBalances[$sourceIndex]['quantity'] = $currentQuantity - $quantity;
    $allBalances[$sourceIndex]['updatedAt'] = $now;

    if ($destinationBalance) {
        $allBalances[$destinationIndex]['quantity'] = (int) ($destinationBalance['quantity'] ?? 0) + $quantity;
        $allBalances[$destinationIndex]['updatedAt'] = $now;
    } else {
        $allBalances[] = [
            'id' => next_id('lot-location-balances'),
            'purchaseLineId' => $sourceBalance['purchaseLineId'] ?? null,
            'lotId' => $lotId,
            'storageLocationId' => $toStorageLocationId,
            'storageSubLocationId' => $toStorageSubLocationId,
            'quantity' => $quantity,
            'createdAt' => $now,
            'updatedAt' => $now,
        ];
        $destinationBalance = $allBalances[array_key_last($allBalances)];
    }

    $allBalances = array_values(array_filter(
        $allBalances,
        static fn (mixed $row): bool => !is_array($row) || (int) ($row['quantity'] ?? 0) > 0
    ));
    save_collection('lot-location-balances', $allBalances);

    $events = load_collection('inventory-events');
    $events[] = [
        'id' => next_id('inventory-events'),
        'eventType' => 'move',
        'lotId' => $lotId,
        'purchaseLineId' => $lot['purchaseLineId'] ?? null,
        'purchaseId' => $lot['purchaseId'] ?? null,
        'catalogCigarId' => $lot['catalogCigarId'] ?? null,
        'fromStorageLocationId' => $sourceBalance['storageLocationId'] ?? null,
        'fromStorageSubLocationId' => $sourceBalance['storageSubLocationId'] ?? null,
        'toStorageLocationId' => $toStorageLocationId,
        'toStorageSubLocationId' => $toStorageSubLocationId,
        'quantity' => $quantity,
        'eventDate' => substr($now, 0, 10),
        'occurredAt' => $now,
        'costPerCigarAtEvent' => $lot['costPerCigarSnapshot'] ?? $lot['allocatedCostPerCigar'] ?? $lot['actualCostPerCigar'] ?? null,
        'msrpPerCigarAtEvent' => $lot['msrpPerCigarSnapshot'] ?? $lot['msrpPerCigar'] ?? null,
        'notes' => $notes,
        'createdAt' => $now,
        'updatedAt' => $now,
    ];
    save_collection('inventory-events', $events);

    audit_record('Collection', 'move inventory', [
        'sourceBalanceId' => $sourceBalanceId,
        'lotId' => $lotId,
        'quantity' => $quantity,
    ]);

    return [
        'sourceBalanceId' => $sourceBalanceId,
        'lotId' => $lotId,
        'quantityMoved' => $quantity,
        'fromStorageLocationId' => $sourceBalance['storageLocationId'] ?? null,
        'fromStorageSubLocationId' => $sourceBalance['storageSubLocationId'] ?? null,
        'toStorageLocationId' => $toStorageLocationId,
        'toStorageSubLocationId' => $toStorageSubLocationId,
    ];
}

function remove_inventory(array $input): array
{
    $sourceBalanceId = positive_int_param($input['sourceBalanceId'] ?? null, 'source balance id', 'VALIDATION_ERROR');
    $quantity = positive_int_param($input['quantity'] ?? null, 'quantity', 'VALIDATION_ERROR');
    $eventTypeInput = strtoupper(trim((string) ($input['eventType'] ?? '')));
    $notes = trim((string) ($input['notes'] ?? ''));

    $eventType = match ($eventTypeInput) {
        'SMOKED', 'GIFTED', 'DISCARDED' => $eventTypeInput,
        default => throw new ApiError('VALIDATION_ERROR', 'eventType must be SMOKED, GIFTED, or DISCARDED.', 422),
    };

    $sourceBalance = find_by_id('lot-location-balances', $sourceBalanceId);
    if (!$sourceBalance) {
        throw new ApiError('VALIDATION_ERROR', 'Source balance was not found.', 404);
    }

    $currentQuantity = (int) ($sourceBalance['quantity'] ?? 0);
    if ($currentQuantity < $quantity) {
        throw new ApiError('VALIDATION_ERROR', 'Removal quantity cannot exceed the current balance quantity.', 422);
    }

    $lotId = (int) ($sourceBalance['lotId'] ?? 0);
    $lot = find_by_id('lots', $lotId);
    if (!$lot) {
        throw new ApiError('VALIDATION_ERROR', 'The source lot was not found.', 404);
    }

    $balances = load_collection('lot-location-balances');
    $sourceIndex = null;
    $now = now_iso();
    foreach ($balances as $index => $row) {
        if (is_array($row) && (int) ($row['id'] ?? 0) === $sourceBalanceId) {
            $sourceIndex = $index;
            break;
        }
    }

    if ($sourceIndex === null) {
        throw new ApiError('VALIDATION_ERROR', 'Source balance index was not found.', 404);
    }

    $balances[$sourceIndex]['quantity'] = $currentQuantity - $quantity;
    $balances[$sourceIndex]['updatedAt'] = $now;
    $balances = array_values(array_filter(
        $balances,
        static fn (mixed $row): bool => !is_array($row) || (int) ($row['quantity'] ?? 0) > 0
    ));
    save_collection('lot-location-balances', $balances);

    $events = load_collection('inventory-events');
    $event = [
        'id' => next_id('inventory-events'),
        'eventType' => $eventType,
        'lotId' => $lotId,
        'purchaseLineId' => $lot['purchaseLineId'] ?? null,
        'purchaseId' => $lot['purchaseId'] ?? null,
        'catalogCigarId' => $lot['catalogCigarId'] ?? null,
        'fromStorageLocationId' => $sourceBalance['storageLocationId'] ?? null,
        'fromStorageSubLocationId' => $sourceBalance['storageSubLocationId'] ?? null,
        'quantity' => $quantity,
        'eventDate' => substr($now, 0, 10),
        'occurredAt' => $now,
        'costPerCigarAtEvent' => $lot['costPerCigarSnapshot'] ?? $lot['allocatedCostPerCigar'] ?? $lot['actualCostPerCigar'] ?? null,
        'msrpPerCigarAtEvent' => $lot['msrpPerCigarSnapshot'] ?? $lot['msrpPerCigar'] ?? null,
        'notes' => $notes,
        'createdAt' => $now,
        'updatedAt' => $now,
    ];
    $events[] = $event;
    save_collection('inventory-events', $events);

    audit_record('Collection', strtolower($eventType) . ' inventory', [
        'sourceBalanceId' => $sourceBalanceId,
        'lotId' => $lotId,
        'quantity' => $quantity,
    ]);

    return [
        'sourceBalanceId' => $sourceBalanceId,
        'lotId' => $lotId,
        'quantityRemoved' => $quantity,
        'eventType' => $eventType,
        'inventoryEventId' => $event['id'],
    ];
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
        $record['status'] = normalize_purchase_status_value((string) ($record['status'] ?? ''));
        validate_purchase_status($record);
    }
    if ($collection === 'storage-sub-locations') {
        validate_storage_sub_location_links($record);
    }
    if ($collection === 'purchase-lines') {
        validate_purchase_line_links($record);
        hydrate_purchase_line_msrp($record, $existing);
    }

    $record['updatedAt'] = now_iso();
    if (!isset($record['createdAt'])) {
        $record['createdAt'] = $record['updatedAt'];
    }
    return $record;
}

function normalize_purchase_status_value(string $value): string
{
    $normalized = trim(strtolower($value));
    return match ($normalized) {
        '', 'in-route', 'partially-received' => 'pending',
        default => $normalized,
    };
}

function validate_purchase_status(array $record): void
{
    $allowed = ['pending', 'received'];
    if (!in_array((string) ($record['status'] ?? ''), $allowed, true)) {
        throw new ApiError('VALIDATION_ERROR', 'status must be pending or received.', 422);
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
    ];
    foreach ($links as $field => $link) {
        $id = (int) ($record[$field] ?? 0);
        if ($id < 1 || !find_by_id($link['collection'], $id)) {
            throw new ApiError('VALIDATION_ERROR', $link['label'] . ' was not found.', 422);
        }
    }

    $storageLocationId = (int) ($record['storageLocationId'] ?? 0);
    if ($storageLocationId > 0 && !find_by_id('storage-locations', $storageLocationId)) {
        throw new ApiError('VALIDATION_ERROR', 'Selected humidor was not found.', 422);
    }

    $subLocationId = (int) ($record['storageSubLocationId'] ?? 0);
    if ($subLocationId > 0) {
        if ($storageLocationId < 1) {
            throw new ApiError('VALIDATION_ERROR', 'Select a humidor before selecting a drawer or section.', 422);
        }
        $subLocation = find_by_id('storage-sub-locations', $subLocationId);
        if (!$subLocation) {
            throw new ApiError('VALIDATION_ERROR', 'Selected humidor section was not found.', 422);
        }
        if ((int) ($subLocation['storageLocationId'] ?? 0) !== $storageLocationId) {
            throw new ApiError('VALIDATION_ERROR', 'Selected humidor section does not belong to the selected humidor.', 422);
        }
    }
}

function hydrate_purchase_line_msrp(array &$record, ?array $existing = null): void
{
    if (($record['msrpPerCigar'] ?? null) !== null && $record['msrpPerCigar'] !== '') {
        if (!isset($record['msrpTrackedAt']) || $record['msrpTrackedAt'] === '') {
            $record['msrpTrackedAt'] = now_iso();
        }
        return;
    }

    if ($existing && array_key_exists('msrpPerCigar', $existing) && $existing['msrpPerCigar'] !== null && $existing['msrpPerCigar'] !== '') {
        $record['msrpPerCigar'] = round((float) $existing['msrpPerCigar'], 2);
        $record['msrpTrackedAt'] = $existing['msrpTrackedAt'] ?? ($existing['updatedAt'] ?? now_iso());
        return;
    }

    $catalog = find_by_id('catalog-cigars', (int) ($record['catalogCigarId'] ?? 0));
    $record['msrpPerCigar'] = isset($catalog['msrp']) && $catalog['msrp'] !== '' ? round((float) $catalog['msrp'], 2) : null;
    $record['msrpTrackedAt'] = now_iso();
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
    if ($collection === 'purchase-lines' && purchase_inventory_is_locked((int) ($record['purchaseId'] ?? 0))) {
        throw new ApiError(
            'RECEIVED_INVENTORY_IMMUTABLE',
            'New purchase lines cannot be added to a received purchase or a purchase with inventory history.',
            409
        );
    }
    $record['id'] = next_id($collection);
    $rows[] = $record;
    save_collection($collection, $rows);
    if ($collection === 'purchase-lines') {
        sync_purchase_inventory((int) $record['purchaseId']);
        $lot = find_first_by_field('lots', 'purchaseLineId', (int) $record['id']);
        $event = find_first_by_field('inventory-events', 'purchaseLineId', (int) $record['id']);
        $record = find_by_id('purchase-lines', (int) $record['id']) ?? $record;
        $record['createdLotId'] = (int) ($lot['id'] ?? 0);
        $record['createdInventoryEventId'] = (int) ($event['id'] ?? 0);
    }
    if ($collection === 'purchases') {
        sync_purchase_inventory((int) $record['id']);
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
            $mergedInput = array_merge($row, $input);
            $lineInventoryLocked = $collection === 'purchase-lines' && purchase_line_is_inventory_locked($row, $id);
            if ($collection === 'purchase-lines') {
                $originalPurchaseId = (int) ($row['purchaseId'] ?? 0);
                $requestedPurchaseId = (int) ($mergedInput['purchaseId'] ?? 0);
                if (
                    $requestedPurchaseId !== $originalPurchaseId
                    && $requestedPurchaseId > 0
                    && purchase_inventory_is_locked($requestedPurchaseId)
                ) {
                    throw new ApiError(
                        'RECEIVED_INVENTORY_IMMUTABLE',
                        'A purchase line cannot be reassigned to a received purchase or a purchase with inventory history.',
                        409
                    );
                }
            }
            if ($lineInventoryLocked) {
                $protectedFields = array_values(array_diff(
                    array_merge($config['text'], $config['int'], $config['money']),
                    ['notes']
                ));
                if (count(managed_fields_changed($row, $mergedInput, $protectedFields)) > 0) {
                    throw new ApiError(
                        'RECEIVED_INVENTORY_IMMUTABLE',
                        'Purchase lines attached to received purchases or inventory history allow notes-only edits until an adjustment workflow exists.',
                        409
                    );
                }
            }
            if ($collection === 'purchases' && (purchase_relationship_summary($id)['hasInventory'] ?? false) === true) {
                $safeHeaderFields = ['invoiceNumber', 'expectedDate', 'trackingNumber', 'notes'];
                $protectedFields = array_values(array_diff(
                    array_merge($config['text'], $config['int'], $config['money']),
                    $safeHeaderFields
                ));
                if (count(managed_fields_changed($row, $mergedInput, $protectedFields)) > 0) {
                    throw new ApiError(
                        'RECEIVED_INVENTORY_IMMUTABLE',
                        'Received purchase inventory cannot be changed through generic purchase editing. Use the future adjustment workflow.',
                        409
                    );
                }
            }
            $updated = clean_managed_record($collection, $mergedInput, $row);
            $updated['id'] = $id;
            $skipInventorySync = false;
            if ($collection === 'purchase-lines') {
                if ($lineInventoryLocked) {
                    $protectedFields = array_values(array_diff(
                        array_merge($config['text'], $config['int'], $config['money']),
                        ['notes']
                    ));
                    $changedFields = managed_fields_changed($row, $updated, $protectedFields);
                    if (count($changedFields) > 0) {
                        throw new ApiError(
                            'RECEIVED_INVENTORY_IMMUTABLE',
                            'Purchase lines attached to received purchases or inventory history allow notes-only edits until an adjustment workflow exists.',
                            409
                        );
                    }
                    $skipInventorySync = true;
                }
            }
            if ($collection === 'purchases') {
                $relationships = purchase_relationship_summary($id);
                if (($relationships['hasInventory'] ?? false) === true) {
                    $safeHeaderFields = ['invoiceNumber', 'expectedDate', 'trackingNumber', 'notes'];
                    $protectedFields = array_values(array_diff(
                        array_merge($config['text'], $config['int'], $config['money']),
                        $safeHeaderFields
                    ));
                    $changedFields = managed_fields_changed($row, $updated, $protectedFields);
                    if (count($changedFields) > 0) {
                        throw new ApiError(
                            'RECEIVED_INVENTORY_IMMUTABLE',
                            'Received purchase inventory cannot be changed through generic purchase editing. Use the future adjustment workflow.',
                            409
                        );
                    }
                    $skipInventorySync = true;
                }
            }
            $rows[$index] = $updated;
            save_collection($collection, $rows);
            if ($collection === 'purchase-lines') {
                $originalPurchaseId = (int) ($row['purchaseId'] ?? 0);
                $newPurchaseId = (int) ($updated['purchaseId'] ?? 0);
                if (!$skipInventorySync && $originalPurchaseId > 0) {
                    sync_purchase_inventory($originalPurchaseId);
                }
                if (!$skipInventorySync && $newPurchaseId > 0 && $newPurchaseId !== $originalPurchaseId) {
                    sync_purchase_inventory($newPurchaseId);
                }
                $updated = find_by_id('purchase-lines', $id) ?? $updated;
            }
            if ($collection === 'purchases' && !$skipInventorySync) {
                sync_purchase_inventory($id);
            }
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
            if ($collection === 'purchases' && (purchase_relationship_summary($id)['hasRelationships'] ?? false) === true) {
                throw new ApiError(
                    'RECORD_REFERENCED',
                    'A received or linked purchase cannot be deleted while purchase lines, Lots, balances, or events exist.',
                    409
                );
            }
            if ($collection === 'catalog-cigars') {
                $isReferenced = collection_references_id('purchase-lines', ['catalogCigarId'], $id)
                    || collection_references_id('lots', ['catalogCigarId'], $id)
                    || collection_references_id('lot-location-balances', ['catalogCigarId'], $id)
                    || collection_references_id('inventory-events', ['catalogCigarId'], $id);
                if ($isReferenced) {
                    throw new ApiError('RECORD_REFERENCED', 'This Catalog cigar is linked to purchase or inventory history and cannot be deleted.', 409);
                }
            }
            if ($collection === 'vendors' && collection_references_id('purchases', ['vendorId'], $id)) {
                throw new ApiError('RECORD_REFERENCED', 'This Vendor is linked to a purchase and cannot be deleted.', 409);
            }
            if ($collection === 'storage-locations') {
                $isReferenced = collection_references_id('storage-sub-locations', ['storageLocationId'], $id)
                    || collection_references_id('purchase-lines', ['storageLocationId'], $id)
                    || collection_references_id('lot-location-balances', ['storageLocationId'], $id)
                    || collection_references_id(
                        'inventory-events',
                        ['storageLocationId', 'fromStorageLocationId', 'toStorageLocationId'],
                        $id
                    );
                if ($isReferenced) {
                    throw new ApiError('RECORD_REFERENCED', 'This Humidor is linked to sections, purchase lines, balances, or events and cannot be deleted.', 409);
                }
            }
            if ($collection === 'storage-sub-locations') {
                $isReferenced = collection_references_id('purchase-lines', ['storageSubLocationId'], $id)
                    || collection_references_id('lot-location-balances', ['storageSubLocationId'], $id)
                    || collection_references_id(
                        'inventory-events',
                        ['storageSubLocationId', 'fromStorageSubLocationId', 'toStorageSubLocationId'],
                        $id
                    );
                if ($isReferenced) {
                    throw new ApiError('RECORD_REFERENCED', 'This Humidor section is linked to purchase lines, balances, or events and cannot be deleted.', 409);
                }
            }
            if ($collection === 'purchase-lines' && purchase_line_is_inventory_locked($row, $id)) {
                throw new ApiError(
                    'RECEIVED_INVENTORY_IMMUTABLE',
                    'A purchase line attached to a received purchase or inventory history cannot be deleted.',
                    409
                );
            }
            $deleted = $row;
            array_splice($rows, $index, 1);
            save_collection($collection, $rows);
            if ($collection === 'purchase-lines') {
                delete_purchase_line_inventory($id);
                $purchaseId = (int) ($row['purchaseId'] ?? 0);
                if ($purchaseId > 0) {
                    sync_purchase_inventory($purchaseId);
                }
            }
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
    if ($path === '/inventory/move' && $method === 'POST') {
        require_auth();
        json_success(move_inventory(request_json()));
    }
    if ($path === '/inventory/remove' && $method === 'POST') {
        require_auth();
        json_success(remove_inventory(request_json()));
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

