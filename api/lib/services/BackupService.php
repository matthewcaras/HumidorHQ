<?php
declare(strict_types=1);
/*
 * Filename: BackupService.php
 * Revision: 1.0.0
 * Description: Admin backup/restore of runtime data (and app code snapshots) for HumidorHQ.
 * Modified Date: 2026-07-18 ET
 */

// Runtime data collections eligible for backup/restore. Deliberately EXCLUDES
// auth-users.json (password hashes) and audit-log.jsonl (security trail), and never
// touches internal lock/transaction/login-state files.
function backup_data_collections(): array
{
    return [
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
        'counters',
    ];
}

// App source paths included in a "code" backup (copied individually, not zipped).
function backup_code_paths(): array
{
    return [
        'index.html',
        'api',
        'public/assets/js/app.js',
        'public/assets/css/app.css',
        'public/favicon.svg',
        'public/icons.svg',
        'mobile/index.html',
        'j/index.html',
    ];
}

function backup_root_dir(): string
{
    // Defaults to the in-repo backups/ folder (git-ignored contents), but can be redirected
    // with HUMIDORHQ_BACKUP_ROOT (used by tests and by operators who want backups elsewhere).
    $configured = trim((string) getenv('HUMIDORHQ_BACKUP_ROOT'));
    $dir = $configured !== '' ? $configured : (APP_ROOT . DIRECTORY_SEPARATOR . 'backups');
    if (!is_dir($dir) && !@mkdir($dir, 0775, true) && !is_dir($dir)) {
        throw new ApiError('BACKUP_DIR_UNAVAILABLE', 'The backups folder could not be created.', 500);
    }
    if (!is_writable($dir)) {
        throw new ApiError('BACKUP_DIR_UNAVAILABLE', 'The backups folder is not writable.', 500);
    }
    return $dir;
}

function backup_timestamp(): string
{
    return (new DateTimeImmutable('now', application_timezone()))->format('Y-m-d_His');
}

function backup_is_valid_collection(string $collection): bool
{
    return in_array($collection, backup_data_collections(), true);
}

// Parse a data-backup filename back to its collection, or null if it is not a
// recognized "<collection>-YYYY-MM-DD_HHMMSS.json" name for an allowed collection.
function backup_collection_from_filename(string $name): ?string
{
    if (basename($name) !== $name) {
        return null;
    }
    foreach (backup_data_collections() as $collection) {
        $prefix = $collection . '-';
        if (str_starts_with($name, $prefix)
            && preg_match('/^\d{4}-\d{2}-\d{2}_\d{6}\.json$/', substr($name, strlen($prefix)))) {
            return $collection;
        }
    }
    return null;
}

function backup_atomic_write(string $path, string $contents): void
{
    $tmp = $path . '.tmp.' . bin2hex(random_bytes(6));
    if (file_put_contents($tmp, $contents, LOCK_EX) === false || !rename($tmp, $path)) {
        @unlink($tmp);
        throw new ApiError('BACKUP_WRITE_FAILED', 'A backup file could not be written.', 500);
    }
}

// Copy one live data collection file into the backups folder with a timestamped name.
function backup_one_collection(string $collection, string $timestamp): ?array
{
    $source = data_file_path($collection);
    if (!is_file($source)) {
        return null;
    }
    $contents = file_get_contents($source);
    if (!is_string($contents)) {
        throw new ApiError('BACKUP_READ_FAILED', 'A runtime data file could not be read.', 500);
    }
    $filename = $collection . '-' . $timestamp . '.json';
    backup_atomic_write(backup_root_dir() . DIRECTORY_SEPARATOR . $filename, $contents);
    return ['name' => $filename, 'collection' => $collection, 'bytes' => strlen($contents)];
}

