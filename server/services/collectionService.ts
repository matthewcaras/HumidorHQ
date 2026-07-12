import { PrismaClient } from '../../src/generated/prisma/client.ts'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import { normalizeSearchKey } from '../utils/searchKeys.ts'

type CollectionPrismaClient = any

export type CollectionServiceErrorCode =
  | 'COLLECTION_VALIDATION_ERROR'
  | 'COLLECTION_DATABASE_ERROR'

type InventoryIssueSeverity = 'WARNING'

type InventoryIssue = {
  code: string
  message: string
  severity: InventoryIssueSeverity
  lotId?: number
  catalogCigarId?: number
  storageLocationId?: number
  storageSubLocationId?: number
}

type CollectionInput = {
  search?: unknown
  limit?: unknown
  offset?: unknown
}

type CatalogCigarRecord = {
  id: number
  manufacturer: string
  manufacturerKey: string
  series: string
  seriesKey: string
  vitola: string
  vitolaKey: string
  shape: string | null
  length: unknown
  ringGauge: number | null
  wrapper: string | null
  wrapperKey: string | null
  binder: string | null
  filler: string | null
  country: string | null
  strength: string | null
  msrp: unknown
  isActive: boolean
}

type LotRecord = {
  id: number
  catalogCigarId: number | null
  currentQuantity: number | null
  receivedDateSnapshot: Date | null
  purchaseDateSnapshot: Date | null
  costPerCigarSnapshot: unknown
  allocatedCostPerCigar: unknown
  actualCostPerCigar: unknown
  msrpPerCigarSnapshot: unknown
  msrpPerCigar: unknown
  catalogCigar: CatalogCigarRecord | null
}

type PositiveBalanceRecord = {
  id: number
  lotId: number
  storageSubLocationId: number
  quantity: number
  lot: LotRecord
  storageSubLocation: {
    id: number
    name: string
    kind: string
    displayOrder: number
    isActive: boolean
    storageLocationId: number
    storageLocation: {
      id: number
      name: string
      isActive: boolean
    } | null
  }
}

type LocationAccumulator = {
  storageLocationId: number
  storageLocationName: string
  storageLocationIsActive: boolean
  storageSubLocationId: number
  storageSubLocationName: string
  storageSubLocationKind: string
  storageSubLocationIsActive: boolean
  storageSubLocationDisplayOrder: number
  quantity: number
  lotIds: Set<number>
  oldestReceivedDate: Date | null
}

type LocationSummary = {
  storageLocationId: number
  storageLocationName: string
  storageLocationIsActive: boolean
  storageSubLocationId: number
  storageSubLocationName: string
  storageSubLocationKind: string
  storageSubLocationIsActive: boolean
  quantity: number
  lotCount: number
  oldestReceivedDate: string | null
}

type CollectionItemInternal = {
  catalogCigar: CatalogCigarRecord
  totalQuantity: number
  lotIds: Set<number>
  oldestReceivedDate: Date | null
  costBasisMillionths: bigint
  msrpValueMillionths: bigint
  hasCompleteCostData: boolean
  hasCompleteMsrpData: boolean
  locationsById: Map<number, LocationAccumulator>
  issues: InventoryIssue[]
  issueKeys: Set<string>
}

type CollectionItem = {
  catalogCigar: CatalogCigarRecord
  totalQuantity: number
  lotCount: number
  locationCount: number
  oldestReceivedDate: string | null
  weightedAverageCostPerCigar: string | null
  averageMsrpPerCigar: string | null
  currentCostBasis: string | null
  currentMsrpValue: string | null
  savingsPerCigar: string | null
  totalSavings: string | null
  primaryLocations: LocationSummary[]
  searchMatchType: 'CIGAR' | 'LOCATION' | 'BOTH' | null
  matchingLocationQuantity: number
  matchingLocations: LocationSummary[]
  issues: InventoryIssue[]
}

type SearchMatchInfo = {
  cigarMatch: boolean
  locationMatch: boolean
  searchMatchType: 'CIGAR' | 'LOCATION' | 'BOTH' | null
  matchingLocationQuantity: number
  matchingLocations: LocationSummary[]
}

export class CollectionServiceError extends Error {
  code: CollectionServiceErrorCode
  statusCode: number

  constructor(message: string, code: CollectionServiceErrorCode, statusCode = 400) {
    super(message)
    this.name = 'CollectionServiceError'
    this.code = code
    this.statusCode = statusCode
  }
}

