import { PrismaClient } from '../../src/generated/prisma/client.ts'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import { normalizeSearchKey } from '../utils/searchKeys.ts'

type DecimalInput = number | string

type CatalogCigarRecord = {
  id: number
  manufacturer: string
  manufacturerKey: string
  series: string
  seriesKey: string
  vitola: string
  vitolaKey: string
  shape: string | null
  length: DecimalInput | null
  ringGauge: number | null
  wrapper: string | null
  wrapperKey: string | null
  binder: string | null
  filler: string | null
  country: string | null
  strength: string | null
  msrp: DecimalInput | null
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

type CatalogCigarData = Omit<CatalogCigarRecord, 'id' | 'createdAt' | 'updatedAt'>

type CatalogCigarDelegate = {
  create(args: { data: CatalogCigarData }): Promise<CatalogCigarRecord>
  findFirst(args: { where: Record<string, unknown> }): Promise<CatalogCigarRecord | null>
  findMany(args: {
    where?: Record<string, unknown>
    orderBy?: Record<string, string>[]
    take?: number
  }): Promise<CatalogCigarRecord[]>
  findUnique(args: { where: { id: number } }): Promise<CatalogCigarRecord | null>
  update(args: {
    where: { id: number }
    data: Partial<CatalogCigarData>
  }): Promise<CatalogCigarRecord>
}

type CatalogPrismaClient = {
  catalogCigar: CatalogCigarDelegate
}

export type CatalogCigarInput = {
  manufacturer: string
  series: string
  vitola: string
  shape?: string | null
  length?: DecimalInput | null
  ringGauge?: number | string | null
  wrapper?: string | null
  binder?: string | null
  filler?: string | null
  country?: string | null
  strength?: string | null
  msrp?: DecimalInput | null
}

export type UpdateCatalogCigarInput = Partial<CatalogCigarInput> & {
  isActive?: boolean
}

export type GetCatalogCigarsInput = {
  manufacturer?: string
  series?: string
  vitola?: string
  wrapper?: string
  search?: string
  includeArchived?: boolean
  limit?: number
}

export type CatalogServiceOptions = {
  prisma?: CatalogPrismaClient
}

export type CatalogServiceErrorCode =
  | 'CATALOG_VALIDATION_ERROR'
  | 'CATALOG_DUPLICATE_ACTIVE_RECORD'
  | 'CATALOG_NOT_FOUND'
  | 'CATALOG_DATABASE_ERROR'

export class CatalogServiceError extends Error {
  code: CatalogServiceErrorCode
  statusCode: number

  constructor(message: string, code: CatalogServiceErrorCode, statusCode = 400) {
    super(message)
    this.name = 'CatalogServiceError'
    this.code = code
    this.statusCode = statusCode
  }
}

let prismaSingleton: CatalogPrismaClient | null = null

function getPrismaClient(): CatalogPrismaClient {
  if (!prismaSingleton) {
    const adapter = new PrismaBetterSqlite3({
      url: process.env.DATABASE_URL || 'file:./prisma/humidorhq.db',
    })

    prismaSingleton = new PrismaClient({ adapter }) as unknown as CatalogPrismaClient
  }

  return prismaSingleton
}

function getClient(options?: CatalogServiceOptions): CatalogPrismaClient {
  return options?.prisma ?? getPrismaClient()
}

function requireDisplayValue(value: string | undefined, fieldName: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new CatalogServiceError(
      `${fieldName} is required.`,
      'CATALOG_VALIDATION_ERROR',
      400,
    )
  }

  return value
}

function optionalDisplayValue(value: string | null | undefined): string | null {
  return value === undefined ? null : value
}

function optionalDecimalValue(
  value: DecimalInput | null | undefined,
  fieldName: string,
): DecimalInput | null {
  if (value === undefined || value === null || value === '') {
    return null
  }

  const numericValue = Number(value)
  if (!Number.isFinite(numericValue)) {
    throw new CatalogServiceError(
      `${fieldName} must be a valid number.`,
      'CATALOG_VALIDATION_ERROR',
      400,
    )
  }

  return value
}

