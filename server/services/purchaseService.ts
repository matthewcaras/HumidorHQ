import { PrismaClient } from '../../src/generated/prisma/client.ts'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import { normalizeSearchKey } from '../utils/searchKeys.ts'
import {
  allocatePurchaseAmounts,
  PurchaseAllocationError,
} from '../utils/purchaseAllocations.ts'

type DecimalInput = number | string

type VendorRecord = {
  id: number
  name: string
  nameKey: string
  isActive: boolean
}

type CatalogCigarRecord = {
  id: number
  manufacturer: string
  manufacturerKey: string
  series: string
  seriesKey: string
  vitola: string
  vitolaKey: string
  msrp: DecimalInput | null
  isActive: boolean
}

type PurchaseWithRelations = {
  id: number
  vendor: VendorRecord | null
  vendorId: number | null
  invoiceNumber: string | null
  purchaseDate: Date | null
  lines: {
    receivedDate: Date | null
    catalogCigar: CatalogCigarRecord
    lot: unknown
  }[]
}

type TransactionClient = {
  vendor: {
    findUnique(args: unknown): Promise<VendorRecord | null>
  }
  catalogCigar: {
    findMany(args: unknown): Promise<CatalogCigarRecord[]>
  }
  purchaseOrder: {
    create(args: unknown): Promise<{ id: number }>
    findUnique(args: unknown): Promise<PurchaseWithRelations | null>
  }
  purchaseLine: {
    create(args: unknown): Promise<{ id: number }>
  }
  lot: {
    create(args: unknown): Promise<unknown>
  }
}

type PurchasePrismaClient = TransactionClient & {
  purchaseOrder: TransactionClient['purchaseOrder'] & {
    findMany(args: unknown): Promise<PurchaseWithRelations[]>
    findUnique(args: unknown): Promise<PurchaseWithRelations | null>
  }
  $transaction<T>(callback: (transaction: TransactionClient) => Promise<T>): Promise<T>
}

export type CreatePurchaseLineInput = {
  catalogCigarId?: unknown
  quantity?: unknown
  unitPrice?: unknown
  msrpPerCigar?: unknown
  receivedDate?: unknown
}

export type CreatePurchaseInput = {
  vendorId?: unknown
  purchaseDate?: unknown
  invoiceNumber?: unknown
  shipping?: unknown
  exciseTax?: unknown
  salesTax?: unknown
  discount?: unknown
  totalPaid?: unknown
  notes?: unknown
  lines?: unknown
}

export type GetPurchasesInput = {
  vendorId?: unknown
  search?: unknown
}

export type PurchaseServiceErrorCode =
  | 'PURCHASE_VALIDATION_ERROR'
  | 'PURCHASE_DUPLICATE_INVOICE'
  | 'PURCHASE_VENDOR_NOT_FOUND'
  | 'PURCHASE_CATALOG_CIGAR_NOT_FOUND'
  | 'PURCHASE_NOT_FOUND'
  | 'PURCHASE_TOTAL_RECONCILIATION_ERROR'
  | 'PURCHASE_DATABASE_ERROR'

export class PurchaseServiceError extends Error {
  code: PurchaseServiceErrorCode
  statusCode: number

  constructor(message: string, code: PurchaseServiceErrorCode, statusCode = 400) {
    super(message)
    this.name = 'PurchaseServiceError'
    this.code = code
    this.statusCode = statusCode
  }
}

let prismaSingleton: PurchasePrismaClient | null = null

function getPrismaClient(): PurchasePrismaClient {
  if (!prismaSingleton) {
    const adapter = new PrismaBetterSqlite3({
      url: process.env.DATABASE_URL || 'file:./prisma/humidorhq.db',
    })

    prismaSingleton = new PrismaClient({ adapter }) as unknown as PurchasePrismaClient
  }

  return prismaSingleton
}

function centsToDecimalString(cents: number) {
  const sign = cents < 0 ? '-' : ''
  const absoluteCents = Math.abs(cents)
  return `${sign}${Math.floor(absoluteCents / 100)}.${String(absoluteCents % 100).padStart(2, '0')}`
}

function trueCostPerCigarString(trueLineCostBasisCents: number, quantity: number) {
  const numerator = BigInt(trueLineCostBasisCents) * 10000n
  const denominator = BigInt(quantity)
  const millionths = Number((numerator * 2n + denominator) / (2n * denominator))
  const dollars = Math.floor(millionths / 1000000)
  const fraction = String(millionths % 1000000).padStart(6, '0')

  return `${dollars}.${fraction}`
}

