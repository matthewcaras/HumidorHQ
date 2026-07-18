<?php
declare(strict_types=1);
/*
 * Filename: ReceiveStoreService.php
 * Revision: 1.2.0
 * Description: Transactional, idempotent purchase-line receiving and storage workflow.
 * Modified Date: 2026-07-18 11:00 ET
 */

function receipt_normalized_optional_id(mixed $value): ?int
{
    if ($value === null || trim((string) $value) === '') {
        return null;
    }
    $id = (int) $value;
    return $id > 0 ? $id : null;
}

function receipt_idempotency_key(mixed $value): string
{
    $key = trim((string) $value);
    if (!preg_match('/^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$/', $key)) {
        throw new ApiError(
            'VALIDATION_ERROR',
            'idempotencyKey must contain 16 to 128 letters, numbers, periods, underscores, colons, or hyphens.',
            422
        );
    }
    return $key;
}

function purchase_receipt_events_for_line(array $events, int $purchaseLineId): array
{
    $reversedEventIds = [];
    foreach ($events as $event) {
        if (is_array($event)
            && strtoupper((string) ($event['eventType'] ?? '')) === 'REVERSAL'
            && (int) ($event['reversesInventoryEventId'] ?? 0) > 0) {
            $reversedEventIds[(int) $event['reversesInventoryEventId']] = true;
        }
    }
    return array_values(array_filter(
        $events,
        static fn (mixed $row): bool => is_array($row)
            && (int) ($row['purchaseLineId'] ?? 0) === $purchaseLineId
            && (string) ($row['eventType'] ?? '') === 'purchase-receipt'
            && (int) ($row['quantity'] ?? 0) > 0
            && !isset($reversedEventIds[(int) ($row['id'] ?? 0)]),
    ));
}

function purchase_line_received_quantity_from_events(array $events, int $purchaseLineId): int
{
    $quantity = 0;
    foreach (purchase_receipt_events_for_line($events, $purchaseLineId) as $event) {
        $quantity += (int) $event['quantity'];
    }
    return $quantity;
}

function validate_receipt_location(int $storageLocationId, ?int $storageSubLocationId): void
{
    $storageLocation = find_by_id('storage-locations', $storageLocationId);
    if (!$storageLocation) {
        throw new ApiError('VALIDATION_ERROR', 'Selected humidor was not found.', 422);
    }
    if (!record_is_active($storageLocation)) {
        throw new ApiError('RECORD_ARCHIVED', 'Selected humidor is archived and cannot receive inventory.', 409);
    }
    if ($storageSubLocationId === null) {
        return;
    }
    $section = find_by_id('storage-sub-locations', $storageSubLocationId);
    if (!$section) {
        throw new ApiError('VALIDATION_ERROR', 'Selected humidor section was not found.', 422);
    }
    if ((int) ($section['storageLocationId'] ?? 0) !== $storageLocationId) {
        throw new ApiError('VALIDATION_ERROR', 'Selected humidor section does not belong to the selected humidor.', 422);
    }
    if (!record_is_active($section)) {
        throw new ApiError('RECORD_ARCHIVED', 'Selected humidor section is archived and cannot receive inventory.', 409);
    }
}

function receipt_event_matches_request(
    array $event,
    int $purchaseLineId,
    int $purchaseId,
    int $quantity,
    string $receivedDate,
    int $storageLocationId,
    ?int $storageSubLocationId,
    string $notes
): bool {
    return (int) ($event['purchaseLineId'] ?? 0) === $purchaseLineId
        && (int) ($event['purchaseId'] ?? 0) === $purchaseId
        && (int) ($event['quantity'] ?? 0) === $quantity
        && (string) ($event['eventDate'] ?? '') === $receivedDate
        && (int) ($event['storageLocationId'] ?? 0) === $storageLocationId
        && receipt_normalized_optional_id($event['storageSubLocationId'] ?? null) === $storageSubLocationId
        && (string) ($event['notes'] ?? '') === $notes;
}

