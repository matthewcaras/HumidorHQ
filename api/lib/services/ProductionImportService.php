<?php
declare(strict_types=1);
/*
 * Filename: ProductionImportService.php
 * Revision: 1.0.1
 * Description: Admin-only production runtime import package validation and atomic application.
 * Modified Date: 2026-07-22 13:45 ET
 */

const HUMIDORHQ_PRODUCTION_IMPORT_FORMAT = 'humidorhq-production-import-package';
const HUMIDORHQ_PRODUCTION_IMPORT_VERSION = 1;
const HUMIDORHQ_PRODUCTION_IMPORT_CONFIRMATION = 'APPLY-HUMIDORHQ-PRODUCTION-IMPORT';
const HUMIDORHQ_PRODUCTION_IMPORT_MARKER = '.production-import-complete.json';
const HUMIDORHQ_PRODUCTION_IMPORT_LOCK = '.production-import.lock';

function production_import_required_files(): array
{
    return [
        'catalog-cigars.json',
        'counters.json',
        'inventory-events.json',
        'lot-location-balances.json',
        'lots.json',
        'purchase-lines.json',
        'purchases.json',
        'smoking-journal-entries.json',
        'storage-locations.json',
        'storage-sub-locations.json',
        'vendors.json',
    ];
}

function production_import_marker_path(): string
{
    return DATA_ROOT . DIRECTORY_SEPARATOR . HUMIDORHQ_PRODUCTION_IMPORT_MARKER;
}

function production_import_lock_path(): string
{
    return DATA_ROOT . DIRECTORY_SEPARATOR . HUMIDORHQ_PRODUCTION_IMPORT_LOCK;
}

function production_import_admin_usernames(): array
{
    $raw = getenv('HUMIDORHQ_IMPORT_ADMIN_USERNAMES');
    $usernames = [];
    if (is_string($raw) && trim($raw) !== '') {
        $usernames = preg_split('/\s*,\s*/', trim($raw), -1, PREG_SPLIT_NO_EMPTY) ?: [];
    }
    if ($usernames === []) {
        $usernames = ['matt'];
    }
    $usernames = array_map(static fn (string $name): string => strtolower(trim($name)), $usernames);
    return array_values(array_filter(array_unique($usernames), static fn (string $name): bool => $name !== ''));
}

function current_user_is_import_admin(): bool
{
    $user = current_auth_user();
    if (!is_array($user)) {
        return false;
    }
    $username = strtolower(trim((string) ($user['username'] ?? '')));
    return $username !== '' && in_array($username, production_import_admin_usernames(), true);
}

function require_import_admin(): void
{
    require_auth();
    if (!current_user_is_import_admin()) {
        json_error('IMPORT_ADMIN_REQUIRED', 'You are not authorized to run production imports.', 403);
    }
}

function production_import_is_enabled(): bool
{
    return !is_file(production_import_marker_path());
}

function production_import_atomic_write_json(string $path, array|object $payload): void
{
    $json = json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
    if (!is_string($json)) {
        throw new ApiError('PRODUCTION_IMPORT_STATE_FAILED', 'A production import file could not be encoded.', 500);
    }
    $temporary = $path . '.tmp.' . bin2hex(random_bytes(6));
    if (file_put_contents($temporary, $json . PHP_EOL, LOCK_EX) === false || !rename($temporary, $path)) {
        @unlink($temporary);
        throw new ApiError('PRODUCTION_IMPORT_STATE_FAILED', 'A production import file could not be written atomically.', 500);
    }
}

