<?php
declare(strict_types=1);
/*
 * Filename: Response.php
 * Revision: 1.1.0
 * Description: JSON response and defensive HTTP-header helpers for HumidorHQ.
 * Modified Date: 2026-07-17 18:00 ET
 */

function send_security_headers(): void
{
    header('Cache-Control: no-store');
    header('Pragma: no-cache');
    header('X-Content-Type-Options: nosniff');
    header('X-Frame-Options: SAMEORIGIN');
    header('Referrer-Policy: no-referrer');
    header('Permissions-Policy: camera=(), microphone=(), geolocation=()');
    header("Content-Security-Policy: default-src 'none'; frame-ancestors 'self'; base-uri 'none'; form-action 'self'");
}

function json_success(mixed $data, int $status = 200): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    send_security_headers();
    echo json_encode(['data' => $data], JSON_UNESCAPED_SLASHES);
    exit;
}

function json_error(string $code, string $message, int $status): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    send_security_headers();
    echo json_encode(['error' => ['code' => $code, 'message' => $message]], JSON_UNESCAPED_SLASHES);
    exit;
}

function handle_api_error(Throwable $error): never
{
    if ($error instanceof ApiError) {
        json_error($error->codeName, $error->getMessage(), $error->statusCode);
    }
    json_error('UNEXPECTED_ERROR', 'The request could not be completed.', 500);
}