function optionalIntValue(
  value: number | string | null | undefined,
  fieldName: string,
): number | null {
  if (value === undefined || value === null || value === '') {
    return null
  }

  const numericValue = Number(value)
  if (!Number.isInteger(numericValue)) {
    throw new CatalogServiceError(
      `${fieldName} must be a whole number.`,
      'CATALOG_VALIDATION_ERROR',
      400,
    )
  }

  return numericValue
}

function buildCatalogCreateData(input: CatalogCigarInput) {
  const manufacturer = requireDisplayValue(input.manufacturer, 'manufacturer')
  const series = requireDisplayValue(input.series, 'series')
  const vitola = requireDisplayValue(input.vitola, 'vitola')
  const wrapper = optionalDisplayValue(input.wrapper)

  return {
    manufacturer,
    manufacturerKey: normalizeSearchKey(manufacturer),
    series,
    seriesKey: normalizeSearchKey(series),
    vitola,
    vitolaKey: normalizeSearchKey(vitola),
    shape: optionalDisplayValue(input.shape),
    length: optionalDecimalValue(input.length, 'length'),
    ringGauge: optionalIntValue(input.ringGauge, 'ringGauge'),
    wrapper,
    wrapperKey: normalizeSearchKey(wrapper),
    binder: optionalDisplayValue(input.binder),
    filler: optionalDisplayValue(input.filler),
    country: optionalDisplayValue(input.country),
    strength: optionalDisplayValue(input.strength),
    msrp: optionalDecimalValue(input.msrp, 'msrp'),
    isActive: true,
  }
}

function buildCatalogUpdateData(
  existing: CatalogCigarRecord,
  input: UpdateCatalogCigarInput,
) {
  const manufacturer =
    input.manufacturer === undefined
      ? existing.manufacturer
      : requireDisplayValue(input.manufacturer, 'manufacturer')
  const series =
    input.series === undefined ? existing.series : requireDisplayValue(input.series, 'series')
  const vitola =
    input.vitola === undefined ? existing.vitola : requireDisplayValue(input.vitola, 'vitola')
  const wrapper = input.wrapper === undefined ? existing.wrapper : input.wrapper

  return {
    manufacturer,
    manufacturerKey: normalizeSearchKey(manufacturer),
    series,
    seriesKey: normalizeSearchKey(series),
    vitola,
    vitolaKey: normalizeSearchKey(vitola),
    shape: input.shape === undefined ? existing.shape : input.shape,
    length:
      input.length === undefined ? existing.length : optionalDecimalValue(input.length, 'length'),
    ringGauge:
      input.ringGauge === undefined
        ? existing.ringGauge
        : optionalIntValue(input.ringGauge, 'ringGauge'),
    wrapper,
    wrapperKey: normalizeSearchKey(wrapper),
    binder: input.binder === undefined ? existing.binder : input.binder,
    filler: input.filler === undefined ? existing.filler : input.filler,
    country: input.country === undefined ? existing.country : input.country,
    strength: input.strength === undefined ? existing.strength : input.strength,
    msrp: input.msrp === undefined ? existing.msrp : optionalDecimalValue(input.msrp, 'msrp'),
    isActive: input.isActive === undefined ? existing.isActive : input.isActive,
  }
}

async function assertNoDuplicateActiveCatalogCigar(
  prisma: CatalogPrismaClient,
  data: {
    manufacturerKey: string
    seriesKey: string
    vitolaKey: string
    wrapperKey: string | null
    isActive: boolean
  },
  excludeId?: number,
) {
  if (!data.isActive) {
    return
  }

  const duplicate = await prisma.catalogCigar.findFirst({
    where: {
      isActive: true,
      manufacturerKey: data.manufacturerKey,
      seriesKey: data.seriesKey,
      vitolaKey: data.vitolaKey,
      wrapperKey: data.wrapperKey,
      ...(excludeId === undefined ? {} : { id: { not: excludeId } }),
    },
  })

  if (duplicate) {
    throw new CatalogServiceError(
      'An active catalog cigar already exists for this manufacturer, series, vitola, and wrapper.',
      'CATALOG_DUPLICATE_ACTIVE_RECORD',
      409,
    )
  }
}

