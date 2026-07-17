<?php
declare(strict_types=1);
/*
 * Filename: Validation.php
 * Revision: 1.1.0
 * Description: PHP application source file for the HumidorHQ flat-file app.
 * Modified Date: 2026-07-17 ET
 */

function positive_int_param(mixed $value, string $label, string $code = 'VALIDATION_ERROR'): int
{
    if (is_int($value)) {
        $id = $value;
    } elseif (is_string($value) && preg_match('/^[1-9][0-9]*$/', $value)) {
        $id = (int) $value;
    } else {
        throw new ApiError($code, $label . ' must be a positive integer.', 400);
    }
    if ($id < 1) {
        throw new ApiError($code, $label . ' must be a positive integer.', 400);
    }
    return $id;
}

function clean_text_field(array $input, string $field): string
{
    return trim((string) ($input[$field] ?? ''));
}

function clean_optional_int(array $input, string $field): ?int
{
    $value = trim((string) ($input[$field] ?? ''));
    if ($value === '') {
        return null;
    }
    if (!preg_match('/^-?[0-9]+$/', $value)) {
        throw new ApiError('VALIDATION_ERROR', $field . ' must be a whole number.', 422);
    }
    return (int) $value;
}

function clean_optional_money(array $input, string $field): ?float
{
    $value = trim((string) ($input[$field] ?? ''));
    if ($value === '') {
        return null;
    }
    if (!is_numeric($value)) {
        throw new ApiError('VALIDATION_ERROR', $field . ' must be a number.', 422);
    }
    return round((float) $value, 2);
}

function money_to_cents(mixed $value): int
{
    if ($value === null || $value === '') {
        return 0;
    }

    return (int) round((float) $value * 100);
}

function cents_to_money(int $value): float
{
    return round($value / 100, 2);
}


