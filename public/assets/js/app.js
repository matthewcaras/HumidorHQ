/*
 * Filename: app.js
 * Revision: 1.24.23
 * Description: Plain JavaScript browser source for HumidorHQ inventory, purchase, humidor, and report workflows.
 * Modified Date: 2026-07-22 13:45 ET
 */

const API_BASE_URL = 'api'

const state = {
  activePage: 'Dashboard',
  session: null,
  sampleData: null,
  records: {},
  editing: {},
  auditData: null,
  changelog: null,
  todo: null,
  error: null,
  authError: null,
  formError: null,
  appMeta: null,
  isLoading: true,
  collectionSort: 'alpha',
  collectionDirection: 'asc',
  collectionHumidorFilterId: null,
  collectionSectionFilterId: null,
  collectionStrengthFilter: '',
  collectionBuyAgainFilter: '',
  collectionSearch: '',
  catalogSearch: '',
  selectedCatalogHistoryCigarId: null,
  selectedCollectionCigarId: null,
  collectionScrollTargetCigarId: null,
  collectionAutoOpenMoveCigarId: null,
  selectedPurchaseId: null,
  editingPurchaseLineId: null,
  purchaseLineCatalogId: null,
  purchaseDraftLines: [],
  purchaseDraftOrder: null,
  purchaseDraftEntry: null,
  receiptKeys: {},
  removalKeys: {},
  adjustmentKeys: {},
  pendingSmokingJournalEventId: null,
  showArchivedRecords: {},
  reversalKeys: {},
  reversingEventId: null,
  showAllActivity: false,
  activityPeriod: 'lifetime',
  activityType: 'all',
  activitySearch: '',
  activityLotId: '',
  activityHumidorId: '',
  activityCustomStart: '',
  activityCustomEnd: '',
  showPurchaseCatalogCreate: false,
  showPurchaseOrderForm: false,
  selectedHumidorId: null,
  editingHumidorSectionId: null,
  reportPeriod: 'lifetime',
  reportRemovalType: 'all',
  reportSearch: '',
  reportCustomStart: '',
  reportCustomEnd: '',
  purchaseHistoryGroup: 'vendor',
  purchaseHistoryVendorId: '',
  purchaseHistoryManufacturer: '',
  purchaseHistoryBuyAgainFilter: '',
  purchaseTrendPeriod: 'year',
  purchaseRecordsFilterType: '',
  purchaseRecordsFilterValue: '',
  purchaseRecordsFilterLabel: '',
  reportSectionState: {
    purchaseTrend: false,
    purchaseHistory: false,
    ratingBreakdown: false,
    inventoryAging: false,
    removalHistory: false,
    activity: false,
  },
  ratingBreakdownDimension: 'strength',
  agingManufacturer: '',
  agingHumidorId: '',
  selectedAgingBucketKey: null,
  backupData: null,
  backupPreview: null,
  backupMessage: '',
  productionImportData: null,
  productionImportMessage: '',
  sidebarCollapsed: Boolean(globalThis.matchMedia?.('(max-width: 850px)').matches),
}

const pages = [
  { id: 'Dashboard', label: 'Dashboard' },
  { id: 'Collection', label: 'Collection' },
  { id: 'Catalog', label: 'Catalog' },
  { id: 'Vendors', label: 'Vendors' },
  { id: 'Purchases', label: 'Purchases' },
  { id: 'PurchaseLines', label: 'PO Lines', hidden: true },
  { id: 'Humidors', label: 'Humidors' },
  { id: 'Reports', label: 'Reports' },
  { id: 'Backups', label: 'Backup & Restore' },
  { id: 'ProductionImport', label: 'Production Import', hidden: true },
  { id: 'Audit', label: 'Audit', hidden: true },
  { id: 'Changelog', label: 'Changelog', hidden: true },
  { id: 'Todo', label: 'TODO', hidden: true },
]

const purchaseStatusOptions = [
  { value: 'pending', label: 'Pending' },
  { value: 'partially-received', label: 'Partially Received' },
  { value: 'received', label: 'Received' },
]

const buyAgainStatusOptions = [
  { value: '', label: 'Not Evaluated' },
  { value: 'YES', label: 'Yes' },
  { value: 'MAYBE', label: 'Maybe' },
  { value: 'NO', label: 'No' },
]

function normalizeBuyAgainStatus(value) {
  const normalized = String(value || '').trim().toUpperCase().replace(/[ -]/g, '_')
  return ['YES', 'MAYBE', 'NO'].includes(normalized) ? normalized : ''
}

function buyAgainLabel(value) {
  return buyAgainStatusOptions.find((option) => option.value === normalizeBuyAgainStatus(value))?.label || 'Not Evaluated'
}

const collectionViewStorageKey = 'humidorhq.collection.views.v1'

function collectionViewStorage() {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

function collectionViewSnapshot() {
  return {
    sort: state.collectionSort,
    direction: state.collectionDirection,
    humidorId: state.collectionHumidorFilterId ? Number(state.collectionHumidorFilterId) : null,
    sectionId: state.collectionSectionFilterId ? Number(state.collectionSectionFilterId) : null,
    strength: String(state.collectionStrengthFilter || ''),
    buyAgain: String(state.collectionBuyAgainFilter || ''),
    search: String(state.collectionSearch || ''),
  }
}

function normalizeCollectionViewRecord(entry) {
  if (!entry || typeof entry !== 'object') return null
  const name = String(entry.name || '').trim()
  const snapshot = entry.snapshot && typeof entry.snapshot === 'object' ? entry.snapshot : null
  if (!name || !snapshot) return null
  return {
    name,
    snapshot: {
      sort: ['alpha', 'location', 'strength'].includes(snapshot.sort) ? snapshot.sort : 'alpha',
      direction: snapshot.direction === 'desc' ? 'desc' : 'asc',
      humidorId: Number(snapshot.humidorId || 0) || null,
      sectionId: Number(snapshot.sectionId || 0) || null,
      strength: String(snapshot.strength || ''),
      buyAgain: String(snapshot.buyAgain || ''),
      search: String(snapshot.search || ''),
    },
  }
}

function collectionSavedViews() {
  const storage = collectionViewStorage()
  if (!storage) return []
  try {
    const raw = storage.getItem(collectionViewStorageKey)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.map(normalizeCollectionViewRecord).filter(Boolean).sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: 'base' }))
  } catch {
    return []
  }
}

function storeCollectionSavedViews(views) {
  const storage = collectionViewStorage()
  if (!storage) return
  try {
    storage.setItem(collectionViewStorageKey, JSON.stringify(views))
  } catch {
    // Ignore storage failures; saved views are a convenience layer only.
  }
}

function collectionViewMatchesCurrent(snapshot) {
  const current = collectionViewSnapshot()
  return JSON.stringify(current) === JSON.stringify(snapshot)
}

function applyCollectionView(name) {
  const view = collectionSavedViews().find((item) => item.name === name)
  if (!view) return false
  state.collectionSort = view.snapshot.sort
  state.collectionDirection = view.snapshot.direction
  state.collectionHumidorFilterId = view.snapshot.humidorId
  state.collectionSectionFilterId = view.snapshot.sectionId
  state.collectionStrengthFilter = view.snapshot.strength
  state.collectionBuyAgainFilter = view.snapshot.buyAgain
  state.collectionSearch = view.snapshot.search
  state.selectedCollectionCigarId = null
  state.collectionScrollTargetCigarId = null
  if (typeof document !== 'undefined' && typeof render === 'function') {
    render()
  }
  return true
}

function saveCollectionView(name) {
  const trimmedName = String(name || '').trim()
  if (!trimmedName) return false
  const views = collectionSavedViews()
  const next = views.filter((item) => item.name.toLowerCase() !== trimmedName.toLowerCase())
  next.push({ name: trimmedName, snapshot: collectionViewSnapshot() })
  storeCollectionSavedViews(next)
  return true
}

function deleteCollectionView(name) {
  const trimmedName = String(name || '').trim()
  if (!trimmedName) return false
  const next = collectionSavedViews().filter((item) => item.name.toLowerCase() !== trimmedName.toLowerCase())
  storeCollectionSavedViews(next)
  return true
}

const purchaseHistoryViewStorageKey = 'humidorhq.purchaseHistory.views.v1'

function purchaseHistoryViewStorage() {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

function purchaseHistoryViewSnapshot() {
  return {
    group: state.purchaseHistoryGroup,
    vendorId: String(state.purchaseHistoryVendorId || ''),
    manufacturer: String(state.purchaseHistoryManufacturer || ''),
    buyAgain: String(state.purchaseHistoryBuyAgainFilter || ''),
  }
}

function normalizePurchaseHistoryViewRecord(entry) {
  if (!entry || typeof entry !== 'object') return null
  const name = String(entry.name || '').trim()
  const snapshot = entry.snapshot && typeof entry.snapshot === 'object' ? entry.snapshot : null
  if (!name || !snapshot) return null
  return {
    name,
    snapshot: {
      group: ['vendor', 'manufacturer'].includes(snapshot.group) ? snapshot.group : 'vendor',
      vendorId: String(snapshot.vendorId || ''),
      manufacturer: String(snapshot.manufacturer || ''),
      buyAgain: String(snapshot.buyAgain || ''),
    },
  }
}

function purchaseHistorySavedViews() {
  const storage = purchaseHistoryViewStorage()
  if (!storage) return []
  try {
    const raw = storage.getItem(purchaseHistoryViewStorageKey)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.map(normalizePurchaseHistoryViewRecord).filter(Boolean).sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: 'base' }))
  } catch {
    return []
  }
}

function storePurchaseHistorySavedViews(views) {
  const storage = purchaseHistoryViewStorage()
  if (!storage) return
  try {
    storage.setItem(purchaseHistoryViewStorageKey, JSON.stringify(views))
  } catch {
    // Ignore storage failures; saved views are a convenience layer only.
  }
}

function purchaseHistoryViewMatchesCurrent(snapshot) {
  const current = purchaseHistoryViewSnapshot()
  return JSON.stringify(current) === JSON.stringify(snapshot)
}

function applyPurchaseHistoryView(name) {
  const view = purchaseHistorySavedViews().find((item) => item.name === name)
  if (!view) return false
  state.purchaseHistoryGroup = view.snapshot.group
  state.purchaseHistoryVendorId = view.snapshot.vendorId
  state.purchaseHistoryManufacturer = view.snapshot.manufacturer
  state.purchaseHistoryBuyAgainFilter = view.snapshot.buyAgain
  if (typeof document !== 'undefined' && typeof render === 'function') {
    render()
  }
  return true
}

function savePurchaseHistoryView(name) {
  const trimmedName = String(name || '').trim()
  if (!trimmedName) return false
  const views = purchaseHistorySavedViews()
  const next = views.filter((item) => item.name.toLowerCase() !== trimmedName.toLowerCase())
  next.push({ name: trimmedName, snapshot: purchaseHistoryViewSnapshot() })
  storePurchaseHistorySavedViews(next)
  return true
}

function deletePurchaseHistoryView(name) {
  const trimmedName = String(name || '').trim()
  if (!trimmedName) return false
  const next = purchaseHistorySavedViews().filter((item) => item.name.toLowerCase() !== trimmedName.toLowerCase())
  storePurchaseHistorySavedViews(next)
  return true
}

const reportsViewStorageKey = 'humidorhq.reports.views.v1'

function reportsViewStorage() {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

function reportsViewSnapshot() {
  return {
    purchaseTrendPeriod: state.purchaseTrendPeriod,
    purchaseRecordsFilterType: String(state.purchaseRecordsFilterType || ''),
    purchaseRecordsFilterValue: String(state.purchaseRecordsFilterValue || ''),
    purchaseRecordsFilterLabel: String(state.purchaseRecordsFilterLabel || ''),
    purchaseHistoryGroup: state.purchaseHistoryGroup,
    purchaseHistoryVendorId: String(state.purchaseHistoryVendorId || ''),
    purchaseHistoryManufacturer: String(state.purchaseHistoryManufacturer || ''),
    purchaseHistoryBuyAgainFilter: String(state.purchaseHistoryBuyAgainFilter || ''),
    ratingBreakdownDimension: state.ratingBreakdownDimension,
    reportPeriod: state.reportPeriod,
    reportRemovalType: state.reportRemovalType,
    reportSearch: String(state.reportSearch || ''),
    agingManufacturer: String(state.agingManufacturer || ''),
    agingHumidorId: String(state.agingHumidorId || ''),
    selectedAgingBucketKey: state.selectedAgingBucketKey || null,
    activityPeriod: state.activityPeriod,
    activityType: state.activityType,
    activitySearch: String(state.activitySearch || ''),
    activityLotId: String(state.activityLotId || ''),
    activityHumidorId: String(state.activityHumidorId || ''),
    activityCustomStart: String(state.activityCustomStart || ''),
    activityCustomEnd: String(state.activityCustomEnd || ''),
    showAllActivity: Boolean(state.showAllActivity),
    reportSectionState: {
      purchaseTrend: Boolean(state.reportSectionState?.purchaseTrend),
      purchaseHistory: Boolean(state.reportSectionState?.purchaseHistory),
      ratingBreakdown: Boolean(state.reportSectionState?.ratingBreakdown),
      inventoryAging: Boolean(state.reportSectionState?.inventoryAging),
      removalHistory: Boolean(state.reportSectionState?.removalHistory),
      activity: Boolean(state.reportSectionState?.activity),
    },
  }
}

function normalizeReportsViewRecord(entry) {
  if (!entry || typeof entry !== 'object') return null
  const name = String(entry.name || '').trim()
  const snapshot = entry.snapshot && typeof entry.snapshot === 'object' ? entry.snapshot : null
  if (!name || !snapshot) return null
  return {
    name,
    snapshot: {
      purchaseTrendPeriod: snapshot.purchaseTrendPeriod === 'month' ? 'month' : 'year',
      purchaseRecordsFilterType: String(snapshot.purchaseRecordsFilterType || ''),
      purchaseRecordsFilterValue: String(snapshot.purchaseRecordsFilterValue || ''),
      purchaseRecordsFilterLabel: String(snapshot.purchaseRecordsFilterLabel || ''),
      purchaseHistoryGroup: snapshot.purchaseHistoryGroup === 'manufacturer' ? 'manufacturer' : 'vendor',
      purchaseHistoryVendorId: String(snapshot.purchaseHistoryVendorId || ''),
      purchaseHistoryManufacturer: String(snapshot.purchaseHistoryManufacturer || ''),
      purchaseHistoryBuyAgainFilter: String(snapshot.purchaseHistoryBuyAgainFilter || ''),
      ratingBreakdownDimension: ['strength', 'wrapper', 'origin', 'size', 'manufacturer'].includes(snapshot.ratingBreakdownDimension) ? snapshot.ratingBreakdownDimension : 'strength',
      reportPeriod: ['lifetime', 'current', 'prior', 'custom'].includes(snapshot.reportPeriod) ? snapshot.reportPeriod : 'lifetime',
      reportRemovalType: ['all', 'SMOKED', 'GIFTED', 'DISCARDED'].includes(snapshot.reportRemovalType) ? snapshot.reportRemovalType : 'all',
      reportSearch: String(snapshot.reportSearch || ''),
      agingManufacturer: String(snapshot.agingManufacturer || ''),
      agingHumidorId: String(snapshot.agingHumidorId || ''),
      selectedAgingBucketKey: String(snapshot.selectedAgingBucketKey || '') || null,
      activityPeriod: ['lifetime', 'current', 'prior', 'custom'].includes(snapshot.activityPeriod) ? snapshot.activityPeriod : 'lifetime',
      activityType: ['all', 'PURCHASE_RECEIPT', 'MOVE', 'SMOKED', 'GIFTED', 'DISCARDED', 'INVENTORY_ADJUSTMENT', 'REVERSAL'].includes(snapshot.activityType) ? snapshot.activityType : 'all',
      activitySearch: String(snapshot.activitySearch || ''),
      activityLotId: String(snapshot.activityLotId || ''),
      activityHumidorId: String(snapshot.activityHumidorId || ''),
      activityCustomStart: String(snapshot.activityCustomStart || ''),
      activityCustomEnd: String(snapshot.activityCustomEnd || ''),
      showAllActivity: Boolean(snapshot.showAllActivity),
      reportSectionState: {
        purchaseTrend: Boolean(snapshot.reportSectionState?.purchaseTrend),
        purchaseHistory: Boolean(snapshot.reportSectionState?.purchaseHistory),
        ratingBreakdown: Boolean(snapshot.reportSectionState?.ratingBreakdown),
        inventoryAging: Boolean(snapshot.reportSectionState?.inventoryAging),
        removalHistory: Boolean(snapshot.reportSectionState?.removalHistory),
        activity: Boolean(snapshot.reportSectionState?.activity),
      },
    },
  }
}

function reportsSavedViews() {
  const storage = reportsViewStorage()
  if (!storage) return []
  try {
    const raw = storage.getItem(reportsViewStorageKey)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.map(normalizeReportsViewRecord).filter(Boolean).sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: 'base' }))
  } catch {
    return []
  }
}

function storeReportsSavedViews(views) {
  const storage = reportsViewStorage()
  if (!storage) return
  try {
    storage.setItem(reportsViewStorageKey, JSON.stringify(views))
  } catch {
    // Ignore storage failures; saved views are a convenience layer only.
  }
}

function reportsViewMatchesCurrent(snapshot) {
  return JSON.stringify(reportsViewSnapshot()) === JSON.stringify(snapshot)
}

function applyReportsView(name) {
  const view = reportsSavedViews().find((item) => item.name === name)
  if (!view) return false
  state.purchaseTrendPeriod = view.snapshot.purchaseTrendPeriod
  state.purchaseRecordsFilterType = view.snapshot.purchaseRecordsFilterType
  state.purchaseRecordsFilterValue = view.snapshot.purchaseRecordsFilterValue
  state.purchaseRecordsFilterLabel = view.snapshot.purchaseRecordsFilterLabel
  state.purchaseHistoryGroup = view.snapshot.purchaseHistoryGroup
  state.purchaseHistoryVendorId = view.snapshot.purchaseHistoryVendorId
  state.purchaseHistoryManufacturer = view.snapshot.purchaseHistoryManufacturer
  state.purchaseHistoryBuyAgainFilter = view.snapshot.purchaseHistoryBuyAgainFilter
  state.ratingBreakdownDimension = view.snapshot.ratingBreakdownDimension
  state.reportPeriod = view.snapshot.reportPeriod
  state.reportRemovalType = view.snapshot.reportRemovalType
  state.reportSearch = view.snapshot.reportSearch
  state.agingManufacturer = view.snapshot.agingManufacturer
  state.agingHumidorId = view.snapshot.agingHumidorId
  state.selectedAgingBucketKey = view.snapshot.selectedAgingBucketKey
  state.activityPeriod = view.snapshot.activityPeriod
  state.activityType = view.snapshot.activityType
  state.activitySearch = view.snapshot.activitySearch
  state.activityLotId = view.snapshot.activityLotId
  state.activityHumidorId = view.snapshot.activityHumidorId
  state.activityCustomStart = view.snapshot.activityCustomStart
  state.activityCustomEnd = view.snapshot.activityCustomEnd
  state.showAllActivity = view.snapshot.showAllActivity
  state.reportSectionState = { ...view.snapshot.reportSectionState }
  state.reversingEventId = null
  if (typeof document !== 'undefined' && typeof render === 'function') {
    render()
  }
  return true
}

function saveReportsView(name) {
  const trimmedName = String(name || '').trim()
  if (!trimmedName) return false
  const views = reportsSavedViews()
  const next = views.filter((item) => item.name.toLowerCase() !== trimmedName.toLowerCase())
  next.push({ name: trimmedName, snapshot: reportsViewSnapshot() })
  storeReportsSavedViews(next)
  return true
}

function deleteReportsView(name) {
  const trimmedName = String(name || '').trim()
  if (!trimmedName) return false
  const next = reportsSavedViews().filter((item) => item.name.toLowerCase() !== trimmedName.toLowerCase())
  storeReportsSavedViews(next)
  return true
}

function catalogCigarForInventoryEvent(event) {
  const lot = recordById('lots', event?.lotId)
  return recordById('catalog-cigars', event?.catalogCigarId || lot?.catalogCigarId)
}

function smokingJournalBuyAgainDefaults(event) {
  const cigar = catalogCigarForInventoryEvent(event)
  return {
    status: normalizeBuyAgainStatus(cigar?.buyAgainStatus),
    notes: String(cigar?.buyAgainNotes || ''),
  }
}

function catalogRecordsForDisplay(catalogRecords, search = '') {
  const query = String(search || '').trim().toLowerCase()
  return catalogRecords
    .filter((cigar) => !query || [
      cigarName(cigar),
      cigar.manufacturer,
      cigar.series,
      cigar.vitola,
      cigar.shape,
      cigar.wrapper,
      cigar.binder,
      cigar.filler,
      cigar.country,
      cigar.strength,
      buyAgainLabel(cigar.buyAgainStatus),
      cigar.buyAgainNotes,
      cigar.notes,
    ].some((value) => String(value || '').toLowerCase().includes(query)))
    .slice()
    .sort((left, right) => cigarName(left).localeCompare(cigarName(right), undefined, { sensitivity: 'base' }) || Number(left.id || 0) - Number(right.id || 0))
}

const pageDependencies = {
  Dashboard: ['catalog-cigars', 'purchases', 'purchase-lines', 'lots', 'lot-location-balances', 'inventory-events', 'smoking-journal-entries', 'storage-locations', 'storage-sub-locations'],
  Collection: ['catalog-cigars', 'purchases', 'purchase-lines', 'lots', 'lot-location-balances', 'inventory-events', 'smoking-journal-entries', 'storage-locations', 'storage-sub-locations'],
  Purchases: ['purchases', 'vendors', 'catalog-cigars', 'purchase-lines', 'storage-locations', 'storage-sub-locations', 'lots', 'lot-location-balances', 'inventory-events'],
  Humidors: ['storage-locations', 'storage-sub-locations', 'catalog-cigars', 'purchase-lines', 'purchases', 'lots', 'lot-location-balances', 'inventory-events'],
  Reports: ['catalog-cigars', 'vendors', 'purchases', 'purchase-lines', 'lots', 'lot-location-balances', 'inventory-events', 'smoking-journal-entries', 'storage-locations', 'storage-sub-locations'],
}

const managedPages = {
  Catalog: {
    collection: 'catalog-cigars',
    title: 'Catalog Cigar',
    intro: 'Add and maintain master cigar records. Quantity totals are calculated from linked purchase and inventory records.',
    inlineEdit: true,
    dependencies: ['purchase-lines', 'lots', 'lot-location-balances', 'inventory-events', 'smoking-journal-entries', 'storage-locations', 'storage-sub-locations'],
    fields: [
      { name: 'manufacturer', label: 'Manufacturer', required: true },
      { name: 'series', label: 'Series', required: true },
      { name: 'vitola', label: 'Vitola' },
      { name: 'shape', label: 'Shape' },
      { name: 'length', label: 'Length' },
      { name: 'ringGauge', label: 'Ring Gauge', type: 'number', step: '1' },
      { name: 'wrapper', label: 'Wrapper' },
      { name: 'binder', label: 'Binder' },
      { name: 'filler', label: 'Filler' },
      { name: 'country', label: 'Country' },
      { name: 'strength', label: 'Strength' },
      { name: 'msrp', label: 'MSRP', type: 'number', step: '0.01' },
      { name: 'buyAgainStatus', label: 'Buy Again', type: 'select', options: buyAgainStatusOptions },
      { name: 'buyAgainNotes', label: 'Buy Again Notes', type: 'textarea' },
      { name: 'notes', label: 'Notes', type: 'textarea' },
    ],
    columns: [
      { label: 'Cigar', value: (row) => cigarName(row) },
      { label: 'Vitola', value: (row) => row.vitola || '' },
      { label: 'Wrapper', value: (row) => row.wrapper || '' },
      { label: 'Purchased', value: (row) => formatCount(purchasedQuantityForCatalog(row.id)) },
      { label: 'On Hand', value: (row) => formatCount(onHandQuantityForCatalog(row.id)) },
      { label: 'Buy Again', value: (row) => buyAgainLabel(row.buyAgainStatus) },
      { label: 'MSRP', value: (row) => money(row.msrp) },
    ],
  },
  Vendors: {
    collection: 'vendors',
    title: 'Vendor',
    intro: 'Add and maintain vendors for purchase records.',
    fields: [
      { name: 'name', label: 'Vendor Name', required: true },
      { name: 'website', label: 'Website' },
      { name: 'contactName', label: 'Contact Name' },
      { name: 'email', label: 'Email', type: 'email' },
      { name: 'phone', label: 'Phone' },
      { name: 'notes', label: 'Notes', type: 'textarea' },
    ],
    columns: [
      { label: 'Vendor', value: (row) => row.name || '' },
      { label: 'Website', value: (row) => row.website || '' },
      { label: 'Contact', value: (row) => row.contactName || '' },
      { label: 'Phone', value: (row) => row.phone || '' },
    ],
  },
  Purchases: {
    collection: 'purchases',
    title: 'Purchase',
    intro: 'Track purchase headers and manage line allocations, receipt lots, and current cost basis.',
    inlineEdit: true,
    dependencies: ['vendors'],
    fields: [
      { name: 'vendorId', label: 'Vendor', type: 'select', collection: 'vendors', optionLabel: 'name' },
      { name: 'status', label: 'Status', type: 'select', options: purchaseStatusOptions, required: true },
      { name: 'purchaseDate', label: 'Purchase Date', type: 'date', required: true },
      { name: 'subtotal', label: 'Subtotal', type: 'number', step: '0.01' },
      { name: 'receivedDate', label: 'Received Date', type: 'date' },
      { name: 'invoiceNumber', label: 'Invoice / PO Number' },
      { name: 'shipping', label: 'Shipping', type: 'number', step: '0.01' },
      { name: 'exciseTax', label: 'Excise Tax', type: 'number', step: '0.01' },
      { name: 'salesTax', label: 'Sales Tax', type: 'number', step: '0.01' },
      { name: 'discount', label: 'Discount', type: 'number', step: '0.01' },
      { name: 'totalPaid', label: 'Total Paid', type: 'number', step: '0.01' },
    ],
    columns: [
      { label: 'Date', value: (row) => row.purchaseDate || '' },
      { label: 'Status', value: (row) => purchaseStatusLabel(row.status) },
      { label: 'Vendor', value: (row) => vendorName(row.vendorId) },
      { label: 'Invoice / PO', value: (row) => row.invoiceNumber || '' },
      { label: 'Qty Purchased', value: (row) => formatCount(purchasedQuantityForPurchase(row.id)) },
      { label: 'Total', value: (row) => money(row.totalPaid) },
    ],
  },
  Humidors: {
    collection: 'storage-locations',
    title: 'Humidor',
    intro: 'Manage humidors and create drawers, shelves, trays, or zones for later inventory placement.',
    inlineEdit: true,
    dependencies: ['storage-sub-locations'],
    fields: [
      { name: 'name', label: 'Name', required: true },
      { name: 'type', label: 'Type' },
      { name: 'capacity', label: 'Capacity', type: 'number', step: '1' },
      { name: 'notes', label: 'Notes', type: 'textarea' },
    ],
    columns: [
      { label: 'Name', value: (row) => row.name || '' },
      { label: 'Type', value: (row) => row.type || '' },
      { label: 'Current Count', value: (row) => formatCount(humidorCurrentCount(row.id)) },
      { label: 'Oldest Inside', value: (row) => displayDate(humidorOldestDate(row.id)) },
      { label: 'Capacity', value: (row) => row.capacity ?? '' },
    ],
  },
}

function pageLabel(pageId) {
  return pages.find((page) => page.id === pageId)?.label || pageId
}
function validPageId(pageId) {
  return pages.some((page) => page.id === pageId) || Boolean(managedPages[pageId])
}

function pageFromHash() {
  const pageId = decodeURIComponent(window.location.hash.replace(/^#/, '') || '')
  return validPageId(pageId) ? pageId : 'Dashboard'
}

function setActivePage(pageId, options = {}) {
  const nextPage = validPageId(pageId) ? pageId : 'Dashboard'
  state.activePage = nextPage
  state.formError = null
  state.error = null
  if (options.updateHash !== false && typeof window !== 'undefined' && window.location.hash !== `#${encodeURIComponent(nextPage)}`) {
    window.location.hash = encodeURIComponent(nextPage)
  }
}

function navigateToPage(pageId) {
  setActivePage(pageId)
  if (typeof window !== 'undefined') {
    render()
    recordPageView(state.activePage)
  }
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;',
  }[char]))
}

function formatCount(value) {
  return Number(value || 0).toLocaleString()
}

function numericValue(value) {
  const number = Number(value || 0)
  return Number.isFinite(number) ? number : 0
}

function hasKnownMoney(value) {
  return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value))
}

function sumMoneyValues(values) {
  return values.every(hasKnownMoney)
    ? roundMoney(values.reduce((sum, value) => sum + Number(value), 0))
    : null
}

function authoritativePurchaseTotalPaid() {
  return sumMoneyValues(records('purchases').map((purchase) => purchase.totalPaid))
}

function roundMoney(value) {
  return Math.round(numericValue(value) * 100) / 100
}

function money(value) {
  if (value === null || value === undefined || value === '') {
    return 'Unknown'
  }
  return Number(value).toLocaleString(undefined, { style: 'currency', currency: 'USD' })
}

function displayDate(value) {
  if (!value) {
    return ''
  }
  const text = String(value)
  return text.includes('T') ? text.slice(0, 10) : text
}

function normalizeEventType(value) {
  return String(value || '').replace(/-/g, '_').toUpperCase()
}

function records(collection) {
  return state.records[collection] || []
}

function reversedInventoryEventIds() {
  return new Set(records('inventory-events')
    .filter((event) => normalizeEventType(event.eventType) === 'REVERSAL')
    .map((event) => Number(event.reversesInventoryEventId || 0))
    .filter(Boolean))
}

function inventoryEventIsReversed(event) {
  return reversedInventoryEventIds().has(Number(event?.id || 0))
}

function effectiveInventoryEvents() {
  const reversed = reversedInventoryEventIds()
  return records('inventory-events').filter((event) => (
    normalizeEventType(event.eventType) !== 'REVERSAL' && !reversed.has(Number(event.id || 0))
  ))
}

function recordIsActive(record) {
  return record?.isActive !== false
}

function collectionSupportsArchive(collection) {
  return ['catalog-cigars', 'vendors', 'storage-locations', 'storage-sub-locations'].includes(collection)
}

function recordById(collection, id) {
  const numericId = Number(id || 0)
  return records(collection).find((row) => Number(row.id) === numericId) || null
}

function isAuthenticated() {
  return state.session?.authenticated === true
}

function vendorName(vendorId) {
  return recordById('vendors', vendorId)?.name || ''
}

function cigarName(row) {
  return [row?.manufacturer, row?.series, row?.vitola].filter(Boolean).join(' ') || `Cigar ${row?.id || ''}`.trim()
}

function cigarNameById(cigarId) {
  const cigar = recordById('catalog-cigars', cigarId)
  return cigar ? cigarName(cigar) : ''
}

function humidorName(storageLocationId) {
  return recordById('storage-locations', storageLocationId)?.name || ''
}

function sectionName(row) {
  return row?.name || `Section ${row?.id || ''}`.trim()
}

function sectionLabel(section) {
  if (!section) {
    return ''
  }
  return section.synthetic ? 'General' : sectionName(section)
}

function humidorSectionCount(storageLocationId) {
  return records('storage-sub-locations').filter((row) => recordIsActive(row) && Number(row.storageLocationId) === Number(storageLocationId)).length
}

function purchasedQuantityForCatalog(catalogCigarId) {
  return records('purchase-lines')
    .filter((row) => Number(row.catalogCigarId) === Number(catalogCigarId))
    .reduce((total, row) => total + numericValue(row.quantity), 0)
}

function purchasedQuantityForPurchase(purchaseId) {
  return records('purchase-lines')
    .filter((row) => Number(row.purchaseId) === Number(purchaseId))
    .reduce((total, row) => total + numericValue(row.quantity), 0)
}

function normalizePurchaseStatus(value) {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'received' || normalized === 'partially-received') {
    return normalized
  }
  return 'pending'
}

function purchaseIsReceived(purchase) {
  return normalizePurchaseStatus(purchase?.status) === 'received'
}

function purchaseAcceptsReceipts(purchase) {
  return ['pending', 'partially-received'].includes(normalizePurchaseStatus(purchase?.status))
}

function purchaseReceiptEventsForLine(purchaseLineId) {
  return effectiveInventoryEvents().filter((event) => (
    Number(event.purchaseLineId || 0) === Number(purchaseLineId)
    && normalizeEventType(event.eventType) === 'PURCHASE_RECEIPT'
    && numericValue(event.quantity) > 0
  ))
}

function purchaseLineHasInventoryHistory(purchaseLineId) {
  const lineId = Number(purchaseLineId || 0)
  const linkedLotIds = new Set(records('lots')
    .filter((lot) => Number(lot.purchaseLineId || 0) === lineId)
    .map((lot) => Number(lot.id || 0)))
  return linkedLotIds.size > 0 || records('inventory-events').some((event) => (
    Number(event.purchaseLineId || 0) === lineId
    || linkedLotIds.has(Number(event.lotId || 0))
  ))
}

function receivedQuantityForPurchaseLine(line) {
  return purchaseReceiptEventsForLine(line?.id)
    .reduce((total, event) => total + numericValue(event.quantity), 0)
}

function remainingQuantityForPurchaseLine(line) {
  return Math.max(0, numericValue(line?.quantity) - receivedQuantityForPurchaseLine(line))
}

function purchaseLineLocationLabel(line) {
  const lot = records('lots').find((row) => Number(row.purchaseLineId || 0) === Number(line?.id || 0))
  const currentLocations = lot
    ? records('lot-location-balances').filter((balance) => (
      Number(balance.lotId || 0) === Number(lot.id)
      && numericValue(balance.quantity) > 0
    ))
    : []
  const labels = [...new Set(currentLocations.map((balance) => (
    [
      humidorName(balance.storageLocationId),
      balance.storageSubLocationId ? sectionName(recordById('storage-sub-locations', balance.storageSubLocationId)) : 'General',
    ].filter(Boolean).join(' / ')
  )).filter(Boolean))]
  if (labels.length === 1) {
    return labels[0]
  }
  if (labels.length > 1) {
    return `${labels.length} locations`
  }
  if (Number(line?.storageLocationId || 0) > 0) {
    return [
      humidorName(line.storageLocationId),
      line.storageSubLocationId ? sectionName(recordById('storage-sub-locations', line.storageSubLocationId)) : 'General',
    ].filter(Boolean).join(' / ')
  }
  return 'Not received yet'
}

