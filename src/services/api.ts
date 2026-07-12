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

async function parseJsonResponse<T>(response: Response, fallbackMessage: string): Promise<T> {
  let body: ApiResponse<T> & ApiErrorResponse

  try {
    body = await response.json()
  } catch {
    throw new Error(fallbackMessage)
  }

  if (!response.ok) {
    throw new Error(body.error?.message ?? fallbackMessage)
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

export async function getCollection(
  options: { search?: string; limit?: number | 'all'; offset?: number } = {},
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

  const query = params.toString()
  const response = await fetch(`${API_BASE_URL}/collection${query ? `?${query}` : ''}`)

  return parseJsonResponse<CollectionResponse>(response, 'Failed to load collection')
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

export async function createCatalogCigar(
  input: CreateCatalogCigarInput,
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
