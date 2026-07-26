<?php
declare(strict_types=1);
/*
 * Filename: DataExportService.php
 * Revision: 1.0.0
 * Description: Builds authenticated, read-only Excel-friendly CSV export packages from a consistent runtime snapshot.
 * Modified Date: 2026-07-25 22:45 ET
 */

function csv_export_id_map(array $rows): array
{
    $map = [];
    foreach ($rows as $row) {
        if (is_array($row) && (int) ($row['id'] ?? 0) > 0) {
            $map[(int) $row['id']] = $row;
        }
    }
    return $map;
}

function csv_export_cigar_name(?array $cigar): string
{
    if ($cigar === null) {
        return 'Unknown Cigar';
    }
    $parts = array_filter([
        trim((string) ($cigar['manufacturer'] ?? '')),
        trim((string) ($cigar['series'] ?? '')),
        trim((string) ($cigar['vitola'] ?? '')),
    ], static fn (string $value): bool => $value !== '');
    return $parts === [] ? 'Catalog Cigar #' . (int) ($cigar['id'] ?? 0) : implode(' ', $parts);
}

function csv_export_record_name(?array $record, string $fallback): string
{
    $name = trim((string) ($record['name'] ?? ''));
    return $name !== '' ? $name : $fallback;
}

function csv_export_event_catalog_id(array $event, array $lots): int
{
    $catalogId = (int) ($event['catalogCigarId'] ?? 0);
    if ($catalogId > 0) {
        return $catalogId;
    }
    $lot = $lots[(int) ($event['lotId'] ?? 0)] ?? null;
    return (int) ($lot['catalogCigarId'] ?? 0);
}

function csv_export_event_location_ids(array $event, string $prefix = ''): array
{
    $locationField = $prefix === '' ? 'storageLocationId' : $prefix . 'StorageLocationId';
    $sectionField = $prefix === '' ? 'storageSubLocationId' : $prefix . 'StorageSubLocationId';
    return [
        (int) ($event[$locationField] ?? 0),
        (int) ($event[$sectionField] ?? 0),
    ];
}

function csv_export_location_name(int $id, array $locations): string
{
    return $id > 0
        ? csv_export_record_name($locations[$id] ?? null, 'Missing Humidor #' . $id)
        : '';
}

function csv_export_section_name(int $id, array $sections): string
{
    return $id > 0
        ? csv_export_record_name($sections[$id] ?? null, 'Missing Section #' . $id)
        : '';
}

function csv_export_number(mixed $value, ?int $decimals = null): int|float|string|null
{
    if ($value === null || $value === '' || !is_numeric($value)) {
        return null;
    }
    if ($decimals === null) {
        return str_contains((string) $value, '.') ? (float) $value : (int) $value;
    }
    return number_format((float) $value, $decimals, '.', '');
}

function csv_export_extended_money(int $quantity, mixed $unitValue): ?string
{
    if ($quantity < 0 || $unitValue === null || $unitValue === '' || !is_numeric($unitValue)) {
        return null;
    }
    return number_format(round($quantity * (float) $unitValue, 2), 2, '.', '');
}

function csv_export_safe_cell(mixed $value): string|int|float
{
    if ($value === null) {
        return '';
    }
    if (is_bool($value)) {
        return $value ? 'Yes' : 'No';
    }
    if (is_int($value) || is_float($value)) {
        return $value;
    }
    $text = (string) $value;
    $trimmed = trim($text);
    if ($trimmed !== ''
        && !preg_match('/^-?(?:[0-9]+|[0-9]*\.[0-9]+)$/', $trimmed)
        && preg_match('/^[\x00-\x20]*[=+\-@]/', $text)) {
        return "'" . $text;
    }
    return $text;
}

function csv_export_encode(array $headers, array $rows): string
{
    $stream = fopen('php://temp', 'w+b');
    if ($stream === false) {
        throw new ApiError('CSV_EXPORT_FAILED', 'A CSV export file could not be created.', 500);
    }
    try {
        fwrite($stream, "\xEF\xBB\xBF");
        fputcsv($stream, $headers, ',', '"', '', "\r\n");
        foreach ($rows as $row) {
            fputcsv(
                $stream,
                array_map('csv_export_safe_cell', is_array($row) ? $row : []),
                ',',
                '"',
                '',
                "\r\n"
            );
        }
        rewind($stream);
        $contents = stream_get_contents($stream);
        if (!is_string($contents)) {
            throw new ApiError('CSV_EXPORT_FAILED', 'A CSV export file could not be read.', 500);
        }
        return $contents;
    } finally {
        fclose($stream);
    }
}

