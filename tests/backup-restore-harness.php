<?php
declare(strict_types=1);
/*
 * Filename: backup-restore-harness.php
 * Revision: 1.0.0
 * Description: Isolated CLI assertions for authenticated runtime backup and guarded restore services.
 * Modified Date: 2026-07-19 15:00 ET
 */

require_once dirname(__DIR__) . '/api/bootstrap.php';
require_once API_ROOT . '/lib/services/BackupRestoreService.php';

function test_assert(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

$before = backup_current_manifest();
$created = create_runtime_backup();
test_assert(is_file(backup_directory() . DIRECTORY_SEPARATOR . $created['filename']), 'Manual backup was not created.');

$listed = list_runtime_backups();
test_assert(count($listed['backups']) === 1, 'Created backup was not listed.');
$preview = preview_runtime_restore($created['filename']);
test_assert($preview['currentManifest']['fingerprint'] === $before['fingerprint'], 'Preview fingerprint did not match current data.');

with_data_transaction(static function (): void {
    $vendors = load_collection('vendors');
    $vendors[] = [
        'id' => next_id('vendors'),
        'name' => 'Temporary Restore Test Vendor',
        'createdAt' => now_iso(),
        'updatedAt' => now_iso(),
    ];
    save_collection('vendors', $vendors);
});
$changed = backup_current_manifest();
test_assert($changed['fingerprint'] !== $before['fingerprint'], 'Fixture mutation did not change the runtime fingerprint.');

try {
    restore_runtime_backup($created['filename'], [
        'confirmation' => HUMIDORHQ_RESTORE_CONFIRMATION,
        'expectedCurrentFingerprint' => $before['fingerprint'],
    ]);
    throw new RuntimeException('Stale-preview restore unexpectedly succeeded.');
} catch (ApiError $error) {
    test_assert($error->codeName === 'RESTORE_STATE_CHANGED', 'Stale-preview restore returned the wrong error.');
}
test_assert(backup_current_manifest()['fingerprint'] === $changed['fingerprint'], 'Rejected stale restore changed runtime data.');

$freshPreview = preview_runtime_restore($created['filename']);
try {
    restore_runtime_backup($created['filename'], [
        'confirmation' => 'wrong',
        'expectedCurrentFingerprint' => $freshPreview['currentManifest']['fingerprint'],
    ]);
    throw new RuntimeException('Unconfirmed restore unexpectedly succeeded.');
} catch (ApiError $error) {
    test_assert($error->codeName === 'RESTORE_CONFIRMATION_REQUIRED', 'Unconfirmed restore returned the wrong error.');
}
test_assert(backup_current_manifest()['fingerprint'] === $changed['fingerprint'], 'Rejected unconfirmed restore changed runtime data.');

$restored = restore_runtime_backup($created['filename'], [
    'confirmation' => HUMIDORHQ_RESTORE_CONFIRMATION,
    'expectedCurrentFingerprint' => $freshPreview['currentManifest']['fingerprint'],
]);
test_assert(backup_current_manifest()['fingerprint'] === $before['fingerprint'], 'Successful restore did not reproduce the backup fingerprint.');
test_assert(is_file(backup_directory() . DIRECTORY_SEPARATOR . $restored['safetyBackup']), 'Pre-restore safety backup was not created.');

$bundle = backup_load_bundle($created['filename']);
$imported = import_runtime_backup(['bundle' => $bundle]);
test_assert(is_file(backup_directory() . DIRECTORY_SEPARATOR . $imported['filename']), 'Imported backup was not saved.');
test_assert(backup_current_manifest()['fingerprint'] === $before['fingerprint'], 'Import changed runtime data.');

$tampered = $bundle;
$tampered['files']['vendors.json']['contentBase64'] = base64_encode("[]\ncorrupt");
try {
    import_runtime_backup(['bundle' => $tampered]);
    throw new RuntimeException('Tampered backup unexpectedly imported.');
} catch (ApiError $error) {
    test_assert($error->codeName === 'BACKUP_HASH_MISMATCH', 'Tampered backup returned the wrong error.');
}
test_assert(backup_current_manifest()['fingerprint'] === $before['fingerprint'], 'Rejected import changed runtime data.');

$invalidCounter = $bundle;
$invalidCounter['files']['vendors.json']['contentBase64'] = base64_encode(encode_collection('vendors', [[
    'id' => 1,
    'name' => 'Counter Test Vendor',
]]));
$invalidCounter['files']['vendors.json']['sha256'] = hash(
    'sha256',
    base64_decode($invalidCounter['files']['vendors.json']['contentBase64'], true)
);
ksort($invalidCounter['files'], SORT_STRING);
$manifestRows = [];
foreach ($invalidCounter['files'] as $name => $entry) {
    $manifestRows[] = $name . ':' . $entry['sha256'];
}
$invalidCounter['sourceFingerprint'] = hash('sha256', implode("\n", $manifestRows));
try {
    import_runtime_backup(['bundle' => $invalidCounter]);
    throw new RuntimeException('Invalid-counter backup unexpectedly imported.');
} catch (ApiError $error) {
    test_assert($error->codeName === 'BACKUP_INTEGRITY_FAILED', 'Invalid-counter backup returned the wrong error.');
}
test_assert(backup_current_manifest()['fingerprint'] === $before['fingerprint'], 'Rejected integrity import changed runtime data.');

echo "Backup and restore isolated assertions passed.\n";