let prismaSingleton: CollectionPrismaClient | null = null

function getPrismaClient(): CollectionPrismaClient {
  if (!prismaSingleton) {
    const adapter = new PrismaBetterSqlite3({
      url: process.env.DATABASE_URL || 'file:./prisma/humidorhq.db',
    })

    prismaSingleton = new PrismaClient({ adapter }) as unknown as CollectionPrismaClient
  }

  return prismaSingleton
}

function parseLimit(value: unknown) {
  if (value === undefined || value === null || value === '') {
    return 50
  }

  const numberValue = Number(value)
  if (!Number.isInteger(numberValue) || numberValue < 1) {
    throw new CollectionServiceError(
      'limit must be a positive whole number.',
      'COLLECTION_VALIDATION_ERROR',
      400,
    )
  }

  if (numberValue > 200) {
    throw new CollectionServiceError(
      'limit must be 200 or less.',
      'COLLECTION_VALIDATION_ERROR',
      400,
    )
  }

  return numberValue
}

function parseOffset(value: unknown) {
  if (value === undefined || value === null || value === '') {
    return 0
  }

  const numberValue = Number(value)
  if (!Number.isInteger(numberValue) || numberValue < 0) {
    throw new CollectionServiceError(
      'offset must be a nonnegative whole number.',
      'COLLECTION_VALIDATION_ERROR',
      400,
    )
  }

  return numberValue
}

function normalizeInput(input: CollectionInput = {}) {
  return {
    search: typeof input.search === 'string' ? input.search.trim() : '',
    searchKey: typeof input.search === 'string' ? normalizeSearchKey(input.search) : '',
    limit: parseLimit(input.limit),
    offset: parseOffset(input.offset),
  }
}

function decimalToMillionths(value: unknown): bigint | null {
  if (value === undefined || value === null || value === '') {
    return null
  }

  const text = String(value).trim()
  const match = text.match(/^(\d+)(?:\.(\d+))?$/)

  if (!match) {
    return null
  }

  const fraction = match[2] ?? ''
  const millionthsText = fraction.slice(0, 6).padEnd(6, '0')
  const roundingDigit = Number(fraction[6] ?? '0')

  return (
    BigInt(match[1]) * 1_000_000n +
    BigInt(Number(millionthsText)) +
    BigInt(roundingDigit >= 5 ? 1 : 0)
  )
}

function formatMillionths(value: bigint) {
  const sign = value < 0n ? '-' : ''
  const absoluteValue = value < 0n ? -value : value
  const dollars = absoluteValue / 1_000_000n
  const fraction = String(absoluteValue % 1_000_000n).padStart(6, '0')

  return `${sign}${dollars}.${fraction}`
}

function divideRoundHalfUp(numerator: bigint, denominator: number) {
  const denominatorBigInt = BigInt(denominator)

  if (numerator >= 0n) {
    return (numerator * 2n + denominatorBigInt) / (2n * denominatorBigInt)
  }

  const absoluteRounded = ((-numerator) * 2n + denominatorBigInt) / (2n * denominatorBigInt)
  return -absoluteRounded
}

function effectiveDate(lot: LotRecord) {
  return lot.receivedDateSnapshot ?? lot.purchaseDateSnapshot
}

function minDate(left: Date | null, right: Date | null) {
  if (!left) {
    return right
  }

  if (!right) {
    return left
  }

  return right < left ? right : left
}

function dateString(date: Date | null) {
  return date ? date.toISOString() : null
}

function issueKey(issue: InventoryIssue) {
  return [
    issue.code,
    issue.lotId ?? '',
    issue.catalogCigarId ?? '',
    issue.storageLocationId ?? '',
    issue.storageSubLocationId ?? '',
  ].join(':')
}

function addIssue(
  target: { issues: InventoryIssue[]; issueKeys: Set<string> },
  issue: InventoryIssue,
) {
  const key = issueKey(issue)

  if (target.issueKeys.has(key)) {
    return
  }

  target.issueKeys.add(key)
  target.issues.push(issue)
}

function addResponseIssue(
  issues: InventoryIssue[],
  issueKeys: Set<string>,
  issue: InventoryIssue,
) {
  const key = issueKey(issue)

  if (issueKeys.has(key)) {
    return
  }

  issueKeys.add(key)
  issues.push(issue)
}

