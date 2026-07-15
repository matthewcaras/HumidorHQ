import { PrismaClient } from '../../src/generated/prisma/client.ts'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import { normalizeSearchKey } from '../utils/searchKeys.ts'

type VendorRecord = {
  id: number
  name: string
  nameKey: string
  website: string | null
  notes: string | null
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

type VendorData = Omit<VendorRecord, 'id' | 'createdAt' | 'updatedAt'>

type VendorDelegate = {
  create(args: { data: VendorData }): Promise<VendorRecord>
  findMany(args: {
    where?: Record<string, unknown>
    orderBy?: Record<string, string>[]
  }): Promise<VendorRecord[]>
  findUnique(args: { where: { id: number } | { nameKey: string } }): Promise<VendorRecord | null>
  update(args: {
    where: { id: number }
    data: Partial<VendorData>
  }): Promise<VendorRecord>
}

type VendorTransactionClient = {
  vendor: VendorDelegate
}

type VendorPrismaClient = VendorTransactionClient & {
  $transaction<T>(callback: (transaction: VendorTransactionClient) => Promise<T>): Promise<T>
}

export type VendorInput = {
  name?: unknown
  website?: unknown
  notes?: unknown
}

export type GetVendorsInput = {
  search?: unknown
}

export type VendorServiceErrorCode =
  | 'VENDOR_VALIDATION_ERROR'
  | 'VENDOR_DUPLICATE_RECORD'
  | 'VENDOR_NOT_FOUND'
  | 'VENDOR_DATABASE_ERROR'

export class VendorServiceError extends Error {
  code: VendorServiceErrorCode
  statusCode: number

  constructor(message: string, code: VendorServiceErrorCode, statusCode = 400) {
    super(message)
    this.name = 'VendorServiceError'
    this.code = code
    this.statusCode = statusCode
  }
}

let prismaSingleton: VendorPrismaClient | null = null

function getPrismaClient(): VendorPrismaClient {
  if (!prismaSingleton) {
    const adapter = new PrismaBetterSqlite3({
      url: process.env.DATABASE_URL || 'file:./prisma/humidorhq.db',
    })

    prismaSingleton = new PrismaClient({ adapter }) as unknown as VendorPrismaClient
  }

  return prismaSingleton
}

function requireName(value: unknown) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new VendorServiceError('Vendor name is required.', 'VENDOR_VALIDATION_ERROR', 400)
  }

  return value.trim()
}

function optionalText(value: unknown) {
  if (value === undefined || value === null || value === '') {
    return null
  }

  if (typeof value !== 'string') {
    throw new VendorServiceError('Text fields must be strings.', 'VENDOR_VALIDATION_ERROR', 400)
  }

  return value
}

function buildVendorData(input: VendorInput) {
  const name = requireName(input.name)

  return {
    name,
    nameKey: normalizeSearchKey(name),
    website: optionalText(input.website),
    notes: optionalText(input.notes),
    isActive: true,
  }
}

function vendorOptionalUpdate(input: VendorInput) {
  return {
    ...(input.website === undefined ? {} : { website: optionalText(input.website) }),
    ...(input.notes === undefined ? {} : { notes: optionalText(input.notes) }),
  }
}

async function findVendorByNameKey(prisma: VendorTransactionClient, nameKey: string) {
  return prisma.vendor.findUnique({
    where: { nameKey },
  })
}

async function assertNoDuplicateVendor(
  prisma: VendorTransactionClient,
  nameKey: string,
  excludeId?: number,
) {
  const duplicate = await findVendorByNameKey(prisma, nameKey)

  if (duplicate && duplicate.id !== excludeId) {
    throw new VendorServiceError(
      'A vendor with this name already exists.',
      'VENDOR_DUPLICATE_RECORD',
      409,
    )
  }
}

function mapDatabaseError(error: unknown): never {
  if (error instanceof VendorServiceError) {
    throw error
  }

  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'P2025'
  ) {
    throw new VendorServiceError('Vendor was not found.', 'VENDOR_NOT_FOUND', 404)
  }

  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'P2002'
  ) {
    throw new VendorServiceError(
      'A vendor with this name already exists.',
      'VENDOR_DUPLICATE_RECORD',
      409,
    )
  }

  throw new VendorServiceError(
    'The vendor operation could not be completed.',
    'VENDOR_DATABASE_ERROR',
    500,
  )
}

export function vendorIdParam(value: string) {
  const id = Number(value)

  if (!Number.isInteger(id) || id < 1) {
    throw new VendorServiceError(
      'Vendor id must be a positive integer.',
      'VENDOR_VALIDATION_ERROR',
      400,
    )
  }

  return id
}

export async function getVendors(filters: GetVendorsInput = {}) {
  const prisma = getPrismaClient()

  try {
    const searchKey =
      typeof filters.search === 'string' ? normalizeSearchKey(filters.search) : ''

    const vendors = await prisma.vendor.findMany({
      where: {
        isActive: true,
        ...(searchKey ? { nameKey: { contains: searchKey } } : {}),
      },
      orderBy: [{ nameKey: 'asc' }, { name: 'asc' }],
    })

    return vendors
  } catch (error) {
    mapDatabaseError(error)
  }
}

export async function createVendor(input: VendorInput) {
  const prisma = getPrismaClient()

  try {
    const data = buildVendorData(input)

    return await prisma.$transaction(async (transaction) => {
      const existing = await findVendorByNameKey(transaction, data.nameKey)

      if (existing?.isActive) {
        throw new VendorServiceError(
          'A vendor with this name already exists.',
          'VENDOR_DUPLICATE_RECORD',
          409,
        )
      }

      if (existing) {
        return transaction.vendor.update({
          where: { id: existing.id },
          data: {
            ...vendorOptionalUpdate(input),
            isActive: true,
          },
        })
      }

      return transaction.vendor.create({ data })
    })
  } catch (error) {
    mapDatabaseError(error)
  }
}

export async function updateVendor(id: number, input: VendorInput) {
  const prisma = getPrismaClient()

  try {
    const data = buildVendorData(input)

    return await prisma.$transaction(async (transaction) => {
      const existing = await transaction.vendor.findUnique({ where: { id } })

      if (!existing) {
        throw new VendorServiceError('Vendor was not found.', 'VENDOR_NOT_FOUND', 404)
      }

      await assertNoDuplicateVendor(transaction, data.nameKey, id)

      return transaction.vendor.update({
        where: { id },
        data: {
          name: data.name,
          nameKey: data.nameKey,
          website: data.website,
          notes: data.notes,
        },
      })
    })
  } catch (error) {
    mapDatabaseError(error)
  }
}

export async function archiveVendor(id: number) {
  const prisma = getPrismaClient()

  try {
    const existing = await prisma.vendor.findUnique({ where: { id } })

    if (!existing) {
      throw new VendorServiceError('Vendor was not found.', 'VENDOR_NOT_FOUND', 404)
    }

    return await prisma.vendor.update({
      where: { id },
      data: { isActive: false },
    })
  } catch (error) {
    mapDatabaseError(error)
  }
}
