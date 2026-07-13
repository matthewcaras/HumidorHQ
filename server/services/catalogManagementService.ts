import { PrismaClient } from '../../src/generated/prisma/client.ts'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import { normalizeSearchKey } from '../utils/searchKeys.ts'

type DecimalValue = number | string | { toString(): string }

type CatalogManagementStatus = 'ACTIVE' | 'ARCHIVED' | 'ALL'
type CatalogManagementSortBy = 'CIGAR' | 'MSRP' | 'UPDATED'
type CatalogManagementSortDirection = 'ASC' | 'DESC'
type CatalogManagementLimit = number | 'all'

type CatalogCigarRecord = {
  id: number
  manufacturer: string
  manufacturerKey: string
  series: string
  seriesKey: string
  vitola: string
  vitolaKey: string
  shape: string | null
  length: DecimalValue | null
  ringGauge: number | null
  wrapper: string | null
  wrapperKey: string | null
  binder: string | null
  filler: string | null
  country: string | null
  strength: string | null
  msrp: DecimalValue | null
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

type CatalogCigarPublic = Omit<
  CatalogCigarRecord,
  'manufacturerKey' | 'seriesKey' | 'vitolaKey' | 'wrapperKey'
>

type LotRecord = {
  id: number
  catalogCigarId: number | null
}

type BalanceRecord = {
  id: number
  lotId: number
  storageSubLocationId: number
  quantity: number
  lot: {
    catalogCigarId: number | null
  }
  storageSubLocation?: {
    id: number
    storageLocationId: number
    name: string
    kind: string
    displayOrder: number
    isActive: boolean
    storageLocation: {
      id: number
      name: string
      isActive: boolean
      displayOrder: number
    }
  }
}

type PurchaseLineRecord = {
  id: number
  catalogCigarId: number
}

type CatalogCigarDelegate = {
  count(args?: { where?: Record<string, unknown> }): Promise<number>
  findMany(args?: {
    where?: Record<string, unknown>
    orderBy?: Record<string, string>[]
  }): Promise<CatalogCigarRecord[]>
  findUnique(args: { where: { id: number } }): Promise<CatalogCigarRecord | null>
}

type LotDelegate = {
  findMany(args: { where?: Record<string, unknown> }): Promise<LotRecord[]>
}

type LotLocationBalanceDelegate = {
  findMany(args: {
    where?: Record<string, unknown>
    include?: Record<string, unknown>
  }): Promise<BalanceRecord[]>
}

type PurchaseLineDelegate = {
  findMany(args: { where?: Record<string, unknown> }): Promise<PurchaseLineRecord[]>
}

type InventoryEventDelegate = {
  count(args: { where?: Record<string, unknown> }): Promise<number>
}

type CatalogManagementPrismaClient = {
  catalogCigar: CatalogCigarDelegate
  lot: LotDelegate
  lotLocationBalance: LotLocationBalanceDelegate
  purchaseLine: PurchaseLineDelegate
  inventoryEvent: InventoryEventDelegate
}

export type CatalogManagementServiceErrorCode =
  | 'CATALOG_MANAGEMENT_VALIDATION_ERROR'
  | 'CATALOG_ITEM_NOT_FOUND'
  | 'CATALOG_MANAGEMENT_DATABASE_ERROR'

export class CatalogManagementServiceError extends Error {
  code: CatalogManagementServiceErrorCode
  statusCode: number

  constructor(
    message: string,
    code: CatalogManagementServiceErrorCode,
    statusCode = 400,
  ) {
    super(message)
    this.name = 'CatalogManagementServiceError'
    this.code = code
    this.statusCode = statusCode
  }
}

export type GetManagedCatalogInput = {
  search?: unknown
  status?: unknown
  sortBy?: unknown
  sortDirection?: unknown
  limit?: unknown
  offset?: unknown
}

type ParsedManagedCatalogQuery = {
  search: string
  searchKey: string
  status: CatalogManagementStatus
  sortBy: CatalogManagementSortBy
  sortDirection: CatalogManagementSortDirection
  limit: CatalogManagementLimit
  offset: number
}

type CatalogUsage = {
  currentQuantity: number
  lotCount: number
  purchaseLineCount: number
  currentLocationCount: number
}

type CatalogDetailUsage = CatalogUsage & {
  inventoryEventCount: number
}

type CurrentLocation = {
  storageLocationId: number
  storageLocationName: string
  storageLocationIsActive: boolean
  storageSubLocationId: number
  storageSubLocationName: string
  storageSubLocationKind: string
  storageSubLocationIsActive: boolean
  quantity: number
  storageLocationDisplayOrder: number
  storageSubLocationDisplayOrder: number
}

let prismaSingleton: CatalogManagementPrismaClient | null = null

function getPrismaClient(): CatalogManagementPrismaClient {
  if (!prismaSingleton) {
    const adapter = new PrismaBetterSqlite3({
      url: process.env.DATABASE_URL || 'file:./prisma/humidorhq.db',
    })

    prismaSingleton = new PrismaClient({ adapter }) as unknown as CatalogManagementPrismaClient
  }

  return prismaSingleton
}

function validationError(message: string): never {
  throw new CatalogManagementServiceError(
    message,
    'CATALOG_MANAGEMENT_VALIDATION_ERROR',
    400,
  )
}

function databaseError(): never {
  throw new CatalogManagementServiceError(
    'The Catalog could not be loaded.',
    'CATALOG_MANAGEMENT_DATABASE_ERROR',
    500,
  )
}

function mapDatabaseError(error: unknown): never {
  if (error instanceof CatalogManagementServiceError) {
    throw error
  }

  databaseError()
}

export function catalogManagementIdParam(value: string): number {
  const id = Number(value)

  if (!Number.isInteger(id) || id < 1) {
    validationError('Catalog cigar id must be a positive integer.')
  }

  return id
}

function parseStringValue(value: unknown, defaultValue: string): string {
  return typeof value === 'string' ? value.trim() : defaultValue
}

function parseStatus(value: unknown): CatalogManagementStatus {
  const normalized = parseStringValue(value, 'ACTIVE').toUpperCase()

  if (normalized === 'ACTIVE' || normalized === 'ARCHIVED' || normalized === 'ALL') {
    return normalized
  }

  validationError('status must be ACTIVE, ARCHIVED, or ALL.')
}

function parseSortBy(value: unknown): CatalogManagementSortBy {
  const normalized = parseStringValue(value, 'CIGAR').toUpperCase()

  if (normalized === 'CIGAR' || normalized === 'MSRP' || normalized === 'UPDATED') {
    return normalized
  }

  validationError('sortBy must be CIGAR, MSRP, or UPDATED.')
}

function parseSortDirection(value: unknown): CatalogManagementSortDirection {
  const normalized = parseStringValue(value, 'ASC').toUpperCase()

  if (normalized === 'ASC' || normalized === 'DESC') {
    return normalized
  }

  validationError('sortDirection must be ASC or DESC.')
}

function parseInteger(value: unknown, fieldName: string): number {
  if (typeof value === 'number') {
    if (!Number.isInteger(value)) {
      validationError(`${fieldName} must be a whole number.`)
    }

    return value
  }

  if (typeof value !== 'string' || value.trim().length === 0) {
    validationError(`${fieldName} must be a whole number.`)
  }

  const parsed = Number(value)

  if (!Number.isInteger(parsed)) {
    validationError(`${fieldName} must be a whole number.`)
  }

  return parsed
}

function parseQuery(input: GetManagedCatalogInput = {}): ParsedManagedCatalogQuery {
  const search = parseStringValue(input.search, '')
  const status = parseStatus(input.status)
  const sortBy = parseSortBy(input.sortBy)
  const sortDirection = parseSortDirection(input.sortDirection)
  const rawLimit = input.limit
  let limit: CatalogManagementLimit = 50
  let offset = 0

  if (typeof rawLimit === 'string' && rawLimit.trim().toLowerCase() === 'all') {
    limit = 'all'
  } else if (rawLimit !== undefined) {
    limit = parseInteger(rawLimit, 'limit')

    if (limit < 1 || limit > 200) {
      validationError('limit must be a positive integer up to 200, or all.')
    }
  }

  if (limit !== 'all') {
    offset = input.offset === undefined ? 0 : parseInteger(input.offset, 'offset')
  }

  if (offset < 0) {
    validationError('offset must be a nonnegative integer.')
  }

  return {
    search,
    searchKey: normalizeSearchKey(search),
    status,
    sortBy,
    sortDirection,
    limit,
    offset,
  }
}

function catalogPublic(catalogCigar: CatalogCigarRecord): CatalogCigarPublic {
  return {
    id: catalogCigar.id,
    manufacturer: catalogCigar.manufacturer,
    series: catalogCigar.series,
    vitola: catalogCigar.vitola,
    shape: catalogCigar.shape,
    length: catalogCigar.length,
    ringGauge: catalogCigar.ringGauge,
    wrapper: catalogCigar.wrapper,
    binder: catalogCigar.binder,
    filler: catalogCigar.filler,
    country: catalogCigar.country,
    strength: catalogCigar.strength,
    msrp: catalogCigar.msrp,
    isActive: catalogCigar.isActive,
    createdAt: catalogCigar.createdAt,
    updatedAt: catalogCigar.updatedAt,
  }
}

function statusWhere(status: CatalogManagementStatus): Record<string, unknown> {
  if (status === 'ACTIVE') {
    return { isActive: true }
  }

  if (status === 'ARCHIVED') {
    return { isActive: false }
  }

  return {}
}

function decimalText(value: DecimalValue | null): string | null {
  return value === null ? null : value.toString()
}

function splitDecimalText(value: string) {
  const trimmed = value.trim()
  const isNegative = trimmed.startsWith('-')
  const unsigned = isNegative || trimmed.startsWith('+') ? trimmed.slice(1) : trimmed
  const [rawInteger = '0', rawFraction = ''] = unsigned.split('.')
  const integer = rawInteger.replace(/^0+(?=\d)/, '') || '0'
  const fraction = rawFraction.replace(/0+$/, '')

  return {
    isNegative,
    integer,
    fraction,
  }
}

function compareUnsignedDecimalText(left: ReturnType<typeof splitDecimalText>, right: ReturnType<typeof splitDecimalText>) {
  if (left.integer.length !== right.integer.length) {
    return left.integer.length - right.integer.length
  }

  const integerCompare = left.integer.localeCompare(right.integer)
  if (integerCompare !== 0) {
    return integerCompare
  }

  const maxFractionLength = Math.max(left.fraction.length, right.fraction.length)
  const leftFraction = left.fraction.padEnd(maxFractionLength, '0')
  const rightFraction = right.fraction.padEnd(maxFractionLength, '0')

  return leftFraction.localeCompare(rightFraction)
}

function compareDecimalText(left: string, right: string): number {
  const leftParts = splitDecimalText(left)
  const rightParts = splitDecimalText(right)

  if (leftParts.isNegative !== rightParts.isNegative) {
    return leftParts.isNegative ? -1 : 1
  }

  const unsignedCompare = compareUnsignedDecimalText(leftParts, rightParts)
  return leftParts.isNegative ? -unsignedCompare : unsignedCompare
}

function compareText(left: string | null, right: string | null): number {
  return (left ?? '').localeCompare(right ?? '', undefined, {
    numeric: true,
    sensitivity: 'base',
  })
}

function compareCatalogIdentity(left: CatalogCigarRecord, right: CatalogCigarRecord): number {
  return (
    compareText(left.manufacturerKey, right.manufacturerKey) ||
    compareText(left.seriesKey, right.seriesKey) ||
    compareText(left.vitolaKey, right.vitolaKey) ||
    compareText(left.wrapperKey, right.wrapperKey) ||
    left.id - right.id
  )
}

function sortCatalogRecords(
  records: CatalogCigarRecord[],
  sortBy: CatalogManagementSortBy,
  sortDirection: CatalogManagementSortDirection,
): CatalogCigarRecord[] {
  const direction = sortDirection === 'ASC' ? 1 : -1

  return [...records].sort((left, right) => {
    if (sortBy === 'CIGAR') {
      return compareCatalogIdentity(left, right) * direction
    }

    if (sortBy === 'MSRP') {
      const leftMsrp = decimalText(left.msrp)
      const rightMsrp = decimalText(right.msrp)

      if (leftMsrp === null && rightMsrp === null) {
        return compareCatalogIdentity(left, right)
      }

      if (leftMsrp === null) {
        return 1
      }

      if (rightMsrp === null) {
        return -1
      }

      return compareDecimalText(leftMsrp, rightMsrp) * direction || compareCatalogIdentity(left, right)
    }

    const timeCompare = (left.updatedAt.getTime() - right.updatedAt.getTime()) * direction
    return timeCompare || compareCatalogIdentity(left, right)
  })
}

function matchesSearch(catalogCigar: CatalogCigarRecord, searchKey: string): boolean {
  if (!searchKey) {
    return true
  }

  const searchableKeys = [
    catalogCigar.manufacturerKey,
    catalogCigar.seriesKey,
    catalogCigar.vitolaKey,
    catalogCigar.wrapperKey ?? '',
    normalizeSearchKey(catalogCigar.shape),
    normalizeSearchKey(decimalText(catalogCigar.length)),
    normalizeSearchKey(catalogCigar.ringGauge === null ? null : String(catalogCigar.ringGauge)),
  ]

  return searchableKeys.some((key) => key.includes(searchKey))
}

function emptyUsage(): CatalogUsage {
  return {
    currentQuantity: 0,
    lotCount: 0,
    purchaseLineCount: 0,
    currentLocationCount: 0,
  }
}

function incrementMap(map: Map<number, number>, id: number, amount = 1) {
  map.set(id, (map.get(id) ?? 0) + amount)
}

async function getUsageForCatalogIds(
  prisma: CatalogManagementPrismaClient,
  catalogCigarIds: number[],
): Promise<Map<number, CatalogUsage>> {
  const usage = new Map<number, CatalogUsage>()

  for (const catalogCigarId of catalogCigarIds) {
    usage.set(catalogCigarId, emptyUsage())
  }

  if (catalogCigarIds.length === 0) {
    return usage
  }

  const [balances, lots, purchaseLines] = await Promise.all([
    prisma.lotLocationBalance.findMany({
      where: {
        quantity: { gt: 0 },
        lot: { catalogCigarId: { in: catalogCigarIds } },
      },
      include: {
        lot: true,
      },
    }),
    prisma.lot.findMany({
      where: {
        catalogCigarId: { in: catalogCigarIds },
      },
    }),
    prisma.purchaseLine.findMany({
      where: {
        catalogCigarId: { in: catalogCigarIds },
      },
    }),
  ])

  const locationSets = new Map<number, Set<number>>()

  for (const balance of balances) {
    const catalogCigarId = balance.lot.catalogCigarId
    if (catalogCigarId === null) {
      continue
    }

    const catalogUsage = usage.get(catalogCigarId)
    if (!catalogUsage) {
      continue
    }

    catalogUsage.currentQuantity += balance.quantity
    const locationSet = locationSets.get(catalogCigarId) ?? new Set<number>()
    locationSet.add(balance.storageSubLocationId)
    locationSets.set(catalogCigarId, locationSet)
  }

  const lotCounts = new Map<number, number>()
  for (const lot of lots) {
    if (lot.catalogCigarId !== null) {
      incrementMap(lotCounts, lot.catalogCigarId)
    }
  }

  const purchaseLineCounts = new Map<number, number>()
  for (const purchaseLine of purchaseLines) {
    incrementMap(purchaseLineCounts, purchaseLine.catalogCigarId)
  }

  for (const catalogCigarId of catalogCigarIds) {
    const catalogUsage = usage.get(catalogCigarId)
    if (!catalogUsage) {
      continue
    }

    catalogUsage.lotCount = lotCounts.get(catalogCigarId) ?? 0
    catalogUsage.purchaseLineCount = purchaseLineCounts.get(catalogCigarId) ?? 0
    catalogUsage.currentLocationCount = locationSets.get(catalogCigarId)?.size ?? 0
  }

  return usage
}

export async function getManagedCatalog(input: GetManagedCatalogInput = {}) {
  const prisma = getPrismaClient()

  try {
    const query = parseQuery(input)

    const [totalCatalogCount, activeCount, archivedCount, catalogCigars] = await Promise.all([
      prisma.catalogCigar.count(),
      prisma.catalogCigar.count({ where: { isActive: true } }),
      prisma.catalogCigar.count({ where: { isActive: false } }),
      prisma.catalogCigar.findMany({
        where: statusWhere(query.status),
        orderBy: [
          { manufacturerKey: 'asc' },
          { seriesKey: 'asc' },
          { vitolaKey: 'asc' },
          { wrapperKey: 'asc' },
          { id: 'asc' },
        ],
      }),
    ])

    const matchingCatalogCigars = catalogCigars.filter((catalogCigar) =>
      matchesSearch(catalogCigar, query.searchKey),
    )
    const sortedCatalogCigars = sortCatalogRecords(
      matchingCatalogCigars,
      query.sortBy,
      query.sortDirection,
    )
    const paginatedCatalogCigars =
      query.limit === 'all'
        ? sortedCatalogCigars
        : sortedCatalogCigars.slice(query.offset, query.offset + query.limit)
    const usageByCatalogId = await getUsageForCatalogIds(
      prisma,
      paginatedCatalogCigars.map((catalogCigar) => catalogCigar.id),
    )

    return {
      summary: {
        totalCatalogCount,
        activeCount,
        archivedCount,
      },
      items: paginatedCatalogCigars.map((catalogCigar) => ({
        catalogCigar: catalogPublic(catalogCigar),
        usage: usageByCatalogId.get(catalogCigar.id) ?? emptyUsage(),
      })),
      total: matchingCatalogCigars.length,
      limit: query.limit,
      offset: query.offset,
      sort: {
        sortBy: query.sortBy,
        sortDirection: query.sortDirection,
      },
      status: query.status,
      search: query.search,
    }
  } catch (error) {
    mapDatabaseError(error)
  }
}

function aggregateCurrentLocations(balances: BalanceRecord[]): CurrentLocation[] {
  const locationMap = new Map<number, CurrentLocation>()

  for (const balance of balances) {
    const subLocation = balance.storageSubLocation
    if (!subLocation) {
      continue
    }

    const existing = locationMap.get(subLocation.id)
    if (existing) {
      existing.quantity += balance.quantity
      continue
    }

    locationMap.set(subLocation.id, {
      storageLocationId: subLocation.storageLocation.id,
      storageLocationName: subLocation.storageLocation.name,
      storageLocationIsActive: subLocation.storageLocation.isActive,
      storageSubLocationId: subLocation.id,
      storageSubLocationName: subLocation.name,
      storageSubLocationKind: subLocation.kind,
      storageSubLocationIsActive: subLocation.isActive,
      quantity: balance.quantity,
      storageLocationDisplayOrder: subLocation.storageLocation.displayOrder,
      storageSubLocationDisplayOrder: subLocation.displayOrder,
    })
  }

  return [...locationMap.values()].sort((left, right) => {
    if (left.storageLocationIsActive !== right.storageLocationIsActive) {
      return left.storageLocationIsActive ? -1 : 1
    }

    return (
      compareText(left.storageLocationName, right.storageLocationName) ||
      left.storageLocationDisplayOrder - right.storageLocationDisplayOrder ||
      left.storageSubLocationDisplayOrder - right.storageSubLocationDisplayOrder ||
      compareText(left.storageSubLocationName, right.storageSubLocationName) ||
      left.storageSubLocationId - right.storageSubLocationId
    )
  })
}

function stripLocationSortFields(location: CurrentLocation) {
  return {
    storageLocationId: location.storageLocationId,
    storageLocationName: location.storageLocationName,
    storageLocationIsActive: location.storageLocationIsActive,
    storageSubLocationId: location.storageSubLocationId,
    storageSubLocationName: location.storageSubLocationName,
    storageSubLocationKind: location.storageSubLocationKind,
    storageSubLocationIsActive: location.storageSubLocationIsActive,
    quantity: location.quantity,
  }
}

export async function getManagedCatalogDetails(catalogCigarId: number) {
  const prisma = getPrismaClient()

  try {
    const catalogCigar = await prisma.catalogCigar.findUnique({
      where: { id: catalogCigarId },
    })

    if (!catalogCigar) {
      throw new CatalogManagementServiceError(
        'Catalog cigar was not found.',
        'CATALOG_ITEM_NOT_FOUND',
        404,
      )
    }

    const [balances, lots, purchaseLines] = await Promise.all([
      prisma.lotLocationBalance.findMany({
        where: {
          quantity: { gt: 0 },
          lot: { catalogCigarId },
        },
        include: {
          lot: true,
          storageSubLocation: {
            include: {
              storageLocation: true,
            },
          },
        },
      }),
      prisma.lot.findMany({
        where: { catalogCigarId },
      }),
      prisma.purchaseLine.findMany({
        where: { catalogCigarId },
      }),
    ])

    const lotIds = lots.map((lot) => lot.id)
    const inventoryEventCount =
      lotIds.length === 0
        ? 0
        : await prisma.inventoryEvent.count({
            where: {
              lotId: { in: lotIds },
            },
          })
    const currentLocations = aggregateCurrentLocations(balances)
    const usage: CatalogDetailUsage = {
      currentQuantity: balances.reduce((total, balance) => total + balance.quantity, 0),
      lotCount: lots.length,
      purchaseLineCount: purchaseLines.length,
      inventoryEventCount,
      currentLocationCount: currentLocations.length,
    }

    return {
      catalogCigar: catalogPublic(catalogCigar),
      usage,
      currentLocations: currentLocations.map(stripLocationSortFields),
    }
  } catch (error) {
    mapDatabaseError(error)
  }
}