function production_import_temp_root(): string
{
    return rtrim(sys_get_temp_dir(), DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR
        . 'humidorhq-production-import-' . gmdate('Ymd-His') . '-' . bin2hex(random_bytes(4));
}

function production_import_backup_root(): string
{
    $root = production_import_temp_root() . DIRECTORY_SEPARATOR . 'backup';
    if (!is_dir($root) && !mkdir($root, 0700, true) && !is_dir($root)) {
        throw new ApiError('PRODUCTION_IMPORT_BACKUP_FAILED', 'The production import backup directory could not be created.', 500);
    }
    return $root;
}

function production_import_copy_runtime_backup(): string
{
    $backupRoot = production_import_backup_root();
    $files = array_merge(production_import_required_files(), ['auth-users.json', 'audit-log.jsonl']);
    foreach ($files as $filename) {
        $path = DATA_ROOT . DIRECTORY_SEPARATOR . $filename;
        if (!is_file($path)) {
            continue;
        }
        if (!copy($path, $backupRoot . DIRECTORY_SEPARATOR . $filename)) {
            throw new ApiError('PRODUCTION_IMPORT_BACKUP_FAILED', 'The current runtime data could not be copied into the safety backup.', 500);
        }
    }
    production_import_atomic_write_json($backupRoot . DIRECTORY_SEPARATOR . 'manifest.json', [
        'createdAtUtc' => now_iso(),
        'files' => array_values(array_filter($files, static fn (string $filename): bool => is_file(DATA_ROOT . DIRECTORY_SEPARATOR . $filename))),
    ]);
    return $backupRoot;
}

function production_import_restore_runtime_backup(string $backupRoot): void
{
    foreach (production_import_required_files() as $filename) {
        $path = $backupRoot . DIRECTORY_SEPARATOR . $filename;
        if (!is_file($path)) {
            throw new ApiError('PRODUCTION_IMPORT_BACKUP_FAILED', 'A safety backup file is missing: ' . $filename, 500);
        }
        $rows = json_decode((string) file_get_contents($path), true);
        if (!is_array($rows)) {
            throw new ApiError('PRODUCTION_IMPORT_BACKUP_FAILED', 'A safety backup file is malformed: ' . $filename, 500);
        }
        save_collection(str_replace('.json', '', $filename), $rows);
    }
}

function production_import_read_zip_json(ZipArchive $archive, string $name): string
{
    $entry = $archive->locateName($name, ZipArchive::FL_NODIR);
    if ($entry === false) {
        throw new ApiError('PRODUCTION_IMPORT_INVALID_PACKAGE', 'The production import package is missing: ' . $name, 409);
    }
    $content = $archive->getFromIndex($entry);
    if (!is_string($content) || $content === '') {
        throw new ApiError('PRODUCTION_IMPORT_INVALID_PACKAGE', 'The production import package could not be read: ' . $name, 409);
    }
    return $content;
}

function production_import_decode_json(string $json, string $filename): array
{
    try {
        $decoded = json_decode($json, true, 512, JSON_THROW_ON_ERROR);
    } catch (Throwable) {
        throw new ApiError('PRODUCTION_IMPORT_INVALID_JSON', 'A production import file contains malformed JSON: ' . $filename, 409);
    }
    if (!is_array($decoded)) {
        throw new ApiError('PRODUCTION_IMPORT_INVALID_JSON', 'A production import file must decode to JSON: ' . $filename, 409);
    }
    return $decoded;
}

function production_import_money_to_cents(mixed $value): int
{
    if ($value === null || $value === '') {
        return 0;
    }
    $text = trim((string) $value);
    if (!preg_match('/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]{1,2})?$/', $text)) {
        throw new ApiError('PRODUCTION_IMPORT_INVALID_PACKAGE', 'A production import money value is invalid.', 409);
    }
    $negative = str_starts_with($text, '-');
    $text = ltrim($text, '+-');
    [$whole, $fraction] = array_pad(explode('.', $text, 2), 2, '0');
    $cents = ((int) $whole * 100) + (int) str_pad($fraction, 2, '0');
    return $negative ? -$cents : $cents;
}

function production_import_manifest_import_id(array $manifest): string
{
    $importId = trim((string) ($manifest['importId'] ?? ''));
    if (!preg_match('/^prodimport-\d{8}-\d{6}-[a-f0-9]{8}$/', $importId)) {
        throw new ApiError('PRODUCTION_IMPORT_INVALID_PACKAGE', 'The production import manifest importId is invalid.', 409);
    }
    return $importId;
}

function production_import_validate_manifest(array $manifest): array
{
    if (($manifest['format'] ?? null) !== HUMIDORHQ_PRODUCTION_IMPORT_FORMAT || (int) ($manifest['version'] ?? 0) !== HUMIDORHQ_PRODUCTION_IMPORT_VERSION) {
        throw new ApiError('PRODUCTION_IMPORT_INVALID_PACKAGE', 'The production import package format is not supported.', 409);
    }
    $importId = production_import_manifest_import_id($manifest);
    $files = $manifest['files'] ?? null;
    if (!is_array($files)) {
        throw new ApiError('PRODUCTION_IMPORT_INVALID_PACKAGE', 'The production import manifest file list is missing.', 409);
    }
    $expectedFiles = production_import_required_files();
    foreach ($expectedFiles as $filename) {
        $entry = $files[$filename] ?? null;
        $countValue = $entry['count'] ?? null;
        if (!is_array($entry) || !preg_match('/^[a-f0-9]{64}$/', (string) ($entry['sha256'] ?? '')) || (!(is_int($countValue) || ctype_digit((string) $countValue)))) {
            throw new ApiError('PRODUCTION_IMPORT_INVALID_PACKAGE', 'The production import manifest is invalid for ' . $filename . '.', 409);
        }
    }
    foreach (array_keys($files) as $filename) {
        if (!in_array($filename, $expectedFiles, true)) {
            throw new ApiError('PRODUCTION_IMPORT_UNEXPECTED_FILE', 'The production import package contains an unexpected filename: ' . $filename, 409);
        }
    }
    foreach (['expectedReceipts', 'expectedRemovals', 'expectedOnHandQuantity', 'expectedLotCount'] as $field) {
        if (!array_key_exists($field, $manifest) || (!(is_int($manifest[$field]) || ctype_digit((string) $manifest[$field])))) {
            throw new ApiError('PRODUCTION_IMPORT_INVALID_PACKAGE', 'The production import manifest is missing ' . $field . '.', 409);
        }
    }
    return [
        'importId' => $importId,
        'files' => $files,
        'expectedReceipts' => (int) $manifest['expectedReceipts'],
        'expectedRemovals' => (int) $manifest['expectedRemovals'],
        'expectedOnHandQuantity' => (int) $manifest['expectedOnHandQuantity'],
        'expectedLotCount' => (int) $manifest['expectedLotCount'],
    ];
}

function production_import_validate_zip_entries(ZipArchive $archive, array $allowedNames): void
{
    $allowed = array_fill_keys($allowedNames, true);
    $seen = [];
    for ($i = 0; $i < $archive->numFiles; $i++) {
        $stat = $archive->statIndex($i);
        $name = (string) ($stat['name'] ?? '');
        if ($name === '' || str_contains($name, '/') || str_contains($name, '\\') || str_contains($name, '..')) {
            throw new ApiError('PRODUCTION_IMPORT_INVALID_PACKAGE', 'The production import package contains a path traversal filename.', 409);
        }
        if (!isset($allowed[$name])) {
            throw new ApiError('PRODUCTION_IMPORT_UNEXPECTED_FILE', 'The production import package contains an unexpected filename: ' . $name, 409);
        }
        if (isset($seen[$name])) {
            throw new ApiError('PRODUCTION_IMPORT_UNEXPECTED_FILE', 'The production import package contains a duplicate filename: ' . $name, 409);
        }
        $seen[$name] = true;
    }
    foreach ($allowedNames as $name) {
        if (!isset($seen[$name])) {
            throw new ApiError('PRODUCTION_IMPORT_INVALID_PACKAGE', 'The production import package is missing: ' . $name, 409);
        }
    }
}

function production_import_open_package(string $path): ZipArchive
{
    if (!class_exists(ZipArchive::class)) {
        throw new ApiError('PRODUCTION_IMPORT_UNAVAILABLE', 'ZipArchive is not available on the server.', 500);
    }
    $archive = new ZipArchive();
    $opened = $archive->open($path);
    if ($opened !== true) {
        throw new ApiError('PRODUCTION_IMPORT_INVALID_PACKAGE', 'The uploaded production import package could not be opened.', 409);
    }
    return $archive;
}

function production_import_parse_package(string $path): array
{
    $archive = production_import_open_package($path);
    try {
        $allowedFiles = production_import_required_files();
        production_import_validate_zip_entries($archive, array_merge($allowedFiles, ['manifest.json']));

        $manifestRaw = production_import_read_zip_json($archive, 'manifest.json');
        $manifest = production_import_validate_manifest(production_import_decode_json($manifestRaw, 'manifest.json'));

        $collections = [];
        $counts = [];
        foreach ($allowedFiles as $filename) {
            $raw = production_import_read_zip_json($archive, $filename);
            if (!hash_equals($manifest['files'][$filename]['sha256'], hash('sha256', $raw))) {
                throw new ApiError('PRODUCTION_IMPORT_HASH_MISMATCH', 'A production import file failed hash verification: ' . $filename, 409);
            }
            $decoded = production_import_decode_json($raw, $filename);
            $expectedCount = (int) $manifest['files'][$filename]['count'];
            $actualCount = $filename === 'counters.json' ? count($decoded) : count($decoded);
            $isValidShape = $filename === 'counters.json' ? !array_is_list($decoded) : array_is_list($decoded);
            if (!$isValidShape) {
                throw new ApiError('PRODUCTION_IMPORT_INVALID_JSON', 'A production import file has an invalid JSON structure: ' . $filename, 409);
            }
            if ($actualCount !== $expectedCount) {
                throw new ApiError('PRODUCTION_IMPORT_INVALID_PACKAGE', 'The production import manifest count does not match ' . $filename . '.', 409);
            }
            $collection = str_replace('.json', '', $filename);
            $collections[$collection] = $decoded;
            $counts[$collection] = $actualCount;
        }

        return [
            'manifest' => $manifest,
            'collections' => $collections,
            'counts' => $counts,
        ];
    } finally {
        $archive->close();
    }
}

function production_import_normalize_optional_id(mixed $value): ?int
{
    if ($value === null || trim((string) $value) === '') {
        return null;
    }
    $id = (int) $value;
    return $id > 0 ? $id : null;
}

function production_import_normalize_event_type(mixed $value): string
{
    return strtoupper(str_replace(['_', ' '], '-', trim((string) $value)));
}

function production_import_collect_integrity_summary(array $collections): array
{
    $catalogIds = [];
    foreach ($collections['catalog-cigars'] ?? [] as $row) {
        $id = (int) ($row['id'] ?? 0);
        if ($id > 0) {
            $catalogIds[$id] = true;
        }
    }
    $vendorIds = [];
    foreach ($collections['vendors'] ?? [] as $row) {
        $id = (int) ($row['id'] ?? 0);
        if ($id > 0) {
            $vendorIds[$id] = true;
        }
    }
    $humidorIds = [];
    foreach ($collections['storage-locations'] ?? [] as $row) {
        $id = (int) ($row['id'] ?? 0);
        if ($id > 0) {
            $humidorIds[$id] = true;
        }
    }
    $sectionIds = [];
    foreach ($collections['storage-sub-locations'] ?? [] as $row) {
        $id = (int) ($row['id'] ?? 0);
        if ($id > 0) {
            $sectionIds[$id] = true;
        }
    }
    $lotIds = [];
    $lotRows = $collections['lots'] ?? [];
    foreach ($lotRows as $row) {
        $id = (int) ($row['id'] ?? 0);
        if ($id > 0) {
            $lotIds[$id] = true;
        }
    }
    $eventIds = [];
    $eventsById = [];
    foreach ($collections['inventory-events'] ?? [] as $row) {
        $id = (int) ($row['id'] ?? 0);
        if ($id > 0) {
            $eventIds[$id] = true;
            $eventsById[$id] = $row;
        }
    }

    $errors = 0;
    $warnings = 0;
    $summary = [
        'positiveBalanceQuantity' => 0,
        'receiptQuantity' => 0,
        'removalQuantity' => 0,
        'expectedCurrentQuantity' => 0,
        'lotCount' => count($lotRows),
        'splitLotCount' => 0,
        'orphanJournalEntries' => 0,
        'sameSourceDestinationMoves' => 0,
        'missingSubtotalPurchases' => 0,
        'negativeDiscountPurchases' => 0,
        'purchaseTotalMismatches' => 0,
    ];

    $reversedEventIds = [];
    foreach ($collections['inventory-events'] ?? [] as $event) {
        if (production_import_normalize_event_type($event['eventType'] ?? '') !== 'REVERSAL') {
            continue;
        }
        $targetId = production_import_normalize_optional_id($event['reversesInventoryEventId'] ?? null);
        if ($targetId === null || !isset($eventsById[$targetId])) {
            $errors++;
            continue;
        }
        $reversedEventIds[$targetId] = true;
    }

    $positiveByLot = [];
    foreach ($collections['lot-location-balances'] ?? [] as $balance) {
        $quantity = (int) ($balance['quantity'] ?? 0);
        if ($quantity > 0) {
            $summary['positiveBalanceQuantity'] += $quantity;
            $lotId = (int) ($balance['lotId'] ?? 0);
            $positiveByLot[$lotId] = ($positiveByLot[$lotId] ?? 0) + $quantity;
        }
        if (production_import_normalize_optional_id($balance['storageLocationId'] ?? null) === null) {
            $errors++;
        }
        $sectionId = production_import_normalize_optional_id($balance['storageSubLocationId'] ?? null);
        if ($sectionId !== null && !isset($sectionIds[$sectionId])) {
            $errors++;
        }
        $locationId = production_import_normalize_optional_id($balance['storageLocationId'] ?? null);
        if ($locationId !== null && !isset($humidorIds[$locationId])) {
            $errors++;
        }
    }

    foreach ($lotRows as $lot) {
        $lotId = (int) ($lot['id'] ?? 0);
        if ((int) ($lot['currentQuantity'] ?? 0) !== (int) ($positiveByLot[$lotId] ?? 0)) {
            $errors++;
        }
    }

    foreach ($collections['inventory-events'] ?? [] as $event) {
        $eventId = (int) ($event['id'] ?? 0);
        $quantity = (int) ($event['quantity'] ?? 0);
        if (!isset($reversedEventIds[$eventId])) {
            switch (production_import_normalize_event_type($event['eventType'] ?? '')) {
                case 'PURCHASE-RECEIPT':
                case 'RECEIPT':
                    $summary['receiptQuantity'] += $quantity;
                    break;
                case 'SMOKED':
                case 'GIFTED':
                case 'DISCARDED':
                    $summary['removalQuantity'] += $quantity;
                    break;
                case 'MOVE':
                    $sourceLocation = production_import_normalize_optional_id($event['fromStorageLocationId'] ?? null);
                    $targetLocation = production_import_normalize_optional_id($event['toStorageLocationId'] ?? ($event['storageLocationId'] ?? null));
                    $sourceSection = production_import_normalize_optional_id($event['fromStorageSubLocationId'] ?? null);
                    $targetSection = production_import_normalize_optional_id($event['toStorageSubLocationId'] ?? ($event['storageSubLocationId'] ?? null));
                    if ($sourceLocation !== null && $targetLocation !== null && $sourceLocation === $targetLocation && $sourceSection === $targetSection) {
                        $summary['sameSourceDestinationMoves']++;
                        $errors++;
                    }
                    break;
            }
        }
        foreach (['storageLocationId', 'fromStorageLocationId', 'toStorageLocationId'] as $field) {
            $locationId = production_import_normalize_optional_id($event[$field] ?? null);
            if ($locationId !== null && !isset($humidorIds[$locationId])) {
                $errors++;
            }
        }
        foreach (['storageSubLocationId', 'fromStorageSubLocationId', 'toStorageSubLocationId'] as $field) {
            $sectionId = production_import_normalize_optional_id($event[$field] ?? null);
            if ($sectionId !== null && !isset($sectionIds[$sectionId])) {
                $errors++;
            }
        }
    }

    foreach ($collections['purchase-lines'] ?? [] as $line) {
        $catalogId = production_import_normalize_optional_id($line['catalogCigarId'] ?? null);
        if ($catalogId === null || !isset($catalogIds[$catalogId])) {
            $errors++;
        }
        $locationId = production_import_normalize_optional_id($line['storageLocationId'] ?? null);
        if ($locationId !== null && !isset($humidorIds[$locationId])) {
            $errors++;
        }
        $sectionId = production_import_normalize_optional_id($line['storageSubLocationId'] ?? null);
        if ($sectionId !== null && !isset($sectionIds[$sectionId])) {
            $errors++;
        }
    }
    foreach ($collections['lots'] ?? [] as $lot) {
        $catalogId = production_import_normalize_optional_id($lot['catalogCigarId'] ?? null);
        if ($catalogId === null || !isset($catalogIds[$catalogId])) {
            $errors++;
        }
    }
    foreach ($collections['smoking-journal-entries'] ?? [] as $journal) {
        $inventoryEventId = production_import_normalize_optional_id($journal['inventoryEventId'] ?? null);
        if ($inventoryEventId === null || !isset($eventIds[$inventoryEventId])) {
            $summary['orphanJournalEntries']++;
            $errors++;
        }
    }
    foreach ($collections['purchases'] ?? [] as $purchase) {
        $vendorId = production_import_normalize_optional_id($purchase['vendorId'] ?? null);
        if ($vendorId !== null && !isset($vendorIds[$vendorId])) {
            $errors++;
        }
        if (trim((string) ($purchase['subtotal'] ?? '')) === '') {
            $summary['missingSubtotalPurchases']++;
            $errors++;
        }
        if (trim((string) ($purchase['discount'] ?? '')) !== '' && (float) $purchase['discount'] < 0) {
            $summary['negativeDiscountPurchases']++;
            $errors++;
        }
        if (trim((string) ($purchase['totalPaid'] ?? '')) === '') {
            $errors++;
        } else {
            $expectedTotal = production_import_money_to_cents($purchase['subtotal'] ?? null)
                + production_import_money_to_cents($purchase['shipping'] ?? null)
                + production_import_money_to_cents($purchase['exciseTax'] ?? null)
                + production_import_money_to_cents($purchase['salesTax'] ?? null)
                - production_import_money_to_cents($purchase['discount'] ?? null);
            $actualTotal = production_import_money_to_cents($purchase['totalPaid'] ?? null);
            if ($expectedTotal !== $actualTotal) {
                $summary['purchaseTotalMismatches']++;
                $errors++;
            }
        }
    }

    $summary['expectedCurrentQuantity'] = $summary['receiptQuantity'] - $summary['removalQuantity'];
    $summary['splitLotCount'] = count(array_filter($positiveByLot, static fn (int $quantity): bool => $quantity > 0));
    return [
        'errors' => $errors,
        'warnings' => $warnings,
        'summary' => $summary,
    ];
}

function production_import_status(): array
{
    $markerPath = production_import_marker_path();
    if (!is_file($markerPath)) {
        return [
            'enabled' => true,
            'completed' => false,
            'result' => null,
        ];
    }
    $raw = file_get_contents($markerPath);
    $decoded = is_string($raw) ? json_decode($raw, true) : null;
    if (!is_array($decoded)) {
        throw new ApiError('PRODUCTION_IMPORT_STATE_FAILED', 'The production import completion marker is malformed.', 500);
    }
    return [
        'enabled' => false,
        'completed' => true,
        'result' => $decoded,
    ];
}

function production_import_result_payload(array $manifest, array $counts, array $integrity, string $backupRoot): array
{
    return [
        'completedAtUtc' => now_iso(),
        'importId' => (string) $manifest['importId'],
        'status' => 'success',
        'enabled' => false,
        'backupRoot' => basename($backupRoot),
        'catalogCount' => (int) ($counts['catalog-cigars'] ?? 0),
        'purchaseCount' => (int) ($counts['purchases'] ?? 0),
        'lotCount' => (int) ($counts['lots'] ?? 0),
        'receipts' => (int) $integrity['summary']['receiptQuantity'],
        'removals' => (int) $integrity['summary']['removalQuantity'],
        'onHand' => (int) $integrity['summary']['positiveBalanceQuantity'],
        'integrityErrors' => (int) $integrity['errors'],
        'integrityWarnings' => (int) $integrity['warnings'],
        'expectedReceipts' => (int) $manifest['expectedReceipts'],
        'expectedRemovals' => (int) $manifest['expectedRemovals'],
        'expectedOnHandQuantity' => (int) $manifest['expectedOnHandQuantity'],
        'expectedLotCount' => (int) $manifest['expectedLotCount'],
    ];
}

function production_import_apply_package(array $uploadedFile, array $input): array
{
    require_import_admin();
    if (!production_import_is_enabled()) {
        throw new ApiError('PRODUCTION_IMPORT_DISABLED', 'Production import has already been completed and is disabled.', 409);
    }
    if ((string) ($input['confirmation'] ?? '') !== HUMIDORHQ_PRODUCTION_IMPORT_CONFIRMATION) {
        throw new ApiError('PRODUCTION_IMPORT_CONFIRMATION_REQUIRED', 'Enter the exact production import confirmation phrase.', 400);
    }
    if (!is_array($uploadedFile) || (int) ($uploadedFile['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
        throw new ApiError('PRODUCTION_IMPORT_FILE_REQUIRED', 'Select a valid production import package.', 400);
    }
    $maxBytes = auth_env_int('HUMIDORHQ_PRODUCTION_IMPORT_MAX_BYTES', 50_000_000, 1_000_000, 200_000_000);
    if ((int) ($uploadedFile['size'] ?? 0) > $maxBytes) {
        throw new ApiError('PRODUCTION_IMPORT_TOO_LARGE', 'The production import package is too large.', 413);
    }
    $tmpPath = (string) ($uploadedFile['tmp_name'] ?? '');
    if ($tmpPath === '' || !is_file($tmpPath)) {
        throw new ApiError('PRODUCTION_IMPORT_FILE_REQUIRED', 'Select a valid production import package.', 400);
    }
    if (strtolower((string) ($uploadedFile['name'] ?? '')) !== '' && !str_ends_with(strtolower((string) $uploadedFile['name']), '.zip')) {
        throw new ApiError('PRODUCTION_IMPORT_FILE_REQUIRED', 'Select a valid ZIP production import package.', 400);
    }

    $lock = fopen(production_import_lock_path(), 'c');
    if ($lock === false || !flock($lock, LOCK_EX)) {
        if (is_resource($lock)) {
            fclose($lock);
        }
        throw new ApiError('PRODUCTION_IMPORT_LOCK_FAILED', 'Production import could not acquire its exclusive lock.', 500);
    }

    $backupRoot = null;
    try {
        recover_interrupted_data_transaction(DATA_ROOT);
        if (!production_import_is_enabled()) {
            throw new ApiError('PRODUCTION_IMPORT_DISABLED', 'Production import has already been completed and is disabled.', 409);
        }
        $parsed = production_import_parse_package($tmpPath);
        $integrity = production_import_collect_integrity_summary($parsed['collections']);
        if ($integrity['errors'] > 0 || $integrity['warnings'] > 0) {
            throw new ApiError('PRODUCTION_IMPORT_INTEGRITY_FAILED', 'The production import package failed integrity validation.', 409);
        }
        if ((int) $integrity['summary']['receiptQuantity'] !== (int) $parsed['manifest']['expectedReceipts']
            || (int) $integrity['summary']['removalQuantity'] !== (int) $parsed['manifest']['expectedRemovals']
            || (int) $integrity['summary']['positiveBalanceQuantity'] !== (int) $parsed['manifest']['expectedOnHandQuantity']
            || (int) $integrity['summary']['lotCount'] !== (int) $parsed['manifest']['expectedLotCount']) {
            throw new ApiError('PRODUCTION_IMPORT_INTEGRITY_FAILED', 'The imported package does not match the expected production inventory totals.', 409);
        }

        $backupRoot = production_import_copy_runtime_backup();

        with_data_transaction(static function () use ($parsed): void {
            foreach ($parsed['collections'] as $collection => $rows) {
                save_collection($collection, $rows);
            }
        });

        if (auth_env_bool('HUMIDORHQ_TEST_MODE') && (string) ($input['simulateFailure'] ?? '') === 'after-commit') {
            throw new ApiError('PRODUCTION_IMPORT_TEST_FAILURE', 'Injected production import failure.', 500);
        }

        $result = production_import_result_payload($parsed['manifest'], $parsed['counts'], $integrity, $backupRoot);
        production_import_atomic_write_json(production_import_marker_path(), $result);
        return $result;
    } catch (Throwable $error) {
        if ($backupRoot !== null && is_dir($backupRoot)) {
            try {
                production_import_restore_runtime_backup($backupRoot);
            } catch (Throwable) {
                // Preserve the original failure if rollback also fails.
            }
        }
        throw $error;
    } finally {
        flock($lock, LOCK_UN);
        fclose($lock);
    }
}