function receipt_find_lots_for_line(array $lots, int $purchaseLineId): array
{
    return array_values(array_filter(
        $lots,
        static fn (mixed $row): bool => is_array($row)
            && (int) ($row['purchaseLineId'] ?? 0) === $purchaseLineId
    ));
}

function receipt_find_balance(
    array $balances,
    int $lotId,
    int $storageLocationId,
    ?int $storageSubLocationId
): ?array {
    foreach ($balances as $balance) {
        if (is_array($balance)
            && (int) ($balance['lotId'] ?? 0) === $lotId
            && (int) ($balance['storageLocationId'] ?? 0) === $storageLocationId
            && receipt_normalized_optional_id($balance['storageSubLocationId'] ?? null) === $storageSubLocationId) {
            return $balance;
        }
    }
    return null;
}

function receipt_positive_balance_quantity(array $balances, int $lotId): int
{
    $quantity = 0;
    foreach ($balances as $balance) {
        if (is_array($balance) && (int) ($balance['lotId'] ?? 0) === $lotId) {
            $quantity += max(0, (int) ($balance['quantity'] ?? 0));
        }
    }
    return $quantity;
}

function derived_purchase_receipt_state(int $purchaseId, array $lines, array $events): array
{
    $purchaseLines = array_values(array_filter(
        $lines,
        static fn (mixed $row): bool => is_array($row) && (int) ($row['purchaseId'] ?? 0) === $purchaseId
    ));
    if ($purchaseLines === []) {
        return ['status' => 'pending', 'receivedDate' => '', 'orderedQuantity' => 0, 'receivedQuantity' => 0];
    }

    $orderedQuantity = 0;
    $receivedQuantity = 0;
    $allComplete = true;
    $latestDate = '';
    foreach ($purchaseLines as $line) {
        $lineId = (int) ($line['id'] ?? 0);
        $ordered = max(0, (int) ($line['quantity'] ?? 0));
        $received = purchase_line_received_quantity_from_events($events, $lineId);
        if ($received > $ordered) {
            throw new ApiError(
                'INVENTORY_INTEGRITY_CONFLICT',
                'Stored receipt events exceed the ordered quantity for a purchase line.',
                409
            );
        }
        $orderedQuantity += $ordered;
        $receivedQuantity += $received;
        if ($received < $ordered) {
            $allComplete = false;
        }
        foreach (purchase_receipt_events_for_line($events, $lineId) as $event) {
            $eventDate = (string) ($event['eventDate'] ?? '');
            if ($eventDate > $latestDate) {
                $latestDate = $eventDate;
            }
        }
    }

    $status = $receivedQuantity === 0
        ? 'pending'
        : ($allComplete ? 'received' : 'partially-received');
    return [
        'status' => $status,
        'receivedDate' => $allComplete ? $latestDate : '',
        'orderedQuantity' => $orderedQuantity,
        'receivedQuantity' => $receivedQuantity,
    ];
}

function receipt_result_for_event(array $event, bool $idempotentReplay): array
{
    $purchaseLineId = (int) ($event['purchaseLineId'] ?? 0);
    $purchaseId = (int) ($event['purchaseId'] ?? 0);
    $line = find_by_id('purchase-lines', $purchaseLineId);
    $purchase = find_by_id('purchases', $purchaseId);
    $lot = find_by_id('lots', (int) ($event['lotId'] ?? 0));
    $balance = receipt_find_balance(
        load_collection('lot-location-balances'),
        (int) ($event['lotId'] ?? 0),
        (int) ($event['storageLocationId'] ?? 0),
        receipt_normalized_optional_id($event['storageSubLocationId'] ?? null)
    );
    $receivedQuantity = purchase_line_received_quantity_from_events(load_collection('inventory-events'), $purchaseLineId);
    $orderedQuantity = (int) ($line['quantity'] ?? 0);
    return [
        'purchase' => $purchase,
        'purchaseLine' => $line,
        'lot' => $lot,
        'balance' => $balance,
        'inventoryEvent' => $event,
        'orderedQuantity' => $orderedQuantity,
        'receivedQuantity' => $receivedQuantity,
        'remainingQuantity' => max(0, $orderedQuantity - $receivedQuantity),
        'idempotentReplay' => $idempotentReplay,
    ];
}

