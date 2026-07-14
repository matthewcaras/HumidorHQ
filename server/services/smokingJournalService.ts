import {
  Prisma,
  PrismaClient,
  type CatalogCigar,
  type InventoryEvent,
  type SmokingJournalEntry,
  type StorageLocation,
  type StorageSubLocation,
} from '../../src/generated/prisma/client.ts'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import {
  decimalToMillionths,
  formatMillionths,
} from '../utils/inventoryAccounting.ts'

type DecimalValue = number | string | { toString(): string }

type SmokingJournalInput = {
  rating?: unknown
  notes?: unknown
  inventoryEventId?: unknown
  eventType?: unknown
  eventDate?: unknown
  quantity?: unknown
  lotId?: unknown
  fromStorageSubLocationId?: unknown
  sourceLocation?: unknown
  costPerCigarAtEvent?: unknown
  msrpPerCigarAtEvent?: unknown
  createdAt?: unknown
  updatedAt?: unknown
}

type CatalogCigarRecord = Pick<
  CatalogCigar,
  'id' | 'manufacturer' | 'series' | 'vitola' | 'wrapper' | 'isActive'
>

type StorageSubLocationRecord = Pick<
  StorageSubLocation,
  'id' | 'storageLocationId' | 'name' | 'kind' | 'isActive'
> & {
  storageLocation: Pick<StorageLocation, 'id' | 'name' | 'isActive'> | null
}

type SmokingJournalEntryRecord = Pick<
  SmokingJournalEntry,
  'id' | 'inventoryEventId' | 'rating' | 'notes' | 'createdAt' | 'updatedAt'
>

type SmokingJournalEventRecord = Pick<
  InventoryEvent,
  | 'id'
  | 'eventType'
  | 'quantity'
  | 'eventDate'
  | 'createdAt'
  | 'lotId'
  | 'costPerCigarAtEvent'
  | 'msrpPerCigarAtEvent'
> & {
  costPerCigarAtEvent: DecimalValue | null
  msrpPerCigarAtEvent: DecimalValue | null
  lot: {
    catalogCigar: CatalogCigarRecord | null
  } | null
  fromStorageSubLocation: StorageSubLocationRecord | null
  smokingJournalEntry: SmokingJournalEntryRecord | null
}

type SmokedJournalEventRecord = SmokingJournalEventRecord & {
  eventType: 'SMOKED'
}

type SmokingJournalEventFindUniqueArgs = {
  where: {
    id: number
  }
  include: ReturnType<typeof includeEventContext>
}

type SmokingJournalUpsertArgs = {
  where: {
    inventoryEventId: number
  }
  create: {
    inventoryEventId: number
    rating: number
    notes: string | null
  }
  update: {
    rating: number
    notes: string | null
  }
}

type SmokingJournalDeleteArgs = {
  where: {
    inventoryEventId: number
  }
}

type SmokingJournalTransactionClient = {
  inventoryEvent: {
    findUnique(args: SmokingJournalEventFindUniqueArgs): Promise<SmokingJournalEventRecord | null>
  }
  smokingJournalEntry: {
    upsert(args: SmokingJournalUpsertArgs): Promise<SmokingJournalEntryRecord>
    delete(args: SmokingJournalDeleteArgs): Promise<SmokingJournalEntryRecord>
  }
}

export type SmokingJournalPrismaClient = SmokingJournalTransactionClient & {
  $transaction<T>(fn: (tx: SmokingJournalTransactionClient) => Promise<T>): Promise<T>
}

export type SmokingJournalServiceErrorCode =
  | 'JOURNAL_VALIDATION_ERROR'
  | 'JOURNAL_EVENT_NOT_FOUND'
  | 'JOURNAL_EVENT_NOT_SMOKED'
  | 'JOURNAL_ENTRY_NOT_FOUND'
  | 'JOURNAL_INVALID_RATING'
  | 'JOURNAL_DATABASE_ERROR'
  | 'JOURNAL_UNEXPECTED_ERROR'

export class SmokingJournalServiceError extends Error {
  code: SmokingJournalServiceErrorCode
  statusCode: number

  constructor(message: string, code: SmokingJournalServiceErrorCode, statusCode = 400) {
    super(message)
    this.name = 'SmokingJournalServiceError'
    this.code = code
    this.statusCode = statusCode
  }
}

type SmokingJournalLocation = {
  storageLocationId: number
  storageLocationName: string
  storageLocationIsActive: boolean
  storageSubLocationId: number
  storageSubLocationName: string
  storageSubLocationKind: string
  storageSubLocationIsActive: boolean
  isArchived: boolean
}

type SmokingJournalResponse = {
  journalEntry: {
    id: number
    inventoryEventId: number
    rating: number
    notes: string | null
    createdAt: string
    updatedAt: string
  } | null
  inventoryEvent: {
    id: number
    eventType: 'SMOKED'
    quantity: number
    eventDate: string
    createdAt: string
    lotId: number
    catalogCigar: {
      id: number
      manufacturer: string
      series: string
      vitola: string
      wrapper: string | null
      isActive: boolean
    } | null
    sourceLocation: SmokingJournalLocation | null
    costPerCigarAtEvent: string | null
    msrpPerCigarAtEvent: string | null
  }
}

