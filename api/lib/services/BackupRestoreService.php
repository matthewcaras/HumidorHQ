<?php
declare(strict_types=1);
/*
 * Filename: BackupRestoreService.php
 * Revision: 1.0.3
 * Description: Authenticated runtime backup export, validation, and transactional restore service.
 * Modified Date: 2026-07-24 10:20 ET
 */

const HUMIDORHQ_BACKUP_FORMAT = 'humidorhq-runtime-backup';
const HUMIDORHQ_BACKUP_VERSION = 1;
const HUMIDORHQ_RESTORE_CONFIRMATION = 'RESTORE-HUMIDORHQ-BACKUP';

function backup_collection_names(): array
{
    return [
        'auth-users', 'catalog-cigars', 'counters', 'inventory-events', 'lot-location-balances',
        'lots', 'purchase-lines', 'purchases', 'smoking-journal-entries', 'storage-locations',
        'storage-sub-locations', 'vendors',
    ];
}

function backup_daily_backup_kind(string $username): string
{
    $slug = preg_replace('/[^a-z0-9]+/', '-', strtolower(trim($username)));
    $slug = trim((string) $slug, '-');
    return $slug !== '' ? 'daily-' . $slug : 'daily';
}

function backup_daily_backup_slug(string $username): string
{
    $slug = preg_replace('/[^a-z0-9]+/', '-', strtolower(trim($username)));
    return trim((string) $slug, '-');
}

function backup_daily_backup_marker_path(string $username, ?string $localDate = null): string
{
    $slug = backup_daily_backup_slug($username);
    if ($slug === '') {
        return backup_directory() . DIRECTORY_SEPARATOR . '.daily-backup-unknown.marker';
    }
    $date = preg_replace('/[^0-9\-]/', '', $localDate ?? today_local_date());
    return backup_directory() . DIRECTORY_SEPARATOR . '.daily-backup-' . $slug . '-' . $date . '.marker';
}

function backup_directory(): string
{
    $path = APP_ROOT . DIRECTORY_SEPARATOR . 'backups';
    if (!is_dir($path) && !mkdir($path, 0770, true) && !is_dir($path)) {
        throw new ApiError('BACKUP_DIRECTORY_FAILED', 'The backup directory could not be created.', 500);
    }
    if (!is_readable($path) || !is_writable($path)) {
        throw new ApiError('BACKUP_DIRECTORY_FAILED', 'The backup directory must be readable and writable by PHP.', 500);
    }
    return $path;
}

function backup_daily_backup_exists(string $username, ?string $localDate = null): bool
{
    return is_file(backup_daily_backup_marker_path($username, $localDate));
}

function backup_daily_backup_in_progress(): bool
{
    return ($GLOBALS['humidorhq_daily_backup_in_progress'] ?? false) === true;
}

function backup_collect_bundle_rows(): array
{
    $rows = [];
    foreach (glob(backup_directory() . DIRECTORY_SEPARATOR . 'humidorhq-*.json') ?: [] as $path) {
        try {
            $bundle = backup_load_bundle(basename($path));
            $validated = backup_validate_bundle($bundle, false);
            $rows[] = [
                'filename' => basename($path),
                'path' => $path,
                'createdAtUtc' => (string) ($bundle['createdAtUtc'] ?? ''),
                'mtime' => (int) (@filemtime($path) ?: 0),
                'kind' => (string) ($bundle['kind'] ?? ''),
                'sourceFingerprint' => (string) ($bundle['sourceFingerprint'] ?? ''),
                'counts' => $validated['counts'],
                'bytes' => (int) (@filesize($path) ?: 0),
            ];
        } catch (Throwable) {
            continue;
        }
    }
    usort($rows, static function (array $left, array $right): int {
        $createdCompare = strcmp((string) $left['createdAtUtc'], (string) $right['createdAtUtc']);
        if ($createdCompare !== 0) {
            return $createdCompare;
        }
        $mtimeCompare = ((int) $left['mtime']) <=> ((int) $right['mtime']);
        if ($mtimeCompare !== 0) {
            return $mtimeCompare;
        }
        return strcmp((string) $left['filename'], (string) $right['filename']);
    });
    return $rows;
}

