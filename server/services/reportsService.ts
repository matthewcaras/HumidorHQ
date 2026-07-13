import {
  Prisma,
  PrismaClient,
} from '../../src/generated/prisma/client.ts'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import {
  decimalToMillionths,
  formatMillionths,
  multiplyQuantityByMillionths,
  subtractMillionths,
  weightedMillionthsMetric,
} from '../utils/inventoryAccounting.ts'
import { normalizeSearchKey } from '../utils/searchKeys.ts'

type RemovalType = 'ALL' | 'SMOKED' | 'GIFTED' | 'DISCARDED'
type ReportRemovalEventType = Exclude<RemovalType, 'ALL'>
type ReportPeriod = 'LIFETIME' | 'CURRENT_YEAR' | 'PRIOR_YEAR' | 'CUSTOM'
type ReportSortBy = 'EVENT_DATE' | 'RECORDED_DATE' | 'CIGAR' | 'QUANTITY' | 'COST' | 'MSRP'
type ReportSortDirection = 'ASC' | 'DESC'
type ReportLimit = number | 'all'

type DecimalValue = number | string | { toString(): string }

type CatalogCigarRecord = {
  id: number
  manufacturer: string
  manufacturerKey?: string | null
  series: string
  seriesKey?: string | null
  vitola: string
  vitolaKey?: string | null
  wrapper: string | null
  wrapperKey?: string | null
  isActive: boolean
}

type LotRecord = {
  id: number
  catalogCigar: CatalogCigarRecord | null
}

type StorageLocationRecord = {
  id: number
  name: string
  isActive: boolean
}

type StorageSubLocationRecord = {
  id: number
  name: string
  kind: string
  isActive: boolean
  storageLocation: StorageLocationRecord | null
}

type RemovalEventRecord = {
  id: number
  lotId: number
  eventType: string
  quantity: number
  eventDate: Date
  createdAt: Date
  notes: string | null
  costPerCigarAtEvent: DecimalValue | null
  msrpPerCigarAtEvent: DecimalValue | null
  lot: LotRecord | null
  fromStorageSubLocation: StorageSubLocationRecord | null
}

type InventoryEventDelegate = {
  findMany(args: {
    where?: Record<string, unknown>
    include?: Record<string, unknown>
  }): Promise<RemovalEventRecord[]>
}

type ReportsPrismaClient = {
  inventoryEvent: InventoryEventDelegate
}

export type ReportsServiceErrorCode =
  | 'REPORTS_INVALID_REMOVAL_TYPE'
  | 'REPORTS_INVALID_PERIOD'
  | 'REPORTS_MISSING_CUSTOM_DATES'
  | 'REPORTS_INVALID_DATE'
  | 'REPORTS_INVALID_SEARCH'
  | 'REPORTS_REVERSED_DATE_RANGE'
  | 'REPORTS_INVALID_SORT'
  | 'REPORTS_INVALID_PAGINATION'
  | 'REPORTS_DATABASE_ERROR'
  | 'REPORTS_CALCULATION_ERROR'

export class ReportsServiceError extends Error {
  code: ReportsServiceErrorCode
  statusCode: number

  constructor(message: string, code: ReportsServiceErrorCode, statusCode = 400) {
    super(message)
    this.name = 'ReportsServiceError'
    this.code = code
    this.statusCode = statusCode
  }
}

export type GetRemovalReportInput = {
  removalType?: unknown
  period?: unknown
  startDate?: unknown
  endDate?: unknown
  search?: unknown
  sortBy?: unknown
  sortDirection?: unknown
  limit?: unknown
  offset?: unknown
}

export type ReportsServiceOptions = {
  prisma?: ReportsPrismaClient
  now?: Date
}