function receiptKeyForPurchaseLine(purchaseLineId) {
  const key = String(purchaseLineId)
  if (!state.receiptKeys[key]) {
    const randomPart = globalThis.crypto?.randomUUID
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`
    state.receiptKeys[key] = `receipt-${purchaseLineId}-${randomPart}`
  }
  return state.receiptKeys[key]
}

function enRoutePurchaseQuantity() {
  return records('purchase-lines')
    .filter((line) => {
      const purchase = recordById('purchases', line.purchaseId)
      return purchase && purchaseAcceptsReceipts(purchase)
    })
    .reduce((total, line) => total + remainingQuantityForPurchaseLine(line), 0)
}

function purchaseStatusLabel(value) {
  const option = purchaseStatusOptions.find((item) => item.value === normalizePurchaseStatus(value))
  return option?.label || ''
}

function sortPurchasesNewest(rows) {
  return [...rows].sort((left, right) => {
    const leftDate = String(left.purchaseDate || left.createdAt || '')
    const rightDate = String(right.purchaseDate || right.createdAt || '')
    return rightDate.localeCompare(leftDate) || Number(right.id || 0) - Number(left.id || 0)
  })
}

function todayIsoDate() {
  const today = new Date()
  const year = today.getFullYear()
  const month = String(today.getMonth() + 1).padStart(2, '0')
  const day = String(today.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function draftLineSubtotal(line) {
  return roundMoney(line.totalPrice)
}

function purchaseLineTrueCostPerCigar(line) {
  if (line?.trueCostPerCigar !== null && line?.trueCostPerCigar !== undefined && line?.trueCostPerCigar !== '') {
    return line.trueCostPerCigar
  }
  const quantity = Math.max(1, numericValue(line?.quantity))
  const basis = line?.trueCostBasis ?? line?.purchasePrice ?? line?.lineSubtotal
  return hasKnownMoney(basis) ? roundMoney(Number(basis) / quantity) : null
}

function ensurePurchaseDraftOrder() {
  if (!state.purchaseDraftOrder) {
    state.purchaseDraftOrder = {
      vendorId: '',
      status: 'pending',
      purchaseDate: todayIsoDate(),
      invoiceNumber: '',
      subtotal: '',
      shipping: '0.00',
      exciseTax: '0.00',
      salesTax: '0.00',
      discount: '0.00',
      totalPaid: '0.00',
    }
  }
  return state.purchaseDraftOrder
}

function ensurePurchaseDraftEntry() {
  if (!state.purchaseDraftEntry) {
    state.purchaseDraftEntry = {
      catalogCigarId: '',
      quantity: '',
      totalPrice: '',
      msrpPerCigar: '',
    }
  }
  return state.purchaseDraftEntry
}

function purchaseLabel(row) {
  const vendor = vendorName(row?.vendorId)
  const invoice = row?.invoiceNumber ? `PO ${row.invoiceNumber}` : `Purchase ${row?.id || ''}`
  return [invoice, vendor, row?.purchaseDate].filter(Boolean).join(' - ')
}

function purchaseLabelById(purchaseId) {
  const purchase = recordById('purchases', purchaseId)
  return purchase ? purchaseLabel(purchase) : ''
}

function lineSectionForHumidor(humidorId, sectionId) {
  const numericSectionId = Number(sectionId || 0)
  if (numericSectionId > 0) {
    return recordById('storage-sub-locations', numericSectionId)
  }
  if (!humidorId) {
    return null
  }
  return { id: `general-${humidorId}`, name: 'General', storageLocationId: Number(humidorId), synthetic: true }
}

function lotDate(lot, purchase) {
  return lot?.receivedDateSnapshot || purchase?.receivedDate || lot?.purchaseDateSnapshot || purchase?.purchaseDate || lot?.createdAt || null
}

function lotCostPerCigar(lot, line) {
  return [lot?.costPerCigarSnapshot, lot?.allocatedCostPerCigar, line?.trueCostPerCigar, lot?.actualCostPerCigar, line?.unitCost]
    .map((value) => value === '' ? null : value)
    .find((value) => value !== null && value !== undefined) ?? null
}

function lotMsrpPerCigar(lot, line, cigar) {
  return [lot?.msrpPerCigarSnapshot, lot?.msrpPerCigar, line?.msrpPerCigarResolved, line?.msrpPerCigar, cigar?.msrp]
    .map((value) => value === '' ? null : value)
    .find((value) => value !== null && value !== undefined) ?? null
}

function normalizeBalance(balance) {
  const lot = recordById('lots', balance.lotId)
  const line = lot?.purchaseLineId ? recordById('purchase-lines', lot.purchaseLineId) : (balance.purchaseLineId ? recordById('purchase-lines', balance.purchaseLineId) : null)
  const purchase = line?.purchaseId ? recordById('purchases', line.purchaseId) : (lot?.purchaseId ? recordById('purchases', lot.purchaseId) : null)
  const cigar = lot?.catalogCigarId ? recordById('catalog-cigars', lot.catalogCigarId) : (line?.catalogCigarId ? recordById('catalog-cigars', line.catalogCigarId) : null)
  const humidorId = Number(balance.storageLocationId || line?.storageLocationId || 0)
  const humidor = recordById('storage-locations', humidorId)
  const section = lineSectionForHumidor(humidorId, balance.storageSubLocationId || line?.storageSubLocationId)
  const locationLabel = [humidor?.name || 'Unknown Humidor', section && !section.synthetic ? sectionName(section) : null].filter(Boolean).join(' / ')
  return {
    balance,
    quantity: Number(balance.quantity || 0),
    lot,
    line,
    purchase,
    cigar,
    humidor,
    section,
    locationLabel,
    costPerCigar: lotCostPerCigar(lot, line),
    msrpPerCigar: lotMsrpPerCigar(lot, line, cigar),
    oldestDate: lotDate(lot, purchase),
  }
}

function positiveBalances() {
  return records('lot-location-balances')
    .filter((balance) => Number(balance.quantity || 0) > 0)
    .map(normalizeBalance)
}

function onHandQuantityForCatalog(catalogCigarId) {
  return positiveBalances()
    .filter((row) => Number(row.cigar?.id || 0) === Number(catalogCigarId))
    .reduce((total, row) => total + row.quantity, 0)
}

function buildCollectionItems() {
  const itemsByCigarId = new Map()

  positiveBalances().forEach((entry) => {
    if (!entry.cigar) {
      return
    }
    const cigarId = Number(entry.cigar.id)
    if (!itemsByCigarId.has(cigarId)) {
      itemsByCigarId.set(cigarId, {
        cigar: entry.cigar,
        totalQuantity: 0,
        totalCostBasis: 0,
        totalMsrpValue: 0,
        knownCostQuantity: 0,
        knownMsrpQuantity: 0,
        lotIds: new Set(),
        oldestDate: null,
      locations: new Map(),
      balances: [],
    })
    }

    const item = itemsByCigarId.get(cigarId)
    item.totalQuantity += entry.quantity
    item.lotIds.add(Number(entry.lot?.id || 0))
    item.oldestDate = !item.oldestDate || (entry.oldestDate && entry.oldestDate < item.oldestDate) ? entry.oldestDate : item.oldestDate

    const costPerCigar = numericValue(entry.costPerCigar)
    const msrpPerCigar = numericValue(entry.msrpPerCigar)
    if (entry.costPerCigar !== null && entry.costPerCigar !== undefined && entry.costPerCigar !== '') {
      item.totalCostBasis += entry.quantity * costPerCigar
      item.knownCostQuantity += entry.quantity
    }
    if (entry.msrpPerCigar !== null && entry.msrpPerCigar !== undefined && entry.msrpPerCigar !== '') {
      item.totalMsrpValue += entry.quantity * msrpPerCigar
      item.knownMsrpQuantity += entry.quantity
    }

    const locationKey = entry.locationLabel
    if (!item.locations.has(locationKey)) {
      item.locations.set(locationKey, {
        label: locationKey,
        humidorName: entry.humidor?.name || 'Unknown Humidor',
        sectionName: entry.section && !entry.section.synthetic ? sectionName(entry.section) : '',
        quantity: 0,
      })
    }
    item.locations.get(locationKey).quantity += entry.quantity
    item.balances.push(entry)
  })

  return Array.from(itemsByCigarId.values()).map((item) => {
    const locations = Array.from(item.locations.values()).sort((left, right) => {
      return left.humidorName.localeCompare(right.humidorName) || left.sectionName.localeCompare(right.sectionName)
    })
    const averageCostPerCigar = item.knownCostQuantity > 0 ? item.totalCostBasis / item.knownCostQuantity : null
    const averageMsrpPerCigar = item.knownMsrpQuantity > 0 ? item.totalMsrpValue / item.knownMsrpQuantity : null
    const costComplete = item.knownCostQuantity === item.totalQuantity
    const msrpComplete = item.knownMsrpQuantity === item.totalQuantity
    return {
      ...item,
      lotCount: item.lotIds.size,
      locationCount: locations.length,
      locations,
      primaryLocationLabel: locations[0]?.label || '',
      knownCostTotal: item.totalCostBasis,
      knownMsrpTotal: item.totalMsrpValue,
      totalCostBasis: costComplete ? item.totalCostBasis : null,
      totalMsrpValue: msrpComplete ? item.totalMsrpValue : null,
      totalSavings: costComplete && msrpComplete ? item.totalMsrpValue - item.totalCostBasis : null,
      averageCostPerCigar: costComplete ? averageCostPerCigar : null,
      averageMsrpPerCigar: msrpComplete ? averageMsrpPerCigar : null,
      costComplete,
      msrpComplete,
    }
  })
}

function currentCollectionMetrics(useCollectionFilters = true) {
  let items = buildCollectionItems()
  if (useCollectionFilters && (state.collectionHumidorFilterId || state.collectionSectionFilterId)) {
    items = items
      .map((item) => ({
        ...item,
        balances: item.balances.filter((balance) => {
          const humidorMatch = !state.collectionHumidorFilterId || Number(balance.humidor?.id || 0) === Number(state.collectionHumidorFilterId)
          const sectionMatch = !state.collectionSectionFilterId || Number(balance.section?.id || 0) === Number(state.collectionSectionFilterId)
          return humidorMatch && sectionMatch
        }),
      }))
      .map((item) => {
        const totalQuantity = item.balances.reduce((sum, balance) => sum + balance.quantity, 0)
        const knownCostBalances = item.balances.filter((balance) => hasKnownMoney(balance.costPerCigar))
        const knownMsrpBalances = item.balances.filter((balance) => hasKnownMoney(balance.msrpPerCigar))
        const knownCostQuantity = knownCostBalances.reduce((sum, balance) => sum + balance.quantity, 0)
        const knownMsrpQuantity = knownMsrpBalances.reduce((sum, balance) => sum + balance.quantity, 0)
        const knownCostTotal = knownCostBalances.reduce((sum, balance) => sum + balance.quantity * Number(balance.costPerCigar), 0)
        const knownMsrpTotal = knownMsrpBalances.reduce((sum, balance) => sum + balance.quantity * Number(balance.msrpPerCigar), 0)
        const costComplete = knownCostQuantity === totalQuantity
        const msrpComplete = knownMsrpQuantity === totalQuantity
        const locations = []
        const locationMap = new Map()
        item.balances.forEach((balance) => {
          if (!locationMap.has(balance.locationLabel)) {
            locationMap.set(balance.locationLabel, {
              label: balance.locationLabel,
              humidorName: balance.humidor?.name || 'Unknown Humidor',
              sectionName: balance.section && !balance.section.synthetic ? sectionName(balance.section) : '',
              quantity: 0,
            })
          }
          locationMap.get(balance.locationLabel).quantity += balance.quantity
        })
        locationMap.forEach((value) => locations.push(value))
        return {
          ...item,
          totalQuantity,
          knownCostQuantity,
          knownMsrpQuantity,
          knownCostTotal,
          knownMsrpTotal,
          totalCostBasis: costComplete ? knownCostTotal : null,
          totalMsrpValue: msrpComplete ? knownMsrpTotal : null,
          totalSavings: costComplete && msrpComplete ? knownMsrpTotal - knownCostTotal : null,
          averageCostPerCigar: costComplete && totalQuantity > 0 ? knownCostTotal / totalQuantity : null,
          averageMsrpPerCigar: msrpComplete && totalQuantity > 0 ? knownMsrpTotal / totalQuantity : null,
          costComplete,
          msrpComplete,
          lotCount: new Set(item.balances.map((balance) => Number(balance.lot?.id || 0))).size,
          locationCount: locations.length,
          locations,
          primaryLocationLabel: locations[0]?.label || '',
          oldestDate: item.balances.reduce((oldest, balance) => !oldest || (balance.oldestDate && balance.oldestDate < oldest) ? balance.oldestDate : oldest, null),
        }
      })
      .filter((item) => item.totalQuantity > 0)
  }
  if (useCollectionFilters && state.collectionStrengthFilter) {
    items = items.filter((item) => String(item.cigar.strength || '').trim().toLowerCase() === state.collectionStrengthFilter.toLowerCase())
  }
  if (useCollectionFilters && state.collectionBuyAgainFilter) {
    items = items.filter((item) => (normalizeBuyAgainStatus(item.cigar.buyAgainStatus) || 'NOT_EVALUATED') === state.collectionBuyAgainFilter)
  }
  const collectionSearch = useCollectionFilters ? String(state.collectionSearch || '').trim().toLowerCase() : ''
  if (collectionSearch) {
    items = items.filter((item) => [
      cigarName(item.cigar),
      item.cigar.manufacturer,
      item.cigar.series,
      item.cigar.vitola,
      item.cigar.shape,
      item.cigar.length,
      item.cigar.ringGauge,
      item.cigar.wrapper,
      item.cigar.binder,
      item.cigar.filler,
      item.cigar.strength,
      item.cigar.country,
      item.cigar.notes,
      buyAgainLabel(item.cigar.buyAgainStatus),
      item.cigar.buyAgainNotes,
      ...item.locations.map((location) => location.label),
    ].some((value) => String(value || '').toLowerCase().includes(collectionSearch)))
  }
  const totalQuantity = items.reduce((sum, item) => sum + item.totalQuantity, 0)
  const knownCostQuantity = items.reduce((sum, item) => sum + item.knownCostQuantity, 0)
  const knownMsrpQuantity = items.reduce((sum, item) => sum + item.knownMsrpQuantity, 0)
  const knownCostTotal = items.reduce((sum, item) => sum + item.knownCostTotal, 0)
  const knownMsrpTotal = items.reduce((sum, item) => sum + item.knownMsrpTotal, 0)
  const costComplete = knownCostQuantity === totalQuantity
  const msrpComplete = knownMsrpQuantity === totalQuantity
  const hasRemovalHistory = records('inventory-events').some((event) => {
    const type = normalizeEventType(event.eventType)
    return type === 'SMOKED' || type === 'GIFTED' || type === 'DISCARDED'
  })
  const hasActiveCollectionFilters = Boolean(
    state.collectionHumidorFilterId
    || state.collectionSectionFilterId
    || state.collectionStrengthFilter
    || state.collectionBuyAgainFilter
    || String(state.collectionSearch || '').trim(),
  )
  const purchaseTotalPaid = authoritativePurchaseTotalPaid()
  const currentCostBasis = (!useCollectionFilters || !hasActiveCollectionFilters) && !hasRemovalHistory && hasKnownMoney(purchaseTotalPaid)
    ? purchaseTotalPaid
    : costComplete
      ? knownCostTotal
      : null
  const averageCostPerCigar = (!useCollectionFilters || !hasActiveCollectionFilters) && !hasRemovalHistory && hasKnownMoney(purchaseTotalPaid) && totalQuantity > 0
    ? roundMoney(Number(purchaseTotalPaid) / totalQuantity)
    : costComplete && totalQuantity > 0
      ? knownCostTotal / totalQuantity
      : null
  return {
    items,
    totalQuantity,
    uniqueCigarCount: items.length,
    humidorCount: records('storage-locations').filter(recordIsActive).length,
    currentCostBasis,
    currentMsrpValue: msrpComplete ? knownMsrpTotal : null,
    currentSavings: currentCostBasis !== null && msrpComplete ? knownMsrpTotal - currentCostBasis : null,
    averageCostPerCigar,
    averageMsrpPerCigar: msrpComplete && totalQuantity > 0 ? knownMsrpTotal / totalQuantity : null,
    knownCostQuantity,
    knownMsrpQuantity,
    costComplete,
    msrpComplete,
  }
}

function removalEventsOfType(type) {
  return effectiveInventoryEvents().filter((event) => normalizeEventType(event.eventType) === type)
}

function removalMetrics(type) {
  const events = removalEventsOfType(type)
  const quantity = events.reduce((sum, event) => sum + numericValue(event.quantity), 0)
  const knownCostEvents = events.filter((event) => hasKnownMoney(event.costPerCigarAtEvent))
  const knownMsrpEvents = events.filter((event) => hasKnownMoney(event.msrpPerCigarAtEvent))
  const knownCostQuantity = knownCostEvents.reduce((sum, event) => sum + numericValue(event.quantity), 0)
  const knownMsrpQuantity = knownMsrpEvents.reduce((sum, event) => sum + numericValue(event.quantity), 0)
  const knownCostTotal = knownCostEvents.reduce((sum, event) => sum + numericValue(event.quantity) * Number(event.costPerCigarAtEvent), 0)
  const knownMsrpTotal = knownMsrpEvents.reduce((sum, event) => sum + numericValue(event.quantity) * Number(event.msrpPerCigarAtEvent), 0)
  const costComplete = knownCostQuantity === quantity
  const msrpComplete = knownMsrpQuantity === quantity
  return {
    quantity,
    totalCost: costComplete ? knownCostTotal : null,
    totalMsrp: msrpComplete ? knownMsrpTotal : null,
    totalSavings: costComplete && msrpComplete ? knownMsrpTotal - knownCostTotal : null,
    averageCostPerCigar: costComplete && quantity > 0 ? knownCostTotal / quantity : null,
    averageMsrpPerCigar: msrpComplete && quantity > 0 ? knownMsrpTotal / quantity : null,
    knownCostQuantity,
    knownMsrpQuantity,
    costComplete,
    msrpComplete,
  }
}

function buildHumidorSummaries() {
  const summaries = new Map()
  records('storage-locations').filter(recordIsActive).forEach((humidor) => {
    summaries.set(Number(humidor.id), {
      humidor,
      totalQuantity: 0,
      oldestDate: null,
      sectionCount: humidorSectionCount(humidor.id),
    })
  })

  positiveBalances().forEach((entry) => {
    if (!entry.humidor) {
      return
    }
    const key = Number(entry.humidor.id)
    if (!summaries.has(key)) {
      summaries.set(key, { humidor: entry.humidor, totalQuantity: 0, oldestDate: null, sectionCount: humidorSectionCount(key) })
    }
    const summary = summaries.get(key)
    summary.totalQuantity += entry.quantity
    summary.oldestDate = !summary.oldestDate || (entry.oldestDate && entry.oldestDate < summary.oldestDate) ? entry.oldestDate : summary.oldestDate
  })

  return Array.from(summaries.values()).sort((left, right) => left.humidor.name.localeCompare(right.humidor.name))
}

function isPreInventoryHumidor(humidor) {
  return String(humidor?.name || '').trim().toLowerCase().replace(/[-_]+/g, ' ').replace(/\s+/g, ' ') === 'pre inventory'
}

function balanceAllowsCountReconciliation(balance) {
  return recordIsActive(balance?.humidor) && isPreInventoryHumidor(balance?.humidor)
}

function preInventoryDashboardSummary() {
  return buildHumidorSummaries().find((item) => recordIsActive(item.humidor) && isPreInventoryHumidor(item.humidor)) || null
}

function preInventoryWorklist(preInventory = preInventoryDashboardSummary()) {
  if (!preInventory) {
    return []
  }
  return buildCollectionItems()
    .map((item) => {
      const stagedQuantity = item.balances
        .filter((balance) => Number(balance.humidor?.id || 0) === Number(preInventory.humidor.id))
        .reduce((sum, balance) => sum + Number(balance.quantity || 0), 0)
      const placedQuantity = Math.max(0, Number(item.totalQuantity || 0) - stagedQuantity)
      return {
        cigar: item.cigar,
        stagedQuantity,
        placedQuantity,
        totalQuantity: Number(item.totalQuantity || 0),
        placementPercent: item.totalQuantity > 0 ? placedQuantity / item.totalQuantity * 100 : 0,
      }
    })
    .filter((item) => item.stagedQuantity > 0)
    .sort((left, right) => cigarName(left.cigar).localeCompare(cigarName(right.cigar), undefined, { sensitivity: 'base' }) || Number(left.cigar.id || 0) - Number(right.cigar.id || 0))
}

function preInventoryReconciliationSummary(preInventory = preInventoryDashboardSummary()) {
  if (!preInventory) {
    return null
  }
  const rows = preInventoryWorklist(preInventory)
  const stagedQuantity = rows.reduce((sum, row) => sum + Number(row.stagedQuantity || 0), 0)
  const placedQuantity = rows.reduce((sum, row) => sum + Number(row.placedQuantity || 0), 0)
  const totalQuantity = rows.reduce((sum, row) => sum + Number(row.totalQuantity || 0), 0)
  return {
    preInventory,
    rows,
    stagedQuantity,
    placedQuantity,
    totalQuantity,
    placementPercent: totalQuantity > 0 ? placedQuantity / totalQuantity * 100 : 0,
  }
}

function preInventoryFirstStagedCigarId(preInventory = preInventoryDashboardSummary()) {
  return Number(preInventoryReconciliationSummary(preInventory)?.rows[0]?.cigar?.id || 0) || null
}

function humidorCurrentCount(humidorId) {
  return buildHumidorSummaries().find((item) => Number(item.humidor.id) === Number(humidorId))?.totalQuantity || 0
}

function humidorOldestDate(humidorId) {
  return buildHumidorSummaries().find((item) => Number(item.humidor.id) === Number(humidorId))?.oldestDate || null
}

function activityEventDate(event) {
  return displayDate(event?.eventDate || event?.occurredAt || event?.updatedAt)
}

function activityEventCigar(event) {
  const lot = recordById('lots', event?.lotId)
  const catalogCigarId = Number(event?.catalogCigarId || lot?.catalogCigarId || 0)
  return catalogCigarId ? recordById('catalog-cigars', catalogCigarId) : null
}

function activityEventHumidorIds(event) {
  return [
    event?.storageLocationId,
    event?.fromStorageLocationId,
    event?.toStorageLocationId,
    event?.sourceLocation?.storageLocationId,
    event?.destinationLocation?.storageLocationId,
  ].map(Number).filter((id, index, ids) => id > 0 && ids.indexOf(id) === index)
}

function activityLocationName(locationId, sectionId, fallbackLocation = '', fallbackSection = '') {
  const normalizedLocationId = Number(locationId || 0)
  if (!normalizedLocationId && !fallbackLocation) return ''
  const location = humidorName(normalizedLocationId) || fallbackLocation || `Humidor ${normalizedLocationId}`
  const section = sectionId
    ? sectionName(recordById('storage-sub-locations', sectionId))
    : fallbackSection
  return [location, section].filter(Boolean).join(' / ')
}

function activityEventLocationLabel(event) {
  const source = activityLocationName(
    event?.fromStorageLocationId ?? event?.sourceLocation?.storageLocationId,
    event?.fromStorageSubLocationId ?? event?.sourceLocation?.storageSubLocationId,
    event?.fromStorageLocationName ?? event?.sourceLocation?.storageLocationName,
    event?.fromStorageSubLocationName ?? event?.sourceLocation?.storageSubLocationName,
  )
  const destination = activityLocationName(
    event?.toStorageLocationId ?? event?.destinationLocation?.storageLocationId,
    event?.toStorageSubLocationId ?? event?.destinationLocation?.storageSubLocationId,
    event?.toStorageLocationName ?? event?.destinationLocation?.storageLocationName,
    event?.toStorageSubLocationName ?? event?.destinationLocation?.storageSubLocationName,
  )
  if (source && destination) return `${source} → ${destination}`
  return source || destination || activityLocationName(
    event?.storageLocationId,
    event?.storageSubLocationId,
    event?.storageLocationName,
    event?.storageSubLocationName,
  ) || 'Unassigned'
}

function activityRelationshipEvent(event) {
  if (normalizeEventType(event?.eventType) === 'REVERSAL') {
    return recordById('inventory-events', event.reversesInventoryEventId)
  }
  return records('inventory-events').find((candidate) => (
    normalizeEventType(candidate.eventType) === 'REVERSAL'
    && Number(candidate.reversesInventoryEventId) === Number(event?.id)
  )) || null
}

function activityEventReferenceSearchValues(event) {
  const relationship = activityRelationshipEvent(event)
  return [
    `Event ${event?.id || ''}`,
    event?.lotId ? `Lot ${event.lotId}` : '',
    event?.purchaseId ? `Purchase ${event.purchaseId}` : '',
    normalizeEventType(event?.eventType) === 'REVERSAL' && event?.reversesInventoryEventId ? `Reverses Event ${event.reversesInventoryEventId}` : '',
    normalizeEventType(event?.eventType) !== 'REVERSAL' && relationship ? `Reversed by Event ${relationship.id}` : '',
  ]
}

function activityFiltersActive() {
  return state.activityPeriod !== 'lifetime'
    || state.activityType !== 'all'
    || Boolean(String(state.activitySearch || '').trim())
    || Boolean(String(state.activityLotId || '').trim())
    || Boolean(String(state.activityHumidorId || '').trim())
}

function filteredActivityEvents() {
  const currentYear = new Date().getFullYear()
  const search = String(state.activitySearch || '').trim().toLowerCase()
  const lotId = Number(state.activityLotId || 0)
  const humidorId = Number(state.activityHumidorId || 0)
  return [...records('inventory-events')]
    .filter((event) => state.activityType === 'all' || normalizeEventType(event.eventType) === state.activityType)
    .filter((event) => !lotId || Number(event.lotId) === lotId)
    .filter((event) => !humidorId || activityEventHumidorIds(event).includes(humidorId))
    .filter((event) => {
      const date = activityEventDate(event)
      const year = Number(date.slice(0, 4) || 0)
      if (state.activityPeriod === 'current') return year === currentYear
      if (state.activityPeriod === 'prior') return year === currentYear - 1
      if (state.activityPeriod === 'custom') {
        return (!state.activityCustomStart || date >= state.activityCustomStart)
          && (!state.activityCustomEnd || date <= state.activityCustomEnd)
      }
      return true
    })
    .filter((event) => {
      if (!search) return true
      const cigar = activityEventCigar(event)
      return [
        cigar ? cigarName(cigar) : '',
        inventoryEventDisplayType(event),
        activityEventLocationLabel(event),
        event.notes,
        ...activityEventReferenceSearchValues(event),
      ].some((value) => String(value || '').toLowerCase().includes(search))
    })
    .sort((left, right) => activityEventDate(right).localeCompare(activityEventDate(left)) || Number(right.id || 0) - Number(left.id || 0))
}

function activityEventsForDisplay(filtered = filteredActivityEvents()) {
  return state.showAllActivity || activityFiltersActive() ? filtered : filtered.slice(0, 12)
}

function customPageReady(pageId) {
  const needed = pageDependencies[pageId] || []
  return needed.every((collection) => Array.isArray(state.records[collection]))
}

function collectionSortLabel(value) {
  if (value === 'location') {
    return 'Humidor Location'
  }
  if (value === 'strength') {
    return 'Strength'
  }
  return 'Alphabetical'
}

function strengthSortRank(value) {
  const normalized = String(value || '').trim().toLowerCase().replace(/\s+/g, '-').replace(/–|—/g, '-')
  const ranks = { mild: 1, 'mild-medium': 2, medium: 3, 'medium-full': 4, full: 5 }
  return ranks[normalized] || 99
}

function sortCollectionItems(items) {
  const sorted = [...items]
  sorted.sort((left, right) => {
    const direction = state.collectionDirection === 'desc' ? -1 : 1
    if (state.collectionSort === 'location') {
      const locationCompare = (left.primaryLocationLabel || '').localeCompare(right.primaryLocationLabel || '')
      if (locationCompare !== 0) {
        return locationCompare * direction
      }
    }
    if (state.collectionSort === 'strength') {
      const leftRank = strengthSortRank(left.cigar.strength)
      const rightRank = strengthSortRank(right.cigar.strength)
      if (leftRank === 99 && rightRank !== 99) return 1
      if (rightRank === 99 && leftRank !== 99) return -1
      const rankCompare = leftRank - rightRank
      if (rankCompare !== 0) {
        return rankCompare * direction
      }
      const strengthCompare = String(left.cigar.strength || '').localeCompare(String(right.cigar.strength || ''))
      if (strengthCompare !== 0) {
        return strengthCompare * direction
      }
    }
    const alphaCompare = cigarName(left.cigar).localeCompare(cigarName(right.cigar))
    return alphaCompare * direction
  })
  return sorted
}

function collectionCount(name) {
  return state.sampleData?.collections?.[name]?.count || 0
}

function setStatus(_text, _mode = 'neutral') {
}

async function apiRequest(path, options = {}) {
  const method = String(options.method || 'GET').toUpperCase()
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData
  const response = await fetch(`${API_BASE_URL}${path}`, {
    credentials: 'same-origin',
    ...options,
    headers: {
      ...(options.body && !isFormData ? { 'Content-Type': 'application/json' } : {}),
      ...(method !== 'GET' && state.session?.csrfToken ? { 'X-CSRF-Token': state.session.csrfToken } : {}),
      ...(options.headers || {}),
    },
  })
  const body = await response.json().catch(() => null)
  if (!response.ok) {
    const message = body?.error?.message || `Request failed with HTTP ${response.status}`
    const error = new Error(message)
    error.status = response.status
    throw error
  }
  return body.data
}

function apiGet(path) {
  return apiRequest(path)
}

function apiPost(path, payload = null) {
  if (typeof FormData !== 'undefined' && payload instanceof FormData) {
    return apiRequest(path, {
      method: 'POST',
      body: payload,
    })
  }
  return apiRequest(path, {
    method: 'POST',
    body: payload === null ? undefined : JSON.stringify(payload),
  })
}

function apiPut(path, payload) {
  return apiRequest(path, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}

function apiDelete(path) {
  return apiRequest(path, { method: 'DELETE' })
}

async function refreshSampleData() {
  state.sampleData = await apiGet('/sample-data')
}

async function ensureRecords(collection) {
  if (!state.records[collection]) {
    const data = await apiGet(`/records/${collection}`)
    state.records[collection] = data.records || []
  }
}

async function ensurePageData(pageId) {
  if (pageId === 'Backups' && !state.backupData) {
    state.backupData = await apiGet('/backups')
  }
  if (pageId === 'ProductionImport' && !state.productionImportData) {
    state.productionImportData = await apiGet('/production-import')
  }
  const managedPage = managedPages[pageId]
  if (managedPage) {
    await Promise.all([managedPage.collection, ...(managedPage.dependencies || [])].map(ensureRecords))
  }
  await Promise.all((pageDependencies[pageId] || []).map(ensureRecords))
}

function renderBackupPage(view) {
  const data = state.backupData || { backups: [] }
  const panel = document.createElement('section')
  panel.className = 'data-form'
  panel.innerHTML = `
    <h3>Protected Runtime Backup</h3>
    <p class="muted">Create an authenticated backup of runtime JSON, including user password hashes. The audit log is not included. Store downloaded copies securely.</p>
    <div class="form-actions">
      <button type="button" class="primary-button" data-action="create-backup">Create Backup</button>
      <button type="button" class="secondary-button" data-action="open-production-import">Open Production Import</button>
      <label class="secondary-button" role="button">Import Backup<input type="file" accept="application/json,.json" data-backup-import hidden></label>
    </div>
    ${state.backupMessage ? `<p>${escapeHtml(state.backupMessage)}</p>` : ''}
  `
  panel.querySelector('[data-action="create-backup"]').addEventListener('click', async (event) => {
    event.currentTarget.disabled = true
    state.backupMessage = ''
    try {
      const result = await apiPost('/backups')
      state.backupMessage = `Backup created: ${result.filename}`
      state.backupData = await apiGet('/backups')
    } catch (error) {
      state.backupMessage = error.message
    }
    render()
  })
  panel.querySelector('[data-action="open-production-import"]').addEventListener('click', () => {
    navigateToPage('ProductionImport')
  })
  panel.querySelector('[data-backup-import]').addEventListener('change', async (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    state.backupMessage = ''
    try {
      const bundle = JSON.parse(await file.text())
      const result = await apiPost('/backups/import', { bundle })
      state.backupMessage = `Backup imported and validated: ${result.filename}`
      state.backupData = await apiGet('/backups')
    } catch (error) {
      state.backupMessage = error.message || 'The selected backup could not be imported.'
    }
    render()
  })
  view.append(panel)

  const listPanel = document.createElement('section')
  listPanel.className = 'data-form'
  const backups = data.backups || []
  listPanel.innerHTML = `
    <div class="section-heading"><div><h3>Available Backups</h3><p class="muted">${formatCount(backups.length)} validated backup bundle${backups.length === 1 ? '' : 's'}.</p></div></div>
    ${backups.length === 0 ? '<p class="muted">No backups have been created or imported yet.</p>' : `
      <div class="table-scroll"><table class="managed-table"><thead><tr><th>Created</th><th>Type</th><th>Size</th><th>Actions</th></tr></thead><tbody>
      ${backups.map((backup) => `<tr><td>${escapeHtml(backup.createdAtUtc || '')}</td><td>${escapeHtml(backup.kind || '')}</td><td>${escapeHtml(formatCount(backup.bytes || 0))} bytes</td><td><div class="row-actions"><a class="secondary-button" href="${API_BASE_URL}/backups/download?filename=${encodeURIComponent(backup.filename)}">Download</a><button type="button" class="linkish-button" data-preview-backup="${escapeHtml(backup.filename)}">Preview Restore</button></div></td></tr>`).join('')}
      </tbody></table></div>`}
  `
  listPanel.querySelectorAll('[data-preview-backup]').forEach((button) => {
    button.addEventListener('click', async () => {
      state.backupMessage = ''
      try {
        state.backupPreview = await apiPost('/backups/preview', { filename: button.dataset.previewBackup })
      } catch (error) {
        state.backupMessage = error.message
      }
      render()
    })
  })
  view.append(listPanel)

  if (!state.backupPreview) return
  const preview = state.backupPreview
  const restorePanel = document.createElement('section')
  restorePanel.className = 'data-form'
  restorePanel.innerHTML = `
    <h3>Restore Preview</h3>
    <p><strong>${escapeHtml(preview.filename)}</strong></p>
    <p class="muted">Restore replaces all listed runtime JSON collections, including authentication users. A pre-restore safety backup is created automatically. Existing audit history remains unchanged.</p>
    <p class="muted">Enter <code>RESTORE-HUMIDORHQ-BACKUP</code> exactly to continue. If runtime data changes after this preview, restore will stop without writing.</p>
    <form class="record-form"><label class="form-field wide"><span>Confirmation phrase</span><input name="confirmation" autocomplete="off" required></label><div class="form-actions"><button type="submit" class="danger-button">Restore Backup</button><button type="button" class="secondary-button" data-cancel-restore>Cancel</button></div></form>
  `
  restorePanel.querySelector('[data-cancel-restore]').addEventListener('click', () => {
    state.backupPreview = null
    render()
  })
  restorePanel.querySelector('form').addEventListener('submit', async (event) => {
    event.preventDefault()
    const submit = event.currentTarget.querySelector('[type="submit"]')
    submit.disabled = true
    const confirmation = String(new FormData(event.currentTarget).get('confirmation') || '')
    try {
      const result = await apiPost('/backups/restore', {
        filename: preview.filename,
        confirmation,
        expectedCurrentFingerprint: preview.currentManifest.fingerprint,
      })
      state.records = {}
      state.sampleData = null
      state.auditData = null
      state.backupPreview = null
      state.backupMessage = `Restore completed. Safety backup: ${result.safetyBackup}`
      await refreshSampleData()
      state.backupData = await apiGet('/backups')
    } catch (error) {
      state.backupMessage = error.message
    }
    render()
  })
  view.append(restorePanel)
}

function renderProductionImportPage(view) {
  const data = state.productionImportData || { enabled: true, completed: false, result: null }
  const result = data.result || null
  const panel = document.createElement('section')
  panel.className = 'data-form'
  panel.innerHTML = `
    <h3>Production Runtime Import</h3>
    <p class="muted">Upload a locally packaged runtime ZIP to initialize the live data root. Auth users and the audit log are not part of this package. The exact confirmation phrase is required.</p>
    ${result ? `
      <div class="empty-state">
        <p><strong>Import ID:</strong> ${escapeHtml(result.importId || '')}</p>
        <p><strong>Status:</strong> ${escapeHtml(result.status || '')}</p>
        <p><strong>Catalog Count:</strong> ${formatCount(result.catalogCount || 0)}</p>
        <p><strong>Purchase Count:</strong> ${formatCount(result.purchaseCount || 0)}</p>
        <p><strong>Lot Count:</strong> ${formatCount(result.lotCount || 0)}</p>
        <p><strong>Receipts:</strong> ${formatCount(result.receipts || 0)}</p>
        <p><strong>Removals:</strong> ${formatCount(result.removals || 0)}</p>
        <p><strong>On Hand:</strong> ${formatCount(result.onHand || 0)}</p>
        <p><strong>Integrity:</strong> ${formatCount(result.integrityErrors || 0)} errors, ${formatCount(result.integrityWarnings || 0)} warnings</p>
      </div>
    ` : '<p class="muted">No production import has been completed yet.</p>'}
    ${state.productionImportMessage ? `<p>${escapeHtml(state.productionImportMessage)}</p>` : ''}
    ${data.enabled ? `
      <form class="record-form" data-production-import-form>
        <label class="form-field wide"><span>Import Package ZIP</span><input type="file" name="package" accept=".zip,application/zip" required></label>
        <label class="form-field wide"><span>Confirmation Phrase</span><input name="confirmation" autocomplete="off" required placeholder="APPLY-HUMIDORHQ-PRODUCTION-IMPORT"></label>
        <div class="form-actions">
          <button type="submit" class="primary-button">Apply Production Import</button>
          <button type="button" class="secondary-button" data-back-to-backups>Back to Backups</button>
        </div>
      </form>
    ` : `
      <p class="muted">Production import is disabled because it has already been completed. View the summary above for the applied import.</p>
      <div class="form-actions">
        <button type="button" class="secondary-button" data-back-to-backups>Back to Backups</button>
      </div>
    `}
  `
  const form = panel.querySelector('[data-production-import-form]')
  const backButton = panel.querySelector('[data-back-to-backups]')
  if (backButton) {
    backButton.addEventListener('click', () => navigateToPage('Backups'))
  }
  if (form) {
    form.addEventListener('submit', async (event) => {
      event.preventDefault()
      const submit = form.querySelector('[type="submit"]')
      submit.disabled = true
      state.productionImportMessage = ''
      try {
        const formData = new FormData(form)
        const result = await apiPost('/production-import', formData)
        state.productionImportMessage = `Production import applied successfully: ${result.importId}`
        state.productionImportData = await apiGet('/production-import')
      } catch (error) {
        state.productionImportMessage = error.message || 'The production import could not be applied.'
        try {
          state.productionImportData = await apiGet('/production-import')
        } catch {
        }
      }
      render()
    })
  }
  view.append(panel)
}

async function recordPageView(page) {
  if (!isAuthenticated()) {
    return
  }
  if (page === 'ProductionImport') {
    return
  }
  try {
    await apiPost('/audit/page', { page, action: 'view' })
    state.auditData = null
  } catch {
  }
}

function renderProjectMeta() {
  const meta = document.querySelector('#project-meta')
  if (!meta) {
    return
  }
  if (!state.appMeta) {
    meta.textContent = 'Rev loading...'
    return
  }
  const modifiedParts = String(state.appMeta.modifiedEt || '').split(' ')
  const modifiedDate = modifiedParts.shift() || ''
  const modifiedTime = modifiedParts.join(' ')
  meta.innerHTML = `
    <span>Rev ${escapeHtml(state.appMeta.revision)}</span>
    <span>Modified</span>
    <span>${escapeHtml(modifiedDate)}</span>
    <span>${escapeHtml(modifiedTime)}</span>
  `
}

function renderNav() {
  const nav = document.querySelector('#app-nav')
  nav.replaceChildren(
    ...pages.filter((page) => !page.hidden).map((page) => {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = page.id === state.activePage ? 'nav-item active' : 'nav-item'
      button.textContent = page.label
      button.disabled = !isAuthenticated()
      button.addEventListener('click', () => {
        if (globalThis.matchMedia?.('(max-width: 850px)').matches) {
          state.sidebarCollapsed = true
        }
        navigateToPage(page.id)
      })
      return button
    }),
  )
}

function renderSidebarState() {
  const shell = document.querySelector('.app-shell')
  const toggle = document.querySelector('#sidebar-toggle')
  if (!shell || !toggle) return
  shell.classList.toggle('sidebar-collapsed', state.sidebarCollapsed)
  toggle.setAttribute('aria-expanded', String(!state.sidebarCollapsed))
  toggle.setAttribute('aria-label', state.sidebarCollapsed ? 'Open navigation menu' : 'Collapse navigation menu')
  toggle.title = state.sidebarCollapsed ? 'Open navigation menu' : 'Collapse navigation menu'
  const icon = toggle.querySelector('[data-sidebar-toggle-icon]')
  const label = toggle.querySelector('[data-sidebar-toggle-label]')
  if (icon) icon.textContent = state.sidebarCollapsed ? '☰' : '‹'
  if (label) label.textContent = state.sidebarCollapsed ? 'Menu' : 'Collapse'
  document.querySelectorAll('[data-mobile-primary-page]').forEach((button) => {
    button.disabled = !isAuthenticated()
    button.classList.toggle('active', button.dataset.mobilePrimaryPage === state.activePage)
  })
}

function initializeSidebarToggle() {
  const toggle = document.querySelector('#sidebar-toggle')
  toggle?.addEventListener('click', () => {
    state.sidebarCollapsed = !state.sidebarCollapsed
    renderSidebarState()
  })
  document.querySelectorAll('[data-mobile-primary-page]').forEach((button) => {
    button.addEventListener('click', () => {
      if (!isAuthenticated()) return
      state.sidebarCollapsed = true
      navigateToPage(button.dataset.mobilePrimaryPage)
    })
  })
}

function enhanceResponsiveTables(root) {
  root.querySelectorAll('table').forEach((table) => {
    const headings = Array.from(table.tHead?.rows?.[0]?.cells || []).map((cell) => cell.textContent.trim())
    if (headings.length === 0) return
    table.classList.add('responsive-table')
    Array.from(table.tBodies || []).forEach((body) => {
      Array.from(body.rows).forEach((row) => {
        const cells = Array.from(row.cells)
        const isDetailRow = cells.some((cell) => cell.colSpan > 1) || cells.length !== headings.length
        row.classList.toggle('responsive-detail-row', isDetailRow)
        if (!isDetailRow) {
          cells.forEach((cell, index) => { cell.dataset.label = headings[index] || '' })
        }
      })
    })
  })
}

function renderSidebarAccount() {
  const account = document.querySelector('#sidebar-account')
  if (!account) {
    return
  }
  account.replaceChildren()
  if (!isAuthenticated()) {
    account.hidden = true
    return
  }

  account.hidden = false
  const userName = state.session.user?.displayName || state.session.user?.username || 'Signed in'
  const label = document.createElement('span')
  label.innerHTML = `Signed in as <strong>${escapeHtml(userName)}</strong>`

  const logoutButton = document.createElement('button')
  logoutButton.type = 'button'
  logoutButton.className = 'sidebar-logout'
  logoutButton.textContent = 'Log out'
  logoutButton.addEventListener('click', async () => {
    state.session = await apiPost('/logout')
    state.sampleData = null
    state.records = {}
    state.editing = {}
    state.auditData = null
    state.changelog = null
    state.todo = null
    state.error = null
    state.authError = null
    state.formError = null
    render()
  })

  const mobileLink = document.createElement('a')
  mobileLink.className = 'sidebar-mobile-link'
  mobileLink.href = 'mobile/'
  mobileLink.textContent = 'Mobile'

  account.append(label, logoutButton, mobileLink)
}

function metricCard(label, value, detail, moneyMode = false) {
  const card = document.createElement('article')
  const displayValue = moneyMode
    ? money(value)
    : (value === null || value === undefined || value === '' ? 'Unknown' : (typeof value === 'number' ? formatCount(value) : String(value)))
  card.className = 'metric-card'
  card.innerHTML = `
    <span>${escapeHtml(label)}</span>
    <strong>${escapeHtml(displayValue)}</strong>
    <small>${escapeHtml(detail)}</small>
  `
  return card
}

function infoBadge(text) {
  const badge = document.createElement('span')
  badge.className = 'dashboard-badge'
  badge.textContent = text
  return badge
}

function formatPercent(value) {
  if (!hasKnownMoney(value)) {
    return 'Unknown'
  }
  return `${numericValue(value).toFixed(1)}%`
}

function apiPatch(path, payload = null) {
  return apiRequest(path, {
    method: 'PATCH',
    body: payload === null ? undefined : JSON.stringify(payload),
  })
}

function removalActionLabel(type) {
  return ({ SMOKED: 'Smoke', GIFTED: 'Give', DISCARDED: 'Discard' })[normalizeEventType(type)] || 'Remove'
}

function removalEventLabel(type) {
  return ({ SMOKED: 'Smoked', GIFTED: 'Gifted', DISCARDED: 'Discarded' })[normalizeEventType(type)] || 'Removed'
}

function removalIdempotencyKey(balanceId, type) {
  const cacheKey = `${Number(balanceId)}:${normalizeEventType(type)}`
  if (!state.removalKeys[cacheKey]) {
    const unique = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`
    state.removalKeys[cacheKey] = `removal-${unique}`
  }
  return state.removalKeys[cacheKey]
}

