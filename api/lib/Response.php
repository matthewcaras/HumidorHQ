<?php
declare(strict_types=1);

function json_success(mixed $data, int $status = 200): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('X-Content-Type-Options: nosniff');
    echo json_encode(['data' => $data], JSON_UNESCAPED_SLASHES);
    exit;
}

function json_error(string $code, string $message, int $status): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('X-Content-Type-Options: nosniff');
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
