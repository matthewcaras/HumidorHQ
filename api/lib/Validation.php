<?php
declare(strict_types=1);

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