function assertSafeCents(value: number, fieldName: string) {
  if (!Number.isSafeInteger(value)) {
    throw new PurchaseServiceError(`${fieldName} is too large.`, 'PURCHASE_VALIDATION_ERROR', 400)
  }
}

function parseMoneyCents(value: unknown, fieldName: string, required = false) {
  if (value === undefined || value === null || value === '') {
    if (required) {
      throw new PurchaseServiceError(`${fieldName} is required.`, 'PURCHASE_VALIDATION_ERROR', 400)
    }

    return 0
  }

  const text = String(value).trim()
  const match = text.match(/^(\d+)(?:\.(\d+))?$/)

  if (!match) {
    throw new PurchaseServiceError(
      `${fieldName} must be a valid nonnegative amount.`,
      'PURCHASE_VALIDATION_ERROR',
      400,
    )
  }

  const dollars = BigInt(match[1])
  const decimal = match[2] ?? ''
  const centsText = decimal.slice(0, 2).padEnd(2, '0')
  const roundingDigit = Number(decimal[2] ?? '0')
  const cents =
    dollars * 100n + BigInt(Number(centsText)) + BigInt(roundingDigit >= 5 ? 1 : 0)

  if (cents > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new PurchaseServiceError(`${fieldName} is too large.`, 'PURCHASE_VALIDATION_ERROR', 400)
  }

  return Number(cents)
}

function optionalMoneyCents(value: unknown, fieldName: string) {
  if (value === undefined || value === null || value === '') {
    return null
  }

  return parseMoneyCents(value, fieldName)
}

function parsePositiveInteger(value: unknown, fieldName: string) {
  const numberValue = Number(value)

  if (!Number.isInteger(numberValue) || numberValue < 1) {
    throw new PurchaseServiceError(
      `${fieldName} must be a positive whole number.`,
      'PURCHASE_VALIDATION_ERROR',
      400,
    )
  }

  return numberValue
}

function parseDate(value: unknown, fieldName: string, required: true): Date
function parseDate(value: unknown, fieldName: string, required?: false): Date | null
function parseDate(value: unknown, fieldName: string, required = false) {
  if (value === undefined || value === null || value === '') {
    if (required) {
      throw new PurchaseServiceError(`${fieldName} is required.`, 'PURCHASE_VALIDATION_ERROR', 400)
    }

    return null
  }

  const date = new Date(String(value))

  if (Number.isNaN(date.getTime())) {
    throw new PurchaseServiceError(
      `${fieldName} must be a valid date.`,
      'PURCHASE_VALIDATION_ERROR',
      400,
    )
  }

  return date
}

function optionalText(value: unknown) {
  if (value === undefined || value === null || value === '') {
    return null
  }

  if (typeof value !== 'string') {
    throw new PurchaseServiceError('Text fields must be strings.', 'PURCHASE_VALIDATION_ERROR', 400)
  }

  return value
}

function optionalTrimmedText(value: unknown) {
  if (value === undefined || value === null) {
    return null
  }

  if (typeof value !== 'string') {
    throw new PurchaseServiceError('Text fields must be strings.', 'PURCHASE_VALIDATION_ERROR', 400)
  }

  const trimmed = value.trim()
  return trimmed.length === 0 ? null : trimmed
}

function receiptState(purchase: PurchaseWithRelations) {
  const receivedCount = purchase.lines.filter((line) => line.receivedDate).length

  if (receivedCount === 0) {
    return 'EN_ROUTE'
  }

  if (receivedCount === purchase.lines.length) {
    return 'RECEIVED'
  }

  return 'PARTIALLY_RECEIVED'
}

function withReceiptState(purchase: PurchaseWithRelations) {
  return {
    ...purchase,
    receiptState: receiptState(purchase),
  }
}

function purchaseInclude() {
  return {
    vendor: true,
    lines: {
      orderBy: { lineNumber: 'asc' },
      include: {
        catalogCigar: true,
        lot: true,
      },
    },
  }
}