function backup_prune_old_backups(int $retain = 4): array
{
    $retain = max(0, $retain);
    $rows = backup_collect_bundle_rows();
    $removed = [];
    while (count($rows) > $retain) {
        $entry = array_shift($rows);
        if (!is_array($entry)) {
            break;
        }
        $path = (string) ($entry['path'] ?? '');
        if ($path === '' || !is_file($path)) {
            continue;
        }
        if (!unlink($path)) {
            throw new ApiError('BACKUP_PRUNE_FAILED', 'An old backup bundle could not be removed.', 500);
        }
        $removed[] = (string) ($entry['filename'] ?? basename($path));
    }
    return ['removed' => $removed, 'kept' => count($rows)];
}

function backup_current_manifest(): array
{
    if (!data_transaction_active()) {
        return with_data_transaction(static fn (): array => backup_current_manifest());
    }
    $files = [];
    foreach (backup_collection_names() as $collection) {
        $raw = file_get_contents(data_file_path($collection));
        $decoded = is_string($raw) ? json_decode($raw, true) : null;
        if (!is_array($decoded)) {
            throw new ApiError('BACKUP_READ_FAILED', 'Runtime data could not be read for backup.', 500);
        }
        $files[$collection . '.json'] = hash('sha256', encode_collection($collection, $decoded));
    }
    ksort($files, SORT_STRING);
    $rows = [];
    foreach ($files as $filename => $hash) {
        $rows[] = $filename . ':' . $hash;
    }
    return ['files' => $files, 'fingerprint' => hash('sha256', implode("\n", $rows))];
}

function backup_build_bundle(string $kind = 'manual'): array
{
    if (!data_transaction_active()) {
        return with_data_transaction(static fn (): array => backup_build_bundle($kind));
    }
    $manifest = backup_current_manifest();
    $files = [];
    foreach (backup_collection_names() as $collection) {
        $filename = $collection . '.json';
        $source = file_get_contents(data_file_path($collection));
        $decoded = is_string($source) ? json_decode($source, true) : null;
        if (!is_array($decoded)) {
            throw new ApiError('BACKUP_INVALID_RUNTIME_DATA', 'Runtime JSON is invalid and cannot be backed up: ' . $filename, 409);
        }
        $raw = encode_collection($collection, $decoded);
        $files[$filename] = [
            'sha256' => $manifest['files'][$filename],
            'contentBase64' => base64_encode($raw),
        ];
    }
    return [
        'format' => HUMIDORHQ_BACKUP_FORMAT,
        'version' => HUMIDORHQ_BACKUP_VERSION,
        'kind' => $kind,
        'createdAtUtc' => now_iso(),
        'sourceFingerprint' => $manifest['fingerprint'],
        'files' => $files,
    ];
}

