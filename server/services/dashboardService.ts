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
import {
  decimalToMillionths,
  formatMillionths,
  resolveLotCostPerCigar,
  resolveLotMsrpPerCigar,
  subtractMillionths,
  weightedMillionthsMetric,
} from '../utils/inventoryAccounting.ts'

export type DashboardServiceErrorCode =
  | 'DASHBOARD_DATABASE_ERROR'
  | 'DASHBOARD_CALCULATION_ERROR'

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

type CatalogCigarSummary = Pick<
  CatalogCigar,
  'id' | 'manufacturer' | 'series' | 'vitola' | 'shape' | 'length' | 'ringGauge' | 'wrapper'
>

type LocationSnapshot = {
  storageLocationId: number
  storageLocationName: string
  storageSubLocationId: number
  storageSubLocationName: string
  storageSubLocationKind: string
  isArchived: boolean
}

type DashboardActivity = {
  id: number
  eventType: string
  quantity: number
  eventDate: string
  createdAt: string
  lotId: number
  catalogCigar: CatalogCigarSummary | null
  sourceLocation: LocationSnapshot | null
  destinationLocation: LocationSnapshot | null
  costPerCigarAtEvent: string | null
  msrpPerCigarAtEvent: string | null
  notes: string | null
}

type RemovalMetric = {
  quantity: number
  totalCost: string | null
  totalMsrp: string | null
  totalSavings: string | null
  averageCostPerCigar: string | null
  averageMsrpPerCigar: string | null
  quantityWithKnownCost: number
  quantityMissingCost: number
  quantityWithKnownMsrp: number
  quantityMissingMsrp: number
}

type DashboardHumidor = {
  storageLocation: {
    id: number
    name: string
    capacity: number | null
    isActive: boolean
  }
  totalQuantity: number
  uniqueCigarCount: number
  oldestReceivedDate: string | null
  capacityUsedPercent: number | null
  averageMsrpPerCigar: string | null
  quantityMissingMsrp: number
  issues: InventoryIssue[]
}

type DashboardResponse = {
  currentCollection: {
    totalQuantity: number
    uniqueCigarCount: number
    lotCount: number
    currentCostBasis: string | null
    currentMsrpValue: string | null
    totalSavings: string | null
    averageCostPerCigar: string | null
    averageMsrpPerCigar: string | null
    quantityMissingCost: number
    quantityMissingMsrp: number
    issues: InventoryIssue[]
  }
  smoking: RemovalMetric
  gifted: RemovalMetric
  discarded: RemovalMetric
  humidors: DashboardHumidor[]
  recentActivity: DashboardActivity[]
  issues: InventoryIssue[]
}

type PositiveBalanceRecord = LotLocationBalance & {
  lot: Lot & {
    catalogCigar: CatalogCigar | null
  }
  storageSubLocation: StorageSubLocation & {
    storageLocation: StorageLocation | null
  }
}

type StorageLocationRecord = Pick<
  StorageLocation,
  'id' | 'name' | 'capacity' | 'isActive'
>

type RecentInventoryEvent = InventoryEvent & {
  lot: (Lot & { catalogCigar: CatalogCigar | null }) | null
  fromStorageSubLocation:
    | (StorageSubLocation & { storageLocation: StorageLocation | null })
    | null
  toStorageSubLocation:
    | (StorageSubLocation & { storageLocation: StorageLocation | null })
    | null
}

type HumidorAccumulator = {
  storageLocation: StorageLocationRecord
  totalQuantity: number
  cigarIds: Set<number>
  oldestReceivedDate: Date | null
  msrpEntries: Array<{ quantity: number; value: bigint | null }>
  issues: InventoryIssue[]
  issueKeys: Set<string>
}

export class DashboardServiceError extends Error {
  code: DashboardServiceErrorCode
  statusCode: number