type ParsedRemovalReportQuery = {
  removalType: RemovalType
  period: ReportPeriod
  startDate: string | null
  endDate: string | null
  startDateValue: Date | null
  endExclusiveDateValue: Date | null
  search: string
  searchKey: string
  sortBy: ReportSortBy
  sortDirection: ReportSortDirection
  limit: ReportLimit
  offset: number
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

type RemovalReportItem = {
  id: number
  removalType: ReportRemovalEventType
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
  sourceLocation: {
    storageLocationId: number
    storageLocationName: string
    storageLocationIsActive: boolean
    storageSubLocationId: number
    storageSubLocationName: string
    storageSubLocationKind: string
    storageSubLocationIsActive: boolean
    isArchived: boolean
  } | null
  costPerCigarAtEvent: string | null
  msrpPerCigarAtEvent: string | null
  totalEventCost: string | null
  totalEventMsrp: string | null
  eventSavings: string | null
  notes: string | null
}

type RemovalReportItemWithSort = RemovalReportItem & {
  eventDateValue: Date
  createdAtValue: Date
  cigarSortKey: string | null
  totalEventCostValue: bigint | null
  totalEventMsrpValue: bigint | null
}

let prismaSingleton: ReportsPrismaClient | null = null

function getPrismaClient(): ReportsPrismaClient {
  if (!prismaSingleton) {
    const adapter = new PrismaBetterSqlite3({
      url: process.env.DATABASE_URL || 'file:./prisma/humidorhq.db',
    })

    prismaSingleton = new PrismaClient({ adapter }) as unknown as ReportsPrismaClient
  }

  return prismaSingleton
}

function validationError(message: string, code: ReportsServiceErrorCode): never {
  throw new ReportsServiceError(message, code, 400)
}

function calculationError(): never {
  throw new ReportsServiceError(
    'The removal report calculations could not be completed.',
    'REPORTS_CALCULATION_ERROR',
    500,
  )
}

function databaseError(): never {
  throw new ReportsServiceError(
    'The removal report could not be loaded.',
    'REPORTS_DATABASE_ERROR',
    500,
  )
}

function mapReportsError(error: unknown): never {
  if (error instanceof ReportsServiceError) {
    throw error
  }

  if (
    error instanceof Prisma.PrismaClientKnownRequestError ||
    error instanceof Prisma.PrismaClientUnknownRequestError ||
    error instanceof Prisma.PrismaClientInitializationError ||
    error instanceof Prisma.PrismaClientRustPanicError
  ) {
    databaseError()
  }

  calculationError()
}

function parseStringValue(value: unknown, defaultValue: string, code: ReportsServiceErrorCode) {
  if (value === undefined) {
    return defaultValue
  }

  if (typeof value !== 'string') {
    validationError('Query parameter must be a string.', code)
  }

  return value.trim()
}

function parseSearch(value: unknown) {
  if (value === undefined) {
    return ''
  }

  if (typeof value !== 'string') {
    validationError('search must be a string.', 'REPORTS_INVALID_SEARCH')
  }

  return value.trim()
}

function parseRemovalType(value: unknown): RemovalType {
  const normalized = parseStringValue(value, 'ALL', 'REPORTS_INVALID_REMOVAL_TYPE').toUpperCase()

  if (
    normalized === 'ALL' ||
    normalized === 'SMOKED' ||
    normalized === 'GIFTED' ||
    normalized === 'DISCARDED'
  ) {
    return normalized
  }

  validationError(
    'removalType must be ALL, SMOKED, GIFTED, or DISCARDED.',
    'REPORTS_INVALID_REMOVAL_TYPE',
  )
}

function parsePeriod(value: unknown): ReportPeriod {
  const normalized = parseStringValue(value, 'LIFETIME', 'REPORTS_INVALID_PERIOD').toUpperCase()

  if (
    normalized === 'LIFETIME' ||
    normalized === 'CURRENT_YEAR' ||
    normalized === 'PRIOR_YEAR' ||
    normalized === 'CUSTOM'
  ) {
    return normalized
  }

  validationError(
    'period must be LIFETIME, CURRENT_YEAR, PRIOR_YEAR, or CUSTOM.',
    'REPORTS_INVALID_PERIOD',
  )
}

function parseSortBy(value: unknown): ReportSortBy {
  const normalized = parseStringValue(value, 'EVENT_DATE', 'REPORTS_INVALID_SORT').toUpperCase()

  if (
    normalized === 'EVENT_DATE' ||
    normalized === 'RECORDED_DATE' ||
    normalized === 'CIGAR' ||
    normalized === 'QUANTITY' ||
    normalized === 'COST' ||
    normalized === 'MSRP'
  ) {
    return normalized
  }

  validationError(
    'sortBy must be EVENT_DATE, RECORDED_DATE, CIGAR, QUANTITY, COST, or MSRP.',
    'REPORTS_INVALID_SORT',
  )
}

function parseSortDirection(value: unknown): ReportSortDirection {
  const normalized = parseStringValue(value, 'DESC', 'REPORTS_INVALID_SORT').toUpperCase()

  if (normalized === 'ASC' || normalized === 'DESC') {
    return normalized
  }

  validationError('sortDirection must be ASC or DESC.', 'REPORTS_INVALID_SORT')
}

function parseInteger(value: unknown, fieldName: string): number {
  if (typeof value === 'number') {
    if (!Number.isInteger(value)) {
      validationError(`${fieldName} must be a whole number.`, 'REPORTS_INVALID_PAGINATION')
    }

    return value
  }

  if (typeof value !== 'string' || value.trim().length === 0) {
    validationError(`${fieldName} must be a whole number.`, 'REPORTS_INVALID_PAGINATION')
  }

  const parsed = Number(value)

  if (!Number.isInteger(parsed)) {
    validationError(`${fieldName} must be a whole number.`, 'REPORTS_INVALID_PAGINATION')
  }

  return parsed
}

function parseCalendarDate(value: unknown, fieldName: string): { key: string; value: Date } {
  if (typeof value !== 'string') {
    validationError(`${fieldName} must be a valid date.`, 'REPORTS_INVALID_DATE')
  }

  const trimmed = value.trim()
  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/)

  if (!match) {
    validationError(`${fieldName} must be a valid date.`, 'REPORTS_INVALID_DATE')
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
    validationError(`${fieldName} must be a valid date.`, 'REPORTS_INVALID_DATE')
  }

  return {
    key: trimmed,
    value: date,
  }
}