function backup_create_data(array $collections): array
{
    $timestamp = backup_timestamp();
    $created = [];
    foreach ($collections as $collection) {
        if (!backup_is_valid_collection($collection)) {
            throw new ApiError('BACKUP_INVALID_COLLECTION', 'Unknown or unsupported data file: ' . $collection, 422);
        }
    }
    foreach ($collections as $collection) {
        $result = backup_one_collection($collection, $timestamp);
        if ($result !== null) {
            $created[] = $result;
        }
    }
    return $created;
}

function backup_copy_tree(string $source, string $destination): void
{
    if (is_dir($source)) {
        if (!is_dir($destination) && !@mkdir($destination, 0775, true) && !is_dir($destination)) {
            throw new ApiError('BACKUP_WRITE_FAILED', 'A code backup folder could not be created.', 500);
        }
        foreach (scandir($source) ?: [] as $entry) {
            if ($entry === '.' || $entry === '..') {
                continue;
            }
            backup_copy_tree($source . DIRECTORY_SEPARATOR . $entry, $destination . DIRECTORY_SEPARATOR . $entry);
        }
        return;
    }
    if (is_file($source)) {
        $parent = dirname($destination);
        if (!is_dir($parent) && !@mkdir($parent, 0775, true) && !is_dir($parent)) {
            throw new ApiError('BACKUP_WRITE_FAILED', 'A code backup folder could not be created.', 500);
        }
        if (!copy($source, $destination)) {
            throw new ApiError('BACKUP_WRITE_FAILED', 'A code file could not be copied.', 500);
        }
    }
}

// Copy the app source files individually into backups/code-<timestamp>/<relative-path>.
function backup_create_code(): array
{
    $timestamp = backup_timestamp();
    $folder = 'code-' . $timestamp;
    $destinationRoot = backup_root_dir() . DIRECTORY_SEPARATOR . $folder;
    $fileCount = 0;
    foreach (backup_code_paths() as $relative) {
        $source = APP_ROOT . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $relative);
        if (!file_exists($source)) {
            continue;
        }
        backup_copy_tree($source, $destinationRoot . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $relative));
        $fileCount += is_dir($source) ? backup_count_files($source) : 1;
    }
    return ['name' => $folder, 'fileCount' => $fileCount];
}

function backup_count_files(string $dir): int
{
    $count = 0;
    foreach (scandir($dir) ?: [] as $entry) {
        if ($entry === '.' || $entry === '..') {
            continue;
        }
        $path = $dir . DIRECTORY_SEPARATOR . $entry;
        $count += is_dir($path) ? backup_count_files($path) : 1;
    }
    return $count;
}

function backup_create(string $scope, array $collections): array
{
    $data = [];
    $code = null;
    if ($scope === 'data' || $scope === 'all') {
        $target = $collections === [] ? backup_data_collections() : $collections;
        $data = backup_create_data($target);
    }
    if ($scope === 'code' || $scope === 'all') {
        $code = backup_create_code();
    }
    if ($scope !== 'data' && $scope !== 'code' && $scope !== 'all') {
        throw new ApiError('BACKUP_INVALID_SCOPE', 'scope must be data, code, or all.', 422);
    }
    return ['scope' => $scope, 'dataFiles' => $data, 'codeSnapshot' => $code];
}

function backup_list(): array
{
    $dir = backup_root_dir();
    $dataBackups = [];
    $codeBackups = [];
    foreach (scandir($dir) ?: [] as $entry) {
        if ($entry === '.' || $entry === '..' || $entry === '.placeholder' || $entry === '.htaccess') {
            continue;
        }
        $path = $dir . DIRECTORY_SEPARATOR . $entry;
        if (is_file($path)) {
            $collection = backup_collection_from_filename($entry);
            if ($collection === null) {
                continue;
            }
            $dataBackups[] = [
                'name' => $entry,
                'collection' => $collection,
                'bytes' => (int) filesize($path),
                'modifiedEt' => backup_display_time((int) filemtime($path)),
                'modified' => (int) filemtime($path),
            ];
        } elseif (is_dir($path) && preg_match('/^code-\d{4}-\d{2}-\d{2}_\d{6}$/', $entry)) {
            $codeBackups[] = [
                'name' => $entry,
                'fileCount' => backup_count_files($path),
                'modifiedEt' => backup_display_time((int) filemtime($path)),
                'modified' => (int) filemtime($path),
            ];
        }
    }
    usort($dataBackups, static fn (array $a, array $b): int => $b['modified'] <=> $a['modified']);
    usort($codeBackups, static fn (array $a, array $b): int => $b['modified'] <=> $a['modified']);
    return ['dataBackups' => $dataBackups, 'codeBackups' => $codeBackups];
}

