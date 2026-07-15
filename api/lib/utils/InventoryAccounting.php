<?php
declare(strict_types=1);

function decimal_to_string(mixed $value): ?string
{
    if ($value === null || $value === '') {
        return null;
    }
    if (!is_numeric($value)) {
        throw new ApiError('JOURNAL_UNEXPECTED_ERROR', 'The Smoking Journal request could not be completed.', 500);
    }
    $formatted = number_format((float) $value, 6, '.', '');
    return rtrim(rtrim($formatted, '0'), '.');
}
