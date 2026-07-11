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

export type PurchasePreviewInputLine = {
  lineNumber: number
  cigarName?: string
  quantity: string
  unitPrice: string
  msrpPerCigar: string
}

export type PurchasePreviewInput = {
  shipping: string
  exciseTax: string
  salesTax: string
  discount: string
  totalPaid: string
  lines: PurchasePreviewInputLine[]
}

export type LinePreview = {
  lineNumber: number
  cigarName?: string
  quantity: number | null
  unitPriceCents: number | null
  lineSubtotalCents: number | null
  allocatedShippingCents: number | null
  allocatedExciseTaxCents: number | null
  allocatedSalesTaxCents: number | null
  allocatedDiscountCents: number | null
  trueLineCostBasisCents: number | null
  trueCostPerCigar: string | null
  msrpPerCigarCents: number | null
  msrpValueCents: number | null
  savingsCents: number | null
  savingsPerCigarCents: number | null
  savingsPercentageBasisPoints: number | null
  errors: string[]
}

export type PurchasePreview = {
  lines: LinePreview[]
  purchaseSubtotalCents: number
  shippingCents: number
  exciseTaxCents: number
  salesTaxCents: number
  discountCents: number
  totalPaidCents: number | null
  calculatedInvoiceTotalCents: number
  differenceCents: number | null
  isBalanced: boolean
  hasEnoughValidData: boolean
  errors: string[]
}

export class PurchasePreviewError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PurchasePreviewError'
  }
}

const MAX_SAFE_INTEGER_BIGINT = BigInt(Number.MAX_SAFE_INTEGER)

function safeNumberFromBigInt(value: bigint, fieldName: string) {
  const absoluteValue = value < 0n ? -value : value

  if (absoluteValue > MAX_SAFE_INTEGER_BIGINT) {
    throw new PurchasePreviewError(`${fieldName} is too large to preview safely.`)
  }

  return Number(value)
}

export function parseMoneyCents(value: string, fieldName: string, blankAsZero?: true): number
export function parseMoneyCents(value: string, fieldName: string, blankAsZero: false): number | null
export function parseMoneyCents(value: string, fieldName: string, blankAsZero = true) {
  const text = value.trim()

  if (text === '') {
    return blankAsZero ? 0 : null
  }

  const match = text.match(/^(\d+)(?:\.(\d+))?$/)

  if (!match) {
    throw new PurchasePreviewError(`${fieldName} must be a valid nonnegative dollar amount.`)
  }

  const dollars = BigInt(match[1])
  const decimal = match[2] ?? ''
  const centsText = decimal.slice(0, 2).padEnd(2, '0')
  const roundingDigit = Number(decimal[2] ?? '0')
  const cents =
    dollars * 100n + BigInt(Number(centsText)) + BigInt(roundingDigit >= 5 ? 1 : 0)

  return safeNumberFromBigInt(cents, fieldName)
}

export function parsePositiveWholeNumber(value: string, fieldName: string) {
  const text = value.trim()

  if (text === '') {
    throw new PurchasePreviewError(`${fieldName} is required.`)
  }

  if (!/^\d+$/.test(text)) {
    throw new PurchasePreviewError(`${fieldName} must be a positive whole number.`)
  }

  const parsed = Number(text)

  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new PurchasePreviewError(`${fieldName} must be a positive whole number.`)
  }

  return parsed
}

export function formatCents(cents: number | null) {
  if (cents === null) {
    return '-'
  }

  const absoluteCents = Math.abs(cents)
  const formatted = `$${Math.floor(absoluteCents / 100).toLocaleString('en-US')}.${String(
    absoluteCents % 100,
  ).padStart(2, '0')}`

  return cents < 0 ? `$(${formatted.slice(1)})` : formatted
}

