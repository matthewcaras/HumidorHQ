import { PrismaClient } from '../../src/generated/prisma/client.ts'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import { normalizeSearchKey } from '../utils/searchKeys.ts'

type DecimalInput = number | string
type CatalogDecimalInput = DecimalInput | { toString(): string }

type CatalogCigarRecord = {
  id: number
  manufacturer: string
  manufacturerKey: string
  series: string
  seriesKey: string
  vitola: string
  vitolaKey: string
  shape: string | null
  length: CatalogDecimalInput | null
  ringGauge: number | null
  wrapper: string | null
  wrapperKey: string | null
  binder: string | null
  filler: string | null
  country: string | null
  strength: string | null
  msrp: CatalogDecimalInput | null
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
  manufacturer?: unknown
  series?: unknown
  vitola?: unknown
  shape?: unknown
  length?: unknown
  ringGauge?: unknown
  wrapper?: unknown
  binder?: unknown
  filler?: unknown
  country?: unknown
  strength?: unknown
  msrp?: unknown
}

export type UpdateCatalogCigarInput = Partial<CatalogCigarInput>

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
  | 'CATALOG_DUPLICATE_ARCHIVED_RECORD'
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

function catalogValidationError(message: string): never {
  throw new CatalogServiceError(message, 'CATALOG_VALIDATION_ERROR', 400)
}

function requireDisplayValue(value: unknown, fieldName: string): string {
  if (typeof value !== 'string') {
    throw new CatalogServiceError(
      `${fieldName} is required.`,
      'CATALOG_VALIDATION_ERROR',
      400,
    )
  }

  const trimmed = value.trim()

  if (trimmed.length === 0) {
    throw new CatalogServiceError(
      `${fieldName} is required.`,
      'CATALOG_VALIDATION_ERROR',
      400,
    )
  }

  if (trimmed.length > 120) {
    catalogValidationError(`${fieldName} must be 120 characters or fewer.`)
  }

  return trimmed
}

function optionalDisplayValue(value: unknown, fieldName: string): string | null {
  if (value === undefined || value === null) {
    return null
  }

  if (typeof value !== 'string') {
    catalogValidationError(`${fieldName} must be a string.`)
  }

  const trimmed = value.trim()

  if (trimmed.length === 0) {
    return null
  }

  if (trimmed.length > 120) {
    catalogValidationError(`${fieldName} must be 120 characters or fewer.`)
  }

  return trimmed
}

function optionalStrengthValue(value: unknown): string | null {
  const displayValue = optionalDisplayValue(value, 'strength')

  if (displayValue === null) {
    return null
  }

  const canonicalStrengths = new Map([
    ['mild', 'Mild'],
    ['mild-medium', 'Mild-Medium'],
    ['medium', 'Medium'],
    ['medium-full', 'Medium-Full'],
    ['full', 'Full'],
  ])
  const canonical = canonicalStrengths.get(displayValue.toLowerCase())

  if (!canonical) {
    catalogValidationError(
      'strength must be Mild, Mild-Medium, Medium, Medium-Full, Full, or blank.',
    )
  }

  return canonical
}

function normalizeOptionalKey(value: string | null): string | null {
  const normalized = normalizeSearchKey(value)
  return normalized.length === 0 ? null : normalized
}

function decimalString(value: unknown, fieldName: string): string | null {
  if (value === undefined || value === null) {
    return null
  }

  if (typeof value === 'boolean') {
    catalogValidationError(`${fieldName} must be a valid decimal value.`)
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      catalogValidationError(`${fieldName} must be a valid decimal value.`)
    }

    return String(value)
  }

  if (typeof value !== 'string') {
    catalogValidationError(`${fieldName} must be a valid decimal value.`)
  }

  const trimmed = value.trim()

  if (trimmed.length === 0) {
    return null
  }

  return trimmed
}

function parseDecimalParts(value: string) {
  const match = value.match(/^(\d+)(?:\.(\d+))?$/)

  if (!match) {
    return null
  }

  return {
    integer: match[1].replace(/^0+(?=\d)/, '') || '0',
    fraction: (match[2] ?? '').replace(/0+$/, ''),
  }
}

