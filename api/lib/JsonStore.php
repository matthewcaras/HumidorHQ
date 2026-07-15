<?php
declare(strict_types=1);
/*
 * Filename: JsonStore.php
 * Revision: 1.0.0
 * Description: PHP application source file for the HumidorHQ flat-file app.
 * Modified Date: 2026-07-15 00:13 ET
 */

function data_file_path(string $collection): string
{
    $safe = preg_replace('/[^a-z0-9\-]/', '', $collection) ?? '';
    if ($safe === '') {
        throw new ApiError('STORE_INVALID_COLLECTION', 'Invalid collection name.', 500);
    }
    return DATA_ROOT . DIRECTORY_SEPARATOR . $safe . '.json';
}

function load_collection(string $collection): array
{
    $path = data_file_path($collection);
    if (!file_exists($path)) {
        return [];
    }
    $raw = file_get_contents($path);
    if (!is_string($raw) || trim($raw) === '') {
        return [];
    }
    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) {
        throw new ApiError('STORE_INVALID_JSON', 'Stored JSON could not be read.', 500);
    }
    return $decoded;
}

function save_collection(string $collection, array $rows): void
{
    $path = data_file_path($collection);
    $lockPath = $path . '.lock';
    $lock = fopen($lockPath, 'c');
    if ($lock === false) {
        throw new ApiError('STORE_LOCK_FAILED', 'Stored JSON could not be locked.', 500);
    }
    try {
        if (!flock($lock, LOCK_EX)) {
            throw new ApiError('STORE_LOCK_FAILED', 'Stored JSON could not be locked.', 500);
        }
        $tmp = $path . '.tmp.' . bin2hex(random_bytes(6));
        $json = json_encode(array_values($rows), JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
        if (!is_string($json) || file_put_contents($tmp, $json . PHP_EOL) === false) {
            throw new ApiError('STORE_WRITE_FAILED', 'Stored JSON could not be written.', 500);
        }
        if (!rename($tmp, $path)) {
            @unlink($tmp);
            throw new ApiError('STORE_WRITE_FAILED', 'Stored JSON could not be replaced.', 500);
        }
    } finally {
        flock($lock, LOCK_UN);
        fclose($lock);
    }
}

function next_id(string $collection): int
{
    $path = data_file_path('counters');
    $lockPath = $path . '.lock';
    $lock = fopen($lockPath, 'c');
    if ($lock === false) {
        throw new ApiError('STORE_LOCK_FAILED', 'Counters could not be locked.', 500);
    }
    try {
        if (!flock($lock, LOCK_EX)) {
            throw new ApiError('STORE_LOCK_FAILED', 'Counters could not be locked.', 500);
        }
        $counters = load_collection('counters');
        $id = isset($counters[$collection]) ? (int) $counters[$collection] : 1;
        $counters[$collection] = $id + 1;
        $json = json_encode($counters, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
        if (!is_string($json) || file_put_contents($path, $json . PHP_EOL) === false) {
            throw new ApiError('STORE_WRITE_FAILED', 'Counters could not be written.', 500);
        }
        return $id;
    } finally {
        flock($lock, LOCK_UN);
        fclose($lock);
    }
}