function clearRemovalIdempotencyKey(balanceId, type) {
  delete state.removalKeys[`${Number(balanceId)}:${normalizeEventType(type)}`]
}

function adjustmentIdempotencyKey(balanceId) {
  const key = String(Number(balanceId))
  if (!state.adjustmentKeys[key]) {
    const unique = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`
    state.adjustmentKeys[key] = `adjustment-${unique}`
  }
  return state.adjustmentKeys[key]
}

function clearAdjustmentIdempotencyKey(balanceId) {
  delete state.adjustmentKeys[String(Number(balanceId))]
}

function reversalIdempotencyKey(eventId) {
  const key = String(Number(eventId))
  if (!state.reversalKeys[key]) {
    const unique = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`
    state.reversalKeys[key] = `reversal-${unique}`
  }
  return state.reversalKeys[key]
}

function inventoryEventCanBeReversed(event) {
  return ['PURCHASE_RECEIPT', 'MOVE', 'SMOKED', 'GIFTED', 'DISCARDED', 'INVENTORY_ADJUSTMENT'].includes(normalizeEventType(event?.eventType))
    && !inventoryEventIsReversed(event)
}

function inventoryEventDisplayType(event) {
  const type = normalizeEventType(event?.eventType)
  if (type === 'REVERSAL') {
    return `Reversal: ${String(event.reversedEventType || '').replaceAll('_', ' ')}`
  }
  if (type === 'INVENTORY_ADJUSTMENT') {
    return `Inventory Adjustment: ${String(event.adjustmentDirection || '').toLowerCase()}${inventoryEventIsReversed(event) ? ' — Reversed' : ''}`
  }
  return `${type.replaceAll('_', ' ')}${inventoryEventIsReversed(event) ? ' — Reversed' : ''}`
}

function inventoryEventDisplayQuantity(event) {
  return normalizeEventType(event?.eventType) === 'INVENTORY_ADJUSTMENT'
    ? Number(event.quantityChange || 0)
    : Number(event.quantity || 0)
}

function smokingJournalEntryForEvent(eventId) {
  return records('smoking-journal-entries')
    .find((entry) => Number(entry.inventoryEventId) === Number(eventId)) || null
}

function catalogCigarIdForInventoryEvent(event) {
  const lot = recordById('lots', event?.lotId)
  return Number(event?.catalogCigarId || lot?.catalogCigarId || 0)
}

function smokingJournalHistoryRows(catalogCigarId = null) {
  const eventById = new Map(records('inventory-events').map((event) => [Number(event.id), event]))
  return records('smoking-journal-entries')
    .map((journal) => {
      const event = eventById.get(Number(journal.inventoryEventId))
      if (!event || normalizeEventType(event.eventType) !== 'SMOKED') return null
      const eventCatalogCigarId = catalogCigarIdForInventoryEvent(event)
      if (catalogCigarId && eventCatalogCigarId !== Number(catalogCigarId)) return null
      const details = removalEventDetails(event)
      return {
        journal,
        event,
        catalogCigarId: eventCatalogCigarId,
        cigar: recordById('catalog-cigars', eventCatalogCigarId),
        date: removalEventDate(event),
        locationLabel: details.locationLabel,
        reversed: inventoryEventIsReversed(event),
      }
    })
    .filter(Boolean)
    .sort((left, right) => right.date.localeCompare(left.date) || Number(right.event.id || 0) - Number(left.event.id || 0))
}

function smokingJournalHistoryMetrics(rows) {
  const effectiveRows = rows.filter((row) => !row.reversed)
  const ratings = effectiveRows.map((row) => Number(row.journal.rating)).filter((rating) => Number.isInteger(rating) && rating >= 1 && rating <= 10)
  return {
    totalEntries: rows.length,
    effectiveQuantity: effectiveRows.reduce((sum, row) => sum + Number(row.event.quantity || 0), 0),
    averageRating: ratings.length ? ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length : null,
    lastSmokedDate: effectiveRows[0]?.date || '',
  }
}

function cigarOriginLabel(cigar) {
  return String(cigar?.country || cigar?.origin || '').trim() || 'Unknown Origin'
}

function cigarSizeLabel(cigar) {
  const vitola = String(cigar?.vitola || '').trim()
  const length = String(cigar?.length || '').trim()
  const ringGauge = String(cigar?.ringGauge || '').trim()
  if (vitola && length && ringGauge) {
    return `${vitola} (${length} × ${ringGauge})`
  }
  if (vitola) return vitola
  if (length && ringGauge) return `${length} × ${ringGauge}`
  if (length) return length
  if (ringGauge) return `${ringGauge} RG`
  return 'Unknown Size'
}

function cigarSizeSortValue(cigar) {
  const length = Number.parseFloat(String(cigar?.length || '').trim())
  const ringGauge = Number.parseFloat(String(cigar?.ringGauge || '').trim())
  return {
    length: Number.isFinite(length) ? length : Number.POSITIVE_INFINITY,
    ringGauge: Number.isFinite(ringGauge) ? ringGauge : Number.POSITIVE_INFINITY,
    label: cigarSizeLabel(cigar).toLowerCase(),
  }
}

function ratingBreakdownDimensionLabel(dimension) {
  if (dimension === 'wrapper') return 'Wrapper'
  if (dimension === 'origin') return 'Origin'
  if (dimension === 'size') return 'Size'
  if (dimension === 'manufacturer') return 'Manufacturer'
  return 'Strength'
}

function ratingBreakdownLabel(cigar, dimension) {
  if (dimension === 'wrapper') return String(cigar?.wrapper || '').trim() || 'Unknown Wrapper'
  if (dimension === 'origin') return cigarOriginLabel(cigar)
  if (dimension === 'size') return cigarSizeLabel(cigar)
  if (dimension === 'manufacturer') return String(cigar?.manufacturer || '').trim() || 'Unknown Manufacturer'
  return String(cigar?.strength || '').trim() || 'Unknown Strength'
}

function ratingBreakdownSearchTerm(cigar, dimension) {
  if (dimension === 'size') {
    return String(cigar?.vitola || '').trim()
  }
  return ratingBreakdownLabel(cigar, dimension)
}

function ratingBreakdownSortValue(cigar, dimension, label) {
  if (dimension === 'strength') {
    return {
      primary: strengthSortRank(label),
      secondary: String(label || '').trim().toLowerCase(),
    }
  }
  if (dimension === 'size') {
    const size = cigarSizeSortValue(cigar)
    return {
      primary: size.length,
      secondary: size.ringGauge,
      tertiary: size.label,
    }
  }
  return {
    primary: String(label || '').trim().toLowerCase(),
  }
}

function ratingBreakdownRows(dimension = state.ratingBreakdownDimension) {
  const groups = new Map()
  effectiveInventoryEvents().forEach((event) => {
    if (normalizeEventType(event.eventType) !== 'SMOKED') return
    const journal = smokingJournalEntryForEvent(event.id)
    const rating = Number(journal?.rating)
    if (!journal || !Number.isInteger(rating) || rating < 1 || rating > 10) return
    const cigar = catalogCigarForInventoryEvent(event)
    const label = ratingBreakdownLabel(cigar, dimension)
    const key = `${String(label || '').trim().toLowerCase()}|${String(dimension || '')}`
    const sortValue = ratingBreakdownSortValue(cigar, dimension, label)
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        label,
        sortValue,
        searchTerm: ratingBreakdownSearchTerm(cigar, dimension),
        ratings: [],
        smokeCount: 0,
        cigarIds: new Set(),
        lastSmokedDate: '',
      })
    }
    const row = groups.get(key)
    row.smokeCount += 1
    row.ratings.push(rating)
    const cigarId = Number(cigar?.id || 0)
    if (cigarId) row.cigarIds.add(cigarId)
    const smokedDate = removalEventDate(event) || ''
    if (!row.lastSmokedDate || (smokedDate && smokedDate > row.lastSmokedDate)) {
      row.lastSmokedDate = smokedDate
    }
  })
  return [...groups.values()]
    .map((row) => {
      const averageRating = row.ratings.length ? row.ratings.reduce((sum, rating) => sum + rating, 0) / row.ratings.length : null
      return {
        key: row.key,
        label: row.label,
        smokeCount: row.smokeCount,
        ratingCount: row.ratings.length,
        cigarCount: row.cigarIds.size,
        averageRating,
        lastSmokedDate: row.lastSmokedDate,
        sortValue: row.sortValue,
        searchTerm: row.searchTerm,
      }
    })
    .sort((left, right) => {
      if (dimension === 'strength') {
        return left.sortValue.primary - right.sortValue.primary || left.sortValue.secondary.localeCompare(right.sortValue.secondary, undefined, { sensitivity: 'base' })
      }
      if (dimension === 'size') {
        return left.sortValue.primary - right.sortValue.primary
          || left.sortValue.secondary - right.sortValue.secondary
          || left.sortValue.tertiary.localeCompare(right.sortValue.tertiary, undefined, { sensitivity: 'base' })
      }
      return left.sortValue.primary.localeCompare(right.sortValue.primary, undefined, { sensitivity: 'base' })
    })
}

function savingsPercent(cost, msrp) {
  if (!hasKnownMoney(cost) || !hasKnownMoney(msrp)) {
    return null
  }
  const numericMsrp = numericValue(msrp)
  if (numericMsrp <= 0) {
    return 0
  }
  return (numericValue(msrp) - numericValue(cost)) / numericMsrp * 100
}

function strengthClassName(strength) {
  const normalized = String(strength || 'Medium').trim().toLowerCase()
  if (normalized === 'mild') { return 'strength-mild' }
  if (normalized === 'mild-medium') { return 'strength-mild-medium' }
  if (normalized === 'medium') { return 'strength-medium' }
  if (normalized === 'medium-full') { return 'strength-medium-full' }
  if (normalized === 'full') { return 'strength-full' }
  return 'strength-medium'
}

function strengthBadge(strength) {
  return `<span class="strength-badge ${strengthClassName(strength)}">${escapeHtml(strength || 'Medium')}</span>`
}

function inventoryStatusCard(onHandQuantity, enRouteQuantity, uniqueCigarCount) {
  const card = document.createElement('article')
  card.className = 'metric-card dual-metric-card'
  card.innerHTML = `
    <div class="dual-metric-grid">
      <div>
        <span>On Hand</span>
        <strong>${escapeHtml(formatCount(onHandQuantity))}</strong>
      </div>
      <div>
        <span>En Route</span>
        <strong>${escapeHtml(formatCount(enRouteQuantity))}</strong>
      </div>
    </div>
    <small>${escapeHtml(formatCount(uniqueCigarCount))} unique cigars</small>
  `
  return card
}

function selectCollectionHumidor(humidorId) {
  state.collectionHumidorFilterId = Number(humidorId || 0) || null
  state.collectionSectionFilterId = null
  state.selectedCollectionCigarId = null
}

function openCollectionForHumidor(humidorId) {
  selectCollectionHumidor(humidorId)
  navigateToPage('Collection')
}

function renderDashboard(view) {
  const current = currentCollectionMetrics(false)
  const enRouteQuantity = enRoutePurchaseQuantity()
  const smoked = removalMetrics('SMOKED')
  const gifted = removalMetrics('GIFTED')
  const discarded = removalMetrics('DISCARDED')
  const purchaseTotalPaid = authoritativePurchaseTotalPaid()
  const dashboardCostBasis = (smoked.quantity + gifted.quantity + discarded.quantity) > 0
    ? current.currentCostBasis
    : purchaseTotalPaid
  const dashboardAverageCostPerCigar = hasKnownMoney(dashboardCostBasis) && current.totalQuantity > 0
    ? roundMoney(Number(dashboardCostBasis) / current.totalQuantity)
    : current.averageCostPerCigar
  const lifetimeCost = sumMoneyValues([dashboardCostBasis, smoked.totalCost, gifted.totalCost, discarded.totalCost])
  const lifetimeMsrp = sumMoneyValues([current.currentMsrpValue, smoked.totalMsrp, gifted.totalMsrp, discarded.totalMsrp])
  const lifetimeSavings = hasKnownMoney(lifetimeCost) && hasKnownMoney(lifetimeMsrp) ? Number(lifetimeMsrp) - Number(lifetimeCost) : null
  const lifetimeSavingsDisplay = hasKnownMoney(lifetimeSavings)
    ? `${money(lifetimeSavings)} (${formatPercent(savingsPercent(lifetimeCost, lifetimeMsrp))})`
    : 'Unknown'
  const humidors = buildHumidorSummaries()
  const preInventory = preInventoryDashboardSummary()
  const preInventoryRows = preInventoryWorklist(preInventory)
  const shell = document.createElement('div')
  shell.className = 'dashboard-shell'

  const summary = document.createElement('section')
  summary.className = 'dashboard-summary'
  summary.append(
    inventoryStatusCard(current.totalQuantity, enRouteQuantity, current.uniqueCigarCount),
    metricCard('Cost Basis', dashboardCostBasis, 'Current value paid for inventory', true),
    metricCard('MSRP Value', current.currentMsrpValue, 'Current retail value of inventory', true),
    metricCard('Savings', lifetimeSavingsDisplay, 'Lifetime MSRP minus lifetime cost basis'),
    metricCard('Avg Cost', dashboardAverageCostPerCigar, 'Average cost per cigar on hand', true),
    metricCard('Avg MSRP', current.averageMsrpPerCigar, 'Average MSRP per cigar on hand', true),
  )
  if (preInventory) {
    const stagingCard = metricCard('Pre Inventory', preInventory.totalQuantity, `${formatCount(preInventoryRows.length)} catalog entries awaiting permanent placement`)
    stagingCard.classList.add('interactive-metric-card')
    stagingCard.tabIndex = 0
    stagingCard.setAttribute('role', 'button')
    stagingCard.setAttribute('aria-label', `Open ${formatCount(preInventory.totalQuantity)} Pre Inventory cigars in Collection`)
    const openStagingCollection = () => {
      state.collectionHumidorFilterId = Number(preInventory.humidor.id)
      state.collectionSectionFilterId = null
      state.selectedCollectionCigarId = null
      navigateToPage('Collection')
    }
    stagingCard.addEventListener('click', openStagingCollection)
    stagingCard.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        openStagingCollection()
      }
    })
    summary.append(stagingCard)
  }

  const lifetime = document.createElement('section')
  lifetime.className = 'dashboard-panel'
  lifetime.innerHTML = `
    <div class="section-heading compact-heading">
      <div>
        <h3>Removal Totals</h3>
      </div>
    </div>
    <div class="metric-grid compact lifetime-metric-grid">
      <article class="metric-card lifetime-quantity-card"><span>Quantity</span><strong>${formatCount(smoked.quantity)}</strong><small>Smoked</small></article>
      <article class="metric-card"><span>Cost</span><strong>${money(smoked.totalCost)}</strong></article>
      <article class="metric-card"><span>MSRP</span><strong>${money(smoked.totalMsrp)}</strong></article>
      <article class="metric-card"><span>Avg Cost</span><strong>${money(smoked.averageCostPerCigar)}</strong></article>
      <article class="metric-card"><span>Avg MSRP</span><strong>${money(smoked.averageMsrpPerCigar)}</strong></article>
    </div>
    <div class="metric-grid compact lifetime-metric-grid">
      <article class="metric-card lifetime-quantity-card"><span>Quantity</span><strong>${formatCount(gifted.quantity)}</strong><small>Gifted</small></article>
      <article class="metric-card"><span>Gifted Cost</span><strong>${money(gifted.totalCost)}</strong></article>
      <article class="metric-card"><span>Gifted MSRP</span><strong>${money(gifted.totalMsrp)}</strong></article>
      <article class="metric-card"><span>Avg Gifted Cost</span><strong>${money(gifted.averageCostPerCigar)}</strong></article>
      <article class="metric-card"><span>Avg Gifted MSRP</span><strong>${money(gifted.averageMsrpPerCigar)}</strong></article>
    </div>
    <div class="metric-grid compact lifetime-metric-grid">
      <article class="metric-card lifetime-quantity-card"><span>Quantity</span><strong>${formatCount(discarded.quantity)}</strong><small>Discarded</small></article>
      <article class="metric-card"><span>Discarded Cost</span><strong>${money(discarded.totalCost)}</strong></article>
      <article class="metric-card"><span>Discarded MSRP</span><strong>${money(discarded.totalMsrp)}</strong></article>
      <article class="metric-card"><span>Avg Discarded Cost</span><strong>${money(discarded.averageCostPerCigar)}</strong></article>
      <article class="metric-card"><span>Avg Discarded MSRP</span><strong>${money(discarded.averageMsrpPerCigar)}</strong></article>
    </div>
  `

  const humidorPanel = document.createElement('section')
  humidorPanel.className = 'dashboard-panel'
  humidorPanel.innerHTML = `
    <div class="section-heading compact-heading">
      <div>
        <h3>Current Counts And Oldest Date</h3>
      </div>
    </div>
  `
  const humidorTableWrap = document.createElement('div')
  humidorTableWrap.className = 'table-scroll'
  const humidorTable = document.createElement('table')
  humidorTable.className = 'data-table'
  humidorTable.innerHTML = `
    <thead>
      <tr>
        <th>Humidor</th>
        <th>Current Count</th>
        <th>Oldest Inside</th>
      </tr>
    </thead>
    <tbody></tbody>
  `
  const humidorBody = humidorTable.querySelector('tbody')
  humidors.forEach((item) => {
    const row = document.createElement('tr')
    row.innerHTML = `
      <td><button type="button" class="linkish-button" data-humidor-id="${item.humidor.id}">${escapeHtml(item.humidor.name || '')}</button></td>
      <td>${formatCount(item.totalQuantity)}</td>
      <td>${escapeHtml(displayDate(item.oldestDate) || '—')}</td>
    `
    humidorBody.append(row)
  })
  humidorTableWrap.append(humidorTable)
  humidorPanel.append(humidorTableWrap)
  humidorPanel.querySelectorAll('button[data-humidor-id]').forEach((button) => {
    button.addEventListener('click', () => openCollectionForHumidor(button.dataset.humidorId))
  })

  let preInventoryPanel = null
  if (preInventory) {
    preInventoryPanel = document.createElement('section')
    preInventoryPanel.className = 'dashboard-panel'
    preInventoryPanel.innerHTML = `
      <div class="section-heading compact-heading">
        <div>
          <h3>Pre Inventory Worklist</h3>
          <p class="muted">Move staged cigars into their permanent Humidors as the physical count is reconciled.</p>
        </div>
      </div>
    `
    preInventoryPanel.querySelector('.section-heading').append(infoBadge(`${formatCount(preInventory.totalQuantity)} remaining`))
    if (preInventoryRows.length === 0) {
      const empty = document.createElement('div')
      empty.className = 'empty-state'
      empty.innerHTML = '<p>Pre Inventory is empty. Archive the Humidor when reconciliation is complete.</p>'
      preInventoryPanel.append(empty)
    } else {
      const tableWrap = document.createElement('div')
      tableWrap.className = 'table-scroll'
      const table = document.createElement('table')
      table.className = 'data-table'
      table.innerHTML = `
        <thead><tr><th>Cigar</th><th>Staged</th><th>Placed Elsewhere</th><th>Total On Hand</th><th>Placement Progress</th></tr></thead>
        <tbody>${preInventoryRows.map((item) => `
          <tr>
            <td><button type="button" class="linkish-button" data-pre-inventory-cigar-id="${item.cigar.id}">${escapeHtml(cigarName(item.cigar))}</button></td>
            <td>${formatCount(item.stagedQuantity)}</td>
            <td>${formatCount(item.placedQuantity)}</td>
            <td>${formatCount(item.totalQuantity)}</td>
            <td>${escapeHtml(formatPercent(item.placementPercent))}</td>
          </tr>
        `).join('')}</tbody>
      `
      tableWrap.append(table)
      preInventoryPanel.append(tableWrap)
      preInventoryPanel.querySelectorAll('button[data-pre-inventory-cigar-id]').forEach((button) => {
        button.addEventListener('click', () => {
          state.collectionHumidorFilterId = Number(preInventory.humidor.id)
          state.collectionSectionFilterId = null
          state.selectedCollectionCigarId = Number(button.dataset.preInventoryCigarId || 0)
          state.collectionScrollTargetCigarId = state.selectedCollectionCigarId
          navigateToPage('Collection')
        })
      })
    }
  }

  const body = document.createElement('div')
  body.className = 'dashboard-body'
  const main = document.createElement('div')
  main.className = 'dashboard-main-grid'
  main.append(humidorPanel)
  if (preInventoryPanel) main.append(preInventoryPanel)
  const side = document.createElement('aside')
  side.className = 'dashboard-side-grid'
  side.append(lifetime)
  body.append(main, side)

  shell.append(summary, body)
  shell.querySelectorAll('button[data-page]').forEach((button) => {
    button.addEventListener('click', () => navigateToPage(button.dataset.page))
  })
  view.append(shell)
}

function renderPendingSmokingJournal(view) {
  const eventId = Number(state.pendingSmokingJournalEventId || 0)
  if (!eventId) {
    return
  }
  const event = recordById('inventory-events', eventId)
  if (!event || normalizeEventType(event.eventType) !== 'SMOKED') {
    state.pendingSmokingJournalEventId = null
    return
  }
  const existing = smokingJournalEntryForEvent(eventId)
  const buyAgainDefaults = smokingJournalBuyAgainDefaults(event)
  const panel = document.createElement('section')
  panel.className = 'dashboard-panel'
  panel.innerHTML = `
    <div class="section-heading compact-heading"><div><h3>Smoking Journal</h3><p class="muted">Add a rating, tasting notes, and an optional Buy Again decision for the smoked cigar.</p></div></div>
    <form class="record-form compact-top-gap" data-smoking-journal-form>
      <label class="form-field"><span>Rating (1-10)</span><input name="rating" type="number" min="1" max="10" step="1" value="${escapeHtml(existing?.rating || '')}" required></label>
      <label class="form-field wide"><span>Tasting Notes</span><textarea name="notes" rows="3">${escapeHtml(existing?.notes || '')}</textarea></label>
      <label class="form-field"><span>Buy Again</span><select name="buyAgainStatus">${buyAgainStatusOptions.map((option) => `<option value="${option.value}"${option.value === buyAgainDefaults.status ? ' selected' : ''}>${option.label}</option>`).join('')}</select></label>
      <label class="form-field wide"><span>Buy Again Notes</span><textarea name="buyAgainNotes" rows="3">${escapeHtml(buyAgainDefaults.notes)}</textarea></label>
      <div class="form-actions"><button type="submit" class="primary-button">Save Journal Entry</button><button type="button" class="secondary-button" data-skip-journal>Skip</button></div>
    </form>
  `
  const form = panel.querySelector('[data-smoking-journal-form]')
  form.addEventListener('submit', async (submitEvent) => {
    submitEvent.preventDefault()
    const data = new FormData(form)
    try {
      await apiPut(`/inventory-events/${eventId}/smoking-journal`, {
        rating: Number(data.get('rating')),
        notes: String(data.get('notes') || '').trim(),
        buyAgainStatus: String(data.get('buyAgainStatus') || ''),
        buyAgainNotes: String(data.get('buyAgainNotes') || '').trim(),
      })
      state.pendingSmokingJournalEventId = null
      state.formError = null
      await refreshCollections(['smoking-journal-entries', 'catalog-cigars'])
    } catch (error) {
      state.formError = error.message
    }
    render()
  })
  panel.querySelector('[data-skip-journal]').addEventListener('click', () => {
    state.pendingSmokingJournalEventId = null
    render()
  })
  view.append(panel)
}

