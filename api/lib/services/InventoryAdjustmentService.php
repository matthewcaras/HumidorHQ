<?php
declare(strict_types=1);
/*
 * Filename: InventoryAdjustmentService.php
 * Revision: 1.0.0
 * Description: Transactional, idempotent physical-count inventory adjustments.
 * Modified Date: 2026-07-19 18:00 ET
 */

function adjustment_nonnegative_int(mixed $value, string $label): int
{
    if (is_int($value) && $value >= 0) {
        return $value;
    }
    if (is_string($value) && preg_match('/^(?:0|[1-9][0-9]*)$/', $value)) {
        return (int) $value;
    }
    throw new ApiError('VALIDATION_ERROR', $label . ' must be a non-negative whole number.', 422);
}

function inventory_adjustment_result(array $event, bool $idempotentReplay): array
{
    return [
        'sourceBalanceId' => (int) ($event['sourceBalanceId'] ?? 0),
        'lotId' => (int) ($event['lotId'] ?? 0),
        'expectedQuantity' => (int) ($event['balanceQuantityBefore'] ?? 0),
        'countedQuantity' => (int) ($event['balanceQuantityAfter'] ?? 0),
        'quantityChange' => (int) ($event['quantityChange'] ?? 0),
        'inventoryEventId' => (int) ($event['id'] ?? 0),
        'inventoryEvent' => $event,
        'idempotentReplay' => $idempotentReplay,
    ];
}

