<?php
declare(strict_types=1);
/*
 * Filename: create-auth-user.php
 * Revision: 1.1.0
 * Description: Creates or updates a user in the configured external HumidorHQ runtime data directory.
 * Modified Date: 2026-07-17 11:30 ET
 */

$script = basename(__FILE__);
$args = $_SERVER['argv'] ?? [];
$username = trim((string) ($args[1] ?? ''));
$password = (string) ($args[2] ?? '');
$displayName = trim((string) ($args[3] ?? $username));

if ($username === '' || $password === '') {
    fwrite(STDERR, "Usage: php tools/$script <username> <password> [display-name]\n");
    exit(1);
}

if (strlen($password) < 8) {
    fwrite(STDERR, "Password must be at least 8 characters.\n");
    exit(1);
}

$root = dirname(__DIR__);
$configuredDataRoot = trim((string) getenv('HUMIDORHQ_DATA_ROOT'));
if ($configuredDataRoot === '') {
    fwrite(STDERR, "Set HUMIDORHQ_DATA_ROOT to the external runtime data directory first.\n");
    exit(1);
}
$dataRoot = realpath($configuredDataRoot);
$appRoot = realpath($root);
if ($dataRoot === false || !is_dir($dataRoot)) {
    fwrite(STDERR, "HUMIDORHQ_DATA_ROOT does not identify an existing directory.\n");
    exit(1);
}
$normalizedDataRoot = rtrim(str_replace('\\', '/', $dataRoot), '/');
$normalizedAppRoot = rtrim(str_replace('\\', '/', (string) $appRoot), '/');
if (DIRECTORY_SEPARATOR === '\\') {
    $normalizedDataRoot = strtolower($normalizedDataRoot);
    $normalizedAppRoot = strtolower($normalizedAppRoot);
}
if ($normalizedDataRoot === $normalizedAppRoot || str_starts_with($normalizedDataRoot, $normalizedAppRoot . '/')) {
    fwrite(STDERR, "Runtime credentials must be stored outside the HumidorHQ repository.\n");
    exit(1);
}
if (!is_readable($dataRoot) || !is_writable($dataRoot)) {
    fwrite(STDERR, "The runtime data directory must be readable and writable.\n");
    exit(1);
}

$dataPath = $dataRoot . DIRECTORY_SEPARATOR . 'auth-users.json';
$users = [];
if (file_exists($dataPath)) {
    $raw = file_get_contents($dataPath);
    $decoded = json_decode(is_string($raw) ? $raw : '[]', true);
    if (!is_array($decoded)) {
        fwrite(STDERR, "Existing auth-users.json is not valid JSON.\n");
        exit(1);
    }
    $users = $decoded;
}

$hash = password_hash($password, PASSWORD_DEFAULT);
$updated = false;
foreach ($users as $index => $user) {
    if (is_array($user) && (string) ($user['username'] ?? '') === $username) {
        $users[$index] = [
            'username' => $username,
            'passwordHash' => $hash,
            'displayName' => $displayName !== '' ? $displayName : $username,
            'isActive' => true,
        ];
        $updated = true;
        break;
    }
}

if (!$updated) {
    $users[] = [
        'username' => $username,
        'passwordHash' => $hash,
        'displayName' => $displayName !== '' ? $displayName : $username,
        'isActive' => true,
    ];
}

$json = json_encode($users, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
$temporaryPath = $dataPath . '.tmp.' . bin2hex(random_bytes(6));
if (!is_string($json) || file_put_contents($temporaryPath, $json . PHP_EOL) === false || !rename($temporaryPath, $dataPath)) {
    @unlink($temporaryPath);
    fwrite(STDERR, "Could not atomically write auth-users.json.\n");
    exit(1);
}

fwrite(STDOUT, ($updated ? 'Updated' : 'Created') . " auth user '$username' in the configured external runtime directory.\n");
fwrite(STDOUT, "Keep the runtime directory outside Git and outside the deployed web root.\n");