function toggleCollectionCigarSelection(cigarId) {
  const normalizedCigarId = Number(cigarId || 0)
  state.selectedCollectionCigarId = Number(state.selectedCollectionCigarId || 0) === normalizedCigarId ? null : normalizedCigarId
}

function renderCollectionPage(view) {
  const metrics = currentCollectionMetrics()
  const items = sortCollectionItems(metrics.items)
  const selectedCigarId = Number(state.selectedCollectionCigarId || 0)
  const preInventory = preInventoryDashboardSummary()
  const preInventorySummary = preInventoryReconciliationSummary(preInventory)
  const isPreInventoryView = Boolean(preInventorySummary && Number(state.collectionHumidorFilterId || 0) === Number(preInventorySummary.preInventory.humidor.id))
  const availableSections = records('storage-sub-locations')
    .filter((section) => recordIsActive(section) && (!state.collectionHumidorFilterId || Number(section.storageLocationId) === Number(state.collectionHumidorFilterId)))
    .sort((left, right) => sectionName(left).localeCompare(sectionName(right)))

  const controls = document.createElement('div')
  controls.className = 'collection-toolbar'
  controls.innerHTML = `
    <div class="section-heading collection-heading">
      <div>
        <h3>Collection On Hand</h3>
        <p class="muted">${formatCount(metrics.totalQuantity)} cigars across ${formatCount(metrics.uniqueCigarCount)} matching catalog entries.</p>
      </div>
    </div>
  `

  const controlBar = document.createElement('div')
  controlBar.className = 'collection-controls'
  const sortSelect = document.createElement('select')
  sortSelect.setAttribute('aria-label', 'Sort collection by')
  ;[
    { value: 'alpha', label: 'Alphabetical' },
    { value: 'location', label: 'Humidor Location' },
    { value: 'strength', label: 'Strength' },
  ].forEach((option) => {
    const item = document.createElement('option')
    item.value = option.value
    item.textContent = option.label
    sortSelect.append(item)
  })
  sortSelect.value = state.collectionSort
  sortSelect.addEventListener('change', () => {
    state.collectionSort = sortSelect.value
    render()
  })

  const humidorFilterSelect = document.createElement('select')
  humidorFilterSelect.setAttribute('aria-label', 'Filter collection by Humidor')
  humidorFilterSelect.append(new Option('All Humidors', ''))
  records('storage-locations')
    .filter(recordIsActive)
    .slice()
    .sort((left, right) => (left.name || '').localeCompare(right.name || ''))
    .forEach((humidor) => humidorFilterSelect.append(new Option(humidor.name || `Humidor ${humidor.id}`, String(humidor.id))))
  humidorFilterSelect.value = state.collectionHumidorFilterId ? String(state.collectionHumidorFilterId) : ''
  humidorFilterSelect.addEventListener('change', () => {
    state.collectionHumidorFilterId = humidorFilterSelect.value ? Number(humidorFilterSelect.value) : null
    state.collectionSectionFilterId = null
    state.selectedCollectionCigarId = null
    render()
  })

  const sectionFilterSelect = document.createElement('select')
  sectionFilterSelect.setAttribute('aria-label', 'Filter collection by drawer')
  sectionFilterSelect.append(new Option('All Drawers', ''))
  availableSections.forEach((section) => sectionFilterSelect.append(new Option(sectionName(section), String(section.id))))
  sectionFilterSelect.value = state.collectionSectionFilterId ? String(state.collectionSectionFilterId) : ''
  sectionFilterSelect.disabled = !state.collectionHumidorFilterId || availableSections.length === 0
  sectionFilterSelect.addEventListener('change', () => {
    state.collectionSectionFilterId = sectionFilterSelect.value ? Number(sectionFilterSelect.value) : null
    state.selectedCollectionCigarId = null
    render()
  })

  const strengthFilterSelect = document.createElement('select')
  strengthFilterSelect.setAttribute('aria-label', 'Filter collection by strength')
  strengthFilterSelect.append(new Option('All Strengths', ''))
  Array.from(new Set(buildCollectionItems().map((item) => String(item.cigar.strength || '').trim()).filter(Boolean)))
    .sort((left, right) => strengthSortRank(left) - strengthSortRank(right) || left.localeCompare(right))
    .forEach((strength) => strengthFilterSelect.append(new Option(strength, strength.toLowerCase())))
  strengthFilterSelect.value = state.collectionStrengthFilter
  strengthFilterSelect.addEventListener('change', () => {
    state.collectionStrengthFilter = strengthFilterSelect.value
    state.selectedCollectionCigarId = null
    render()
  })

  const buyAgainFilterSelect = document.createElement('select')
  buyAgainFilterSelect.setAttribute('aria-label', 'Filter collection by Buy Again decision')
  buyAgainFilterSelect.append(new Option('All Buy Again', ''))
  buyAgainStatusOptions.forEach((option) => {
    buyAgainFilterSelect.append(new Option(option.label, option.value || 'NOT_EVALUATED'))
  })
  buyAgainFilterSelect.value = state.collectionBuyAgainFilter
  buyAgainFilterSelect.addEventListener('change', () => {
    state.collectionBuyAgainFilter = buyAgainFilterSelect.value
    state.selectedCollectionCigarId = null
    render()
  })

  const directionButton = document.createElement('button')
  directionButton.type = 'button'
  directionButton.className = 'secondary-button'
  directionButton.textContent = state.collectionDirection === 'asc' ? 'Ascending' : 'Descending'
  directionButton.addEventListener('click', () => {
    state.collectionDirection = state.collectionDirection === 'asc' ? 'desc' : 'asc'
    render()
  })
  let clearButton = null
  if (state.collectionHumidorFilterId || state.collectionSectionFilterId || state.collectionStrengthFilter || state.collectionBuyAgainFilter || state.collectionSearch) {
    clearButton = document.createElement('button')
    clearButton.type = 'button'
    clearButton.className = 'secondary-button'
    clearButton.textContent = 'Clear Filters'
    clearButton.addEventListener('click', () => {
      state.collectionHumidorFilterId = null
      state.collectionSectionFilterId = null
      state.collectionStrengthFilter = ''
      state.collectionBuyAgainFilter = ''
      state.collectionSearch = ''
      state.selectedCollectionCigarId = null
      render()
    })
  }
  controlBar.append(sortSelect, humidorFilterSelect, sectionFilterSelect, strengthFilterSelect, buyAgainFilterSelect, directionButton)
  if (clearButton) controlBar.append(clearButton)
  controls.append(controlBar)

  const searchForm = document.createElement('form')
  searchForm.className = 'collection-search-form'
  searchForm.innerHTML = `
    <label class="form-field"><span>Search Collection</span><input name="collectionSearch" value="${escapeHtml(state.collectionSearch)}" placeholder="Search cigar, manufacturer, strength, wrapper, or location"></label>
    <button class="primary-button" type="submit">Search</button>
    <button class="secondary-button" type="button" data-clear-collection-search>Clear</button>
  `
  searchForm.addEventListener('submit', (event) => {
    event.preventDefault()
    state.collectionSearch = String(new FormData(searchForm).get('collectionSearch') || '').trim()
    state.selectedCollectionCigarId = null
    render()
  })
  searchForm.querySelector('[data-clear-collection-search]').addEventListener('click', () => {
    state.collectionSearch = ''
    state.selectedCollectionCigarId = null
    render()
  })
  controls.append(searchForm)

  const savedViews = collectionSavedViews()
  const savedViewBar = document.createElement('div')
  savedViewBar.className = 'collection-saved-view-bar'
  savedViewBar.innerHTML = `
    <label class="form-field collection-saved-view-select-field">
      <span>Saved Views</span>
      <select data-collection-view-select>
        <option value="">Load a saved view...</option>
        ${savedViews.map((view) => `<option value="${escapeHtml(view.name)}">${escapeHtml(view.name)}</option>`).join('')}
      </select>
    </label>
    <label class="form-field collection-saved-view-name-field">
      <span>View Name</span>
      <input type="text" data-collection-view-name placeholder="Current filters">
    </label>
    <button type="button" class="primary-button" data-save-collection-view>Save View</button>
    <button type="button" class="secondary-button" data-delete-collection-view ${savedViews.length === 0 ? 'disabled' : ''}>Delete View</button>
  `
  const savedViewSelect = savedViewBar.querySelector('[data-collection-view-select]')
  const savedViewNameInput = savedViewBar.querySelector('[data-collection-view-name]')
  const saveCollectionViewButton = savedViewBar.querySelector('[data-save-collection-view]')
  const deleteCollectionViewButton = savedViewBar.querySelector('[data-delete-collection-view]')
  const matchingView = savedViews.find((view) => collectionViewMatchesCurrent(view.snapshot))
  if (matchingView) {
    savedViewSelect.value = matchingView.name
  }
  const syncSavedViewButtons = () => {
    const canSave = String(savedViewNameInput.value || '').trim().length > 0
    saveCollectionViewButton.disabled = !canSave
    deleteCollectionViewButton.disabled = savedViews.length === 0 || !savedViewSelect.value
  }
  savedViewNameInput.addEventListener('input', syncSavedViewButtons)
  savedViewSelect.addEventListener('change', () => {
    if (applyCollectionView(savedViewSelect.value)) return
    savedViewSelect.value = ''
  })
  saveCollectionViewButton.addEventListener('click', () => {
    if (!saveCollectionView(savedViewNameInput.value)) return
    render()
  })
  deleteCollectionViewButton.addEventListener('click', () => {
    if (!deleteCollectionView(savedViewSelect.value)) return
    render()
  })
  syncSavedViewButtons()
  const summary = document.createElement('div')
  summary.className = 'metric-grid compact collection-summary-grid'
  summary.append(
    metricCard('On Hand', metrics.totalQuantity, 'Current cigars available'),
    metricCard('Cost Basis', metrics.currentCostBasis, 'Current cost basis of on-hand cigars', true),
    metricCard('MSRP Value', metrics.currentMsrpValue, 'Current MSRP of on-hand cigars', true),
  )

  let preInventoryPanel = null
  if (isPreInventoryView && preInventorySummary) {
    preInventoryPanel = document.createElement('section')
    preInventoryPanel.className = 'dashboard-panel collection-pre-inventory-panel'
    preInventoryPanel.innerHTML = `
      <div class="section-heading compact-heading">
        <div>
          <h3>Pre Inventory Reconciliation</h3>
          <p class="muted">Use the collection cards below to move staged cigars into their permanent humidors after your manual count.</p>
        </div>
      </div>
    `
    preInventoryPanel.querySelector('.section-heading').append(infoBadge(`${formatCount(preInventorySummary.rows.length)} cigars staged`))
    const summaryGrid = document.createElement('div')
    summaryGrid.className = 'metric-grid compact collection-summary-grid'
    summaryGrid.append(
      metricCard('Staged Quantity', preInventorySummary.stagedQuantity, 'Current quantity still staged in Pre Inventory', true),
      metricCard('Placed Elsewhere', preInventorySummary.placedQuantity, 'Quantity already moved into permanent humidors', true),
      metricCard('Total On Hand', preInventorySummary.totalQuantity, 'Staged plus placed quantity across the current worklist', true),
      metricCard('Placement Complete', formatPercent(preInventorySummary.placementPercent), 'Overall progress toward placing this worklist'),
    )
    preInventoryPanel.append(summaryGrid)
    const actions = document.createElement('div')
    actions.className = 'report-actions'
    const focusFirst = document.createElement('button')
    focusFirst.type = 'button'
    focusFirst.className = 'secondary-button'
    focusFirst.textContent = 'Focus First Staged Cigar'
    focusFirst.disabled = preInventorySummary.rows.length === 0
    focusFirst.addEventListener('click', () => {
      const firstCigarId = preInventoryFirstStagedCigarId(preInventorySummary.preInventory)
      if (!firstCigarId) return
      state.collectionHumidorFilterId = Number(preInventorySummary.preInventory.humidor.id)
      state.collectionSectionFilterId = null
      state.selectedCollectionCigarId = firstCigarId
      state.collectionScrollTargetCigarId = firstCigarId
      state.collectionAutoOpenMoveCigarId = firstCigarId
      render()
    })
    const clearFocus = document.createElement('button')
    clearFocus.type = 'button'
    clearFocus.className = 'secondary-button'
    clearFocus.textContent = 'Clear Pre Inventory Filter'
    clearFocus.addEventListener('click', () => {
      state.collectionHumidorFilterId = null
      state.collectionSectionFilterId = null
      state.selectedCollectionCigarId = null
      state.collectionScrollTargetCigarId = null
      render()
    })
    actions.append(focusFirst, clearFocus)
    preInventoryPanel.append(actions)
  }

  if (items.length === 0) {
    const empty = document.createElement('div')
    empty.className = 'empty-state'
    const hasOnHandInventory = buildCollectionItems().length > 0
    empty.innerHTML = hasOnHandInventory
      ? '<h3>No Matching Cigars</h3><p>No on-hand cigars match the current search and filters.</p>'
      : '<h3>No On-Hand Collection Yet</h3><p>Create a purchase and at least one purchase line to begin tracking on-hand inventory.</p>'
    if (preInventoryPanel) {
      view.append(controls, summary, preInventoryPanel, empty, savedViewBar)
    } else {
      view.append(controls, summary, empty, savedViewBar)
    }
    return
  }

  const tableWrap = document.createElement('div')
  tableWrap.className = 'table-scroll'
  const table = document.createElement('table')
  table.className = 'data-table collection-table'
  table.innerHTML = `
    <thead>
      <tr>
        <th>Cigar</th>
        <th>On Hand</th>
        <th>Lots</th>
        <th>Oldest</th>
        <th>Avg Cost</th>
        <th>Avg MSRP</th>
        <th>Humidor Location</th>
      </tr>
    </thead>
    <tbody></tbody>
  `
  const tbody = table.querySelector('tbody')
  items.forEach((item) => {
    const row = document.createElement('tr')
    const isSelected = Number(item.cigar.id) === selectedCigarId
    row.className = isSelected ? 'clickable-record-row selected-row' : 'clickable-record-row'
    row.tabIndex = 0
    row.setAttribute('aria-expanded', String(isSelected))
    row.setAttribute('aria-label', `${isSelected ? 'Collapse' : 'Expand'} ${cigarName(item.cigar)} inventory details`)
    row.dataset.collectionCigarId = String(item.cigar.id)
    row.innerHTML = `
      <td>
        <div class="collection-cigar-cell">
          <button type="button" class="linkish-button" data-cigar-id="${item.cigar.id}"><strong>${escapeHtml(cigarName(item.cigar))}</strong></button>
          <small>${strengthBadge(item.cigar.strength)} <span>Wrapper: ${escapeHtml(item.cigar.wrapper || 'Unknown')} &bull; Binder: ${escapeHtml(item.cigar.binder || 'Unknown')} &bull; Filler: ${escapeHtml(item.cigar.filler || 'Unknown')}</span></small>
          <small>Buy Again: ${escapeHtml(buyAgainLabel(item.cigar.buyAgainStatus))}</small>
        </div>
      </td>
      <td>${formatCount(item.totalQuantity)}</td>
      <td>${formatCount(item.lotCount)}</td>
      <td>${escapeHtml(displayDate(item.oldestDate) || '—')}</td>
      <td>${escapeHtml(money(item.averageCostPerCigar))}</td>
      <td>${escapeHtml(money(item.averageMsrpPerCigar))}</td>
      <td>
        <div class="collection-location-cell">
          ${item.locations.map((location) => `<span>${escapeHtml(location.label)} <small>(${formatCount(location.quantity)})</small></span>`).join('')}
        </div>
      </td>
    `
    const toggleCigarDetails = () => {
      toggleCollectionCigarSelection(item.cigar.id)
      render()
    }
    row.addEventListener('click', (event) => {
      if (event.target.closest('button, a, input, select, textarea, label')) return
      toggleCigarDetails()
    })
    row.addEventListener('keydown', (event) => {
      if (event.target === row && (event.key === 'Enter' || event.key === ' ')) {
        event.preventDefault()
        toggleCigarDetails()
      }
    })
    tbody.append(row)

    if (isSelected) {
      const detailRow = document.createElement('tr')
      detailRow.className = 'collection-expanded-row'
      detailRow.innerHTML = `
        <td colspan="7">
          <div class="collection-expanded-card">
            <table class="data-table collection-detail-table">
              <thead>
                <tr>
                  <th>Location</th>
                  <th>Qty</th>
                  <th>Lot</th>
                  <th>Cost / Cigar</th>
                  <th>MSRP / Cigar</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                ${item.balances.map((balance) => `
                  <tr>
                    <td>${escapeHtml(balance.locationLabel)}</td>
                    <td>${formatCount(balance.quantity)}</td>
                    <td>${escapeHtml(String(balance.lot?.id || ''))}</td>
                    <td>${escapeHtml(money(balance.costPerCigar))}</td>
                    <td>${escapeHtml(money(balance.msrpPerCigar))}</td>
                    <td>
                      <div class="inline-action-stack">
                        <div class="inline-action-buttons">
                          <button type="button" class="secondary-button compact-button" data-remove-balance-id="${balance.balance.id}" data-remove-type="SMOKED">Smoke</button>
                          <button type="button" class="secondary-button compact-button" data-move-toggle-id="${balance.balance.id}">Move</button>
                          <button type="button" class="secondary-button compact-button" data-remove-balance-id="${balance.balance.id}" data-remove-type="GIFTED">Give</button>
                          <button type="button" class="secondary-button compact-button" data-remove-balance-id="${balance.balance.id}" data-remove-type="DISCARDED">Discard</button>
                          ${balanceAllowsCountReconciliation(balance) ? `<button type="button" class="secondary-button compact-button" data-adjustment-toggle-id="${balance.balance.id}">Reconcile Count</button>` : ''}
                        </div>
                        <form class="inline-move-form" data-removal-form="${balance.balance.id}">
                          <input type="hidden" name="sourceBalanceId" value="${balance.balance.id}">
                          <input type="hidden" name="eventType" value="">
                          <input type="hidden" name="idempotencyKey" value="">
                          <label class="form-field"><span>Qty</span><input name="quantity" type="number" min="1" max="${Math.max(1, Number(balance.quantity || 1))}" step="1" value="1" required></label>
                          <label class="form-field"><span>Event Date</span><input name="eventDate" type="date" max="${todayIsoDate()}" value="${todayIsoDate()}" required></label>
                          <label class="form-field wide"><span>Notes</span><textarea name="notes" rows="2"></textarea></label>
                          <button type="submit" class="primary-button compact-button" data-removal-submit>Confirm Removal</button>
                          <button type="button" class="secondary-button compact-button" data-cancel-removal>Cancel</button>
                        </form>
                        <form class="inline-move-form" data-move-balance-id="${balance.balance.id}" data-current-location-id="${balance.balance.storageLocationId || ''}" data-current-section-id="${balance.balance.storageSubLocationId || ''}">
                          <input type="hidden" name="sourceBalanceId" value="${balance.balance.id}">
                          <label class="form-field">
                            <span>Qty</span>
                            <input name="quantity" type="number" min="1" max="${Math.max(1, Number(balance.quantity || 1))}" step="1" value="${Math.max(1, Number(balance.quantity || 1))}" required>
                          </label>
                          <label class="form-field">
                            <span>Humidor</span>
                            <select name="toStorageLocationId" required data-destination-humidor>
                              <option value="">Select...</option>
                              ${records('storage-locations').filter(recordIsActive).map((humidor) => `<option value="${humidor.id}">${escapeHtml(humidor.name || `Humidor ${humidor.id}`)}</option>`).join('')}
                            </select>
                          </label>
                          <label class="form-field">
                            <span>Drawer</span>
                            <select name="toStorageSubLocationId" data-destination-section>
                              <option value="">General</option>
                            </select>
                          </label>
                          <input type="hidden" name="cigarName" value="${escapeHtml(cigarName(item.cigar))}">
                          <button type="submit" class="primary-button compact-button">Confirm Move</button>
                        </form>
                        <form class="inline-move-form" data-adjustment-form="${balance.balance.id}">
                          <input type="hidden" name="sourceBalanceId" value="${balance.balance.id}">
                          <input type="hidden" name="expectedQuantity" value="${balance.quantity}">
                          <label class="form-field"><span>Expected Quantity</span><input type="number" value="${balance.quantity}" readonly></label>
                          <label class="form-field"><span>Physical Count</span><input name="countedQuantity" type="number" min="0" step="1" value="${balance.quantity}" required></label>
                          <label class="form-field"><span>Variance</span><input data-adjustment-variance value="0" readonly></label>
                          <label class="form-field"><span>Count Date</span><input name="eventDate" type="date" max="${todayIsoDate()}" value="${todayIsoDate()}" required></label>
                          <label class="form-field wide"><span>Adjustment Reason</span><textarea name="notes" rows="2" required></textarea></label>
                          <button type="submit" class="primary-button compact-button" data-adjustment-submit disabled>Confirm Adjustment</button>
                          <button type="button" class="secondary-button compact-button" data-cancel-adjustment>Cancel</button>
                        </form>
                      </div>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </td>
      `
      tbody.append(detailRow)
    }
  })
  table.querySelectorAll('button[data-cigar-id]').forEach((button) => {
    button.addEventListener('click', () => {
      toggleCollectionCigarSelection(button.dataset.cigarId)
      render()
    })
  })
  tableWrap.append(table)
  table.querySelectorAll('button[data-remove-balance-id]').forEach((button) => {
    button.addEventListener('click', () => {
      const balanceId = Number(button.dataset.removeBalanceId || 0)
      const type = normalizeEventType(button.dataset.removeType)
      const form = table.querySelector(`form[data-removal-form="${balanceId}"]`)
      if (!form) {
        return
      }
      form.elements.eventType.value = type
      form.elements.idempotencyKey.value = removalIdempotencyKey(balanceId, type)
      form.querySelector('[data-removal-submit]').textContent = `Confirm ${removalActionLabel(type)}`
      table.querySelectorAll('form[data-removal-form]').forEach((otherForm) => otherForm.classList.toggle('is-open', otherForm === form))
    })
  })
  table.querySelectorAll('form[data-removal-form]').forEach((form) => {
    form.querySelector('[data-cancel-removal]').addEventListener('click', () => form.classList.remove('is-open'))
    form.addEventListener('submit', async (event) => {
      event.preventDefault()
      const data = new FormData(form)
      const balanceId = Number(data.get('sourceBalanceId') || 0)
      const type = normalizeEventType(data.get('eventType'))
      try {
        const result = await apiPost('/inventory/remove', {
          sourceBalanceId: String(balanceId),
          quantity: String(data.get('quantity') || '').trim(),
          eventType: type,
          eventDate: String(data.get('eventDate') || '').trim(),
          notes: String(data.get('notes') || '').trim(),
          idempotencyKey: String(data.get('idempotencyKey') || '').trim(),
        })
        clearRemovalIdempotencyKey(balanceId, type)
        if (type === 'SMOKED') {
          state.pendingSmokingJournalEventId = Number(result.inventoryEventId || 0)
        }
        state.formError = null
        await refreshCollections(['lot-location-balances', 'inventory-events', 'smoking-journal-entries'])
      } catch (error) {
        state.formError = error.message
      }
      render()
    })
  })
  table.querySelectorAll('button[data-move-toggle-id]').forEach((button) => {
    button.addEventListener('click', () => {
      const form = table.querySelector(`form[data-move-balance-id="${button.dataset.moveToggleId}"]`)
      form?.classList.toggle('is-open')
    })
  })
  table.querySelectorAll('button[data-adjustment-toggle-id]').forEach((button) => {
    button.addEventListener('click', () => {
      const form = table.querySelector(`form[data-adjustment-form="${button.dataset.adjustmentToggleId}"]`)
      form?.classList.toggle('is-open')
    })
  })
  table.querySelectorAll('form[data-adjustment-form]').forEach((form) => {
    const expectedQuantity = Number(form.elements.expectedQuantity.value || 0)
    const countedInput = form.elements.countedQuantity
    const varianceOutput = form.querySelector('[data-adjustment-variance]')
    const submitButton = form.querySelector('[data-adjustment-submit]')
    const updateVariance = () => {
      const countedQuantity = Number(countedInput.value)
      const validCount = Number.isInteger(countedQuantity) && countedQuantity >= 0
      const variance = validCount ? countedQuantity - expectedQuantity : 0
      varianceOutput.value = validCount ? (variance > 0 ? `+${variance}` : String(variance)) : 'Invalid'
      submitButton.disabled = !validCount || variance === 0
    }
    countedInput.addEventListener('input', updateVariance)
    updateVariance()
    form.querySelector('[data-cancel-adjustment]').addEventListener('click', () => form.classList.remove('is-open'))
    form.addEventListener('submit', async (event) => {
      event.preventDefault()
      const data = new FormData(form)
      const balanceId = Number(data.get('sourceBalanceId') || 0)
      const countedQuantity = Number(data.get('countedQuantity'))
      const variance = countedQuantity - expectedQuantity
      if (!Number.isInteger(countedQuantity) || countedQuantity < 0 || variance === 0) {
        state.formError = 'Enter a non-negative physical count that differs from the expected quantity.'
        render()
        return
      }
      if (!confirm(`Apply a physical-count adjustment of ${variance > 0 ? '+' : ''}${variance} cigar${Math.abs(variance) === 1 ? '' : 's'}?`)) {
        return
      }
      try {
        await apiPost('/inventory/adjust-count', {
          sourceBalanceId: String(balanceId),
          expectedQuantity: String(expectedQuantity),
          countedQuantity: String(countedQuantity),
          eventDate: String(data.get('eventDate') || '').trim(),
          notes: String(data.get('notes') || '').trim(),
          idempotencyKey: adjustmentIdempotencyKey(balanceId),
        })
        clearAdjustmentIdempotencyKey(balanceId)
        state.formError = null
        await refreshCollections(['lot-location-balances', 'lots', 'inventory-events'])
      } catch (error) {
        state.formError = error.message
      }
      render()
    })
  })
  table.querySelectorAll('form[data-move-balance-id]').forEach((form) => {
    const humidorSelect = form.querySelector('[data-destination-humidor]')
    const sectionSelect = form.querySelector('[data-destination-section]')
    const submitButton = form.querySelector('button[type="submit"]')
    const currentLocationId = Number(form.dataset.currentLocationId || 0)
    const currentSectionId = Number(form.dataset.currentSectionId || 0)
    const destinationIsCurrent = () => Number(humidorSelect.value || 0) === currentLocationId
      && Number(sectionSelect.value || 0) === currentSectionId
    const updateMoveAvailability = () => {
      submitButton.disabled = !Number(humidorSelect.value || 0) || destinationIsCurrent()
    }
    const fillSections = () => {
      const generalOption = new Option('General', '')
      generalOption.disabled = Number(humidorSelect.value || 0) === currentLocationId && currentSectionId === 0
      sectionSelect.replaceChildren(generalOption)
      records('storage-sub-locations')
        .filter((section) => recordIsActive(section) && Number(section.storageLocationId) === Number(humidorSelect.value || 0))
        .forEach((section) => {
          const option = new Option(sectionName(section), String(section.id))
          option.disabled = Number(humidorSelect.value || 0) === currentLocationId && Number(section.id) === currentSectionId
          sectionSelect.append(option)
        })
      updateMoveAvailability()
    }
    humidorSelect.addEventListener('change', fillSections)
    sectionSelect.addEventListener('change', updateMoveAvailability)
    fillSections()
    form.addEventListener('submit', async (event) => {
      event.preventDefault()
      try {
        if (destinationIsCurrent()) {
          throw new Error('Destination must be different from the current Humidor and section.')
        }
        const data = new FormData(form)
        await apiPost('/inventory/move', {
          sourceBalanceId: String(data.get('sourceBalanceId') || '').trim(),
          quantity: String(data.get('quantity') || '').trim(),
          toStorageLocationId: String(data.get('toStorageLocationId') || '').trim(),
          toStorageSubLocationId: String(data.get('toStorageSubLocationId') || '').trim(),
          notes: `Moved from collection for ${String(data.get('cigarName') || '').trim()}`,
        })
        await refreshCollections(['lot-location-balances', 'inventory-events'])
      } catch (error) {
        state.formError = error.message
      }
      render()
    })
  })

  view.append(controls, summary)
  if (preInventoryPanel) {
    view.append(preInventoryPanel)
  }
  renderPendingSmokingJournal(view)
  view.append(tableWrap)
  view.append(savedViewBar)
  const scrollTargetCigarId = Number(state.collectionScrollTargetCigarId || 0)
  state.collectionScrollTargetCigarId = null
  if (scrollTargetCigarId) {
    const scrollTarget = table.querySelector(`tr[data-collection-cigar-id="${scrollTargetCigarId}"]`)
    window.requestAnimationFrame(() => {
      scrollTarget?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      scrollTarget?.querySelector('button[data-cigar-id]')?.focus({ preventScroll: true })
    })
  }
  const autoOpenMoveCigarId = Number(state.collectionAutoOpenMoveCigarId || 0)
  state.collectionAutoOpenMoveCigarId = null
  if (autoOpenMoveCigarId) {
    window.requestAnimationFrame(() => {
      table.querySelector(`tr[data-collection-cigar-id="${autoOpenMoveCigarId}"] button[data-move-toggle-id]`)?.click()
    })
  }
}

function fieldValue(record, field) {
  const value = record?.[field.name]
  return value === null || value === undefined ? '' : String(value)
}

function renderField(field, record) {
  const label = document.createElement('label')
  label.className = field.type === 'textarea' ? 'form-field wide' : 'form-field'
  const caption = document.createElement('span')
  caption.textContent = field.required ? `${field.label} *` : field.label
  label.append(caption)

  if (field.type === 'textarea') {
    const textarea = document.createElement('textarea')
    textarea.name = field.name
    textarea.rows = 3
    textarea.value = fieldValue(record, field)
    label.append(textarea)
    return label
  }

  if (field.type === 'select') {
    const select = document.createElement('select')
    select.name = field.name
    if (field.required) {
      select.required = true
    }
    if (!field.options?.some((option) => option.value === '')) {
      const emptyOption = document.createElement('option')
      emptyOption.value = ''
      emptyOption.textContent = 'Select...'
      select.append(emptyOption)
    }
    if (field.options) {
      field.options.forEach((option) => {
        const item = document.createElement('option')
        item.value = option.value
        item.textContent = option.label
        select.append(item)
      })
    } else {
      records(field.collection)
        .filter((option) => recordIsActive(option) || Number(option.id) === Number(record?.[field.name] || 0))
        .forEach((option) => {
        const item = document.createElement('option')
        item.value = String(option.id)
        item.textContent = typeof field.optionLabel === 'function' ? field.optionLabel(option) : option[field.optionLabel] || `Record ${option.id}`
          select.append(item)
        })
    }
    select.value = fieldValue(record, field)
    label.append(select)
    return label
  }

  const input = document.createElement('input')
  input.name = field.name
  input.type = field.type || 'text'
  input.value = fieldValue(record, field)
  if (field.required) {
    input.required = true
  }
  if (field.step) {
    input.step = field.step
  }
  label.append(input)
  return label
}

function formPayload(form, fields) {
  const formData = new FormData(form)
  return fields.reduce((payload, field) => {
    payload[field.name] = String(formData.get(field.name) || '').trim()
    return payload
  }, {})
}

function renderManagedForm(view, pageConfig) {
  const collection = pageConfig.collection
  const editingRecord = state.editing[collection] || null
  const form = document.createElement('form')
  form.className = 'data-form'

  const heading = document.createElement('div')
  heading.className = 'section-heading'
  heading.innerHTML = `
    <div>
      <h3>${editingRecord ? 'Edit' : 'Add'} ${escapeHtml(pageConfig.title)}</h3>
      <p class="muted">${escapeHtml(pageConfig.intro)}</p>
    </div>
  `

  const grid = document.createElement('div')
  grid.className = 'form-grid'
  pageConfig.fields.forEach((field) => grid.append(renderField(field, editingRecord)))

  const actions = document.createElement('div')
  actions.className = 'form-actions'
  const save = document.createElement('button')
  save.type = 'submit'
  save.className = 'primary-button'
  save.textContent = editingRecord ? 'Save Changes' : `Add ${pageConfig.title}`
  actions.append(save)

  if (editingRecord) {
    const cancel = document.createElement('button')
    cancel.type = 'button'
    cancel.className = 'secondary-button'
    cancel.textContent = 'Cancel Edit'
    cancel.addEventListener('click', () => {
      state.editing[collection] = null
      state.formError = null
      render()
    })
    actions.append(cancel)
  }

  if (state.formError) {
    const error = document.createElement('p')
    error.className = 'form-error wide'
    error.textContent = state.formError
    actions.append(error)
  }

  form.append(heading, grid, actions)
  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    state.formError = null
    try {
      const payload = formPayload(form, pageConfig.fields)
      if (editingRecord) {
        await apiPut(`/records/${collection}/${editingRecord.id}`, payload)
      } else {
        await apiPost(`/records/${collection}`, payload)
      }
      state.records[collection] = null
      state.editing[collection] = null
      await ensureRecords(collection)
      await refreshSampleData()
    } catch (error) {
      state.formError = error.message
    }
    render()
  })

  return form
}

function renderCatalogSmokingHistory(container, cigar) {
  const rows = smokingJournalHistoryRows(cigar.id)
  const metrics = smokingJournalHistoryMetrics(rows)
  const heading = document.createElement('div')
  heading.className = 'section-heading compact-heading'
  heading.innerHTML = `
    <div>
      <h3>Smoking Journal</h3>
      <p class="muted">${escapeHtml(cigarName(cigar))} &bull; Buy Again: ${escapeHtml(buyAgainLabel(cigar.buyAgainStatus))}</p>
    </div>
  `
  const close = document.createElement('button')
  close.type = 'button'
  close.className = 'secondary-button compact-button'
  close.textContent = 'Close Journal'
  close.addEventListener('click', () => {
    state.selectedCatalogHistoryCigarId = null
    render()
  })
  heading.append(close)
  container.append(heading)

  const summary = document.createElement('div')
  summary.className = 'metric-grid compact journal-summary-grid'
  summary.append(
    metricCard('Journal Entries', metrics.totalEntries, 'Includes preserved reversed history'),
    metricCard('Effective Smoked', metrics.effectiveQuantity, 'Quantity after reversals'),
    metricCard('Average Rating', metrics.averageRating === null ? null : metrics.averageRating.toFixed(1), 'Effective rated entries'),
    metricCard('Last Smoked', metrics.lastSmokedDate || '—', 'Latest effective journal date'),
  )
  container.append(summary)

  if (rows.length === 0) {
    const empty = document.createElement('div')
    empty.className = 'empty-state'
    empty.innerHTML = '<p>No Smoking Journal entries have been recorded for this cigar.</p>'
    container.append(empty)
    return
  }

  const tableWrap = document.createElement('div')
  tableWrap.className = 'table-scroll'
  tableWrap.innerHTML = `
    <table class="data-table smoking-journal-table">
      <thead><tr><th>Date</th><th>Rating</th><th>Qty</th><th>Lot</th><th>Location</th><th>Journal Notes</th><th>Status</th></tr></thead>
      <tbody>${rows.map((row) => `
        <tr>
          <td>${escapeHtml(row.date || '—')}</td>
          <td>${escapeHtml(String(row.journal.rating || '—'))}</td>
          <td>${formatCount(row.event.quantity)}</td>
          <td>${row.event.lotId ? `Lot ${escapeHtml(String(row.event.lotId))}` : '—'}</td>
          <td>${escapeHtml(row.locationLabel || 'Unassigned')}</td>
          <td>${escapeHtml(row.journal.notes || '')}</td>
          <td>${row.reversed ? 'Reversed — history retained' : 'Effective'}</td>
        </tr>
      `).join('')}</tbody>
    </table>
  `
  container.append(tableWrap)
}

function renderManagedTable(view, pageConfig) {
  const collection = pageConfig.collection
  const supportsArchive = collectionSupportsArchive(collection)
  const allRows = collection === 'purchases'
    ? sortPurchasesNewest(records(collection))
    : collection === 'catalog-cigars'
      ? catalogRecordsForDisplay(records(collection))
      : records(collection)
  const showArchived = supportsArchive && state.showArchivedRecords[collection] === true
  const visibleRows = supportsArchive && !showArchived ? allRows.filter(recordIsActive) : allRows
  const rows = collection === 'catalog-cigars' ? catalogRecordsForDisplay(visibleRows, state.catalogSearch) : visibleRows
  const inlineEdit = pageConfig.inlineEdit === true
  const hideRuntimeLocationCopy = ['catalog-cigars', 'vendors', 'storage-locations'].includes(collection)
  const heading = document.createElement('div')
  heading.className = 'section-heading'
  heading.innerHTML = `
    <div>
      <h3>${escapeHtml(pageConfig.title)} Records</h3>
      <p class="muted">${formatCount(rows.length)} of ${formatCount(allRows.length)} records${hideRuntimeLocationCopy ? '.' : ` in external runtime <code>${escapeHtml(collection)}.json</code>.`}</p>
    </div>
  `
  if (supportsArchive) {
    const toggleArchived = document.createElement('button')
    toggleArchived.type = 'button'
    toggleArchived.className = 'secondary-button'
    toggleArchived.textContent = showArchived ? 'Hide Archived' : 'Show Archived'
    toggleArchived.addEventListener('click', () => {
      state.showArchivedRecords[collection] = !showArchived
      state.editing[collection] = null
      if (collection === 'catalog-cigars') state.selectedCatalogHistoryCigarId = null
      render()
    })
    heading.append(toggleArchived)
  }

  let catalogSearchForm = null
  if (collection === 'catalog-cigars') {
    catalogSearchForm = document.createElement('form')
    catalogSearchForm.className = 'collection-search-form compact-top-gap'
    catalogSearchForm.innerHTML = `
      <label class="form-field"><span>Search Catalog</span><input name="catalogSearch" value="${escapeHtml(state.catalogSearch)}" placeholder="Search cigar, manufacturer, strength, wrapper, or Buy Again"></label>
      <button class="primary-button" type="submit">Search</button>
      <button class="secondary-button" type="button" data-clear-catalog-search>Clear</button>
    `
    catalogSearchForm.addEventListener('submit', (event) => {
      event.preventDefault()
      state.catalogSearch = String(new FormData(catalogSearchForm).get('catalogSearch') || '').trim()
      state.editing[collection] = null
      state.selectedCatalogHistoryCigarId = null
      render()
    })
    catalogSearchForm.querySelector('[data-clear-catalog-search]').addEventListener('click', () => {
      state.catalogSearch = ''
      state.editing[collection] = null
      state.selectedCatalogHistoryCigarId = null
      render()
    })
  }

  if (rows.length === 0) {
    const empty = document.createElement('div')
    empty.className = 'empty-state'
    empty.innerHTML = collection === 'catalog-cigars' && state.catalogSearch
      ? '<p>No Catalog cigars match the current search.</p>'
      : `<p>No ${escapeHtml(pageConfig.title.toLowerCase())} records yet.</p>`
    view.append(heading)
    if (catalogSearchForm) view.append(catalogSearchForm)
    view.append(empty)
    return
  }

  const tableWrap = document.createElement('div')
  tableWrap.className = 'table-scroll'
  const table = document.createElement('table')
  table.className = 'data-table managed-table'
  if (collection === 'catalog-cigars') table.classList.add('catalog-records-table')
  table.innerHTML = `
    <thead>
      <tr>
        ${pageConfig.columns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join('')}
        <th>Actions</th>
      </tr>
    </thead>
    <tbody></tbody>
  `

  const tbody = table.querySelector('tbody')
  rows.forEach((record) => {
    const row = document.createElement('tr')
    const isEditing = inlineEdit && Number(state.editing[collection]?.id || 0) === Number(record.id)
    const isCatalogJournalSelected = collection === 'catalog-cigars'
      && Number(state.selectedCatalogHistoryCigarId || 0) === Number(record.id)
    if (isEditing || isCatalogJournalSelected) row.classList.add('selected-row')
    pageConfig.columns.forEach((column, columnIndex) => {
      const cell = document.createElement('td')
      if (collection === 'storage-locations' && columnIndex === 0 && recordIsActive(record)) {
        const collectionLink = document.createElement('button')
        collectionLink.type = 'button'
        collectionLink.className = 'linkish-button'
        collectionLink.textContent = column.value(record)
        collectionLink.setAttribute('aria-label', `View ${column.value(record)} inventory in Collection`)
        collectionLink.addEventListener('click', () => openCollectionForHumidor(record.id))
        cell.append(collectionLink)
      } else {
        cell.textContent = column.value(record)
      }
      row.append(cell)
    })
    if (supportsArchive && !recordIsActive(record) && row.firstElementChild) {
      row.firstElementChild.textContent += ' — Archived'
    }
    const actions = document.createElement('td')
    actions.className = 'row-actions'

    if (recordIsActive(record) && !(collection === 'purchases' && purchaseIsReceived(record))) {
      const edit = document.createElement('button')
      edit.type = 'button'
      edit.className = 'secondary-button compact-button'
      edit.textContent = 'Edit'
      edit.addEventListener('click', () => {
        state.editing[collection] = record
        state.formError = null
        if (collection === 'catalog-cigars') state.selectedCatalogHistoryCigarId = null
        if (collection === 'purchases') {
          state.selectedPurchaseId = Number(record.id)
        }
        render()
      })
      actions.append(edit)
    }

    if (collection === 'catalog-cigars') {
      const journal = document.createElement('button')
      journal.type = 'button'
      journal.className = 'secondary-button compact-button'
      journal.textContent = isCatalogJournalSelected ? 'Close Journal' : 'Journal'
      journal.addEventListener('click', () => {
        state.selectedCatalogHistoryCigarId = isCatalogJournalSelected ? null : Number(record.id)
        state.editing[collection] = null
        state.formError = null
        render()
      })
      actions.append(journal)
    }

    if (supportsArchive) {
      const lifecycleButton = document.createElement('button')
      lifecycleButton.type = 'button'
      lifecycleButton.className = 'secondary-button compact-button'
      lifecycleButton.textContent = recordIsActive(record) ? 'Archive' : 'Restore'
      if (recordIsActive(record) && collection === 'storage-locations') {
        const assignedQuantity = humidorCurrentCount(record.id)
        const activeSectionCount = humidorSectionCount(record.id)
        if (assignedQuantity > 0 || activeSectionCount > 0) {
          lifecycleButton.disabled = true
          lifecycleButton.title = assignedQuantity > 0
            ? `Move all ${formatCount(assignedQuantity)} assigned cigars before archiving this humidor.`
            : `Archive all ${formatCount(activeSectionCount)} active sections before archiving this humidor.`
        }
      }
      lifecycleButton.addEventListener('click', async () => {
        const action = recordIsActive(record) ? 'archive' : 'restore'
        if (!confirm(`${action === 'archive' ? 'Archive' : 'Restore'} this ${pageConfig.title.toLowerCase()} record?`)) {
          return
        }
        try {
          await apiPatch(`/records/${collection}/${record.id}/${action}`)
          state.records[collection] = null
          state.editing[collection] = null
          if (collection === 'storage-locations' && action === 'archive' && Number(state.selectedHumidorId) === Number(record.id)) {
            state.selectedHumidorId = null
          }
          await ensureRecords(collection)
          await refreshSampleData()
        } catch (error) {
          state.formError = error.message
        }
        render()
      })
      actions.append(lifecycleButton)
    }

    const remove = document.createElement('button')
    remove.type = 'button'
    remove.className = 'danger-button compact-button'
    remove.textContent = 'Delete'
    if (collection === 'storage-locations') {
      const assignedQuantity = humidorCurrentCount(record.id)
      if (assignedQuantity > 0) {
        remove.disabled = true
        remove.title = `Move all ${formatCount(assignedQuantity)} assigned cigars before deleting this humidor.`
        remove.setAttribute('aria-label', `Delete unavailable. ${formatCount(assignedQuantity)} cigars are assigned to this humidor.`)
      }
    }
    remove.addEventListener('click', async () => {
      if (!confirm(`Delete this ${pageConfig.title.toLowerCase()} record?`)) {
        return
      }
      try {
        await apiDelete(`/records/${collection}/${record.id}`)
        state.records[collection] = null
        await ensureRecords(collection)
        await refreshSampleData()
      } catch (error) {
        state.formError = error.message
      }
      render()
    })

    if (!supportsArchive || !recordIsActive(record)) {
      actions.append(remove)
    }
    row.append(actions)
    tbody.append(row)

    if (isEditing || isCatalogJournalSelected) {
      const editRow = document.createElement('tr')
      editRow.className = 'collection-expanded-row'
      const editCell = document.createElement('td')
      editCell.colSpan = pageConfig.columns.length + 1
      const editCard = document.createElement('div')
      editCard.className = 'collection-expanded-card'
      if (isCatalogJournalSelected) {
        renderCatalogSmokingHistory(editCard, record)
      } else if (collection === 'purchases') {
        renderPurchaseRecordInlineEdit(editCard, record)
      } else {
        const form = renderManagedForm(editCard, pageConfig)
        form.classList.add('compact-top-gap')
        editCard.append(form)
      }
      editCell.append(editCard)
      editRow.append(editCell)
      tbody.append(editRow)
    }
  })

  tableWrap.append(table)
  view.append(heading)
  if (catalogSearchForm) view.append(catalogSearchForm)
  view.append(tableWrap)
}

async function refreshCollections(collections) {
  collections.forEach((collection) => {
    state.records[collection] = null
  })
  await Promise.all(collections.map(ensureRecords))
  await refreshSampleData()
}

function purchaseOrderPayload(form, existingPurchase = null) {
  const data = new FormData(form)
  const status = String(data.get('status') || 'pending').trim() || 'pending'
  const totals = purchaseDraftTotals()
  const payload = {
    vendorId: String(data.get('vendorId') || '').trim(),
    status,
    purchaseDate: String(data.get('purchaseDate') || '').trim(),
    subtotal: String(data.get('subtotal') || '').trim(),
    receivedDate: String(data.get('receivedDate') || '').trim(),
    invoiceNumber: String(data.get('invoiceNumber') || '').trim(),
    shipping: String(data.get('shipping') || '').trim(),
    exciseTax: String(data.get('exciseTax') || '').trim(),
    salesTax: String(data.get('salesTax') || '').trim(),
    discount: String(data.get('discount') || '').trim(),
    totalPaid: String(totals.totalPaid.toFixed(2)),
    expectedDate: '',
    trackingNumber: '',
    notes: '',
  }
  if (status === 'received' && !payload.receivedDate) {
    payload.receivedDate = existingPurchase?.receivedDate || todayIsoDate()
  }
  if (status !== 'received') {
    payload.receivedDate = ''
  }
  return payload
}

function purchaseDraftTotals(form) {
  const draft = ensurePurchaseDraftOrder()
  const subtotal = numericValue(draft.subtotal)
  const shipping = numericValue(draft.shipping)
  const exciseTax = numericValue(draft.exciseTax)
  const salesTax = numericValue(draft.salesTax)
  const discount = numericValue(draft.discount)
  const lineSubtotal = roundMoney(state.purchaseDraftLines.reduce((sum, line) => sum + numericValue(line.totalPrice), 0))
  const totalPaid = roundMoney(subtotal + shipping + exciseTax + salesTax - discount)
  return { subtotal, shipping, exciseTax, salesTax, discount, lineSubtotal, totalPaid }
}

function purchaseLinePayloadFromRecord(line, overrides = {}) {
  return {
    purchaseId: String(overrides.purchaseId ?? line.purchaseId ?? ''),
    catalogCigarId: String(overrides.catalogCigarId ?? line.catalogCigarId ?? ''),
    storageLocationId: String(overrides.storageLocationId ?? line.storageLocationId ?? ''),
    storageSubLocationId: String(overrides.storageSubLocationId ?? line.storageSubLocationId ?? ''),
    quantity: String(overrides.quantity ?? line.quantity ?? ''),
    purchasePrice: String(overrides.purchasePrice ?? line.purchasePrice ?? line.lineSubtotal ?? ''),
    unitCost: String(overrides.unitCost ?? line.unitCost ?? ''),
    msrpPerCigar: String(overrides.msrpPerCigar ?? line.msrpPerCigar ?? ''),
    notes: String(overrides.notes ?? line.notes ?? ''),
  }
}

function purchaseLineFormPayload(form, purchaseId) {
  const data = new FormData(form)
  return {
    purchaseId: String(purchaseId),
    catalogCigarId: String(data.get('catalogCigarId') || '').trim(),
    storageLocationId: '',
    storageSubLocationId: '',
    quantity: String(data.get('quantity') || '').trim(),
    purchasePrice: String(data.get('purchasePrice') || '').trim(),
    unitCost: String(data.get('unitCost') || '').trim(),
    msrpPerCigar: String(data.get('msrpPerCigar') || '').trim(),
    notes: String(data.get('notes') || '').trim(),
  }
}

function renderPurchaseOrderForm(view) {
  const form = document.createElement('form')
  form.className = 'data-form'
  form.innerHTML = `
    <div class="section-heading">
      <div>
        <h3>Add Purchase Order</h3>
        <p class="muted">Build the order here, add the cigars inside the order, then save once the subtotal reconciles.</p>
      </div>
    </div>
  `

  const grid = document.createElement('div')
  grid.className = 'form-grid'
  const purchaseDraft = ensurePurchaseDraftOrder()
  ;[
    { name: 'vendorId', label: 'Vendor', type: 'select', collection: 'vendors', optionLabel: 'name' },
    { name: 'purchaseDate', label: 'Purchase Date', type: 'date', required: true },
    { name: 'invoiceNumber', label: 'Invoice / PO Number' },
    { name: 'subtotal', label: 'Subtotal', type: 'number', step: '0.01', required: true },
    { name: 'shipping', label: 'Shipping', type: 'number', step: '0.01' },
    { name: 'exciseTax', label: 'Excise Tax', type: 'number', step: '0.01' },
    { name: 'salesTax', label: 'Sales Tax', type: 'number', step: '0.01' },
    { name: 'discount', label: 'Discount', type: 'number', step: '0.01' },
    { name: 'totalPaid', label: 'Total Paid', type: 'number', step: '0.01' },
  ].forEach((field) => {
    const element = renderField(field, purchaseDraft)
    grid.append(element)
  })

  const totalPaidInput = grid.querySelector('[name="totalPaid"]')
  totalPaidInput.type = 'text'
  totalPaidInput.readOnly = true
  Array.from(grid.querySelectorAll('input, select')).forEach((input) => {
    input.addEventListener('input', () => {
      purchaseDraft[input.name] = input.value
      const totals = purchaseDraftTotals()
      purchaseDraft.totalPaid = totals.totalPaid.toFixed(2)
      totalPaidInput.value = money(purchaseDraft.totalPaid)
    })
    input.addEventListener('change', () => {
      purchaseDraft[input.name] = input.value
      const totals = purchaseDraftTotals()
      purchaseDraft.totalPaid = totals.totalPaid.toFixed(2)
      totalPaidInput.value = money(purchaseDraft.totalPaid)
    })
  })

  const cigarPanel = document.createElement('div')
  cigarPanel.className = 'purchase-builder-panel wide'
  cigarPanel.innerHTML = `
    <div class="section-heading compact-heading">
      <div>
        <h3>Add Cigar</h3>
        <p class="muted">Add each cigar on this order before saving the purchase order.</p>
      </div>
    </div>
  `
  const cigarForm = document.createElement('div')
  cigarForm.className = 'form-grid'

  const cigarField = document.createElement('label')
  cigarField.className = 'form-field wide'
  cigarField.innerHTML = '<span>Catalog Cigar *</span>'
  const cigarRow = document.createElement('div')
  cigarRow.className = 'inline-select-row'
  const draftEntry = ensurePurchaseDraftEntry()
  const cigarSelect = document.createElement('select')
  cigarSelect.append(new Option('Select...', ''))
  records('catalog-cigars')
    .filter(recordIsActive)
    .slice()
    .sort((left, right) => cigarName(left).localeCompare(cigarName(right)))
    .forEach((cigar) => cigarSelect.append(new Option(cigarName(cigar), String(cigar.id))))
  cigarSelect.value = draftEntry.catalogCigarId || ''
  const addCatalogButton = document.createElement('button')
  addCatalogButton.type = 'button'
  addCatalogButton.className = 'secondary-button'
  addCatalogButton.textContent = 'Add New Cigar'
  addCatalogButton.addEventListener('click', () => {
    state.showPurchaseCatalogCreate = !state.showPurchaseCatalogCreate
    render()
  })
  cigarRow.append(cigarSelect, addCatalogButton)
  cigarField.append(cigarRow)

  const qtyField = document.createElement('label')
  qtyField.className = 'form-field'
  qtyField.innerHTML = '<span>Quantity *</span><input name="draftQuantity" type="number" step="1" min="1">'
  qtyField.querySelector('input').value = draftEntry.quantity || ''

  const totalPriceField = document.createElement('label')
  totalPriceField.className = 'form-field'
  totalPriceField.innerHTML = '<span>Total Purchase Price *</span><input name="draftTotalPrice" type="number" step="0.01" min="0">'
  totalPriceField.querySelector('input').value = draftEntry.totalPrice || ''

  const msrpField = document.createElement('label')
  msrpField.className = 'form-field'
  msrpField.innerHTML = '<span>MSRP Per Cigar</span><input name="draftMsrpPerCigar" type="number" step="0.01" min="0">'
  const msrpInput = msrpField.querySelector('input')
  msrpInput.value = draftEntry.msrpPerCigar ?? ''
  cigarSelect.addEventListener('change', () => {
    draftEntry.catalogCigarId = cigarSelect.value
    state.purchaseLineCatalogId = cigarSelect.value ? Number(cigarSelect.value) : null
    const cigar = recordById('catalog-cigars', Number(cigarSelect.value || 0))
    if (cigar && !String(msrpInput.value || '').trim()) {
      msrpInput.value = cigar.msrp ? String(cigar.msrp) : ''
      draftEntry.msrpPerCigar = msrpInput.value
    }
  })
  if (draftEntry.catalogCigarId) {
    const cigar = recordById('catalog-cigars', Number(draftEntry.catalogCigarId))
    if (cigar) {
      msrpInput.value = draftEntry.msrpPerCigar ?? (hasKnownMoney(cigar.msrp) ? String(cigar.msrp) : '')
    }
  }
  qtyField.querySelector('input').addEventListener('input', (event) => { draftEntry.quantity = event.target.value })
  totalPriceField.querySelector('input').addEventListener('input', (event) => { draftEntry.totalPrice = event.target.value })
  msrpInput.addEventListener('input', (event) => { draftEntry.msrpPerCigar = event.target.value })

  const addCigarActions = document.createElement('div')
  addCigarActions.className = 'form-actions'
  const addCigarButton = document.createElement('button')
  addCigarButton.type = 'button'
  addCigarButton.className = 'primary-button'
  addCigarButton.textContent = 'Add Cigar'
  addCigarActions.append(addCigarButton)

  ;[cigarField, qtyField, totalPriceField, msrpField].forEach((field) => cigarForm.append(field))
  cigarPanel.append(cigarForm, addCigarActions)
  renderInlineCatalogCreate(cigarPanel)

  const draftList = document.createElement('div')
  draftList.className = 'purchase-draft-list'
  if (state.purchaseDraftLines.length === 0) {
    const empty = document.createElement('p')
    empty.className = 'muted'
    empty.textContent = 'No cigars added to this purchase order yet.'
    draftList.append(empty)
  } else {
    state.purchaseDraftLines.forEach((line, index) => {
      const row = document.createElement('div')
      row.className = 'purchase-draft-row'
      row.innerHTML = `
        <strong>${escapeHtml(cigarNameById(line.catalogCigarId))}</strong>
        <span>${formatCount(line.quantity)} cigars</span>
        <span>${money(line.totalPrice)}</span>
        <span>${money(line.totalPrice / Math.max(1, line.quantity))} each</span>
      `
      const remove = document.createElement('button')
      remove.type = 'button'
      remove.className = 'danger-button compact-button'
      remove.textContent = 'Remove'
      remove.addEventListener('click', () => {
        state.purchaseDraftLines = state.purchaseDraftLines.filter((_, lineIndex) => lineIndex !== index)
        render()
      })
      row.append(remove)
      draftList.append(row)
    })
  }
  cigarPanel.append(draftList)
  grid.append(cigarPanel)

  function syncDraftTotals() {
    const totals = purchaseDraftTotals()
    purchaseDraft.totalPaid = totals.totalPaid.toFixed(2)
    totalPaidInput.value = money(purchaseDraft.totalPaid)
  }
  syncDraftTotals()

  addCigarButton.addEventListener('click', () => {
    const catalogCigarId = Number(draftEntry.catalogCigarId || 0)
    const quantity = Number(draftEntry.quantity || 0)
    const totalPrice = roundMoney(draftEntry.totalPrice)
    const msrpPerCigar = roundMoney(draftEntry.msrpPerCigar)
    if (catalogCigarId < 1 || quantity < 1 || totalPrice <= 0) {
      state.formError = 'Select a cigar, enter quantity, and enter the total purchase price before adding it to the order.'
      render()
      return
    }
    state.purchaseDraftLines = [
      ...state.purchaseDraftLines,
      { catalogCigarId, quantity, totalPrice, msrpPerCigar: msrpInput.value ? msrpPerCigar : null },
    ]
    state.formError = null
    state.purchaseLineCatalogId = null
    state.purchaseDraftEntry = { catalogCigarId: '', quantity: '', totalPrice: '', msrpPerCigar: '' }
    render()
  })

  const actions = document.createElement('div')
  actions.className = 'form-actions'
  const save = document.createElement('button')
  save.type = 'submit'
  save.className = 'primary-button'
  save.textContent = 'Add Purchase Order'
  const cancel = document.createElement('button')
  cancel.type = 'button'
  cancel.className = 'secondary-button'
  cancel.textContent = 'Cancel'
  cancel.addEventListener('click', () => {
    state.showPurchaseOrderForm = false
    state.formError = null
    render()
  })
  actions.append(save, cancel)

  if (state.formError) {
    const error = document.createElement('p')
    error.className = 'form-error wide'
    error.textContent = state.formError
    actions.append(error)
  }

  form.append(grid, actions)
  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    state.formError = null
    try {
      const totals = purchaseDraftTotals()
      if (state.purchaseDraftLines.length === 0) {
        throw new Error('Add at least one cigar before saving the purchase order.')
      }
      if (Math.abs(totals.lineSubtotal - totals.subtotal) > 0.01) {
        throw new Error('The cigar purchase prices must add up to the purchase subtotal before the order can be saved.')
      }
      const payload = purchaseOrderPayload(form)
      const created = await apiPost('/records/purchases', payload)
      const purchaseId = Number(created.id || created.data?.id || 0)
      for (const line of state.purchaseDraftLines) {
        await apiPost('/records/purchase-lines', {
          purchaseId: String(purchaseId),
          catalogCigarId: String(line.catalogCigarId),
          quantity: String(line.quantity),
          purchasePrice: String(line.totalPrice),
          unitCost: String(roundMoney(line.totalPrice / Math.max(1, line.quantity))),
          msrpPerCigar: line.msrpPerCigar === null ? '' : String(line.msrpPerCigar),
          storageLocationId: '',
          storageSubLocationId: '',
          notes: '',
        })
      }
      state.selectedPurchaseId = purchaseId || state.selectedPurchaseId
      state.purchaseDraftLines = []
      state.purchaseLineCatalogId = null
      state.purchaseDraftOrder = null
      state.purchaseDraftEntry = null
      state.showPurchaseCatalogCreate = false
      state.showPurchaseOrderForm = false
      await refreshCollections(['purchases', 'purchase-lines', 'lots', 'lot-location-balances', 'inventory-events'])
    } catch (error) {
      state.formError = error.message
    }
    render()
  })

  view.append(form)
}

function renderPurchaseRecordInlineEdit(container, purchase) {
  const panel = document.createElement('section')
  panel.className = 'dashboard-panel compact-top-gap'
  panel.innerHTML = `
    <div class="section-heading">
      <div>
        <h3>Receive and Store Cigars</h3>
        <p class="muted">Record each shipment quantity and its storage location. Purchase status updates automatically.</p>
      </div>
    </div>
  `
  const lines = records('purchase-lines')
    .filter((line) => Number(line.purchaseId) === Number(purchase.id))
  const incompleteLines = lines.filter((line) => remainingQuantityForPurchaseLine(line) > 0)

  if (lines.length === 0) {
    const empty = document.createElement('p')
    empty.className = 'muted'
    empty.textContent = 'Add at least one purchased cigar before receiving this order.'
    panel.append(empty)
  } else if (incompleteLines.length === 0) {
    const complete = document.createElement('p')
    complete.className = 'muted'
    complete.textContent = 'Every purchase line is fully received.'
    panel.append(complete)
  }

  incompleteLines.forEach((line) => {
    const remaining = remainingQuantityForPurchaseLine(line)
    const received = receivedQuantityForPurchaseLine(line)
    const form = document.createElement('form')
    form.className = 'inline-assignment-form'
    form.innerHTML = `
      <strong>${escapeHtml(cigarNameById(line.catalogCigarId))}</strong>
      <span class="muted">${formatCount(received)} of ${formatCount(line.quantity)} received</span>
    `

    const quantityInput = document.createElement('input')
    quantityInput.name = 'quantity'
    quantityInput.type = 'number'
    quantityInput.min = '1'
    quantityInput.max = String(remaining)
    quantityInput.step = '1'
    quantityInput.required = true
    quantityInput.value = String(remaining)
    quantityInput.setAttribute('aria-label', `Quantity received for ${cigarNameById(line.catalogCigarId)}`)

    const dateInput = document.createElement('input')
    dateInput.name = 'receivedDate'
    dateInput.type = 'date'
    dateInput.required = true
    dateInput.value = todayIsoDate()
    dateInput.setAttribute('aria-label', `Received date for ${cigarNameById(line.catalogCigarId)}`)

    const humidorSelect = document.createElement('select')
    humidorSelect.name = 'storageLocationId'
    humidorSelect.required = true
    humidorSelect.append(new Option('Select humidor...', ''))
    records('storage-locations').filter(recordIsActive).forEach((humidor) => {
      humidorSelect.append(new Option(humidor.name || `Humidor ${humidor.id}`, String(humidor.id)))
    })

    const sectionSelect = document.createElement('select')
    sectionSelect.name = 'storageSubLocationId'
    function fillSections() {
      sectionSelect.replaceChildren(new Option('General', ''))
      records('storage-sub-locations')
        .filter((section) => recordIsActive(section) && Number(section.storageLocationId) === Number(humidorSelect.value || 0))
        .forEach((section) => sectionSelect.append(new Option(sectionName(section), String(section.id))))
    }
    humidorSelect.addEventListener('change', fillSections)
    fillSections()

    const save = document.createElement('button')
    save.type = 'submit'
    save.className = 'primary-button compact-button'
    save.textContent = remaining === numericValue(line.quantity) ? 'Receive and Store' : 'Receive Remaining'

    form.append(quantityInput, dateInput, humidorSelect, sectionSelect, save)
    form.addEventListener('submit', async (event) => {
      event.preventDefault()
      try {
        await apiPost(`/purchase-lines/${line.id}/receive`, {
          quantity: String(quantityInput.value || '').trim(),
          receivedDate: String(dateInput.value || '').trim(),
          storageLocationId: String(humidorSelect.value || '').trim(),
          storageSubLocationId: String(sectionSelect.value || '').trim(),
          idempotencyKey: receiptKeyForPurchaseLine(line.id),
          notes: '',
        })
        delete state.receiptKeys[String(line.id)]
        await refreshCollections(['purchases', 'purchase-lines', 'lots', 'lot-location-balances', 'inventory-events'])
        const latestPurchase = recordById('purchases', purchase.id)
        state.editing.purchases = latestPurchase && purchaseAcceptsReceipts(latestPurchase) ? latestPurchase : null
      } catch (error) {
        state.formError = error.message
      }
      render()
    })
    panel.append(form)
  })

  const cancel = document.createElement('button')
  cancel.type = 'button'
  cancel.className = 'secondary-button compact-button compact-top-gap'
  cancel.textContent = 'Close Receiving'
  cancel.addEventListener('click', () => {
    state.editing.purchases = null
    state.formError = null
    render()
  })
  panel.append(cancel)
  container.append(panel)
}

function renderInlineCatalogCreate(container) {
  if (!state.showPurchaseCatalogCreate) {
    return
  }
  const panel = document.createElement('div')
  panel.className = 'collection-expanded-card compact-top-gap'
  const form = document.createElement('form')
  form.className = 'data-form'
  form.innerHTML = `
    <div class="section-heading">
      <div>
        <h3>Add New Catalog Cigar</h3>
        <p class="muted">Create the cigar here, then continue adding it to the purchase order.</p>
      </div>
    </div>
  `
  const grid = document.createElement('div')
  grid.className = 'form-grid'
  managedPages.Catalog.fields.forEach((field) => grid.append(renderField(field, null)))
  const actions = document.createElement('div')
  actions.className = 'form-actions'
  const save = document.createElement('button')
  save.type = 'submit'
  save.className = 'primary-button'
  save.textContent = 'Add Catalog Cigar'
  const cancel = document.createElement('button')
  cancel.type = 'button'
  cancel.className = 'secondary-button'
  cancel.textContent = 'Cancel'
  cancel.addEventListener('click', () => {
    state.showPurchaseCatalogCreate = false
    render()
  })
  actions.append(save, cancel)
  form.append(grid, actions)
  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    try {
      const payload = formPayload(form, managedPages.Catalog.fields)
      const created = await apiPost('/records/catalog-cigars', payload)
      await refreshCollections(['catalog-cigars'])
      state.purchaseLineCatalogId = Number(created.id || created.data?.id || 0) || null
      state.showPurchaseCatalogCreate = false
    } catch (error) {
      state.formError = error.message
    }
    render()
  })
  panel.append(form)
  container.append(panel)
}

function renderPurchaseLineForm(container, purchase) {
  const editingLine = state.editingPurchaseLineId ? recordById('purchase-lines', state.editingPurchaseLineId) : null
  const isReceived = purchaseIsReceived(purchase)
  const form = document.createElement('form')
  form.className = 'data-form compact-top-gap'
  form.innerHTML = `
    <div class="section-heading">
      <div>
        <h3>${editingLine ? 'Edit Purchased Cigar' : 'Add Purchased Cigar'}</h3>
        <p class="muted">Add cigars to this order. Location assignment happens after the order is marked received.</p>
      </div>
    </div>
  `

  const grid = document.createElement('div')
  grid.className = 'form-grid'

  const cigarField = document.createElement('label')
  cigarField.className = 'form-field wide'
  cigarField.innerHTML = '<span>Catalog Cigar *</span>'
  const cigarRow = document.createElement('div')
  cigarRow.className = 'inline-select-row'
  const cigarSelect = document.createElement('select')
  cigarSelect.name = 'catalogCigarId'
  cigarSelect.required = true
  cigarSelect.append(new Option('Select...', ''))
  records('catalog-cigars')
    .filter((cigar) => recordIsActive(cigar) || Number(cigar.id) === Number(editingLine?.catalogCigarId || 0))
    .forEach((cigar) => cigarSelect.append(new Option(cigarName(cigar), String(cigar.id))))
  cigarSelect.value = editingLine ? String(editingLine.catalogCigarId || '') : (state.purchaseLineCatalogId ? String(state.purchaseLineCatalogId) : '')
  const addCatalogButton = document.createElement('button')
  addCatalogButton.type = 'button'
  addCatalogButton.className = 'secondary-button'
  addCatalogButton.textContent = 'Add New Cigar'
  addCatalogButton.addEventListener('click', () => {
    state.showPurchaseCatalogCreate = !state.showPurchaseCatalogCreate
    render()
  })
  cigarRow.append(cigarSelect, addCatalogButton)
  cigarField.append(cigarRow)

  const quantityField = document.createElement('label')
  quantityField.className = 'form-field'
  quantityField.innerHTML = '<span>Quantity *</span><input name="quantity" type="number" step="1" required>'
  quantityField.querySelector('input').value = editingLine ? String(editingLine.quantity || '') : ''

  const costField = document.createElement('label')
  costField.className = 'form-field'
  costField.innerHTML = '<span>Unit Cost *</span><input name="unitCost" type="number" step="0.01" required>'
  costField.querySelector('input').value = editingLine ? String(editingLine.unitCost || '') : ''

  const msrpField = document.createElement('label')
  msrpField.className = 'form-field'
  msrpField.innerHTML = '<span>MSRP Per Cigar</span><input name="msrpPerCigar" type="number" step="0.01">'
  const msrpInput = msrpField.querySelector('input')
  msrpInput.value = editingLine ? String(editingLine.msrpPerCigar ?? '') : ''

  const notesField = document.createElement('label')
  notesField.className = 'form-field wide'
  notesField.innerHTML = '<span>Notes</span><textarea name="notes" rows="3"></textarea>'
  notesField.querySelector('textarea').value = editingLine ? String(editingLine.notes || '') : ''

  function syncMsrpFromCatalog(force = false) {
    const cigar = recordById('catalog-cigars', Number(cigarSelect.value || 0))
    if (!cigar) {
      return
    }
    if (force || !String(msrpInput.value || '').trim()) {
      msrpInput.value = cigar.msrp ? String(cigar.msrp) : ''
    }
  }
  cigarSelect.addEventListener('change', () => {
    state.purchaseLineCatalogId = cigarSelect.value ? Number(cigarSelect.value) : null
    syncMsrpFromCatalog(!editingLine)
  })
  if (!editingLine) {
    syncMsrpFromCatalog(true)
  }

  ;[cigarField, quantityField, costField, msrpField, notesField].forEach((field) => grid.append(field))

  const actions = document.createElement('div')
  actions.className = 'form-actions'
  const save = document.createElement('button')
  save.type = 'submit'
  save.className = 'primary-button'
  save.textContent = editingLine ? 'Save Purchased Cigar' : 'Add Purchased Cigar'
  actions.append(save)

  if (editingLine) {
    const cancel = document.createElement('button')
    cancel.type = 'button'
    cancel.className = 'secondary-button'
    cancel.textContent = 'Cancel Edit'
    cancel.addEventListener('click', () => {
      state.editingPurchaseLineId = null
      render()
    })
    actions.append(cancel)
  }

  if (isReceived) {
    const locked = document.createElement('p')
    locked.className = 'muted'
    locked.textContent = 'This order is marked received. Add or edit line details only if you are correcting the original order.'
    actions.append(locked)
  }

  form.append(grid, actions)
  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    try {
      const payload = purchaseLineFormPayload(form, purchase.id)
      if (editingLine) {
        await apiPut(`/records/purchase-lines/${editingLine.id}`, payload)
      } else {
        await apiPost('/records/purchase-lines', payload)
      }
      state.editingPurchaseLineId = null
      state.purchaseLineCatalogId = null
      await refreshCollections(['purchase-lines', 'lots', 'lot-location-balances', 'inventory-events'])
    } catch (error) {
      state.formError = error.message
    }
    render()
  })

  container.append(form)
  renderInlineCatalogCreate(container)
}

function renderPurchaseLinesPanel(view) {
  const purchases = sortPurchasesNewest(records('purchases'))
  const panel = document.createElement('section')
  panel.className = 'dashboard-panel'

  if (!state.selectedPurchaseId && purchases[0]) {
    state.selectedPurchaseId = Number(purchases[0].id)
  }

  const purchase = recordById('purchases', state.selectedPurchaseId)
  const header = document.createElement('div')
  header.className = 'section-heading'
  header.innerHTML = `
    <div>
      <h3>Purchased Cigars</h3>
      <p class="muted">Review ordered quantities and receive each shipment directly into its storage location.</p>
    </div>
  `
  const purchaseSelect = document.createElement('select')
  purchaseSelect.append(new Option('Select purchase order...', ''))
  purchases.forEach((item) => purchaseSelect.append(new Option(purchaseLabel(item), String(item.id))))
  purchaseSelect.value = String(state.selectedPurchaseId || '')
  purchaseSelect.addEventListener('change', () => {
    state.selectedPurchaseId = Number(purchaseSelect.value || 0)
    state.editingPurchaseLineId = null
    state.showPurchaseCatalogCreate = false
    render()
  })
  header.append(purchaseSelect)
  panel.append(header)

  if (!purchase) {
    const empty = document.createElement('p')
    empty.className = 'muted'
    empty.textContent = 'Create a purchase order first, then add the cigars that belong to it.'
    panel.append(empty)
    view.append(panel)
    return
  }

  const lines = records('purchase-lines').filter((line) => Number(line.purchaseId) === Number(purchase.id))
  const trueCostBasis = sumMoneyValues(lines.map((line) => line.trueCostBasis))
  const summary = document.createElement('div')
  summary.className = 'metric-grid compact'
  summary.append(
    metricCard('Status', purchaseStatusLabel(purchase.status), `${lines.length} linked line items`),
    metricCard('Qty Purchased', lines.reduce((sum, line) => sum + numericValue(line.quantity), 0), 'Cigars on this purchase'),
    metricCard('True Cost Basis', trueCostBasis, 'Allocated line cost basis', true),
  )
  panel.append(summary)

  const tableWrap = document.createElement('div')
  tableWrap.className = 'table-scroll compact-top-gap'
  const table = document.createElement('table')
  table.className = 'data-table'
  table.innerHTML = `
    <thead>
      <tr>
        <th>Cigar</th>
        <th>Location</th>
        <th>Qty</th>
        <th>Purchase Price</th>
        <th>Tracked MSRP</th>
        <th>True Cost / Cigar</th>
        <th>Line Basis</th>
        <th>Actions</th>
      </tr>
    </thead>
    <tbody></tbody>
  `
  const tbody = table.querySelector('tbody')
  lines.forEach((line) => {
    const row = document.createElement('tr')
    const locationLabel = purchaseLineLocationLabel(line)
    const receivedQuantity = receivedQuantityForPurchaseLine(line)
    row.innerHTML = `
      <td>${escapeHtml(cigarNameById(line.catalogCigarId))}</td>
      <td>${escapeHtml(locationLabel)}</td>
      <td>${formatCount(line.quantity)} ordered / ${formatCount(receivedQuantity)} received</td>
      <td>${escapeHtml(money(line.purchasePrice ?? line.lineSubtotal))}</td>
      <td>${escapeHtml(money(line.msrpPerCigar ?? line.msrpPerCigarResolved))}</td>
      <td>${escapeHtml(money(purchaseLineTrueCostPerCigar(line)))}</td>
      <td>${escapeHtml(money(line.trueCostBasis))}</td>
      <td class="row-actions"></td>
    `
    const actions = row.querySelector('.row-actions')
    const remove = document.createElement('button')
    remove.type = 'button'
    remove.className = 'danger-button compact-button'
    remove.textContent = 'Delete'
    remove.disabled = normalizePurchaseStatus(purchase?.status) !== 'pending' || purchaseLineHasInventoryHistory(line.id)
    if (remove.disabled) {
      remove.title = 'Historical purchase lines cannot be deleted. Reverse an incorrect event and enter a corrected receipt.'
    }
    remove.addEventListener('click', async () => {
      if (!confirm('Delete this purchase line?')) {
        return
      }
      try {
        await apiDelete(`/records/purchase-lines/${line.id}`)
        await refreshCollections(['purchase-lines', 'lots', 'lot-location-balances', 'inventory-events'])
      } catch (error) {
        state.formError = error.message
      }
      render()
    })
    actions.append(remove)
    tbody.append(row)
  })
  tableWrap.append(table)
  panel.append(tableWrap)

  view.append(panel)
}

function renderPurchaseOverview(view) {
  const purchases = purchaseRecordsForDisplay()
  const lines = records('purchase-lines').filter((line) => purchases.some((purchase) => Number(purchase.id) === Number(line.purchaseId)))
  const totalPaid = sumMoneyValues(purchases.map((purchase) => purchase.totalPaid))
  const totalPurchased = lines.reduce((sum, line) => sum + numericValue(line.quantity), 0)

  const hero = document.querySelector('.hero-panel')
  const subtitle = document.querySelector('#page-subtitle')
  const pageActions = document.querySelector('#page-actions')
  hero.classList.add('purchase-hero')
  const purchaseFilterLabelText = purchaseRecordsFilterLabel()
  subtitle.textContent = purchaseFilterLabelText
    ? `Filtered to ${purchaseFilterLabelText}. Track vendor history, purchase costs, and line-level receiving.`
    : 'Track vendor history, purchase costs, and line-level receiving.'
  subtitle.hidden = false
  const addPurchase = document.createElement('button')
  addPurchase.type = 'button'
  addPurchase.className = 'primary-button purchase-add-button'
  addPurchase.textContent = state.showPurchaseOrderForm ? 'Close Purchase' : '+ Add Purchase'
  addPurchase.addEventListener('click', () => {
    state.showPurchaseOrderForm = !state.showPurchaseOrderForm
    state.formError = null
    render()
  })
  pageActions.append(addPurchase)
  if (purchaseFilterLabelText) {
    const clearFilter = document.createElement('button')
    clearFilter.type = 'button'
    clearFilter.className = 'secondary-button purchase-add-button'
    clearFilter.textContent = 'Clear Filter'
    clearFilter.addEventListener('click', () => {
      clearPurchaseRecordsFilter()
    })
    pageActions.append(clearFilter)
  }

  const summary = document.createElement('div')
  summary.className = 'metric-grid purchase-summary-grid'
  summary.append(
    metricCard('Total Purchases', purchases.length, ''),
    metricCard('Total Cigars Purchased', totalPurchased, ''),
    metricCard('Total Paid', totalPaid, '', true),
    metricCard('En Route Cigars', enRoutePurchaseQuantity(), ''),
  )
  view.append(summary)
}

function renderPurchaseLineDetails(container, purchase) {
  const lines = records('purchase-lines').filter((line) => Number(line.purchaseId) === Number(purchase.id))
  if (lines.length === 0) {
    const empty = document.createElement('p')
    empty.className = 'muted'
    empty.textContent = 'No cigars are linked to this purchase order.'
    container.append(empty)
    return
  }

  const tableWrap = document.createElement('div')
  tableWrap.className = 'table-scroll'
  const table = document.createElement('table')
  table.className = 'data-table purchase-lines-table'
  table.innerHTML = `
    <thead>
      <tr>
        <th>Cigar</th>
        <th>Location</th>
        <th>Qty</th>
        <th>Purchase Price</th>
        <th>Tracked MSRP</th>
        <th>True Cost / Cigar</th>
        <th>Line Basis</th>
      </tr>
    </thead>
    <tbody></tbody>
  `
  const tbody = table.querySelector('tbody')
  lines.forEach((line) => {
    const locationLabel = purchaseLineLocationLabel(line)
    const receivedQuantity = receivedQuantityForPurchaseLine(line)
    const row = document.createElement('tr')
    row.innerHTML = `
      <td>${escapeHtml(cigarNameById(line.catalogCigarId))}</td>
      <td>${escapeHtml(locationLabel)}</td>
      <td>${formatCount(line.quantity)} ordered / ${formatCount(receivedQuantity)} received</td>
      <td>${escapeHtml(money(line.purchasePrice ?? line.lineSubtotal))}</td>
      <td>${escapeHtml(money(line.msrpPerCigar ?? line.msrpPerCigarResolved))}</td>
      <td>${escapeHtml(money(purchaseLineTrueCostPerCigar(line)))}</td>
      <td>${escapeHtml(money(line.trueCostBasis))}</td>
    `
    tbody.append(row)
  })
  tableWrap.append(table)
  container.append(tableWrap)
}

function renderPurchaseRecords(view) {
  const purchases = purchaseRecordsForDisplay()
  const heading = document.createElement('div')
  heading.className = 'section-heading purchase-records-heading'
  heading.innerHTML = `
    <div>
      <h3>Purchase Records</h3>
      <p class="muted">${purchaseRecordsFilterLabel() ? `Showing purchases filtered to ${escapeHtml(purchaseRecordsFilterLabel())}.` : 'Select a purchase order to view its cigars and record full or partial receipts.'}</p>
    </div>
  `
  view.append(heading)

  if (purchases.length === 0) {
    const empty = document.createElement('div')
    empty.className = 'empty-state'
    empty.innerHTML = purchaseRecordsFilterLabel()
      ? '<p>No purchase records match the current filter.</p>'
      : '<p>No purchase records yet.</p>'
    view.append(empty)
    return
  }

  ensureSelectedPurchaseVisible(purchases)

  const tableWrap = document.createElement('div')
  tableWrap.className = 'table-scroll'
  const table = document.createElement('table')
  table.className = 'data-table managed-table purchase-records-table'
  table.innerHTML = `
    <thead>
      <tr>
        ${managedPages.Purchases.columns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join('')}
        <th>Actions</th>
      </tr>
    </thead>
    <tbody></tbody>
  `
  const tbody = table.querySelector('tbody')
  purchases.forEach((purchase) => {
    const isExpanded = Number(state.selectedPurchaseId || 0) === Number(purchase.id)
    const isEditing = Number(state.editing.purchases?.id || 0) === Number(purchase.id)
    const row = document.createElement('tr')
    row.className = isExpanded ? 'clickable-record-row selected-row' : 'clickable-record-row'
    row.tabIndex = 0
    row.setAttribute('aria-expanded', String(isExpanded))
    managedPages.Purchases.columns.forEach((column, columnIndex) => {
      const cell = document.createElement('td')
      cell.textContent = column.value(purchase)
      if (columnIndex === 0) {
        const mobileSummary = document.createElement('small')
        mobileSummary.className = 'mobile-record-summary'
        mobileSummary.textContent = `${vendorName(purchase.vendorId)} • ${money(purchase.totalPaid)}`
        cell.append(mobileSummary)
      }
      row.append(cell)
    })
    const actions = document.createElement('td')
    actions.className = 'row-actions'
    const viewButton = document.createElement('button')
    viewButton.type = 'button'
    viewButton.className = 'secondary-button compact-button'
    viewButton.textContent = isExpanded ? 'Close' : 'View'
    viewButton.addEventListener('click', (event) => {
      event.stopPropagation()
      state.selectedPurchaseId = isExpanded ? null : Number(purchase.id)
      state.editing.purchases = null
      render()
    })
    actions.append(viewButton)
    if (purchaseAcceptsReceipts(purchase)) {
      const edit = document.createElement('button')
      edit.type = 'button'
      edit.className = 'primary-button compact-button'
      edit.textContent = 'Receive'
      edit.addEventListener('click', (event) => {
        event.stopPropagation()
        state.selectedPurchaseId = Number(purchase.id)
        state.editing.purchases = purchase
        state.formError = null
        render()
      })
      actions.append(edit)
    }
    row.append(actions)
    const toggleExpanded = () => {
      state.selectedPurchaseId = isExpanded ? null : Number(purchase.id)
      state.editing.purchases = null
      render()
    }
    row.addEventListener('click', toggleExpanded)
    row.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        toggleExpanded()
      }
    })
    tbody.append(row)

    if (isExpanded) {
      const detailRow = document.createElement('tr')
      detailRow.className = 'collection-expanded-row'
      const detailCell = document.createElement('td')
      detailCell.colSpan = managedPages.Purchases.columns.length + 1
      const detail = document.createElement('div')
      detail.className = 'collection-expanded-card purchase-record-detail'
      const detailHeading = document.createElement('div')
      detailHeading.className = 'section-heading compact-heading'
      detailHeading.innerHTML = `
        <div>
          <h3>Purchased Cigars</h3>
          <p class="muted">${formatCount(purchasedQuantityForPurchase(purchase.id))} cigars on ${escapeHtml(purchaseLabel(purchase))}.</p>
        </div>
      `
      if (isEditing) {
        renderPurchaseRecordInlineEdit(detail, purchase)
      }
      detail.append(detailHeading)
      renderPurchaseLineDetails(detail, purchase)
      detailCell.append(detail)
      detailRow.append(detailCell)
      tbody.append(detailRow)
    }
  })
  tableWrap.append(table)
  view.append(tableWrap)
}

function renderPurchasesPage(view) {
  renderPurchaseOverview(view)
  if (state.showPurchaseOrderForm) {
    renderPurchaseOrderForm(view)
  }
  renderPurchaseRecords(view)
}

function humidorSectionPayload(form, humidorId) {
  const data = new FormData(form)
  return {
    storageLocationId: String(humidorId),
    name: String(data.get('name') || '').trim(),
    type: String(data.get('type') || '').trim(),
    capacity: String(data.get('capacity') || '').trim(),
    notes: String(data.get('notes') || '').trim(),
  }
}

function renderHumidorSectionForm(container, humidorId) {
  const editingSection = state.editingHumidorSectionId ? recordById('storage-sub-locations', state.editingHumidorSectionId) : null
  const form = document.createElement('form')
  form.className = 'data-form compact-top-gap'
  form.innerHTML = `
    <div class="section-heading">
      <div>
        <h3>${editingSection ? 'Edit Drawer / Section' : 'Add Drawer / Section'}</h3>
        <p class="muted">Create drawers now so inventory can be assigned to specific humidors and drawers later.</p>
      </div>
    </div>
  `

  const grid = document.createElement('div')
  grid.className = 'form-grid'
  const fields = [
    { name: 'name', label: 'Name', type: 'text', value: editingSection?.name || '', required: true },
    { name: 'type', label: 'Type', type: 'text', value: editingSection?.type || '' },
    { name: 'capacity', label: 'Capacity', type: 'number', value: editingSection?.capacity || '', step: '1' },
    { name: 'notes', label: 'Notes', type: 'textarea', value: editingSection?.notes || '', wide: true },
  ]
  fields.forEach((field) => {
    const label = document.createElement('label')
    label.className = field.wide ? 'form-field wide' : 'form-field'
    label.innerHTML = `<span>${escapeHtml(field.required ? `${field.label} *` : field.label)}</span>`
    if (field.type === 'textarea') {
      const textarea = document.createElement('textarea')
      textarea.name = field.name
      textarea.rows = 3
      textarea.value = String(field.value)
      label.append(textarea)
    } else {
      const input = document.createElement('input')
      input.name = field.name
      input.type = field.type
      input.value = String(field.value)
      if (field.required) {
        input.required = true
      }
      if (field.step) {
        input.step = field.step
      }
      label.append(input)
    }
    grid.append(label)
  })

  const actions = document.createElement('div')
  actions.className = 'form-actions'
  const save = document.createElement('button')
  save.type = 'submit'
  save.className = 'primary-button'
  save.textContent = editingSection ? 'Save Drawer / Section' : 'Add Drawer / Section'
  actions.append(save)

  if (editingSection) {
    const cancel = document.createElement('button')
    cancel.type = 'button'
    cancel.className = 'secondary-button'
    cancel.textContent = 'Cancel Edit'
    cancel.addEventListener('click', () => {
      state.editingHumidorSectionId = null
      render()
    })
    actions.append(cancel)
  }

  form.append(grid, actions)
  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    try {
      const payload = humidorSectionPayload(form, humidorId)
      if (editingSection) {
        await apiPut(`/records/storage-sub-locations/${editingSection.id}`, payload)
      } else {
        await apiPost('/records/storage-sub-locations', payload)
      }
      state.editingHumidorSectionId = null
      await refreshCollections(['storage-sub-locations'])
    } catch (error) {
      state.formError = error.message
    }
    render()
  })

  container.append(form)
}

function renderHumidorSectionsPanel(view) {
  const humidors = records('storage-locations').filter(recordIsActive)
  const showArchivedSections = state.showArchivedRecords['storage-sub-locations'] === true
  const panel = document.createElement('section')
  panel.className = 'dashboard-panel'

  if (!state.selectedHumidorId && humidors[0]) {
    state.selectedHumidorId = Number(humidors[0].id)
  }

  const header = document.createElement('div')
  header.className = 'section-heading'
  header.innerHTML = `
    <div>
      <h3>Drawers And Sections</h3>
      <p class="muted">Assign a humidor-specific drawer, shelf, tray, or general section.</p>
    </div>
  `
  const humidorSelect = document.createElement('select')
  humidors.forEach((humidor) => humidorSelect.append(new Option(humidor.name || `Humidor ${humidor.id}`, String(humidor.id))))
  humidorSelect.value = String(state.selectedHumidorId || '')
  humidorSelect.addEventListener('change', () => {
    state.selectedHumidorId = Number(humidorSelect.value || 0)
    state.editingHumidorSectionId = null
    render()
  })
  const toggleArchived = document.createElement('button')
  toggleArchived.type = 'button'
  toggleArchived.className = 'secondary-button'
  toggleArchived.textContent = showArchivedSections ? 'Hide Archived Sections' : 'Show Archived Sections'
  toggleArchived.addEventListener('click', () => {
    state.showArchivedRecords['storage-sub-locations'] = !showArchivedSections
    state.editingHumidorSectionId = null
    render()
  })
  header.append(humidorSelect, toggleArchived)
  panel.append(header)

  if (!state.selectedHumidorId) {
    panel.append(document.createTextNode('Create a humidor first.'))
    view.append(panel)
    return
  }

  const sections = records('storage-sub-locations').filter((row) => (
    (showArchivedSections || recordIsActive(row))
    && Number(row.storageLocationId) === Number(state.selectedHumidorId)
  ))
  const table = document.createElement('table')
  table.className = 'data-table'
  table.innerHTML = `
    <thead>
      <tr>
        <th>Section</th>
        <th>Type</th>
        <th>Current Count</th>
        <th>Capacity</th>
        <th>Actions</th>
      </tr>
    </thead>
    <tbody></tbody>
  `
  const tbody = table.querySelector('tbody')
  sections.forEach((section) => {
    const count = positiveBalances()
      .filter((entry) => Number(entry.section?.id || 0) === Number(section.id))
      .reduce((sum, entry) => sum + entry.quantity, 0)
    const row = document.createElement('tr')
    row.innerHTML = `
      <td>${escapeHtml(sectionName(section))}${recordIsActive(section) ? '' : ' — Archived'}</td>
      <td>${escapeHtml(section.type || '')}</td>
      <td>${formatCount(count)}</td>
      <td>${escapeHtml(String(section.capacity || ''))}</td>
      <td class="row-actions"></td>
    `
    const actions = row.querySelector('.row-actions')
    const edit = document.createElement('button')
    edit.type = 'button'
    edit.className = 'secondary-button compact-button'
    edit.textContent = 'Edit'
    edit.addEventListener('click', () => {
      state.editingHumidorSectionId = Number(section.id)
      render()
    })
    const remove = document.createElement('button')
    remove.type = 'button'
    remove.className = 'danger-button compact-button'
    remove.textContent = 'Delete'
    remove.addEventListener('click', async () => {
      if (!confirm('Delete this drawer / section?')) {
        return
      }
      try {
        await apiDelete(`/records/storage-sub-locations/${section.id}`)
        await refreshCollections(['storage-sub-locations'])
      } catch (error) {
        state.formError = error.message
      }
      render()
    })
    if (recordIsActive(section)) {
      const archive = document.createElement('button')
      archive.type = 'button'
      archive.className = 'secondary-button compact-button'
      archive.textContent = 'Archive'
      if (count > 0) {
        archive.disabled = true
        archive.title = `Move all ${formatCount(count)} assigned cigars before archiving this section.`
      }
      archive.addEventListener('click', async () => {
        if (!confirm('Archive this drawer / section?')) {
          return
        }
        try {
          await apiPatch(`/records/storage-sub-locations/${section.id}/archive`)
          state.editingHumidorSectionId = null
          await refreshCollections(['storage-sub-locations'])
        } catch (error) {
          state.formError = error.message
        }
        render()
      })
      actions.append(edit, archive)
    } else {
      const restore = document.createElement('button')
      restore.type = 'button'
      restore.className = 'secondary-button compact-button'
      restore.textContent = 'Restore'
      restore.addEventListener('click', async () => {
        try {
          await apiPatch(`/records/storage-sub-locations/${section.id}/restore`)
          await refreshCollections(['storage-sub-locations'])
        } catch (error) {
          state.formError = error.message
        }
        render()
      })
      actions.append(restore, remove)
    }
    tbody.append(row)
  })

  panel.append(table)
  renderHumidorSectionForm(panel, state.selectedHumidorId)
  view.append(panel)
}

function renderHumidorsPage(view) {
  renderManagedTable(view, managedPages.Humidors)
  if (!state.editing['storage-locations']) {
    view.append(renderManagedForm(view, managedPages.Humidors))
  }
  renderHumidorSectionsPanel(view)
}

function removalEventDate(event) {
  return displayDate(event.eventDate || event.occurredAt || event.updatedAt)
}

function removalEventDetails(event) {
  const lot = recordById('lots', event.lotId)
  const cigar = lot?.catalogCigarId
    ? recordById('catalog-cigars', lot.catalogCigarId)
    : recordById('catalog-cigars', event.catalogCigarId)
  const sourceLocationId = event.fromStorageLocationId ?? event.storageLocationId
  const sourceSectionId = event.fromStorageSubLocationId ?? event.storageSubLocationId
  const location = humidorName(sourceLocationId)
  const section = sourceSectionId
    ? sectionName(recordById('storage-sub-locations', sourceSectionId))
    : ''
  return {
    cigar,
    cigarLabel: cigar ? cigarName(cigar) : '',
    locationLabel: [location, section].filter(Boolean).join(' / '),
    lotLabel: event.lotId ? `Lot ${event.lotId}` : '',
  }
}

function filteredRemovalEvents() {
  const currentYear = new Date().getFullYear()
  const search = String(state.reportSearch || '').trim().toLowerCase()
  return effectiveInventoryEvents()
    .filter((event) => ['SMOKED', 'GIFTED', 'DISCARDED'].includes(normalizeEventType(event.eventType)))
    .filter((event) => {
      const eventType = normalizeEventType(event.eventType)
      return state.reportRemovalType === 'all' || eventType === state.reportRemovalType
    })
    .filter((event) => {
      const date = removalEventDate(event)
      const year = Number(date.slice(0, 4) || 0)
      if (state.reportPeriod === 'current') {
        return year === currentYear
      }
      if (state.reportPeriod === 'prior') {
        return year === currentYear - 1
      }
      if (state.reportPeriod === 'custom') {
        const afterStart = !state.reportCustomStart || date >= state.reportCustomStart
        const beforeEnd = !state.reportCustomEnd || date <= state.reportCustomEnd
        return afterStart && beforeEnd
      }
      return true
    })
    .filter((event) => {
      if (!search) {
        return true
      }
      const details = removalEventDetails(event)
      const journal = smokingJournalEntryForEvent(event.id)
      return [details.cigarLabel, details.locationLabel, details.lotLabel, event.notes, journal?.notes, journal?.rating]
        .some((value) => String(value || '').toLowerCase().includes(search))
    })
    .sort((left, right) => removalEventDate(right).localeCompare(removalEventDate(left)) || Number(right.id || 0) - Number(left.id || 0))
}

function removalReportMetrics(events) {
  const quantity = events.reduce((sum, event) => sum + numericValue(event.quantity), 0)
  const knownCostEvents = events.filter((event) => hasKnownMoney(event.costPerCigarAtEvent))
  const knownMsrpEvents = events.filter((event) => hasKnownMoney(event.msrpPerCigarAtEvent))
  const knownCostQuantity = knownCostEvents.reduce((sum, event) => sum + numericValue(event.quantity), 0)
  const knownMsrpQuantity = knownMsrpEvents.reduce((sum, event) => sum + numericValue(event.quantity), 0)
  const knownCostTotal = knownCostEvents.reduce((sum, event) => sum + numericValue(event.quantity) * Number(event.costPerCigarAtEvent), 0)
  const knownMsrpTotal = knownMsrpEvents.reduce((sum, event) => sum + numericValue(event.quantity) * Number(event.msrpPerCigarAtEvent), 0)
  const costComplete = knownCostQuantity === quantity
  const msrpComplete = knownMsrpQuantity === quantity
  return {
    quantity,
    smoked: events.filter((event) => normalizeEventType(event.eventType) === 'SMOKED').reduce((sum, event) => sum + numericValue(event.quantity), 0),
    gifted: events.filter((event) => normalizeEventType(event.eventType) === 'GIFTED').reduce((sum, event) => sum + numericValue(event.quantity), 0),
    discarded: events.filter((event) => normalizeEventType(event.eventType) === 'DISCARDED').reduce((sum, event) => sum + numericValue(event.quantity), 0),
    totalCost: costComplete ? knownCostTotal : null,
    totalMsrp: msrpComplete ? knownMsrpTotal : null,
    totalSavings: costComplete && msrpComplete ? knownMsrpTotal - knownCostTotal : null,
    averageCost: costComplete && quantity > 0 ? knownCostTotal / quantity : null,
    averageMsrp: msrpComplete && quantity > 0 ? knownMsrpTotal / quantity : null,
    knownCostQuantity,
    knownMsrpQuantity,
  }
}

function reportFilterButton(label, value, stateKey) {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = `report-filter-button${state[stateKey] === value ? ' active' : ''}`
  button.textContent = label
  button.addEventListener('click', () => {
    state[stateKey] = value
    if (['reportPeriod', 'activityPeriod'].includes(stateKey) && value === 'custom') {
      const year = new Date().getFullYear()
      const startKey = stateKey === 'activityPeriod' ? 'activityCustomStart' : 'reportCustomStart'
      const endKey = stateKey === 'activityPeriod' ? 'activityCustomEnd' : 'reportCustomEnd'
      state[startKey] ||= `${year}-01-01`
      state[endKey] ||= todayIsoDate()
    }
    render()
  })
  return button
}

function renderRemovalHistory(view) {
  const events = filteredRemovalEvents()
  const metrics = removalReportMetrics(events)
  const { panel, body } = createCollapsibleReportSection({
    title: 'Removal History',
    description: 'Choose a date range and removal type to recalculate the counts and values below.',
    stateKey: 'removalHistory',
  })

  const filters = document.createElement('div')
  filters.className = 'report-filter-grid'
  const period = document.createElement('fieldset')
  period.className = 'report-filter-group'
  period.innerHTML = '<legend>Period</legend>'
  const periodButtons = document.createElement('div')
  periodButtons.className = 'report-filter-buttons'
  periodButtons.append(
    reportFilterButton('Lifetime', 'lifetime', 'reportPeriod'),
    reportFilterButton('Current Year', 'current', 'reportPeriod'),
    reportFilterButton('Prior Year', 'prior', 'reportPeriod'),
    reportFilterButton('Custom', 'custom', 'reportPeriod'),
  )
  period.append(periodButtons)

  const removalType = document.createElement('fieldset')
  removalType.className = 'report-filter-group'
  removalType.innerHTML = '<legend>Removal Type</legend>'
  const typeButtons = document.createElement('div')
  typeButtons.className = 'report-filter-buttons report-type-buttons'
  typeButtons.append(
    reportFilterButton('All Removals', 'all', 'reportRemovalType'),
    reportFilterButton('Smoked', 'SMOKED', 'reportRemovalType'),
    reportFilterButton('Gifted', 'GIFTED', 'reportRemovalType'),
    reportFilterButton('Discarded', 'DISCARDED', 'reportRemovalType'),
  )
  removalType.append(typeButtons)
  filters.append(period, removalType)
  body.append(filters)

  if (state.reportPeriod === 'custom') {
    const customDates = document.createElement('div')
    customDates.className = 'report-custom-dates'
    customDates.innerHTML = `
      <label class="form-field"><span>Start Date</span><input type="date" name="reportStart" value="${escapeHtml(state.reportCustomStart)}"></label>
      <label class="form-field"><span>End Date</span><input type="date" name="reportEnd" value="${escapeHtml(state.reportCustomEnd)}"></label>
    `
    customDates.querySelector('[name="reportStart"]').addEventListener('change', (event) => {
      state.reportCustomStart = event.target.value
      render()
    })
    customDates.querySelector('[name="reportEnd"]').addEventListener('change', (event) => {
      state.reportCustomEnd = event.target.value
      render()
    })
    body.append(customDates)
  }

  const searchForm = document.createElement('form')
  searchForm.className = 'report-search-form'
  searchForm.innerHTML = `
    <label class="form-field"><span>Search</span><input name="reportSearch" value="${escapeHtml(state.reportSearch)}" placeholder="Search cigar, location, lot, rating, or notes"></label>
    <button class="primary-button" type="submit">Search</button>
    <button class="secondary-button" type="button" data-clear-search>Clear</button>
  `
  searchForm.addEventListener('submit', (event) => {
    event.preventDefault()
    state.reportSearch = new FormData(searchForm).get('reportSearch') || ''
    render()
  })
  searchForm.querySelector('[data-clear-search]').addEventListener('click', () => {
    state.reportSearch = ''
    render()
  })
  body.append(searchForm)

  const counts = document.createElement('div')
  counts.className = 'metric-grid compact report-count-grid'
  counts.append(
    metricCard('Total Removed', metrics.quantity, ''),
    metricCard('Smoked', metrics.smoked, ''),
    metricCard('Gifted', metrics.gifted, ''),
    metricCard('Discarded', metrics.discarded, ''),
  )
  body.append(counts)

  const valuesTitle = document.createElement('h3')
  valuesTitle.className = 'report-values-title'
  valuesTitle.textContent = state.reportRemovalType === 'all'
    ? 'All Removal Values'
    : `${removalEventLabel(state.reportRemovalType)} Values`
  const values = document.createElement('div')
  values.className = 'report-value-grid'
  values.append(
    metricCard('Total Cost', metrics.totalCost, '', true),
    metricCard('Total MSRP', metrics.totalMsrp, '', true),
    metricCard('Total Savings', metrics.totalSavings, '', true),
    metricCard('Average Cost Per Cigar', metrics.averageCost, '', true),
    metricCard('Average MSRP Per Cigar', metrics.averageMsrp, '', true),
    metricCard('Quantity Included', metrics.quantity, ''),
  )
  body.append(valuesTitle, values)

  const historyTitle = document.createElement('div')
  historyTitle.className = 'section-heading report-events-heading'
  historyTitle.innerHTML = `<div><h3>Removal Events</h3><p class="muted">${formatCount(events.length)} matching event records.</p></div>`
  body.append(historyTitle)
  if (events.length === 0) {
    const empty = document.createElement('div')
    empty.className = 'empty-state'
    empty.innerHTML = '<p>No smoked, gifted, or discarded events match the selected filters.</p>'
    body.append(empty)
  } else {
    const tableWrap = document.createElement('div')
    tableWrap.className = 'table-scroll'
    const table = document.createElement('table')
    table.className = 'data-table'
    table.innerHTML = `
      <thead><tr><th>Date</th><th>Type</th><th>Cigar</th><th>Location</th><th>Qty</th><th>Cost / Cigar</th><th>MSRP / Cigar</th><th>Rating</th><th>Journal Notes</th></tr></thead>
      <tbody></tbody>
    `
    const tbody = table.querySelector('tbody')
    events.forEach((event) => {
      const details = removalEventDetails(event)
      const journal = smokingJournalEntryForEvent(event.id)
      const row = document.createElement('tr')
      row.innerHTML = `
        <td>${escapeHtml(removalEventDate(event))}</td>
        <td>${escapeHtml(removalEventLabel(event.eventType))}</td>
        <td>${details.cigar
          ? `<button type="button" class="linkish-button" data-journal-catalog-id="${Number(details.cigar.id)}">${escapeHtml(details.cigarLabel)}</button>`
          : escapeHtml(details.cigarLabel)}</td>
        <td>${escapeHtml(details.locationLabel || 'Unassigned')}</td>
        <td>${formatCount(event.quantity)}</td>
        <td>${escapeHtml(money(event.costPerCigarAtEvent))}</td>
        <td>${escapeHtml(money(event.msrpPerCigarAtEvent))}</td>
        <td>${journal ? escapeHtml(String(journal.rating)) : '—'}</td>
        <td>${escapeHtml(journal?.notes || '')}</td>
      `
      tbody.append(row)
    })
    table.querySelectorAll('[data-journal-catalog-id]').forEach((button) => {
      button.addEventListener('click', () => {
        state.selectedCatalogHistoryCigarId = Number(button.dataset.journalCatalogId)
        state.catalogSearch = ''
        state.editing['catalog-cigars'] = null
        navigateToPage('Catalog')
      })
    })
    tableWrap.append(table)
    body.append(tableWrap)
  }
  view.append(panel)
}

function purchaseHistoryRows() {
  const paidAllocations = purchaseHistoryPaidAllocations()
  return records('purchase-lines')
    .map((line) => {
      const purchase = recordById('purchases', line.purchaseId)
      const cigar = recordById('catalog-cigars', line.catalogCigarId)
      if (!purchase) return null
      return {
        line,
        purchase,
        cigar,
        vendor: recordById('vendors', purchase.vendorId),
        manufacturer: String(cigar?.manufacturer || 'Unknown Manufacturer').trim(),
        attributedPaid: paidAllocations.get(Number(line.id)) ?? null,
      }
    })
    .filter(Boolean)
    .filter((row) => state.purchaseHistoryGroup !== 'vendor' || !state.purchaseHistoryVendorId || Number(row.purchase.vendorId || 0) === Number(state.purchaseHistoryVendorId))
    .filter((row) => state.purchaseHistoryGroup !== 'manufacturer' || !state.purchaseHistoryManufacturer || row.manufacturer.toLowerCase() === state.purchaseHistoryManufacturer.toLowerCase())
    .filter((row) => !state.purchaseHistoryBuyAgainFilter || (normalizeBuyAgainStatus(row.cigar?.buyAgainStatus) || 'NOT_EVALUATED') === state.purchaseHistoryBuyAgainFilter)
}

function allocatePurchasePaidCents(purchase, lines) {
  if (!hasKnownMoney(purchase.totalPaid) || lines.length === 0) return null
  const totalCents = Math.round(Number(purchase.totalPaid) * 100)
  if (totalCents === 0) return new Map(lines.map((line) => [Number(line.id), 0]))

  let weights = lines.map((line) => line.trueCostBasis)
  if (!weights.every(hasKnownMoney) || weights.reduce((sum, value) => sum + Math.round(Number(value) * 100), 0) <= 0) {
    weights = lines.map((line) => line.purchasePrice ?? line.lineSubtotal ?? null)
  }
  if (!weights.every(hasKnownMoney) || weights.reduce((sum, value) => sum + Math.round(Number(value) * 100), 0) <= 0) {
    return lines.length === 1 ? new Map([[Number(lines[0].id), totalCents]]) : null
  }

  const weightCents = weights.map((value) => Math.round(Number(value) * 100))
  const weightTotal = weightCents.reduce((sum, value) => sum + value, 0)
  const allocations = lines.map((line, index) => {
    const numerator = totalCents * weightCents[index]
    return {
      id: Number(line.id),
      cents: Math.floor(numerator / weightTotal),
      remainder: numerator % weightTotal,
    }
  })
  let centsRemaining = totalCents - allocations.reduce((sum, item) => sum + item.cents, 0)
  const remainderOrder = [...allocations].sort((left, right) => right.remainder - left.remainder || left.id - right.id)
  for (let index = 0; index < centsRemaining; index += 1) {
    remainderOrder[index % remainderOrder.length].cents += 1
  }
  return new Map(allocations.map((item) => [item.id, item.cents]))
}

function purchaseHistoryPaidAllocations() {
  const allocations = new Map()
  records('purchases').forEach((purchase) => {
    const lines = records('purchase-lines').filter((line) => Number(line.purchaseId || 0) === Number(purchase.id))
    const purchaseAllocations = allocatePurchasePaidCents(purchase, lines)
    lines.forEach((line) => {
      const cents = purchaseAllocations?.get(Number(line.id))
      allocations.set(Number(line.id), cents === undefined ? null : cents / 100)
    })
  })
  return allocations
}

function completeMoneyTotal(values) {
  return values.every(hasKnownMoney)
    ? values.reduce((sum, value) => sum + Math.round(Number(value) * 100), 0) / 100
    : null
}

function uniquePurchaseHistoryPurchases(rows) {
  return Array.from(new Map(rows.map((row) => [Number(row.purchase.id), row.purchase])).values())
}

function purchaseHistoryTotalPaid(rows) {
  if ((state.purchaseHistoryGroup === 'manufacturer' && state.purchaseHistoryManufacturer) || state.purchaseHistoryBuyAgainFilter) {
    return completeMoneyTotal(rows.map((row) => row.attributedPaid))
  }
  return completeMoneyTotal(uniquePurchaseHistoryPurchases(rows).map((purchase) => purchase.totalPaid))
}

function purchaseTrendMonthLabel(year, month) {
  const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${monthLabels[month - 1] || 'Unknown'} ${year}`
}

function purchaseTrendPeriodInfo(purchase) {
  const purchaseDate = String(purchase?.purchaseDate || '').trim()
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(purchaseDate)
  if (!match) {
    return { key: 'unknown', label: 'Unknown Purchase Date', sortKey: -1 }
  }
  const year = Number(match[1])
  const month = Number(match[2])
  if (state.purchaseTrendPeriod === 'month') {
    return {
      key: `${match[1]}-${match[2]}`,
      label: purchaseTrendMonthLabel(year, month),
      sortKey: year * 100 + month,
    }
  }
  return {
    key: match[1],
    label: match[1],
    sortKey: year,
  }
}

function purchaseTrendPurchaseQuantity(purchaseId) {
  return records('purchase-lines')
    .filter((line) => Number(line.purchaseId || 0) === Number(purchaseId || 0))
    .reduce((sum, line) => sum + numericValue(line.quantity), 0)
}

function summarizePurchaseTrendPurchases(purchases) {
  const totalCigars = purchases.reduce((sum, purchase) => sum + purchaseTrendPurchaseQuantity(purchase.id), 0)
  const totalPaid = completeMoneyTotal(purchases.map((purchase) => purchase.totalPaid))
  return {
    purchaseCount: purchases.length,
    cigarCount: totalCigars,
    totalPaid,
    averagePaidPerCigar: totalPaid !== null && totalCigars > 0 ? roundMoney(totalPaid / totalCigars) : null,
  }
}

function purchaseTrendRows() {
  const rowsByKey = new Map()
  sortPurchasesNewest(records('purchases')).forEach((purchase) => {
    const period = purchaseTrendPeriodInfo(purchase)
    if (!rowsByKey.has(period.key)) {
      rowsByKey.set(period.key, {
        key: period.key,
        label: period.label,
        sortKey: period.sortKey,
        purchases: [],
      })
    }
    rowsByKey.get(period.key).purchases.push(purchase)
  })
  return [...rowsByKey.values()]
    .map((row) => ({ ...row, ...summarizePurchaseTrendPurchases(row.purchases) }))
    .sort((left, right) => right.sortKey - left.sortKey || left.label.localeCompare(right.label, undefined, { sensitivity: 'base' }))
}

function purchaseTrendVendorRows() {
  const rowsByKey = new Map()
  records('purchases').forEach((purchase) => {
    const vendorId = Number(purchase.vendorId || 0)
    const label = vendorName(vendorId) || (vendorId > 0 ? `Vendor ${vendorId}` : 'Unknown Vendor')
    if (!rowsByKey.has(vendorId)) {
      rowsByKey.set(vendorId, {
        key: vendorId,
        label,
        purchases: [],
      })
    }
    rowsByKey.get(vendorId).purchases.push(purchase)
  })
  return [...rowsByKey.values()]
    .map((row) => ({ ...row, ...summarizePurchaseTrendPurchases(row.purchases) }))
    .sort((left, right) => {
      const leftKnown = hasKnownMoney(left.totalPaid)
      const rightKnown = hasKnownMoney(right.totalPaid)
      if (leftKnown !== rightKnown) return leftKnown ? -1 : 1
      const leftCents = leftKnown ? Math.round(Number(left.totalPaid) * 100) : 0
      const rightCents = rightKnown ? Math.round(Number(right.totalPaid) * 100) : 0
      return rightCents - leftCents || left.label.localeCompare(right.label, undefined, { sensitivity: 'base' })
    })
}

function purchaseTrendManufacturerRows() {
  const allocations = purchaseHistoryPaidAllocations()
  const rowsByKey = new Map()
  records('purchase-lines').forEach((line) => {
    const purchase = recordById('purchases', line.purchaseId)
    if (!purchase) return
    const cigar = recordById('catalog-cigars', line.catalogCigarId)
    const label = String(cigar?.manufacturer || 'Unknown Manufacturer').trim() || 'Unknown Manufacturer'
    const key = label.toLowerCase()
    if (!rowsByKey.has(key)) {
      rowsByKey.set(key, {
        key,
        label,
        purchases: new Set(),
        allocatedPaidValues: [],
        cigarCount: 0,
      })
    }
    const row = rowsByKey.get(key)
    row.purchases.add(Number(purchase.id))
    row.cigarCount += numericValue(line.quantity)
    const attributedPaid = allocations.get(Number(line.id))
    row.allocatedPaidValues.push(attributedPaid === undefined ? null : attributedPaid)
  })
  return [...rowsByKey.values()]
    .map((row) => {
      const totalPaid = completeMoneyTotal(row.allocatedPaidValues)
      return {
        key: row.key,
        label: row.label,
        purchaseCount: row.purchases.size,
        cigarCount: row.cigarCount,
        totalPaid,
        averagePaidPerCigar: totalPaid !== null && row.cigarCount > 0 ? roundMoney(totalPaid / row.cigarCount) : null,
      }
    })
    .sort((left, right) => left.label.localeCompare(right.label, undefined, { sensitivity: 'base' }))
}

function purchaseRecordsFilterLabel() {
  if (!state.purchaseRecordsFilterType || !state.purchaseRecordsFilterValue) {
    return ''
  }
  return state.purchaseRecordsFilterLabel || ''
}

function purchaseRecordsForDisplay() {
  const filterType = String(state.purchaseRecordsFilterType || '').trim()
  const filterValue = String(state.purchaseRecordsFilterValue || '').trim().toLowerCase()
  const purchases = sortPurchasesNewest(records('purchases'))
  if (!filterType || !filterValue) {
    return purchases
  }
  return purchases.filter((purchase) => {
    const purchaseDate = String(purchase.purchaseDate || '').trim().toLowerCase()
    if (filterType === 'year' || filterType === 'month') {
      return purchaseDate.startsWith(filterValue)
    }
    if (filterType === 'vendor') {
      return Number(purchase.vendorId || 0) === Number(filterValue)
    }
    if (filterType === 'manufacturer') {
      return records('purchase-lines')
        .filter((line) => Number(line.purchaseId || 0) === Number(purchase.id))
        .some((line) => {
          const cigar = recordById('catalog-cigars', line.catalogCigarId)
          return String(cigar?.manufacturer || '').trim().toLowerCase() === filterValue
        })
    }
    return true
  })
}

function ensureSelectedPurchaseVisible(purchases) {
  if (purchases.length === 0) {
    state.selectedPurchaseId = null
    return null
  }
  const selectedId = Number(state.selectedPurchaseId || 0)
  const selectedVisible = selectedId > 0 && purchases.some((purchase) => Number(purchase.id) === selectedId)
  if (!selectedVisible) {
    state.selectedPurchaseId = Number(purchases[0].id)
  }
  return recordById('purchases', state.selectedPurchaseId)
}

function setPurchaseRecordsFilter(type, value, label) {
  state.purchaseRecordsFilterType = String(type || '')
  state.purchaseRecordsFilterValue = String(value || '')
  state.purchaseRecordsFilterLabel = String(label || '')
  state.selectedPurchaseId = null
  state.editingPurchaseLineId = null
  state.showPurchaseCatalogCreate = false
  navigateToPage('Purchases')
}

function clearPurchaseRecordsFilter() {
  state.purchaseRecordsFilterType = ''
  state.purchaseRecordsFilterValue = ''
  state.purchaseRecordsFilterLabel = ''
  state.selectedPurchaseId = null
  state.editingPurchaseLineId = null
  state.showPurchaseCatalogCreate = false
  navigateToPage('Purchases')
}

function renderPurchaseTrendReport(view) {
  const summary = summarizePurchaseTrendPurchases(records('purchases'))
  const trendRows = purchaseTrendRows()
  const vendorRows = purchaseTrendVendorRows()
  const manufacturerRows = purchaseTrendManufacturerRows()
  const { panel, body } = createCollapsibleReportSection({
    className: 'purchase-trend-panel',
    title: 'Purchase Trend Analytics',
    description: 'Yearly or monthly purchase totals by vendor and manufacturer.',
    stateKey: 'purchaseTrend',
  })

  const filters = document.createElement('div')
  filters.className = 'report-filter-grid'
  const period = document.createElement('fieldset')
  period.className = 'report-filter-group'
  period.innerHTML = '<legend>Period Grouping</legend>'
  const periodButtons = document.createElement('div')
  periodButtons.className = 'report-filter-buttons purchase-report-group-buttons'
  periodButtons.append(
    reportFilterButton('By Year', 'year', 'purchaseTrendPeriod'),
    reportFilterButton('By Month', 'month', 'purchaseTrendPeriod'),
  )
  period.append(periodButtons)
  filters.append(period)
  body.append(filters)

  const metrics = document.createElement('div')
  metrics.className = 'metric-grid report-count-grid'
  metrics.append(
    metricCard('Purchase Orders', summary.purchaseCount, ''),
    metricCard('Cigars Purchased', summary.cigarCount, ''),
    metricCard('Total Paid', summary.totalPaid, '', true),
    metricCard('Avg Paid / Cigar', summary.averagePaidPerCigar, '', true),
  )
  body.append(metrics)

  if (trendRows.length === 0) {
    const empty = document.createElement('div')
    empty.className = 'empty-state'
    empty.innerHTML = '<p>No purchases are available for trend analytics.</p>'
    body.append(empty)
    view.append(panel)
    return
  }

  const trendHeading = document.createElement('h4')
  trendHeading.className = 'report-values-title'
  trendHeading.textContent = state.purchaseTrendPeriod === 'month' ? 'Monthly Trend' : 'Yearly Trend'
  body.append(trendHeading)

  const trendTableWrap = document.createElement('div')
  trendTableWrap.className = 'table-scroll compact-top-gap'
  trendTableWrap.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>${escapeHtml(state.purchaseTrendPeriod === 'month' ? 'Month' : 'Year')}</th>
          <th>Purchase Orders</th>
          <th>Cigars Purchased</th>
          <th>Total Paid</th>
          <th>Avg Paid / Cigar</th>
        </tr>
      </thead>
      <tbody>
        ${trendRows.map((row) => `
          <tr class="clickable-record-row" tabindex="0" data-purchase-trend-key="${escapeHtml(row.key)}">
            <td>${escapeHtml(row.label)}</td>
            <td>${formatCount(row.purchaseCount)}</td>
            <td>${formatCount(row.cigarCount)}</td>
            <td>${escapeHtml(money(row.totalPaid))}</td>
            <td>${escapeHtml(money(row.averagePaidPerCigar))}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `
  body.append(trendTableWrap)
  trendTableWrap.querySelectorAll('[data-purchase-trend-key]').forEach((rowElement) => {
    const row = trendRows.find((item) => item.key === rowElement.dataset.purchaseTrendKey)
    if (!row) return
    rowElement.setAttribute('aria-label', `Open Purchases filtered to ${row.label}`)
    const open = () => setPurchaseRecordsFilter(state.purchaseTrendPeriod, row.key, row.label)
    rowElement.addEventListener('click', open)
    rowElement.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        open()
      }
    })
  })

  const vendorHeading = document.createElement('h4')
  vendorHeading.className = 'report-values-title'
  vendorHeading.textContent = 'Vendor Breakdown'
  body.append(vendorHeading)

  const vendorTableWrap = document.createElement('div')
  vendorTableWrap.className = 'table-scroll compact-top-gap'
  vendorTableWrap.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>Vendor</th>
          <th>Purchase Orders</th>
          <th>Cigars Purchased</th>
          <th>Total Paid</th>
          <th>Avg Paid / Cigar</th>
        </tr>
      </thead>
      <tbody>
        ${vendorRows.map((row) => `
          <tr class="clickable-record-row" tabindex="0" data-purchase-trend-vendor-id="${escapeHtml(String(row.key))}">
            <td>${escapeHtml(row.label)}</td>
            <td>${formatCount(row.purchaseCount)}</td>
            <td>${formatCount(row.cigarCount)}</td>
            <td>${escapeHtml(money(row.totalPaid))}</td>
            <td>${escapeHtml(money(row.averagePaidPerCigar))}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `
  body.append(vendorTableWrap)
  vendorTableWrap.querySelectorAll('[data-purchase-trend-vendor-id]').forEach((rowElement) => {
    const row = vendorRows.find((item) => String(item.key) === String(rowElement.dataset.purchaseTrendVendorId))
    if (!row) return
    rowElement.setAttribute('aria-label', `Open Purchases filtered to ${row.label}`)
    const open = () => setPurchaseRecordsFilter('vendor', row.key, row.label)
    rowElement.addEventListener('click', open)
    rowElement.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        open()
      }
    })
  })

  const manufacturerHeading = document.createElement('h4')
  manufacturerHeading.className = 'report-values-title'
  manufacturerHeading.textContent = 'Manufacturer Breakdown'
  body.append(manufacturerHeading)

  const manufacturerTableWrap = document.createElement('div')
  manufacturerTableWrap.className = 'table-scroll compact-top-gap'
  manufacturerTableWrap.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>Manufacturer</th>
          <th>Purchase Orders</th>
          <th>Cigars Purchased</th>
          <th>Total Paid</th>
          <th>Avg Paid / Cigar</th>
        </tr>
      </thead>
      <tbody>
        ${manufacturerRows.map((row) => `
          <tr class="clickable-record-row" tabindex="0" data-purchase-trend-manufacturer="${escapeHtml(row.label)}">
            <td>${escapeHtml(row.label)}</td>
            <td>${formatCount(row.purchaseCount)}</td>
            <td>${formatCount(row.cigarCount)}</td>
            <td>${escapeHtml(money(row.totalPaid))}</td>
            <td>${escapeHtml(money(row.averagePaidPerCigar))}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `
  body.append(manufacturerTableWrap)
  manufacturerTableWrap.querySelectorAll('[data-purchase-trend-manufacturer]').forEach((rowElement) => {
    const row = manufacturerRows.find((item) => item.label === rowElement.dataset.purchaseTrendManufacturer)
    if (!row) return
    rowElement.setAttribute('aria-label', `Open Purchases filtered to ${row.label}`)
    const open = () => setPurchaseRecordsFilter('manufacturer', row.key, row.label)
    rowElement.addEventListener('click', open)
    rowElement.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        open()
      }
    })
  })

  view.append(panel)
}

