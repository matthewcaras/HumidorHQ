export type AllocationLine = {
  lineNumber: number
  lineSubtotalCents: number
}

export type AllocationCategoryInput = {
  shippingCents: number
  exciseTaxCents: number
  salesTaxCents: number
  discountCents: number
}

export type LineAllocation = {
  lineNumber: number
  allocatedShippingCents: number
  allocatedExciseTaxCents: number
  allocatedSalesTaxCents: number
  allocatedDiscountCents: number
}

export class PurchaseAllocationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PurchaseAllocationError'
  }
}

function assertCents(value: number, fieldName: string) {
  if (!Number.isInteger(value) || value < 0) {
    throw new PurchaseAllocationError(`${fieldName} must be a nonnegative cent amount.`)
  }
}

function largestRawAllocationLine(lines: AllocationLine[], amountCents: number) {
  return lines
    .filter((line) => line.lineSubtotalCents > 0)
    .sort((left, right) => {
      const leftRaw = BigInt(amountCents) * BigInt(left.lineSubtotalCents)
      const rightRaw = BigInt(amountCents) * BigInt(right.lineSubtotalCents)

      if (leftRaw === rightRaw) {
        return left.lineNumber - right.lineNumber
      }

      return leftRaw > rightRaw ? -1 : 1
    })[0]
}

function allocateCategory(lines: AllocationLine[], amountCents: number, categoryName: string) {
  assertCents(amountCents, categoryName)

  const purchaseSubtotalCents = lines.reduce(
    (total, line) => total + line.lineSubtotalCents,
    0,
  )

  if (purchaseSubtotalCents === 0) {
    if (amountCents !== 0) {
      throw new PurchaseAllocationError(
        `${categoryName} cannot be allocated automatically when purchase subtotal is zero.`,
      )
    }

    return new Map(lines.map((line) => [line.lineNumber, 0]))
  }

  const allocations = new Map<number, number>()

  for (const line of lines) {
    if (line.lineSubtotalCents === 0) {
      allocations.set(line.lineNumber, 0)
      continue
    }

    const exactNumerator = BigInt(amountCents) * BigInt(line.lineSubtotalCents)
    const floorAllocation = Number(exactNumerator / BigInt(purchaseSubtotalCents))
    allocations.set(line.lineNumber, floorAllocation)
  }

  const floorTotal = [...allocations.values()].reduce((total, value) => total + value, 0)
  const residualCents = amountCents - floorTotal

  if (residualCents !== 0) {
    const targetLine = largestRawAllocationLine(lines, amountCents)

    if (!targetLine) {
      throw new PurchaseAllocationError(`${categoryName} could not be reconciled.`)
    }

    allocations.set(
      targetLine.lineNumber,
      (allocations.get(targetLine.lineNumber) ?? 0) + residualCents,
    )
  }

  for (const allocation of allocations.values()) {
    if (!Number.isInteger(allocation) || allocation < 0) {
      throw new PurchaseAllocationError(`${categoryName} allocation produced an invalid amount.`)
    }
  }

  const reconciledTotal = [...allocations.values()].reduce((total, value) => total + value, 0)
  if (reconciledTotal !== amountCents) {
    throw new PurchaseAllocationError(`${categoryName} allocation did not reconcile.`)
  }

  return allocations
}

export function allocatePurchaseAmounts(
  lines: AllocationLine[],
  categories: AllocationCategoryInput,
): LineAllocation[] {
  for (const line of lines) {
    if (!Number.isInteger(line.lineNumber) || line.lineNumber < 1) {
      throw new PurchaseAllocationError('lineNumber must be a positive whole number.')
    }

    assertCents(line.lineSubtotalCents, 'lineSubtotalCents')
  }

  const shipping = allocateCategory(lines, categories.shippingCents, 'shipping')
  const exciseTax = allocateCategory(lines, categories.exciseTaxCents, 'exciseTax')
  const salesTax = allocateCategory(lines, categories.salesTaxCents, 'salesTax')
  const discount = allocateCategory(lines, categories.discountCents, 'discount')

  return lines
    .slice()
    .sort((left, right) => left.lineNumber - right.lineNumber)
    .map((line) => ({
      lineNumber: line.lineNumber,
      allocatedShippingCents: shipping.get(line.lineNumber) ?? 0,
      allocatedExciseTaxCents: exciseTax.get(line.lineNumber) ?? 0,
      allocatedSalesTaxCents: salesTax.get(line.lineNumber) ?? 0,
      allocatedDiscountCents: discount.get(line.lineNumber) ?? 0,
    }))
}
