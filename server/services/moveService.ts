import {
  Prisma,
  PrismaClient,
  type CatalogCigar,
  type InventoryEvent,
  type Lot,
  type LotLocationBalance,
  type StorageLocation,
  type StorageSubLocation,
} from '../../src/generated/prisma/client.ts'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'

type MoveInput = {
  fromStorageSubLocationId?: unknown
  toStorageSubLocationId?: unknown
  quantity?: unknown
  eventDate?: unknown
  notes?: unknown
}

type StorageSubLocationWithLocation = StorageSubLocation & {
  storageLocation: StorageLocation | null
}

type LotWithBalances = Lot & {
  catalogCigar: CatalogCigar | null
  locationBalances: LotLocationBalance[]
}

type LocationSnapshot = {
  storageLocationId: number
  storageLocationName: string
  storageLocationIsActive: boolean
  storageSubLocationId: number
  storageSubLocationName: string
  storageSubLocationKind: string
  storageSubLocationIsActive: boolean
}

type MoveResult = {
  lot: LotWithBalances
  inventoryEvent: InventoryEvent
  sourceBalance: LotLocationBalance | null
  destinationBalance: LotLocationBalance
  balances: LotLocationBalance[]
  totalCurrentQuantity: number
  sourceLocation: LocationSnapshot
  destinationLocation: LocationSnapshot
}

export type MoveServiceErrorCode =
  | 'MOVE_VALIDATION_ERROR'
  | 'MOVE_LOT_NOT_FOUND'
  | 'MOVE_SOURCE_NOT_FOUND'
  | 'MOVE_DESTINATION_NOT_FOUND'
  | 'MOVE_SOURCE_BALANCE_NOT_FOUND'
  | 'MOVE_INSUFFICIENT_SOURCE_QUANTITY'
  | 'MOVE_SAME_SOURCE_AND_DESTINATION'
  | 'MOVE_INACTIVE_DESTINATION'
  | 'MOVE_BALANCE_MISMATCH'
  | 'MOVE_DATABASE_ERROR'

export class MoveServiceError extends Error {
  code: MoveServiceErrorCode
  statusCode: number

  constructor(message: string, code: MoveServiceErrorCode, statusCode = 400) {
    super(message)
    this.name = 'MoveServiceError'
    this.code = code
    this.statusCode = statusCode
  }
}

let prismaSingleton: PrismaClient | null = null

function getPrismaClient(): PrismaClient {
  if (!prismaSingleton) {
    const adapter = new PrismaBetterSqlite3({
      url: process.env.DATABASE_URL || 'file:./prisma/humidorhq.db',
    })

    prismaSingleton = new PrismaClient({ adapter })
  }

  return prismaSingleton
}

function parsePositiveInteger(value: unknown, fieldName: string) {
  const numberValue = Number(value)

  if (!Number.isInteger(numberValue) || numberValue < 1) {
    throw new MoveServiceError(
      `${fieldName} must be a positive whole number.`,
      'MOVE_VALIDATION_ERROR',
      400,
    )
  }

  return numberValue
}

function parseCalendarDate(value: unknown, fieldName: string) {
  if (value === undefined || value === null || value === '') {
    throw new MoveServiceError(`${fieldName} is required.`, 'MOVE_VALIDATION_ERROR', 400)
  }

  if (typeof value !== 'string') {
    throw new MoveServiceError(
      `${fieldName} must be a valid date.`,
      'MOVE_VALIDATION_ERROR',
      400,
    )
  }

  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) {
    throw new MoveServiceError(
      `${fieldName} must be a valid date.`,
      'MOVE_VALIDATION_ERROR',
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
    throw new MoveServiceError(
      `${fieldName} must be a valid date.`,
      'MOVE_VALIDATION_ERROR',
      400,
    )
  }

  return date
}

function calendarDateKey(date: Date) {
  return date.toISOString().slice(0, 10)
}

function currentUtcCalendarDateKey() {
  return new Date().toISOString().slice(0, 10)
}

