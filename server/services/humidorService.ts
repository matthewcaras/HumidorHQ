import { PrismaClient } from '../../src/generated/prisma/client.ts'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'

type StorageOrganizationType = 'GENERAL' | 'DRAWERS' | 'SHELVES' | 'CUSTOM'
type SupportedStorageOrganizationType = Exclude<StorageOrganizationType, 'CUSTOM'>
type StorageSubLocationKind = 'GENERAL' | 'DRAWER' | 'SHELF' | 'CUSTOM'

type HumidorInput = {
  name?: unknown
  capacity?: unknown
  organizationType?: unknown
  sectionCount?: unknown
  hasShelves?: unknown
  shelfCount?: unknown
}

type GeneratedSubLocation = {
  name: string
  kind: StorageSubLocationKind
  displayOrder: number
}

type SubLocationWithBalances = {
  id: number
  name: string
  kind: StorageSubLocationKind
  isActive: boolean
  lotLocationBalances: { quantity: number }[]
}

export type HumidorServiceErrorCode =
  | 'HUMIDOR_VALIDATION_ERROR'
  | 'HUMIDOR_CUSTOM_UNSUPPORTED'
  | 'HUMIDOR_NOT_FOUND'
  | 'HUMIDOR_INVENTORY_CONFLICT'
  | 'HUMIDOR_DATABASE_ERROR'

export class HumidorServiceError extends Error {
  code: HumidorServiceErrorCode
  statusCode: number

  constructor(message: string, code: HumidorServiceErrorCode, statusCode = 400) {
    super(message)
    this.name = 'HumidorServiceError'
    this.code = code
    this.statusCode = statusCode
  }
}

let prismaSingleton: PrismaClient | null = null

function getPrismaClient() {
  if (!prismaSingleton) {
    const adapter = new PrismaBetterSqlite3({
      url: process.env.DATABASE_URL || 'file:./prisma/humidorhq.db',
    })

    prismaSingleton = new PrismaClient({ adapter })
  }

  return prismaSingleton
}

function requiredName(value: unknown) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new HumidorServiceError('Humidor name is required.', 'HUMIDOR_VALIDATION_ERROR', 400)
  }

  return value.trim()
}

function optionalWholeNumber(value: unknown, fieldName: string) {
  if (value === undefined || value === null || value === '') {
    return null
  }

  const numberValue = Number(value)

  if (!Number.isInteger(numberValue)) {
    throw new HumidorServiceError(`${fieldName} must be a whole number.`, 'HUMIDOR_VALIDATION_ERROR', 400)
  }

  return numberValue
}

function optionalCapacity(value: unknown) {
  const capacity = optionalWholeNumber(value, 'capacity')

  if (capacity !== null && capacity < 0) {
    throw new HumidorServiceError('capacity must be a nonnegative whole number.', 'HUMIDOR_VALIDATION_ERROR', 400)
  }

  return capacity
}

function parseBoolean(value: unknown) {
  return value === true || value === 'true'
}

function parseOrganizationType(input: HumidorInput): StorageOrganizationType {
  if (typeof input.organizationType === 'string' && input.organizationType.trim().length > 0) {
    const organizationType = input.organizationType.trim().toUpperCase()

    if (
      organizationType === 'GENERAL' ||
      organizationType === 'DRAWERS' ||
      organizationType === 'SHELVES' ||
      organizationType === 'CUSTOM'
    ) {
      return organizationType
    }

    throw new HumidorServiceError(
      'organizationType must be GENERAL, DRAWERS, SHELVES, or CUSTOM.',
      'HUMIDOR_VALIDATION_ERROR',
      400,
    )
  }

  return parseBoolean(input.hasShelves) ? 'SHELVES' : 'GENERAL'
}