  constructor(message: string, code: DashboardServiceErrorCode, statusCode = 500) {
    super(message)
    this.name = 'DashboardServiceError'
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

function dateToIso(date: Date | null) {
  return date ? date.toISOString() : null
}

function effectiveLotDate(lot: Lot) {
  return lot.receivedDateSnapshot ?? lot.purchaseDateSnapshot ?? lot.purchaseDate ?? null
}

function minDate(current: Date | null, candidate: Date | null) {
  if (!candidate) {
    return current
  }

  if (!current || candidate < current) {
    return candidate
  }

  return current
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

function responseIssueKey(issue: InventoryIssue) {
  if (
    issue.code === 'LOT_BALANCE_MISMATCH' ||
    issue.code === 'COST_DATA_MISSING' ||
    issue.code === 'MSRP_DATA_MISSING' ||
    issue.code === 'ARCHIVED_CATALOG_WITH_INVENTORY' ||
    issue.code === 'CATALOG_CIGAR_MISSING'
  ) {
    return [
      issue.code,
      issue.lotId ?? '',
      issue.catalogCigarId ?? '',
    ].join(':')
  }

  return issueKey(issue)
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
  const key = responseIssueKey(issue)

  if (issueKeys.has(key)) {
    return
  }

  issueKeys.add(key)
  issues.push(issue)
}

function formatMetric(value: bigint | null) {
  return value === null ? null : formatMillionths(value)
}

function formatDecimalValue(value: unknown) {
  const millionths = decimalToMillionths(value)
  return millionths === null ? null : formatMillionths(millionths)
}

function capacityUsedPercent(totalQuantity: number, capacity: number | null) {
  if (!Number.isFinite(capacity) || capacity === null || capacity <= 0) {
    return null
  }

  return Math.round((totalQuantity / capacity) * 1000) / 10
}

function catalogSummary(catalogCigar: CatalogCigar | null): CatalogCigarSummary | null {
  if (!catalogCigar) {
    return null
  }

  return {
    id: catalogCigar.id,
    manufacturer: catalogCigar.manufacturer,
    series: catalogCigar.series,
    vitola: catalogCigar.vitola,
    shape: catalogCigar.shape,
    length: catalogCigar.length,
    ringGauge: catalogCigar.ringGauge,
    wrapper: catalogCigar.wrapper,
  }
}

function locationSnapshot(
  subLocation: RecentInventoryEvent['fromStorageSubLocation'],
): LocationSnapshot | null {
  if (!subLocation || !subLocation.storageLocation) {
    return null
  }

  return {
    storageLocationId: subLocation.storageLocation.id,
    storageLocationName: subLocation.storageLocation.name,
    storageSubLocationId: subLocation.id,
    storageSubLocationName: subLocation.name,
    storageSubLocationKind: subLocation.kind,
    isArchived: !subLocation.isActive || !subLocation.storageLocation.isActive,
  }
}

function createHumidorAccumulator(location: StorageLocationRecord): HumidorAccumulator {
  return {
    storageLocation: location,
    totalQuantity: 0,
    cigarIds: new Set<number>(),
    oldestReceivedDate: null,
    msrpEntries: [],
    issues: [],
    issueKeys: new Set<string>(),
  }
}

function sortHumidors(left: DashboardHumidor, right: DashboardHumidor) {
  if (left.storageLocation.isActive !== right.storageLocation.isActive) {
    return left.storageLocation.isActive ? -1 : 1
  }

  return (
    left.storageLocation.name.localeCompare(right.storageLocation.name, undefined, {
      numeric: true,
      sensitivity: 'base',
    }) ||
    left.storageLocation.id - right.storageLocation.id
  )
}

function removalMetric(events: InventoryEvent[]): RemovalMetric {
  const quantity = events.reduce((total, event) => total + event.quantity, 0)
  const costMetric = weightedMillionthsMetric(
    events.map((event) => ({
      quantity: event.quantity,
      value: decimalToMillionths(event.costPerCigarAtEvent),
    })),
  )
  const msrpMetric = weightedMillionthsMetric(
    events.map((event) => ({
      quantity: event.quantity,
      value: decimalToMillionths(event.msrpPerCigarAtEvent),
    })),
  )

  const totalCost = quantity === 0 ? null : costMetric.completeTotalValue
  const totalMsrp = quantity === 0 ? null : msrpMetric.completeTotalValue
  const totalSavings = quantity === 0 ? null : subtractMillionths(totalMsrp, totalCost)

  return {
    quantity,
    totalCost: formatMetric(totalCost),
    totalMsrp: formatMetric(totalMsrp),
    totalSavings: formatMetric(totalSavings),
    averageCostPerCigar:
      quantity === 0 ? null : formatMetric(costMetric.weightedAverage),
    averageMsrpPerCigar:
      quantity === 0 ? null : formatMetric(msrpMetric.weightedAverage),
    quantityWithKnownCost: costMetric.quantityWithKnownValue,
    quantityMissingCost: costMetric.quantityMissingValue,
    quantityWithKnownMsrp: msrpMetric.quantityWithKnownValue,
    quantityMissingMsrp: msrpMetric.quantityMissingValue,
  }
}

function currentCollectionMetrics(
  positiveBalances: PositiveBalanceRecord[],
  responseIssues: InventoryIssue[],
  responseIssueKeys: Set<string>,
) {
  const cigarIds = new Set<number>()
  const lotIds = new Set<number>()
  const positiveQuantityByLotId = new Map<number, number>()
  const lotById = new Map<number, PositiveBalanceRecord['lot']>()
  const costEntries: Array<{ quantity: number; value: bigint | null }> = []
  const msrpEntries: Array<{ quantity: number; value: bigint | null }> = []
  const currentIssues: InventoryIssue[] = []
  const currentIssueKeys = new Set<string>()
  let totalQuantity = 0

  for (const balance of positiveBalances) {
    const lot = balance.lot
    const catalogCigar = lot.catalogCigar
    const subLocation = balance.storageSubLocation
    const storageLocation = subLocation.storageLocation

    totalQuantity += balance.quantity
    lotIds.add(lot.id)
    lotById.set(lot.id, lot)
    positiveQuantityByLotId.set(
      lot.id,
      (positiveQuantityByLotId.get(lot.id) ?? 0) + balance.quantity,
    )

    if (catalogCigar) {
      cigarIds.add(catalogCigar.id)

      if (!catalogCigar.isActive) {
        addIssue(
          { issues: currentIssues, issueKeys: currentIssueKeys },
          {
            code: 'ARCHIVED_CATALOG_WITH_INVENTORY',
            message: 'An archived Catalog cigar has current inventory.',
            severity: 'WARNING',
            lotId: lot.id,
            catalogCigarId: catalogCigar.id,
          },
        )
      }
    } else {
      addIssue(
        { issues: currentIssues, issueKeys: currentIssueKeys },
        {
          code: 'CATALOG_CIGAR_MISSING',
          message: 'A positive inventory balance belongs to a lot without a Catalog cigar.',
          severity: 'WARNING',
          lotId: lot.id,
        },
      )
    }

    if (!storageLocation?.isActive || !subLocation.isActive) {
      addIssue(
        { issues: currentIssues, issueKeys: currentIssueKeys },
        {
          code: 'ARCHIVED_LOCATION_WITH_INVENTORY',
          message: 'An archived humidor or section contains current inventory.',
          severity: 'WARNING',
          lotId: lot.id,
          catalogCigarId: catalogCigar?.id,
          storageLocationId: storageLocation?.id ?? subLocation.storageLocationId,
          storageSubLocationId: subLocation.id,
        },
      )
    }

    const cost = resolveLotCostPerCigar(lot)
    const msrp = resolveLotMsrpPerCigar(lot, catalogCigar, {
      allowCatalogFallback: false,
    })

    if (cost.value === null) {
      addIssue(
        { issues: currentIssues, issueKeys: currentIssueKeys },
        {
          code: 'COST_DATA_MISSING',
          message: 'Cost data is missing for current inventory.',
          severity: 'WARNING',
          lotId: lot.id,
          catalogCigarId: catalogCigar?.id,
        },
      )
    }

    if (msrp.value === null) {
      addIssue(
        { issues: currentIssues, issueKeys: currentIssueKeys },
        {
          code: 'MSRP_DATA_MISSING',
          message: 'MSRP data is missing for current inventory.',
          severity: 'WARNING',
          lotId: lot.id,
          catalogCigarId: catalogCigar?.id,
        },
      )
    }

    costEntries.push({ quantity: balance.quantity, value: cost.value })
    msrpEntries.push({ quantity: balance.quantity, value: msrp.value })
  }

  for (const [lotId, positiveQuantity] of positiveQuantityByLotId) {
    const lot = lotById.get(lotId)

    if (!lot || lot.currentQuantity === positiveQuantity) {
      continue
    }

    addIssue(
      { issues: currentIssues, issueKeys: currentIssueKeys },
      {
        code: 'LOT_BALANCE_MISMATCH',
        message: 'A lot current quantity does not match its positive location balances.',
        severity: 'WARNING',
        lotId,
        catalogCigarId: lot.catalogCigarId ?? undefined,
      },
    )
  }

  const costMetric = weightedMillionthsMetric(costEntries)
  const msrpMetric = weightedMillionthsMetric(msrpEntries)
  const totalSavings = subtractMillionths(
    msrpMetric.completeTotalValue,
    costMetric.completeTotalValue,
  )

  for (const issue of currentIssues) {
    addResponseIssue(responseIssues, responseIssueKeys, issue)
  }

  return {
    totalQuantity,
    uniqueCigarCount: cigarIds.size,
    lotCount: lotIds.size,
    currentCostBasis: formatMetric(costMetric.completeTotalValue),
    currentMsrpValue: formatMetric(msrpMetric.completeTotalValue),
    totalSavings: formatMetric(totalSavings),
    averageCostPerCigar: formatMetric(costMetric.weightedAverage),
    averageMsrpPerCigar: formatMetric(msrpMetric.weightedAverage),
    quantityMissingCost: costMetric.quantityMissingValue,
    quantityMissingMsrp: msrpMetric.quantityMissingValue,
    issues: currentIssues,
  }
}

function humidorOverview(
  positiveBalances: PositiveBalanceRecord[],
  activeHumidors: StorageLocationRecord[],
  responseIssues: InventoryIssue[],
  responseIssueKeys: Set<string>,
): DashboardHumidor[] {
  const humidorById = new Map<number, HumidorAccumulator>()
  const positiveQuantityByLotId = new Map<number, number>()
  const balancesByLotId = new Map<number, PositiveBalanceRecord[]>()
  const lotById = new Map<number, PositiveBalanceRecord['lot']>()

  for (const humidor of activeHumidors) {
    humidorById.set(humidor.id, createHumidorAccumulator(humidor))
  }

  for (const balance of positiveBalances) {
    const subLocation = balance.storageSubLocation
    const storageLocation = subLocation.storageLocation

    if (!storageLocation) {
      continue
    }

    let humidor = humidorById.get(storageLocation.id)
    if (!humidor) {
      humidor = createHumidorAccumulator(storageLocation)
      humidorById.set(storageLocation.id, humidor)
    }

    const lot = balance.lot
    const catalogCigar = lot.catalogCigar
    const lotDate = effectiveLotDate(lot)
    lotById.set(lot.id, lot)
    positiveQuantityByLotId.set(
      lot.id,
      (positiveQuantityByLotId.get(lot.id) ?? 0) + balance.quantity,
    )
    balancesByLotId.set(lot.id, [
      ...(balancesByLotId.get(lot.id) ?? []),
      balance,
    ])

    humidor.totalQuantity += balance.quantity
    humidor.oldestReceivedDate = minDate(humidor.oldestReceivedDate, lotDate)

    if (catalogCigar) {
      humidor.cigarIds.add(catalogCigar.id)

      if (!catalogCigar.isActive) {
        addIssue(humidor, {
          code: 'ARCHIVED_CATALOG_WITH_INVENTORY',
          message: 'An archived Catalog cigar has current inventory.',
          severity: 'WARNING',
          lotId: lot.id,
          catalogCigarId: catalogCigar.id,
          storageLocationId: storageLocation.id,
          storageSubLocationId: subLocation.id,
        })
      }
    } else {
      addIssue(humidor, {
        code: 'CATALOG_CIGAR_MISSING',
        message: 'A positive inventory balance belongs to a lot without a Catalog cigar.',
        severity: 'WARNING',
        lotId: lot.id,
        storageLocationId: storageLocation.id,
        storageSubLocationId: subLocation.id,
      })
    }

    if (!storageLocation.isActive || !subLocation.isActive) {
      addIssue(humidor, {
        code: 'ARCHIVED_LOCATION_WITH_INVENTORY',
        message: 'An archived humidor or section contains current inventory.',
        severity: 'WARNING',
        lotId: lot.id,
        catalogCigarId: catalogCigar?.id,
        storageLocationId: storageLocation.id,
        storageSubLocationId: subLocation.id,
      })
    }

    const msrp = resolveLotMsrpPerCigar(lot, catalogCigar, {
      allowCatalogFallback: false,
    })
    if (msrp.value === null) {
      addIssue(humidor, {
        code: 'MSRP_DATA_MISSING',
        message: 'MSRP data is missing for current inventory.',
        severity: 'WARNING',
        lotId: lot.id,
        catalogCigarId: catalogCigar?.id,
        storageLocationId: storageLocation.id,
        storageSubLocationId: subLocation.id,
      })
    }

    humidor.msrpEntries.push({ quantity: balance.quantity, value: msrp.value })
  }

  for (const [lotId, positiveQuantity] of positiveQuantityByLotId) {
    const lot = lotById.get(lotId)

    if (!lot || lot.currentQuantity === positiveQuantity) {
      continue
    }

    for (const balance of balancesByLotId.get(lotId) ?? []) {
      const storageLocation = balance.storageSubLocation.storageLocation

      if (!storageLocation) {
        continue
      }

      const humidor = humidorById.get(storageLocation.id)

      if (!humidor) {
        continue
      }

      addIssue(humidor, {
        code: 'LOT_BALANCE_MISMATCH',
        message: 'A lot current quantity does not match its positive location balances.',
        severity: 'WARNING',
        lotId,
        catalogCigarId: lot.catalogCigarId ?? undefined,
        storageLocationId: storageLocation.id,
        storageSubLocationId: balance.storageSubLocationId,
      })
    }
  }

  const dashboardHumidors = Array.from(humidorById.values()).map((humidor) => {
    const msrpMetric = weightedMillionthsMetric(humidor.msrpEntries)

    for (const issue of humidor.issues) {
      addResponseIssue(responseIssues, responseIssueKeys, issue)
    }

    return {
      storageLocation: {
        id: humidor.storageLocation.id,
        name: humidor.storageLocation.name,
        capacity: humidor.storageLocation.capacity,
        isActive: humidor.storageLocation.isActive,
      },
      totalQuantity: humidor.totalQuantity,
      uniqueCigarCount: humidor.cigarIds.size,
      oldestReceivedDate: dateToIso(humidor.oldestReceivedDate),
      capacityUsedPercent: capacityUsedPercent(
        humidor.totalQuantity,
        humidor.storageLocation.capacity,
      ),
      averageMsrpPerCigar: formatMetric(msrpMetric.weightedAverage),
      quantityMissingMsrp: msrpMetric.quantityMissingValue,
      issues: humidor.issues,
    }
  })

  return dashboardHumidors.sort(sortHumidors)
}

function recentActivity(events: RecentInventoryEvent[]): DashboardActivity[] {
  return events.map((event) => ({
    id: event.id,
    eventType: event.eventType,
    quantity: event.quantity,
    eventDate: event.eventDate.toISOString(),
    createdAt: event.createdAt.toISOString(),
    lotId: event.lotId,
    catalogCigar: catalogSummary(event.lot?.catalogCigar ?? null),
    sourceLocation: locationSnapshot(event.fromStorageSubLocation),
    destinationLocation: locationSnapshot(event.toStorageSubLocation),
    costPerCigarAtEvent: formatDecimalValue(event.costPerCigarAtEvent),
    msrpPerCigarAtEvent: formatDecimalValue(event.msrpPerCigarAtEvent),
    notes: event.notes,
  }))
}

function mapDashboardError(error: unknown): never {
  if (error instanceof DashboardServiceError) {
    throw error
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    throw new DashboardServiceError(
      'The Dashboard could not be loaded.',
      'DASHBOARD_DATABASE_ERROR',
      500,
    )
  }

  throw new DashboardServiceError(
    'The Dashboard calculations could not be completed.',
    'DASHBOARD_CALCULATION_ERROR',
    500,
  )
}

export async function getDashboard(): Promise<DashboardResponse> {
  const prisma = getPrismaClient()

  try {
    const [
      positiveBalances,
      activeHumidors,
      removalEvents,
      recentEvents,
    ] = await Promise.all([
      prisma.lotLocationBalance.findMany({
        where: {
          quantity: {
            gt: 0,
          },
        },
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
      prisma.storageLocation.findMany({
        where: {
          isActive: true,
        },
        select: {
          id: true,
          name: true,
          capacity: true,
          isActive: true,
        },
      }),
      prisma.inventoryEvent.findMany({
        where: {
          eventType: {
            in: ['SMOKED', 'GIFTED', 'DISCARDED'],
          },
        },
      }),
      prisma.inventoryEvent.findMany({
        where: {
          eventType: {
            in: ['INITIAL_PLACEMENT', 'MOVE', 'SMOKED', 'GIFTED', 'DISCARDED'],
          },
        },
        include: {
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
          toStorageSubLocation: {
            include: {
              storageLocation: true,
            },
          },
        },
        orderBy: [
          { createdAt: 'desc' },
          { eventDate: 'desc' },
          { id: 'desc' },
        ],
        take: 10,
      }),
    ])

    const responseIssues: InventoryIssue[] = []
    const responseIssueKeys = new Set<string>()
    const balances = positiveBalances as PositiveBalanceRecord[]
    const currentCollection = currentCollectionMetrics(
      balances,
      responseIssues,
      responseIssueKeys,
    )
    const humidors = humidorOverview(
      balances,
      activeHumidors as StorageLocationRecord[],
      responseIssues,
      responseIssueKeys,
    )

    const eventsByType = removalEvents.reduce(
      (groups, event) => {
        if (
          event.eventType === 'SMOKED' ||
          event.eventType === 'GIFTED' ||
          event.eventType === 'DISCARDED'
        ) {
          groups[event.eventType].push(event)
        }

        return groups
      },
      {
        SMOKED: [] as InventoryEvent[],
        GIFTED: [] as InventoryEvent[],
        DISCARDED: [] as InventoryEvent[],
      },
    )

    return {
      currentCollection,
      smoking: removalMetric(eventsByType.SMOKED),
      gifted: removalMetric(eventsByType.GIFTED),
      discarded: removalMetric(eventsByType.DISCARDED),
      humidors,
      recentActivity: recentActivity(recentEvents as RecentInventoryEvent[]),
      issues: responseIssues,
    }
  } catch (error) {
    mapDashboardError(error)
  }
}