function costPerCigarMillionths(
  lot: LotRecord,
  item: CollectionItemInternal,
) {
  const snapshotCost = decimalToMillionths(lot.costPerCigarSnapshot)
  if (snapshotCost !== null) {
    return snapshotCost
  }

  const allocatedCost = decimalToMillionths(lot.allocatedCostPerCigar)
  if (allocatedCost !== null) {
    return allocatedCost
  }

  const actualCost = decimalToMillionths(lot.actualCostPerCigar)
  if (actualCost !== null) {
    addIssue(item, {
      code: 'COST_FALLBACK_USED',
      message:
        'Actual cost per cigar was used because historical true-cost fields were unavailable.',
      severity: 'WARNING',
      lotId: lot.id,
      catalogCigarId: item.catalogCigar.id,
    })
    return actualCost
  }

  addIssue(item, {
    code: 'COST_DATA_MISSING',
    message: 'Cost data is missing for this lot, so cost metrics cannot be fully calculated.',
    severity: 'WARNING',
    lotId: lot.id,
    catalogCigarId: item.catalogCigar.id,
  })
  return null
}

function msrpPerCigarMillionths(
  lot: LotRecord,
  item: CollectionItemInternal,
) {
  const snapshotMsrp = decimalToMillionths(lot.msrpPerCigarSnapshot)
  if (snapshotMsrp !== null) {
    return snapshotMsrp
  }

  const lotMsrp = decimalToMillionths(lot.msrpPerCigar)
  if (lotMsrp !== null) {
    return lotMsrp
  }

  const catalogMsrp = decimalToMillionths(item.catalogCigar.msrp)
  if (catalogMsrp !== null) {
    addIssue(item, {
      code: 'MSRP_CATALOG_FALLBACK_USED',
      message: 'Catalog MSRP was used because Lot snapshot MSRP fields were unavailable.',
      severity: 'WARNING',
      lotId: lot.id,
      catalogCigarId: item.catalogCigar.id,
    })
    return catalogMsrp
  }

  addIssue(item, {
    code: 'MSRP_DATA_MISSING',
    message: 'MSRP data is missing for this lot, so MSRP and savings metrics cannot be fully calculated.',
    severity: 'WARNING',
    lotId: lot.id,
    catalogCigarId: item.catalogCigar.id,
  })
  return null
}

function catalogSearchText(catalogCigar: CatalogCigarRecord) {
  return normalizeSearchKey(
    [
      catalogCigar.manufacturer,
      catalogCigar.manufacturerKey,
      catalogCigar.series,
      catalogCigar.seriesKey,
      catalogCigar.vitola,
      catalogCigar.vitolaKey,
      catalogCigar.wrapper,
      catalogCigar.wrapperKey,
      catalogCigar.shape,
      catalogCigar.length === null || catalogCigar.length === undefined
        ? null
        : String(catalogCigar.length),
      catalogCigar.ringGauge === null ? null : String(catalogCigar.ringGauge),
    ].join(' '),
  )
}

function searchMatchInfo(
  item: CollectionItemInternal,
  searchKey: string,
  sortedLocations = locationSummaries(item),
): SearchMatchInfo {
  if (!searchKey) {
    return {
      cigarMatch: false,
      locationMatch: false,
      searchMatchType: null,
      matchingLocationQuantity: 0,
      matchingLocations: [],
    }
  }

  const cigarMatch = catalogSearchText(item.catalogCigar).includes(searchKey)
  const matchingLocations = sortedLocations.filter((location) =>
    normalizeSearchKey(
      [
        location.storageLocationName,
        location.storageSubLocationName,
        location.storageSubLocationKind,
      ].join(' '),
    ).includes(searchKey),
  )
  const locationMatch = matchingLocations.length > 0
  const searchMatchType =
    cigarMatch && locationMatch
      ? 'BOTH'
      : cigarMatch
        ? 'CIGAR'
        : locationMatch
          ? 'LOCATION'
          : null

  return {
    cigarMatch,
    locationMatch,
    searchMatchType,
    matchingLocationQuantity: matchingLocations.reduce(
      (total, location) => total + location.quantity,
      0,
    ),
    matchingLocations,
  }
}

function matchesSearch(item: CollectionItemInternal, searchKey: string) {
  if (!searchKey) {
    return true
  }

  const matchInfo = searchMatchInfo(item, searchKey)
  return matchInfo.cigarMatch || matchInfo.locationMatch
}

