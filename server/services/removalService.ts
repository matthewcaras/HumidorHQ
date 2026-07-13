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

type RemovalInput = {
  fromStorageSubLocationId?: unknown
  quantity?: unknown
  removalType?: unknown
  eventDate?: unknown
  notes?: unknown
}

type RemovalType = 'SMOKED' | 'GIFTED' | 'DISCARDED'

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

type RemovalResult = {
  lot: LotWithBalances
  inventoryEvent: InventoryEvent
  sourceBalance: LotLocationBalance | null
  balances: LotLocationBalance[]
  totalCurrentQuantity: number
  sourceLocation: LocationSnapshot
  removalType: RemovalType
  placementDepleted: boolean
  lotDepleted: boolean
}

export type RemovalServiceErrorCode =
  | 'REMOVAL_VALIDATION_ERROR'
  | 'REMOVAL_INVALID_TYPE'
  | 'REMOVAL_LOT_NOT_FOUND'
  | 'REMOVAL_SOURCE_NOT_FOUND'
  | 'REMOVAL_SOURCE_BALANCE_NOT_FOUND'
  | 'REMOVAL_INSUFFICIENT_SOURCE_QUANTITY'
  | 'REMOVAL_INVALID_DATE'
  | 'REMOVAL_BALANCE_MISMATCH'
  | 'REMOVAL_STALE_SOURCE_BALANCE'
  | 'REMOVAL_STALE_LOT_QUANTITY'
  | 'REMOVAL_DATABASE_ERROR'

export class RemovalServiceError extends Error {
  code: RemovalServiceErrorCode
  statusCode: number

  constructor(message: string, code: RemovalServiceErrorCode, statusCode = 400) {
    super(message)
    this.name = 'RemovalServiceError'
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
    throw new RemovalServiceError(
      `${fieldName} must be a positive whole number.`,
      'REMOVAL_VALIDATION_ERROR',
      400,
    )
  }

  return numberValue
}

function parseRemovalType(value: unknown): RemovalType {
  if (value === 'SMOKED' || value === 'GIFTED' || value === 'DISCARDED') {
    return value
  }

  throw new RemovalServiceError(
    'removalType must be SMOKED, GIFTED, or DISCARDED.',
    'REMOVAL_INVALID_TYPE',
    400,
  )
}

