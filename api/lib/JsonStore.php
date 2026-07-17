<?php
declare(strict_types=1);
/*
 * Filename: JsonStore.php
 * Revision: 1.1.0
 * Description: Transaction-safe JSON collection persistence for HumidorHQ.
 * Modified Date: 2026-07-17 16:15 ET
 */

const HUMIDORHQ_TRANSACTION_JOURNAL = '.humidorhq-transaction.json';
const HUMIDORHQ_TRANSACTION_LOCK = '.humidorhq-transaction.lock';
const HUMIDORHQ_TRANSACTION_DIRECTORY = '.humidorhq-transactions';

function data_file_path_for_root(string $root, string $collection): string
{
    $safe = preg_replace('/[^a-z0-9\-]/', '', $collection) ?? '';
    if ($safe === '' || $safe !== $collection) {
        throw new ApiError('STORE_INVALID_COLLECTION', 'Invalid collection name.', 500);
    }
    return rtrim($root, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . $safe . '.json';
}

function data_file_path(string $collection): string
{
    return data_file_path_for_root(DATA_ROOT, $collection);
}

function data_transaction_active(): bool
{
    return is_array($GLOBALS['humidorhq_data_transaction'] ?? null);
}

function data_transaction_queue_audit(array $record): bool
{
    if (!data_transaction_active()) {
        return false;
    }
    $GLOBALS['humidorhq_data_transaction']['audits'][] = $record;
    return true;
}

function read_collection_file(string $path): array
{
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

function load_collection(string $collection): array
{
    if (data_transaction_active()) {
        if (!array_key_exists($collection, $GLOBALS['humidorhq_data_transaction']['collections'])) {
            $GLOBALS['humidorhq_data_transaction']['collections'][$collection] = read_collection_file(data_file_path($collection));
        }
        return $GLOBALS['humidorhq_data_transaction']['collections'][$collection];
    }
    return read_collection_file(data_file_path($collection));
}

function encode_collection(string $collection, array $rows): string
{
    $payload = $collection === 'counters' ? $rows : array_values($rows);
    $json = json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
    if (!is_string($json)) {
        throw new ApiError('STORE_WRITE_FAILED', 'Stored JSON could not be encoded.', 500);
    }
    return $json . PHP_EOL;
}

function save_collection(string $collection, array $rows): void
{
    if (!data_transaction_active()) {
        with_data_transaction(static function () use ($collection, $rows): void {
            save_collection($collection, $rows);
        });
        return;
    }
    data_file_path($collection);
    $GLOBALS['humidorhq_data_transaction']['collections'][$collection] = $collection === 'counters' ? $rows : array_values($rows);
    $GLOBALS['humidorhq_data_transaction']['dirty'][$collection] = true;
}

function next_id(string $collection): int
{
    if (!data_transaction_active()) {
        return with_data_transaction(static fn (): int => next_id($collection));
    }
    $counters = load_collection('counters');
    $id = isset($counters[$collection]) ? (int) $counters[$collection] : 1;
    if ($id < 1) {
        $id = 1;
    }
    $counters[$collection] = $id + 1;
    save_collection('counters', $counters);
    return $id;
}

function transaction_paths(string $root, string $transactionId, string $collection): array
{
    $transactionRoot = $root . DIRECTORY_SEPARATOR . HUMIDORHQ_TRANSACTION_DIRECTORY . DIRECTORY_SEPARATOR . $transactionId;
    return [
        'target' => data_file_path_for_root($root, $collection),
        'backup' => $transactionRoot . DIRECTORY_SEPARATOR . $collection . '.json.backup',
        'staged' => $transactionRoot . DIRECTORY_SEPARATOR . $collection . '.json.staged',
    ];
}

function remove_transaction_directory(string $path): void
{
    if (!is_dir($path)) {
        return;
    }
    $items = scandir($path);
    if (is_array($items)) {
        foreach ($items as $item) {
            if ($item === '.' || $item === '..') {
                continue;
            }
            $itemPath = $path . DIRECTORY_SEPARATOR . $item;
            if (is_file($itemPath)) {
                @unlink($itemPath);
            }
        }
    }
    @rmdir($path);
    $parent = dirname($path);
    if (is_dir($parent) && count(array_diff(scandir($parent) ?: [], ['.', '..'])) === 0) {
        @rmdir($parent);
    }
}

function restore_transaction_journal(string $root, array $journal): void
{
    $transactionId = (string) ($journal['transactionId'] ?? '');
    $collections = $journal['collections'] ?? null;
    if (!preg_match('/^[a-f0-9]{24}$/', $transactionId) || !is_array($collections)) {
        throw new RuntimeException('The transaction recovery journal is invalid.');
    }
    foreach ($collections as $collection) {
        if (!is_string($collection)) {
            throw new RuntimeException('The transaction recovery journal contains an invalid collection.');
        }
        $paths = transaction_paths($root, $transactionId, $collection);
        if (!is_file($paths['backup'])) {
            throw new RuntimeException('A transaction backup required for recovery is missing.');
        }
        $restore = $paths['target'] . '.restore.' . bin2hex(random_bytes(6));
        if (!copy($paths['backup'], $restore) || !rename($restore, $paths['target'])) {
            @unlink($restore);
            throw new RuntimeException('A runtime collection could not be restored after an interrupted transaction.');
        }
    }
    @unlink($root . DIRECTORY_SEPARATOR . HUMIDORHQ_TRANSACTION_JOURNAL);
    remove_transaction_directory($root . DIRECTORY_SEPARATOR . HUMIDORHQ_TRANSACTION_DIRECTORY . DIRECTORY_SEPARATOR . $transactionId);
}

function recover_interrupted_data_transaction(string $root): void
{
    $journalPath = $root . DIRECTORY_SEPARATOR . HUMIDORHQ_TRANSACTION_JOURNAL;
    if (!file_exists($journalPath)) {
        return;
    }
    $lock = fopen($root . DIRECTORY_SEPARATOR . HUMIDORHQ_TRANSACTION_LOCK, 'c');
    if ($lock === false || !flock($lock, LOCK_EX)) {
        if (is_resource($lock)) {
            fclose($lock);
        }
        throw new RuntimeException('The interrupted data transaction could not be locked for recovery.');
    }
    try {
        if (!file_exists($journalPath)) {
            return;
        }
        $raw = file_get_contents($journalPath);
        $journal = is_string($raw) ? json_decode($raw, true) : null;
        if (!is_array($journal)) {
            throw new RuntimeException('The interrupted data transaction journal is malformed.');
        }
        restore_transaction_journal($root, $journal);
    } finally {
        flock($lock, LOCK_UN);
        fclose($lock);
    }
}

function commit_data_transaction(): void
{
    $dirty = array_keys($GLOBALS['humidorhq_data_transaction']['dirty']);
    sort($dirty, SORT_STRING);
    if ($dirty === []) {
        return;
    }

    $root = DATA_ROOT;
    $transactionId = bin2hex(random_bytes(12));
    $transactionRoot = $root . DIRECTORY_SEPARATOR . HUMIDORHQ_TRANSACTION_DIRECTORY . DIRECTORY_SEPARATOR . $transactionId;
    if (!mkdir($transactionRoot, 0700, true) && !is_dir($transactionRoot)) {
        throw new ApiError('STORE_TRANSACTION_FAILED', 'Transaction staging could not be created.', 500);
    }

    $journal = ['transactionId' => $transactionId, 'collections' => $dirty];
    $journalPath = $root . DIRECTORY_SEPARATOR . HUMIDORHQ_TRANSACTION_JOURNAL;
    $journalTmp = $journalPath . '.tmp.' . bin2hex(random_bytes(6));
    $journalWritten = false;
    try {
        foreach ($dirty as $collection) {
            $paths = transaction_paths($root, $transactionId, $collection);
            if (!is_file($paths['target']) || !copy($paths['target'], $paths['backup'])) {
                throw new ApiError('STORE_TRANSACTION_FAILED', 'A runtime collection could not be backed up for a transaction.', 500);
            }
            $rows = $GLOBALS['humidorhq_data_transaction']['collections'][$collection] ?? [];
            if (file_put_contents($paths['staged'], encode_collection($collection, $rows), LOCK_EX) === false) {
                throw new ApiError('STORE_TRANSACTION_FAILED', 'A runtime collection could not be staged for a transaction.', 500);
            }
        }

        $journalJson = json_encode($journal, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
        if (!is_string($journalJson)
            || file_put_contents($journalTmp, $journalJson . PHP_EOL, LOCK_EX) === false
            || !rename($journalTmp, $journalPath)) {
            @unlink($journalTmp);
            throw new ApiError('STORE_TRANSACTION_FAILED', 'The transaction recovery journal could not be written.', 500);
        }
        $journalWritten = true;

        $replaceCount = 0;
        foreach ($dirty as $collection) {
            $paths = transaction_paths($root, $transactionId, $collection);
            if (!rename($paths['staged'], $paths['target'])) {
                throw new ApiError('STORE_TRANSACTION_FAILED', 'A runtime collection could not be committed.', 500);
            }
            $replaceCount++;
            if (
                getenv('HUMIDORHQ_TEST_MODE') === '1'
                && (int) getenv('HUMIDORHQ_TEST_FAIL_TRANSACTION_AFTER_REPLACE') === $replaceCount
            ) {
                throw new ApiError('STORE_TRANSACTION_TEST_FAILURE', 'Injected transaction failure.', 500);
            }
            if (
                getenv('HUMIDORHQ_TEST_MODE') === '1'
                && (int) getenv('HUMIDORHQ_TEST_CRASH_TRANSACTION_AFTER_REPLACE') === $replaceCount
            ) {
                exit(86);
            }
        }

        if (!unlink($journalPath)) {
            throw new ApiError('STORE_TRANSACTION_FAILED', 'The committed transaction journal could not be cleared.', 500);
        }
        $journalWritten = false;
        remove_transaction_directory($transactionRoot);
    } catch (Throwable $error) {
        if ($journalWritten && file_exists($journalPath)) {
            restore_transaction_journal($root, $journal);
        } else {
            @unlink($journalTmp);
            remove_transaction_directory($transactionRoot);
        }
        throw $error;
    }
}

function with_data_transaction(callable $callback): mixed
{
    if (data_transaction_active()) {
        return $callback();
    }

    $lock = fopen(DATA_ROOT . DIRECTORY_SEPARATOR . HUMIDORHQ_TRANSACTION_LOCK, 'c');
    if ($lock === false) {
        throw new ApiError('STORE_LOCK_FAILED', 'Runtime data could not be locked.', 500);
    }
    $audits = [];
    try {
        if (!flock($lock, LOCK_EX)) {
            throw new ApiError('STORE_LOCK_FAILED', 'Runtime data could not be locked.', 500);
        }
        $GLOBALS['humidorhq_data_transaction'] = [
            'collections' => [],
            'dirty' => [],
            'audits' => [],
        ];
        $result = $callback();
        commit_data_transaction();
        $audits = $GLOBALS['humidorhq_data_transaction']['audits'];
    } finally {
        unset($GLOBALS['humidorhq_data_transaction']);
        flock($lock, LOCK_UN);
        fclose($lock);
    }

    if (function_exists('write_audit_record')) {
        foreach ($audits as $audit) {
            write_audit_record($audit);
        }
    }
    return $result;
}