function mapDatabaseError(error: unknown): never {
  if (error instanceof CatalogServiceError) {
    throw error
  }

  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'P2002'
  ) {
    throw new CatalogServiceError(
      'A catalog cigar with these identifying values already exists.',
      'CATALOG_DUPLICATE_ACTIVE_RECORD',
      409,
    )
  }

  throw new CatalogServiceError(
    'The catalog operation could not be completed.',
    'CATALOG_DATABASE_ERROR',
    500,
  )
}

export async function createCatalogCigar(
  input: CatalogCigarInput,
  options?: CatalogServiceOptions,
) {
  const prisma = getClient(options)

  try {
    const data = buildCatalogCreateData(input)
    await assertNoDuplicateActiveCatalogCigar(prisma, data)

    return await prisma.catalogCigar.create({ data })
  } catch (error) {
    mapDatabaseError(error)
  }
}

export async function updateCatalogCigar(
  id: number,
  input: UpdateCatalogCigarInput,
  options?: CatalogServiceOptions,
) {
  const prisma = getClient(options)

  try {
    const existing = await prisma.catalogCigar.findUnique({ where: { id } })

    if (!existing) {
      throw new CatalogServiceError('Catalog cigar was not found.', 'CATALOG_NOT_FOUND', 404)
    }

    const data = buildCatalogUpdateData(existing, input)
    await assertNoDuplicateActiveCatalogCigar(prisma, data, id)

    return await prisma.catalogCigar.update({
      where: { id },
      data,
    })
  } catch (error) {
    mapDatabaseError(error)
  }
}

export async function getCatalogCigars(
  filters: GetCatalogCigarsInput = {},
  options?: CatalogServiceOptions,
) {
  const prisma = getClient(options)

  try {
    const searchKey = normalizeSearchKey(filters.search)
    const wrapperKey = normalizeSearchKey(filters.wrapper)
    const limit = filters.limit === undefined ? 100 : optionalIntValue(filters.limit, 'limit')

    if (limit !== null && limit < 1) {
      throw new CatalogServiceError('limit must be at least 1.', 'CATALOG_VALIDATION_ERROR', 400)
    }

    return await prisma.catalogCigar.findMany({
      where: {
        ...(filters.includeArchived ? {} : { isActive: true }),
        ...(filters.manufacturer
          ? { manufacturerKey: normalizeSearchKey(filters.manufacturer) }
          : {}),
        ...(filters.series ? { seriesKey: normalizeSearchKey(filters.series) } : {}),
        ...(filters.vitola ? { vitolaKey: normalizeSearchKey(filters.vitola) } : {}),
        ...(wrapperKey ? { wrapperKey } : {}),
        ...(searchKey
          ? {
              OR: [
                { manufacturerKey: { contains: searchKey } },
                { seriesKey: { contains: searchKey } },
                { vitolaKey: { contains: searchKey } },
              ],
            }
          : {}),
      },
      orderBy: [{ manufacturerKey: 'asc' }, { seriesKey: 'asc' }, { vitolaKey: 'asc' }],
      take: limit ?? undefined,
    })
  } catch (error) {
    mapDatabaseError(error)
  }
}

export async function archiveCatalogCigar(id: number, options?: CatalogServiceOptions) {
  const prisma = getClient(options)

  try {
    const existing = await prisma.catalogCigar.findUnique({ where: { id } })

    if (!existing) {
      throw new CatalogServiceError('Catalog cigar was not found.', 'CATALOG_NOT_FOUND', 404)
    }

    return await prisma.catalogCigar.update({
      where: { id },
      data: { isActive: false },
    })
  } catch (error) {
    mapDatabaseError(error)
  }
}
