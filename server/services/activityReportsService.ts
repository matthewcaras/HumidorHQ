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
} from '../utils/inventoryAccounting.ts'
import { normalizeSearchKey } from '../utils/searchKeys.ts'

export type ActivityEventType =
  | 'ALL'
  | 'INITIAL_PLACEMENT'
  | 'MOVE'
  | 'SMOKED'
  | 'GIFTED'
  | 'DISCARDED'
type SupportedActivityEventType = Exclude<ActivityEventType, 'ALL'>
type ActivityReportPeriod = 'LIFETIME' | 'CURRENT_YEAR' | 'PRIOR_YEAR' | 'CUSTOM'
type ActivityReportSortBy = 'EVENT_DATE' | 'RECORDED_DATE' | 'EVENT_TYPE' | 'CIGAR' | 'QUANTITY'
type ActivityReportSortDirection = 'ASC' | 'DESC'
type ActivityReportLimit = number | 'all'
type DecimalValue = number | string | { toString(): string }
type ActivityIssueSeverity = 'INFO' | 'WARNING'

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

type ActivityEventRecord = {
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
  toStorageSubLocation: StorageSubLocationRecord | null
}

type InventoryEventDelegate = {
  findMany(args: {
    where?: Record<string, unknown>
    include?: Record<string, unknown>
  }): Promise<ActivityEventRecord[]>
}

export type ActivityReportsPrismaClient = {
  inventoryEvent: InventoryEventDelegate
}

export type ActivityReportsServiceErrorCode =
  | 'REPORTS_INVALID_ACTIVITY_TYPE'
  | 'REPORTS_INVALID_PERIOD'
  | 'REPORTS_MISSING_CUSTOM_DATES'
  | 'REPORTS_INVALID_DATE'
  | 'REPORTS_REVERSED_DATE_RANGE'
  | 'REPORTS_INVALID_SEARCH'
  | 'REPORTS_INVALID_SORT'
  | 'REPORTS_INVALID_PAGINATION'
  | 'REPORTS_DATABASE_ERROR'
  | 'REPORTS_CALCULATION_ERROR'

export class ActivityReportsServiceError extends Error {
  code: ActivityReportsServiceErrorCode
  statusCode: number

  constructor(message: string, code: ActivityReportsServiceErrorCode, statusCode = 400) {
    super(message)
    this.name = 'ActivityReportsServiceError'
    this.code = code
    this.statusCode = statusCode
  }
}

export type GetActivityReportInput = {
  eventType?: unknown
  period?: unknown
  startDate?: unknown
  endDate?: unknown
  search?: unknown
  sortBy?: unknown
  sortDirection?: unknown
  limit?: unknown
  offset?: unknown
}

export type ActivityReportsServiceOptions = {
  prisma?: ActivityReportsPrismaClient
  now?: Date
}

type ParsedActivityReportQuery = {
  eventType: ActivityEventType
  period: ActivityReportPeriod
  startDate: string | null
  endDate: string | null
  startDateValue: Date | null
  endExclusiveDateValue: Date | null
  search: string
  searchKey: string
  sortBy: ActivityReportSortBy
  sortDirection: ActivityReportSortDirection
  limit: ActivityReportLimit
  offset: number
}

type ActivityLocationSnapshot = {
  storageLocationId: number
  storageLocationName: string
  storageLocationIsActive: boolean
  storageSubLocationId: number
  storageSubLocationName: string
  storageSubLocationKind: string
  storageSubLocationIsActive: boolean
  isArchived: boolean
}

type ActivityIssue = {
  code:
    | 'ACTIVITY_MISSING_CATALOG'
    | 'ACTIVITY_MISSING_SOURCE'
    | 'ACTIVITY_MISSING_DESTINATION'
    | 'ACTIVITY_ARCHIVED_CATALOG'
    | 'ACTIVITY_ARCHIVED_SOURCE'
    | 'ACTIVITY_ARCHIVED_DESTINATION'
    | 'ACTIVITY_UNEXPECTED_SOURCE'
    | 'ACTIVITY_UNEXPECTED_DESTINATION'
  message: string
  severity: ActivityIssueSeverity
}

