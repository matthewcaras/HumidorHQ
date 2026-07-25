<?php
declare(strict_types=1);
/*
 * Filename: InventoryAccounting.php
 * Revision: 1.1.0
 * Description: PHP application source file for the HumidorHQ flat-file app.
 * Modified Date: 2026-07-25
 */

const HUMIDORHQ_UNIT_COST_DECIMALS = 6;
const HUMIDORHQ_UNIT_COST_SCALE = 1_000_000;

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

function precise_unit_cost_from_cents(int $totalCents, int $quantity): ?string
{
    if ($totalCents < 0 || $quantity < 1) {
        return null;
    }

    $scaledNumerator = $totalCents * intdiv(HUMIDORHQ_UNIT_COST_SCALE, 100);
    $scaledValue = intdiv($scaledNumerator + intdiv($quantity, 2), $quantity);
    $whole = intdiv($scaledValue, HUMIDORHQ_UNIT_COST_SCALE);
    $fraction = str_pad((string) ($scaledValue % HUMIDORHQ_UNIT_COST_SCALE), HUMIDORHQ_UNIT_COST_DECIMALS, '0', STR_PAD_LEFT);
    $fraction = rtrim($fraction, '0');
    return $fraction === '' ? (string) $whole : $whole . '.' . $fraction;
}

function accounting_money_to_cents(mixed $value): ?int
{
    if ($value === null || $value === '') {
        return null;
    }
    $text = is_float($value) ? number_format($value, 2, '.', '') : trim((string) $value);
    if (!preg_match('/^(0|[1-9][0-9]*)(?:\.([0-9]{1,2}))?$/', $text, $matches)) {
        return null;
    }
    return ((int) $matches[1] * 100) + (int) str_pad((string) ($matches[2] ?? ''), 2, '0');
}

function accounting_line_weight_cents(array $line): ?int
{
    foreach (['purchasePrice', 'lineSubtotal'] as $field) {
        $value = accounting_money_to_cents($line[$field] ?? null);
        if ($value !== null) {
            return $value;
        }
    }
    $unitCost = accounting_money_to_cents($line['unitCost'] ?? null);
    $quantity = (int) ($line['quantity'] ?? 0);
    return $unitCost === null || $quantity < 1 ? null : $unitCost * $quantity;
}

function accounting_allocate_cents_by_weight(int $totalCents, array $weightsById): array
{
    if ($totalCents < 0 || $weightsById === []) {
        return [];
    }

    $weights = [];
    foreach ($weightsById as $id => $weight) {
        $weights[(int) $id] = max(0, (int) $weight);
    }
    $totalWeight = array_sum($weights);
    if ($totalWeight <= 0) {
        return [];
    }

    $allocations = [];
    $remainders = [];
    $allocatedTotal = 0;
    foreach ($weights as $id => $weight) {
        $weighted = $totalCents * $weight;
        $allocations[$id] = intdiv($weighted, $totalWeight);
        $remainders[$id] = $weighted % $totalWeight;
        $allocatedTotal += $allocations[$id];
    }

    uksort($remainders, static function (int $left, int $right) use ($remainders): int {
        $comparison = $remainders[$right] <=> $remainders[$left];
        return $comparison !== 0 ? $comparison : ($left <=> $right);
    });
    $remaining = $totalCents - $allocatedTotal;
    foreach (array_keys($remainders) as $id) {
        if ($remaining <= 0) {
            break;
        }
        $allocations[$id]++;
        $remaining--;
    }
    return $allocations;
}

function authoritative_purchase_line_cost_per_cigar(int $purchaseLineId): ?string
{
    if ($purchaseLineId < 1) {
        return null;
    }
    $line = find_by_id('purchase-lines', $purchaseLineId);
    if (!is_array($line)) {
        return null;
    }
    $purchaseId = (int) ($line['purchaseId'] ?? 0);
    $purchase = $purchaseId > 0 ? find_by_id('purchases', $purchaseId) : null;
    $totalPaidCents = is_array($purchase) ? accounting_money_to_cents($purchase['totalPaid'] ?? null) : null;
    $quantity = (int) ($line['quantity'] ?? 0);
    if ($totalPaidCents === null || $quantity < 1) {
        return null;
    }

    $weights = [];
    $storedBasisById = [];
    $storedBasisComplete = true;
    foreach (load_collection('purchase-lines') as $candidate) {
        if (!is_array($candidate) || (int) ($candidate['purchaseId'] ?? 0) !== $purchaseId) {
            continue;
        }
        $candidateId = (int) ($candidate['id'] ?? 0);
        $weight = accounting_line_weight_cents($candidate);
        if ($candidateId < 1 || $weight === null || $weight <= 0) {
            return null;
        }
        $weights[$candidateId] = $weight;
        $storedBasis = accounting_money_to_cents($candidate['trueCostBasis'] ?? null);
        if ($storedBasis === null) {
            $storedBasisComplete = false;
        } else {
            $storedBasisById[$candidateId] = $storedBasis;
        }
    }
    $allocations = $storedBasisComplete && array_sum($storedBasisById) === $totalPaidCents
        ? $storedBasisById
        : accounting_allocate_cents_by_weight($totalPaidCents, $weights);
    return array_key_exists($purchaseLineId, $allocations)
        ? precise_unit_cost_from_cents($allocations[$purchaseLineId], $quantity)
        : null;
}

function reconciled_lot_cost_per_cigar(array $lot): mixed
{
    $reconciled = authoritative_purchase_line_cost_per_cigar((int) ($lot['purchaseLineId'] ?? 0));
    return $reconciled
        ?? $lot['costPerCigarSnapshot']
        ?? $lot['allocatedCostPerCigar']
        ?? $lot['actualCostPerCigar']
        ?? null;
}

