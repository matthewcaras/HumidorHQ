<?php
declare(strict_types=1);
/*
 * Filename: Auth.php
 * Revision: 1.0.1
 * Description: PHP application source file for the HumidorHQ flat-file app.
 * Modified Date: 2026-07-17 ET
 */

// Valid bcrypt hash used only to normalize login timing when a username is unknown,
// so a failed login takes the same time whether or not the account exists. Not a credential.
const AUTH_TIMING_DUMMY_HASH = '$2y$12$522yAqBE7vX5xpDQusKhCuw6UtLPnEYtYejia9CvSvZGsCvOCi/v6';

function start_api_session(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }

    $isHttps = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (($_SERVER['SERVER_PORT'] ?? null) === '443');

    session_name('humidorhq_session');
    session_set_cookie_params([
        'lifetime' => 0,
        'path' => '/',
        'secure' => $isHttps,
        'httponly' => true,
        'samesite' => 'Strict',
    ]);
    session_start();
}

function auth_user_public(array $user): array
{
    return [
        'username' => (string) ($user['username'] ?? ''),
        'displayName' => (string) ($user['displayName'] ?? ($user['username'] ?? '')),
    ];
}

function current_auth_user(): ?array
{
    $user = $_SESSION['humidor_user'] ?? null;
    return is_array($user) ? $user : null;
}

function session_payload(): array
{
    $user = current_auth_user();
    return [
        'authenticated' => $user !== null,
        'user' => $user,
    ];
}

function load_auth_users(): array
{
    return load_collection('auth-users');
}

function find_auth_user(string $username): ?array
{
    foreach (load_auth_users() as $user) {
        if (!is_array($user)) {
            continue;
        }
        if ((string) ($user['username'] ?? '') === $username && ($user['isActive'] ?? true) !== false) {
            return $user;
        }
    }
    return null;
}

function login_with_credentials(array $input): array
{
    $username = trim((string) ($input['username'] ?? ''));
    $password = (string) ($input['password'] ?? '');

    if ($username === '' || $password === '') {
        throw new ApiError('AUTH_MISSING_CREDENTIALS', 'Username and password are required.', 400);
    }

    $user = find_auth_user($username);
    $passwordHash = is_array($user) ? (string) ($user['passwordHash'] ?? '') : '';
    // Always run password_verify (against a dummy hash when the account is unknown or has no hash)
    // so response timing does not reveal whether the username exists.
    $verifyTarget = $passwordHash !== '' ? $passwordHash : AUTH_TIMING_DUMMY_HASH;
    $passwordMatches = password_verify($password, $verifyTarget);
    if ($user === null || $passwordHash === '' || !$passwordMatches) {
        throw new ApiError('AUTH_INVALID_CREDENTIALS', 'Username or password is incorrect.', 401);
    }

    session_regenerate_id(true);
    $_SESSION['humidor_user'] = auth_user_public($user);

    return session_payload();
}

function logout_current_user(): array
{
    $_SESSION = [];

    if (ini_get('session.use_cookies')) {
        $params = session_get_cookie_params();
        setcookie(
            session_name(),
            '',
            time() - 42000,
            $params['path'],
            $params['domain'],
            (bool) $params['secure'],
            (bool) $params['httponly']
        );
    }

    session_destroy();
    start_api_session();

    return session_payload();
}

function require_auth(): void
{
    if (current_auth_user() === null) {
        json_error('AUTH_REQUIRED', 'Please sign in to continue.', 401);
    }
}

start_api_session();