type ActivityReportItem = {
  id: number
  eventType: SupportedActivityEventType
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
  sourceLocation: ActivityLocationSnapshot | null
  destinationLocation: ActivityLocationSnapshot | null
  costPerCigarAtEvent: string | null
  msrpPerCigarAtEvent: string | null
  totalEventCost: string | null
  totalEventMsrp: string | null
  eventSavings: string | null
  notes: string | null
  issues: ActivityIssue[]
}

type ActivityReportItemWithSort = ActivityReportItem & {
  eventDateValue: Date
  createdAtValue: Date
  cigarSortParts: [string, string, string, string] | null
}

type ActivitySummaryMetric = {
  eventCount: number
  quantity: number
}

export type ActivityReport = {
  filters: {
    eventType: ActivityEventType
    period: ActivityReportPeriod
    startDate: string | null
    endDate: string | null
    search: string
  }
  summary: {
    totalEvents: number
    initialPlacement: ActivitySummaryMetric
    moved: ActivitySummaryMetric
    smoked: ActivitySummaryMetric
    gifted: ActivitySummaryMetric
    discarded: ActivitySummaryMetric
    removed: ActivitySummaryMetric
  }
  items: ActivityReportItem[]
  total: number
  limit: ActivityReportLimit
  offset: number
  sort: {
    sortBy: ActivityReportSortBy
    sortDirection: ActivityReportSortDirection
  }
}

const SUPPORTED_EVENT_TYPES = [
  'INITIAL_PLACEMENT',
  'MOVE',
  'SMOKED',
  'GIFTED',
  'DISCARDED',
] as const

const EVENT_TYPE_ORDER: Record<SupportedActivityEventType, number> = {
  INITIAL_PLACEMENT: 1,
  MOVE: 2,
  SMOKED: 3,
  GIFTED: 4,
  DISCARDED: 5,
}

const EVENT_SEARCH_WORDS: Record<SupportedActivityEventType, string[]> = {
  INITIAL_PLACEMENT: ['received', 'receive', 'stored', 'placement'],
  MOVE: ['move', 'moved'],
  SMOKED: ['smoke', 'smoked'],
  GIFTED: ['gift', 'gifted'],
  DISCARDED: ['discard', 'discarded', 'damaged'],
}

let prismaSingleton: ActivityReportsPrismaClient | null = null

function getPrismaClient(): ActivityReportsPrismaClient {
  if (!prismaSingleton) {
    const adapter = new PrismaBetterSqlite3({
      url: process.env.DATABASE_URL || 'file:./prisma/humidorhq.db',
    })

    prismaSingleton = new PrismaClient({ adapter }) as unknown as ActivityReportsPrismaClient
  }

  return prismaSingleton
}

function validationError(message: string, code: ActivityReportsServiceErrorCode): never {
  throw new ActivityReportsServiceError(message, code, 400)
}

function calculationError(): never {
  throw new ActivityReportsServiceError(
    'The activity report calculations could not be completed.',
    'REPORTS_CALCULATION_ERROR',
    500,
  )
}

function databaseError(): never {
  throw new ActivityReportsServiceError(
    'The activity report could not be loaded.',
    'REPORTS_DATABASE_ERROR',
    500,
  )
}