function parseNotes(value: unknown) {
  if (value === undefined || value === null) {
    return null
  }

  if (typeof value !== 'string') {
    throw new MoveServiceError('notes must be text.', 'MOVE_VALIDATION_ERROR', 400)
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function validateEventDate(eventDate: Date, lot: Lot) {
  const eventDateKey = calendarDateKey(eventDate)

  if (eventDateKey > currentUtcCalendarDateKey()) {
    throw new MoveServiceError(
      'eventDate cannot be in the future.',
      'MOVE_VALIDATION_ERROR',
      400,
    )
  }

  const earliestDate = lot.receivedDateSnapshot ?? lot.purchaseDateSnapshot ?? lot.purchaseDate
  if (earliestDate && eventDateKey < calendarDateKey(earliestDate)) {
    throw new MoveServiceError(
      'eventDate cannot be earlier than the lot received or purchase date.',
      'MOVE_VALIDATION_ERROR',
      400,
    )
  }
}

function positiveBalanceSum(balances: LotLocationBalance[]) {
  return balances.reduce(
    (total, balance) => total + (balance.quantity > 0 ? balance.quantity : 0),
    0,
  )
}

function assertBalancesReconcile(lot: Lot, balances: LotLocationBalance[]) {
  if (
    typeof lot.currentQuantity !== 'number' ||
    !Number.isInteger(lot.currentQuantity) ||
    lot.currentQuantity < 0
  ) {
    throw new MoveServiceError(
      'Lot current quantity does not reconcile with location balances.',
      'MOVE_BALANCE_MISMATCH',
      409,
    )
  }

  const total = positiveBalanceSum(balances)
  if (total !== lot.currentQuantity) {
    throw new MoveServiceError(
      'Lot current quantity does not reconcile with location balances.',
      'MOVE_BALANCE_MISMATCH',
      409,
    )
  }

  return total
}

function locationSnapshot(subLocation: StorageSubLocationWithLocation): LocationSnapshot {
  if (!subLocation.storageLocation) {
    throw new MoveServiceError(
      'Storage sub-location is missing its parent humidor.',
      'MOVE_DATABASE_ERROR',
      500,
    )
  }

  return {
    storageLocationId: subLocation.storageLocation.id,
    storageLocationName: subLocation.storageLocation.name,
    storageLocationIsActive: subLocation.storageLocation.isActive,
    storageSubLocationId: subLocation.id,
    storageSubLocationName: subLocation.name,
    storageSubLocationKind: subLocation.kind,
    storageSubLocationIsActive: subLocation.isActive,
  }
}

function effectiveCostPerCigar(lot: Lot) {
  return lot.costPerCigarSnapshot ?? lot.allocatedCostPerCigar ?? lot.actualCostPerCigar ?? null
}

function effectiveMsrpPerCigar(lot: Lot) {
  return lot.msrpPerCigarSnapshot ?? lot.msrpPerCigar ?? null
}

function isPrismaKnownError(error: unknown): error is Prisma.PrismaClientKnownRequestError {
  return error instanceof Prisma.PrismaClientKnownRequestError
}

function mapDatabaseError(error: unknown): never {
  if (error instanceof MoveServiceError) {
    throw error
  }

  if (isPrismaKnownError(error)) {
    throw new MoveServiceError(
      'The Move request could not be completed.',
      'MOVE_DATABASE_ERROR',
      500,
    )
  }

  throw new MoveServiceError(
    'The Move request could not be completed.',
    'MOVE_DATABASE_ERROR',
    500,
  )
}

export function moveLotIdParam(value: string) {
  const id = Number(value)

  if (!Number.isInteger(id) || id < 1) {
    throw new MoveServiceError(
      'Lot id must be a positive integer.',
      'MOVE_VALIDATION_ERROR',
      400,
    )
  }

  return id
}

async function throwConditionalSourceWriteError(
  tx: Prisma.TransactionClient,
  lotId: number,
  fromStorageSubLocationId: number,
  requestedQuantity: number,
): Promise<never> {
  const currentSourceBalance = await tx.lotLocationBalance.findUnique({
    where: {
      lotId_storageSubLocationId: {
        lotId,
        storageSubLocationId: fromStorageSubLocationId,
      },
    },
  })

  if (!currentSourceBalance || currentSourceBalance.quantity <= 0) {
    throw new MoveServiceError(
      'Source balance was not found for this lot.',
      'MOVE_SOURCE_BALANCE_NOT_FOUND',
      409,
    )
  }

  if (currentSourceBalance.quantity < requestedQuantity) {
    throw new MoveServiceError(
      'Move quantity exceeds the source balance.',
      'MOVE_INSUFFICIENT_SOURCE_QUANTITY',
      409,
    )
  }

  throw new MoveServiceError(
    'Source balance changed during the Move request.',
    'MOVE_BALANCE_MISMATCH',
    409,
  )
}

export async function moveLot(lotId: number, input: MoveInput): Promise<MoveResult> {
  const prisma = getPrismaClient()
  const fromStorageSubLocationId = parsePositiveInteger(
    input.fromStorageSubLocationId,
    'fromStorageSubLocationId',
  )
  const toStorageSubLocationId = parsePositiveInteger(
    input.toStorageSubLocationId,
    'toStorageSubLocationId',
  )
  const quantity = parsePositiveInteger(input.quantity, 'quantity')
  const eventDate = parseCalendarDate(input.eventDate, 'eventDate')
  const notes = parseNotes(input.notes)

  if (fromStorageSubLocationId === toStorageSubLocationId) {
    throw new MoveServiceError(
      'Source and destination sections must be different.',
      'MOVE_SAME_SOURCE_AND_DESTINATION',
      400,
    )
  }

  try {
    return await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const lot = await tx.lot.findUnique({
        where: { id: lotId },
        include: {
          catalogCigar: true,
          locationBalances: true,
        },
      })

      if (!lot) {
        throw new MoveServiceError('Lot was not found.', 'MOVE_LOT_NOT_FOUND', 404)
      }

      validateEventDate(eventDate, lot)

      const [source, destination] = await Promise.all([
        tx.storageSubLocation.findUnique({
          where: { id: fromStorageSubLocationId },
          include: { storageLocation: true },
        }),
        tx.storageSubLocation.findUnique({
          where: { id: toStorageSubLocationId },
          include: { storageLocation: true },
        }),
      ])

      if (!source) {
        throw new MoveServiceError(
          'Source sub-location was not found.',
          'MOVE_SOURCE_NOT_FOUND',
          404,
        )
      }

      if (!destination) {
        throw new MoveServiceError(
          'Destination sub-location was not found.',
          'MOVE_DESTINATION_NOT_FOUND',
          404,
        )
      }

      if (!destination.isActive || !destination.storageLocation?.isActive) {
        throw new MoveServiceError(
          'Destination humidor and section must be active.',
          'MOVE_INACTIVE_DESTINATION',
          409,
        )
      }

      const sourceBalance = lot.locationBalances.find(
        (balance) => balance.storageSubLocationId === fromStorageSubLocationId,
      )

      if (!sourceBalance || sourceBalance.quantity <= 0) {
        throw new MoveServiceError(
          'Source balance was not found for this lot.',
          'MOVE_SOURCE_BALANCE_NOT_FOUND',
          409,
        )
      }

      if (quantity > sourceBalance.quantity) {
        throw new MoveServiceError(
          'Move quantity exceeds the source balance.',
          'MOVE_INSUFFICIENT_SOURCE_QUANTITY',
          409,
        )
      }

      assertBalancesReconcile(lot, lot.locationBalances)

      const originalSourceQuantity = sourceBalance.quantity
      const nextSourceQuantity = originalSourceQuantity - quantity
      let finalSourceBalance: LotLocationBalance | null = null

      if (nextSourceQuantity > 0) {
        const sourceUpdate = await tx.lotLocationBalance.updateMany({
          where: {
            id: sourceBalance.id,
            lotId,
            storageSubLocationId: fromStorageSubLocationId,
            quantity: originalSourceQuantity,
          },
          data: { quantity: nextSourceQuantity },
        })

        if (sourceUpdate.count !== 1) {
          await throwConditionalSourceWriteError(
            tx,
            lotId,
            fromStorageSubLocationId,
            quantity,
          )
        }

        finalSourceBalance = await tx.lotLocationBalance.findUnique({
          where: { id: sourceBalance.id },
        })

        if (!finalSourceBalance) {
          throw new MoveServiceError(
            'Source balance changed during the Move request.',
            'MOVE_BALANCE_MISMATCH',
            409,
          )
        }
      } else {
        const sourceDelete = await tx.lotLocationBalance.deleteMany({
          where: {
            id: sourceBalance.id,
            lotId,
            storageSubLocationId: fromStorageSubLocationId,
            quantity: originalSourceQuantity,
          },
        })

        if (sourceDelete.count !== 1) {
          await throwConditionalSourceWriteError(
            tx,
            lotId,
            fromStorageSubLocationId,
            quantity,
          )
        }
      }

      const destinationBalance = await tx.lotLocationBalance.upsert({
        where: {
          lotId_storageSubLocationId: {
            lotId,
            storageSubLocationId: toStorageSubLocationId,
          },
        },
        update: {
          quantity: {
            increment: quantity,
          },
        },
        create: {
          lotId,
          storageSubLocationId: toStorageSubLocationId,
          quantity,
        },
      })

      const inventoryEvent = await tx.inventoryEvent.create({
        data: {
          lotId,
          eventType: 'MOVE',
          quantity,
          eventDate,
          fromStorageSubLocationId,
          toStorageSubLocationId,
          costPerCigarAtEvent: effectiveCostPerCigar(lot),
          msrpPerCigarAtEvent: effectiveMsrpPerCigar(lot),
          notes,
        },
      })

      const [refreshedLot, finalBalances] = await Promise.all([
        tx.lot.findUnique({
          where: { id: lotId },
          include: {
            catalogCigar: true,
            locationBalances: {
              orderBy: [{ storageSubLocationId: 'asc' }],
            },
          },
        }),
        tx.lotLocationBalance.findMany({
          where: {
            lotId,
            quantity: {
              gt: 0,
            },
          },
          orderBy: [{ storageSubLocationId: 'asc' }],
        }),
      ])

      if (!refreshedLot) {
        throw new MoveServiceError('Lot was not found.', 'MOVE_LOT_NOT_FOUND', 404)
      }

      const totalCurrentQuantity = assertBalancesReconcile(refreshedLot, finalBalances)

      return {
        lot: refreshedLot,
        inventoryEvent,
        sourceBalance: finalSourceBalance,
        destinationBalance,
        balances: finalBalances,
        totalCurrentQuantity,
        sourceLocation: locationSnapshot(source),
        destinationLocation: locationSnapshot(destination),
      }
    })
  } catch (error) {
    mapDatabaseError(error)
  }
}