function mapDatabaseError(error: unknown): never {
  if (error instanceof PurchaseServiceError) {
    throw error
  }

  if (error instanceof PurchaseAllocationError) {
    throw new PurchaseServiceError(error.message, 'PURCHASE_VALIDATION_ERROR', 400)
  }

  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'P2002'
  ) {
    throw new PurchaseServiceError(
      'A purchase with this vendor and invoice number already exists.',
      'PURCHASE_DUPLICATE_INVOICE',
      409,
    )
  }

  throw new PurchaseServiceError(
    'The purchase operation could not be completed.',
    'PURCHASE_DATABASE_ERROR',
    500,
  )
}

export function purchaseIdParam(value: string) {
  const id = Number(value)

  if (!Number.isInteger(id) || id < 1) {
    throw new PurchaseServiceError(
      'Purchase id must be a positive integer.',
      'PURCHASE_VALIDATION_ERROR',
      400,
    )
  }

  return id
}

function normalizeInput(input: CreatePurchaseInput) {
  const vendorId = parsePositiveInteger(input.vendorId, 'vendorId')
  const purchaseDate = parseDate(input.purchaseDate, 'purchaseDate', true)
  const invoiceNumber = optionalTrimmedText(input.invoiceNumber)
  const shippingCents = parseMoneyCents(input.shipping, 'shipping')
  const exciseTaxCents = parseMoneyCents(input.exciseTax, 'exciseTax')
  const salesTaxCents = parseMoneyCents(input.salesTax, 'salesTax')
  const discountCents = parseMoneyCents(input.discount, 'discount')
  const totalPaidCents = parseMoneyCents(input.totalPaid, 'totalPaid', true)
  const notes = optionalText(input.notes)

  if (!Array.isArray(input.lines) || input.lines.length === 0) {
    throw new PurchaseServiceError(
      'At least one purchase line is required.',
      'PURCHASE_VALIDATION_ERROR',
      400,
    )
  }

  const seenCatalogCigarIds = new Set<number>()
  const lines = input.lines.map((rawLine, index) => {
    const line = rawLine as CreatePurchaseLineInput
    const catalogCigarId = parsePositiveInteger(line.catalogCigarId, 'catalogCigarId')

    if (seenCatalogCigarIds.has(catalogCigarId)) {
      throw new PurchaseServiceError(
        'Each catalog cigar may appear only once per purchase.',
        'PURCHASE_VALIDATION_ERROR',
        400,
      )
    }
    seenCatalogCigarIds.add(catalogCigarId)

    const quantity = parsePositiveInteger(line.quantity, 'quantity')
    const unitPriceCents = parseMoneyCents(line.unitPrice, 'unitPrice')
    const msrpPerCigarCents = optionalMoneyCents(line.msrpPerCigar, 'msrpPerCigar')
    const receivedDate = parseDate(line.receivedDate, 'receivedDate')

    if (receivedDate && receivedDate < purchaseDate) {
      throw new PurchaseServiceError(
        'receivedDate must not be earlier than purchaseDate.',
        'PURCHASE_VALIDATION_ERROR',
        400,
      )
    }

    if (unitPriceCents > 0 && quantity > Math.floor(Number.MAX_SAFE_INTEGER / unitPriceCents)) {
      throw new PurchaseServiceError(
        'lineSubtotal is too large.',
        'PURCHASE_VALIDATION_ERROR',
        400,
      )
    }

    const lineSubtotalCents = quantity * unitPriceCents
    assertSafeCents(lineSubtotalCents, 'lineSubtotal')

    return {
      lineNumber: index + 1,
      catalogCigarId,
      quantity,
      unitPriceCents,
      lineSubtotalCents,
      msrpPerCigarCents,
      receivedDate,
    }
  })

  return {
    vendorId,
    purchaseDate,
    invoiceNumber,
    shippingCents,
    exciseTaxCents,
    salesTaxCents,
    discountCents,
    totalPaidCents,
    notes,
    lines,
  }
}

