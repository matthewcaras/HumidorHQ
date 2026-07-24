<?php
declare(strict_types=1);
/*
 * Filename: Auth.php
 * Revision: 1.1.2
 * Description: Authentication, session lifetime, CSRF, and login-throttling controls for HumidorHQ.
 * Modified Date: 2026-07-24 09:20 ET
 */

const HUMIDORHQ_INVALID_LOGIN_HASH = '$2y$12$zykFIVqUfkp33ZpHOEV0/u89G3ATZDaTdJs9r7t/djV0Q1zUa.YRO';
const HUMIDORHQ_MATT_SESSION_COOKIE_SECONDS = 31536000;

function auth_env_bool(string $name, bool $default = false): bool
{
    $value = getenv($name);
    if ($value === false || trim((string) $value) === '') {
        return $default;
    }
    return in_array(strtolower(trim((string) $value)), ['1', 'true', 'yes', 'on'], true);
}

function auth_env_int(string $name, int $default, int $minimum, int $maximum): int
{
    $value = getenv($name);
    if ($value === false || !preg_match('/^[0-9]+$/', trim((string) $value))) {
        return $default;
    }
    return max($minimum, min($maximum, (int) $value));
}

function request_is_https(): bool
{
    if (auth_env_bool('HUMIDORHQ_FORCE_SECURE_COOKIES')) {
        return true;
    }
    if ((!empty($_SERVER['HTTPS']) && strtolower((string) $_SERVER['HTTPS']) !== 'off')
        || (string) ($_SERVER['SERVER_PORT'] ?? '') === '443') {
        return true;
    }
    if (auth_env_bool('HUMIDORHQ_TRUST_PROXY_HEADERS')) {
        $forwardedProtocol = strtolower(trim(explode(',', (string) ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? ''))[0] ?? ''));
        return $forwardedProtocol === 'https';
    }
    return false;
}

