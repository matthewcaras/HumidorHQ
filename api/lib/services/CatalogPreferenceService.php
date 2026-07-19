<?php
declare(strict_types=1);
/*
 * Filename: CatalogPreferenceService.php
 * Revision: 1.0.0
 * Description: Validates and transactionally updates Catalog Buy Again decisions.
 * Modified Date: 2026-07-19 17:00 ET
 */

const BUY_AGAIN_ALLOWED_STATUSES = ['YES', 'MAYBE', 'NO'];

function normalize_buy_again_status(mixed $value): ?string
{
    $normalized = strtoupper(str_replace([' ', '-'], '_', trim((string) ($value ?? ''))));
    if ($normalized === '' || $normalized === 'NOT_EVALUATED') {
        return null;
    }
    if (!in_array($normalized, BUY_AGAIN_ALLOWED_STATUSES, true)) {
        throw new ApiError('BUY_AGAIN_VALIDATION_ERROR', 'Buy Again status must be Not Evaluated, Yes, Maybe, or No.', 422);
    }
    return $normalized;
}

function normalize_buy_again_notes(mixed $value): ?string
{
    if ($value !== null && !is_string($value)) {
        throw new ApiError('BUY_AGAIN_VALIDATION_ERROR', 'Buy Again notes must be text.', 422);
    }
    $notes = trim((string) ($value ?? ''));
    if (strlen($notes) > 2000) {
        throw new ApiError('BUY_AGAIN_VALIDATION_ERROR', 'Buy Again notes must be 2000 characters or fewer.', 422);
    }
    return $notes === '' ? null : $notes;
}

function normalize_catalog_buy_again_record(array &$record): void
{
    $record['buyAgainStatus'] = normalize_buy_again_status($record['buyAgainStatus'] ?? null);
    $record['buyAgainNotes'] = normalize_buy_again_notes($record['buyAgainNotes'] ?? null);
}

function update_catalog_buy_again(int $catalogCigarId, mixed $status, mixed $notes): array
{
    if (!data_transaction_active()) {
        return with_data_transaction(static fn (): array => update_catalog_buy_again($catalogCigarId, $status, $notes));
    }
    $rows = load_collection('catalog-cigars');
    foreach ($rows as $index => $row) {
        if (!is_array($row) || (int) ($row['id'] ?? 0) !== $catalogCigarId) {
            continue;
        }
        $row['buyAgainStatus'] = normalize_buy_again_status($status);
        $row['buyAgainNotes'] = normalize_buy_again_notes($notes);
        $row['updatedAt'] = now_iso();
        $rows[$index] = $row;
        save_collection('catalog-cigars', $rows);
        return $row;
    }
    throw new ApiError('BUY_AGAIN_CATALOG_NOT_FOUND', 'The Catalog cigar for this Buy Again decision was not found.', 409);
}