function parseSectionCount(input: HumidorInput, organizationType: SupportedStorageOrganizationType) {
  const rawCount = input.sectionCount !== undefined ? input.sectionCount : input.shelfCount

  if (organizationType === 'GENERAL') {
    return null
  }

  const sectionCount = optionalWholeNumber(rawCount, 'sectionCount')

  if (sectionCount === null || sectionCount < 1) {
    throw new HumidorServiceError(
      'sectionCount must be a positive whole number for DRAWERS or SHELVES.',
      'HUMIDOR_VALIDATION_ERROR',
      400,
    )
  }

  return sectionCount
}

function normalizeInput(input: HumidorInput) {
  const organizationType = parseOrganizationType(input)

  if (organizationType === 'CUSTOM') {
    throw new HumidorServiceError(
      'CUSTOM humidor organization is not supported yet.',
      'HUMIDOR_CUSTOM_UNSUPPORTED',
      400,
    )
  }

  const sectionCount = parseSectionCount(input, organizationType)

  return {
    name: requiredName(input.name),
    capacity: optionalCapacity(input.capacity),
    organizationType,
    sectionCount,
    hasShelves: organizationType === 'SHELVES',
    shelfCount: organizationType === 'SHELVES' ? sectionCount : null,
  }
}

function generatedSubLocations(
  organizationType: SupportedStorageOrganizationType,
  sectionCount: number | null,
): GeneratedSubLocation[] {
  if (organizationType === 'GENERAL') {
    return [{ name: 'General', kind: 'GENERAL', displayOrder: 0 }]
  }

  const count = sectionCount ?? 0
  const prefix = organizationType === 'DRAWERS' ? 'Drawer' : 'Shelf'
  const kind = organizationType === 'DRAWERS' ? 'DRAWER' : 'SHELF'

  return Array.from({ length: count }, (_, index) => ({
    name: `${prefix} ${index + 1}`,
    kind,
    displayOrder: index,
  }))
}

function hasPositiveBalance(subLocation: SubLocationWithBalances) {
  return subLocation.lotLocationBalances.some((balance) => balance.quantity > 0)
}

function findMatchingSubLocation(
  subLocations: SubLocationWithBalances[],
  generated: GeneratedSubLocation,
) {
  return subLocations.find(
    (subLocation) => subLocation.name === generated.name && subLocation.kind === generated.kind,
  )
}

function mapDatabaseError(error: unknown): never {
  if (error instanceof HumidorServiceError) {
    throw error
  }

  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'P2025'
  ) {
    throw new HumidorServiceError('Humidor was not found.', 'HUMIDOR_NOT_FOUND', 404)
  }

  throw new HumidorServiceError(
    'The humidor operation could not be completed.',
    'HUMIDOR_DATABASE_ERROR',
    500,
  )
}

export function humidorIdParam(value: string) {
  const id = Number(value)

  if (!Number.isInteger(id) || id < 1) {
    throw new HumidorServiceError(
      'Humidor id must be a positive integer.',
      'HUMIDOR_VALIDATION_ERROR',
      400,
    )
  }

  return id
}

export async function getHumidors() {
  const prisma = getPrismaClient()

  try {
    return await prisma.storageLocation.findMany({
      where: { isActive: true },
      orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
      include: {
        subLocations: {
          where: { isActive: true },
          orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
          select: {
            id: true,
            name: true,
            kind: true,
            capacity: true,
            displayOrder: true,
            isActive: true,
          },
        },
      },
    })
  } catch (error) {
    mapDatabaseError(error)
  }
}