function renderPurchaseHistoryReport(view) {
  const rows = purchaseHistoryRows()
  const purchases = uniquePurchaseHistoryPurchases(rows)
  const totalQuantity = rows.reduce((sum, row) => sum + numericValue(row.line.quantity), 0)
  const totalPaid = purchaseHistoryTotalPaid(rows)
  const { panel, body } = createCollapsibleReportSection({
    className: 'purchase-history-panel',
    title: 'Purchase History',
    description: 'Purchased cigars grouped by vendor or manufacturer.',
    stateKey: 'purchaseHistory',
  })

  const filters = document.createElement('div')
  filters.className = 'report-filter-grid'
  const group = document.createElement('fieldset')
  group.className = 'report-filter-group'
  group.innerHTML = '<legend>Report By</legend>'
  const groupButtons = document.createElement('div')
  groupButtons.className = 'report-filter-buttons purchase-report-group-buttons'
  groupButtons.append(
    reportFilterButton('Vendor', 'vendor', 'purchaseHistoryGroup'),
    reportFilterButton('Manufacturer', 'manufacturer', 'purchaseHistoryGroup'),
  )
  group.append(groupButtons)

  const selection = document.createElement('fieldset')
  selection.className = 'report-filter-group'
  selection.innerHTML = `<legend>${state.purchaseHistoryGroup === 'vendor' ? 'Vendor' : 'Manufacturer'}</legend>`
  const select = document.createElement('select')
  select.className = 'report-select'
  if (state.purchaseHistoryGroup === 'vendor') {
    select.append(new Option('All Vendors', ''))
    records('vendors').slice().sort((left, right) => String(left.name || '').localeCompare(String(right.name || '')))
      .forEach((vendor) => select.append(new Option(vendor.name || `Vendor ${vendor.id}`, String(vendor.id))))
    select.value = state.purchaseHistoryVendorId
    select.addEventListener('change', () => {
      state.purchaseHistoryVendorId = select.value
      render()
    })
  } else {
    select.append(new Option('All Manufacturers', ''))
    Array.from(new Set(records('catalog-cigars').map((cigar) => String(cigar.manufacturer || '').trim()).filter(Boolean)))
      .sort((left, right) => left.localeCompare(right))
      .forEach((manufacturer) => select.append(new Option(manufacturer, manufacturer.toLowerCase())))
    select.value = state.purchaseHistoryManufacturer
    select.addEventListener('change', () => {
      state.purchaseHistoryManufacturer = select.value
      render()
    })
  }
  selection.append(select)
  const buyAgain = document.createElement('fieldset')
  buyAgain.className = 'report-filter-group'
  buyAgain.innerHTML = '<legend>Buy Again</legend>'
  const buyAgainSelect = document.createElement('select')
  buyAgainSelect.className = 'report-select'
  buyAgainSelect.append(new Option('All Decisions', ''))
  buyAgainStatusOptions.forEach((option) => buyAgainSelect.append(new Option(option.label, option.value || 'NOT_EVALUATED')))
  buyAgainSelect.value = state.purchaseHistoryBuyAgainFilter
  buyAgainSelect.addEventListener('change', () => {
    state.purchaseHistoryBuyAgainFilter = buyAgainSelect.value
    render()
  })
  buyAgain.append(buyAgainSelect)
  filters.append(group, selection, buyAgain)
  body.append(filters)

  const metrics = document.createElement('div')
  metrics.className = 'metric-grid compact report-count-grid compact-top-gap'
  metrics.append(
    metricCard('Purchase Orders', purchases.length, ''),
    metricCard('Cigars Purchased', totalQuantity, ''),
    metricCard('Total Paid', totalPaid, '', true),
  )
  body.append(metrics)

  const savedViews = purchaseHistorySavedViews()
  const savedViewBar = document.createElement('div')
  savedViewBar.className = 'collection-saved-view-bar purchase-history-saved-view-bar'
  savedViewBar.innerHTML = `
    <label class="form-field collection-saved-view-select-field">
      <span>Saved Views</span>
      <select data-purchase-history-view-select>
        <option value="">Load a saved view...</option>
        ${savedViews.map((view) => `<option value="${escapeHtml(view.name)}">${escapeHtml(view.name)}</option>`).join('')}
      </select>
    </label>
    <label class="form-field collection-saved-view-name-field">
      <span>View Name</span>
      <input type="text" data-purchase-history-view-name placeholder="Current filters">
    </label>
    <button type="button" class="primary-button" data-save-purchase-history-view>Save View</button>
    <button type="button" class="secondary-button" data-delete-purchase-history-view ${savedViews.length === 0 ? 'disabled' : ''}>Delete View</button>
  `
  const savedViewSelect = savedViewBar.querySelector('[data-purchase-history-view-select]')
  const savedViewNameInput = savedViewBar.querySelector('[data-purchase-history-view-name]')
  const savePurchaseHistoryViewButton = savedViewBar.querySelector('[data-save-purchase-history-view]')
  const deletePurchaseHistoryViewButton = savedViewBar.querySelector('[data-delete-purchase-history-view]')
  const matchingView = savedViews.find((view) => purchaseHistoryViewMatchesCurrent(view.snapshot))
  if (matchingView) {
    savedViewSelect.value = matchingView.name
  }
  const syncSavedViewButtons = () => {
    const canSave = String(savedViewNameInput.value || '').trim().length > 0
    savePurchaseHistoryViewButton.disabled = !canSave
    deletePurchaseHistoryViewButton.disabled = savedViews.length === 0 || !savedViewSelect.value
  }
  savedViewNameInput.addEventListener('input', syncSavedViewButtons)
  savedViewSelect.addEventListener('change', () => {
    if (applyPurchaseHistoryView(savedViewSelect.value)) return
    savedViewSelect.value = ''
  })
  savePurchaseHistoryViewButton.addEventListener('click', () => {
    if (!savePurchaseHistoryView(savedViewNameInput.value)) return
    render()
  })
  deletePurchaseHistoryViewButton.addEventListener('click', () => {
    if (!deletePurchaseHistoryView(savedViewSelect.value)) return
    render()
  })
  syncSavedViewButtons()

  if (rows.length === 0) {
    const empty = document.createElement('div')
    empty.className = 'empty-state'
    empty.innerHTML = '<p>No purchases match the selected report.</p>'
    body.append(empty)
  }
  body.append(savedViewBar)
  view.append(panel)
}