function sortableText(value: string | null | undefined) {
  return value ?? ''
}

function sortItems(left: CollectionItemInternal, right: CollectionItemInternal) {
  const manufacturer = sortableText(left.catalogCigar.manufacturerKey).localeCompare(
    sortableText(right.catalogCigar.manufacturerKey),
  )
  if (manufacturer !== 0) {
    return manufacturer
  }

  const series = sortableText(left.catalogCigar.seriesKey).localeCompare(
    sortableText(right.catalogCigar.seriesKey),
  )
  if (series !== 0) {
    return series
  }

  const vitola = sortableText(left.catalogCigar.vitolaKey).localeCompare(
    sortableText(right.catalogCigar.vitolaKey),
  )
  if (vitola !== 0) {
    return vitola
  }

  return left.catalogCigar.id - right.catalogCigar.id
}

function locationSummaries(item: CollectionItemInternal): LocationSummary[] {
  return Array.from(item.locationsById.values())
    .sort((left, right) => {
      if (right.quantity !== left.quantity) {
        return right.quantity - left.quantity
      }

      const storageLocationName = left.storageLocationName.localeCompare(
        right.storageLocationName,
      )
      if (storageLocationName !== 0) {
        return storageLocationName
      }

      if (left.storageSubLocationDisplayOrder !== right.storageSubLocationDisplayOrder) {
        return left.storageSubLocationDisplayOrder - right.storageSubLocationDisplayOrder
      }

      return left.storageSubLocationName.localeCompare(right.storageSubLocationName)
    })
    .map((location) => ({
      storageLocationId: location.storageLocationId,
      storageLocationName: location.storageLocationName,
      storageLocationIsActive: location.storageLocationIsActive,
      storageSubLocationId: location.storageSubLocationId,
      storageSubLocationName: location.storageSubLocationName,
      storageSubLocationKind: location.storageSubLocationKind,
      storageSubLocationIsActive: location.storageSubLocationIsActive,
      quantity: location.quantity,
      lotCount: location.lotIds.size,
      oldestReceivedDate: dateString(location.oldestReceivedDate),
    }))
}

function publicItem(item: CollectionItemInternal, searchKey: string): CollectionItem {
  const sortedLocations = locationSummaries(item)
  const matchInfo = searchMatchInfo(item, searchKey, sortedLocations)
  const weightedAverageCostPerCigar = item.hasCompleteCostData
    ? divideRoundHalfUp(item.costBasisMillionths, item.totalQuantity)
    : null
  const averageMsrpPerCigar = item.hasCompleteMsrpData
    ? divideRoundHalfUp(item.msrpValueMillionths, item.totalQuantity)
    : null
  const totalSavings =
    item.hasCompleteCostData && item.hasCompleteMsrpData
      ? item.msrpValueMillionths - item.costBasisMillionths
      : null
  const savingsPerCigar =
    totalSavings === null ? null : divideRoundHalfUp(totalSavings, item.totalQuantity)

  return {
    catalogCigar: item.catalogCigar,
    totalQuantity: item.totalQuantity,
    lotCount: item.lotIds.size,
    locationCount: item.locationsById.size,
    oldestReceivedDate: dateString(item.oldestReceivedDate),
    weightedAverageCostPerCigar:
      weightedAverageCostPerCigar === null ? null : formatMillionths(weightedAverageCostPerCigar),
    averageMsrpPerCigar:
      averageMsrpPerCigar === null ? null : formatMillionths(averageMsrpPerCigar),
    currentCostBasis: item.hasCompleteCostData ? formatMillionths(item.costBasisMillionths) : null,
    currentMsrpValue: item.hasCompleteMsrpData ? formatMillionths(item.msrpValueMillionths) : null,
    savingsPerCigar: savingsPerCigar === null ? null : formatMillionths(savingsPerCigar),
    totalSavings: totalSavings === null ? null : formatMillionths(totalSavings),
    primaryLocations: sortedLocations.slice(0, 3),
    searchMatchType: matchInfo.searchMatchType,
    matchingLocationQuantity: matchInfo.matchingLocationQuantity,
    matchingLocations: matchInfo.matchingLocations,
    issues: item.issues,
  }
}

