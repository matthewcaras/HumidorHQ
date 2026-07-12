import { PrismaClient } from '../../src/generated/prisma/client.ts'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import { CollectionServiceError } from './collectionService.ts'

type CollectionPrismaClient = any

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

type StorageLocationRecord = {
  id: number
  name: string
  capacity: number | null
  notes: string | null
  organizationType: string
  displayOrder: number
  isActive: boolean
  subLocations: StorageSubLocationRecord[]
}

type StorageSubLocationRecord = {
  id: number
  storageLocationId: number
  name: string
  kind: string
  displayOrder: number
  isActive: boolean
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
  purchaseDate: Date | null
  catalogCigar: CatalogCigarRecord | null
}

type PositiveBalanceRecord = {
  id: number
  lotId: number
  storageSubLocationId: number
  quantity: number
  lot: LotRecord
  storageSubLocation: StorageSubLocationRecord & {
    storageLocation: Omit<StorageLocationRecord, 'subLocations'> | null
  }
}

type SectionCigarAccumulator = {
  catalogCigar: CatalogCigarRecord
  quantity: number
  lotIds: Set<number>
  oldestReceivedDate: Date | null
  issues: InventoryIssue[]
  issueKeys: Set<string>
}

type SectionAccumulator = {
  storageSubLocationId: number
  name: string
  kind: string
  displayOrder: number
  isActive: boolean
  quantity: number
  cigarIds: Set<number>
  lotIds: Set<number>
  oldestReceivedDate: Date | null
  cigarsById: Map<number, SectionCigarAccumulator>
  issues: InventoryIssue[]
  issueKeys: Set<string>
}

type HumidorAccumulator = {
  storageLocation: StorageLocationRecord
  totalQuantity: number
  cigarIds: Set<number>
  lotIds: Set<number>
  oldestReceivedDate: Date | null
  sectionsById: Map<number, SectionAccumulator>
  includedSubLocationIds: Set<number>
  issues: InventoryIssue[]
  issueKeys: Set<string>
}