export function formatCentsForInput(cents: number) {
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`
}

export function formatSignedCents(cents: number | null) {
  if (cents === null) {
    return '-'
  }

  return formatCents(cents)
}

export function formatBasisPoints(basisPoints: number | null) {
  if (basisPoints === null) {
    return '-'
  }

  const absoluteBasisPoints = Math.abs(basisPoints)
  const formatted = `${Math.floor(absoluteBasisPoints / 100)}.${String(
    absoluteBasisPoints % 100,
  ).padStart(2, '0')}%`

  return basisPoints < 0 ? `(${formatted})` : formatted
}

export function decimalStringToCents(value: string) {
  return roundMillionthsToCents(decimalStringToMillionths(value), 'decimal currency value')
}

function decimalStringToMillionths(value: string) {
  const match = value.match(/^(\d+)\.(\d{6})$/)

  if (!match) {
    throw new PurchasePreviewError('Decimal currency value is invalid.')
  }

  const dollars = BigInt(match[1])
  const millionths = BigInt(match[2])

  return dollars * 1000000n + millionths
}

function roundMillionthsToCents(value: bigint, fieldName: string) {
  const absoluteValue = value < 0n ? -value : value
  const rounded = (absoluteValue + 5000n) / 10000n
  const signed = value < 0n ? -rounded : rounded

  return safeNumberFromBigInt(signed, fieldName)
}

function savingsPercentageBasisPoints(savingsPerCigarMillionths: bigint, msrpPerCigarCents: number) {
  if (msrpPerCigarCents <= 0) {
    return null
  }

  const numerator = savingsPerCigarMillionths * 10000n
  const denominator = BigInt(msrpPerCigarCents) * 10000n
  const absoluteNumerator = numerator < 0n ? -numerator : numerator
  const rounded = (absoluteNumerator * 2n + denominator) / (2n * denominator)
  const signed = numerator < 0n ? -rounded : rounded

  return safeNumberFromBigInt(signed, 'savings percentage')
}

export function lineSubtotalCents(quantity: number, unitPriceCents: number) {
  const subtotal = BigInt(quantity) * BigInt(unitPriceCents)
  return safeNumberFromBigInt(subtotal, 'line subtotal')
}

function sumCents(values: number[], fieldName: string) {
  const total = values.reduce((sum, value) => sum + BigInt(value), 0n)
  const absoluteTotal = total < 0n ? -total : total

  if (absoluteTotal > MAX_SAFE_INTEGER_BIGINT) {
    throw new PurchasePreviewError(`${fieldName} is too large to preview safely.`)
  }

  return Number(total)
}

function assertCents(value: number, fieldName: string) {
  if (!Number.isInteger(value) || value < 0) {
    throw new PurchasePreviewError(`${fieldName} must be a nonnegative cent amount.`)
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

  const purchaseSubtotalCents = lines.reduce((total, line) => total + line.lineSubtotalCents, 0)

  if (purchaseSubtotalCents === 0) {
    if (amountCents !== 0) {
      throw new PurchasePreviewError(
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
      throw new PurchasePreviewError(`${categoryName} could not be reconciled.`)
    }

    allocations.set(
      targetLine.lineNumber,
      (allocations.get(targetLine.lineNumber) ?? 0) + residualCents,
    )
  }

  for (const allocation of allocations.values()) {
    if (!Number.isInteger(allocation) || allocation < 0) {
      throw new PurchasePreviewError(`${categoryName} allocation produced an invalid amount.`)
    }
  }

  const reconciledTotal = [...allocations.values()].reduce((total, value) => total + value, 0)
  if (reconciledTotal !== amountCents) {
    throw new PurchasePreviewError(`${categoryName} allocation did not reconcile.`)
  }

  return allocations
}

export function allocatePurchaseAmounts(
  lines: AllocationLine[],
  categories: AllocationCategoryInput,
): LineAllocation[] {
  for (const line of lines) {
    if (!Number.isInteger(line.lineNumber) || line.lineNumber < 1) {
      throw new PurchasePreviewError('lineNumber must be a positive whole number.')
    }

    assertCents(line.lineSubtotalCents, 'lineSubtotalCents')
  }

  const shipping = allocateCategory(lines, categories.shippingCents, 'shipping')
  const exciseTax = allocateCategory(lines, categories.exciseTaxCents, 'exciseTax')
  const salesTax = allocateCategory(lines, categories.salesTaxCents, 'salesTax')
  const discount = allocateCategory(lines, categories.discountCents, 'order discount')

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

export function trueCostPerCigarString(trueLineCostBasisCents: number, quantity: number) {
  const numerator = BigInt(trueLineCostBasisCents) * 10000n
  const denominator = BigInt(quantity)
  const millionths = (numerator * 2n + denominator) / (2n * denominator)
  const dollars = millionths / 1000000n
  const fraction = String(millionths % 1000000n).padStart(6, '0')

  return `${dollars}.${fraction}`
}

function emptyLinePreview(line: PurchasePreviewInputLine, errors: string[] = []): LinePreview {
  return {
    lineNumber: line.lineNumber,
    cigarName: line.cigarName,
    quantity: null,
    unitPriceCents: null,
    lineSubtotalCents: null,
    allocatedShippingCents: null,
    allocatedExciseTaxCents: null,
    allocatedSalesTaxCents: null,
    allocatedDiscountCents: null,
    trueLineCostBasisCents: null,
    trueCostPerCigar: null,
    msrpPerCigarCents: null,
    msrpValueCents: null,
    savingsCents: null,
    savingsPerCigarCents: null,
    savingsPercentageBasisPoints: null,
    errors,
  }
}

export function buildPurchasePreview(input: PurchasePreviewInput): PurchasePreview {
  const errors: string[] = []
  let shippingCents = 0
  let exciseTaxCents = 0
  let salesTaxCents = 0
  let discountCents = 0
  let totalPaidCents: number | null = null

  try {
    shippingCents = parseMoneyCents(input.shipping, 'Shipping')
    exciseTaxCents = parseMoneyCents(input.exciseTax, 'Excise Tax')
    salesTaxCents = parseMoneyCents(input.salesTax, 'Sales Tax')
    discountCents = parseMoneyCents(input.discount, 'Order Discount')
    totalPaidCents = parseMoneyCents(input.totalPaid, 'Total Paid', false)
  } catch (error) {
    errors.push(error instanceof Error ? error.message : 'Invoice amounts are invalid.')
  }

  const linePreviews = input.lines.map((line) => {
    const lineErrors: string[] = []

    try {
      const quantity = parsePositiveWholeNumber(line.quantity, `Line ${line.lineNumber} quantity`)
      const unitPriceCents = parseMoneyCents(line.unitPrice, `Line ${line.lineNumber} unit price`)
      const subtotalCents = lineSubtotalCents(quantity, unitPriceCents)
      const msrpCents =
        line.msrpPerCigar.trim() === ''
          ? null
          : parseMoneyCents(line.msrpPerCigar, `Line ${line.lineNumber} MSRP`)

      return {
        ...emptyLinePreview(line),
        quantity,
        unitPriceCents,
        lineSubtotalCents: subtotalCents,
        msrpPerCigarCents: msrpCents,
        msrpValueCents: msrpCents === null ? null : lineSubtotalCents(quantity, msrpCents),
      }
    } catch (error) {
      lineErrors.push(error instanceof Error ? error.message : `Line ${line.lineNumber} is invalid.`)
      return emptyLinePreview(line, lineErrors)
    }
  })

  const allocationLines = linePreviews
    .filter(
      (line): line is LinePreview & { lineSubtotalCents: number; quantity: number } =>
        line.lineSubtotalCents !== null && line.quantity !== null,
    )
    .map((line) => ({
      lineNumber: line.lineNumber,
      lineSubtotalCents: line.lineSubtotalCents,
    }))

  let purchaseSubtotalCents = 0
  let calculatedInvoiceTotalCents = 0

  try {
    purchaseSubtotalCents = sumCents(
      allocationLines.map((line) => line.lineSubtotalCents),
      'purchase subtotal',
    )
    calculatedInvoiceTotalCents = sumCents(
      [purchaseSubtotalCents, shippingCents, exciseTaxCents, salesTaxCents, -discountCents],
      'calculated invoice total',
    )
  } catch (error) {
    errors.push(error instanceof Error ? error.message : 'Purchase total is too large.')
  }

  let allocatedLinePreviews = linePreviews
  if (allocationLines.length > 0 && errors.length === 0) {
    try {
      const allocations = allocatePurchaseAmounts(allocationLines, {
        shippingCents,
        exciseTaxCents,
        salesTaxCents,
        discountCents,
      })
      const allocationsByLine = new Map(
        allocations.map((allocation) => [allocation.lineNumber, allocation]),
      )

      allocatedLinePreviews = linePreviews.map((line) => {
        if (line.lineSubtotalCents === null || line.quantity === null) {
          return line
        }

        const allocation = allocationsByLine.get(line.lineNumber)

        if (!allocation) {
          return {
            ...line,
            errors: [...line.errors, 'Line allocation was not found.'],
          }
        }

        const trueLineCostBasisCents = sumCents(
          [
            line.lineSubtotalCents,
            allocation.allocatedShippingCents,
            allocation.allocatedExciseTaxCents,
            allocation.allocatedSalesTaxCents,
            -allocation.allocatedDiscountCents,
          ],
          `Line ${line.lineNumber} true cost basis`,
        )

        if (trueLineCostBasisCents < 0) {
          return {
            ...line,
            allocatedShippingCents: allocation.allocatedShippingCents,
            allocatedExciseTaxCents: allocation.allocatedExciseTaxCents,
            allocatedSalesTaxCents: allocation.allocatedSalesTaxCents,
            allocatedDiscountCents: allocation.allocatedDiscountCents,
            trueLineCostBasisCents,
            errors: [...line.errors, 'Order Discount creates a negative line cost.'],
          }
        }

        const trueCostPerCigar = trueCostPerCigarString(trueLineCostBasisCents, line.quantity)
        const trueCostPerCigarMillionths = decimalStringToMillionths(trueCostPerCigar)
        const msrpPerCigarMillionths =
          line.msrpPerCigarCents === null ? null : BigInt(line.msrpPerCigarCents) * 10000n
        const savingsPerCigarMillionths =
          msrpPerCigarMillionths === null
            ? null
            : msrpPerCigarMillionths - trueCostPerCigarMillionths
        const savingsPerCigarCents =
          savingsPerCigarMillionths === null
            ? null
            : roundMillionthsToCents(savingsPerCigarMillionths, 'savings per cigar')

        return {
          ...line,
          allocatedShippingCents: allocation.allocatedShippingCents,
          allocatedExciseTaxCents: allocation.allocatedExciseTaxCents,
          allocatedSalesTaxCents: allocation.allocatedSalesTaxCents,
          allocatedDiscountCents: allocation.allocatedDiscountCents,
          trueLineCostBasisCents,
          trueCostPerCigar,
          savingsCents:
            line.msrpValueCents === null ? null : line.msrpValueCents - trueLineCostBasisCents,
          savingsPerCigarCents,
          savingsPercentageBasisPoints:
            line.msrpPerCigarCents === null || savingsPerCigarMillionths === null
              ? null
              : savingsPercentageBasisPoints(
                  savingsPerCigarMillionths,
                  line.msrpPerCigarCents,
                ),
        }
      })
    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'Unable to allocate invoice amounts.')
    }
  } else if (
    allocationLines.length === 0 &&
    (shippingCents > 0 || exciseTaxCents > 0 || salesTaxCents > 0 || discountCents > 0)
  ) {
    errors.push('Purchase-level amounts cannot be allocated until at least one line has a subtotal.')
  }

  let differenceCents: number | null = null

  if (totalPaidCents !== null) {
    try {
      differenceCents = sumCents(
        [totalPaidCents, -calculatedInvoiceTotalCents],
        'invoice difference',
      )
    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'Invoice difference is too large.')
    }
  }
  const lineErrors = allocatedLinePreviews.flatMap((line) => line.errors)

  return {
    lines: allocatedLinePreviews,
    purchaseSubtotalCents,
    shippingCents,
    exciseTaxCents,
    salesTaxCents,
    discountCents,
    totalPaidCents,
    calculatedInvoiceTotalCents,
    differenceCents,
    isBalanced:
      differenceCents === 0 && errors.length === 0 && lineErrors.length === 0 && totalPaidCents !== null,
    hasEnoughValidData:
      allocationLines.length > 0 && errors.length === 0 && lineErrors.length === 0,
    errors: [...errors, ...lineErrors],
  }
}
