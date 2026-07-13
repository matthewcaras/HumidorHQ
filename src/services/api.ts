const API_BASE_URL = 'http://localhost:3001/api'

export type StorageOrganizationType = 'GENERAL' | 'DRAWERS' | 'SHELVES' | 'CUSTOM'

export type StorageSubLocationKind = 'GENERAL' | 'DRAWER' | 'SHELF' | 'CUSTOM'

export type StorageSubLocation = {
  id: number
  name: string
  kind: StorageSubLocationKind
  capacity: number | null
  displayOrder: number
  isActive: boolean
}

export type Humidor = {
  id: number
  name: string
  capacity: number | null
  notes: string | null
  createdAt: string
  updatedAt: string
  hasShelves: boolean
shelfCount: number | null
  organizationType: StorageOrganizationType
  subLocations: StorageSubLocation[]
}

export type PurchaseReceiptState = 'EN_ROUTE' | 'PARTIALLY_RECEIVED' | 'RECEIVED'

export type PurchaseEditState = 'FULLY_EDITABLE' | 'NOTES_ONLY'

export type ReceiveStoreLineState = 'EN_ROUTE' | 'RECEIVED_NOT_STORED' | 'STORED'

export type Vendor = {
  id: number
  name: string
  nameKey: string
  website: string | null
  notes: string | null
  isActive: boolean
}

export type CreateVendorInput = {
  name: string
  website?: string
  notes?: string
}

export type CatalogCigar = {
  id: number
  manufacturer: string
  manufacturerKey: string
  series: string
  seriesKey: string
  vitola: string
  vitolaKey: string
  shape: string | null
  length: string | number | null
  ringGauge: number | null
  wrapper: string | null
  wrapperKey: string | null
  binder: string | null
  filler: string | null
  country: string | null
  strength: string | null
  msrp: string | number | null
  isActive: boolean
}

export type CreateCatalogCigarInput = {
  manufacturer: string
  series: string
  vitola: string
  shape?: string | null
  length?: string | number | null
  ringGauge?: string | number | null
  wrapper?: string | null
  binder?: string | null
  filler?: string | null
  country?: string | null
  strength?: string | null
  msrp?: string | number | null
}

export type CatalogStrength =
  | 'Mild'
  | 'Mild-Medium'
  | 'Medium'
  | 'Medium-Full'
  | 'Full'

export type CatalogWriteInput = {
  manufacturer: string
  series: string
  vitola: string
  shape?: string | null
  length?: string | null
  ringGauge?: number | null
  wrapper?: string | null
  binder?: string | null
  filler?: string | null
  country?: string | null
  strength?: CatalogStrength | null
  msrp?: string | null
}

export type CatalogManagementStatus = 'ACTIVE' | 'ARCHIVED' | 'ALL'

export type CatalogManagementSortBy = 'CIGAR' | 'MSRP' | 'UPDATED'

export type CatalogManagementSortDirection = 'ASC' | 'DESC'

export type CatalogManagementUsage = {
  currentQuantity: number
  lotCount: number
  purchaseLineCount: number
  currentLocationCount: number
}