function addUtcDays(date: Date, days: number) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days))
}

function yearBounds(year: number) {
  return {
    startDate: `${year}-01-01`,
    endDate: `${year}-12-31`,
    startDateValue: new Date(Date.UTC(year, 0, 1)),
    endExclusiveDateValue: new Date(Date.UTC(year + 1, 0, 1)),
  }
}

function parseEffectiveDates(
  period: ReportPeriod,
  startDateInput: unknown,
  endDateInput: unknown,
  now: Date,
): Pick<
  ParsedRemovalReportQuery,
  'startDate' | 'endDate' | 'startDateValue' | 'endExclusiveDateValue'
> {
  const hasStart = startDateInput !== undefined && startDateInput !== null && startDateInput !== ''
  const hasEnd = endDateInput !== undefined && endDateInput !== null && endDateInput !== ''

  if (period === 'LIFETIME') {
    return {
      startDate: null,
      endDate: null,
      startDateValue: null,
      endExclusiveDateValue: null,
    }
  }

  if (period === 'CUSTOM' && (!hasStart || !hasEnd)) {
    validationError(
      'Custom date ranges require startDate and endDate.',
      'REPORTS_MISSING_CUSTOM_DATES',
    )
  }

  if ((period === 'CURRENT_YEAR' || period === 'PRIOR_YEAR') && hasStart !== hasEnd) {
    validationError(
      'startDate and endDate must both be supplied or both omitted.',
      'REPORTS_INVALID_DATE',
    )
  }

  if (hasStart && hasEnd) {
    const startDate = parseCalendarDate(startDateInput, 'startDate')
    const endDate = parseCalendarDate(endDateInput, 'endDate')

    if (startDate.key > endDate.key) {
      validationError('startDate must be on or before endDate.', 'REPORTS_REVERSED_DATE_RANGE')
    }

    return {
      startDate: startDate.key,
      endDate: endDate.key,
      startDateValue: startDate.value,
      endExclusiveDateValue: addUtcDays(endDate.value, 1),
    }
  }

  const currentYear = now.getUTCFullYear()
  return yearBounds(period === 'CURRENT_YEAR' ? currentYear : currentYear - 1)
}

