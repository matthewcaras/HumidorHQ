import { PrismaClient } from '../../src/generated/prisma/client.ts'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'

type ReceiveStoreInput = {
  receivedDate?: unknown
  storageLocationId?: unknown
  storageSubLocationId?: unknown
}

type LineState = 'EN_ROUTE' | 'RECEIVED_NOT_STORED' | 'STORED'
type PurchaseReceiptState = 'EN_ROUTE' | 'PARTIALLY_RECEIVED' | 'RECEIVED'

type ReceiveStoreResult = {
  purchaseLine: unknown
  lot: unknown
  locationBalance: unknown
  inventoryEvent: unknown
  lineState: LineState
  purchaseReceiptState: PurchaseReceiptState
}

type ReceiveStorePrismaClient = any

export type ReceiveStoreServiceErrorCode =
  | 'RECEIVE_STORE_VALIDATION_ERROR'
  | 'RECEIVE_STORE_PURCHASE_LINE_NOT_FOUND'
  | 'RECEIVE_STORE_LOT_NOT_FOUND'
  | 'RECEIVE_STORE_DESTINATION_NOT_FOUND'
  | 'RECEIVE_STORE_INACTIVE_DESTINATION'
  | 'RECEIVE_STORE_DESTINATION_HUMIDOR_MISMATCH'
  | 'RECEIVE_STORE_RECEIVED_DATE_CONFLICT'
  | 'RECEIVE_STORE_ALREADY_STORED'
  | 'RECEIVE_STORE_DUPLICATE_INITIAL_PLACEMENT'
  | 'RECEIVE_STORE_DATABASE_ERROR'

export class ReceiveStoreServiceError extends Error {
  code: ReceiveStoreServiceErrorCode
  statusCode: number

  constructor(message: string, code: ReceiveStoreServiceErrorCode, statusCode = 400) {
    super(message)
    this.name = 'ReceiveStoreServiceError'
    this.code = code
    this.statusCode = statusCode
  }
}

let prismaSingleton: ReceiveStorePrismaClient | null = null

function getPrismaClient(): ReceiveStorePrismaClient {
  if (!prismaSingleton) {
    const adapter = new PrismaBetterSqlite3({
      url: process.env.DATABASE_URL || 'file:./prisma/humidorhq.db',
    })

    prismaSingleton = new PrismaClient({ adapter }) as unknown as ReceiveStorePrismaClient
  }

  return prismaSingleton
}

function parsePositiveInteger(value: unknown, fieldName: string) {
  const numberValue = Number(value)

  if (!Number.isInteger(numberValue) || numberValue < 1) {
    throw new ReceiveStoreServiceError(
      `${fieldName} must be a positive whole number.`,
      'RECEIVE_STORE_VALIDATION_ERROR',
      400,
    )
  }

  return numberValue
}

function parseCalendarDate(value: unknown, fieldName: string) {
  if (value === undefined || value === null || value === '') {
    throw new ReceiveStoreServiceError(
      `${fieldName} is required.`,
      'RECEIVE_STORE_VALIDATION_ERROR',
      400,
    )
  }

  if (typeof value !== 'string') {
    throw new ReceiveStoreServiceError(
      `${fieldName} must be a valid date.`,
      'RECEIVE_STORE_VALIDATION_ERROR',
      400,
    )
  }

  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) {
    throw new ReceiveStoreServiceError(
      `${fieldName} must be a valid date.`,
      'RECEIVE_STORE_VALIDATION_ERROR',
      400,
    )
  }

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new ReceiveStoreServiceError(
      `${fieldName} must be a valid date.`,
      'RECEIVE_STORE_VALIDATION_ERROR',
      400,
    )
  }

  return date
}

function sameCalendarDate(left: Date, right: Date) {
  return calendarDateKey(left) === calendarDateKey(right)
}

function calendarDateKey(date: Date) {
  return date.toISOString().slice(0, 10)
}

function purchaseReceiptStateFromLines(lines: { receivedDate: Date | null }[]) {
  const receivedCount = lines.filter((line) => line.receivedDate).length

  if (receivedCount === 0) {
    return 'EN_ROUTE'
  }

  if (receivedCount === lines.length) {
    return 'RECEIVED'
  }

  return 'PARTIALLY_RECEIVED'
}