type SmokingJournalServiceOptions = {
  prisma?: SmokingJournalPrismaClient
}

const SAFE_DATABASE_MESSAGE = 'The Smoking Journal could not be loaded or saved.'
const SAFE_UNEXPECTED_MESSAGE = 'The Smoking Journal request could not be completed.'
const PROTECTED_BODY_FIELDS = [
  'inventoryEventId',
  'eventType',
  'eventDate',
  'quantity',
  'lotId',
  'fromStorageSubLocationId',
  'sourceLocation',
  'costPerCigarAtEvent',
  'msrpPerCigarAtEvent',
  'createdAt',
  'updatedAt',
]

let prismaSingleton: SmokingJournalPrismaClient | null = null

function getPrismaClient(): SmokingJournalPrismaClient {
  if (!prismaSingleton) {
    const adapter = new PrismaBetterSqlite3({
      url: process.env.DATABASE_URL || 'file:./prisma/humidorhq.db',
    })

    prismaSingleton = new PrismaClient({ adapter }) as unknown as SmokingJournalPrismaClient
  }

  return prismaSingleton
}

function includeEventContext() {
  return {
    lot: {
      include: {
        catalogCigar: true,
      },
    },
    fromStorageSubLocation: {
      include: {
        storageLocation: true,
      },
    },
    smokingJournalEntry: true,
  }
}

function databaseError(): never {
  throw new SmokingJournalServiceError(
    SAFE_DATABASE_MESSAGE,
    'JOURNAL_DATABASE_ERROR',
    500,
  )
}

function unexpectedError(): never {
  throw new SmokingJournalServiceError(
    SAFE_UNEXPECTED_MESSAGE,
    'JOURNAL_UNEXPECTED_ERROR',
    500,
  )
}

function isPrismaOperationalError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError ||
    error instanceof Prisma.PrismaClientUnknownRequestError ||
    error instanceof Prisma.PrismaClientInitializationError ||
    error instanceof Prisma.PrismaClientRustPanicError
  )
}

function mapSmokingJournalError(error: unknown): never {
  if (error instanceof SmokingJournalServiceError) {
    throw error
  }

  if (isPrismaOperationalError(error)) {
    databaseError()
  }

  unexpectedError()
}

function mapDeleteError(error: unknown): never {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2025'
  ) {
    throw new SmokingJournalServiceError(
      'Smoking Journal entry was not found.',
      'JOURNAL_ENTRY_NOT_FOUND',
      404,
    )
  }

  mapSmokingJournalError(error)
}

export function smokingJournalInventoryEventIdParam(value: string) {
  const id = Number(value)

  if (!Number.isInteger(id) || id < 1) {
    throw new SmokingJournalServiceError(
      'InventoryEvent id must be a positive integer.',
      'JOURNAL_VALIDATION_ERROR',
      400,
    )
  }

  return id
}

function isSmokedEvent(event: SmokingJournalEventRecord): event is SmokedJournalEventRecord {
  return event.eventType === 'SMOKED'
}

function validateEvent(event: SmokingJournalEventRecord | null): SmokedJournalEventRecord {
  if (!event) {
    throw new SmokingJournalServiceError(
      'Smoking event was not found.',
      'JOURNAL_EVENT_NOT_FOUND',
      404,
    )
  }

  if (!isSmokedEvent(event)) {
    throw new SmokingJournalServiceError(
      'Smoking Journal entries can only be attached to smoked events.',
      'JOURNAL_EVENT_NOT_SMOKED',
      409,
    )
  }

  return event
}

function parseRating(value: unknown) {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new SmokingJournalServiceError(
      'rating must be a whole number from 1 to 10.',
      'JOURNAL_INVALID_RATING',
      400,
    )
  }

  if (value < 1 || value > 10) {
    throw new SmokingJournalServiceError(
      'rating must be from 1 to 10.',
      'JOURNAL_INVALID_RATING',
      400,
    )
  }

  return value
}

function parseNotes(value: unknown) {
  if (value === undefined) {
    return null
  }

  if (typeof value !== 'string') {
    throw new SmokingJournalServiceError(
      'notes must be a string.',
      'JOURNAL_VALIDATION_ERROR',
      400,
    )
  }

  const trimmed = value.trim()

  if (!trimmed) {
    return null
  }

  if (trimmed.length > 2000) {
    throw new SmokingJournalServiceError(
      'notes must be 2000 characters or fewer.',
      'JOURNAL_VALIDATION_ERROR',
      400,
    )
  }

  return trimmed
}