function adjust_inventory_to_physical_count(array $input): array
{
    if (!data_transaction_active()) {
        return with_data_transaction(static fn (): array => adjust_inventory_to_physical_count($input));
    }

    $sourceBalanceId = positive_int_param($input['sourceBalanceId'] ?? null, 'source balance id', 'VALIDATION_ERROR');
    $expectedQuantity = adjustment_nonnegative_int($input['expectedQuantity'] ?? null, 'expectedQuantity');
    $countedQuantity = adjustment_nonnegative_int($input['countedQuantity'] ?? null, 'countedQuantity');
    $eventDate = validate_iso_date($input['eventDate'] ?? today_local_date(), 'eventDate', true);
    $idempotencyKey = receipt_idempotency_key($input['idempotencyKey'] ?? null);
    $notes = clean_text_field($input, 'notes');

    if ($notes === '') {
        throw new ApiError('VALIDATION_ERROR', 'A physical-count adjustment reason is required.', 422);
    }
    if ($eventDate > today_local_date()) {
        throw new ApiError('VALIDATION_ERROR', 'eventDate cannot be in the future.', 422);
    }
    if ($countedQuantity === $expectedQuantity) {
        throw new ApiError('VALIDATION_ERROR', 'The physical count matches the expected quantity; no adjustment is required.', 422);
    }

    $events = load_collection('inventory-events');
    foreach ($events as $existingEvent) {
        if (!is_array($existingEvent) || (string) ($existingEvent['adjustmentKey'] ?? '') !== $idempotencyKey) {
            continue;
        }
        $matches = (int) ($existingEvent['sourceBalanceId'] ?? 0) === $sourceBalanceId
            && (int) ($existingEvent['balanceQuantityBefore'] ?? -1) === $expectedQuantity
            && (int) ($existingEvent['balanceQuantityAfter'] ?? -1) === $countedQuantity
            && (string) ($existingEvent['eventDate'] ?? '') === $eventDate
            && (string) ($existingEvent['notes'] ?? '') === $notes;
        if (!$matches) {
            throw new ApiError(
                'ADJUSTMENT_IDEMPOTENCY_CONFLICT',
                'This idempotency key was already used for a different physical-count adjustment.',
                409
            );
        }
        return inventory_adjustment_result($existingEvent, true);
    }

    $balances = load_collection('lot-location-balances');
    $sourceIndex = null;
    $sourceBalance = null;
    foreach ($balances as $index => $balance) {
        if (is_array($balance) && (int) ($balance['id'] ?? 0) === $sourceBalanceId) {
            $sourceIndex = $index;
            $sourceBalance = $balance;
            break;
        }
    }
    if ($sourceIndex === null || $sourceBalance === null) {
        throw new ApiError('ADJUSTMENT_BALANCE_NOT_FOUND', 'The counted inventory balance was not found.', 409);
    }
    $currentQuantity = (int) ($sourceBalance['quantity'] ?? 0);
    if ($currentQuantity !== $expectedQuantity) {
        throw new ApiError(
            'ADJUSTMENT_STALE_BALANCE',
            'The inventory balance changed after the count form was opened. Review the current quantity and count again.',
            409
        );
    }
    if ($currentQuantity < 1) {
        throw new ApiError('ADJUSTMENT_BALANCE_NOT_FOUND', 'Physical counts can only adjust an existing positive balance.', 409);
    }

    $storageLocationId = positive_int_param($sourceBalance['storageLocationId'] ?? null, 'stored Humidor id', 'INVENTORY_INTEGRITY_CONFLICT');
    $storageSubLocationId = normalized_relationship_id($sourceBalance['storageSubLocationId'] ?? null);
    validate_receipt_location($storageLocationId, $storageSubLocationId);

    $lotId = positive_int_param($sourceBalance['lotId'] ?? null, 'stored Lot id', 'INVENTORY_INTEGRITY_CONFLICT');
    $lot = find_by_id('lots', $lotId);
    if (!$lot) {
        throw new ApiError('INVENTORY_INTEGRITY_CONFLICT', 'The counted balance Lot relationship is missing.', 409);
    }
    $positiveBefore = receipt_positive_balance_quantity($balances, $lotId);
    if ((int) ($lot['currentQuantity'] ?? 0) !== $positiveBefore) {
        throw new ApiError('INVENTORY_INTEGRITY_CONFLICT', 'The Lot quantity cache must reconcile before applying a physical count.', 409);
    }
    $lotReceivedDate = validate_iso_date(
        $lot['receivedDateSnapshot'] ?? $lot['receivedDate'] ?? $lot['purchaseDateSnapshot'] ?? null,
        'stored lot receipt date'
    );
    if ($lotReceivedDate !== null && $eventDate < $lotReceivedDate) {
        throw new ApiError('VALIDATION_ERROR', 'eventDate cannot be earlier than the Lot receipt date.', 422);
    }

    $now = now_iso();
    if ($countedQuantity === 0) {
        array_splice($balances, $sourceIndex, 1);
    } else {
        $balances[$sourceIndex]['quantity'] = $countedQuantity;
        $balances[$sourceIndex]['updatedAt'] = $now;
    }

    $quantityChange = $countedQuantity - $expectedQuantity;
    $event = [
        'id' => next_id('inventory-events'),
        'eventType' => 'INVENTORY_ADJUSTMENT',
        'adjustmentDirection' => $quantityChange > 0 ? 'INCREASE' : 'DECREASE',
        'adjustmentKey' => $idempotencyKey,
        'lotId' => $lotId,
        'purchaseLineId' => $lot['purchaseLineId'] ?? null,
        'purchaseId' => $lot['purchaseId'] ?? null,
        'catalogCigarId' => $lot['catalogCigarId'] ?? null,
        'sourceBalanceId' => $sourceBalanceId,
        'storageLocationId' => $storageLocationId,
        'storageSubLocationId' => $storageSubLocationId,
        'quantity' => abs($quantityChange),
        'quantityChange' => $quantityChange,
        'balanceQuantityBefore' => $expectedQuantity,
        'balanceQuantityAfter' => $countedQuantity,
        'eventDate' => $eventDate,
        'occurredAt' => $now,
        'costPerCigarAtEvent' => $lot['costPerCigarSnapshot'] ?? $lot['allocatedCostPerCigar'] ?? $lot['actualCostPerCigar'] ?? null,
        'msrpPerCigarAtEvent' => $lot['msrpPerCigarSnapshot'] ?? $lot['msrpPerCigar'] ?? null,
        'notes' => $notes,
        'createdAt' => $now,
        'updatedAt' => $now,
    ];
    $events[] = $event;

    save_collection('lot-location-balances', $balances);
    synchronize_lot_quantity_cache($lotId, $balances, $now);
    save_collection('inventory-events', $events);

    audit_record('Collection', 'reconcile physical count', [
        'sourceBalanceId' => $sourceBalanceId,
        'lotId' => $lotId,
        'expectedQuantity' => $expectedQuantity,
        'countedQuantity' => $countedQuantity,
        'quantityChange' => $quantityChange,
    ]);

    return inventory_adjustment_result($event, false);
}