const inventoryAgingBuckets = [
  { key: '0-30', label: '0–30 Days', minimum: 0, maximum: 30 },
  { key: '31-90', label: '31–90 Days', minimum: 31, maximum: 90 },
  { key: '91-180', label: '91–180 Days', minimum: 91, maximum: 180 },
  { key: '181-365', label: '181–365 Days', minimum: 181, maximum: 365 },
  { key: '366+', label: 'Over 1 Year', minimum: 366, maximum: Number.POSITIVE_INFINITY },
  { key: 'future', label: 'Future Receipt Date' },
  { key: 'unknown', label: 'Unknown Receipt Date' },
]

function isoDateDayNumber(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''))
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const timestamp = Date.UTC(year, month - 1, day)
  const date = new Date(timestamp)
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
  return Math.floor(timestamp / 86400000)
}

function inventoryAgeDays(receivedDate, asOfDate = todayIsoDate()) {
  const receivedDay = isoDateDayNumber(receivedDate)
  const asOfDay = isoDateDayNumber(asOfDate)
  return receivedDay === null || asOfDay === null ? null : asOfDay - receivedDay
}

function inventoryAgingBucket(ageDays) {
  if (ageDays === null) return inventoryAgingBuckets.find((bucket) => bucket.key === 'unknown')
  if (ageDays < 0) return inventoryAgingBuckets.find((bucket) => bucket.key === 'future')
  return inventoryAgingBuckets.find((bucket) => bucket.minimum <= ageDays && ageDays <= bucket.maximum)
}