function parseSmokingJournalInput(input: SmokingJournalInput) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new SmokingJournalServiceError(
      'Smoking Journal request body must be an object.',
      'JOURNAL_VALIDATION_ERROR',
      400,
    )
  }

  for (const field of PROTECTED_BODY_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(input, field)) {
      throw new SmokingJournalServiceError(
        `${field} cannot be supplied in the request body.`,
        'JOURNAL_VALIDATION_ERROR',
        400,
      )
    }
  }

  for (const field of Object.keys(input)) {
    if (field !== 'rating' && field !== 'notes') {
      throw new SmokingJournalServiceError(
        'Only rating and notes may be supplied.',
        'JOURNAL_VALIDATION_ERROR',
        400,
      )
    }
  }

  return {
    rating: parseRating(input.rating),
    notes: parseNotes(input.notes),
  }
}

function findEvent(
  prisma: SmokingJournalTransactionClient,
  inventoryEventId: number,
) {
  return prisma.inventoryEvent.findUnique({
    where: {
      id: inventoryEventId,
    },
    include: includeEventContext(),
  })
}

function catalogCigarPublic(catalogCigar: CatalogCigarRecord | null) {
  if (!catalogCigar) {
    return null
  }

  return {
    id: catalogCigar.id,
    manufacturer: catalogCigar.manufacturer,
    series: catalogCigar.series,
    vitola: catalogCigar.vitola,
    wrapper: catalogCigar.wrapper,
    isActive: catalogCigar.isActive,
  }
}

function locationSnapshot(source: StorageSubLocationRecord | null): SmokingJournalLocation | null {
  if (!source || !source.storageLocation) {
    return null
  }

  return {
    storageLocationId: source.storageLocation.id,
    storageLocationName: source.storageLocation.name,
    storageLocationIsActive: source.storageLocation.isActive,
    storageSubLocationId: source.id,
    storageSubLocationName: source.name,
    storageSubLocationKind: source.kind,
    storageSubLocationIsActive: source.isActive,
    isArchived: !source.storageLocation.isActive || !source.isActive,
  }
}

function formatSnapshot(value: DecimalValue | null) {
  if (value === null) {
    return null
  }

  const millionths = decimalToMillionths(value)

  if (millionths === null) {
    unexpectedError()
  }

  return formatMillionths(millionths)
}

function journalEntryPublic(entry: SmokingJournalEntryRecord | null) {
  if (!entry) {
    return null
  }

  return {
    id: entry.id,
    inventoryEventId: entry.inventoryEventId,
    rating: entry.rating,
    notes: entry.notes,
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
  }
}

function buildResponse(
  event: SmokedJournalEventRecord,
  journalEntry: SmokingJournalEntryRecord | null,
): SmokingJournalResponse {
  return {
    journalEntry: journalEntryPublic(journalEntry),
    inventoryEvent: {
      id: event.id,
      eventType: 'SMOKED',
      quantity: event.quantity,
      eventDate: event.eventDate.toISOString(),
      createdAt: event.createdAt.toISOString(),
      lotId: event.lotId,
      catalogCigar: catalogCigarPublic(event.lot?.catalogCigar ?? null),
      sourceLocation: locationSnapshot(event.fromStorageSubLocation),
      costPerCigarAtEvent: formatSnapshot(event.costPerCigarAtEvent),
      msrpPerCigarAtEvent: formatSnapshot(event.msrpPerCigarAtEvent),
    },
  }
}

export async function getSmokingJournal(
  inventoryEventId: number,
  options: SmokingJournalServiceOptions = {},
) {
  const prisma = options.prisma ?? getPrismaClient()

  try {
    const event = validateEvent(await findEvent(prisma, inventoryEventId))

    return buildResponse(event, event.smokingJournalEntry)
  } catch (error) {
    mapSmokingJournalError(error)
  }
}

export async function upsertSmokingJournal(
  inventoryEventId: number,
  input: SmokingJournalInput,
  options: SmokingJournalServiceOptions = {},
) {
  const prisma = options.prisma ?? getPrismaClient()
  const data = parseSmokingJournalInput(input)

  try {
    return await prisma.$transaction(async (tx) => {
      const event = validateEvent(await findEvent(tx, inventoryEventId))
      const journalEntry = await tx.smokingJournalEntry.upsert({
        where: {
          inventoryEventId,
        },
        create: {
          inventoryEventId,
          rating: data.rating,
          notes: data.notes,
        },
        update: {
          rating: data.rating,
          notes: data.notes,
        },
      })

      return buildResponse(event, journalEntry)
    })
  } catch (error) {
    mapSmokingJournalError(error)
  }
}

export async function deleteSmokingJournal(
  inventoryEventId: number,
  options: SmokingJournalServiceOptions = {},
) {
  const prisma = options.prisma ?? getPrismaClient()

  try {
    return await prisma.$transaction(async (tx) => {
      const event = validateEvent(await findEvent(tx, inventoryEventId))

      if (!event.smokingJournalEntry) {
        throw new SmokingJournalServiceError(
          'Smoking Journal entry was not found.',
          'JOURNAL_ENTRY_NOT_FOUND',
          404,
        )
      }

      await tx.smokingJournalEntry.delete({
        where: {
          inventoryEventId,
        },
      })

      return buildResponse(event, null)
    })
  } catch (error) {
    mapDeleteError(error)
  }
}