function backup_write_bundle(array $bundle): array
{
    $directory = backup_directory();
    $kind = preg_replace('/[^a-z0-9\-]/', '', strtolower((string) ($bundle['kind'] ?? 'manual'))) ?: 'manual';
    $timestamp = str_starts_with($kind, 'daily-')
        ? (new DateTimeImmutable('now', application_timezone()))->format('Ymd-His')
        : gmdate('Ymd-His');
    $filename = 'humidorhq-' . $kind . '-' . $timestamp . '-' . bin2hex(random_bytes(4)) . '.json';
    $target = $directory . DIRECTORY_SEPARATOR . $filename;
    $temporary = $target . '.tmp.' . bin2hex(random_bytes(4));
    $json = json_encode($bundle, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
    if (!is_string($json) || file_put_contents($temporary, $json . PHP_EOL, LOCK_EX) === false || !rename($temporary, $target)) {
        @unlink($temporary);
        throw new ApiError('BACKUP_WRITE_FAILED', 'The backup bundle could not be written atomically.', 500);
    }
    return ['filename' => $filename, 'createdAtUtc' => $bundle['createdAtUtc'], 'sourceFingerprint' => $bundle['sourceFingerprint']];
}

function create_runtime_backup(string $kind = 'manual'): array
{
    $result = backup_write_bundle(backup_build_bundle($kind));
    backup_prune_old_backups();
    audit_record('Backup & Restore', 'create backup', ['filename' => $result['filename'], 'kind' => $kind]);
    return $result;
}

function maybe_create_daily_backup_for_user(array $user): ?array
{
    if (backup_daily_backup_in_progress()) {
        return null;
    }

    $username = trim((string) ($user['username'] ?? ''));
    if ($username === '') {
        return null;
    }

    $localDate = today_local_date();
    $lockPath = backup_directory() . DIRECTORY_SEPARATOR . '.daily-backup.lock';
    $lock = fopen($lockPath, 'c');
    if ($lock === false) {
        throw new ApiError('BACKUP_DIRECTORY_FAILED', 'The daily backup lock could not be created.', 500);
    }

    try {
        if (!flock($lock, LOCK_EX)) {
            throw new ApiError('BACKUP_DIRECTORY_FAILED', 'The daily backup lock could not be acquired.', 500);
        }
        if (backup_daily_backup_exists($username, $localDate)) {
            return null;
        }
        $GLOBALS['humidorhq_daily_backup_in_progress'] = true;
        try {
            $result = create_runtime_backup(backup_daily_backup_kind($username));
            $marker = backup_daily_backup_marker_path($username, $localDate);
            $markerTmp = $marker . '.tmp.' . bin2hex(random_bytes(4));
            $markerJson = json_encode([
                'username' => $username,
                'date' => $localDate,
                'filename' => $result['filename'] ?? '',
                'createdAtUtc' => $result['createdAtUtc'] ?? now_iso(),
            ], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
            if (!is_string($markerJson) || file_put_contents($markerTmp, $markerJson . PHP_EOL, LOCK_EX) === false || !rename($markerTmp, $marker)) {
                @unlink($markerTmp);
                throw new ApiError('BACKUP_WRITE_FAILED', 'The daily backup marker could not be written.', 500);
            }
            return $result;
        } finally {
            unset($GLOBALS['humidorhq_daily_backup_in_progress']);
        }
    } finally {
        flock($lock, LOCK_UN);
        fclose($lock);
    }
}

function backup_safe_filename(string $filename): string
{
    if (!preg_match('/^humidorhq\-(?:manual|pre\-restore|daily(?:\-[a-z0-9]+)*)\-\d{8}\-\d{6}\-[a-f0-9]{8}\.json$/', $filename)) {
        throw new ApiError('BACKUP_INVALID_FILENAME', 'The backup filename is invalid.', 400);
    }
    return $filename;
}

function backup_load_bundle(string $filename): array
{
    $path = backup_directory() . DIRECTORY_SEPARATOR . backup_safe_filename($filename);
    if (!is_file($path) || !is_readable($path)) {
        throw new ApiError('BACKUP_NOT_FOUND', 'The backup bundle was not found.', 404);
    }
    $raw = file_get_contents($path);
    $bundle = is_string($raw) ? json_decode($raw, true) : null;
    if (!is_array($bundle)) {
        throw new ApiError('BACKUP_INVALID', 'The backup bundle is malformed.', 409);
    }
    return $bundle;
}

function backup_validate_bundle(array $bundle, bool $enforceIntegrity = true): array
{
    if (($bundle['format'] ?? null) !== HUMIDORHQ_BACKUP_FORMAT || (int) ($bundle['version'] ?? 0) !== HUMIDORHQ_BACKUP_VERSION) {
        throw new ApiError('BACKUP_UNSUPPORTED', 'The backup format or version is not supported.', 409);
    }
    $bundleFiles = $bundle['files'] ?? null;
    if (!is_array($bundleFiles)) {
        throw new ApiError('BACKUP_INVALID', 'The backup file manifest is missing.', 409);
    }
    $collections = [];
    $counts = [];
    foreach (backup_collection_names() as $collection) {
        $filename = $collection . '.json';
        $entry = $bundleFiles[$filename] ?? null;
        $encoded = is_array($entry) ? ($entry['contentBase64'] ?? null) : null;
        $raw = is_string($encoded) ? base64_decode($encoded, true) : false;
        if (!is_string($raw) || !is_string($entry['sha256'] ?? null) || !hash_equals($entry['sha256'], hash('sha256', $raw))) {
            throw new ApiError('BACKUP_HASH_MISMATCH', 'A backup file is missing or failed hash verification: ' . $filename, 409);
        }
        $decoded = json_decode($raw, true);
        $validShape = is_array($decoded) && ($collection === 'counters' ? !array_is_list($decoded) : array_is_list($decoded));
        if (!$validShape) {
            throw new ApiError('BACKUP_INVALID_JSON', 'A backup file has an invalid JSON structure: ' . $filename, 409);
        }
        $collections[$collection] = $decoded;
        $counts[$collection] = count($decoded);
    }
    if (count($bundleFiles) !== count($collections)) {
        throw new ApiError('BACKUP_UNEXPECTED_FILES', 'The backup contains unexpected files.', 409);
    }
    ksort($bundleFiles, SORT_STRING);
    $fingerprintRows = [];
    foreach ($bundleFiles as $filename => $entry) {
        $fingerprintRows[] = $filename . ':' . $entry['sha256'];
    }
    $sourceFingerprint = (string) ($bundle['sourceFingerprint'] ?? '');
    if (!preg_match('/^[a-f0-9]{64}$/', $sourceFingerprint)
        || !hash_equals($sourceFingerprint, hash('sha256', implode("\n", $fingerprintRows)))) {
        throw new ApiError('BACKUP_HASH_MISMATCH', 'The backup manifest fingerprint failed verification.', 409);
    }
    if ($enforceIntegrity) {
        backup_validate_collection_integrity($collections);
    }
    return ['collections' => $collections, 'counts' => $counts];
}

function backup_index_by_id(array $rows, string $collection): array
{
    $index = [];
    foreach ($rows as $row) {
        $id = is_array($row) ? (int) ($row['id'] ?? 0) : 0;
        if ($id < 1 || isset($index[$id])) {
            throw new ApiError('BACKUP_INTEGRITY_FAILED', 'The backup contains a missing or duplicate ID in ' . $collection . '.', 409);
        }
        $index[$id] = $row;
    }
    return $index;
}

function backup_require_reference(array $index, mixed $value, string $label, bool $optional = false): void
{
    $id = (int) ($value ?? 0);
    if ($optional && $id === 0) {
        return;
    }
    if ($id < 1 || !isset($index[$id])) {
        throw new ApiError('BACKUP_INTEGRITY_FAILED', 'The backup contains a missing relationship: ' . $label . '.', 409);
    }
}

function backup_validate_collection_integrity(array $collections): void
{
    $indexed = [];
    foreach (backup_collection_names() as $collection) {
        if (in_array($collection, ['auth-users', 'counters'], true)) {
            continue;
        }
        $indexed[$collection] = backup_index_by_id($collections[$collection], $collection);
    }

    $usernames = [];
    foreach ($collections['auth-users'] as $user) {
        $username = is_array($user) ? strtolower(trim((string) ($user['username'] ?? ''))) : '';
        if ($username === '' || isset($usernames[$username]) || trim((string) ($user['passwordHash'] ?? '')) === '') {
            throw new ApiError('BACKUP_INTEGRITY_FAILED', 'The backup contains invalid or duplicate authentication users.', 409);
        }
        $usernames[$username] = true;
    }

    foreach ($collections['storage-sub-locations'] as $row) {
        backup_require_reference($indexed['storage-locations'], $row['storageLocationId'] ?? null, 'section Humidor');
    }
    foreach ($collections['purchases'] as $row) {
        backup_require_reference($indexed['vendors'], $row['vendorId'] ?? null, 'purchase Vendor', true);
    }
    foreach ($collections['purchase-lines'] as $row) {
        backup_require_reference($indexed['purchases'], $row['purchaseId'] ?? null, 'purchase line purchase');
        backup_require_reference($indexed['catalog-cigars'], $row['catalogCigarId'] ?? null, 'purchase line Catalog cigar');
        backup_require_reference($indexed['storage-locations'], $row['storageLocationId'] ?? null, 'purchase line Humidor', true);
        backup_require_reference($indexed['storage-sub-locations'], $row['storageSubLocationId'] ?? null, 'purchase line section', true);
    }
    foreach ($collections['lots'] as $row) {
        backup_require_reference($indexed['purchase-lines'], $row['purchaseLineId'] ?? null, 'Lot purchase line');
        backup_require_reference($indexed['purchases'], $row['purchaseId'] ?? null, 'Lot purchase');
        backup_require_reference($indexed['catalog-cigars'], $row['catalogCigarId'] ?? null, 'Lot Catalog cigar');
    }
    $positiveByLot = [];
    foreach ($collections['lot-location-balances'] as $row) {
        backup_require_reference($indexed['lots'], $row['lotId'] ?? null, 'balance Lot');
        backup_require_reference($indexed['purchase-lines'], $row['purchaseLineId'] ?? null, 'balance purchase line');
        backup_require_reference($indexed['purchases'], $row['purchaseId'] ?? null, 'balance purchase');
        backup_require_reference($indexed['storage-locations'], $row['storageLocationId'] ?? null, 'balance Humidor');
        backup_require_reference($indexed['storage-sub-locations'], $row['storageSubLocationId'] ?? null, 'balance section', true);
        $quantity = (int) ($row['quantity'] ?? 0);
        if ($quantity < 0) {
            throw new ApiError('BACKUP_INTEGRITY_FAILED', 'The backup contains a negative balance quantity.', 409);
        }
        if ($quantity > 0) {
            $lotId = (int) $row['lotId'];
            $positiveByLot[$lotId] = ($positiveByLot[$lotId] ?? 0) + $quantity;
        }
    }
    foreach ($collections['lots'] as $row) {
        if ((int) ($row['currentQuantity'] ?? 0) !== ($positiveByLot[(int) $row['id']] ?? 0)) {
            throw new ApiError('BACKUP_INTEGRITY_FAILED', 'The backup contains a Lot currentQuantity mismatch.', 409);
        }
    }
    foreach ($collections['inventory-events'] as $row) {
        backup_require_reference($indexed['lots'], $row['lotId'] ?? null, 'event Lot');
        backup_require_reference($indexed['purchase-lines'], $row['purchaseLineId'] ?? null, 'event purchase line');
        backup_require_reference($indexed['purchases'], $row['purchaseId'] ?? null, 'event purchase');
        backup_require_reference($indexed['catalog-cigars'], $row['catalogCigarId'] ?? null, 'event Catalog cigar');
        foreach (['storageLocationId', 'fromStorageLocationId', 'toStorageLocationId'] as $field) {
            backup_require_reference($indexed['storage-locations'], $row[$field] ?? null, 'event Humidor', true);
        }
        foreach (['storageSubLocationId', 'fromStorageSubLocationId', 'toStorageSubLocationId'] as $field) {
            backup_require_reference($indexed['storage-sub-locations'], $row[$field] ?? null, 'event section', true);
        }
    }
    foreach ($collections['smoking-journal-entries'] as $row) {
        backup_require_reference($indexed['inventory-events'], $row['inventoryEventId'] ?? null, 'Smoking Journal event');
    }

    $counters = $collections['counters'];
    foreach ($indexed as $collection => $rows) {
        $maximum = $rows === [] ? 0 : max(array_keys($rows));
        if (!isset($counters[$collection]) || !is_int($counters[$collection]) || $counters[$collection] <= $maximum) {
            throw new ApiError('BACKUP_INTEGRITY_FAILED', 'The backup counter is not greater than the current maximum ID for ' . $collection . '.', 409);
        }
    }
}

function import_runtime_backup(array $input): array
{
    $bundle = $input['bundle'] ?? null;
    if (!is_array($bundle)) {
        throw new ApiError('BACKUP_INVALID', 'Select a valid HumidorHQ backup bundle.', 400);
    }
    $validated = backup_validate_bundle($bundle);
    $bundle['kind'] = 'manual';
    $result = backup_write_bundle($bundle);
    backup_prune_old_backups();
    $result['counts'] = $validated['counts'];
    audit_record('Backup & Restore', 'import backup', ['filename' => $result['filename']]);
    return $result;
}

function list_runtime_backups(): array
{
    backup_prune_old_backups();
    $rows = [];
    foreach (array_reverse(backup_collect_bundle_rows()) as $row) {
        $rows[] = [
            'filename' => $row['filename'],
            'createdAtUtc' => $row['createdAtUtc'],
            'kind' => $row['kind'],
            'sourceFingerprint' => $row['sourceFingerprint'],
            'counts' => $row['counts'],
            'bytes' => $row['bytes'],
        ];
    }
    return ['backups' => $rows, 'currentManifest' => backup_current_manifest()];
}

function preview_runtime_restore(string $filename): array
{
    $bundle = backup_load_bundle($filename);
    $validated = backup_validate_bundle($bundle);
    return [
        'filename' => backup_safe_filename($filename),
        'createdAtUtc' => (string) ($bundle['createdAtUtc'] ?? ''),
        'counts' => $validated['counts'],
        'currentManifest' => backup_current_manifest(),
    ];
}

function restore_runtime_backup(string $filename, array $input): array
{
    if ((string) ($input['confirmation'] ?? '') !== HUMIDORHQ_RESTORE_CONFIRMATION) {
        throw new ApiError('RESTORE_CONFIRMATION_REQUIRED', 'Enter the exact restore confirmation phrase.', 400);
    }
    $expectedFingerprint = trim((string) ($input['expectedCurrentFingerprint'] ?? ''));
    if (!preg_match('/^[a-f0-9]{64}$/', $expectedFingerprint)) {
        throw new ApiError('RESTORE_PREVIEW_REQUIRED', 'Preview the restore against the current data before applying it.', 409);
    }
    $bundle = backup_load_bundle($filename);
    $validated = backup_validate_bundle($bundle);
    $result = with_data_transaction(static function () use ($filename, $expectedFingerprint, $validated): array {
        if (!hash_equals($expectedFingerprint, backup_current_manifest()['fingerprint'])) {
            throw new ApiError('RESTORE_STATE_CHANGED', 'Runtime data changed after preview. Preview the restore again.', 409);
        }
        $safetyBackup = backup_write_bundle(backup_build_bundle('pre-restore'));
        foreach ($validated['collections'] as $collection => $rows) {
            save_collection($collection, $rows);
        }
        audit_record('Backup & Restore', 'restore backup', [
            'filename' => $filename,
            'safetyBackup' => $safetyBackup['filename'],
        ]);
        return ['restoredFrom' => $filename, 'safetyBackup' => $safetyBackup['filename'], 'counts' => $validated['counts']];
    });
    backup_prune_old_backups();
    return $result;
}