function receive_purchase_line(int $purchaseLineId, array $input): array
{
    if (!data_transaction_active()) {
        return with_data_transaction(static fn (): array => receive_purchase_line($purchaseLineId, $input));
    }

    $line = find_by_id('purchase-lines', $purchaseLineId);
    if (!$line) {
        throw new ApiError('RECORD_NOT_FOUND', 'Purchase Line was not found.', 404);
    }
    $purchaseId = (int) ($line['purchaseId'] ?? 0);
    $purchase = find_by_id('purchases', $purchaseId);
    if (!$purchase) {
        throw new ApiError('INVENTORY_INTEGRITY_CONFLICT', 'The Purchase Line is missing its Purchase relationship.', 409);
    }

    $quantity = positive_int_param($input['quantity'] ?? null, 'quantity');
    if ($quantity > 1000000) {
        throw new ApiError('VALIDATION_ERROR', 'quantity is outside the allowed range.', 422);
    }
    $receivedDate = validate_iso_date((string) ($input['receivedDate'] ?? ''), 'receivedDate', true);
    if ($receivedDate < (string) ($purchase['purchaseDate'] ?? '')) {
        throw new ApiError('VALIDATION_ERROR', 'receivedDate cannot be earlier than purchaseDate.', 422);
    }
    $storageLocationId = positive_int_param($input['storageLocationId'] ?? null, 'storageLocationId');
    $storageSubLocationId = receipt_normalized_optional_id($input['storageSubLocationId'] ?? null);
    validate_receipt_location($storageLocationId, $storageSubLocationId);
    $idempotencyKey = receipt_idempotency_key($input['idempotencyKey'] ?? null);
    $notes = clean_text_field($input, 'notes');

    $events = load_collection('inventory-events');
    foreach ($events as $event) {
        if (!is_array($event) || (string) ($event['receiptKey'] ?? '') !== $idempotencyKey) {
            continue;
        }
        if (!receipt_event_matches_request(
            $event,
            $purchaseLineId,
            $purchaseId,
            $quantity,
            $receivedDate,
            $storageLocationId,
            $storageSubLocationId,
            $notes
        )) {
            throw new ApiError(
                'RECEIPT_IDEMPOTENCY_CONFLICT',
                'This idempotency key was already used for a different receipt request.',
                409
            );
        }
        return receipt_result_for_event($event, true);
    }

    $purchaseStatus = normalize_purchase_status_value((string) ($purchase['status'] ?? 'pending'));
    if (!in_array($purchaseStatus, ['pending', 'partially-received'], true)) {
        throw new ApiError(
            'RECEIVED_INVENTORY_IMMUTABLE',
            'This purchase is already marked received. Existing receipt history cannot be reconstructed.',
            409
        );
    }

    $orderedQuantity = (int) ($line['quantity'] ?? 0);
    $receivedBefore = purchase_line_received_quantity_from_events($events, $purchaseLineId);
    if ($receivedBefore > $orderedQuantity) {
        throw new ApiError('INVENTORY_INTEGRITY_CONFLICT', 'Stored receipts exceed this line\'s ordered quantity.', 409);
    }
    if ($quantity > $orderedQuantity - $receivedBefore) {
        throw new ApiError(
            'RECEIPT_QUANTITY_EXCEEDED',
            'Receipt quantity cannot exceed the remaining ordered quantity.',
            409
        );
    }

    $stateBefore = derived_purchase_receipt_state($purchaseId, load_collection('purchase-lines'), $events);
    if ($stateBefore['status'] !== $purchaseStatus) {
        throw new ApiError(
            'INVENTORY_INTEGRITY_CONFLICT',
            'The stored purchase status does not reconcile with existing receipt events.',
            409
        );
    }

    sync_purchase_inventory($purchaseId);
    $line = find_by_id('purchase-lines', $purchaseLineId) ?? $line;
    $now = now_iso();
    $lots = load_collection('lots');
    $balances = load_collection('lot-location-balances');
    $events = load_collection('inventory-events');
    $lineLots = receipt_find_lots_for_line($lots, $purchaseLineId);
    if (count($lineLots) > 1) {
        throw new ApiError('INVENTORY_INTEGRITY_CONFLICT', 'A Purchase Line cannot be received into multiple Lots.', 409);
    }

    if ($lineLots === []) {
        $resolvedMsrp = $line['msrpPerCigarResolved'] ?? ($line['msrpPerCigar'] ?? null);
        $lot = [
            'id' => next_id('lots'),
            'purchaseLineId' => $purchaseLineId,
            'purchaseId' => $purchaseId,
            'catalogCigarId' => (int) ($line['catalogCigarId'] ?? 0),
            'initialQuantity' => $quantity,
            'currentQuantity' => $quantity,
            'purchaseDateSnapshot' => $purchase['purchaseDate'] ?? null,
            'receivedDateSnapshot' => $receivedDate,
            'actualCostPerCigar' => $line['unitCost'] ?? null,
            'allocatedCostPerCigar' => $line['trueCostPerCigar'] ?? null,
            'costPerCigarSnapshot' => $line['trueCostPerCigar'] ?? null,
            'msrpPerCigar' => $resolvedMsrp === null || $resolvedMsrp === '' ? null : round((float) $resolvedMsrp, 2),
            'msrpPerCigarSnapshot' => $resolvedMsrp === null || $resolvedMsrp === '' ? null : round((float) $resolvedMsrp, 2),
            'createdAt' => $now,
            'updatedAt' => $now,
        ];
        $lots[] = $lot;
    } else {
        $lot = $lineLots[0];
        if ((int) ($lot['purchaseId'] ?? 0) !== $purchaseId
            || (int) ($lot['catalogCigarId'] ?? 0) !== (int) ($line['catalogCigarId'] ?? 0)) {
            throw new ApiError('INVENTORY_INTEGRITY_CONFLICT', 'The existing Lot relationships do not match the Purchase Line.', 409);
        }
        $lotId = (int) $lot['id'];
        $positiveBefore = receipt_positive_balance_quantity($balances, $lotId);
        if ((int) ($lot['currentQuantity'] ?? 0) !== $positiveBefore
            || (int) ($lot['initialQuantity'] ?? 0) !== $receivedBefore) {
            throw new ApiError('INVENTORY_INTEGRITY_CONFLICT', 'The existing Lot quantities must reconcile before another receipt.', 409);
        }
        $lot['initialQuantity'] = $receivedBefore + $quantity;
        $lot['currentQuantity'] = $positiveBefore + $quantity;
        $lot['updatedAt'] = $now;
        foreach ($lots as $index => $candidate) {
            if (is_array($candidate) && (int) ($candidate['id'] ?? 0) === $lotId) {
                $lots[$index] = $lot;
                break;
            }
        }
    }

    $lotId = (int) $lot['id'];
    $balance = receipt_find_balance($balances, $lotId, $storageLocationId, $storageSubLocationId);
    if ($balance === null) {
        $balance = [
            'id' => next_id('lot-location-balances'),
            'purchaseLineId' => $purchaseLineId,
            'lotId' => $lotId,
            'storageLocationId' => $storageLocationId,
            'storageSubLocationId' => $storageSubLocationId,
            'quantity' => $quantity,
            'createdAt' => $now,
            'updatedAt' => $now,
        ];
        $balances[] = $balance;
    } else {
        $balance['quantity'] = max(0, (int) ($balance['quantity'] ?? 0)) + $quantity;
        $balance['updatedAt'] = $now;
        foreach ($balances as $index => $candidate) {
            if (is_array($candidate) && (int) ($candidate['id'] ?? 0) === (int) $balance['id']) {
                $balances[$index] = $balance;
                break;
            }
        }
    }

    $resolvedMsrp = $line['msrpPerCigarResolved'] ?? ($line['msrpPerCigar'] ?? null);
    $event = [
        'id' => next_id('inventory-events'),
        'receiptKey' => $idempotencyKey,
        'purchaseLineId' => $purchaseLineId,
        'purchaseId' => $purchaseId,
        'lotId' => $lotId,
        'catalogCigarId' => (int) ($line['catalogCigarId'] ?? 0),
        'storageLocationId' => $storageLocationId,
        'storageSubLocationId' => $storageSubLocationId,
        'eventType' => 'purchase-receipt',
        'quantity' => $quantity,
        'eventDate' => $receivedDate,
        'occurredAt' => $receivedDate,
        'costPerCigarAtEvent' => $line['trueCostPerCigar'] ?? null,
        'msrpPerCigarAtEvent' => $resolvedMsrp === null || $resolvedMsrp === '' ? null : round((float) $resolvedMsrp, 2),
        'notes' => $notes,
        'createdAt' => $now,
        'updatedAt' => $now,
    ];
    $events[] = $event;

    $receivedAfter = $receivedBefore + $quantity;
    $lineReceiptEvents = purchase_receipt_events_for_line($events, $purchaseLineId);
    $receiptDates = array_values(array_filter(array_map(
        static fn (array $row): string => (string) ($row['eventDate'] ?? ''),
        $lineReceiptEvents
    )));
    sort($receiptDates, SORT_STRING);
    $lines = load_collection('purchase-lines');
    foreach ($lines as $index => $candidate) {
        if (!is_array($candidate) || (int) ($candidate['id'] ?? 0) !== $purchaseLineId) {
            continue;
        }
        $candidate['receivedQuantity'] = $receivedAfter;
        $candidate['firstReceivedDate'] = $receiptDates[0] ?? $receivedDate;
        $candidate['lastReceivedDate'] = $receiptDates[count($receiptDates) - 1] ?? $receivedDate;
        $candidate['receivedDate'] = $receivedAfter === $orderedQuantity ? $candidate['lastReceivedDate'] : '';
        if ($receivedBefore === 0) {
            $candidate['storageLocationId'] = $storageLocationId;
            $candidate['storageSubLocationId'] = $storageSubLocationId;
        }
        $candidate['updatedAt'] = $now;
        $lines[$index] = $candidate;
        $line = $candidate;
        break;
    }

    $purchaseState = derived_purchase_receipt_state($purchaseId, $lines, $events);
    $purchases = load_collection('purchases');
    foreach ($purchases as $index => $candidate) {
        if (!is_array($candidate) || (int) ($candidate['id'] ?? 0) !== $purchaseId) {
            continue;
        }
        $candidate['status'] = $purchaseState['status'];
        $candidate['receivedDate'] = $purchaseState['receivedDate'];
        $candidate['updatedAt'] = $now;
        $purchases[$index] = $candidate;
        $purchase = $candidate;
        break;
    }

    save_collection('lots', $lots);
    save_collection('lot-location-balances', $balances);
    save_collection('inventory-events', $events);
    save_collection('purchase-lines', $lines);
    save_collection('purchases', $purchases);
    audit_record('Purchases', 'receive purchase line', [
        'purchaseId' => $purchaseId,
        'purchaseLineId' => $purchaseLineId,
        'lotId' => $lotId,
        'inventoryEventId' => (int) $event['id'],
        'quantity' => $quantity,
    ]);

    return [
        'purchase' => $purchase,
        'purchaseLine' => $line,
        'lot' => $lot,
        'balance' => $balance,
        'inventoryEvent' => $event,
        'orderedQuantity' => $orderedQuantity,
        'receivedQuantity' => $receivedAfter,
        'remainingQuantity' => $orderedQuantity - $receivedAfter,
        'idempotentReplay' => false,
    ];
}