function parseQuery(
  input: GetRemovalReportInput = {},
  now = new Date(),
): ParsedRemovalReportQuery {
  const removalType = parseRemovalType(input.removalType)
  const period = parsePeriod(input.period)
  const dateBounds = parseEffectiveDates(period, input.startDate, input.endDate, now)
  const search = parseSearch(input.search)
  const sortBy = parseSortBy(input.sortBy)
  const sortDirection = parseSortDirection(input.sortDirection)
  const rawLimit = input.limit
  let limit: ReportLimit = 50
  let offset = 0

  if (typeof rawLimit === 'string' && rawLimit.trim().toLowerCase() === 'all') {
    limit = 'all'
  } else if (rawLimit !== undefined) {
    limit = parseInteger(rawLimit, 'limit')

    if (limit < 1 || limit > 200) {
      validationError(
        'limit must be a positive integer up to 200, or all.',
        'REPORTS_INVALID_PAGINATION',
      )
    }
  }

  if (limit !== 'all') {
    offset = input.offset === undefined ? 0 : parseInteger(input.offset, 'offset')
  }

  if (offset < 0) {
    validationError('offset must be a nonnegative integer.', 'REPORTS_INVALID_PAGINATION')
  }

  return {
    removalType,
    period,
    ...dateBounds,
    search,
    searchKey: normalizeSearchKey(search),
    sortBy,
    sortDirection,
    limit,
    offset,
  }
}

function isRemovalEventType(eventType: string): eventType is ReportRemovalEventType {
  return eventType === 'SMOKED' || eventType === 'GIFTED' || eventType === 'DISCARDED'
}

function formatMetric(value: bigint | null) {
  return value === null ? null : formatMillionths(value)
}

function decimalSnapshotToMillionths(value: DecimalValue | null) {
  if (value === null) {
    return null
  }

  const millionths = decimalToMillionths(value)

  if (millionths === null) {
    calculationError()
  }

  return millionths
}

function assertPositiveQuantity(quantity: number) {
  if (!Number.isInteger(quantity) || quantity < 1) {
    calculationError()
  }
}

function removalMetric(events: RemovalEventRecord[]): RemovalMetric {
  const quantity = events.reduce((total, event) => {
    assertPositiveQuantity(event.quantity)
    return total + event.quantity
  }, 0)

  if (quantity === 0) {
    return {
      quantity: 0,
      totalCost: null,
      totalMsrp: null,
      totalSavings: null,
      averageCostPerCigar: null,
      averageMsrpPerCigar: null,
      quantityWithKnownCost: 0,
      quantityMissingCost: 0,
      quantityWithKnownMsrp: 0,
      quantityMissingMsrp: 0,
    }
  }

  const costMetric = weightedMillionthsMetric(
    events.map((event) => ({
      quantity: event.quantity,
      value: decimalSnapshotToMillionths(event.costPerCigarAtEvent),
    })),
  )
  const msrpMetric = weightedMillionthsMetric(
    events.map((event) => ({
      quantity: event.quantity,
      value: decimalSnapshotToMillionths(event.msrpPerCigarAtEvent),
    })),
  )
  const totalSavings = subtractMillionths(
    msrpMetric.completeTotalValue,
    costMetric.completeTotalValue,
  )

  return {
    quantity,
    totalCost: formatMetric(costMetric.completeTotalValue),
    totalMsrp: formatMetric(msrpMetric.completeTotalValue),
    totalSavings: formatMetric(totalSavings),
    averageCostPerCigar: formatMetric(costMetric.weightedAverage),
    averageMsrpPerCigar: formatMetric(msrpMetric.weightedAverage),
    quantityWithKnownCost: costMetric.quantityWithKnownValue,
    quantityMissingCost: costMetric.quantityMissingValue,
    quantityWithKnownMsrp: msrpMetric.quantityWithKnownValue,
    quantityMissingMsrp: msrpMetric.quantityMissingValue,
  }
}

function eventMatchesSearch(event: RemovalEventRecord, searchKey: string) {
  if (!searchKey) {
    return true
  }

  const catalogCigar = event.lot?.catalogCigar ?? null
  const source = event.fromStorageSubLocation
  const lotIdText = String(event.lotId)
  const searchableKeys = [
    catalogCigar?.manufacturerKey ?? normalizeSearchKey(catalogCigar?.manufacturer),
    catalogCigar?.seriesKey ?? normalizeSearchKey(catalogCigar?.series),
    catalogCigar?.vitolaKey ?? normalizeSearchKey(catalogCigar?.vitola),
    catalogCigar?.wrapperKey ?? normalizeSearchKey(catalogCigar?.wrapper),
    normalizeSearchKey(source?.storageLocation?.name),
    normalizeSearchKey(source?.name),
    normalizeSearchKey(event.notes),
    normalizeSearchKey(lotIdText),
    normalizeSearchKey(`Lot ${lotIdText}`),
  ]

  return searchableKeys.some((key) => key.includes(searchKey))
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

function sourceLocationSnapshot(source: StorageSubLocationRecord | null) {
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
    isArchived: !source.isActive || !source.storageLocation.isActive,
  }
}

