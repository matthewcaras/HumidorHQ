<?php
declare(strict_types=1);
/*
 * Filename: InventoryReversalService.php
 * Revision: 1.1.0
 * Description: Transactional append-only reversals for HumidorHQ inventory events.
 * Modified Date: 2026-07-19 18:00 ET
 */

function reversal_normalized_event_type(array $event): string
{
    return strtoupper(str_replace('-', '_', (string) ($event['eventType'] ?? '')));
}

function reversal_result(array $event, bool $idempotentReplay): array
{
    return [
        'inventoryEventId' => (int) ($event['id'] ?? 0),
        'reversesInventoryEventId' => (int) ($event['reversesInventoryEventId'] ?? 0),
        'eventType' => 'REVERSAL',
        'reversedEventType' => (string) ($event['reversedEventType'] ?? ''),
        'quantityReversed' => (int) ($event['quantity'] ?? 0),
        'inventoryEvent' => $event,
        'idempotentReplay' => $idempotentReplay,
    ];
}

function reversal_find_balance_index(array $balances, int $lotId, int $locationId, ?int $sectionId): ?int
{
    foreach ($balances as $index => $balance) {
        if (is_array($balance)
            && (int) ($balance['lotId'] ?? 0) === $lotId
            && (int) ($balance['storageLocationId'] ?? 0) === $locationId
            && normalized_relationship_id($balance['storageSubLocationId'] ?? null) === $sectionId) {
            return $index;
        }
    }
    return null;
}

function reversal_require_active_location(int $locationId, ?int $sectionId): void
{
    $location = find_by_id('storage-locations', $locationId);
    if (!$location) {
        throw new ApiError('INVENTORY_INTEGRITY_CONFLICT', 'The reversal destination Humidor no longer exists.', 409);
    }
    if (!record_is_active($location)) {
        throw new ApiError('RECORD_ARCHIVED', 'Restore the reversal destination Humidor before returning inventory to it.', 409);
    }
    if ($sectionId === null) {
        return;
    }
    $section = find_by_id('storage-sub-locations', $sectionId);
    if (!$section || (int) ($section['storageLocationId'] ?? 0) !== $locationId) {
        throw new ApiError('INVENTORY_INTEGRITY_CONFLICT', 'The reversal destination section relationship is missing or invalid.', 409);
    }
    if (!record_is_active($section)) {
        throw new ApiError('RECORD_ARCHIVED', 'Restore the reversal destination section before returning inventory to it.', 409);
    }
}

function reversal_increment_balance(
    array &$balances,
    int $lotId,
    int $purchaseLineId,
    int $locationId,
    ?int $sectionId,
    int $quantity,
    string $now
): array {
    $index = reversal_find_balance_index($balances, $lotId, $locationId, $sectionId);
    if ($index === null) {
        $balance = [
            'id' => next_id('lot-location-balances'),
            'purchaseLineId' => $purchaseLineId,
            'lotId' => $lotId,
            'storageLocationId' => $locationId,
            'storageSubLocationId' => $sectionId,
            'quantity' => $quantity,
            'createdAt' => $now,
            'updatedAt' => $now,
        ];
        $balances[] = $balance;
        return $balance;
    }
    $balances[$index]['quantity'] = (int) ($balances[$index]['quantity'] ?? 0) + $quantity;
    $balances[$index]['updatedAt'] = $now;
    return $balances[$index];
}

function reversal_decrement_balance(
    array &$balances,
    int $lotId,
    int $locationId,
    ?int $sectionId,
    int $quantity,
    string $now
): void {
    $index = reversal_find_balance_index($balances, $lotId, $locationId, $sectionId);
    if ($index === null || (int) ($balances[$index]['quantity'] ?? 0) < $quantity) {
        throw new ApiError(
            'REVERSAL_QUANTITY_UNAVAILABLE',
            'The original destination no longer contains enough inventory to reverse this event.',
            409
        );
    }
    $remaining = (int) $balances[$index]['quantity'] - $quantity;
    if ($remaining === 0) {
        array_splice($balances, $index, 1);
        return;
    }
    $balances[$index]['quantity'] = $remaining;
    $balances[$index]['updatedAt'] = $now;
}