function mapDatabaseError(error: unknown): never {
  if (error instanceof ReceiveStoreServiceError) {
    throw error
  }

  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'P2002'
  ) {
    throw new ReceiveStoreServiceError(
      'This lot already has an initial placement.',
      'RECEIVE_STORE_DUPLICATE_INITIAL_PLACEMENT',
      409,
    )
  }

  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'P2025'
  ) {
    throw new ReceiveStoreServiceError(
      'Purchase line was not found.',
      'RECEIVE_STORE_PURCHASE_LINE_NOT_FOUND',
      404,
    )
  }

  throw new ReceiveStoreServiceError(
    'The receive and store operation could not be completed.',
    'RECEIVE_STORE_DATABASE_ERROR',
    500,
  )
}

type ReceiveStorePrismaError = {
  code?: string
  meta?: {
    target?: unknown
  }
}

function getEffectiveCostPerCigar(lot: {
  costPerCigarSnapshot: unknown
  allocatedCostPerCigar: unknown
  actualCostPerCigar: unknown
}) {
  return lot.costPerCigarSnapshot ?? lot.allocatedCostPerCigar ?? lot.actualCostPerCigar ?? null
}

function getEffectiveMsrpPerCigar(lot: { msrpPerCigarSnapshot: unknown; msrpPerCigar: unknown }) {
  return lot.msrpPerCigarSnapshot ?? lot.msrpPerCigar ?? null
}

export function purchaseLineIdParam(value: string) {
  const id = Number(value)

  if (!Number.isInteger(id) || id < 1) {
    throw new ReceiveStoreServiceError(
      'Purchase line id must be a positive integer.',
      'RECEIVE_STORE_VALIDATION_ERROR',
      400,
    )
  }

  return id
}

