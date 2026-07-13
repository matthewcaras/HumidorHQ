export type LotCostSource = 'SNAPSHOT' | 'ALLOCATED' | 'ACTUAL_FALLBACK'

export type LotMsrpSource = 'SNAPSHOT' | 'LOT' | 'CATALOG_FALLBACK'

export type LotCostFields = {
  costPerCigarSnapshot: unknown
  allocatedCostPerCigar: unknown
  actualCostPerCigar: unknown
}

export type LotMsrpFields = {
  msrpPerCigarSnapshot: unknown
  msrpPerCigar: unknown
}

export type CatalogMsrpFields = {
  msrp: unknown
}

export type ResolvedLotCost = {
  value: bigint | null
  source: LotCostSource | null
}

export type ResolvedLotMsrp = {
  value: bigint | null
  source: LotMsrpSource | null
}

export type WeightedMillionthsMetric = {
  totalQuantity: number
  quantityWithKnownValue: number
  quantityMissingValue: number
  totalValue: bigint
  completeTotalValue: bigint | null
  weightedAverage: bigint | null
}

export function decimalToMillionths(value: unknown): bigint | null {
  if (value === undefined || value === null || value === '') {
    return null
  }

  const text = String(value).trim()
  const match = text.match(/^(\d+)(?:\.(\d+))?$/)

  if (!match) {
    return null
  }

  const fraction = match[2] ?? ''
  const millionthsText = fraction.slice(0, 6).padEnd(6, '0')
  const roundingDigit = Number(fraction[6] ?? '0')

  return (
    BigInt(match[1]) * 1_000_000n +
    BigInt(Number(millionthsText)) +
    BigInt(roundingDigit >= 5 ? 1 : 0)
  )
}

export function formatMillionths(value: bigint) {
  const sign = value < 0n ? '-' : ''
  const absoluteValue = value < 0n ? -value : value
  const dollars = absoluteValue / 1_000_000n
  const fraction = String(absoluteValue % 1_000_000n).padStart(6, '0')

  return `${sign}${dollars}.${fraction}`
}

export function multiplyQuantityByMillionths(
  quantity: number,
  perUnitMillionths: bigint | null,
) {
  if (!Number.isInteger(quantity) || quantity < 0) {
    throw new Error('quantity must be a nonnegative whole number.')
  }

  return perUnitMillionths === null ? null : BigInt(quantity) * perUnitMillionths
}

// Returns null for a zero denominator so callers never receive Infinity, NaN, or an approximation.
export function divideMillionthsHalfUp(numerator: bigint, denominator: number) {
  if (!Number.isInteger(denominator) || denominator < 0) {
    throw new Error('denominator must be a nonnegative whole number.')
  }

  if (denominator === 0) {
    return null
  }

  const denominatorBigInt = BigInt(denominator)

  if (numerator >= 0n) {
    return (numerator * 2n + denominatorBigInt) / (2n * denominatorBigInt)
  }

  const absoluteRounded = ((-numerator) * 2n + denominatorBigInt) / (2n * denominatorBigInt)
  return -absoluteRounded
}

export function subtractMillionths(left: bigint | null, right: bigint | null) {
  return left === null || right === null ? null : left - right
}

export function weightedMillionthsMetric(
  entries: Array<{ quantity: number; value: bigint | null }>,
): WeightedMillionthsMetric {
  let totalQuantity = 0
  let quantityWithKnownValue = 0
  let quantityMissingValue = 0
  let totalValue = 0n

  for (const entry of entries) {
    if (!Number.isInteger(entry.quantity) || entry.quantity < 0) {
      throw new Error('quantity must be a nonnegative whole number.')
    }

    totalQuantity += entry.quantity

    if (entry.value === null) {
      quantityMissingValue += entry.quantity
      continue
    }

    quantityWithKnownValue += entry.quantity
    totalValue += BigInt(entry.quantity) * entry.value
  }

  const completeTotalValue = quantityMissingValue === 0 ? totalValue : null
  const weightedAverage =
    completeTotalValue === null
      ? null
      : divideMillionthsHalfUp(completeTotalValue, totalQuantity)

  return {
    totalQuantity,
    quantityWithKnownValue,
    quantityMissingValue,
    totalValue,
    completeTotalValue,
    weightedAverage,
  }
}

export function resolveLotCostPerCigar(lot: LotCostFields): ResolvedLotCost {
  const snapshotCost = decimalToMillionths(lot.costPerCigarSnapshot)
  if (snapshotCost !== null) {
    return { value: snapshotCost, source: 'SNAPSHOT' }
  }

  const allocatedCost = decimalToMillionths(lot.allocatedCostPerCigar)
  if (allocatedCost !== null) {
    return { value: allocatedCost, source: 'ALLOCATED' }
  }

  const actualCost = decimalToMillionths(lot.actualCostPerCigar)
  if (actualCost !== null) {
    return { value: actualCost, source: 'ACTUAL_FALLBACK' }
  }

  return { value: null, source: null }
}

export function resolveLotMsrpPerCigar(
  lot: LotMsrpFields,
  catalogCigar?: CatalogMsrpFields | null,
  options: { allowCatalogFallback?: boolean } = {},
): ResolvedLotMsrp {
  const snapshotMsrp = decimalToMillionths(lot.msrpPerCigarSnapshot)
  if (snapshotMsrp !== null) {
    return { value: snapshotMsrp, source: 'SNAPSHOT' }
  }

  const lotMsrp = decimalToMillionths(lot.msrpPerCigar)
  if (lotMsrp !== null) {
    return { value: lotMsrp, source: 'LOT' }
  }

  if (options.allowCatalogFallback) {
    const catalogMsrp = decimalToMillionths(catalogCigar?.msrp)
    if (catalogMsrp !== null) {
      return { value: catalogMsrp, source: 'CATALOG_FALLBACK' }
    }
  }

  return { value: null, source: null }
}