function compareDecimalParts(
  left: NonNullable<ReturnType<typeof parseDecimalParts>>,
  right: NonNullable<ReturnType<typeof parseDecimalParts>>,
) {
  if (left.integer.length !== right.integer.length) {
    return left.integer.length - right.integer.length
  }

  const integerCompare = left.integer.localeCompare(right.integer)
  if (integerCompare !== 0) {
    return integerCompare
  }

  const fractionLength = Math.max(left.fraction.length, right.fraction.length)
  return left.fraction
    .padEnd(fractionLength, '0')
    .localeCompare(right.fraction.padEnd(fractionLength, '0'))
}

function optionalLengthValue(value: unknown): DecimalInput | null {
  const text = decimalString(value, 'length')

  if (text === null) {
    return null
  }

  const parsed = parseDecimalParts(text)

  if (!parsed) {
    catalogValidationError('length must be a valid decimal value.')
  }

  const zero = parseDecimalParts('0')
  const max = parseDecimalParts('20')

  if (!zero || !max || compareDecimalParts(parsed, zero) <= 0) {
    catalogValidationError('length must be greater than zero.')
  }

  if (compareDecimalParts(parsed, max) > 0) {
    catalogValidationError('length must be no more than 20 inches.')
  }

  return text
}

function optionalMsrpValue(value: unknown): DecimalInput | null {
  const text = decimalString(value, 'msrp')

  if (text === null) {
    return null
  }

  const parsed = parseDecimalParts(text)

  if (!parsed) {
    catalogValidationError('msrp must be a valid nonnegative decimal value.')
  }

  return text
}

function optionalRingGaugeValue(
  value: unknown,
  fieldName: string,
): number | null {
  if (value === undefined || value === null) {
    return null
  }

  if (typeof value === 'boolean') {
    catalogValidationError(`${fieldName} must be a positive whole number.`)
  }

  let text: string
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || !Number.isInteger(value)) {
      catalogValidationError(`${fieldName} must be a positive whole number.`)
    }

    text = String(value)
  } else if (typeof value === 'string') {
    text = value.trim()
  } else {
    catalogValidationError(`${fieldName} must be a positive whole number.`)
  }

  if (text.length === 0) {
    return null
  }

  if (!/^\d+$/.test(text)) {
    catalogValidationError(`${fieldName} must be a positive whole number.`)
  }

  const numericValue = Number(text)

  if (!Number.isSafeInteger(numericValue) || numericValue < 10 || numericValue > 100) {
    catalogValidationError(`${fieldName} must be between 10 and 100.`)
  }

  return numericValue
}

function optionalPositiveIntValue(value: number | string | null | undefined, fieldName: string) {
  if (value === undefined || value === null || value === '') {
    return null
  }

  if (typeof value === 'boolean') {
    catalogValidationError(`${fieldName} must be a whole number.`)
  }

  const numericValue = Number(value)

  if (!Number.isInteger(numericValue)) {
    catalogValidationError(`${fieldName} must be a whole number.`)
  }

  return numericValue
}