function reverse_inventory_event(int $targetEventId, array $input): array
{
    if (!data_transaction_active()) {
        return with_data_transaction(static fn (): array => reverse_inventory_event($targetEventId, $input));
    }

    $idempotencyKey = receipt_idempotency_key($input['idempotencyKey'] ?? null);
    $eventDate = validate_iso_date($input['eventDate'] ?? today_local_date(), 'eventDate', true);
    $notes = clean_text_field($input, 'notes');
    if ($notes === '') {
        throw new ApiError('VALIDATION_ERROR', 'A correction reason is required.', 422);
    }
    if ($eventDate > today_local_date()) {
        throw new ApiError('VALIDATION_ERROR', 'eventDate cannot be in the future.', 422);
    }

    $events = load_collection('inventory-events');
    foreach ($events as $existing) {
        if (!is_array($existing) || (string) ($existing['reversalKey'] ?? '') !== $idempotencyKey) {
            continue;
        }
        if ((int) ($existing['reversesInventoryEventId'] ?? 0) !== $targetEventId
            || (string) ($existing['eventDate'] ?? '') !== $eventDate
            || (string) ($existing['notes'] ?? '') !== $notes) {
            throw new ApiError('REVERSAL_IDEMPOTENCY_CONFLICT', 'This idempotency key was already used for a different reversal.', 409);
        }
        return reversal_result($existing, true);
    }

    $target = null;
    foreach ($events as $event) {
        if (is_array($event) && (int) ($event['id'] ?? 0) === $targetEventId) {
            $target = $event;
            break;
        }
    }
    if ($target === null) {
        throw new ApiError('RECORD_NOT_FOUND', 'Inventory Event was not found.', 404);
    }
    $targetType = reversal_normalized_event_type($target);
    if (!in_array($targetType, ['PURCHASE_RECEIPT', 'MOVE', 'SMOKED', 'GIFTED', 'DISCARDED', 'INVENTORY_ADJUSTMENT'], true)) {
        throw new ApiError('REVERSAL_NOT_SUPPORTED', 'This Inventory Event type cannot be reversed.', 409);
    }
    foreach ($events as $event) {
        if (is_array($event) && (int) ($event['reversesInventoryEventId'] ?? 0) === $targetEventId) {
            throw new ApiError('EVENT_ALREADY_REVERSED', 'This Inventory Event has already been reversed.', 409);
        }
    }
    $targetDate = validate_iso_date($target['eventDate'] ?? null, 'stored event date', true);
    if ($eventDate < $targetDate) {
        throw new ApiError('VALIDATION_ERROR', 'A reversal date cannot be earlier than the event being reversed.', 422);
    }

    $quantity = positive_int_param($target['quantity'] ?? null, 'stored event quantity', 'INVENTORY_INTEGRITY_CONFLICT');
    $lotId = positive_int_param($target['lotId'] ?? null, 'stored Lot id', 'INVENTORY_INTEGRITY_CONFLICT');
    $lot = find_by_id('lots', $lotId);
    if (!$lot) {
        throw new ApiError('INVENTORY_INTEGRITY_CONFLICT', 'The Inventory Event Lot relationship is missing.', 409);
    }
    $purchaseLineId = (int) ($target['purchaseLineId'] ?? $lot['purchaseLineId'] ?? 0);
    $balances = load_collection('lot-location-balances');
    $positiveBefore = receipt_positive_balance_quantity($balances, $lotId);
    if ((int) ($lot['currentQuantity'] ?? 0) !== $positiveBefore) {
        throw new ApiError('INVENTORY_INTEGRITY_CONFLICT', 'The Lot quantity cache must reconcile before reversal.', 409);
    }

    $now = now_iso();
    $fromLocationId = null;
    $fromSectionId = null;
    $toLocationId = null;
    $toSectionId = null;

    if ($targetType === 'PURCHASE_RECEIPT') {
        $fromLocationId = positive_int_param($target['storageLocationId'] ?? null, 'receipt Humidor id', 'INVENTORY_INTEGRITY_CONFLICT');
        $fromSectionId = normalized_relationship_id($target['storageSubLocationId'] ?? null);
        reversal_decrement_balance($balances, $lotId, $fromLocationId, $fromSectionId, $quantity, $now);
    } elseif ($targetType === 'MOVE') {
        $fromLocationId = positive_int_param($target['toStorageLocationId'] ?? null, 'move destination Humidor id', 'INVENTORY_INTEGRITY_CONFLICT');
        $fromSectionId = normalized_relationship_id($target['toStorageSubLocationId'] ?? null);
        $toLocationId = positive_int_param($target['fromStorageLocationId'] ?? null, 'move source Humidor id', 'INVENTORY_INTEGRITY_CONFLICT');
        $toSectionId = normalized_relationship_id($target['fromStorageSubLocationId'] ?? null);
        reversal_require_active_location($toLocationId, $toSectionId);
        reversal_decrement_balance($balances, $lotId, $fromLocationId, $fromSectionId, $quantity, $now);
        reversal_increment_balance($balances, $lotId, $purchaseLineId, $toLocationId, $toSectionId, $quantity, $now);
    } elseif ($targetType === 'INVENTORY_ADJUSTMENT') {
        $adjustmentDirection = strtoupper((string) ($target['adjustmentDirection'] ?? ''));
        $adjustmentLocationId = positive_int_param($target['storageLocationId'] ?? null, 'adjustment Humidor id', 'INVENTORY_INTEGRITY_CONFLICT');
        $adjustmentSectionId = normalized_relationship_id($target['storageSubLocationId'] ?? null);
        if ($adjustmentDirection === 'INCREASE') {
            $fromLocationId = $adjustmentLocationId;
            $fromSectionId = $adjustmentSectionId;
            reversal_decrement_balance($balances, $lotId, $fromLocationId, $fromSectionId, $quantity, $now);
        } elseif ($adjustmentDirection === 'DECREASE') {
            $toLocationId = $adjustmentLocationId;
            $toSectionId = $adjustmentSectionId;
            reversal_require_active_location($toLocationId, $toSectionId);
            reversal_increment_balance($balances, $lotId, $purchaseLineId, $toLocationId, $toSectionId, $quantity, $now);
        } else {
            throw new ApiError('INVENTORY_INTEGRITY_CONFLICT', 'The Inventory Adjustment direction is invalid.', 409);
        }
    } else {
        $toLocationId = positive_int_param($target['fromStorageLocationId'] ?? null, 'removal source Humidor id', 'INVENTORY_INTEGRITY_CONFLICT');
        $toSectionId = normalized_relationship_id($target['fromStorageSubLocationId'] ?? null);
        reversal_require_active_location($toLocationId, $toSectionId);
        reversal_increment_balance($balances, $lotId, $purchaseLineId, $toLocationId, $toSectionId, $quantity, $now);
    }

    $reversal = [
        'id' => next_id('inventory-events'),
        'eventType' => 'REVERSAL',
        'reversedEventType' => $targetType,
        'reversesInventoryEventId' => $targetEventId,
        'reversalKey' => $idempotencyKey,
        'lotId' => $lotId,
        'purchaseLineId' => $purchaseLineId ?: null,
        'purchaseId' => $target['purchaseId'] ?? $lot['purchaseId'] ?? null,
        'catalogCigarId' => $target['catalogCigarId'] ?? $lot['catalogCigarId'] ?? null,
        'fromStorageLocationId' => $fromLocationId,
        'fromStorageSubLocationId' => $fromSectionId,
        'toStorageLocationId' => $toLocationId,
        'toStorageSubLocationId' => $toSectionId,
        'quantity' => $quantity,
        'eventDate' => $eventDate,
        'occurredAt' => $now,
        'costPerCigarAtEvent' => $target['costPerCigarAtEvent'] ?? null,
        'msrpPerCigarAtEvent' => $target['msrpPerCigarAtEvent'] ?? null,
        'notes' => $notes,
        'createdAt' => $now,
        'updatedAt' => $now,
    ];
    $events[] = $reversal;

    $lots = load_collection('lots');
    foreach ($lots as $index => $candidate) {
        if (!is_array($candidate) || (int) ($candidate['id'] ?? 0) !== $lotId) {
            continue;
        }
        if ($targetType === 'PURCHASE_RECEIPT') {
            $effectiveReceived = purchase_line_received_quantity_from_events($events, $purchaseLineId);
            if ((int) ($candidate['initialQuantity'] ?? 0) < $quantity) {
                throw new ApiError('INVENTORY_INTEGRITY_CONFLICT', 'The Lot initial quantity cannot support this receipt reversal.', 409);
            }
            $candidate['initialQuantity'] = $effectiveReceived;
            $effectiveReceipts = purchase_receipt_events_for_line($events, $purchaseLineId);
            $dates = array_values(array_filter(array_map(static fn (array $row): string => (string) ($row['eventDate'] ?? ''), $effectiveReceipts)));
            sort($dates, SORT_STRING);
            $candidate['receivedDateSnapshot'] = $dates[0] ?? null;
        }
        $candidate['currentQuantity'] = receipt_positive_balance_quantity($balances, $lotId);
        $candidate['updatedAt'] = $now;
        $lots[$index] = $candidate;
        break;
    }

    save_collection('lot-location-balances', $balances);
    save_collection('lots', $lots);
    save_collection('inventory-events', $events);

    if ($targetType === 'PURCHASE_RECEIPT') {
        $effectiveReceipts = purchase_receipt_events_for_line($events, $purchaseLineId);
        $receivedQuantity = purchase_line_received_quantity_from_events($events, $purchaseLineId);
        $dates = array_values(array_filter(array_map(static fn (array $row): string => (string) ($row['eventDate'] ?? ''), $effectiveReceipts)));
        sort($dates, SORT_STRING);
        $lines = load_collection('purchase-lines');
        foreach ($lines as $index => $line) {
            if (!is_array($line) || (int) ($line['id'] ?? 0) !== $purchaseLineId) {
                continue;
            }
            $lines[$index]['receivedQuantity'] = $receivedQuantity;
            $lines[$index]['firstReceivedDate'] = $dates[0] ?? '';
            $lines[$index]['lastReceivedDate'] = $dates[count($dates) - 1] ?? '';
            $lines[$index]['receivedDate'] = $receivedQuantity === (int) ($line['quantity'] ?? 0) ? ($lines[$index]['lastReceivedDate'] ?? '') : '';
            $firstReceipt = $effectiveReceipts[0] ?? null;
            $lines[$index]['storageLocationId'] = $firstReceipt['storageLocationId'] ?? null;
            $lines[$index]['storageSubLocationId'] = $firstReceipt['storageSubLocationId'] ?? null;
            $lines[$index]['updatedAt'] = $now;
            break;
        }
        save_collection('purchase-lines', $lines);

        $purchaseId = (int) ($target['purchaseId'] ?? $lot['purchaseId'] ?? 0);
        $state = derived_purchase_receipt_state($purchaseId, $lines, $events);
        $purchases = load_collection('purchases');
        foreach ($purchases as $index => $purchase) {
            if (is_array($purchase) && (int) ($purchase['id'] ?? 0) === $purchaseId) {
                $purchases[$index]['status'] = $state['status'];
                $purchases[$index]['receivedDate'] = $state['receivedDate'];
                $purchases[$index]['updatedAt'] = $now;
                break;
            }
        }
        save_collection('purchases', $purchases);
    }

    audit_record('Inventory', 'reverse inventory event', [
        'inventoryEventId' => $targetEventId,
        'reversalEventId' => $reversal['id'],
        'eventType' => $targetType,
        'quantity' => $quantity,
    ]);
    return reversal_result($reversal, false);
}