function inventoryAgingRows(asOfDate = todayIsoDate()) {
  const manufacturer = String(state.agingManufacturer || '').trim().toLowerCase()
  const humidorId = Number(state.agingHumidorId || 0)
  return positiveBalances()
    .filter((entry) => !manufacturer || String(entry.cigar?.manufacturer || '').trim().toLowerCase() === manufacturer)
    .filter((entry) => !humidorId || Number(entry.humidor?.id || 0) === humidorId)
    .map((entry) => {
      const receivedDate = displayDate(
        entry.lot?.receivedDateSnapshot
        || entry.line?.completionReceivedDate
        || entry.line?.latestReceivedDate
        || entry.line?.firstReceivedDate
        || entry.line?.receivedDate
        || entry.purchase?.receivedDate,
      )
      const ageDays = inventoryAgeDays(receivedDate, asOfDate)
      return {
        ...entry,
        receivedDate,
        ageDays,
        agingBucket: inventoryAgingBucket(ageDays),
        costValueCents: hasKnownMoney(entry.costPerCigar) ? entry.quantity * Math.round(Number(entry.costPerCigar) * 100) : null,
        msrpValueCents: hasKnownMoney(entry.msrpPerCigar) ? entry.quantity * Math.round(Number(entry.msrpPerCigar) * 100) : null,
      }
    })
    .sort((left, right) => {
      const leftBucket = inventoryAgingBuckets.findIndex((bucket) => bucket.key === left.agingBucket.key)
      const rightBucket = inventoryAgingBuckets.findIndex((bucket) => bucket.key === right.agingBucket.key)
      return leftBucket - rightBucket
        || Number(right.ageDays ?? -1) - Number(left.ageDays ?? -1)
        || cigarName(left.cigar).localeCompare(cigarName(right.cigar), undefined, { sensitivity: 'base' })
        || Number(left.lot?.id || 0) - Number(right.lot?.id || 0)
    })
}

function summarizeInventoryAging(rows) {
  const quantity = rows.reduce((sum, row) => sum + row.quantity, 0)
  const knownAgeRows = rows.filter((row) => row.ageDays !== null && row.ageDays >= 0)
  const knownAgeQuantity = knownAgeRows.reduce((sum, row) => sum + row.quantity, 0)
  const knownCostRows = rows.filter((row) => row.costValueCents !== null)
  const knownMsrpRows = rows.filter((row) => row.msrpValueCents !== null)
  const knownCostQuantity = knownCostRows.reduce((sum, row) => sum + row.quantity, 0)
  const knownMsrpQuantity = knownMsrpRows.reduce((sum, row) => sum + row.quantity, 0)
  return {
    quantity,
    lotCount: new Set(rows.map((row) => Number(row.lot?.id || 0)).filter(Boolean)).size,
    knownAgeQuantity,
    weightedAverageAge: knownAgeQuantity > 0
      ? knownAgeRows.reduce((sum, row) => sum + row.quantity * row.ageDays, 0) / knownAgeQuantity
      : null,
    totalCostBasis: knownCostQuantity === quantity ? knownCostRows.reduce((sum, row) => sum + row.costValueCents, 0) / 100 : null,
    totalMsrp: knownMsrpQuantity === quantity ? knownMsrpRows.reduce((sum, row) => sum + row.msrpValueCents, 0) / 100 : null,
    knownCostQuantity,
    knownMsrpQuantity,
  }
}

function inventoryAgingBucketSummaries(rows) {
  return inventoryAgingBuckets.map((bucket) => {
    const bucketRows = rows.filter((row) => row.agingBucket.key === bucket.key)
    return { bucket, rows: bucketRows, ...summarizeInventoryAging(bucketRows) }
  })
}

function openCollectionForAgingCigar(cigarId) {
  state.collectionHumidorFilterId = Number(state.agingHumidorId || 0) || null
  state.collectionSectionFilterId = null
  state.collectionStrengthFilter = ''
  state.collectionBuyAgainFilter = ''
  state.collectionSearch = ''
  state.selectedCollectionCigarId = Number(cigarId)
  state.collectionScrollTargetCigarId = state.selectedCollectionCigarId
  navigateToPage('Collection')
}

function openCatalogForBuyAgainCigar(cigarId) {
  state.selectedCatalogHistoryCigarId = Number(cigarId)
  state.catalogSearch = ''
  state.editing['catalog-cigars'] = null
  navigateToPage('Catalog')
}

function openCollectionForRatingBreakdown(row) {
  if (!row) return
  state.selectedCollectionCigarId = null
  state.collectionScrollTargetCigarId = null
  state.collectionHumidorFilterId = null
  state.collectionSectionFilterId = null
  state.collectionStrengthFilter = ''
  state.collectionBuyAgainFilter = ''
  state.collectionSearch = String(row.searchTerm || row.label || '').trim()
  navigateToPage('Collection')
}

function activityEventContextTarget(event) {
  const targetEvent = normalizeEventType(event?.eventType) === 'REVERSAL'
    ? activityRelationshipEvent(event) || event
    : event
  const eventType = normalizeEventType(targetEvent?.eventType)
  if (eventType === 'PURCHASE_RECEIPT' || Number(targetEvent?.purchaseId || 0) > 0) {
    return { type: 'purchase', label: 'Open Purchase' }
  }
  if (activityEventCigar(targetEvent)) {
    return { type: 'collection', label: 'Open Collection' }
  }
  return null
}

function openActivityEventContext(event) {
  const targetEvent = normalizeEventType(event?.eventType) === 'REVERSAL'
    ? activityRelationshipEvent(event) || event
    : event
  const context = activityEventContextTarget(targetEvent)
  if (!context) return
  if (context.type === 'purchase') {
    const purchaseId = Number(targetEvent?.purchaseId || recordById('lots', targetEvent?.lotId)?.purchaseId || 0)
    if (!purchaseId) return
    state.purchaseRecordsFilterType = ''
    state.purchaseRecordsFilterValue = ''
    state.purchaseRecordsFilterLabel = ''
    state.selectedPurchaseId = purchaseId
    state.editingPurchaseLineId = null
    state.showPurchaseCatalogCreate = false
    navigateToPage('Purchases')
    return
  }
  const cigar = activityEventCigar(targetEvent)
  if (!cigar) return
  state.collectionHumidorFilterId = Number(
    targetEvent?.storageLocationId
    || targetEvent?.toStorageLocationId
    || targetEvent?.destinationLocation?.storageLocationId
    || targetEvent?.fromStorageLocationId
    || targetEvent?.sourceLocation?.storageLocationId
    || 0,
  ) || null
  state.collectionSectionFilterId = null
  state.collectionStrengthFilter = ''
  state.collectionBuyAgainFilter = ''
  state.collectionSearch = ''
  state.selectedCollectionCigarId = Number(cigar.id)
  state.collectionScrollTargetCigarId = state.selectedCollectionCigarId
  navigateToPage('Collection')
}

function createCollapsibleReportSection({ className = '', title, description, stateKey }) {
  const panel = document.createElement('section')
  panel.className = `dashboard-panel removal-report-panel ${className}`.trim()
  const details = document.createElement('details')
  details.className = 'report-collapsible'
  if (stateKey) {
    details.open = Boolean(state.reportSectionState?.[stateKey])
    details.addEventListener('toggle', () => {
      state.reportSectionState[stateKey] = details.open
    })
  }
  const summary = document.createElement('summary')
  summary.className = 'section-heading report-title report-collapsible-summary'
  summary.innerHTML = `
    <div>
      <h3>${escapeHtml(title)}</h3>
      <p class="muted">${escapeHtml(description)}</p>
    </div>
  `
  const body = document.createElement('div')
  body.className = 'report-collapsible-body'
  details.append(summary, body)
  panel.append(details)
  return { panel, body }
}