export type CatalogManagementCigar = {
  id: number
  manufacturer: string
  series: string
  vitola: string
  shape: string | null
  length: string | number | null
  ringGauge: number | null
  wrapper: string | null
  binder: string | null
  filler: string | null
  country: string | null
  strength: string | null
  msrp: string | number | null
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export type CatalogManagementListItem = {
  catalogCigar: CatalogManagementCigar
  usage: CatalogManagementUsage
}

export type CatalogManagementSummary = {
  totalCatalogCount: number
  activeCount: number
  archivedCount: number
}

export type CatalogManagementResponse = {
  summary: CatalogManagementSummary
  items: CatalogManagementListItem[]
  total: number
  limit: number | 'all'
  offset: number
  sort: {
    sortBy: CatalogManagementSortBy
    sortDirection: CatalogManagementSortDirection
  }
  status: CatalogManagementStatus
  search: string
}

export type CatalogManagementLocation = {
  storageLocationId: number
  storageLocationName: string
  storageLocationIsActive: boolean
  storageSubLocationId: number
  storageSubLocationName: string
  storageSubLocationKind: StorageSubLocationKind
  storageSubLocationIsActive: boolean
  quantity: number
}

export type CatalogManagementDetailsUsage = CatalogManagementUsage & {
  inventoryEventCount: number
}

export type CatalogManagementDetails = {
  catalogCigar: CatalogManagementCigar
  usage: CatalogManagementDetailsUsage
  currentLocations: CatalogManagementLocation[]
}

export type PurchaseVendor = Vendor

export type PurchaseCatalogCigar = CatalogCigar

export type PurchaseLot = {
  id: number
  quantityPurchased: number
  quantityRemaining: number
  originalQuantity: number | null
  currentQuantity: number | null
  allocatedCostPerCigar: string | number | null
  costPerCigarSnapshot: string | number | null
  receivedDateSnapshot: string | null
  locationBalances?: LotLocationBalance[]
  events?: InventoryEvent[]
}

export type LotLocationBalance = {
  id: number
  lotId: number
  storageSubLocationId: number
  quantity: number
  createdAt: string
  updatedAt: string
}

export type InventoryEvent = {
  id: number
  lotId: number
  eventType: string
  quantity: number
  eventDate: string
  notes: string | null
  fromStorageSubLocationId: number | null
  toStorageSubLocationId: number | null
  costPerCigarAtEvent: string | number | null
  msrpPerCigarAtEvent: string | number | null
  createdAt: string
}

export type PurchaseLine = {
  id: number
  lineNumber: number
  quantity: number
  unitPrice: string | number
  lineSubtotal: string | number
  msrpPerCigar: string | number | null
  receivedDate: string | null
  allocatedShipping: string | number
  allocatedExciseTax: string | number
  allocatedSalesTax: string | number
  allocatedDiscount: string | number
  catalogCigar: PurchaseCatalogCigar
  lot: PurchaseLot | null
}

export type Purchase = {
  id: number
  vendorId: number | null
  purchaseDate: string | null
  invoiceNumber: string | null
  shipping: string | number
  exciseTax: string | number
  salesTax: string | number
  discount: string | number
  totalPaid: string | number | null
  notes: string | null
  vendor: PurchaseVendor | null
  lines: PurchaseLine[]
  receiptState: PurchaseReceiptState
  editState: PurchaseEditState
}

export type CreatePurchaseLineInput = {
  catalogCigarId: number
  quantity: number
  unitPrice: string
  msrpPerCigar?: string
  receivedDate?: string
}

export type CreatePurchaseInput = {
  vendorId: number
  purchaseDate: string
  invoiceNumber?: string
  shipping?: string
  exciseTax?: string
  salesTax?: string
  discount?: string
  totalPaid: string
  notes?: string
  lines: CreatePurchaseLineInput[]
}

export type ReceiveStoreInput = {
  receivedDate: string
  storageLocationId: number
  storageSubLocationId: number
}

export type ReceiveStoreResult = {
  purchaseLine: PurchaseLine
  lot: PurchaseLot
  locationBalance: LotLocationBalance
  inventoryEvent: InventoryEvent
  lineState: ReceiveStoreLineState
  purchaseReceiptState: PurchaseReceiptState
}

export type MoveLotInput = {
  fromStorageSubLocationId: number
  toStorageSubLocationId: number
  quantity: number
  eventDate: string
  notes?: string
}

export type RemovalType = 'SMOKED' | 'GIFTED' | 'DISCARDED'

export type RemoveFromLotInput = {
  fromStorageSubLocationId: number
  quantity: number
  removalType: RemovalType
  eventDate: string
  notes?: string
}

export type MoveLocationSnapshot = {
  storageLocationId: number
  storageLocationName: string
  storageLocationIsActive: boolean
  storageSubLocationId: number
  storageSubLocationName: string
  storageSubLocationKind: StorageSubLocationKind
  storageSubLocationIsActive: boolean
}

export type MoveLotResult = {
  lot: PurchaseLot
  inventoryEvent: InventoryEvent
  sourceBalance: LotLocationBalance | null
  destinationBalance: LotLocationBalance
  balances: LotLocationBalance[]
  totalCurrentQuantity: number
  sourceLocation: MoveLocationSnapshot
  destinationLocation: MoveLocationSnapshot
}

export type RemovalLocationSnapshot = MoveLocationSnapshot

export type RemoveFromLotResult = {
  lot: PurchaseLot
  inventoryEvent: InventoryEvent
  sourceBalance: LotLocationBalance | null
  balances: LotLocationBalance[]
  totalCurrentQuantity: number
  sourceLocation: RemovalLocationSnapshot
  removalType: RemovalType
  placementDepleted: boolean
  lotDepleted: boolean
}

export type DashboardInventoryIssue = {
  code: string
  message: string
  severity: 'WARNING'
  lotId?: number
  catalogCigarId?: number
  storageLocationId?: number
  storageSubLocationId?: number
}

export type DashboardCurrentCollection = {
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
  issues: DashboardInventoryIssue[]
}

export type DashboardRemovalMetric = {
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

export type DashboardStorageLocation = {
  id: number
  name: string
  capacity: number | null
  isActive: boolean
}

export type DashboardHumidor = {
  storageLocation: DashboardStorageLocation
  totalQuantity: number
  uniqueCigarCount: number
  oldestReceivedDate: string | null
  capacityUsedPercent: number | null
  averageMsrpPerCigar: string | null
  quantityMissingMsrp: number
  issues: DashboardInventoryIssue[]
}

export type DashboardCatalogCigar = Pick<
  CatalogCigar,
  'id' | 'manufacturer' | 'series' | 'vitola' | 'shape' | 'length' | 'ringGauge' | 'wrapper'
>

export type DashboardActivityLocation = {
  storageLocationId: number
  storageLocationName: string
  storageSubLocationId: number
  storageSubLocationName: string
  storageSubLocationKind: string
  isArchived: boolean
}

export type DashboardActivity = {
  id: number
  eventType: string
  quantity: number
  eventDate: string
  createdAt: string
  lotId: number
  catalogCigar: DashboardCatalogCigar | null
  sourceLocation: DashboardActivityLocation | null
  destinationLocation: DashboardActivityLocation | null
  costPerCigarAtEvent: string | null
  msrpPerCigarAtEvent: string | null
  notes: string | null
}

export type DashboardResponse = {
  currentCollection: DashboardCurrentCollection
  smoking: DashboardRemovalMetric
  gifted: DashboardRemovalMetric
  discarded: DashboardRemovalMetric
  humidors: DashboardHumidor[]
  recentActivity: DashboardActivity[]
  issues: DashboardInventoryIssue[]
}

export type RemovalReportType = 'ALL' | 'SMOKED' | 'GIFTED' | 'DISCARDED'

export type RemovalReportPeriod = 'LIFETIME' | 'CURRENT_YEAR' | 'PRIOR_YEAR' | 'CUSTOM'

export type RemovalReportSortBy =
  | 'EVENT_DATE'
  | 'RECORDED_DATE'
  | 'CIGAR'
  | 'QUANTITY'
  | 'COST'
  | 'MSRP'

export type RemovalReportSortDirection = 'ASC' | 'DESC'

export type RemovalReportLimit = number | 'all'

export type RemovalReportMetric = {
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

export type RemovalReportCatalogCigar = {
  id: number
  manufacturer: string
  series: string
  vitola: string
  wrapper: string | null
  isActive: boolean
}

export type RemovalReportSourceLocation = {
  storageLocationId: number
  storageLocationName: string
  storageLocationIsActive: boolean
  storageSubLocationId: number
  storageSubLocationName: string
  storageSubLocationKind: StorageSubLocationKind
  storageSubLocationIsActive: boolean
  isArchived: boolean
}

export type RemovalReportItem = {
  id: number
  removalType: Exclude<RemovalReportType, 'ALL'>
  quantity: number
  eventDate: string
  createdAt: string
  lotId: number
  catalogCigar: RemovalReportCatalogCigar | null
  sourceLocation: RemovalReportSourceLocation | null
  costPerCigarAtEvent: string | null
  msrpPerCigarAtEvent: string | null
  totalEventCost: string | null
  totalEventMsrp: string | null
  eventSavings: string | null
  notes: string | null
}

export type RemovalReportFilters = {
  removalType: RemovalReportType
  period: RemovalReportPeriod
  startDate: string | null
  endDate: string | null
  search: string
}

export type RemovalReportSummary = {
  combined: RemovalReportMetric
  smoking: RemovalReportMetric
  gifted: RemovalReportMetric
  discarded: RemovalReportMetric
}

export type RemovalReportResponse = {
  filters: RemovalReportFilters
  summary: RemovalReportSummary
  items: RemovalReportItem[]
  total: number
  limit: RemovalReportLimit
  offset: number
  sort: {
    sortBy: RemovalReportSortBy
    sortDirection: RemovalReportSortDirection
  }
}

export type ActivityReportEventType =
  | 'ALL'
  | 'INITIAL_PLACEMENT'
  | 'MOVE'
  | 'SMOKED'
  | 'GIFTED'
  | 'DISCARDED'

export type ActivityReportPeriod = 'LIFETIME' | 'CURRENT_YEAR' | 'PRIOR_YEAR' | 'CUSTOM'

export type ActivityReportSortBy =
  | 'EVENT_DATE'
  | 'RECORDED_DATE'
  | 'EVENT_TYPE'
  | 'CIGAR'
  | 'QUANTITY'

export type ActivityReportSortDirection = 'ASC' | 'DESC'

export type ActivityReportLimit = number | 'all'

export type ActivityReportIssueSeverity = 'INFO' | 'WARNING'

export type ActivityReportIssue = {
  code: string
  message: string
  severity: ActivityReportIssueSeverity
}

export type ActivityReportCatalogCigar = {
  id: number
  manufacturer: string
  series: string
  vitola: string
  wrapper: string | null
  isActive: boolean
}

export type ActivityReportLocation = {
  storageLocationId: number
  storageLocationName: string
  storageLocationIsActive: boolean
  storageSubLocationId: number
  storageSubLocationName: string
  storageSubLocationKind: StorageSubLocationKind
  storageSubLocationIsActive: boolean
  isArchived: boolean
}

export type ActivityReportItem = {
  id: number
  eventType: Exclude<ActivityReportEventType, 'ALL'>
  quantity: number
  eventDate: string
  createdAt: string
  lotId: number
  catalogCigar: ActivityReportCatalogCigar | null
  sourceLocation: ActivityReportLocation | null
  destinationLocation: ActivityReportLocation | null
  costPerCigarAtEvent: string | null
  msrpPerCigarAtEvent: string | null
  totalEventCost: string | null
  totalEventMsrp: string | null
  eventSavings: string | null
  notes: string | null
  issues: ActivityReportIssue[]
}

export type ActivityReportSummaryMetric = {
  eventCount: number
  quantity: number
}

export type ActivityReportSummary = {
  totalEvents: number
  initialPlacement: ActivityReportSummaryMetric
  moved: ActivityReportSummaryMetric
  smoked: ActivityReportSummaryMetric
  gifted: ActivityReportSummaryMetric
  discarded: ActivityReportSummaryMetric
  removed: ActivityReportSummaryMetric
}

export type ActivityReportResponse = {
  filters: {
    eventType: ActivityReportEventType
    period: ActivityReportPeriod
    startDate: string | null
    endDate: string | null
    search: string
  }
  summary: ActivityReportSummary
  items: ActivityReportItem[]
  total: number
  limit: ActivityReportLimit
  offset: number
  sort: {
    sortBy: ActivityReportSortBy
    sortDirection: ActivityReportSortDirection
  }
}

export type CollectionInventoryIssue = {
  code: string
  message: string
  severity: 'WARNING'
  lotId?: number
  catalogCigarId?: number
  storageLocationId?: number
  storageSubLocationId?: number
}

export type CollectionLocationSummary = {
  storageLocationId: number
  storageLocationName: string
  storageLocationIsActive: boolean
  storageSubLocationId: number
  storageSubLocationName: string
  storageSubLocationKind: StorageSubLocationKind
  storageSubLocationIsActive: boolean
  quantity: number
  lotCount: number
  oldestReceivedDate: string | null
}

export type CollectionSearchMatchType = 'CIGAR' | 'LOCATION' | 'BOTH' | null

export type CollectionSortBy =
  | 'CIGAR'
  | 'QUANTITY'
  | 'LOTS'
  | 'LOCATIONS'
  | 'OLDEST'
  | 'AVERAGE_COST'

export type CollectionSortDirection = 'ASC' | 'DESC'

export type CollectionItem = {
  catalogCigar: CatalogCigar
  totalQuantity: number
  lotCount: number
  locationCount: number
  oldestReceivedDate: string | null
  weightedAverageCostPerCigar: string | number | null
  averageMsrpPerCigar: string | number | null
  currentCostBasis: string | number | null
  currentMsrpValue: string | number | null
  savingsPerCigar: string | number | null
  totalSavings: string | number | null
  primaryLocations: CollectionLocationSummary[]
  searchMatchType: CollectionSearchMatchType
  matchingLocationQuantity: number
  matchingLocations: CollectionLocationSummary[]
  issues: CollectionInventoryIssue[]
}

export type CollectionSummary = {
  totalQuantity: number
  uniqueCigarCount: number
  lotCount: number
  locationCount: number
}

export type CollectionSearchSummary = {
  search: string
  matchedItemCount: number
  matchedLocationQuantity: number
}

export type CollectionResponse = {
  summary: CollectionSummary
  searchSummary: CollectionSearchSummary
  items: CollectionItem[]
  total: number
  limit: number | 'all'
  offset: number
  sort: {
    sortBy: CollectionSortBy
    sortDirection: CollectionSortDirection
  }
  issues: CollectionInventoryIssue[]
}

export type CollectionCigarSummary = {
  totalQuantity: number
  lotCount: number
  locationCount: number
  oldestReceivedDate: string | null
  weightedAverageCostPerCigar: string | number | null
  averageMsrpPerCigar: string | number | null
  currentCostBasis: string | number | null
  currentMsrpValue: string | number | null
  savingsPerCigar: string | number | null
  totalSavings: string | number | null
}

export type CollectionLotLocation = {
  storageLocationId: number
  storageLocationName: string
  storageSubLocationId: number
  storageSubLocationName: string
  storageSubLocationKind: StorageSubLocationKind
  quantity: number
  storageLocationIsActive: boolean
  storageSubLocationIsActive: boolean
}

export type CollectionLotSummary = {
  lotId: number
  purchaseOrderId: number | null
  purchaseLineId: number | null
  vendorIdSnapshot: number | null
  vendorNameSnapshot: string | null
  purchaseDate: string | null
  receivedDate: string | null
  originalQuantity: number | null
  currentQuantity: number
  cachedCurrentQuantity: number | null
  costPerCigar: string | number | null
  costSource: 'SNAPSHOT' | 'ALLOCATED' | 'ACTUAL_FALLBACK' | null
  msrpPerCigar: string | number | null
  msrpSource: 'SNAPSHOT' | 'LOT' | 'CATALOG_FALLBACK' | null
  currentCostBasis: string | number | null
  currentMsrpValue: string | number | null
  totalSavings: string | number | null
  invoiceOrSource: string | null
  locations: CollectionLotLocation[]
  issues: CollectionInventoryIssue[]
}

export type CollectionCigarDetails = {
  catalogCigar: CatalogCigar
  summary: CollectionCigarSummary
  locations: CollectionLocationSummary[]
  lots: CollectionLotSummary[]
  issues: CollectionInventoryIssue[]
}

export type CollectionHumidorStorageLocation = {
  id: number
  name: string
  capacity: number | null
  organizationType: StorageOrganizationType
  displayOrder: number
  isActive: boolean
  notes?: string | null
}

export type CollectionHumidorSectionPreview = {
  storageSubLocationId: number
  name: string
  kind: StorageSubLocationKind
  displayOrder: number
  isActive: boolean
  quantity: number
  uniqueCigarCount: number
  lotCount: number
}

export type CollectionHumidorSummary = {
  storageLocation: CollectionHumidorStorageLocation
  totalQuantity: number
  uniqueCigarCount: number
  lotCount: number
  occupiedSubLocationCount: number
  totalSubLocationCount: number
  oldestReceivedDate: string | null
  capacityUsedPercent: number | null
  sectionsPreview: CollectionHumidorSectionPreview[]
  issues: CollectionInventoryIssue[]
}

export type CollectionHumidorsResponse = {
  summary: {
    humidorCount: number
    totalQuantity: number
    uniqueCigarCount: number
    lotCount: number
    occupiedSubLocationCount: number
  }
  humidors: CollectionHumidorSummary[]
  issues: CollectionInventoryIssue[]
}

export type CollectionHumidorSectionCigar = {
  catalogCigar: CatalogCigar
  quantity: number
  lotCount: number
  oldestReceivedDate: string | null
  issues: CollectionInventoryIssue[]
}

export type CollectionHumidorSection = {
  storageSubLocationId: number
  name: string
  kind: StorageSubLocationKind
  displayOrder: number
  isActive: boolean
  quantity: number
  uniqueCigarCount: number
  lotCount: number
  oldestReceivedDate: string | null
  cigars: CollectionHumidorSectionCigar[]
  issues: CollectionInventoryIssue[]
}

export type CollectionHumidorDetailsSummary = {
  totalQuantity: number
  uniqueCigarCount: number
  lotCount: number
  occupiedSubLocationCount: number
  totalSubLocationCount: number
  oldestReceivedDate: string | null
  capacityUsedPercent: number | null
}

export type CollectionHumidorDetails = {
  storageLocation: CollectionHumidorStorageLocation
  summary: CollectionHumidorDetailsSummary
  sections: CollectionHumidorSection[]
  issues: CollectionInventoryIssue[]
}

export type CreateHumidorInput = {
  name: string
  capacity?: string
  organizationType?: StorageOrganizationType
  sectionCount?: string
  hasShelves?: boolean
  shelfCount?: string
}

export type UpdateHumidorInput = {
  name: string
  capacity?: string
  organizationType?: StorageOrganizationType
  sectionCount?: string
  hasShelves?: boolean
  shelfCount?: string
}

type ApiResponse<T> = {
  data: T
}

type ApiErrorResponse = {
  error?: {
    code?: string
    message?: string
  }
}

export class ApiError extends Error {
  code?: string

  constructor(message: string, code?: string) {
    super(message)
    this.name = 'ApiError'
    this.code = code
  }
}

async function parseJsonResponse<T>(response: Response, fallbackMessage: string): Promise<T> {
  let body: ApiResponse<T> & ApiErrorResponse

  try {
    body = await response.json()
  } catch {
    throw new ApiError(fallbackMessage)
  }

  if (!response.ok) {
    throw new ApiError(body.error?.message ?? fallbackMessage, body.error?.code)
  }

  return body.data
}

export async function getHumidors(): Promise<Humidor[]> {
  const response = await fetch(`${API_BASE_URL}/humidors`)

  return parseJsonResponse<Humidor[]>(response, 'Failed to load humidors')
}

export async function createHumidor(input: CreateHumidorInput): Promise<Humidor> {
  const response = await fetch(`${API_BASE_URL}/humidors`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  })

  return parseJsonResponse<Humidor>(response, 'Failed to create humidor')
}

export async function updateHumidor(
  id: number,
  input: UpdateHumidorInput,
): Promise<Humidor> {
  const response = await fetch(`${API_BASE_URL}/humidors/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  })

  return parseJsonResponse<Humidor>(response, 'Failed to update humidor')
}

export async function archiveHumidor(id: number): Promise<Humidor> {
  const response = await fetch(`${API_BASE_URL}/humidors/${id}/archive`, {
    method: 'PATCH',
  })

  return parseJsonResponse<Humidor>(response, 'Failed to archive humidor')
}

export async function getDashboard(): Promise<DashboardResponse> {
  const response = await fetch(`${API_BASE_URL}/dashboard`)

  return parseJsonResponse<DashboardResponse>(response, 'Failed to load Dashboard')
}

export async function getRemovalReport(
  options: {
    removalType?: RemovalReportType
    period?: RemovalReportPeriod
    startDate?: string
    endDate?: string
    search?: string
    sortBy?: RemovalReportSortBy
    sortDirection?: RemovalReportSortDirection
    limit?: RemovalReportLimit
    offset?: number
  } = {},
): Promise<RemovalReportResponse> {
  const params = new URLSearchParams()

  if (options.removalType !== undefined) {
    params.set('removalType', options.removalType)
  }

  if (options.period !== undefined) {
    params.set('period', options.period)
  }

  if (options.period !== 'LIFETIME') {
    if (options.startDate !== undefined) {
      params.set('startDate', options.startDate)
    }

    if (options.endDate !== undefined) {
      params.set('endDate', options.endDate)
    }
  }

  if (options.search?.trim()) {
    params.set('search', options.search.trim())
  }

  if (options.sortBy !== undefined) {
    params.set('sortBy', options.sortBy)
  }

  if (options.sortDirection !== undefined) {
    params.set('sortDirection', options.sortDirection)
  }

  if (options.limit !== undefined) {
    params.set('limit', String(options.limit))
  }

  if (options.offset !== undefined) {
    params.set('offset', String(options.offset))
  }

  const query = params.toString()
  const response = await fetch(`${API_BASE_URL}/reports/removals${query ? `?${query}` : ''}`)

  return parseJsonResponse<RemovalReportResponse>(
    response,
    'Failed to load removal report',
  )
}

export async function getActivityReport(
  options: {
    eventType?: ActivityReportEventType
    period?: ActivityReportPeriod
    startDate?: string
    endDate?: string
    search?: string
    sortBy?: ActivityReportSortBy
    sortDirection?: ActivityReportSortDirection
    limit?: ActivityReportLimit
    offset?: number
  } = {},
): Promise<ActivityReportResponse> {
  const params = new URLSearchParams()

  if (options.eventType !== undefined) {
    params.set('eventType', options.eventType)
  }

  if (options.period !== undefined) {
    params.set('period', options.period)
  }

  if (options.period !== 'LIFETIME') {
    if (options.startDate !== undefined) {
      params.set('startDate', options.startDate)
    }

    if (options.endDate !== undefined) {
      params.set('endDate', options.endDate)
    }
  }

  if (options.search?.trim()) {
    params.set('search', options.search.trim())
  }

  if (options.sortBy !== undefined) {
    params.set('sortBy', options.sortBy)
  }

  if (options.sortDirection !== undefined) {
    params.set('sortDirection', options.sortDirection)
  }

  if (options.limit !== undefined) {
    params.set('limit', String(options.limit))
  }

  if (options.offset !== undefined) {
    params.set('offset', String(options.offset))
  }

  const query = params.toString()
  const response = await fetch(`${API_BASE_URL}/reports/activity${query ? `?${query}` : ''}`)

  return parseJsonResponse<ActivityReportResponse>(
    response,
    'Failed to load activity report',
  )
}

export async function getCollection(
  options: {
    search?: string
    limit?: number | 'all'
    offset?: number
    sortBy?: CollectionSortBy
    sortDirection?: CollectionSortDirection
  } = {},
): Promise<CollectionResponse> {
  const params = new URLSearchParams()

  if (options.search?.trim()) {
    params.set('search', options.search.trim())
  }

  if (options.limit !== undefined) {
    params.set('limit', String(options.limit))
  }

  if (options.offset !== undefined) {
    params.set('offset', String(options.offset))
  }

  if (options.sortBy !== undefined) {
    params.set('sortBy', options.sortBy)
  }

  if (options.sortDirection !== undefined) {
    params.set('sortDirection', options.sortDirection)
  }

  const query = params.toString()
  const response = await fetch(`${API_BASE_URL}/collection${query ? `?${query}` : ''}`)

  return parseJsonResponse<CollectionResponse>(response, 'Failed to load collection')
}

export async function getCollectionCigarDetails(
  catalogCigarId: number,
): Promise<CollectionCigarDetails> {
  const response = await fetch(`${API_BASE_URL}/collection/${catalogCigarId}`)

  return parseJsonResponse<CollectionCigarDetails>(
    response,
    'Failed to load cigar details',
  )
}

export async function getCollectionHumidors(): Promise<CollectionHumidorsResponse> {
  const response = await fetch(`${API_BASE_URL}/collection/humidors`)

  return parseJsonResponse<CollectionHumidorsResponse>(
    response,
    'Failed to load collection humidors',
  )
}

export async function getCollectionHumidorDetails(
  storageLocationId: number,
): Promise<CollectionHumidorDetails> {
  const response = await fetch(`${API_BASE_URL}/collection/humidors/${storageLocationId}`)

  return parseJsonResponse<CollectionHumidorDetails>(
    response,
    'Failed to load humidor collection details',
  )
}

export async function moveLot(
  lotId: number,
  input: MoveLotInput,
): Promise<MoveLotResult> {
  const response = await fetch(`${API_BASE_URL}/lots/${lotId}/move`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  })

  return parseJsonResponse<MoveLotResult>(response, 'Failed to move cigars')
}

export async function removeFromLot(
  lotId: number,
  input: RemoveFromLotInput,
): Promise<RemoveFromLotResult> {
  const response = await fetch(`${API_BASE_URL}/lots/${lotId}/remove`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  })

  return parseJsonResponse<RemoveFromLotResult>(response, 'Failed to remove cigars')
}

export async function getVendors(search?: string): Promise<Vendor[]> {
  const params = new URLSearchParams()

  if (search?.trim()) {
    params.set('search', search.trim())
  }

  const query = params.toString()
  const response = await fetch(`${API_BASE_URL}/vendors${query ? `?${query}` : ''}`)

  return parseJsonResponse<Vendor[]>(response, 'Failed to load vendors')
}

export async function createVendor(input: CreateVendorInput): Promise<Vendor> {
  const response = await fetch(`${API_BASE_URL}/vendors`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  })

  return parseJsonResponse<Vendor>(response, 'Failed to create vendor')
}

export async function getCatalogCigars(
  options: { search?: string; limit?: number } = {},
): Promise<CatalogCigar[]> {
  const params = new URLSearchParams()

  if (options.search?.trim()) {
    params.set('search', options.search.trim())
  }

  if (options.limit !== undefined) {
    params.set('limit', String(options.limit))
  }

  const query = params.toString()
  const response = await fetch(`${API_BASE_URL}/catalog${query ? `?${query}` : ''}`)

  return parseJsonResponse<CatalogCigar[]>(response, 'Failed to load catalog cigars')
}

export async function getManagedCatalog(
  options: {
    search?: string
    status?: CatalogManagementStatus
    sortBy?: CatalogManagementSortBy
    sortDirection?: CatalogManagementSortDirection
    limit?: number | 'all'
    offset?: number
  } = {},
): Promise<CatalogManagementResponse> {
  const params = new URLSearchParams()

  if (options.search?.trim()) {
    params.set('search', options.search.trim())
  }

  if (options.status !== undefined) {
    params.set('status', options.status)
  }

  if (options.sortBy !== undefined) {
    params.set('sortBy', options.sortBy)
  }

  if (options.sortDirection !== undefined) {
    params.set('sortDirection', options.sortDirection)
  }

  if (options.limit !== undefined) {
    params.set('limit', String(options.limit))
  }

  if (options.offset !== undefined) {
    params.set('offset', String(options.offset))
  }

  const query = params.toString()
  const response = await fetch(`${API_BASE_URL}/catalog/manage${query ? `?${query}` : ''}`)

  return parseJsonResponse<CatalogManagementResponse>(
    response,
    'Failed to load Catalog',
  )
}

export async function getManagedCatalogDetails(
  catalogCigarId: number,
): Promise<CatalogManagementDetails> {
  const response = await fetch(`${API_BASE_URL}/catalog/${catalogCigarId}`)

  return parseJsonResponse<CatalogManagementDetails>(
    response,
    'Failed to load Catalog details',
  )
}

export async function createCatalogCigar(
  input: CreateCatalogCigarInput | CatalogWriteInput,
): Promise<CatalogCigar> {
  const response = await fetch(`${API_BASE_URL}/catalog`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  })

  return parseJsonResponse<CatalogCigar>(response, 'Failed to create catalog cigar')
}

export async function updateCatalogCigar(
  id: number,
  input: CatalogWriteInput,
): Promise<CatalogCigar> {
  const response = await fetch(`${API_BASE_URL}/catalog/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  })

  return parseJsonResponse<CatalogCigar>(response, 'Failed to update catalog cigar')
}

export async function archiveCatalogCigar(id: number): Promise<CatalogCigar> {
  const response = await fetch(`${API_BASE_URL}/catalog/${id}/archive`, {
    method: 'PATCH',
  })

  return parseJsonResponse<CatalogCigar>(response, 'Failed to archive catalog cigar')
}

export async function restoreCatalogCigar(id: number): Promise<CatalogCigar> {
  const response = await fetch(`${API_BASE_URL}/catalog/${id}/restore`, {
    method: 'PATCH',
  })

  return parseJsonResponse<CatalogCigar>(response, 'Failed to restore catalog cigar')
}

export async function getPurchases(search?: string): Promise<Purchase[]> {
  const params = new URLSearchParams()

  if (search?.trim()) {
    params.set('search', search.trim())
  }

  const query = params.toString()
  const response = await fetch(`${API_BASE_URL}/purchases${query ? `?${query}` : ''}`)

  return parseJsonResponse<Purchase[]>(response, 'Failed to load purchases')
}

export async function getPurchaseById(id: number): Promise<Purchase> {
  const response = await fetch(`${API_BASE_URL}/purchases/${id}`)

  return parseJsonResponse<Purchase>(response, 'Failed to load purchase')
}

export async function createPurchase(input: CreatePurchaseInput): Promise<Purchase> {
  const response = await fetch(`${API_BASE_URL}/purchases`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  })

  return parseJsonResponse<Purchase>(response, 'Failed to create purchase')
}

export async function updatePurchase(
  id: number,
  input: CreatePurchaseInput,
): Promise<Purchase> {
  const response = await fetch(`${API_BASE_URL}/purchases/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  })

  return parseJsonResponse<Purchase>(response, 'Failed to update purchase')
}

export async function updatePurchaseNotes(
  id: number,
  notes: string | null,
): Promise<Purchase> {
  const response = await fetch(`${API_BASE_URL}/purchases/${id}/notes`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ notes }),
  })

  return parseJsonResponse<Purchase>(response, 'Failed to update purchase notes')
}

export async function receiveAndStorePurchaseLine(
  purchaseLineId: number,
  input: ReceiveStoreInput,
): Promise<ReceiveStoreResult> {
  const response = await fetch(`${API_BASE_URL}/purchase-lines/${purchaseLineId}/receive-store`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  })

  return parseJsonResponse<ReceiveStoreResult>(response, 'Failed to receive and store cigars')
}