function createCollectionItem(catalogCigar: CatalogCigarRecord): CollectionItemInternal {
  return {
    catalogCigar,
    totalQuantity: 0,
    lotIds: new Set<number>(),
    oldestReceivedDate: null,
    costBasisMillionths: 0n,
    msrpValueMillionths: 0n,
    hasCompleteCostData: true,
    hasCompleteMsrpData: true,
    locationsById: new Map<number, LocationAccumulator>(),
    issues: [],
    issueKeys: new Set<string>(),
  }
}

function addBalanceToItem(item: CollectionItemInternal, balance: PositiveBalanceRecord) {
  const lot = balance.lot
  const balanceDate = effectiveDate(lot)

  item.totalQuantity += balance.quantity
  item.lotIds.add(lot.id)
  item.oldestReceivedDate = minDate(item.oldestReceivedDate, balanceDate)

  const cost = costPerCigarMillionths(lot, item)
  if (cost === null) {
    item.hasCompleteCostData = false
  } else {
    item.costBasisMillionths += BigInt(balance.quantity) * cost
  }

  const msrp = msrpPerCigarMillionths(lot, item)
  if (msrp === null) {
    item.hasCompleteMsrpData = false
  } else {
    item.msrpValueMillionths += BigInt(balance.quantity) * msrp
  }

  const subLocation = balance.storageSubLocation
  const storageLocation = subLocation.storageLocation
  const locationKey = subLocation.id
  let location = item.locationsById.get(locationKey)

  if (!location) {
    location = {
      storageLocationId: storageLocation?.id ?? subLocation.storageLocationId,
      storageLocationName: storageLocation?.name ?? 'Unknown Humidor',
      storageLocationIsActive: storageLocation?.isActive ?? false,
      storageSubLocationId: subLocation.id,
      storageSubLocationName: subLocation.name,
      storageSubLocationKind: subLocation.kind,
      storageSubLocationIsActive: subLocation.isActive,
      storageSubLocationDisplayOrder: subLocation.displayOrder,
      quantity: 0,
      lotIds: new Set<number>(),
      oldestReceivedDate: null,
    }
    item.locationsById.set(locationKey, location)
  }

  location.quantity += balance.quantity
  location.lotIds.add(lot.id)
  location.oldestReceivedDate = minDate(location.oldestReceivedDate, balanceDate)

  if (!item.catalogCigar.isActive) {
    addIssue(item, {
      code: 'ARCHIVED_CATALOG_WITH_INVENTORY',
      message: 'This catalog cigar is archived but has positive inventory.',
      severity: 'WARNING',
      catalogCigarId: item.catalogCigar.id,
    })
  }

  if (!location.storageLocationIsActive || !location.storageSubLocationIsActive) {
    addIssue(item, {
      code: 'ARCHIVED_LOCATION_WITH_INVENTORY',
      message: 'This inventory is stored in an archived humidor or sub-location.',
      severity: 'WARNING',
      lotId: lot.id,
      catalogCigarId: item.catalogCigar.id,
      storageLocationId: location.storageLocationId,
      storageSubLocationId: location.storageSubLocationId,
    })
  }
}

function addLotBalanceMismatchIssues(
  itemsByCatalogCigarId: Map<number, CollectionItemInternal>,
  positiveQuantityByLotId: Map<number, number>,
  lotById: Map<number, LotRecord>,
) {
  for (const [lotId, positiveQuantity] of positiveQuantityByLotId) {
    const lot = lotById.get(lotId)
    if (!lot?.catalogCigarId) {
      continue
    }

    if (lot.currentQuantity !== positiveQuantity) {
      const item = itemsByCatalogCigarId.get(lot.catalogCigarId)
      if (!item) {
        continue
      }

      addIssue(item, {
        code: 'LOT_BALANCE_MISMATCH',
        message:
          'The sum of positive location balances does not match the Lot current quantity cache.',
        severity: 'WARNING',
        lotId,
        catalogCigarId: lot.catalogCigarId,
      })
    }
  }
}

function currentLotMatchesSearch(lot: LotRecord, searchKey: string) {
  if (!searchKey) {
    return true
  }

  return lot.catalogCigar ? catalogSearchText(lot.catalogCigar).includes(searchKey) : false
}

function mapDatabaseError(error: unknown): never {
  if (error instanceof CollectionServiceError) {
    throw error
  }

  throw new CollectionServiceError(
    'The collection request could not be completed.',
    'COLLECTION_DATABASE_ERROR',
    500,
  )
}