function mapActivityReportsError(error: unknown): never {
  if (error instanceof ActivityReportsServiceError) {
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

function parseStringValue(
  value: unknown,
  defaultValue: string,
  code: ActivityReportsServiceErrorCode,
) {
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

function parseEventType(value: unknown): ActivityEventType {
  const normalized = parseStringValue(value, 'ALL', 'REPORTS_INVALID_ACTIVITY_TYPE').toUpperCase()

  if (
    normalized === 'ALL' ||
    normalized === 'INITIAL_PLACEMENT' ||
    normalized === 'MOVE' ||
    normalized === 'SMOKED' ||
    normalized === 'GIFTED' ||
    normalized === 'DISCARDED'
  ) {
    return normalized
  }

  validationError(
    'eventType must be ALL, INITIAL_PLACEMENT, MOVE, SMOKED, GIFTED, or DISCARDED.',
    'REPORTS_INVALID_ACTIVITY_TYPE',
  )
}

function parsePeriod(value: unknown): ActivityReportPeriod {
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

function parseSortBy(value: unknown): ActivityReportSortBy {
  const normalized = parseStringValue(value, 'EVENT_DATE', 'REPORTS_INVALID_SORT').toUpperCase()

  if (
    normalized === 'EVENT_DATE' ||
    normalized === 'RECORDED_DATE' ||
    normalized === 'EVENT_TYPE' ||
    normalized === 'CIGAR' ||
    normalized === 'QUANTITY'
  ) {
    return normalized
  }

  validationError(
    'sortBy must be EVENT_DATE, RECORDED_DATE, EVENT_TYPE, CIGAR, or QUANTITY.',
    'REPORTS_INVALID_SORT',
  )
}

function parseSortDirection(value: unknown): ActivityReportSortDirection {
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
  period: ActivityReportPeriod,
  startDateInput: unknown,
  endDateInput: unknown,
  now: Date,
): Pick<
  ParsedActivityReportQuery,
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
  input: GetActivityReportInput = {},
  now = new Date(),
): ParsedActivityReportQuery {
  const eventType = parseEventType(input.eventType)
  const period = parsePeriod(input.period)
  const dateBounds = parseEffectiveDates(period, input.startDate, input.endDate, now)
  const search = parseSearch(input.search)
  const sortBy = parseSortBy(input.sortBy)
  const sortDirection = parseSortDirection(input.sortDirection)
  const rawLimit = input.limit
  let limit: ActivityReportLimit = 50
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
    eventType,
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

function isSupportedEventType(eventType: string): eventType is SupportedActivityEventType {
  return SUPPORTED_EVENT_TYPES.some((supportedType) => supportedType === eventType)
}

function isValidDate(value: Date) {
  return value instanceof Date && !Number.isNaN(value.getTime())
}

function assertValidHistoricalEvent(event: ActivityEventRecord) {
  if (!isSupportedEventType(event.eventType)) {
    calculationError()
  }

  if (!Number.isInteger(event.quantity) || event.quantity < 1) {
    calculationError()
  }

  if (!isValidDate(event.eventDate) || !isValidDate(event.createdAt)) {
    calculationError()
  }
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

function assertValidMoneySnapshots(event: ActivityEventRecord) {
  decimalSnapshotToMillionths(event.costPerCigarAtEvent)
  decimalSnapshotToMillionths(event.msrpPerCigarAtEvent)
}

function eventMatchesSearch(event: ActivityEventRecord, searchKey: string) {
  if (!searchKey) {
    return true
  }

  const catalogCigar = event.lot?.catalogCigar ?? null
  const source = event.fromStorageSubLocation
  const destination = event.toStorageSubLocation
  const lotIdText = String(event.lotId)
  const eventWords = isSupportedEventType(event.eventType)
    ? EVENT_SEARCH_WORDS[event.eventType]
    : []
  const searchableKeys = [
    catalogCigar?.manufacturerKey ?? normalizeSearchKey(catalogCigar?.manufacturer),
    catalogCigar?.seriesKey ?? normalizeSearchKey(catalogCigar?.series),
    catalogCigar?.vitolaKey ?? normalizeSearchKey(catalogCigar?.vitola),
    catalogCigar?.wrapperKey ?? normalizeSearchKey(catalogCigar?.wrapper),
    normalizeSearchKey(source?.storageLocation?.name),
    normalizeSearchKey(source?.name),
    normalizeSearchKey(destination?.storageLocation?.name),
    normalizeSearchKey(destination?.name),
    normalizeSearchKey(event.notes),
    normalizeSearchKey(lotIdText),
    normalizeSearchKey(`Lot ${lotIdText}`),
    ...eventWords.map((word) => normalizeSearchKey(word)),
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

function locationSnapshot(subLocation: StorageSubLocationRecord | null): ActivityLocationSnapshot | null {
  if (!subLocation || !subLocation.storageLocation) {
    return null
  }

  return {
    storageLocationId: subLocation.storageLocation.id,
    storageLocationName: subLocation.storageLocation.name,
    storageLocationIsActive: subLocation.storageLocation.isActive,
    storageSubLocationId: subLocation.id,
    storageSubLocationName: subLocation.name,
    storageSubLocationKind: subLocation.kind,
    storageSubLocationIsActive: subLocation.isActive,
    isArchived: !subLocation.isActive || !subLocation.storageLocation.isActive,
  }
}

function cigarSortParts(catalogCigar: CatalogCigarRecord | null): [string, string, string, string] | null {
  if (!catalogCigar) {
    return null
  }

  return [
    catalogCigar.manufacturer,
    catalogCigar.series,
    catalogCigar.vitola,
    catalogCigar.wrapper ?? '',
  ]
}

function addIssue(issues: ActivityIssue[], issueCodes: Set<ActivityIssue['code']>, issue: ActivityIssue) {
  if (issueCodes.has(issue.code)) {
    return
  }

  issueCodes.add(issue.code)
  issues.push(issue)
}

function relationshipExpectations(eventType: SupportedActivityEventType) {
  if (eventType === 'INITIAL_PLACEMENT') {
    return { sourceExpected: false, destinationExpected: true }
  }

  if (eventType === 'MOVE') {
    return { sourceExpected: true, destinationExpected: true }
  }

  return { sourceExpected: true, destinationExpected: false }
}

function activityIssues(
  event: ActivityEventRecord,
  catalogCigar: CatalogCigarRecord | null,
  sourceLocation: ActivityLocationSnapshot | null,
  destinationLocation: ActivityLocationSnapshot | null,
): ActivityIssue[] {
  if (!isSupportedEventType(event.eventType)) {
    calculationError()
  }

  const issues: ActivityIssue[] = []
  const issueCodes = new Set<ActivityIssue['code']>()
  const expectations = relationshipExpectations(event.eventType)

  if (!catalogCigar) {
    addIssue(issues, issueCodes, {
      code: 'ACTIVITY_MISSING_CATALOG',
      message: 'This activity belongs to a lot without a Catalog cigar.',
      severity: 'WARNING',
    })
  } else if (!catalogCigar.isActive) {
    addIssue(issues, issueCodes, {
      code: 'ACTIVITY_ARCHIVED_CATALOG',
      message: 'This activity belongs to an archived Catalog cigar.',
      severity: 'INFO',
    })
  }

  if (expectations.sourceExpected && !sourceLocation) {
    addIssue(issues, issueCodes, {
      code: 'ACTIVITY_MISSING_SOURCE',
      message: 'This activity is missing its expected source location.',
      severity: 'WARNING',
    })
  }

  if (!expectations.sourceExpected && event.fromStorageSubLocation) {
    addIssue(issues, issueCodes, {
      code: 'ACTIVITY_UNEXPECTED_SOURCE',
      message: 'This activity has an unexpected source location.',
      severity: 'WARNING',
    })
  }

  if (sourceLocation?.isArchived) {
    addIssue(issues, issueCodes, {
      code: 'ACTIVITY_ARCHIVED_SOURCE',
      message: 'This activity source location is archived.',
      severity: 'INFO',
    })
  }

  if (expectations.destinationExpected && !destinationLocation) {
    addIssue(issues, issueCodes, {
      code: 'ACTIVITY_MISSING_DESTINATION',
      message: 'This activity is missing its expected destination location.',
      severity: 'WARNING',
    })
  }

  if (!expectations.destinationExpected && event.toStorageSubLocation) {
    addIssue(issues, issueCodes, {
      code: 'ACTIVITY_UNEXPECTED_DESTINATION',
      message: 'This activity has an unexpected destination location.',
      severity: 'WARNING',
    })
  }

  if (destinationLocation?.isArchived) {
    addIssue(issues, issueCodes, {
      code: 'ACTIVITY_ARCHIVED_DESTINATION',
      message: 'This activity destination location is archived.',
      severity: 'INFO',
    })
  }

  return issues
}

function buildReportItem(event: ActivityEventRecord): ActivityReportItemWithSort {
  assertValidHistoricalEvent(event)

  if (!isSupportedEventType(event.eventType)) {
    calculationError()
  }

  const costPerCigar = decimalSnapshotToMillionths(event.costPerCigarAtEvent)
  const msrpPerCigar = decimalSnapshotToMillionths(event.msrpPerCigarAtEvent)
  const totalEventCost = multiplyQuantityByMillionths(event.quantity, costPerCigar)
  const totalEventMsrp = multiplyQuantityByMillionths(event.quantity, msrpPerCigar)
  const eventSavings = subtractMillionths(totalEventMsrp, totalEventCost)
  const catalogCigar = event.lot?.catalogCigar ?? null
  const sourceLocation = locationSnapshot(event.fromStorageSubLocation)
  const destinationLocation = locationSnapshot(event.toStorageSubLocation)

  return {
    id: event.id,
    eventType: event.eventType,
    quantity: event.quantity,
    eventDate: event.eventDate.toISOString(),
    createdAt: event.createdAt.toISOString(),
    lotId: event.lotId,
    catalogCigar: catalogCigarPublic(catalogCigar),
    sourceLocation,
    destinationLocation,
    costPerCigarAtEvent: formatMetric(costPerCigar),
    msrpPerCigarAtEvent: formatMetric(msrpPerCigar),
    totalEventCost: formatMetric(totalEventCost),
    totalEventMsrp: formatMetric(totalEventMsrp),
    eventSavings: formatMetric(eventSavings),
    notes: event.notes,
    issues: activityIssues(event, catalogCigar, sourceLocation, destinationLocation),
    eventDateValue: event.eventDate,
    createdAtValue: event.createdAt,
    cigarSortParts: cigarSortParts(catalogCigar),
  }
}

function emptySummaryMetric(): ActivitySummaryMetric {
  return {
    eventCount: 0,
    quantity: 0,
  }
}

function addSummaryEvent(metric: ActivitySummaryMetric, event: ActivityEventRecord) {
  metric.eventCount += 1
  metric.quantity += event.quantity
}

function buildSummary(events: ActivityEventRecord[]): ActivityReport['summary'] {
  const initialPlacement = emptySummaryMetric()
  const moved = emptySummaryMetric()
  const smoked = emptySummaryMetric()
  const gifted = emptySummaryMetric()
  const discarded = emptySummaryMetric()
  const removed = emptySummaryMetric()

  for (const event of events) {
    assertValidHistoricalEvent(event)

    if (event.eventType === 'INITIAL_PLACEMENT') {
      addSummaryEvent(initialPlacement, event)
    } else if (event.eventType === 'MOVE') {
      addSummaryEvent(moved, event)
    } else if (event.eventType === 'SMOKED') {
      addSummaryEvent(smoked, event)
      addSummaryEvent(removed, event)
    } else if (event.eventType === 'GIFTED') {
      addSummaryEvent(gifted, event)
      addSummaryEvent(removed, event)
    } else if (event.eventType === 'DISCARDED') {
      addSummaryEvent(discarded, event)
      addSummaryEvent(removed, event)
    }
  }

  return {
    totalEvents: events.length,
    initialPlacement,
    moved,
    smoked,
    gifted,
    discarded,
    removed,
  }
}

function compareText(left: string, right: string) {
  return left.localeCompare(right, undefined, {
    numeric: true,
    sensitivity: 'base',
  })
}

function compareDefaultDescending(left: ActivityReportItemWithSort, right: ActivityReportItemWithSort) {
  return (
    right.eventDateValue.getTime() - left.eventDateValue.getTime() ||
    right.createdAtValue.getTime() - left.createdAtValue.getTime() ||
    right.id - left.id
  )
}

function compareCigarParts(
  left: ActivityReportItemWithSort,
  right: ActivityReportItemWithSort,
  direction: number,
) {
  if (left.cigarSortParts === null && right.cigarSortParts === null) {
    return (left.lotId - right.lotId) * direction
  }

  if (left.cigarSortParts === null) {
    return 1
  }

  if (right.cigarSortParts === null) {
    return -1
  }

  for (let index = 0; index < left.cigarSortParts.length; index += 1) {
    const comparison = compareText(left.cigarSortParts[index], right.cigarSortParts[index])
    if (comparison !== 0) {
      return comparison * direction
    }
  }

  return (left.lotId - right.lotId) * direction
}

function sortItems(
  items: ActivityReportItemWithSort[],
  sortBy: ActivityReportSortBy,
  sortDirection: ActivityReportSortDirection,
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

    if (sortBy === 'EVENT_TYPE') {
      return (
        (EVENT_TYPE_ORDER[left.eventType] - EVENT_TYPE_ORDER[right.eventType]) * direction ||
        compareDefaultDescending(left, right)
      )
    }

    if (sortBy === 'CIGAR') {
      return compareCigarParts(left, right, direction) || compareDefaultDescending(left, right)
    }

    return (left.quantity - right.quantity) * direction || compareDefaultDescending(left, right)
  })
}

function stripSortFields(item: ActivityReportItemWithSort): ActivityReportItem {
  return {
    id: item.id,
    eventType: item.eventType,
    quantity: item.quantity,
    eventDate: item.eventDate,
    createdAt: item.createdAt,
    lotId: item.lotId,
    catalogCigar: item.catalogCigar,
    sourceLocation: item.sourceLocation,
    destinationLocation: item.destinationLocation,
    costPerCigarAtEvent: item.costPerCigarAtEvent,
    msrpPerCigarAtEvent: item.msrpPerCigarAtEvent,
    totalEventCost: item.totalEventCost,
    totalEventMsrp: item.totalEventMsrp,
    eventSavings: item.eventSavings,
    notes: item.notes,
    issues: item.issues,
  }
}

function whereForQuery(query: ParsedActivityReportQuery): Record<string, unknown> {
  const where: Record<string, unknown> = {
    eventType: {
      in: [...SUPPORTED_EVENT_TYPES],
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

function includeForQuery(): Record<string, unknown> {
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
    toStorageSubLocation: {
      include: {
        storageLocation: true,
      },
    },
  }
}

export async function getActivityReport(
  input: GetActivityReportInput = {},
  options: ActivityReportsServiceOptions = {},
): Promise<ActivityReport> {
  const prisma = options.prisma ?? getPrismaClient()

  try {
    const query = parseQuery(input, options.now)
    const activityEvents = await prisma.inventoryEvent.findMany({
      where: whereForQuery(query),
      include: includeForQuery(),
    })

    for (const event of activityEvents) {
      assertValidHistoricalEvent(event)
    }

    const searchedEvents = activityEvents.filter((event) =>
      eventMatchesSearch(event, query.searchKey),
    )
    for (const event of searchedEvents) {
      assertValidMoneySnapshots(event)
    }

    const summary = buildSummary(searchedEvents)
    const detailEvents =
      query.eventType === 'ALL'
        ? searchedEvents
        : searchedEvents.filter((event) => event.eventType === query.eventType)
    const detailItems = detailEvents.map(buildReportItem)
    const sortedItems = sortItems(detailItems, query.sortBy, query.sortDirection)
    const paginatedItems =
      query.limit === 'all'
        ? sortedItems
        : sortedItems.slice(query.offset, query.offset + query.limit)

    return {
      filters: {
        eventType: query.eventType,
        period: query.period,
        startDate: query.startDate,
        endDate: query.endDate,
        search: query.search,
      },
      summary,
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
    mapActivityReportsError(error)
  }
}