function backup_display_time(int $epoch): string
{
    return (new DateTimeImmutable('@' . $epoch))
        ->setTimezone(application_timezone())
        ->format('Y-m-d g:i A');
}

function backup_decode_data_or_fail(string $raw, string $label): array
{
    if (trim($raw) === '') {
        return [];
    }
    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) {
        throw new ApiError('RESTORE_INVALID_JSON', $label . ' is not valid JSON.', 422);
    }
    return $decoded;
}

// Write validated JSON content over a live collection file, snapshotting the current
// file first. Returns the safety-backup filename plus the restored collection.
function backup_restore_collection(string $collection, string $newRaw, string $sourceLabel): array
{
    if (!backup_is_valid_collection($collection)) {
        throw new ApiError('RESTORE_INVALID_COLLECTION', 'Unknown or unsupported data file: ' . $collection, 422);
    }
    // Validate the incoming payload parses as a JSON array before we overwrite anything.
    backup_decode_data_or_fail($newRaw, 'The restore source');

    // Always snapshot the current live file first (review requirement).
    $safety = backup_one_collection($collection, backup_timestamp());

    $normalized = rtrim($newRaw, "\r\n") . PHP_EOL;
    backup_atomic_write(data_file_path($collection), $normalized);

    return [
        'collection' => $collection,
        'source' => $sourceLabel,
        'safetyBackup' => $safety['name'] ?? null,
    ];
}

function backup_restore_from_backup(string $backupName): array
{
    $collection = backup_collection_from_filename($backupName);
    if ($collection === null) {
        throw new ApiError('RESTORE_INVALID_BACKUP', 'That backup name is not recognized.', 422);
    }
    $path = backup_root_dir() . DIRECTORY_SEPARATOR . $backupName;
    if (!is_file($path)) {
        throw new ApiError('RESTORE_BACKUP_NOT_FOUND', 'The selected backup was not found.', 404);
    }
    $raw = file_get_contents($path);
    if (!is_string($raw)) {
        throw new ApiError('RESTORE_READ_FAILED', 'The selected backup could not be read.', 500);
    }
    return backup_restore_collection($collection, $raw, 'backup:' . $backupName);
}

function backup_restore_from_upload(string $collection, string $content): array
{
    if (strlen($content) > 20 * 1024 * 1024) {
        throw new ApiError('RESTORE_UPLOAD_TOO_LARGE', 'Uploaded file exceeds the 20 MB limit.', 413);
    }
    return backup_restore_collection($collection, $content, 'upload');
}

// Resolve a data-backup filename to a filesystem path for download, rejecting anything
// that is not a recognized backup name inside the backups folder (blocks path traversal).
function backup_download_path(string $name): string
{
    if (backup_collection_from_filename($name) === null) {
        throw new ApiError('BACKUP_INVALID_NAME', 'That backup name is not recognized.', 422);
    }
    $dir = backup_root_dir();
    $path = $dir . DIRECTORY_SEPARATOR . $name;
    $real = realpath($path);
    $realDir = realpath($dir);
    if ($real === false || $realDir === false || !str_starts_with($real, $realDir . DIRECTORY_SEPARATOR)) {
        throw new ApiError('BACKUP_NOT_FOUND', 'The requested backup was not found.', 404);
    }
    return $real;
}