function csv_export_line_basis_cents(array $purchases, array $purchaseLines): array
{
    $linesByPurchase = [];
    foreach ($purchaseLines as $line) {
        if (is_array($line)) {
            $linesByPurchase[(int) ($line['purchaseId'] ?? 0)][] = $line;
        }
    }
    $allocations = [];
    foreach ($purchases as $purchase) {
        if (!is_array($purchase)) {
            continue;
        }
        $purchaseId = (int) ($purchase['id'] ?? 0);
        $totalPaid = accounting_money_to_cents($purchase['totalPaid'] ?? null);
        $lines = $linesByPurchase[$purchaseId] ?? [];
        if ($purchaseId < 1 || $totalPaid === null || $lines === []) {
            continue;
        }
        $weights = [];
        $stored = [];
        $storedComplete = true;
        foreach ($lines as $line) {
            $lineId = (int) ($line['id'] ?? 0);
            $weight = accounting_line_weight_cents($line);
            if ($lineId < 1 || $weight === null || $weight <= 0) {
                $weights = [];
                break;
            }
            $weights[$lineId] = $weight;
            $storedBasis = accounting_money_to_cents($line['trueCostBasis'] ?? null);
            if ($storedBasis === null) {
                $storedComplete = false;
            } else {
                $stored[$lineId] = $storedBasis;
            }
        }
        if ($weights === []) {
            continue;
        }
        $purchaseAllocations = $storedComplete && array_sum($stored) === $totalPaid
            ? $stored
            : accounting_allocate_cents_by_weight($totalPaid, $weights);
        foreach ($purchaseAllocations as $lineId => $cents) {
            $allocations[(int) $lineId] = (int) $cents;
        }
    }
    return $allocations;
}

function csv_export_project_revision(): string
{
    $path = APP_ROOT . DIRECTORY_SEPARATOR . 'CHANGELOG.md';
    $content = is_file($path) ? file_get_contents($path) : '';
    return is_string($content) && preg_match('/^##\s+(\d+\.\d+\.\d+)\s+-/m', $content, $match)
        ? $match[1]
        : 'unknown';
}

function csv_export_dos_timestamp(?int $timestamp = null): array
{
    $parts = getdate($timestamp ?? time());
    $year = max(1980, min(2107, (int) $parts['year']));
    $date = (($year - 1980) << 9) | ((int) $parts['mon'] << 5) | (int) $parts['mday'];
    $time = ((int) $parts['hours'] << 11) | ((int) $parts['minutes'] << 5) | intdiv((int) $parts['seconds'], 2);
    return [$time, $date];
}

function csv_export_write_portable_zip(string $path, array $contentsByName): void
{
    if (count($contentsByName) > 65535) {
        throw new ApiError('CSV_EXPORT_FAILED', 'The CSV export contains too many files.', 500);
    }
    [$dosTime, $dosDate] = csv_export_dos_timestamp();
    $archive = '';
    $directory = '';
    $offset = 0;
    foreach ($contentsByName as $filename => $contents) {
        $name = (string) $filename;
        $data = (string) $contents;
        $nameLength = strlen($name);
        $size = strlen($data);
        $crc = crc32($data);
        $local = pack(
            'VvvvvvVVVvv',
            0x04034b50,
            20,
            0x0800,
            0,
            $dosTime,
            $dosDate,
            $crc,
            $size,
            $size,
            $nameLength,
            0
        ) . $name . $data;
        $directory .= pack(
            'VvvvvvvVVVvvvvvVV',
            0x02014b50,
            20,
            20,
            0x0800,
            0,
            $dosTime,
            $dosDate,
            $crc,
            $size,
            $size,
            $nameLength,
            0,
            0,
            0,
            0,
            0,
            $offset
        ) . $name;
        $archive .= $local;
        $offset += strlen($local);
    }
    $entryCount = count($contentsByName);
    $archive .= $directory . pack(
        'VvvvvVVv',
        0x06054b50,
        0,
        0,
        $entryCount,
        $entryCount,
        strlen($directory),
        $offset,
        0
    );
    if (file_put_contents($path, $archive, LOCK_EX) === false) {
        throw new ApiError('CSV_EXPORT_FAILED', 'The CSV export ZIP could not be written.', 500);
    }
}