export async function receiveAndStorePurchaseLine(
  purchaseLineId: number,
  input: ReceiveStoreInput,
): Promise<ReceiveStoreResult> {
  const prisma = getPrismaClient()
  const receivedDate = parseCalendarDate(input.receivedDate, 'receivedDate')
  const storageLocationId = parsePositiveInteger(input.storageLocationId, 'storageLocationId')
  const storageSubLocationId = parsePositiveInteger(
    input.storageSubLocationId,
    'storageSubLocationId',
  )

  try {
    return await prisma.$transaction(async (transaction: ReceiveStorePrismaClient) => {
      const tx = transaction as any

      const purchaseLine = await tx.purchaseLine.findUnique({
        where: { id: purchaseLineId },
        include: {
          purchaseOrder: {
            select: {
              id: true,
              purchaseDate: true,
            },
          },
          lot: {
            include: {
              locationBalances: true,
              events: true,
            },
          },
        },
      })

      if (!purchaseLine) {
        throw new ReceiveStoreServiceError(
          'Purchase line was not found.',
          'RECEIVE_STORE_PURCHASE_LINE_NOT_FOUND',
          404,
        )
      }

      const lot = purchaseLine.lot
      if (!lot) {
        throw new ReceiveStoreServiceError(
          'Lot was not found.',
          'RECEIVE_STORE_LOT_NOT_FOUND',
          404,
        )
      }

      if (lot.locationBalances.length > 0) {
        throw new ReceiveStoreServiceError(
          'This lot has already been stored.',
          'RECEIVE_STORE_ALREADY_STORED',
          409,
        )
      }

      if (typeof lot.currentQuantity === 'number' && lot.currentQuantity > 0) {
        throw new ReceiveStoreServiceError(
          'This lot has already been stored.',
          'RECEIVE_STORE_ALREADY_STORED',
          409,
        )
      }

      if (
        lot.events.some((event: { eventType: string }) => event.eventType === 'INITIAL_PLACEMENT')
      ) {
        throw new ReceiveStoreServiceError(
          'This lot already has an initial placement.',
          'RECEIVE_STORE_DUPLICATE_INITIAL_PLACEMENT',
          409,
        )
      }

      const quantitiesReconcile =
        Number.isInteger(purchaseLine.quantity) &&
        purchaseLine.quantity > 0 &&
        lot.quantityPurchased === purchaseLine.quantity &&
        lot.quantityRemaining === purchaseLine.quantity &&
        lot.originalQuantity === purchaseLine.quantity &&
        (lot.currentQuantity === null || lot.currentQuantity === 0)

      if (!quantitiesReconcile) {
        throw new ReceiveStoreServiceError(
          'Line and lot quantities do not reconcile for full-line receipt.',
          'RECEIVE_STORE_VALIDATION_ERROR',
          400,
        )
      }

      const destination = await tx.storageSubLocation.findUnique({
        where: { id: storageSubLocationId },
        include: {
          storageLocation: true,
        },
      })

      if (!destination) {
        throw new ReceiveStoreServiceError(
          'Destination sub-location was not found.',
          'RECEIVE_STORE_DESTINATION_NOT_FOUND',
          404,
        )
      }

      if (!destination.isActive || !destination.storageLocation?.isActive) {
        throw new ReceiveStoreServiceError(
          'Destination sub-location is inactive.',
          'RECEIVE_STORE_INACTIVE_DESTINATION',
          409,
        )
      }

      if (destination.storageLocationId !== storageLocationId) {
        throw new ReceiveStoreServiceError(
          'Destination sub-location does not belong to the selected humidor.',
          'RECEIVE_STORE_DESTINATION_HUMIDOR_MISMATCH',
          409,
        )
      }

      if (
        purchaseLine.purchaseOrder?.purchaseDate &&
        calendarDateKey(receivedDate) < calendarDateKey(purchaseLine.purchaseOrder.purchaseDate)
      ) {
        throw new ReceiveStoreServiceError(
          'receivedDate must not be earlier than purchaseDate.',
          'RECEIVE_STORE_VALIDATION_ERROR',
          400,
        )
      }

      const existingReceivedDate = purchaseLine.receivedDate
      if (existingReceivedDate && !sameCalendarDate(existingReceivedDate, receivedDate)) {
        throw new ReceiveStoreServiceError(
          "receivedDate conflicts with the line's existing received date.",
          'RECEIVE_STORE_RECEIVED_DATE_CONFLICT',
          409,
        )
      }

      const effectiveReceivedDate = existingReceivedDate ?? receivedDate

      if (!existingReceivedDate) {
        await tx.purchaseLine.update({
          where: { id: purchaseLine.id },
          data: {
            receivedDate: effectiveReceivedDate,
          },
        })
      }

      await tx.lot.update({
        where: { id: lot.id },
        data: {
          receivedDateSnapshot: effectiveReceivedDate,
          currentQuantity: purchaseLine.quantity,
        },
      })

      const inventoryEvent = await tx.inventoryEvent.create({
        data: {
          lotId: lot.id,
          eventType: 'INITIAL_PLACEMENT',
          quantity: purchaseLine.quantity,
          eventDate: effectiveReceivedDate,
          fromStorageSubLocationId: null,
          toStorageSubLocationId: destination.id,
          costPerCigarAtEvent: getEffectiveCostPerCigar(lot),
          msrpPerCigarAtEvent: getEffectiveMsrpPerCigar(lot),
          notes: null,
        },
      })

      const locationBalance = await tx.lotLocationBalance.create({
        data: {
          lotId: lot.id,
          storageSubLocationId: destination.id,
          quantity: purchaseLine.quantity,
        },
      })

      const refreshedPurchaseLine = await tx.purchaseLine.findUnique({
        where: { id: purchaseLine.id },
        include: {
          catalogCigar: true,
          purchaseOrder: {
            select: {
              id: true,
              purchaseDate: true,
              invoiceNumber: true,
              vendorId: true,
            },
          },
          lot: {
            include: {
              locationBalances: true,
              events: true,
            },
          },
        },
      })

      const refreshedLot = await tx.lot.findUnique({
        where: { id: lot.id },
        include: {
          locationBalances: true,
          events: true,
        },
      })

      if (!refreshedPurchaseLine || !refreshedLot) {
        throw new ReceiveStoreServiceError(
          'Receive and store records could not be reloaded.',
          'RECEIVE_STORE_DATABASE_ERROR',
          500,
        )
      }

      const purchaseOrder = await tx.purchaseOrder.findUnique({
        where: { id: purchaseLine.purchaseOrderId },
        select: {
          id: true,
          lines: {
            select: {
              receivedDate: true,
            },
            orderBy: {
              lineNumber: 'asc',
            },
          },
        },
      })

      if (!purchaseOrder) {
        throw new ReceiveStoreServiceError(
          'Purchase order was not found.',
          'RECEIVE_STORE_PURCHASE_LINE_NOT_FOUND',
          404,
        )
      }

      return {
        purchaseLine: refreshedPurchaseLine,
        lot: refreshedLot,
        locationBalance,
        inventoryEvent,
        lineState: 'STORED',
        purchaseReceiptState: purchaseReceiptStateFromLines(purchaseOrder.lines),
      }
    })
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as ReceiveStorePrismaError).code === 'P2002'
    ) {
      throw new ReceiveStoreServiceError(
        'This lot already has an initial placement.',
        'RECEIVE_STORE_DUPLICATE_INITIAL_PLACEMENT',
        409,
      )
    }

    mapDatabaseError(error)
  }
}