type SectionPreview = {
  storageSubLocationId: number
  name: string
  kind: string
  displayOrder: number
  isActive: boolean
  quantity: number
  uniqueCigarCount: number
  lotCount: number
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

export function collectionStorageLocationIdParam(value: string) {
  const id = Number(value)

  if (!Number.isInteger(id) || id < 1) {
    throw new CollectionServiceError(
      'Storage location id must be a positive integer.',
      'COLLECTION_VALIDATION_ERROR',
      400,
    )
  }

  return id
}

function dateToIso(date: Date | null) {
  return date ? date.toISOString() : null
}

function effectiveLotDate(lot: LotRecord) {
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
  responseIssues: InventoryIssue[],
  responseIssueKeys: Set<string>,
  issue: InventoryIssue,
) {
  const key = issueKey(issue)

  if (responseIssueKeys.has(key)) {
    return
  }

  responseIssueKeys.add(key)
  responseIssues.push(issue)
}

function sortSections(a: SectionAccumulator, b: SectionAccumulator) {
  return a.displayOrder - b.displayOrder || a.name.localeCompare(b.name) || a.storageSubLocationId - b.storageSubLocationId
}

function sortCigars(a: SectionCigarAccumulator, b: SectionCigarAccumulator) {
  return (
    a.catalogCigar.manufacturerKey.localeCompare(b.catalogCigar.manufacturerKey) ||
    a.catalogCigar.seriesKey.localeCompare(b.catalogCigar.seriesKey) ||
    a.catalogCigar.vitolaKey.localeCompare(b.catalogCigar.vitolaKey) ||
    a.catalogCigar.id - b.catalogCigar.id
  )
}

function sortHumidors(a: HumidorAccumulator, b: HumidorAccumulator) {
  if (a.storageLocation.isActive !== b.storageLocation.isActive) {
    return a.storageLocation.isActive ? -1 : 1
  }

  return (
    a.storageLocation.displayOrder - b.storageLocation.displayOrder ||
    a.storageLocation.name.localeCompare(b.storageLocation.name) ||
    a.storageLocation.id - b.storageLocation.id
  )
}

function capacityUsedPercent(totalQuantity: number, capacity: number | null) {
  if (!Number.isFinite(capacity) || capacity === null || capacity <= 0) {
    return null
  }

  return Math.round((totalQuantity / capacity) * 1000) / 10
}

function storageLocationSummary(location: StorageLocationRecord) {
  return {
    id: location.id,
    name: location.name,
    capacity: location.capacity,
    organizationType: location.organizationType,
    displayOrder: location.displayOrder,
    isActive: location.isActive,
  }
}

function storageLocationDetails(location: StorageLocationRecord) {
  return {
    ...storageLocationSummary(location),
    notes: location.notes,
  }
}

function createSectionAccumulator(subLocation: StorageSubLocationRecord): SectionAccumulator {
  return {
    storageSubLocationId: subLocation.id,
    name: subLocation.name,
    kind: subLocation.kind,
    displayOrder: subLocation.displayOrder,
    isActive: subLocation.isActive,
    quantity: 0,
    cigarIds: new Set(),
    lotIds: new Set(),
    oldestReceivedDate: null,
    cigarsById: new Map(),
    issues: [],
    issueKeys: new Set(),
  }
}

function createHumidorAccumulator(location: StorageLocationRecord): HumidorAccumulator {
  return {
    storageLocation: location,
    totalQuantity: 0,
    cigarIds: new Set(),
    lotIds: new Set(),
    oldestReceivedDate: null,
    sectionsById: new Map(),
    includedSubLocationIds: new Set(),
    issues: [],
    issueKeys: new Set(),
  }
}

function includeSubLocation(humidor: HumidorAccumulator, subLocation: StorageSubLocationRecord) {
  humidor.includedSubLocationIds.add(subLocation.id)

  if (!humidor.sectionsById.has(subLocation.id)) {
    humidor.sectionsById.set(subLocation.id, createSectionAccumulator(subLocation))
  }
}

function buildHumidorAccumulators(
  storageLocations: StorageLocationRecord[],
  positiveBalances: PositiveBalanceRecord[],
) {
  const positiveStorageLocationIds = new Set<number>()
  const positiveSubLocationIds = new Set<number>()
  const positiveQuantityByLotId = new Map<number, number>()
  const balancesByLotId = new Map<number, PositiveBalanceRecord[]>()
  const lotById = new Map<number, LotRecord>()

  for (const balance of positiveBalances) {
    const storageLocation = balance.storageSubLocation.storageLocation

    if (storageLocation) {
      positiveStorageLocationIds.add(storageLocation.id)
    }

    positiveSubLocationIds.add(balance.storageSubLocationId)
    positiveQuantityByLotId.set(
      balance.lotId,
      (positiveQuantityByLotId.get(balance.lotId) ?? 0) + balance.quantity,
    )
    balancesByLotId.set(balance.lotId, [
      ...(balancesByLotId.get(balance.lotId) ?? []),
      balance,
    ])
    lotById.set(balance.lotId, balance.lot)
  }

  const locationById = new Map(storageLocations.map((location) => [location.id, location]))
  const humidorById = new Map<number, HumidorAccumulator>()

  for (const location of storageLocations) {
    if (!location.isActive && !positiveStorageLocationIds.has(location.id)) {
      continue
    }

    const humidor = createHumidorAccumulator(location)

    for (const subLocation of location.subLocations) {
      if (subLocation.isActive || positiveSubLocationIds.has(subLocation.id)) {
        includeSubLocation(humidor, subLocation)
      }
    }

    humidorById.set(location.id, humidor)
  }

  for (const balance of positiveBalances) {
    const storageLocation = balance.storageSubLocation.storageLocation

    if (!storageLocation) {
      continue
    }

    const location = locationById.get(storageLocation.id) ?? {
      ...storageLocation,
      subLocations: [balance.storageSubLocation],
    }
    let humidor = humidorById.get(location.id)

    if (!humidor) {
      humidor = createHumidorAccumulator(location)
      humidorById.set(location.id, humidor)
    }

    includeSubLocation(humidor, balance.storageSubLocation)

    const section = humidor.sectionsById.get(balance.storageSubLocationId)

    if (!section) {
      continue
    }

    const lotDate = effectiveLotDate(balance.lot)
    humidor.totalQuantity += balance.quantity
    humidor.lotIds.add(balance.lotId)
    humidor.oldestReceivedDate = minDate(humidor.oldestReceivedDate, lotDate)
    section.quantity += balance.quantity
    section.lotIds.add(balance.lotId)
    section.oldestReceivedDate = minDate(section.oldestReceivedDate, lotDate)

    const archivedLocationIssue =
      !storageLocation.isActive || !balance.storageSubLocation.isActive
        ? {
            code: 'ARCHIVED_LOCATION_WITH_INVENTORY',
            message: 'An archived humidor or section contains current inventory.',
            severity: 'WARNING',
            lotId: balance.lotId,
            catalogCigarId: balance.lot.catalogCigarId ?? undefined,
            storageLocationId: storageLocation.id,
            storageSubLocationId: balance.storageSubLocationId,
          } satisfies InventoryIssue
        : null

    if (archivedLocationIssue) {
      addIssue(humidor, archivedLocationIssue)
      addIssue(section, archivedLocationIssue)
    }

    if (!balance.lot.catalogCigar) {
      const issue: InventoryIssue = {
        code: 'CATALOG_CIGAR_MISSING',
        message: 'A positive inventory balance belongs to a lot without a Catalog cigar.',
        severity: 'WARNING',
        lotId: balance.lotId,
        storageLocationId: storageLocation.id,
        storageSubLocationId: balance.storageSubLocationId,
      }
      addIssue(humidor, issue)
      addIssue(section, issue)
      continue
    }

    const catalogCigar = balance.lot.catalogCigar
    humidor.cigarIds.add(catalogCigar.id)
    section.cigarIds.add(catalogCigar.id)

    let sectionCigar = section.cigarsById.get(catalogCigar.id)

    if (!sectionCigar) {
      sectionCigar = {
        catalogCigar,
        quantity: 0,
        lotIds: new Set(),
        oldestReceivedDate: null,
        issues: [],
        issueKeys: new Set(),
      }
      section.cigarsById.set(catalogCigar.id, sectionCigar)
    }

    sectionCigar.quantity += balance.quantity
    sectionCigar.lotIds.add(balance.lotId)
    sectionCigar.oldestReceivedDate = minDate(sectionCigar.oldestReceivedDate, lotDate)

    if (archivedLocationIssue) {
      addIssue(sectionCigar, archivedLocationIssue)
    }

    if (!catalogCigar.isActive) {
      const issue: InventoryIssue = {
        code: 'ARCHIVED_CATALOG_WITH_INVENTORY',
        message: 'An archived Catalog cigar has current inventory.',
        severity: 'WARNING',
        lotId: balance.lotId,
        catalogCigarId: catalogCigar.id,
        storageLocationId: storageLocation.id,
        storageSubLocationId: balance.storageSubLocationId,
      }
      addIssue(humidor, issue)
      addIssue(section, issue)
      addIssue(sectionCigar, issue)
    }
  }

  for (const [lotId, positiveQuantity] of positiveQuantityByLotId) {
    const lot = lotById.get(lotId)

    if (!lot || lot.currentQuantity === positiveQuantity) {
      continue
    }

    const issue: InventoryIssue = {
      code: 'LOT_BALANCE_MISMATCH',
      message: 'A lot current quantity does not match its positive location balances.',
      severity: 'WARNING',
      lotId,
      catalogCigarId: lot.catalogCigarId ?? undefined,
    }

    for (const balance of balancesByLotId.get(lotId) ?? []) {
      const storageLocationId = balance.storageSubLocation.storageLocation?.id

      if (!storageLocationId) {
        continue
      }

      const humidor = humidorById.get(storageLocationId)
      const section = humidor?.sectionsById.get(balance.storageSubLocationId)
      const sectionCigar =
        lot.catalogCigarId && section ? section.cigarsById.get(lot.catalogCigarId) : undefined
      const locatedIssue = {
        ...issue,
        storageLocationId,
        storageSubLocationId: balance.storageSubLocationId,
      }

      if (humidor) {
        addIssue(humidor, locatedIssue)
      }

      if (section) {
        addIssue(section, locatedIssue)
      }

      if (sectionCigar) {
        addIssue(sectionCigar, locatedIssue)
      }
    }
  }

  return Array.from(humidorById.values())
}

function sectionPreview(section: SectionAccumulator): SectionPreview {
  return {
    storageSubLocationId: section.storageSubLocationId,
    name: section.name,
    kind: section.kind,
    displayOrder: section.displayOrder,
    isActive: section.isActive,
    quantity: section.quantity,
    uniqueCigarCount: section.cigarIds.size,
    lotCount: section.lotIds.size,
  }
}

function humidorSummary(humidor: HumidorAccumulator) {
  const sections = Array.from(humidor.sectionsById.values())
  const occupiedSections = sections.filter((section) => section.quantity > 0).sort(sortSections)

  return {
    storageLocation: storageLocationSummary(humidor.storageLocation),
    totalQuantity: humidor.totalQuantity,
    uniqueCigarCount: humidor.cigarIds.size,
    lotCount: humidor.lotIds.size,
    occupiedSubLocationCount: occupiedSections.length,
    totalSubLocationCount: humidor.includedSubLocationIds.size,
    oldestReceivedDate: dateToIso(humidor.oldestReceivedDate),
    capacityUsedPercent: capacityUsedPercent(
      humidor.totalQuantity,
      humidor.storageLocation.capacity,
    ),
    sectionsPreview: occupiedSections.slice(0, 3).map(sectionPreview),
    issues: humidor.issues,
  }
}

function sectionDetails(section: SectionAccumulator) {
  return {
    storageSubLocationId: section.storageSubLocationId,
    name: section.name,
    kind: section.kind,
    displayOrder: section.displayOrder,
    isActive: section.isActive,
    quantity: section.quantity,
    uniqueCigarCount: section.cigarIds.size,
    lotCount: section.lotIds.size,
    oldestReceivedDate: dateToIso(section.oldestReceivedDate),
    cigars: Array.from(section.cigarsById.values())
      .sort(sortCigars)
      .map((cigar) => ({
        catalogCigar: cigar.catalogCigar,
        quantity: cigar.quantity,
        lotCount: cigar.lotIds.size,
        oldestReceivedDate: dateToIso(cigar.oldestReceivedDate),
        issues: cigar.issues,
      })),
    issues: section.issues,
  }
}

async function loadStorageLocationsAndBalances() {
  const prisma = getPrismaClient()

  const [storageLocations, positiveBalances] = await Promise.all([
    prisma.storageLocation.findMany({
      include: {
        subLocations: true,
      },
    }),
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
  ])

  return {
    storageLocations: storageLocations as StorageLocationRecord[],
    positiveBalances: positiveBalances as PositiveBalanceRecord[],
  }
}

export async function getCollectionHumidors() {
  try {
    const { storageLocations, positiveBalances } = await loadStorageLocationsAndBalances()
    const humidors = buildHumidorAccumulators(storageLocations, positiveBalances).sort(sortHumidors)
    const responseIssues: InventoryIssue[] = []
    const responseIssueKeys = new Set<string>()

    for (const humidor of humidors) {
      for (const issue of humidor.issues) {
        addResponseIssue(responseIssues, responseIssueKeys, issue)
      }
    }

    const occupiedSubLocationIds = new Set<number>()
    const cigarIds = new Set<number>()
    const lotIds = new Set<number>()
    let totalQuantity = 0

    for (const humidor of humidors) {
      totalQuantity += humidor.totalQuantity
      humidor.cigarIds.forEach((id) => cigarIds.add(id))
      humidor.lotIds.forEach((id) => lotIds.add(id))
      Array.from(humidor.sectionsById.values())
        .filter((section) => section.quantity > 0)
        .forEach((section) => occupiedSubLocationIds.add(section.storageSubLocationId))
    }

    return {
      summary: {
        humidorCount: humidors.length,
        totalQuantity,
        uniqueCigarCount: cigarIds.size,
        lotCount: lotIds.size,
        occupiedSubLocationCount: occupiedSubLocationIds.size,
      },
      humidors: humidors.map(humidorSummary),
      issues: responseIssues,
    }
  } catch (error) {
    if (error instanceof CollectionServiceError) {
      throw error
    }

    throw new CollectionServiceError(
      'The Humidor Collection list could not be loaded.',
      'COLLECTION_DATABASE_ERROR',
      500,
    )
  }
}

export async function getCollectionHumidorDetails(storageLocationId: number) {
  try {
    const { storageLocations, positiveBalances } = await loadStorageLocationsAndBalances()
    const storageLocation = storageLocations.find((location) => location.id === storageLocationId)

    if (!storageLocation) {
      throw new CollectionServiceError(
        'Collection Humidor was not found.',
        'COLLECTION_HUMIDOR_NOT_FOUND',
        404,
      )
    }

    const humidors = buildHumidorAccumulators(storageLocations, positiveBalances)
    const humidor = humidors.find((candidate) => candidate.storageLocation.id === storageLocationId)

    if (!humidor) {
      throw new CollectionServiceError(
        'Collection Humidor was not found.',
        'COLLECTION_HUMIDOR_NOT_FOUND',
        404,
      )
    }

    const sections = Array.from(humidor.sectionsById.values()).sort(sortSections)

    return {
      storageLocation: storageLocationDetails(humidor.storageLocation),
      summary: {
        totalQuantity: humidor.totalQuantity,
        uniqueCigarCount: humidor.cigarIds.size,
        lotCount: humidor.lotIds.size,
        occupiedSubLocationCount: sections.filter((section) => section.quantity > 0).length,
        totalSubLocationCount: humidor.includedSubLocationIds.size,
        oldestReceivedDate: dateToIso(humidor.oldestReceivedDate),
        capacityUsedPercent: capacityUsedPercent(
          humidor.totalQuantity,
          humidor.storageLocation.capacity,
        ),
      },
      sections: sections.map(sectionDetails),
      issues: humidor.issues,
    }
  } catch (error) {
    if (error instanceof CollectionServiceError) {
      throw error
    }

    throw new CollectionServiceError(
      'The Humidor Collection details could not be loaded.',
      'COLLECTION_DATABASE_ERROR',
      500,
    )
  }
}