function cigarSortKey(catalogCigar: CatalogCigarRecord | null) {
  if (!catalogCigar) {
    return null
  }

  return [
    catalogCigar.manufacturerKey ?? normalizeSearchKey(catalogCigar.manufacturer),
    catalogCigar.seriesKey ?? normalizeSearchKey(catalogCigar.series),
    catalogCigar.vitolaKey ?? normalizeSearchKey(catalogCigar.vitola),
    catalogCigar.wrapperKey ?? normalizeSearchKey(catalogCigar.wrapper),
  ].join(':')
}

function buildReportItem(event: RemovalEventRecord): RemovalReportItemWithSort {
  if (!isRemovalEventType(event.eventType)) {
    calculationError()
  }

  assertPositiveQuantity(event.quantity)

  const costPerCigar = decimalSnapshotToMillionths(event.costPerCigarAtEvent)
  const msrpPerCigar = decimalSnapshotToMillionths(event.msrpPerCigarAtEvent)
  const totalEventCost = multiplyQuantityByMillionths(event.quantity, costPerCigar)
  const totalEventMsrp = multiplyQuantityByMillionths(event.quantity, msrpPerCigar)
  const eventSavings = subtractMillionths(totalEventMsrp, totalEventCost)
  const catalogCigar = event.lot?.catalogCigar ?? null

  return {
    id: event.id,
    removalType: event.eventType,
    quantity: event.quantity,
    eventDate: event.eventDate.toISOString(),
    createdAt: event.createdAt.toISOString(),
    lotId: event.lotId,
    catalogCigar: catalogCigarPublic(catalogCigar),
    sourceLocation: sourceLocationSnapshot(event.fromStorageSubLocation),
    costPerCigarAtEvent: formatMetric(costPerCigar),
    msrpPerCigarAtEvent: formatMetric(msrpPerCigar),
    totalEventCost: formatMetric(totalEventCost),
    totalEventMsrp: formatMetric(totalEventMsrp),
    eventSavings: formatMetric(eventSavings),
    notes: event.notes,
    eventDateValue: event.eventDate,
    createdAtValue: event.createdAt,
    cigarSortKey: cigarSortKey(catalogCigar),
    totalEventCostValue: totalEventCost,
    totalEventMsrpValue: totalEventMsrp,
  }
}

function compareText(left: string, right: string) {
  return left.localeCompare(right, undefined, {
    numeric: true,
    sensitivity: 'base',
  })
}

function compareDefaultDescending(left: RemovalReportItemWithSort, right: RemovalReportItemWithSort) {
  return (
    right.eventDateValue.getTime() - left.eventDateValue.getTime() ||
    right.createdAtValue.getTime() - left.createdAtValue.getTime() ||
    right.id - left.id
  )
}

function compareNullableBigInt(
  left: bigint | null,
  right: bigint | null,
  direction: ReportSortDirection,
) {
  if (left === null && right === null) {
    return 0
  }

  if (left === null) {
    return 1
  }

  if (right === null) {
    return -1
  }

  if (left === right) {
    return 0
  }

  const comparison = left < right ? -1 : 1
  return direction === 'ASC' ? comparison : -comparison
}

