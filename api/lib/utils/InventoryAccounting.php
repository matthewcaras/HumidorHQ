<?php
declare(strict_types=1);
/*
 * Filename: InventoryAccounting.php
 * Revision: 1.0.0
 * Description: PHP application source file for the HumidorHQ flat-file app.
 * Modified Date: 2026-07-15 00:13 ET
 */

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