export async function getCollection(input: CollectionInput = {}) {
  const prisma = getPrismaClient()

  try {
    const data = normalizeInput(input)

    const [positiveBalances, lotsWithCurrentQuantity] = await Promise.all([
      prisma.lotLocationBalance.findMany({
        where: { quantity: { gt: 0 } },
        include: {
          lot: {
            include: {
              catalogCigar: true,
            },
          },
          storageSubLocation: {
            include: {
              storageLocation: true,
            },
          },
        },
      }),
      prisma.lot.findMany({
        where: { currentQuantity: { gt: 0 } },
        include: {
          catalogCigar: true,
          locationBalances: {
            where: { quantity: { gt: 0 } },
            select: {
              id: true,
              quantity: true,
            },
          },
        },
      }),
    ])

    const itemsByCatalogCigarId = new Map<number, CollectionItemInternal>()
    const positiveQuantityByLotId = new Map<number, number>()
    const lotById = new Map<number, LotRecord>()
    const responseIssues: InventoryIssue[] = []
    const responseIssueKeys = new Set<string>()

    for (const balance of positiveBalances as PositiveBalanceRecord[]) {
      const lot = balance.lot
      lotById.set(lot.id, lot)
      positiveQuantityByLotId.set(
        lot.id,
        (positiveQuantityByLotId.get(lot.id) ?? 0) + balance.quantity,
      )

      if (!lot.catalogCigar) {
        addResponseIssue(responseIssues, responseIssueKeys, {
          code: 'CATALOG_CIGAR_MISSING',
          message: 'A positive location balance belongs to a Lot without a Catalog cigar.',
          severity: 'WARNING',
          lotId: lot.id,
        })
        continue
      }

      let item = itemsByCatalogCigarId.get(lot.catalogCigar.id)
      if (!item) {
        item = createCollectionItem(lot.catalogCigar)
        itemsByCatalogCigarId.set(lot.catalogCigar.id, item)
      }

      addBalanceToItem(item, balance)
    }

    addLotBalanceMismatchIssues(itemsByCatalogCigarId, positiveQuantityByLotId, lotById)

    for (const lot of lotsWithCurrentQuantity as Array<LotRecord & { locationBalances: unknown[] }>) {
      if ((lot.locationBalances?.length ?? 0) > 0 || !currentLotMatchesSearch(lot, data.searchKey)) {
        continue
      }

      addResponseIssue(responseIssues, responseIssueKeys, {
        code: 'LOT_CURRENT_WITHOUT_LOCATION_BALANCE',
        message: 'Lot current quantity is positive, but the Lot has no positive location balance.',
        severity: 'WARNING',
        lotId: lot.id,
        catalogCigarId: lot.catalogCigarId ?? undefined,
      })
    }

    const filteredItems = Array.from(itemsByCatalogCigarId.values())
      .filter((item) => matchesSearch(item, data.searchKey))
      .sort(sortItems)

    for (const item of filteredItems) {
      for (const issue of item.issues) {
        addResponseIssue(responseIssues, responseIssueKeys, issue)
      }
    }

    const summaryLocationIds = new Set<number>()
    const searchSummary = {
      search: data.search,
      matchedItemCount: filteredItems.length,
      matchedLocationQuantity: data.searchKey
        ? filteredItems.reduce(
            (total, item) =>
              total + searchMatchInfo(item, data.searchKey).matchingLocationQuantity,
            0,
          )
        : 0,
    }
    const summary = filteredItems.reduce(
      (totals, item) => {
        totals.totalQuantity += item.totalQuantity
        totals.lotCount += item.lotIds.size

        for (const locationId of item.locationsById.keys()) {
          summaryLocationIds.add(locationId)
        }

        return totals
      },
      {
        totalQuantity: 0,
        uniqueCigarCount: filteredItems.length,
        lotCount: 0,
        locationCount: 0,
      },
    )
    summary.locationCount = summaryLocationIds.size

    const pagedItems = filteredItems
      .slice(data.offset, data.offset + data.limit)
      .map((item) => publicItem(item, data.searchKey))

    return {
      summary,
      searchSummary,
      items: pagedItems,
      total: filteredItems.length,
      limit: data.limit,
      offset: data.offset,
      issues: responseIssues,
    }
  } catch (error) {
    mapDatabaseError(error)
  }
}