function renderInventoryAgingReport(view) {
  const rows = inventoryAgingRows()
  const summary = summarizeInventoryAging(rows)
  const bucketSummaries = inventoryAgingBucketSummaries(rows)
  const manufacturers = [...new Set(records('catalog-cigars')
    .map((cigar) => String(cigar.manufacturer || '').trim())
    .filter(Boolean))]
    .sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' }))
  const humidors = [...records('storage-locations')]
    .sort((left, right) => String(left.name || '').localeCompare(String(right.name || ''), undefined, { sensitivity: 'base' }))

  const { panel, body } = createCollapsibleReportSection({
    className: 'inventory-aging-panel',
    title: 'Inventory Aging',
    description: `Current on-hand inventory grouped by receipt age through ${escapeHtml(todayIsoDate())}.`,
    stateKey: 'inventoryAging',
  })

  const filters = document.createElement('form')
  filters.className = 'aging-filter-form'
  filters.innerHTML = `
    <label class="form-field"><span>Manufacturer</span><select class="report-select" name="agingManufacturer">
      <option value="">All Manufacturers</option>
      ${manufacturers.map((manufacturer) => `<option value="${escapeHtml(manufacturer)}">${escapeHtml(manufacturer)}</option>`).join('')}
    </select></label>
    <label class="form-field"><span>Humidor</span><select class="report-select" name="agingHumidorId">
      <option value="">All Humidors</option>
      ${humidors.map((humidor) => `<option value="${Number(humidor.id)}">${escapeHtml(humidor.name || `Humidor ${humidor.id}`)}${recordIsActive(humidor) ? '' : ' — Archived'}</option>`).join('')}
    </select></label>
    <button type="button" class="secondary-button" data-clear-aging>Clear Filters</button>
  `
  const manufacturerSelect = filters.querySelector('[name="agingManufacturer"]')
  const humidorSelect = filters.querySelector('[name="agingHumidorId"]')
  manufacturerSelect.value = state.agingManufacturer
  humidorSelect.value = String(state.agingHumidorId || '')
  manufacturerSelect.addEventListener('change', () => {
    state.agingManufacturer = manufacturerSelect.value
    state.selectedAgingBucketKey = null
    render()
  })
  humidorSelect.addEventListener('change', () => {
    state.agingHumidorId = humidorSelect.value
    state.selectedAgingBucketKey = null
    render()
  })
  filters.querySelector('[data-clear-aging]').addEventListener('click', () => {
    state.agingManufacturer = ''
    state.agingHumidorId = ''
    state.selectedAgingBucketKey = null
    render()
  })
  body.append(filters)

  const metrics = document.createElement('div')
  metrics.className = 'metric-grid compact inventory-aging-metrics'
  metrics.append(
    metricCard('On Hand', summary.quantity, 'Positive location balances'),
    metricCard('Distinct Lots', summary.lotCount, 'Split Lots counted once'),
    metricCard('Weighted Avg Age', summary.weightedAverageAge === null ? null : `${Math.round(summary.weightedAverageAge)} days`, `${formatCount(summary.knownAgeQuantity)} of ${formatCount(summary.quantity)} cigars dated`),
  )
  body.append(metrics)

  const bucketHeading = document.createElement('div')
  bucketHeading.className = 'section-heading report-events-heading'
  bucketHeading.innerHTML = '<div><h3>Age Buckets</h3><p class="muted">Totals reconcile to the filtered on-hand inventory above. Select a nonempty bucket to view its cigars.</p></div>'
  const bucketWrap = document.createElement('div')
  bucketWrap.className = 'table-scroll'
  bucketWrap.innerHTML = `
    <table class="data-table aging-bucket-table">
      <thead><tr><th>Age Bucket</th><th>Quantity</th><th>Lots</th><th>Cost Basis</th><th>MSRP</th></tr></thead>
      <tbody>${bucketSummaries.map((item) => {
        const isSelected = state.selectedAgingBucketKey === item.bucket.key
        return `
        <tr${isSelected ? ' class="selected-row"' : ''}>
          <td>${item.quantity > 0
            ? `<button type="button" class="linkish-button aging-bucket-toggle" data-aging-bucket-key="${escapeHtml(item.bucket.key)}" aria-expanded="${isSelected}">${escapeHtml(item.bucket.label)}</button>`
            : escapeHtml(item.bucket.label)}</td>
          <td>${formatCount(item.quantity)}</td>
          <td>${formatCount(item.lotCount)}</td>
          <td>${escapeHtml(money(item.totalCostBasis))}</td>
          <td>${escapeHtml(money(item.totalMsrp))}</td>
        </tr>
        ${isSelected ? `
          <tr class="collection-expanded-row">
            <td colspan="5">
              <div class="collection-expanded-card aging-bucket-detail">
                <div class="table-scroll">
                  <table class="data-table aging-detail-table">
                    <thead><tr><th>Age</th><th>Received</th><th>Cigar</th><th>Lot</th><th>Location</th><th>Qty</th><th>Cost Basis</th><th>MSRP</th></tr></thead>
                    <tbody>${item.rows.map((row) => `
                      <tr class="clickable-record-row" tabindex="0" data-aging-cigar-id="${Number(row.cigar?.id || 0)}">
                        <td>${row.ageDays === null ? 'Unknown' : row.ageDays < 0 ? `${formatCount(Math.abs(row.ageDays))} days future` : `${formatCount(row.ageDays)} days`}</td>
                        <td>${escapeHtml(row.receivedDate || 'Unknown')}</td>
                        <td><button type="button" class="linkish-button" data-aging-cigar-id="${Number(row.cigar?.id || 0)}">${escapeHtml(row.cigar ? cigarName(row.cigar) : 'Missing Catalog relationship')}</button></td>
                        <td>${row.lot?.id ? `Lot ${escapeHtml(String(row.lot.id))}` : 'Unknown'}</td>
                        <td>${escapeHtml(row.locationLabel || 'Unassigned')}</td>
                        <td>${formatCount(row.quantity)}</td>
                        <td>${escapeHtml(money(row.costValueCents === null ? null : row.costValueCents / 100))}</td>
                        <td>${escapeHtml(money(row.msrpValueCents === null ? null : row.msrpValueCents / 100))}</td>
                      </tr>
                    `).join('')}</tbody>
                  </table>
                </div>
              </div>
            </td>
          </tr>
        ` : ''}
      `}).join('')}</tbody>
    </table>
  `
  bucketWrap.querySelectorAll('[data-aging-bucket-key]').forEach((button) => {
    button.addEventListener('click', () => {
      const bucketKey = button.dataset.agingBucketKey
      state.selectedAgingBucketKey = state.selectedAgingBucketKey === bucketKey ? null : bucketKey
      render()
    })
  })
  bucketWrap.querySelectorAll('[data-aging-cigar-id]').forEach((button) => {
    button.disabled = Number(button.dataset.agingCigarId || 0) <= 0
    button.addEventListener('click', () => openCollectionForAgingCigar(button.dataset.agingCigarId))
  })
  bucketWrap.querySelectorAll('tr[data-aging-cigar-id]').forEach((rowElement) => {
    const cigarId = Number(rowElement.dataset.agingCigarId || 0)
    if (cigarId <= 0) return
    rowElement.addEventListener('click', (event) => {
      if (event.target.closest('button')) return
      openCollectionForAgingCigar(cigarId)
    })
    rowElement.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        openCollectionForAgingCigar(cigarId)
      }
    })
  })
  body.append(bucketHeading, bucketWrap)
  view.append(panel)
}

function buyAgainInsights() {
  const journalByEventId = new Map(records('smoking-journal-entries').map((entry) => [Number(entry.inventoryEventId), entry]))
  const ratingsByCatalogId = new Map()
  effectiveInventoryEvents().forEach((event) => {
    if (normalizeEventType(event.eventType) !== 'SMOKED') return
    const journal = journalByEventId.get(Number(event.id))
    const rating = Number(journal?.rating)
    if (!journal || !Number.isInteger(rating) || rating < 1 || rating > 10) return
    const lot = recordById('lots', event.lotId)
    const catalogCigarId = Number(event.catalogCigarId || lot?.catalogCigarId || 0)
    if (!catalogCigarId) return
    if (!ratingsByCatalogId.has(catalogCigarId)) ratingsByCatalogId.set(catalogCigarId, [])
    ratingsByCatalogId.get(catalogCigarId).push(rating)
  })
  const counts = { NOT_EVALUATED: 0, YES: 0, MAYBE: 0, NO: 0 }
  records('catalog-cigars').forEach((cigar) => {
    counts[normalizeBuyAgainStatus(cigar.buyAgainStatus) || 'NOT_EVALUATED'] += 1
  })
  const highlyRatedNotEvaluated = records('catalog-cigars')
    .map((cigar) => {
      const ratings = ratingsByCatalogId.get(Number(cigar.id)) || []
      const averageRating = ratings.length ? ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length : null
      return { cigar, averageRating, ratingCount: ratings.length }
    })
    .filter((item) => !normalizeBuyAgainStatus(item.cigar.buyAgainStatus) && item.averageRating !== null && item.averageRating >= 8)
    .sort((left, right) => right.averageRating - left.averageRating || cigarName(left.cigar).localeCompare(cigarName(right.cigar)))
  return { counts, highlyRatedNotEvaluated }
}

function renderRatingBreakdownReport(view) {
  const rows = ratingBreakdownRows()
  const totalSmokes = rows.reduce((sum, row) => sum + Number(row.smokeCount || 0), 0)
  const totalRatings = rows.reduce((sum, row) => sum + Number(row.ratingCount || 0), 0)
  const uniqueCigars = rows.reduce((sum, row) => sum + Number(row.cigarCount || 0), 0)
  const averageRating = totalRatings > 0
    ? rows.reduce((sum, row) => sum + Number(row.averageRating || 0) * Number(row.ratingCount || 0), 0) / totalRatings
    : null
  const { panel, body } = createCollapsibleReportSection({
    className: 'rating-breakdown-panel',
    title: 'Rating Breakdown',
    description: 'Average smoking ratings by cigar strength, wrapper, origin, size, or manufacturer.',
    stateKey: 'ratingBreakdown',
  })

  const filters = document.createElement('div')
  filters.className = 'report-filter-grid'
  const group = document.createElement('fieldset')
  group.className = 'report-filter-group'
  group.innerHTML = '<legend>Group By</legend>'
  const groupButtons = document.createElement('div')
  groupButtons.className = 'report-filter-buttons purchase-report-group-buttons'
  groupButtons.append(
    reportFilterButton('Strength', 'strength', 'ratingBreakdownDimension'),
    reportFilterButton('Wrapper', 'wrapper', 'ratingBreakdownDimension'),
    reportFilterButton('Origin', 'origin', 'ratingBreakdownDimension'),
    reportFilterButton('Size', 'size', 'ratingBreakdownDimension'),
    reportFilterButton('Manufacturer', 'manufacturer', 'ratingBreakdownDimension'),
  )
  group.append(groupButtons)
  filters.append(group)
  body.append(filters)

  const metrics = document.createElement('div')
  metrics.className = 'metric-grid compact report-count-grid compact-top-gap'
  metrics.append(
    metricCard('Average Rating', averageRating === null ? null : averageRating.toFixed(1), 'Rated smoked cigars', true),
    metricCard('Total Smokes', totalSmokes, 'Smoked removals included in the breakdown'),
    metricCard('Rated Entries', totalRatings, 'Smoking Journal entries with valid ratings'),
    metricCard('Distinct Cigars', uniqueCigars, 'Cigars represented in the selected breakdown'),
    metricCard('Breakdown Rows', rows.length, 'Characteristic groups in the current view'),
  )
  body.append(metrics)

  if (rows.length === 0) {
    const empty = document.createElement('div')
    empty.className = 'empty-state'
    empty.innerHTML = '<p>No rated smoking journal entries are available for this breakdown.</p>'
    body.append(empty)
    view.append(panel)
    return
  }

  const tableWrap = document.createElement('div')
  tableWrap.className = 'table-scroll compact-top-gap'
  tableWrap.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>${escapeHtml(ratingBreakdownDimensionLabel(state.ratingBreakdownDimension))}</th>
          <th>Average Rating</th>
          <th>Rated Smokes</th>
          <th>Distinct Cigars</th>
          <th>Last Smoked</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map((row) => `
          <tr class="clickable-record-row" tabindex="0" data-rating-breakdown-key="${escapeHtml(row.key)}">
            <td>${escapeHtml(row.label)}</td>
            <td>${escapeHtml(row.averageRating === null ? '—' : row.averageRating.toFixed(1))}</td>
            <td>${formatCount(row.ratingCount)}</td>
            <td>${formatCount(row.cigarCount)}</td>
            <td>${escapeHtml(row.lastSmokedDate || '—')}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `
  body.append(tableWrap)
  tableWrap.querySelectorAll('[data-rating-breakdown-key]').forEach((rowElement) => {
    const row = rows.find((item) => item.key === rowElement.dataset.ratingBreakdownKey)
    if (!row) return
    rowElement.setAttribute('aria-label', `Open Collection filtered to ${row.label}`)
    const open = () => openCollectionForRatingBreakdown(row)
    rowElement.addEventListener('click', open)
    rowElement.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        open()
      }
    })
  })
  view.append(panel)
}

function focusActivityEventReference(eventId) {
  state.activityPeriod = 'lifetime'
  state.activityType = 'all'
  state.activitySearch = `event ${Number(eventId)}`
  state.activityLotId = ''
  state.activityHumidorId = ''
  state.showAllActivity = true
  state.reversingEventId = null
  render()
}

function renderActivityReference(cell, event) {
  const reference = document.createElement('div')
  reference.className = 'activity-reference'
  const eventLink = document.createElement('button')
  eventLink.type = 'button'
  eventLink.className = 'linkish-button'
  eventLink.textContent = `Event #${event.id}`
  eventLink.addEventListener('click', () => focusActivityEventReference(event.id))
  reference.append(eventLink)
  if (event.lotId) {
    const lot = document.createElement('span')
    lot.textContent = `Lot ${event.lotId}`
    reference.append(lot)
  }
  const relationship = activityRelationshipEvent(event)
  if (relationship) {
    const relationshipLink = document.createElement('button')
    relationshipLink.type = 'button'
    relationshipLink.className = 'linkish-button'
    relationshipLink.textContent = normalizeEventType(event.eventType) === 'REVERSAL'
      ? `Reverses Event #${relationship.id}`
      : `Reversed by Event #${relationship.id}`
    relationshipLink.addEventListener('click', () => focusActivityEventReference(relationship.id))
    reference.append(relationshipLink)
  } else if (normalizeEventType(event.eventType) === 'REVERSAL' && event.reversesInventoryEventId) {
    const missing = document.createElement('span')
    missing.textContent = `Reverses missing Event #${event.reversesInventoryEventId}`
    reference.append(missing)
  }
  cell.append(reference)
}

function renderReportsPage(view) {
  renderPurchaseTrendReport(view)
  renderPurchaseHistoryReport(view)
  renderRatingBreakdownReport(view)
  renderInventoryAgingReport(view)
  renderRemovalHistory(view)

  const matchingActivity = filteredActivityEvents()
  const displayedActivity = activityEventsForDisplay(matchingActivity)
  const { panel: activity, body: activityBody } = createCollapsibleReportSection({
    className: 'report-activity-panel',
    title: 'Activity',
    description: `${formatCount(matchingActivity.length)} matching purchase, movement, removal, and reversal events.`,
    stateKey: 'activity',
  })
  if (!activityFiltersActive() && matchingActivity.length > 12) {
    const activityToggle = document.createElement('button')
    activityToggle.type = 'button'
    activityToggle.className = 'secondary-button'
    activityToggle.textContent = state.showAllActivity ? 'Show Recent 12' : 'Show All Activity'
    activityToggle.addEventListener('click', () => {
      state.showAllActivity = !state.showAllActivity
      state.reversingEventId = null
      render()
    })
    activityBody.append(activityToggle)
  }

  const activityFilters = document.createElement('div')
  activityFilters.className = 'report-filter-grid activity-filter-groups'
  const activityPeriod = document.createElement('fieldset')
  activityPeriod.className = 'report-filter-group'
  activityPeriod.innerHTML = '<legend>Period</legend>'
  const activityPeriodButtons = document.createElement('div')
  activityPeriodButtons.className = 'report-filter-buttons'
  activityPeriodButtons.append(
    reportFilterButton('Lifetime', 'lifetime', 'activityPeriod'),
    reportFilterButton('Current Year', 'current', 'activityPeriod'),
    reportFilterButton('Prior Year', 'prior', 'activityPeriod'),
    reportFilterButton('Custom', 'custom', 'activityPeriod'),
  )
  activityPeriod.append(activityPeriodButtons)

  const activitySelectors = document.createElement('fieldset')
  activitySelectors.className = 'report-filter-group activity-selectors'
  activitySelectors.innerHTML = `
    <legend>Event Filters</legend>
    <label class="form-field"><span>Event Type</span><select class="report-select" name="activityType">
      <option value="all">All Event Types</option>
      <option value="PURCHASE_RECEIPT">Purchase Receipt</option>
      <option value="MOVE">Move</option>
      <option value="SMOKED">Smoked</option>
      <option value="GIFTED">Gifted</option>
      <option value="DISCARDED">Discarded</option>
      <option value="INVENTORY_ADJUSTMENT">Inventory Adjustment</option>
      <option value="REVERSAL">Reversal</option>
    </select></label>
    <label class="form-field"><span>Humidor</span><select class="report-select" name="activityHumidorId">
      <option value="">All Humidors</option>
      ${[...records('storage-locations')]
        .sort((left, right) => String(left.name || '').localeCompare(String(right.name || ''), undefined, { sensitivity: 'base' }))
        .map((humidor) => `<option value="${Number(humidor.id)}">${escapeHtml(humidor.name || `Humidor ${humidor.id}`)}${recordIsActive(humidor) ? '' : ' — Archived'}</option>`)
        .join('')}
    </select></label>
  `
  const activityTypeSelect = activitySelectors.querySelector('[name="activityType"]')
  const activityHumidorSelect = activitySelectors.querySelector('[name="activityHumidorId"]')
  activityTypeSelect.value = state.activityType
  activityHumidorSelect.value = String(state.activityHumidorId || '')
  activityTypeSelect.addEventListener('change', () => {
    state.activityType = activityTypeSelect.value
    state.reversingEventId = null
    render()
  })
  activityHumidorSelect.addEventListener('change', () => {
    state.activityHumidorId = activityHumidorSelect.value
    state.reversingEventId = null
    render()
  })
  activityFilters.append(activityPeriod, activitySelectors)
  activityBody.append(activityFilters)

  if (state.activityPeriod === 'custom') {
    const customDates = document.createElement('div')
    customDates.className = 'report-custom-dates'
    customDates.innerHTML = `
      <label class="form-field"><span>Start Date</span><input type="date" name="activityStart" value="${escapeHtml(state.activityCustomStart)}"></label>
      <label class="form-field"><span>End Date</span><input type="date" name="activityEnd" value="${escapeHtml(state.activityCustomEnd)}"></label>
    `
    customDates.querySelector('[name="activityStart"]').addEventListener('change', (event) => {
      state.activityCustomStart = event.target.value
      render()
    })
    customDates.querySelector('[name="activityEnd"]').addEventListener('change', (event) => {
      state.activityCustomEnd = event.target.value
      render()
    })
    activityBody.append(customDates)
  }

  const activitySearch = document.createElement('form')
  activitySearch.className = 'activity-search-form'
  activitySearch.innerHTML = `
    <label class="form-field"><span>Search Activity</span><input name="activitySearch" value="${escapeHtml(state.activitySearch)}" placeholder="Cigar, event, purchase, location, or notes"></label>
    <label class="form-field"><span>Lot ID</span><input name="activityLotId" type="number" min="1" step="1" value="${escapeHtml(state.activityLotId)}" placeholder="All Lots"></label>
    <button class="primary-button" type="submit">Apply</button>
    <button class="secondary-button" type="button" data-clear-activity>Clear Filters</button>
  `
  activitySearch.addEventListener('submit', (event) => {
    event.preventDefault()
    const data = new FormData(activitySearch)
    state.activitySearch = String(data.get('activitySearch') || '').trim()
    state.activityLotId = String(data.get('activityLotId') || '').trim()
    state.reversingEventId = null
    render()
  })
  activitySearch.querySelector('[data-clear-activity]').addEventListener('click', () => {
    state.activityPeriod = 'lifetime'
    state.activityType = 'all'
    state.activitySearch = ''
    state.activityLotId = ''
    state.activityHumidorId = ''
    state.activityCustomStart = ''
    state.activityCustomEnd = ''
    state.showAllActivity = false
    state.reversingEventId = null
    render()
  })
  activityBody.append(activitySearch)

  const savedViews = reportsSavedViews()
  const savedViewBar = document.createElement('div')
  savedViewBar.className = 'collection-saved-view-bar report-saved-view-bar'
  savedViewBar.innerHTML = `
    <label class="form-field collection-saved-view-select-field">
      <span>Saved Views</span>
      <select data-reports-view-select>
        <option value="">Load a saved view...</option>
        ${savedViews.map((view) => `<option value="${escapeHtml(view.name)}">${escapeHtml(view.name)}</option>`).join('')}
      </select>
    </label>
    <label class="form-field collection-saved-view-name-field">
      <span>View Name</span>
      <input type="text" data-reports-view-name placeholder="Current report filters">
    </label>
    <button type="button" class="primary-button" data-save-reports-view>Save View</button>
    <button type="button" class="secondary-button" data-delete-reports-view ${savedViews.length === 0 ? 'disabled' : ''}>Delete View</button>
  `
  const savedViewSelect = savedViewBar.querySelector('[data-reports-view-select]')
  const savedViewNameInput = savedViewBar.querySelector('[data-reports-view-name]')
  const saveReportsViewButton = savedViewBar.querySelector('[data-save-reports-view]')
  const deleteReportsViewButton = savedViewBar.querySelector('[data-delete-reports-view]')
  const matchingView = savedViews.find((view) => reportsViewMatchesCurrent(view.snapshot))
  if (matchingView) {
    savedViewSelect.value = matchingView.name
  }
  const syncSavedViewButtons = () => {
    const canSave = String(savedViewNameInput.value || '').trim().length > 0
    saveReportsViewButton.disabled = !canSave
    deleteReportsViewButton.disabled = savedViews.length === 0 || !savedViewSelect.value
  }
  savedViewNameInput.addEventListener('input', syncSavedViewButtons)
  savedViewSelect.addEventListener('change', () => {
    if (applyReportsView(savedViewSelect.value)) return
    savedViewSelect.value = ''
  })
  saveReportsViewButton.addEventListener('click', () => {
    if (!saveReportsView(savedViewNameInput.value)) return
    render()
  })
  deleteReportsViewButton.addEventListener('click', () => {
    if (!deleteReportsView(savedViewSelect.value)) return
    render()
  })
  syncSavedViewButtons()

  if (displayedActivity.length === 0) {
    const empty = document.createElement('div')
    empty.className = 'empty-state'
    empty.innerHTML = '<p>No inventory events match the selected Activity filters.</p>'
    activityBody.append(empty)
    view.append(activity, savedViewBar)
    return
  }

  const tableWrap = document.createElement('div')
  tableWrap.className = 'table-scroll'
  const table = document.createElement('table')
  table.className = 'data-table activity-table'
  table.innerHTML = `
    <thead>
      <tr>
        <th>Date</th>
        <th>Type</th>
        <th>Cigar</th>
        <th>Location</th>
        <th>Qty</th>
        <th>Cost / Cigar</th>
        <th>MSRP / Cigar</th>
        <th>Reference</th>
        <th>Actions</th>
      </tr>
    </thead>
    <tbody></tbody>
  `
  const tbody = table.querySelector('tbody')
  displayedActivity.forEach((event) => {
    const cigar = activityEventCigar(event)
    const row = document.createElement('tr')
    row.innerHTML = `
      <td>${escapeHtml(activityEventDate(event))}</td>
      <td>${escapeHtml(inventoryEventDisplayType(event))}</td>
      <td class="activity-cigar-cell"></td>
      <td>${escapeHtml(activityEventLocationLabel(event))}</td>
      <td>${formatCount(inventoryEventDisplayQuantity(event))}</td>
      <td>${escapeHtml(money(event.costPerCigarAtEvent))}</td>
      <td>${escapeHtml(money(event.msrpPerCigarAtEvent))}</td>
      <td class="activity-reference-cell"></td>
      <td class="row-actions"></td>
    `
    const cigarCell = row.querySelector('.activity-cigar-cell')
    if (cigar) {
      const cigarLink = document.createElement('button')
      cigarLink.type = 'button'
      cigarLink.className = 'linkish-button'
      cigarLink.textContent = cigarName(cigar)
      cigarLink.addEventListener('click', () => {
        state.selectedCatalogHistoryCigarId = Number(cigar.id)
        state.catalogSearch = ''
        state.editing['catalog-cigars'] = null
        navigateToPage('Catalog')
      })
      cigarCell.append(cigarLink)
    }
    renderActivityReference(row.querySelector('.activity-reference-cell'), event)
    const actions = row.querySelector('.row-actions')
    const contextTarget = activityEventContextTarget(event)
    if (contextTarget) {
      const openContext = document.createElement('button')
      openContext.type = 'button'
      openContext.className = 'secondary-button compact-button'
      openContext.textContent = contextTarget.label
      openContext.addEventListener('click', () => openActivityEventContext(event))
      actions.append(openContext)
    }
    if (inventoryEventCanBeReversed(event)) {
      const reverse = document.createElement('button')
      reverse.type = 'button'
      reverse.className = 'secondary-button compact-button'
      reverse.textContent = 'Reverse'
      reverse.addEventListener('click', () => {
        state.reversingEventId = Number(state.reversingEventId || 0) === Number(event.id) ? null : Number(event.id)
        render()
      })
      actions.append(reverse)
    }
    tbody.append(row)
    if (Number(state.reversingEventId || 0) === Number(event.id)) {
      const formRow = document.createElement('tr')
      formRow.className = 'collection-expanded-row'
      formRow.innerHTML = `
        <td colspan="9">
          <form class="inline-move-form is-open" data-reversal-form>
            <label class="form-field"><span>Reversal Date</span><input name="eventDate" type="date" min="${escapeHtml(displayDate(event.eventDate))}" max="${todayIsoDate()}" value="${todayIsoDate()}" required></label>
            <label class="form-field wide"><span>Correction Reason</span><textarea name="notes" rows="2" required></textarea></label>
            <button type="submit" class="primary-button compact-button">Confirm Reversal</button>
            <button type="button" class="secondary-button compact-button" data-cancel-reversal>Cancel</button>
          </form>
        </td>
      `
      const form = formRow.querySelector('[data-reversal-form]')
      form.querySelector('[data-cancel-reversal]').addEventListener('click', () => {
        state.reversingEventId = null
        render()
      })
      form.addEventListener('submit', async (submitEvent) => {
        submitEvent.preventDefault()
        const data = new FormData(form)
        try {
          await apiPost(`/inventory-events/${event.id}/reverse`, {
            eventDate: String(data.get('eventDate') || '').trim(),
            notes: String(data.get('notes') || '').trim(),
            idempotencyKey: reversalIdempotencyKey(event.id),
          })
          delete state.reversalKeys[String(Number(event.id))]
          state.reversingEventId = null
          state.formError = null
          await refreshCollections(['purchases', 'purchase-lines', 'lots', 'lot-location-balances', 'inventory-events', 'smoking-journal-entries'])
        } catch (error) {
          state.formError = error.message
        }
        render()
      })
      tbody.append(formRow)
    }
  })
  tableWrap.append(table)
    activityBody.append(tableWrap)

  view.append(activity, savedViewBar)
}

async function ensureAuditData() {
  state.auditData = await apiGet('/audit')
}

function renderHiddenPageTools(view) {
  const tools = document.createElement('div')
  tools.className = 'hidden-page-tools'
  tools.innerHTML = `
    <a class="secondary-button compact-button" href="j/">Jason Tools</a>
    <button type="button" class="secondary-button compact-button" data-page="Dashboard">Dashboard</button>
  `
  tools.querySelector('button').addEventListener('click', () => navigateToPage('Dashboard'))
  view.append(tools)
}
function renderAudit(view) {
  renderHiddenPageTools(view)
  const rows = state.auditData?.records || []
  const summary = document.createElement('p')
  summary.className = 'muted'
  summary.textContent = `${formatCount(state.auditData?.total || 0)} audit records tracked in the external runtime audit log.`
  const table = document.createElement('table')
  table.className = 'data-table'
  table.innerHTML = `
    <thead>
      <tr>
        <th>Date-Time</th>
        <th>User</th>
        <th>Page</th>
        <th>Action</th>
      </tr>
    </thead>
    <tbody></tbody>
  `
  const tbody = table.querySelector('tbody')
  rows.forEach((record) => {
    const row = document.createElement('tr')
    row.innerHTML = `
      <td>${escapeHtml(record.dateTime || '')}</td>
      <td>${escapeHtml(record.user || '')}</td>
      <td>${escapeHtml(record.page || '')}</td>
      <td>${escapeHtml(record.action || '')}</td>
    `
    tbody.append(row)
  })
  view.append(summary, table)
}

async function ensureChangelog() {
  state.changelog = await apiGet('/changelog')
}

function renderChangelog(view) {
  renderHiddenPageTools(view)
  const panel = document.createElement('pre')
  panel.className = 'markdown-panel'
  panel.textContent = state.changelog?.content || 'CHANGELOG.md is empty.'
  view.append(panel)
}

async function ensureTodo() {
  state.todo = await apiGet('/todo')
}

function renderTodo(view) {
  renderHiddenPageTools(view)
  const panel = document.createElement('pre')
  panel.className = 'markdown-panel'
  panel.textContent = state.todo?.content || 'TODO.md is empty.'
  view.append(panel)
}

function renderLogin(view) {
  const panel = document.createElement('form')
  panel.className = 'login-panel'
  panel.innerHTML = `
    <h3>Sign In</h3>
    <p class="muted">Use your HumidorHQ username and password to manage data.</p>
    <label>
      <span>Username</span>
      <input name="username" autocomplete="username" required>
    </label>
    <label>
      <span>Password</span>
      <input name="password" type="password" autocomplete="current-password" required>
    </label>
    <button type="submit" class="primary-button">Sign in</button>
    <p class="form-error" hidden></p>
  `

  const error = panel.querySelector('.form-error')
  if (state.authError) {
    error.textContent = state.authError
    error.hidden = false
  }

  panel.addEventListener('submit', async (event) => {
    event.preventDefault()
    const formData = new FormData(panel)
    state.authError = null
    try {
      state.session = await apiPost('/login', {
        username: String(formData.get('username') || ''),
        password: String(formData.get('password') || ''),
      })
      setActivePage('Dashboard')
      await refreshSampleData()
      await recordPageView(state.activePage)
    } catch (error) {
      state.authError = error.message
    }
    render()
  })

  view.append(panel)
}

function renderError(view) {
  const message = document.createElement('div')
  message.className = 'error-state'
  message.innerHTML = `
    <h3>Data could not be loaded</h3>
    <p>${escapeHtml(state.error.message)}</p>
  `
  view.append(message)
}

function render() {
  renderProjectMeta()
  renderSidebarAccount()
  renderNav()
  renderSidebarState()

  document.querySelector('#page-title').textContent = isAuthenticated() ? pageLabel(state.activePage) : 'Sign In'
  document.querySelector('.hero-panel').classList.remove('purchase-hero')
  const pageSubtitle = document.querySelector('#page-subtitle')
  pageSubtitle.textContent = ''
  pageSubtitle.hidden = true
  document.querySelector('#page-actions').replaceChildren()
  const view = document.querySelector('#app-view')
  view.replaceChildren()
  window.requestAnimationFrame(() => enhanceResponsiveTables(view))

  if (state.isLoading) {
    view.innerHTML = '<p class="muted">Checking session...</p>'
    return
  }

  if (!isAuthenticated()) {
    renderLogin(view)
    return
  }

  if (state.error) {
    renderError(view)
    return
  }

  if (!state.sampleData) {
    view.innerHTML = '<p class="muted">Loading JSON data through PHP...</p>'
    return
  }

  if ((pageDependencies[state.activePage] || []).length > 0 && !customPageReady(state.activePage)) {
    view.innerHTML = '<p class="muted">Loading records...</p>'
    ensurePageData(state.activePage).then(render).catch((error) => { state.error = error; render() })
    return
  }

  if (state.activePage === 'Dashboard') {
    renderDashboard(view)
    return
  }
  if (state.activePage === 'Collection') {
    renderCollectionPage(view)
    return
  }
  if (state.activePage === 'Purchases') {
    renderPurchasesPage(view)
    return
  }
  if (state.activePage === 'Humidors') {
    renderHumidorsPage(view)
    return
  }
  if (state.activePage === 'Reports') {
    renderReportsPage(view)
    return
  }
  if (state.activePage === 'Backups') {
    if (!state.backupData) {
      view.innerHTML = '<p class="muted">Loading backups...</p>'
      ensurePageData('Backups').then(render).catch((error) => { state.error = error; render() })
      return
    }
    renderBackupPage(view)
    return
  }
  if (state.activePage === 'ProductionImport') {
    if (!state.productionImportData) {
      view.innerHTML = '<p class="muted">Loading production import status...</p>'
      ensurePageData('ProductionImport').then(render).catch((error) => { state.error = error; render() })
      return
    }
    renderProductionImportPage(view)
    return
  }

  const managedPage = managedPages[state.activePage]
  if (managedPage) {
    if ([managedPage.collection, ...(managedPage.dependencies || [])].some((collection) => !state.records[collection])) {
      view.innerHTML = '<p class="muted">Loading records...</p>'
      ensurePageData(state.activePage).then(render).catch((error) => { state.error = error; render() })
      return
    }
    renderManagedTable(view, managedPage)
    if (!managedPage.inlineEdit || !state.editing[managedPage.collection]) {
      view.append(renderManagedForm(document.createElement('div'), managedPage))
    }
    return
  }

  if (state.activePage === 'Audit') {
    if (!state.auditData) {
      view.innerHTML = '<p class="muted">Loading audit activity...</p>'
      ensureAuditData().then(render).catch((error) => { state.error = error; render() })
      return
    }
    renderAudit(view)
    return
  }

  if (state.activePage === 'Changelog') {
    if (!state.changelog) {
      view.innerHTML = '<p class="muted">Loading changelog...</p>'
      ensureChangelog().then(render).catch((error) => { state.error = error; render() })
      return
    }
    renderChangelog(view)
    return
  }

  if (state.activePage === 'Todo') {
    if (!state.todo) {
      view.innerHTML = '<p class="muted">Loading todo list...</p>'
      ensureTodo().then(render).catch((error) => { state.error = error; render() })
      return
    }
    renderTodo(view)
  }
}

async function init() {
  initializeSidebarToggle()
  setActivePage(pageFromHash(), { updateHash: false })
  render()
  try {
    state.appMeta = await apiGet('/app-meta')
    state.session = await apiGet('/session')
    if (isAuthenticated()) {
      await refreshSampleData()
      await ensurePageData(state.activePage)
      await recordPageView(state.activePage)
    }
  } catch (error) {
    state.error = error
  } finally {
    state.isLoading = false
    render()
  }
}

window.addEventListener('hashchange', () => {
  const nextPage = pageFromHash()
  if (nextPage === state.activePage) {
    return
  }
  setActivePage(nextPage, { updateHash: false })
  render()
  ensurePageData(state.activePage).then(() => {
    render()
    recordPageView(state.activePage)
  }).catch((error) => {
    state.error = error
    render()
  })
})

init()