function buildCatalogCreateData(input: CatalogCigarInput) {
  const manufacturer = requireDisplayValue(input.manufacturer, 'manufacturer')
  const series = requireDisplayValue(input.series, 'series')
  const vitola = requireDisplayValue(input.vitola, 'vitola')
  const wrapper = optionalDisplayValue(input.wrapper, 'wrapper')

  return {
    manufacturer,
    manufacturerKey: normalizeSearchKey(manufacturer),
    series,
    seriesKey: normalizeSearchKey(series),
    vitola,
    vitolaKey: normalizeSearchKey(vitola),
    shape: optionalDisplayValue(input.shape, 'shape'),
    length: optionalLengthValue(input.length),
    ringGauge: optionalRingGaugeValue(input.ringGauge, 'ringGauge'),
    wrapper,
    wrapperKey: normalizeOptionalKey(wrapper),
    binder: optionalDisplayValue(input.binder, 'binder'),
    filler: optionalDisplayValue(input.filler, 'filler'),
    country: optionalDisplayValue(input.country, 'country'),
    strength: optionalStrengthValue(input.strength),
    msrp: optionalMsrpValue(input.msrp),
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
  const wrapper =
    input.wrapper === undefined ? existing.wrapper : optionalDisplayValue(input.wrapper, 'wrapper')

  return {
    manufacturer,
    manufacturerKey: normalizeSearchKey(manufacturer),
    series,
    seriesKey: normalizeSearchKey(series),
    vitola,
    vitolaKey: normalizeSearchKey(vitola),
    shape: input.shape === undefined ? existing.shape : optionalDisplayValue(input.shape, 'shape'),
    length:
      input.length === undefined ? existing.length : optionalLengthValue(input.length),
    ringGauge:
      input.ringGauge === undefined
        ? existing.ringGauge
        : optionalRingGaugeValue(input.ringGauge, 'ringGauge'),
    wrapper,
    wrapperKey: normalizeOptionalKey(wrapper),
    binder: input.binder === undefined ? existing.binder : optionalDisplayValue(input.binder, 'binder'),
    filler: input.filler === undefined ? existing.filler : optionalDisplayValue(input.filler, 'filler'),
    country:
      input.country === undefined ? existing.country : optionalDisplayValue(input.country, 'country'),
    strength: input.strength === undefined ? existing.strength : optionalStrengthValue(input.strength),
    msrp: input.msrp === undefined ? existing.msrp : optionalMsrpValue(input.msrp),
    isActive: existing.isActive,
  }
}

function sameWrapperIdentity(left: string | null, right: string | null) {
  return normalizeOptionalKey(left) === normalizeOptionalKey(right)
}

async function findCatalogCigarDuplicates(
  prisma: CatalogPrismaClient,
  data: {
    manufacturerKey: string
    seriesKey: string
    vitolaKey: string
    wrapperKey: string | null
  },
  excludeId?: number,
) {
  const possibleDuplicates = await prisma.catalogCigar.findMany({
    where: {
      manufacturerKey: data.manufacturerKey,
      seriesKey: data.seriesKey,
      vitolaKey: data.vitolaKey,
      ...(excludeId === undefined ? {} : { id: { not: excludeId } }),
    },
  })

  const matchingDuplicates = possibleDuplicates.filter((catalogCigar) =>
    sameWrapperIdentity(catalogCigar.wrapperKey, data.wrapperKey),
  )

  return {
    activeDuplicate: matchingDuplicates.find((catalogCigar) => catalogCigar.isActive) ?? null,
    archivedDuplicate: matchingDuplicates.find((catalogCigar) => !catalogCigar.isActive) ?? null,
  }
}

async function assertNoDuplicateCatalogCigar(
  prisma: CatalogPrismaClient,
  data: {
    manufacturerKey: string
    seriesKey: string
    vitolaKey: string
    wrapperKey: string | null
  },
  excludeId?: number,
) {
  const { activeDuplicate, archivedDuplicate } = await findCatalogCigarDuplicates(
    prisma,
    data,
    excludeId,
  )

  if (activeDuplicate) {
    throw new CatalogServiceError(
      'An active catalog cigar already exists for this manufacturer, series, vitola, and wrapper.',
      'CATALOG_DUPLICATE_ACTIVE_RECORD',
      409,
    )
  }

  if (!archivedDuplicate) {
    return
  }

  throw new CatalogServiceError(
    'An archived Catalog cigar already uses this identity. Restore the archived record instead of creating a duplicate.',
    'CATALOG_DUPLICATE_ARCHIVED_RECORD',
    409,
  )
}

async function assertNoDuplicateActiveCatalogCigar(
  prisma: CatalogPrismaClient,
  data: {
    manufacturerKey: string
    seriesKey: string
    vitolaKey: string
    wrapperKey: string | null
  },
  excludeId?: number,
) {
  const { activeDuplicate } = await findCatalogCigarDuplicates(prisma, data, excludeId)

  if (!activeDuplicate) {
    return
  }

  throw new CatalogServiceError(
    'An active catalog cigar already exists for this manufacturer, series, vitola, and wrapper.',
    'CATALOG_DUPLICATE_ACTIVE_RECORD',
    409,
  )
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
    await assertNoDuplicateCatalogCigar(prisma, data)

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
    await assertNoDuplicateCatalogCigar(prisma, data, id)

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
    const limit =
      filters.limit === undefined ? 100 : optionalPositiveIntValue(filters.limit, 'limit')

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

export async function restoreCatalogCigar(id: number, options?: CatalogServiceOptions) {
  const prisma = getClient(options)

  try {
    const existing = await prisma.catalogCigar.findUnique({ where: { id } })

    if (!existing) {
      throw new CatalogServiceError('Catalog cigar was not found.', 'CATALOG_NOT_FOUND', 404)
    }

    if (existing.isActive) {
      return existing
    }

    await assertNoDuplicateActiveCatalogCigar(prisma, existing, id)

    return await prisma.catalogCigar.update({
      where: { id },
      data: { isActive: true },
    })
  } catch (error) {
    mapDatabaseError(error)
  }
}