export async function createPurchase(input: CreatePurchaseInput) {
  const prisma = getPrismaClient()

  try {
    const data = normalizeInput(input)

    return await prisma.$transaction(async (transaction) => {
      const vendor = await transaction.vendor.findUnique({ where: { id: data.vendorId } })

      if (!vendor?.isActive) {
        throw new PurchaseServiceError(
          'Vendor was not found or is archived.',
          'PURCHASE_VENDOR_NOT_FOUND',
          404,
        )
      }

      const catalogCigars = await transaction.catalogCigar.findMany({
        where: { id: { in: data.lines.map((line) => line.catalogCigarId) } },
      })
      const catalogById = new Map(catalogCigars.map((cigar) => [cigar.id, cigar]))

      for (const line of data.lines) {
        const catalogCigar = catalogById.get(line.catalogCigarId)

        if (!catalogCigar?.isActive) {
          throw new PurchaseServiceError(
            'Catalog cigar was not found or is archived.',
            'PURCHASE_CATALOG_CIGAR_NOT_FOUND',
            404,
          )
        }

        if (line.msrpPerCigarCents === null) {
          line.msrpPerCigarCents =
            catalogCigar.msrp === null ? null : parseMoneyCents(catalogCigar.msrp, 'catalog MSRP')
        }
      }

      const purchaseSubtotalCents = data.lines.reduce(
        (total, line) => total + line.lineSubtotalCents,
        0,
      )
      assertSafeCents(purchaseSubtotalCents, 'purchaseSubtotal')

      const calculatedTotalBeforeDiscount =
        purchaseSubtotalCents + data.shippingCents + data.exciseTaxCents + data.salesTaxCents
      assertSafeCents(calculatedTotalBeforeDiscount, 'calculatedTotal')

      const calculatedTotalCents =
        calculatedTotalBeforeDiscount - data.discountCents
      assertSafeCents(calculatedTotalCents, 'calculatedTotal')

      if (calculatedTotalCents !== data.totalPaidCents) {
        throw new PurchaseServiceError(
          `Purchase total does not reconcile. Calculated total is ${centsToDecimalString(calculatedTotalCents)} but totalPaid is ${centsToDecimalString(data.totalPaidCents)}.`,
          'PURCHASE_TOTAL_RECONCILIATION_ERROR',
          400,
        )
      }

      const allocations = allocatePurchaseAmounts(
        data.lines.map((line) => ({
          lineNumber: line.lineNumber,
          lineSubtotalCents: line.lineSubtotalCents,
        })),
        {
          shippingCents: data.shippingCents,
          exciseTaxCents: data.exciseTaxCents,
          salesTaxCents: data.salesTaxCents,
          discountCents: data.discountCents,
        },
      )
      const allocationsByLine = new Map(
        allocations.map((allocation) => [allocation.lineNumber, allocation]),
      )

      const purchaseOrder = await transaction.purchaseOrder.create({
        data: {
          vendorId: data.vendorId,
          orderDate: data.purchaseDate,
          purchaseDate: data.purchaseDate,
          orderNumber: data.invoiceNumber,
          invoiceNumber: data.invoiceNumber,
          shipping: centsToDecimalString(data.shippingCents),
          tax: centsToDecimalString(data.exciseTaxCents + data.salesTaxCents),
          exciseTax: centsToDecimalString(data.exciseTaxCents),
          salesTax: centsToDecimalString(data.salesTaxCents),
          discount: centsToDecimalString(data.discountCents),
          totalPaid: centsToDecimalString(data.totalPaidCents),
          notes: data.notes,
        },
      })

      for (const line of data.lines) {
        const allocation = allocationsByLine.get(line.lineNumber)

        if (!allocation) {
          throw new PurchaseServiceError(
            'Line allocation was not found.',
            'PURCHASE_DATABASE_ERROR',
            500,
          )
        }

        const trueLineCostBasisCents =
          line.lineSubtotalCents +
          allocation.allocatedShippingCents +
          allocation.allocatedExciseTaxCents +
          allocation.allocatedSalesTaxCents -
          allocation.allocatedDiscountCents
        assertSafeCents(trueLineCostBasisCents, 'trueLineCostBasis')
        if (trueLineCostBasisCents < 0) {
          throw new PurchaseServiceError(
            'trueLineCostBasis must not be negative.',
            'PURCHASE_VALIDATION_ERROR',
            400,
          )
        }
        const trueCostPerCigar = trueCostPerCigarString(trueLineCostBasisCents, line.quantity)

        const purchaseLine = await transaction.purchaseLine.create({
          data: {
            purchaseOrderId: purchaseOrder.id,
            catalogCigarId: line.catalogCigarId,
            lineNumber: line.lineNumber,
            quantity: line.quantity,
            unitPrice: centsToDecimalString(line.unitPriceCents),
            lineSubtotal: centsToDecimalString(line.lineSubtotalCents),
            msrpPerCigar:
              line.msrpPerCigarCents === null
                ? null
                : centsToDecimalString(line.msrpPerCigarCents),
            receivedDate: line.receivedDate,
            allocatedShipping: centsToDecimalString(allocation.allocatedShippingCents),
            allocatedExciseTax: centsToDecimalString(allocation.allocatedExciseTaxCents),
            allocatedSalesTax: centsToDecimalString(allocation.allocatedSalesTaxCents),
            allocatedDiscount: centsToDecimalString(allocation.allocatedDiscountCents),
          },
        })

        await transaction.lot.create({
          data: {
            vitolaId: null,
            storageLocationId: null,
            purchaseOrderId: purchaseOrder.id,
            purchaseLineId: purchaseLine.id,
            catalogCigarId: line.catalogCigarId,
            quantityPurchased: line.quantity,
            quantityRemaining: line.quantity,
            originalQuantity: line.quantity,
            currentQuantity: 0,
            msrpPerCigar:
              line.msrpPerCigarCents === null
                ? null
                : centsToDecimalString(line.msrpPerCigarCents),
            actualCostPerCigar: centsToDecimalString(line.unitPriceCents),
            allocatedCostPerCigar: trueCostPerCigar,
            purchaseDate: data.purchaseDate,
            vendorIdSnapshot: vendor.id,
            vendorNameSnapshot: vendor.name,
            purchaseDateSnapshot: data.purchaseDate,
            receivedDateSnapshot: line.receivedDate,
            costPerCigarSnapshot: trueCostPerCigar,
            msrpPerCigarSnapshot:
              line.msrpPerCigarCents === null
                ? null
                : centsToDecimalString(line.msrpPerCigarCents),
            sourceSnapshot: data.invoiceNumber,
          },
        })
      }

      const created = await transaction.purchaseOrder.findUnique({
        where: { id: purchaseOrder.id },
        include: purchaseInclude(),
      })

      if (!created) {
        throw new PurchaseServiceError('Purchase was not found.', 'PURCHASE_NOT_FOUND', 404)
      }

      return withReceiptState(created)
    })
  } catch (error) {
    mapDatabaseError(error)
  }
}

