<?php
declare(strict_types=1);
/*
 * Filename: Audit.php
 * Revision: 1.2.0
 * Description: Audit logging helpers for the HumidorHQ flat-file app.
 * Modified Date: 2026-07-17 17:30 ET
 */

function audit_log_path(): string
{
    return DATA_ROOT . DIRECTORY_SEPARATOR . 'audit-log.jsonl';
}

function audit_datetime_et(?string $value = null): string
{
    if (is_string($value) && preg_match('/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} ET$/', $value)) {
        return $value;
    }

    try {
        $dateTime = $value === null || trim($value) === ''
            ? new DateTimeImmutable('now', new DateTimeZone('UTC'))
            : new DateTimeImmutable($value);
    } catch (Throwable) {
        return (string) $value;
    }

    return $dateTime->setTimezone(new DateTimeZone('America/New_York'))->format('Y-m-d H:i:s') . ' ET';
}

function audit_record(string $page, string $action, array $details = []): void
{
    $user = current_auth_user();
    $username = is_array($user) ? (string) ($user['username'] ?? 'unknown') : 'anonymous';
    $record = [
        'dateTime' => audit_datetime_et(),
        'user' => $username,
        'page' => trim($page) !== '' ? trim($page) : 'Unknown',
        'action' => trim($action) !== '' ? trim($action) : 'unknown',
    ];

    if ($details !== []) {
        $record['details'] = $details;
    }

    if (data_transaction_queue_audit($record)) {
        return;
    }
    write_audit_record($record);
}

function write_audit_record(array $record): void
{
    $json = json_encode($record, JSON_UNESCAPED_SLASHES);
    if (!is_string($json)) {
        throw new ApiError('AUDIT_WRITE_FAILED', 'Audit record could not be encoded.', 500);
    }

    $path = audit_log_path();
    $lockPath = $path . '.lock';
    $lock = fopen($lockPath, 'c');
    if ($lock === false) {
        throw new ApiError('AUDIT_LOCK_FAILED', 'Audit log could not be locked.', 500);
    }

    try {
        if (!flock($lock, LOCK_EX)) {
            throw new ApiError('AUDIT_LOCK_FAILED', 'Audit log could not be locked.', 500);
        }
        if (file_put_contents($path, $json . PHP_EOL, FILE_APPEND) === false) {
            throw new ApiError('AUDIT_WRITE_FAILED', 'Audit log could not be written.', 500);
        }
    } finally {
        flock($lock, LOCK_UN);
        fclose($lock);
    }
}

function audit_page_input(array $input): array
{
    $page = trim((string) ($input['page'] ?? ''));
    $action = trim((string) ($input['action'] ?? 'view'));
    if ($page === '') {
        throw new ApiError('AUDIT_INVALID_PAGE', 'page is required.', 400);
    }
    if ($action === '') {
        throw new ApiError('AUDIT_INVALID_ACTION', 'action is required.', 400);
    }
    return ['page' => $page, 'action' => $action];
}

function get_audit_records(int $limit = 200): array
{
    $path = audit_log_path();
    if (!file_exists($path)) {
        return ['records' => [], 'total' => 0, 'limit' => $limit];
    }

    $lines = file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    if (!is_array($lines)) {
        throw new ApiError('AUDIT_READ_FAILED', 'Audit log could not be read.', 500);
    }

    $records = [];
    foreach ($lines as $line) {
        $decoded = json_decode($line, true);
        if (is_array($decoded)) {
            $records[] = [
                'dateTime' => audit_datetime_et((string) ($decoded['dateTime'] ?? '')),
                'user' => (string) ($decoded['user'] ?? ''),
                'page' => (string) ($decoded['page'] ?? ''),
                'action' => (string) ($decoded['action'] ?? ''),
                'details' => is_array($decoded['details'] ?? null) ? $decoded['details'] : null,
            ];
        }
    }

    $total = count($records);
    $records = array_slice(array_reverse($records), 0, $limit);
    return ['records' => $records, 'total' => $total, 'limit' => $limit];
}
