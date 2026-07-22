<?php
declare(strict_types=1);
/*
 * Filename: transaction-worker.php
 * Revision: 1.0.0
 * Description: Isolated CLI worker for HumidorHQ transaction concurrency and recovery tests.
 * Modified Date: 2026-07-17 16:30 ET
 */

require_once dirname(__DIR__) . '/api/bootstrap.php';

$action = (string) ($argv[1] ?? '');
$name = (string) ($argv[2] ?? 'worker');

if ($action === 'recover') {
    fwrite(STDOUT, "recovered\n");
    exit(0);
}

if ($action !== 'add' && $action !== 'failure') {
    fwrite(STDERR, "Unknown transaction worker action.\n");
    exit(2);
}

try {
    $id = with_data_transaction(static function () use ($name): int {
        $vendors = load_collection('vendors');
        usleep(100000);
        $id = next_id('vendors');
        $vendors[] = [
            'id' => $id,
            'name' => $name,
            'createdAt' => gmdate('Y-m-d\TH:i:s\Z'),
            'updatedAt' => gmdate('Y-m-d\TH:i:s\Z'),
        ];
        save_collection('vendors', $vendors);
        return $id;
    });
    fwrite(STDOUT, (string) $id . "\n");
    exit(0);
} catch (Throwable $error) {
    if ($action === 'failure' && $error instanceof ApiError && $error->codeName === 'STORE_TRANSACTION_TEST_FAILURE') {
        fwrite(STDOUT, "rolled-back\n");
        exit(0);
    }
    fwrite(STDERR, $error->getMessage() . "\n");
    exit(1);
}