export async function getPurchases(filters: GetPurchasesInput = {}) {
  const prisma = getPrismaClient()

  try {
    const vendorId =
      filters.vendorId === undefined || filters.vendorId === ''
        ? undefined
        : parsePositiveInteger(filters.vendorId, 'vendorId')
    const searchKey =
      typeof filters.search === 'string' ? normalizeSearchKey(filters.search) : ''
    const invoiceSearch =
      typeof filters.search === 'string' && filters.search.trim().length > 0
        ? filters.search.trim()
        : ''

    const purchases = await prisma.purchaseOrder.findMany({
      where: {
        ...(vendorId === undefined ? {} : { vendorId }),
      },
      orderBy: [{ purchaseDate: 'desc' }, { id: 'desc' }],
      include: purchaseInclude(),
    })

    return purchases
      .filter((purchase) => {
        if (!searchKey && !invoiceSearch) {
          return true
        }

        const vendorNameKey = normalizeSearchKey(purchase.vendor?.name)
        const invoiceNumber = purchase.invoiceNumber ?? ''

        return (
          (searchKey.length > 0 && vendorNameKey.includes(searchKey)) ||
          invoiceNumber.toLowerCase().includes(invoiceSearch.toLowerCase()) ||
          (searchKey.length > 0 &&
            purchase.lines.some((line) => {
              const cigar = line.catalogCigar
              return (
                cigar.manufacturerKey.includes(searchKey) ||
                cigar.seriesKey.includes(searchKey) ||
                cigar.vitolaKey.includes(searchKey)
              )
            }))
        )
      })
      .map(withReceiptState)
  } catch (error) {
    mapDatabaseError(error)
  }
}

export async function getPurchaseById(id: number) {
  const prisma = getPrismaClient()

  try {
    const purchase = await prisma.purchaseOrder.findUnique({
      where: { id },
      include: purchaseInclude(),
    })

    if (!purchase) {
      throw new PurchaseServiceError('Purchase was not found.', 'PURCHASE_NOT_FOUND', 404)
    }

    return withReceiptState(purchase)
  } catch (error) {
    mapDatabaseError(error)
  }
}