function parseCalendarDate(value: unknown, fieldName: string) {
  if (value === undefined || value === null || value === '') {
    throw new RemovalServiceError(`${fieldName} is required.`, 'REMOVAL_INVALID_DATE', 400)
  }

  if (typeof value !== 'string') {
    throw new RemovalServiceError(
      `${fieldName} must be a valid date.`,
      'REMOVAL_INVALID_DATE',
      400,
    )
  }

  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) {
    throw new RemovalServiceError(
      `${fieldName} must be a valid date.`,
      'REMOVAL_INVALID_DATE',
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
    throw new RemovalServiceError(
      `${fieldName} must be a valid date.`,
      'REMOVAL_INVALID_DATE',
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
    throw new RemovalServiceError('notes must be text.', 'REMOVAL_VALIDATION_ERROR', 400)
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function validateEventDate(eventDate: Date, lot: Lot) {
  const eventDateKey = calendarDateKey(eventDate)

  if (eventDateKey > currentUtcCalendarDateKey()) {
    throw new RemovalServiceError(
      'eventDate cannot be in the future.',
      'REMOVAL_INVALID_DATE',
      400,
    )
  }

  const earliestDate = lot.receivedDateSnapshot ?? lot.purchaseDateSnapshot ?? lot.purchaseDate
  if (earliestDate && eventDateKey < calendarDateKey(earliestDate)) {
    throw new RemovalServiceError(
      'eventDate cannot be earlier than the lot received or purchase date.',
      'REMOVAL_INVALID_DATE',
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
    lot.currentQuantity < 0 ||
    typeof lot.quantityRemaining !== 'number' ||
    !Number.isInteger(lot.quantityRemaining) ||
    lot.quantityRemaining < 0 ||
    lot.quantityRemaining !== lot.currentQuantity
  ) {
    throw new RemovalServiceError(
      'Lot remaining quantity does not reconcile with current quantity.',
      'REMOVAL_BALANCE_MISMATCH',
      409,
    )
  }

  const total = positiveBalanceSum(balances)
  if (total !== lot.currentQuantity) {
    throw new RemovalServiceError(
      'Lot current quantity does not reconcile with location balances.',
      'REMOVAL_BALANCE_MISMATCH',
      409,
    )
  }

  return total
}

function locationSnapshot(subLocation: StorageSubLocationWithLocation): LocationSnapshot {
  if (!subLocation.storageLocation) {
    throw new RemovalServiceError(
      'Storage sub-location is missing its parent humidor.',
      'REMOVAL_DATABASE_ERROR',
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
  if (error instanceof RemovalServiceError) {
    throw error
  }

  if (isPrismaKnownError(error)) {
    throw new RemovalServiceError(
      'The removal request could not be completed.',
      'REMOVAL_DATABASE_ERROR',
      500,
    )
  }

  throw new RemovalServiceError(
    'The removal request could not be completed.',
    'REMOVAL_DATABASE_ERROR',
    500,
  )
}

export function removalLotIdParam(value: string) {
  const id = Number(value)

  if (!Number.isInteger(id) || id < 1) {
    throw new RemovalServiceError(
      'Lot id must be a positive integer.',
      'REMOVAL_VALIDATION_ERROR',
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
    throw new RemovalServiceError(
      'Source balance was not found for this lot.',
      'REMOVAL_SOURCE_BALANCE_NOT_FOUND',
      409,
    )
  }

  if (currentSourceBalance.quantity < requestedQuantity) {
    throw new RemovalServiceError(
      'Removal quantity exceeds the source balance.',
      'REMOVAL_INSUFFICIENT_SOURCE_QUANTITY',
      409,
    )
  }

  throw new RemovalServiceError(
    'Source balance changed during the removal request.',
    'REMOVAL_STALE_SOURCE_BALANCE',
    409,
  )
}

async function throwConditionalLotWriteError(
  tx: Prisma.TransactionClient,
  lotId: number,
): Promise<never> {
  const currentLot = await tx.lot.findUnique({
    where: { id: lotId },
  })

  if (!currentLot) {
    throw new RemovalServiceError('Lot was not found.', 'REMOVAL_LOT_NOT_FOUND', 404)
  }

  throw new RemovalServiceError(
    'Lot quantity changed during the removal request.',
    'REMOVAL_STALE_LOT_QUANTITY',
    409,
  )
}

export async function removeFromLot(
  lotId: number,
  input: RemovalInput,
): Promise<RemovalResult> {
  const prisma = getPrismaClient()
  const fromStorageSubLocationId = parsePositiveInteger(
    input.fromStorageSubLocationId,
    'fromStorageSubLocationId',
  )
  const quantity = parsePositiveInteger(input.quantity, 'quantity')
  const removalType = parseRemovalType(input.removalType)
  const eventDate = parseCalendarDate(input.eventDate, 'eventDate')
  const notes = parseNotes(input.notes)

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
        throw new RemovalServiceError('Lot was not found.', 'REMOVAL_LOT_NOT_FOUND', 404)
      }

      validateEventDate(eventDate, lot)

      const source = await tx.storageSubLocation.findUnique({
        where: { id: fromStorageSubLocationId },
        include: { storageLocation: true },
      })

      if (!source) {
        throw new RemovalServiceError(
          'Source sub-location was not found.',
          'REMOVAL_SOURCE_NOT_FOUND',
          404,
        )
      }

      const sourceBalance = lot.locationBalances.find(
        (balance) => balance.storageSubLocationId === fromStorageSubLocationId,
      )

      if (!sourceBalance || sourceBalance.quantity <= 0) {
        throw new RemovalServiceError(
          'Source balance was not found for this lot.',
          'REMOVAL_SOURCE_BALANCE_NOT_FOUND',
          409,
        )
      }

      if (quantity > sourceBalance.quantity) {
        throw new RemovalServiceError(
          'Removal quantity exceeds the source balance.',
          'REMOVAL_INSUFFICIENT_SOURCE_QUANTITY',
          409,
        )
      }

      assertBalancesReconcile(lot, lot.locationBalances)

      const originalSourceQuantity = sourceBalance.quantity
      const originalCurrentQuantity = lot.currentQuantity
      const originalQuantityRemaining = lot.quantityRemaining
      const nextSourceQuantity = originalSourceQuantity - quantity
      const nextCurrentQuantity = originalCurrentQuantity - quantity
      const nextQuantityRemaining = originalQuantityRemaining - quantity

      if (nextCurrentQuantity < 0 || nextQuantityRemaining < 0) {
        throw new RemovalServiceError(
          'Removal quantity exceeds the lot current quantity.',
          'REMOVAL_INSUFFICIENT_SOURCE_QUANTITY',
          409,
        )
      }

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
          throw new RemovalServiceError(
            'Source balance changed during the removal request.',
            'REMOVAL_STALE_SOURCE_BALANCE',
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

      const lotUpdate = await tx.lot.updateMany({
        where: {
          id: lotId,
          currentQuantity: originalCurrentQuantity,
          quantityRemaining: originalQuantityRemaining,
        },
        data: {
          currentQuantity: nextCurrentQuantity,
          quantityRemaining: nextQuantityRemaining,
        },
      })

      if (lotUpdate.count !== 1) {
        await throwConditionalLotWriteError(tx, lotId)
      }

      const inventoryEvent = await tx.inventoryEvent.create({
        data: {
          lotId,
          eventType: removalType,
          quantity,
          eventDate,
          fromStorageSubLocationId,
          toStorageSubLocationId: null,
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
              where: {
                quantity: {
                  gt: 0,
                },
              },
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
        throw new RemovalServiceError('Lot was not found.', 'REMOVAL_LOT_NOT_FOUND', 404)
      }

      const totalCurrentQuantity = assertBalancesReconcile(refreshedLot, finalBalances)

      return {
        lot: refreshedLot,
        inventoryEvent,
        sourceBalance: finalSourceBalance,
        balances: finalBalances,
        totalCurrentQuantity,
        sourceLocation: locationSnapshot(source),
        removalType,
        placementDepleted: finalSourceBalance === null,
        lotDepleted: totalCurrentQuantity === 0,
      }
    })
  } catch (error) {
    mapDatabaseError(error)
  }
}