function csv_export_write_zip(string $path, array $contentsByName): void
{
    if (!class_exists(ZipArchive::class)) {
        csv_export_write_portable_zip($path, $contentsByName);
        return;
    }
    $zip = new ZipArchive();
    if ($zip->open($path, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) {
        throw new ApiError('CSV_EXPORT_FAILED', 'The CSV export ZIP could not be opened.', 500);
    }
    try {
        foreach ($contentsByName as $filename => $contents) {
            if (!$zip->addFromString((string) $filename, (string) $contents)) {
                throw new ApiError('CSV_EXPORT_FAILED', 'A CSV file could not be added to the export package.', 500);
            }
        }
        if (!$zip->close()) {
            throw new ApiError('CSV_EXPORT_FAILED', 'The CSV export ZIP could not be finalized.', 500);
        }
    } catch (Throwable $error) {
        if ($zip->status === ZipArchive::ER_OK) {
            $zip->close();
        }
        throw $error;
    }
}

function csv_export_build_files(): array
{
    $catalogRows = load_collection('catalog-cigars');
    $vendorRows = load_collection('vendors');
    $purchaseRows = load_collection('purchases');
    $lineRows = load_collection('purchase-lines');
    $lotRows = load_collection('lots');
    $balanceRows = load_collection('lot-location-balances');
    $eventRows = load_collection('inventory-events');
    $journalRows = load_collection('smoking-journal-entries');
    $locationRows = load_collection('storage-locations');
    $sectionRows = load_collection('storage-sub-locations');

    $catalog = csv_export_id_map($catalogRows);
    $vendors = csv_export_id_map($vendorRows);
    $purchases = csv_export_id_map($purchaseRows);
    $lines = csv_export_id_map($lineRows);
    $lots = csv_export_id_map($lotRows);
    $locations = csv_export_id_map($locationRows);
    $sections = csv_export_id_map($sectionRows);
    $journalsByEvent = [];
    foreach ($journalRows as $journal) {
        if (is_array($journal)) {
            $journalsByEvent[(int) ($journal['inventoryEventId'] ?? 0)] = $journal;
        }
    }
    $reversedBy = [];
    foreach ($eventRows as $event) {
        if (is_array($event)
            && strtoupper((string) ($event['eventType'] ?? '')) === 'REVERSAL'
            && (int) ($event['reversesInventoryEventId'] ?? 0) > 0) {
            $reversedBy[(int) $event['reversesInventoryEventId']] = (int) ($event['id'] ?? 0);
        }
    }
    $receivedByLine = [];
    foreach ($eventRows as $event) {
        if (!is_array($event)
            || strtoupper((string) ($event['eventType'] ?? '')) !== 'PURCHASE_RECEIPT'
            || isset($reversedBy[(int) ($event['id'] ?? 0)])) {
            continue;
        }
        $lineId = (int) ($event['purchaseLineId'] ?? 0);
        $receivedByLine[$lineId] = ($receivedByLine[$lineId] ?? 0) + (int) ($event['quantity'] ?? 0);
    }
    $lineBasisCents = csv_export_line_basis_cents($purchaseRows, $lineRows);

    $collection = [];
    foreach ($balanceRows as $balance) {
        if (!is_array($balance) || (int) ($balance['quantity'] ?? 0) <= 0) {
            continue;
        }
        $quantity = (int) $balance['quantity'];
        $lot = $lots[(int) ($balance['lotId'] ?? 0)] ?? null;
        $line = $lines[(int) ($lot['purchaseLineId'] ?? $balance['purchaseLineId'] ?? 0)] ?? null;
        $purchase = $purchases[(int) ($lot['purchaseId'] ?? $line['purchaseId'] ?? 0)] ?? null;
        $cigarId = (int) ($lot['catalogCigarId'] ?? $line['catalogCigarId'] ?? 0);
        $cigar = $catalog[$cigarId] ?? null;
        $cost = is_array($lot) ? reconciled_lot_cost_per_cigar($lot) : null;
        $msrp = $lot['msrpPerCigarSnapshot'] ?? $lot['msrpPerCigar'] ?? $line['msrpPerCigarResolved'] ?? $cigar['msrp'] ?? null;
        $costExtended = csv_export_extended_money($quantity, $cost);
        $msrpExtended = csv_export_extended_money($quantity, $msrp);
        $collection[] = [
            (int) ($balance['id'] ?? 0),
            $cigarId ?: null,
            csv_export_cigar_name($cigar),
            $cigar['manufacturer'] ?? null,
            $cigar['series'] ?? null,
            $cigar['vitola'] ?? null,
            $cigar['strength'] ?? null,
            $cigar['wrapper'] ?? null,
            $cigar['country'] ?? $cigar['origin'] ?? null,
            (int) ($balance['lotId'] ?? 0) ?: null,
            (int) ($purchase['id'] ?? 0) ?: null,
            $lot['purchaseDateSnapshot'] ?? $purchase['purchaseDate'] ?? null,
            $lot['receivedDateSnapshot'] ?? $purchase['receivedDate'] ?? null,
            csv_export_location_name((int) ($balance['storageLocationId'] ?? 0), $locations),
            csv_export_section_name((int) ($balance['storageSubLocationId'] ?? 0), $sections),
            $quantity,
            csv_export_number($cost, 6),
            $costExtended,
            csv_export_number($msrp, 6),
            $msrpExtended,
            $costExtended !== null && $msrpExtended !== null
                ? number_format((float) $msrpExtended - (float) $costExtended, 2, '.', '')
                : null,
        ];
    }
    usort($collection, static fn (array $left, array $right): int => strcasecmp((string) $left[2], (string) $right[2]) ?: ($left[0] <=> $right[0]));

    $purchasedByCatalog = [];
    foreach ($lineRows as $line) {
        if (is_array($line)) {
            $cigarId = (int) ($line['catalogCigarId'] ?? 0);
            $purchasedByCatalog[$cigarId] = ($purchasedByCatalog[$cigarId] ?? 0) + (int) ($line['quantity'] ?? 0);
        }
    }
    $onHandByCatalog = [];
    foreach ($balanceRows as $balance) {
        if (!is_array($balance) || (int) ($balance['quantity'] ?? 0) <= 0) {
            continue;
        }
        $lot = $lots[(int) ($balance['lotId'] ?? 0)] ?? null;
        $cigarId = (int) ($lot['catalogCigarId'] ?? 0);
        $onHandByCatalog[$cigarId] = ($onHandByCatalog[$cigarId] ?? 0) + (int) $balance['quantity'];
    }
    $ratingsByCatalog = [];
    foreach ($journalRows as $journal) {
        if (!is_array($journal)) {
            continue;
        }
        $eventId = (int) ($journal['inventoryEventId'] ?? 0);
        if (isset($reversedBy[$eventId])) {
            continue;
        }
        $event = null;
        foreach ($eventRows as $candidate) {
            if (is_array($candidate) && (int) ($candidate['id'] ?? 0) === $eventId) {
                $event = $candidate;
                break;
            }
        }
        if ($event === null || strtoupper((string) ($event['eventType'] ?? '')) !== 'SMOKED') {
            continue;
        }
        $cigarId = csv_export_event_catalog_id($event, $lots);
        $rating = (int) ($journal['rating'] ?? 0);
        if ($cigarId > 0 && $rating >= 1 && $rating <= 10) {
            $ratingsByCatalog[$cigarId][] = $rating;
        }
    }
    $catalogExport = [];
    foreach ($catalogRows as $cigar) {
        if (!is_array($cigar)) {
            continue;
        }
        $id = (int) ($cigar['id'] ?? 0);
        $ratings = $ratingsByCatalog[$id] ?? [];
        $catalogExport[] = [
            $id,
            $cigar['manufacturer'] ?? null,
            $cigar['series'] ?? null,
            $cigar['vitola'] ?? null,
            $cigar['shape'] ?? null,
            $cigar['length'] ?? null,
            $cigar['ringGauge'] ?? null,
            $cigar['strength'] ?? null,
            $cigar['wrapper'] ?? null,
            $cigar['binder'] ?? null,
            $cigar['filler'] ?? null,
            $cigar['country'] ?? $cigar['origin'] ?? null,
            csv_export_number($cigar['msrp'] ?? null, 2),
            $cigar['buyAgainStatus'] ?? 'NOT_EVALUATED',
            $cigar['buyAgainNotes'] ?? null,
            $cigar['notes'] ?? null,
            (bool) ($cigar['isActive'] ?? true),
            $purchasedByCatalog[$id] ?? 0,
            $onHandByCatalog[$id] ?? 0,
            $ratings === [] ? null : number_format(array_sum($ratings) / count($ratings), 2, '.', ''),
            count($ratings),
        ];
    }
    usort($catalogExport, static fn (array $left, array $right): int => strcasecmp(implode(' ', array_slice($left, 1, 3)), implode(' ', array_slice($right, 1, 3))) ?: ($left[0] <=> $right[0]));

    $linesByPurchase = [];
    foreach ($lineRows as $line) {
        if (is_array($line)) {
            $linesByPurchase[(int) ($line['purchaseId'] ?? 0)][] = $line;
        }
    }
    $purchaseExport = [];
    foreach ($purchaseRows as $purchase) {
        if (!is_array($purchase)) {
            continue;
        }
        $id = (int) ($purchase['id'] ?? 0);
        $purchaseLines = $linesByPurchase[$id] ?? [];
        $quantityOrdered = array_sum(array_map(static fn (array $line): int => (int) ($line['quantity'] ?? 0), $purchaseLines));
        $quantityReceived = array_sum(array_map(static fn (array $line): int => $receivedByLine[(int) ($line['id'] ?? 0)] ?? 0, $purchaseLines));
        $vendorId = (int) ($purchase['vendorId'] ?? 0);
        $purchaseExport[] = [
            $id,
            $purchase['purchaseDate'] ?? null,
            $vendorId ?: null,
            csv_export_record_name($vendors[$vendorId] ?? null, $vendorId > 0 ? 'Missing Vendor #' . $vendorId : ''),
            $purchase['status'] ?? null,
            csv_export_number($purchase['subtotal'] ?? null, 2),
            csv_export_number($purchase['discount'] ?? null, 2),
            csv_export_number($purchase['shipping'] ?? null, 2),
            csv_export_number($purchase['salesTax'] ?? null, 2),
            csv_export_number($purchase['exciseTax'] ?? null, 2),
            csv_export_number($purchase['fees'] ?? null, 2),
            csv_export_number($purchase['totalPaid'] ?? null, 2),
            count($purchaseLines),
            $quantityOrdered,
            $quantityReceived,
            $purchase['expectedDate'] ?? null,
            $purchase['receivedDate'] ?? null,
            $purchase['trackingNumber'] ?? null,
            $purchase['invoiceNumber'] ?? null,
            $purchase['notes'] ?? null,
        ];
    }
    usort($purchaseExport, static fn (array $left, array $right): int => strcmp((string) $left[1], (string) $right[1]) ?: ($left[0] <=> $right[0]));

    $lineExport = [];
    foreach ($lineRows as $line) {
        if (!is_array($line)) {
            continue;
        }
        $id = (int) ($line['id'] ?? 0);
        $purchase = $purchases[(int) ($line['purchaseId'] ?? 0)] ?? null;
        $vendorId = (int) ($purchase['vendorId'] ?? 0);
        $cigarId = (int) ($line['catalogCigarId'] ?? 0);
        $basisCents = $lineBasisCents[$id] ?? null;
        $quantity = (int) ($line['quantity'] ?? 0);
        $lineExport[] = [
            $id,
            (int) ($line['purchaseId'] ?? 0) ?: null,
            $purchase['purchaseDate'] ?? null,
            csv_export_record_name($vendors[$vendorId] ?? null, $vendorId > 0 ? 'Missing Vendor #' . $vendorId : ''),
            $cigarId ?: null,
            csv_export_cigar_name($catalog[$cigarId] ?? null),
            $quantity,
            $receivedByLine[$id] ?? 0,
            csv_export_location_name((int) ($line['storageLocationId'] ?? 0), $locations),
            csv_export_section_name((int) ($line['storageSubLocationId'] ?? 0), $sections),
            csv_export_number($line['lineSubtotal'] ?? $line['purchasePrice'] ?? null, 2),
            csv_export_number($line['allocatedDiscount'] ?? null, 2),
            csv_export_number($line['allocatedShipping'] ?? null, 2),
            csv_export_number($line['allocatedSalesTax'] ?? null, 2),
            csv_export_number($line['allocatedExciseTax'] ?? null, 2),
            $basisCents === null ? null : number_format($basisCents / 100, 2, '.', ''),
            $basisCents === null ? null : precise_unit_cost_from_cents($basisCents, $quantity),
            csv_export_number($line['msrpPerCigarResolved'] ?? $line['msrpPerCigar'] ?? null, 6),
            $line['notes'] ?? null,
        ];
    }
    usort($lineExport, static fn (array $left, array $right): int => ($left[1] <=> $right[1]) ?: ($left[0] <=> $right[0]));

    $journalExport = [];
    foreach ($journalRows as $journal) {
        if (!is_array($journal)) {
            continue;
        }
        $eventId = (int) ($journal['inventoryEventId'] ?? 0);
        $event = null;
        foreach ($eventRows as $candidate) {
            if (is_array($candidate) && (int) ($candidate['id'] ?? 0) === $eventId) {
                $event = $candidate;
                break;
            }
        }
        $cigarId = is_array($event) ? csv_export_event_catalog_id($event, $lots) : 0;
        $cigar = $catalog[$cigarId] ?? null;
        [$locationId, $sectionId] = is_array($event) ? csv_export_event_location_ids($event, 'from') : [0, 0];
        if ($locationId < 1 && is_array($event)) {
            [$locationId, $sectionId] = csv_export_event_location_ids($event);
        }
        $journalExport[] = [
            (int) ($journal['id'] ?? 0),
            $eventId ?: null,
            isset($reversedBy[$eventId]) ? 'Reversed' : 'Effective',
            $event['eventDate'] ?? null,
            $cigarId ?: null,
            csv_export_cigar_name($cigar),
            (int) ($event['lotId'] ?? 0) ?: null,
            (int) ($event['quantity'] ?? 0) ?: null,
            csv_export_location_name($locationId, $locations),
            csv_export_section_name($sectionId, $sections),
            (int) ($journal['rating'] ?? 0) ?: null,
            $journal['notes'] ?? null,
            $cigar['buyAgainStatus'] ?? 'NOT_EVALUATED',
            $cigar['buyAgainNotes'] ?? null,
            $journal['createdAt'] ?? null,
            $journal['updatedAt'] ?? null,
        ];
    }
    usort($journalExport, static fn (array $left, array $right): int => strcmp((string) $left[3], (string) $right[3]) ?: ($left[0] <=> $right[0]));

    $removalExport = [];
    $activityExport = [];
    foreach ($eventRows as $event) {
        if (!is_array($event)) {
            continue;
        }
        $eventId = (int) ($event['id'] ?? 0);
        $type = strtoupper((string) ($event['eventType'] ?? ''));
        $cigarId = csv_export_event_catalog_id($event, $lots);
        $cigar = $catalog[$cigarId] ?? null;
        [$locationId, $sectionId] = csv_export_event_location_ids($event);
        [$fromLocationId, $fromSectionId] = csv_export_event_location_ids($event, 'from');
        [$toLocationId, $toSectionId] = csv_export_event_location_ids($event, 'to');
        $cost = isset($lots[(int) ($event['lotId'] ?? 0)])
            ? reconciled_lot_cost_per_cigar($lots[(int) $event['lotId']])
            : null;
        $cost = $cost ?? $event['costPerCigarAtEvent'] ?? null;
        $msrp = $event['msrpPerCigarAtEvent'] ?? null;
        $quantity = (int) ($event['quantity'] ?? 0);
        $status = $type === 'REVERSAL'
            ? 'Compensating Event'
            : (isset($reversedBy[$eventId]) ? 'Reversed' : 'Effective');
        $journal = $journalsByEvent[$eventId] ?? null;
        if (in_array($type, ['SMOKED', 'GIFTED', 'DISCARDED'], true)) {
            $sourceLocationId = $fromLocationId ?: $locationId;
            $sourceSectionId = $fromSectionId ?: $sectionId;
            $removalExport[] = [
                $eventId,
                $event['eventDate'] ?? null,
                $type,
                $status,
                $reversedBy[$eventId] ?? null,
                $cigarId ?: null,
                csv_export_cigar_name($cigar),
                (int) ($event['lotId'] ?? 0) ?: null,
                (int) ($event['purchaseId'] ?? 0) ?: null,
                $quantity,
                csv_export_location_name($sourceLocationId, $locations),
                csv_export_section_name($sourceSectionId, $sections),
                csv_export_number($cost, 6),
                csv_export_extended_money($quantity, $cost),
                csv_export_number($msrp, 6),
                csv_export_extended_money($quantity, $msrp),
                $journal['rating'] ?? null,
                $journal['notes'] ?? null,
                $event['notes'] ?? null,
                $event['occurredAt'] ?? null,
                $event['createdAt'] ?? null,
            ];
        }
        $activityExport[] = [
            $eventId,
            $event['eventDate'] ?? null,
            $type,
            $status,
            (int) ($event['reversesInventoryEventId'] ?? 0) ?: null,
            $reversedBy[$eventId] ?? null,
            $cigarId ?: null,
            csv_export_cigar_name($cigar),
            (int) ($event['lotId'] ?? 0) ?: null,
            (int) ($event['purchaseLineId'] ?? 0) ?: null,
            (int) ($event['purchaseId'] ?? 0) ?: null,
            $quantity ?: null,
            $event['quantityChange'] ?? null,
            csv_export_location_name($locationId, $locations),
            csv_export_section_name($sectionId, $sections),
            csv_export_location_name($fromLocationId, $locations),
            csv_export_section_name($fromSectionId, $sections),
            csv_export_location_name($toLocationId, $locations),
            csv_export_section_name($toSectionId, $sections),
            csv_export_number($cost, 6),
            csv_export_number($msrp, 6),
            $event['notes'] ?? null,
            $event['occurredAt'] ?? null,
            $event['createdAt'] ?? null,
        ];
    }
    $sortEvents = static fn (array $left, array $right): int => strcmp((string) $left[1], (string) $right[1]) ?: ($left[0] <=> $right[0]);
    usort($removalExport, $sortEvents);
    usort($activityExport, $sortEvents);

    return [
        'collection.csv' => [
            'description' => 'Current positive Lot/location balances with cigar, location, cost, and MSRP context.',
            'headers' => ['Balance ID', 'Catalog Cigar ID', 'Cigar', 'Manufacturer', 'Series', 'Vitola', 'Strength', 'Wrapper', 'Origin', 'Lot ID', 'Purchase ID', 'Purchase Date', 'Received Date', 'Humidor', 'Section', 'Quantity On Hand', 'Cost Per Cigar', 'Extended Cost Basis', 'MSRP Per Cigar', 'Extended MSRP', 'Potential Savings'],
            'rows' => $collection,
        ],
        'catalog.csv' => [
            'description' => 'Catalog master data with purchased/on-hand quantities and effective average ratings.',
            'headers' => ['Catalog Cigar ID', 'Manufacturer', 'Series', 'Vitola', 'Shape', 'Length', 'Ring Gauge', 'Strength', 'Wrapper', 'Binder', 'Filler', 'Origin', 'MSRP', 'Buy Again Status', 'Buy Again Notes', 'Notes', 'Active', 'Purchased Quantity', 'On Hand Quantity', 'Average Rating', 'Rating Count'],
            'rows' => $catalogExport,
        ],
        'purchases.csv' => [
            'description' => 'Purchase headers with authoritative totalPaid and order/receipt quantities.',
            'headers' => ['Purchase ID', 'Purchase Date', 'Vendor ID', 'Vendor', 'Status', 'Subtotal', 'Discount', 'Shipping', 'Sales Tax', 'Excise Tax', 'Fees', 'Total Paid', 'Line Count', 'Quantity Ordered', 'Quantity Received', 'Expected Date', 'Received Date', 'Tracking Number', 'Invoice Number', 'Notes'],
            'rows' => $purchaseExport,
        ],
        'purchase-lines.csv' => [
            'description' => 'Purchase lines with joined cigar/vendor/location details and authoritative line cost allocation.',
            'headers' => ['Purchase Line ID', 'Purchase ID', 'Purchase Date', 'Vendor', 'Catalog Cigar ID', 'Cigar', 'Quantity Ordered', 'Quantity Received', 'Humidor', 'Section', 'Line Subtotal', 'Allocated Discount', 'Allocated Shipping', 'Allocated Sales Tax', 'Allocated Excise Tax', 'Authoritative Cost Basis', 'Authoritative Cost Per Cigar', 'MSRP Per Cigar', 'Notes'],
            'rows' => $lineExport,
        ],
        'smoking-journal.csv' => [
            'description' => 'Smoking Journal ratings and notes, including visibly identified reversed history.',
            'headers' => ['Journal Entry ID', 'Inventory Event ID', 'Status', 'Smoke Date', 'Catalog Cigar ID', 'Cigar', 'Lot ID', 'Quantity', 'Humidor', 'Section', 'Rating', 'Journal Notes', 'Buy Again Status', 'Buy Again Notes', 'Created At', 'Updated At'],
            'rows' => $journalExport,
        ],
        'removal-history.csv' => [
            'description' => 'Smoke, gift, and discard events with values, journal details, and reversal status.',
            'headers' => ['Inventory Event ID', 'Event Date', 'Removal Type', 'Status', 'Reversal Event ID', 'Catalog Cigar ID', 'Cigar', 'Lot ID', 'Purchase ID', 'Quantity', 'Humidor', 'Section', 'Cost Per Cigar', 'Extended Cost', 'MSRP Per Cigar', 'Extended MSRP', 'Rating', 'Journal Notes', 'Event Notes', 'Occurred At', 'Created At'],
            'rows' => $removalExport,
        ],
        'inventory-activity.csv' => [
            'description' => 'Complete inventory event ledger with references, location movement, quantities, and values.',
            'headers' => ['Inventory Event ID', 'Event Date', 'Event Type', 'Status', 'Reverses Event ID', 'Reversed By Event ID', 'Catalog Cigar ID', 'Cigar', 'Lot ID', 'Purchase Line ID', 'Purchase ID', 'Quantity', 'Quantity Change', 'Humidor', 'Section', 'From Humidor', 'From Section', 'To Humidor', 'To Section', 'Cost Per Cigar', 'MSRP Per Cigar', 'Notes', 'Occurred At', 'Created At'],
            'rows' => $activityExport,
        ],
    ];
}

function create_csv_export_package(): array
{
    $files = with_data_transaction(static fn (): array => csv_export_build_files());
    $createdAtUtc = gmdate('Y-m-d\TH:i:s\Z');
    $summaryRows = [];
    foreach ($files as $filename => $file) {
        $summaryRows[] = [
            $createdAtUtc,
            csv_export_project_revision(),
            $filename,
            count($file['rows']),
            $file['description'],
        ];
    }
    $files['export-summary.csv'] = [
        'description' => 'Export metadata and row counts.',
        'headers' => ['Export Generated At UTC', 'Project Revision', 'File', 'Row Count', 'Description'],
        'rows' => $summaryRows,
    ];

    $tempPath = tempnam(sys_get_temp_dir(), 'humidorhq-csv-');
    if ($tempPath === false) {
        throw new ApiError('CSV_EXPORT_FAILED', 'A temporary export package could not be created.', 500);
    }
    try {
        $contents = [];
        foreach ($files as $filename => $file) {
            $contents[$filename] = csv_export_encode($file['headers'], $file['rows']);
        }
        csv_export_write_zip($tempPath, $contents);
        if (!is_file($tempPath) || !is_readable($tempPath)) {
            throw new ApiError('CSV_EXPORT_FAILED', 'The CSV export package could not be read.', 500);
        }
        return [
            'path' => $tempPath,
            'filename' => 'humidorhq-data-export-' . gmdate('Ymd-His') . '.zip',
        ];
    } catch (Throwable $error) {
        @unlink($tempPath);
        throw $error;
    }
}
