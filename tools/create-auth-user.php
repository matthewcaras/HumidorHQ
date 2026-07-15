<?php
declare(strict_types=1);
/*
 * Filename: create-auth-user.php
 * Revision: 1.0.0
 * Description: PHP application source file for the HumidorHQ flat-file app.
 * Modified Date: 2026-07-15 00:13 ET
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
$dataPath = $root . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . 'auth-users.json';
$users = [];
if (file_exists($dataPath)) {
    $raw = file_get_contents($dataPath);
    $decoded = json_decode(is_string($raw) ? $raw : '[]', true);
    if (!is_array($decoded)) {
        fwrite(STDERR, "Existing data/auth-users.json is not valid JSON.\n");
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
if (!is_string($json) || file_put_contents($dataPath, $json . PHP_EOL) === false) {
    fwrite(STDERR, "Could not write data/auth-users.json.\n");
    exit(1);
}

fwrite(STDOUT, ($updated ? 'Updated' : 'Created') . " auth user '$username' in data/auth-users.json.\n");
fwrite(STDOUT, "Keep data/auth-users.json out of Git and upload it securely to Hostinger.\n");