function sortItems(
  items: RemovalReportItemWithSort[],
  sortBy: ReportSortBy,
  sortDirection: ReportSortDirection,
) {
  const direction = sortDirection === 'ASC' ? 1 : -1

  return [...items].sort((left, right) => {
    if (sortBy === 'EVENT_DATE') {
      return (
        (left.eventDateValue.getTime() - right.eventDateValue.getTime()) * direction ||
        (left.createdAtValue.getTime() - right.createdAtValue.getTime()) * direction ||
        (left.id - right.id) * direction
      )
    }

    if (sortBy === 'RECORDED_DATE') {
      return (
        (left.createdAtValue.getTime() - right.createdAtValue.getTime()) * direction ||
        (left.eventDateValue.getTime() - right.eventDateValue.getTime()) * direction ||
        (left.id - right.id) * direction
      )
    }

    if (sortBy === 'CIGAR') {
      if (left.cigarSortKey === null && right.cigarSortKey === null) {
        return (left.lotId - right.lotId) * direction || compareDefaultDescending(left, right)
      }

      if (left.cigarSortKey === null) {
        return 1
      }

      if (right.cigarSortKey === null) {
        return -1
      }

      return (
        compareText(left.cigarSortKey, right.cigarSortKey) * direction ||
        (left.lotId - right.lotId) * direction ||
        compareDefaultDescending(left, right)
      )
    }

    if (sortBy === 'QUANTITY') {
      return (left.quantity - right.quantity) * direction || compareDefaultDescending(left, right)
    }

    if (sortBy === 'COST') {
      return (
        compareNullableBigInt(left.totalEventCostValue, right.totalEventCostValue, sortDirection) ||
        compareDefaultDescending(left, right)
      )
    }

    return (
      compareNullableBigInt(left.totalEventMsrpValue, right.totalEventMsrpValue, sortDirection) ||
      compareDefaultDescending(left, right)
    )
  })
}

function stripSortFields(item: RemovalReportItemWithSort): RemovalReportItem {
  return {
    id: item.id,
    removalType: item.removalType,
    quantity: item.quantity,
    eventDate: item.eventDate,
    createdAt: item.createdAt,
    lotId: item.lotId,
    catalogCigar: item.catalogCigar,
    sourceLocation: item.sourceLocation,
    costPerCigarAtEvent: item.costPerCigarAtEvent,
    msrpPerCigarAtEvent: item.msrpPerCigarAtEvent,
    totalEventCost: item.totalEventCost,
    totalEventMsrp: item.totalEventMsrp,
    eventSavings: item.eventSavings,
    notes: item.notes,
  }
}

function whereForQuery(query: ParsedRemovalReportQuery): Record<string, unknown> {
  const where: Record<string, unknown> = {
    eventType: {
      in: ['SMOKED', 'GIFTED', 'DISCARDED'],
    },
  }

  const eventDate: Record<string, Date> = {}

  if (query.startDateValue) {
    eventDate.gte = query.startDateValue
  }

  if (query.endExclusiveDateValue) {
    eventDate.lt = query.endExclusiveDateValue
  }

  if (Object.keys(eventDate).length > 0) {
    where.eventDate = eventDate
  }

  return where
}

export async function getRemovalReport(
  input: GetRemovalReportInput = {},
  options: ReportsServiceOptions = {},
) {
  const prisma = options.prisma ?? getPrismaClient()

  try {
    const query = parseQuery(input, options.now)
    const removalEvents = await prisma.inventoryEvent.findMany({
      where: whereForQuery(query),
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
      },
    })

    const searchedEvents = removalEvents.filter(
      (event) => isRemovalEventType(event.eventType) && eventMatchesSearch(event, query.searchKey),
    )
    const eventsByType = {
      SMOKED: [] as RemovalEventRecord[],
      GIFTED: [] as RemovalEventRecord[],
      DISCARDED: [] as RemovalEventRecord[],
    }

    for (const event of searchedEvents) {
      if (isRemovalEventType(event.eventType)) {
        eventsByType[event.eventType].push(event)
      }
    }

    const detailEvents =
      query.removalType === 'ALL' ? searchedEvents : eventsByType[query.removalType]
    const detailItems = detailEvents.map(buildReportItem)
    const sortedItems = sortItems(detailItems, query.sortBy, query.sortDirection)
    const paginatedItems =
      query.limit === 'all'
        ? sortedItems
        : sortedItems.slice(query.offset, query.offset + query.limit)

    return {
      filters: {
        removalType: query.removalType,
        period: query.period,
        startDate: query.startDate,
        endDate: query.endDate,
        search: query.search,
      },
      summary: {
        combined: removalMetric(searchedEvents),
        smoking: removalMetric(eventsByType.SMOKED),
        gifted: removalMetric(eventsByType.GIFTED),
        discarded: removalMetric(eventsByType.DISCARDED),
      },
      items: paginatedItems.map(stripSortFields),
      total: detailItems.length,
      limit: query.limit,
      offset: query.offset,
      sort: {
        sortBy: query.sortBy,
        sortDirection: query.sortDirection,
      },
    }
  } catch (error) {
    mapReportsError(error)
  }
}