function start_api_session(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }

    ini_set('session.use_strict_mode', '1');
    ini_set('session.use_only_cookies', '1');
    session_name('humidorhq_session');
    session_set_cookie_params([
        'lifetime' => 0,
        'path' => '/',
        'secure' => request_is_https(),
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

function auth_user_is_matts_account(array $user): bool
{
    $username = strtolower(trim((string) ($user['username'] ?? '')));
    $displayName = strtolower(trim((string) ($user['displayName'] ?? '')));
    return in_array($username, ['matt', 'matthewcaras'], true) || $displayName === 'matt';
}

function refresh_session_cookie_for_user(array $user): void
{
    if (!auth_user_is_matts_account($user)) {
        return;
    }

    if (session_status() !== PHP_SESSION_ACTIVE) {
        return;
    }

    $params = session_get_cookie_params();
    setcookie(session_name(), session_id(), [
        'expires' => time() + HUMIDORHQ_MATT_SESSION_COOKIE_SECONDS,
        'path' => (string) ($params['path'] ?? '/'),
        'domain' => (string) ($params['domain'] ?? ''),
        'secure' => (bool) ($params['secure'] ?? false),
        'httponly' => true,
        'samesite' => 'Strict',
    ]);
}

function expire_authenticated_session(): void
{
    unset(
        $_SESSION['humidor_user'],
        $_SESSION['humidor_session_created_at'],
        $_SESSION['humidor_session_last_activity'],
        $_SESSION['humidor_csrf_token']
    );
    session_regenerate_id(true);
}

function current_auth_user(): ?array
{
    $user = $_SESSION['humidor_user'] ?? null;
    if (!is_array($user)) {
        return null;
    }

    $now = time();
    $createdAt = (int) ($_SESSION['humidor_session_created_at'] ?? 0);
    $lastActivity = (int) ($_SESSION['humidor_session_last_activity'] ?? 0);
    if ($createdAt < 1 || $lastActivity < 1) {
        expire_authenticated_session();
        return null;
    }

    if (auth_user_is_matts_account($user)) {
        $_SESSION['humidor_session_last_activity'] = $now;
        refresh_session_cookie_for_user($user);
        if (function_exists('maybe_create_daily_backup_for_user')) {
            maybe_create_daily_backup_for_user($user);
        }
        return $user;
    }

    $testMode = auth_env_bool('HUMIDORHQ_TEST_MODE');
    $idleTimeout = auth_env_int('HUMIDORHQ_SESSION_IDLE_SECONDS', 1800, $testMode ? 1 : 60, 86400);
    $absoluteTimeout = auth_env_int('HUMIDORHQ_SESSION_ABSOLUTE_SECONDS', 43200, $testMode ? 1 : 300, 604800);
    if (($now - $lastActivity) > $idleTimeout || ($now - $createdAt) > $absoluteTimeout) {
        expire_authenticated_session();
        return null;
    }
    $_SESSION['humidor_session_last_activity'] = $now;
    if (function_exists('maybe_create_daily_backup_for_user')) {
        maybe_create_daily_backup_for_user($user);
    }
    return $user;
}

function csrf_token(): string
{
    $token = (string) ($_SESSION['humidor_csrf_token'] ?? '');
    if (!preg_match('/^[a-f0-9]{64}$/', $token)) {
        $token = bin2hex(random_bytes(32));
        $_SESSION['humidor_csrf_token'] = $token;
    }
    return $token;
}

function session_payload(): array
{
    $user = current_auth_user();
    return [
        'authenticated' => $user !== null,
        'user' => $user,
        'csrfToken' => csrf_token(),
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

function auth_client_address(): string
{
    if (auth_env_bool('HUMIDORHQ_TRUST_PROXY_HEADERS')) {
        $forwarded = trim(explode(',', (string) ($_SERVER['HTTP_X_FORWARDED_FOR'] ?? ''))[0] ?? '');
        if (filter_var($forwarded, FILTER_VALIDATE_IP) !== false) {
            return $forwarded;
        }
    }
    $remote = trim((string) ($_SERVER['REMOTE_ADDR'] ?? 'unknown'));
    return filter_var($remote, FILTER_VALIDATE_IP) !== false ? $remote : 'unknown';
}

function login_state_path(): string
{
    return DATA_ROOT . DIRECTORY_SEPARATOR . '.auth-login-state.json';
}

function load_login_state(): array
{
    $path = login_state_path();
    if (!file_exists($path)) {
        return ['entries' => []];
    }
    $raw = file_get_contents($path);
    $decoded = is_string($raw) ? json_decode($raw, true) : null;
    if (!is_array($decoded) || !is_array($decoded['entries'] ?? null)) {
        throw new ApiError('AUTH_STATE_UNAVAILABLE', 'Login protection state could not be read.', 503);
    }
    return $decoded;
}

function save_login_state(array $state): void
{
    $path = login_state_path();
    $tmp = $path . '.tmp.' . bin2hex(random_bytes(6));
    $json = json_encode($state, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
    if (!is_string($json)
        || file_put_contents($tmp, $json . PHP_EOL, LOCK_EX) === false
        || !rename($tmp, $path)) {
        @unlink($tmp);
        throw new ApiError('AUTH_STATE_UNAVAILABLE', 'Login protection state could not be saved.', 503);
    }
    @chmod($path, 0600);
}

function login_rate_keys(string $username): array
{
    $normalizedUsername = strtolower(trim($username));
    return [
        ['key' => 'username:' . hash('sha256', $normalizedUsername), 'limit' => auth_env_int('HUMIDORHQ_LOGIN_USERNAME_LIMIT', 5, 2, 100)],
        ['key' => 'client:' . hash('sha256', auth_client_address()), 'limit' => auth_env_int('HUMIDORHQ_LOGIN_CLIENT_LIMIT', 20, 2, 500)],
    ];
}

function log_failed_login(string $username, string $reason): void
{
    if (!function_exists('audit_record')) {
        return;
    }
    try {
        audit_record('Authentication', 'failed login', [
            'attemptedUsername' => $username,
            'clientAddress' => auth_client_address(),
            'reason' => $reason,
        ]);
    } catch (Throwable $error) {
        error_log('HumidorHQ failed to write a failed-login audit record: ' . $error->getMessage());
    }
}

function authenticate_with_rate_limit(string $username, string $password): array
{
    $lock = fopen(DATA_ROOT . DIRECTORY_SEPARATOR . '.auth-login-state.lock', 'c');
    if ($lock === false || !flock($lock, LOCK_EX)) {
        if (is_resource($lock)) {
            fclose($lock);
        }
        throw new ApiError('AUTH_STATE_UNAVAILABLE', 'Login protection is temporarily unavailable.', 503);
    }

    $failureReason = null;
    try {
        $state = load_login_state();
        $now = time();
        $window = auth_env_int('HUMIDORHQ_LOGIN_WINDOW_SECONDS', 900, 60, 86400);
        $lockSeconds = auth_env_int('HUMIDORHQ_LOGIN_LOCK_SECONDS', 900, 60, 86400);
        $keys = login_rate_keys($username);
        foreach ($state['entries'] as $key => $timestamps) {
            if (!is_array($timestamps)) {
                unset($state['entries'][$key]);
                continue;
            }
            $state['entries'][$key] = array_values(array_filter(
                $timestamps,
                static fn (mixed $timestamp): bool => is_int($timestamp) && $timestamp > ($now - max($window, $lockSeconds))
            ));
            if ($state['entries'][$key] === []) {
                unset($state['entries'][$key]);
            }
        }

        foreach ($keys as $rateKey) {
            $recent = array_values(array_filter(
                $state['entries'][$rateKey['key']] ?? [],
                static fn (int $timestamp): bool => $timestamp > ($now - $window)
            ));
            if (count($recent) >= $rateKey['limit'] && ($now - max($recent)) < $lockSeconds) {
                save_login_state($state);
                $failureReason = 'rate-limited';
                throw new ApiError('AUTH_RATE_LIMITED', 'Too many login attempts. Please wait before trying again.', 429);
            }
        }

        $user = find_auth_user($username);
        $passwordHash = is_array($user) ? (string) ($user['passwordHash'] ?? '') : '';
        $passwordMatches = password_verify($password, $passwordHash !== '' ? $passwordHash : HUMIDORHQ_INVALID_LOGIN_HASH);
        if ($user === null || $passwordHash === '' || !$passwordMatches) {
            foreach ($keys as $rateKey) {
                $state['entries'][$rateKey['key']] ??= [];
                $state['entries'][$rateKey['key']][] = $now;
            }
            save_login_state($state);
            $failureReason = 'invalid-credentials';
            throw new ApiError('AUTH_INVALID_CREDENTIALS', 'Username or password is incorrect.', 401);
        }

        foreach ($keys as $rateKey) {
            unset($state['entries'][$rateKey['key']]);
        }
        save_login_state($state);
        return $user;
    } catch (Throwable $error) {
        if ($failureReason !== null) {
            log_failed_login($username, $failureReason);
        }
        throw $error;
    } finally {
        flock($lock, LOCK_UN);
        fclose($lock);
    }
}

function login_with_credentials(array $input): array
{
    $username = trim((string) ($input['username'] ?? ''));
    $password = (string) ($input['password'] ?? '');

    if ($username === '' || $password === '') {
        log_failed_login($username, 'missing-credentials');
        throw new ApiError('AUTH_MISSING_CREDENTIALS', 'Username and password are required.', 400);
    }
    if (strlen($username) > 128 || strlen($password) > 4096) {
        log_failed_login(substr($username, 0, 128), 'invalid-credential-length');
        throw new ApiError('AUTH_INVALID_CREDENTIALS', 'Username or password is incorrect.', 401);
    }

    $user = authenticate_with_rate_limit($username, $password);
    session_regenerate_id(true);
    $now = time();
    $_SESSION['humidor_user'] = auth_user_public($user);
    $_SESSION['humidor_session_created_at'] = $now;
    $_SESSION['humidor_session_last_activity'] = $now;
    $_SESSION['humidor_csrf_token'] = bin2hex(random_bytes(32));
    refresh_session_cookie_for_user($_SESSION['humidor_user']);

    return session_payload();
}

function logout_current_user(): array
{
    $_SESSION = [];

    if (ini_get('session.use_cookies')) {
        $params = session_get_cookie_params();
        setcookie(session_name(), '', [
            'expires' => time() - 42000,
            'path' => (string) ($params['path'] ?? '/'),
            'domain' => (string) ($params['domain'] ?? ''),
            'secure' => (bool) ($params['secure'] ?? false),
            'httponly' => true,
            'samesite' => 'Strict',
        ]);
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

function require_csrf(): void
{
    $provided = trim((string) ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? ''));
    $expected = (string) ($_SESSION['humidor_csrf_token'] ?? '');
    if ($provided === '' || $expected === '' || !hash_equals($expected, $provided)) {
        json_error('CSRF_INVALID', 'The request security token is missing or invalid.', 403);
    }
}

start_api_session();