export async function createHumidor(input: HumidorInput) {
  const prisma = getPrismaClient()

  try {
    const data = normalizeInput(input)
    const subLocations = generatedSubLocations(data.organizationType, data.sectionCount)

    return await prisma.$transaction(async (transaction) =>
      transaction.storageLocation.create({
        data: {
          name: data.name,
          capacity: data.capacity,
          organizationType: data.organizationType,
          hasShelves: data.hasShelves,
          shelfCount: data.shelfCount,
          subLocations: {
            create: subLocations.map((subLocation) => ({
              name: subLocation.name,
              kind: subLocation.kind,
              displayOrder: subLocation.displayOrder,
              isActive: true,
            })),
          },
        },
        include: {
          subLocations: {
            where: { isActive: true },
            orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
            select: {
              id: true,
              name: true,
              kind: true,
              capacity: true,
              displayOrder: true,
              isActive: true,
            },
          },
        },
      }),
    )
  } catch (error) {
    mapDatabaseError(error)
  }
}

export async function updateHumidor(id: number, input: HumidorInput) {
  const prisma = getPrismaClient()

  try {
    const data = normalizeInput(input)
    const desiredSubLocations = generatedSubLocations(data.organizationType, data.sectionCount)

    return await prisma.$transaction(async (transaction) => {
      const existing = await transaction.storageLocation.findUnique({
        where: { id },
        include: {
          subLocations: {
            include: {
              lotLocationBalances: {
                where: { quantity: { gt: 0 } },
                select: { quantity: true },
              },
            },
          },
        },
      })

      if (!existing) {
        throw new HumidorServiceError('Humidor was not found.', 'HUMIDOR_NOT_FOUND', 404)
      }

      const desiredKeys = new Set(
        desiredSubLocations.map((subLocation) => `${subLocation.kind}:${subLocation.name}`),
      )

      const obsoleteActiveSubLocations = existing.subLocations.filter(
        (subLocation) =>
          subLocation.isActive && !desiredKeys.has(`${subLocation.kind}:${subLocation.name}`),
      )

      const blocked = obsoleteActiveSubLocations.filter(hasPositiveBalance)

      if (blocked.length > 0) {
        throw new HumidorServiceError(
          `Move inventory out of ${blocked.map((item) => item.name).join(', ')} before changing this humidor organization.`,
          'HUMIDOR_INVENTORY_CONFLICT',
          409,
        )
      }

      await transaction.storageLocation.update({
        where: { id },
        data: {
          name: data.name,
          capacity: data.capacity,
          organizationType: data.organizationType,
          hasShelves: data.hasShelves,
          shelfCount: data.shelfCount,
        },
      })

      for (const subLocation of obsoleteActiveSubLocations) {
        await transaction.storageSubLocation.update({
          where: { id: subLocation.id },
          data: { isActive: false },
        })
      }

      for (const desiredSubLocation of desiredSubLocations) {
        const matchingSubLocation = findMatchingSubLocation(
          existing.subLocations,
          desiredSubLocation,
        )

        if (matchingSubLocation) {
          await transaction.storageSubLocation.update({
            where: { id: matchingSubLocation.id },
            data: {
              isActive: true,
              displayOrder: desiredSubLocation.displayOrder,
            },
          })
          continue
        }

        await transaction.storageSubLocation.create({
          data: {
            storageLocationId: id,
            name: desiredSubLocation.name,
            kind: desiredSubLocation.kind,
            displayOrder: desiredSubLocation.displayOrder,
            isActive: true,
          },
        })
      }

      return transaction.storageLocation.findUniqueOrThrow({
        where: { id },
        include: {
          subLocations: {
            where: { isActive: true },
            orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
            select: {
              id: true,
              name: true,
              kind: true,
              capacity: true,
              displayOrder: true,
              isActive: true,
            },
          },
        },
      })
    })
  } catch (error) {
    mapDatabaseError(error)
  }
}

export async function archiveHumidor(id: number) {
  const prisma = getPrismaClient()

  try {
    const existing = await prisma.storageLocation.findUnique({ where: { id } })

    if (!existing) {
      throw new HumidorServiceError('Humidor was not found.', 'HUMIDOR_NOT_FOUND', 404)
    }

    return await prisma.storageLocation.update({
      where: { id },
      data: { isActive: false },
    })
  } catch (error) {
    mapDatabaseError(error)
  }
}
