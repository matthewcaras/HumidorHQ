/*
 * Filename: app.js
 * Revision: 1.11.3
 * Description: Plain JavaScript browser source for HumidorHQ inventory, purchase, humidor, and report workflows.
 * Modified Date: 2026-07-17 9:03 AM ET
 */

const API_BASE_URL = 'api'
const SIDEBAR_COLLAPSED_KEY = 'humidorhq-sidebar-collapsed'
const SHORTCUT_PREFIX = '!'
const PRIVATE_PAGE_SHORTCUT = { token: 'jnl', command: '!jnl', path: 'j/' }
const PAGE_SHORTCUTS = [
  { token: 'das', page: 'Dashboard' },
  { token: 'col', page: 'Collection' },
  { token: 'cat', page: 'Catalog' },
  { token: 'ven', page: 'Vendors' },
  { token: 'pur', page: 'Purchases' },
  { token: 'hum', page: 'Humidors' },
  { token: 'rep', page: 'Reports' },
]
const MAX_SHORTCUT_LENGTH = Math.max(PRIVATE_PAGE_SHORTCUT.token.length, ...PAGE_SHORTCUTS.map((shortcut) => shortcut.token.length))

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
  sidebarCollapsed: localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true',
  collectionSort: 'alpha',
  collectionDirection: 'asc',
  collectionHumidorFilterId: null,
  collectionSectionFilterId: null,
  selectedCollectionCigarId: null,
  selectedPurchaseId: null,
  editingPurchaseLineId: null,
  purchaseLineCatalogId: null,
  purchaseDraftLines: [],
  purchaseDraftOrder: null,
  purchaseDraftEntry: null,
  showPurchaseCatalogCreate: false,
  showPurchaseOrderForm: false,
  selectedHumidorId: null,
  editingHumidorSectionId: null,
  reportPeriod: 'lifetime',
  reportRemovalType: 'all',
  reportSearch: '',
  reportCustomStart: '',
  reportCustomEnd: '',
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
  { id: 'Audit', label: 'Audit', hidden: true },
  { id: 'Changelog', label: 'Changelog', hidden: true },
  { id: 'Todo', label: 'TODO', hidden: true },
]

const purchaseStatusOptions = [
  { value: 'pending', label: 'Pending' },
  { value: 'received', label: 'Received' },
]

const pageDependencies = {
  Dashboard: ['catalog-cigars', 'purchases', 'purchase-lines', 'lots', 'lot-location-balances', 'inventory-events', 'storage-locations', 'storage-sub-locations'],
  Collection: ['catalog-cigars', 'purchases', 'purchase-lines', 'lots', 'lot-location-balances', 'inventory-events', 'storage-locations', 'storage-sub-locations'],
  Purchases: ['purchases', 'vendors', 'catalog-cigars', 'purchase-lines', 'storage-locations', 'storage-sub-locations', 'lots', 'lot-location-balances', 'inventory-events'],
  Humidors: ['storage-locations', 'storage-sub-locations', 'catalog-cigars', 'purchase-lines', 'purchases', 'lots', 'lot-location-balances', 'inventory-events'],
  Reports: ['catalog-cigars', 'purchases', 'purchase-lines', 'lots', 'lot-location-balances', 'inventory-events', 'storage-locations', 'storage-sub-locations'],
}

const managedPages = {
  Catalog: {
    collection: 'catalog-cigars',
    title: 'Catalog Cigar',
    intro: 'Add and maintain master cigar records. Quantity totals are calculated from linked purchase and inventory records.',
    inlineEdit: true,
    dependencies: ['purchase-lines', 'lots', 'lot-location-balances'],
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
      { name: 'notes', label: 'Notes', type: 'textarea' },
    ],
    columns: [
      { label: 'Cigar', value: (row) => cigarName(row) },
      { label: 'Vitola', value: (row) => row.vitola || '' },
      { label: 'Wrapper', value: (row) => row.wrapper || '' },
      { label: 'Purchased', value: (row) => formatCount(purchasedQuantityForCatalog(row.id)) },
      { label: 'On Hand', value: (row) => formatCount(onHandQuantityForCatalog(row.id)) },
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
  if (options.updateHash !== false && window.location.hash !== `#${encodeURIComponent(nextPage)}`) {
    window.location.hash = encodeURIComponent(nextPage)
  }
}

function navigateToPage(pageId) {
  setActivePage(pageId)
  render()
  recordPageView(state.activePage)
}

function applySidebarCollapsed() {
  const shell = document.querySelector('.app-shell')
  const toggle = document.querySelector('#sidebar-toggle')
  if (!shell || !toggle) {
    return
  }
  shell.classList.toggle('sidebar-collapsed', state.sidebarCollapsed)
  toggle.setAttribute('aria-expanded', String(!state.sidebarCollapsed))
  toggle.textContent = state.sidebarCollapsed ? 'Open Menu' : 'Close Menu'
  toggle.title = state.sidebarCollapsed ? 'Open Menu' : 'Close Menu'
}

function toggleSidebar() {
  state.sidebarCollapsed = !state.sidebarCollapsed
  localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(state.sidebarCollapsed))
  applySidebarCollapsed()
  renderNav()
}

function installSidebarToggle() {
  const toggle = document.querySelector('#sidebar-toggle')
  if (!toggle || toggle.dataset.bound === 'true') {
    return
  }
  toggle.dataset.bound = 'true'
  toggle.addEventListener('click', toggleSidebar)
}

function shortcutShouldIgnore(event) {
  if (event.ctrlKey || event.metaKey || event.altKey) {
    return true
  }
  const target = event.target
  return Boolean(target?.closest?.('input, textarea, select, [contenteditable="true"]'))
}

function installKeyboardShortcuts() {
  let commandBuffer = ''
  window.addEventListener('keydown', (event) => {
    if (shortcutShouldIgnore(event)) {
      commandBuffer = ''
      return
    }
    if (event.key === 'Escape') {
      commandBuffer = ''
      return
    }
    if (!isAuthenticated()) {
      commandBuffer = ''
      return
    }
    if (event.key.length !== 1) {
      commandBuffer = ''
      return
    }

    const key = event.key.toLowerCase()
    if (key === SHORTCUT_PREFIX) {
      commandBuffer = SHORTCUT_PREFIX
      return
    }
    if (!commandBuffer.startsWith(SHORTCUT_PREFIX)) {
      return
    }
    if (!/^[a-z0-9]$/.test(key)) {
      commandBuffer = ''
      return
    }

    commandBuffer = `${commandBuffer}${key}`.slice(0, MAX_SHORTCUT_LENGTH + 1)
    const token = commandBuffer.slice(1)
    const pageShortcut = PAGE_SHORTCUTS.find((shortcut) => shortcut.token === token)
    if (pageShortcut) {
      event.preventDefault()
      commandBuffer = ''
      navigateToPage(pageShortcut.page)
      return
    }
    if (token === PRIVATE_PAGE_SHORTCUT.token) {
      event.preventDefault()
      commandBuffer = ''
      window.location.href = PRIVATE_PAGE_SHORTCUT.path
      return
    }
    if (token.length >= MAX_SHORTCUT_LENGTH) {
      commandBuffer = ''
    }
  })
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

function roundMoney(value) {
  return Math.round(numericValue(value) * 100) / 100
}

function money(value) {
  if (value === null || value === undefined || value === '') {
    return ''
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
  return records('storage-sub-locations').filter((row) => Number(row.storageLocationId) === Number(storageLocationId)).length
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
  if (normalized === 'received') {
    return 'received'
  }
  return 'pending'
}

function purchaseIsReceived(purchase) {
  return normalizePurchaseStatus(purchase?.status) === 'received'
}

function enRoutePurchaseQuantity() {
  return records('purchase-lines')
    .filter((line) => {
      const purchase = recordById('purchases', line.purchaseId)
      return purchase && !purchaseIsReceived(purchase)
    })
    .reduce((total, line) => total + numericValue(line.quantity), 0)
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
  return '2026-07-16'
}

function draftLineSubtotal(line) {
  return roundMoney(line.totalPrice)
}

function purchaseLineTrueCostPerCigar(line) {
  if (line?.trueCostPerCigar !== null && line?.trueCostPerCigar !== undefined && line?.trueCostPerCigar !== '') {
    return line.trueCostPerCigar
  }
  const quantity = Math.max(1, numericValue(line?.quantity))
  const basis = numericValue(line?.trueCostBasis || line?.purchasePrice || line?.lineSubtotal)
  return roundMoney(basis / quantity)
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
    return {
      ...item,
      lotCount: item.lotIds.size,
      locationCount: locations.length,
      locations,
      primaryLocationLabel: locations[0]?.label || '',
      totalSavings: item.totalMsrpValue - item.totalCostBasis,
      averageCostPerCigar,
      averageMsrpPerCigar,
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
        const totalCostBasis = item.balances.reduce((sum, balance) => sum + balance.quantity * numericValue(balance.costPerCigar), 0)
        const totalMsrpValue = item.balances.reduce((sum, balance) => sum + balance.quantity * numericValue(balance.msrpPerCigar), 0)
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
          totalCostBasis,
          totalMsrpValue,
          totalSavings: totalMsrpValue - totalCostBasis,
          averageCostPerCigar: totalQuantity > 0 ? totalCostBasis / totalQuantity : null,
          averageMsrpPerCigar: totalQuantity > 0 ? totalMsrpValue / totalQuantity : null,
          lotCount: new Set(item.balances.map((balance) => Number(balance.lot?.id || 0))).size,
          locationCount: locations.length,
          locations,
          primaryLocationLabel: locations[0]?.label || '',
          oldestDate: item.balances.reduce((oldest, balance) => !oldest || (balance.oldestDate && balance.oldestDate < oldest) ? balance.oldestDate : oldest, null),
        }
      })
      .filter((item) => item.totalQuantity > 0)
  }
  const totalQuantity = items.reduce((sum, item) => sum + item.totalQuantity, 0)
  const totalCostBasis = items.reduce((sum, item) => sum + item.totalCostBasis, 0)
  const totalMsrpValue = items.reduce((sum, item) => sum + item.totalMsrpValue, 0)
  return {
    items,
    totalQuantity,
    uniqueCigarCount: items.length,
    humidorCount: records('storage-locations').length,
    currentCostBasis: totalCostBasis,
    currentMsrpValue: totalMsrpValue,
    currentSavings: totalMsrpValue - totalCostBasis,
    averageCostPerCigar: totalQuantity > 0 ? totalCostBasis / totalQuantity : null,
    averageMsrpPerCigar: totalQuantity > 0 ? totalMsrpValue / totalQuantity : null,
  }
}

function removalEventsOfType(type) {
  return records('inventory-events').filter((event) => normalizeEventType(event.eventType) === type)
}

function removalMetrics(type) {
  const events = removalEventsOfType(type)
  const quantity = events.reduce((sum, event) => sum + numericValue(event.quantity), 0)
  const totalCost = events.reduce((sum, event) => sum + numericValue(event.quantity) * numericValue(event.costPerCigarAtEvent), 0)
  const totalMsrp = events.reduce((sum, event) => sum + numericValue(event.quantity) * numericValue(event.msrpPerCigarAtEvent), 0)
  return {
    quantity,
    totalCost,
    totalMsrp,
    totalSavings: totalMsrp - totalCost,
    averageCostPerCigar: quantity > 0 ? totalCost / quantity : null,
    averageMsrpPerCigar: quantity > 0 ? totalMsrp / quantity : null,
  }
}

function buildHumidorSummaries() {
  const summaries = new Map()
  records('storage-locations').forEach((humidor) => {
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

function humidorCurrentCount(humidorId) {
  return buildHumidorSummaries().find((item) => Number(item.humidor.id) === Number(humidorId))?.totalQuantity || 0
}

function humidorOldestDate(humidorId) {
  return buildHumidorSummaries().find((item) => Number(item.humidor.id) === Number(humidorId))?.oldestDate || null
}

function recentEvents() {
  return [...records('inventory-events')]
    .sort((left, right) => {
      const leftDate = left.eventDate || left.occurredAt || left.updatedAt || ''
      const rightDate = right.eventDate || right.occurredAt || right.updatedAt || ''
      return rightDate.localeCompare(leftDate) || Number(right.id || 0) - Number(left.id || 0)
    })
    .slice(0, 12)
}

function customPageReady(pageId) {
  const needed = pageDependencies[pageId] || []
  return needed.every((collection) => Array.isArray(state.records[collection]))
}

function collectionSortLabel(value) {
  if (value === 'location') {
    return 'Humidor Location'
  }
  return 'Alphabetical'
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
  const response = await fetch(`${API_BASE_URL}${path}`, {
    credentials: 'same-origin',
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
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
  const managedPage = managedPages[pageId]
  if (managedPage) {
    await Promise.all([managedPage.collection, ...(managedPage.dependencies || [])].map(ensureRecords))
  }
  await Promise.all((pageDependencies[pageId] || []).map(ensureRecords))
}

async function recordPageView(page) {
  if (!isAuthenticated()) {
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
  if (!isAuthenticated()) {
    nav.replaceChildren()
    return
  }
  nav.replaceChildren(
    ...pages.filter((page) => !page.hidden).map((page) => {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = page.id === state.activePage ? 'nav-item active' : 'nav-item'
      button.textContent = state.sidebarCollapsed ? page.label.slice(0, 2) : page.label
      button.title = page.label
      button.setAttribute('aria-label', page.label)
      button.disabled = !isAuthenticated()
      button.addEventListener('click', () => navigateToPage(page.id))
      return button
    }),
  )
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
    await apiPost('/logout')
    state.session = { authenticated: false, user: null }
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
  const displayValue = typeof value === 'number'
    ? (moneyMode ? money(value) : formatCount(value))
    : String(value)
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
  return `${numericValue(value).toFixed(1)}%`
}

function savingsPercent(cost, msrp) {
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

function renderDashboard(view) {
  const current = currentCollectionMetrics(false)
  const enRouteQuantity = enRoutePurchaseQuantity()
  const smoked = removalMetrics('SMOKED')
  const gifted = removalMetrics('GIFTED')
  const lifetimeCost = current.currentCostBasis + smoked.totalCost + gifted.totalCost
  const lifetimeMsrp = current.currentMsrpValue + smoked.totalMsrp + gifted.totalMsrp
  const lifetimeSavings = lifetimeMsrp - lifetimeCost
  const lifetimeSavingsDisplay = `${money(lifetimeSavings)} (${formatPercent(savingsPercent(lifetimeCost, lifetimeMsrp))})`
  const humidors = buildHumidorSummaries()
  const shell = document.createElement('div')
  shell.className = 'dashboard-shell'

  const summary = document.createElement('section')
  summary.className = 'dashboard-summary'
  summary.append(
    inventoryStatusCard(current.totalQuantity, enRouteQuantity, current.uniqueCigarCount),
    metricCard('Cost Basis', current.currentCostBasis, 'Current value paid for inventory', true),
    metricCard('MSRP Value', current.currentMsrpValue, 'Current retail value of inventory', true),
    metricCard('Savings', lifetimeSavingsDisplay, 'Lifetime MSRP minus lifetime cost basis'),
    metricCard('Avg Cost', current.averageCostPerCigar || 0, 'Average cost per cigar on hand', true),
    metricCard('Avg MSRP', current.averageMsrpPerCigar || 0, 'Average MSRP per cigar on hand', true),
  )

  const lifetime = document.createElement('section')
  lifetime.className = 'dashboard-panel'
  lifetime.innerHTML = `
    <div class="section-heading compact-heading">
      <div>
        <h3>Consumption Totals</h3>
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
    button.addEventListener('click', () => {
      state.collectionHumidorFilterId = Number(button.dataset.humidorId || 0)
      state.selectedCollectionCigarId = null
      navigateToPage('Collection')
    })
  })

  const body = document.createElement('div')
  body.className = 'dashboard-body'
  const main = document.createElement('div')
  main.className = 'dashboard-main-grid'
  main.append(humidorPanel)
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

function renderCollectionPage(view) {
  const metrics = currentCollectionMetrics()
  const items = sortCollectionItems(metrics.items)
  const selectedCigarId = Number(state.selectedCollectionCigarId || 0)
  const availableSections = records('storage-sub-locations')
    .filter((section) => !state.collectionHumidorFilterId || Number(section.storageLocationId) === Number(state.collectionHumidorFilterId))
    .sort((left, right) => sectionName(left).localeCompare(sectionName(right)))

  const controls = document.createElement('div')
  controls.className = 'section-heading'
  controls.innerHTML = `
    <div>
      <h3>Collection On Hand</h3>
      <p class="muted">${formatCount(metrics.totalQuantity)} cigars across ${formatCount(metrics.uniqueCigarCount)} catalog entries.${state.collectionHumidorFilterId ? ` Filtered to ${humidorName(state.collectionHumidorFilterId)}${state.collectionSectionFilterId ? ` / ${sectionName(recordById('storage-sub-locations', state.collectionSectionFilterId))}` : ''}.` : ''}</p>
    </div>
  `

  const controlBar = document.createElement('div')
  controlBar.className = 'collection-controls'
  const sortSelect = document.createElement('select')
  ;[
    { value: 'alpha', label: 'Alphabetical' },
    { value: 'location', label: 'Humidor Location' },
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
  humidorFilterSelect.append(new Option('All Humidors', ''))
  records('storage-locations')
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
  sectionFilterSelect.append(new Option('All Drawers', ''))
  availableSections.forEach((section) => sectionFilterSelect.append(new Option(sectionName(section), String(section.id))))
  sectionFilterSelect.value = state.collectionSectionFilterId ? String(state.collectionSectionFilterId) : ''
  sectionFilterSelect.disabled = !state.collectionHumidorFilterId || availableSections.length === 0
  sectionFilterSelect.addEventListener('change', () => {
    state.collectionSectionFilterId = sectionFilterSelect.value ? Number(sectionFilterSelect.value) : null
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
  if (state.collectionHumidorFilterId) {
    const clearButton = document.createElement('button')
    clearButton.type = 'button'
    clearButton.className = 'secondary-button'
    clearButton.textContent = 'Clear Humidor Filter'
    clearButton.addEventListener('click', () => {
      state.collectionHumidorFilterId = null
      state.collectionSectionFilterId = null
      state.selectedCollectionCigarId = null
      render()
    })
    controlBar.append(clearButton)
  }
  controlBar.append(sortSelect, humidorFilterSelect, sectionFilterSelect, directionButton)
  controls.append(controlBar)

  const summary = document.createElement('div')
  summary.className = 'metric-grid compact'
  summary.append(
    metricCard('On Hand', metrics.totalQuantity, 'Current cigars available'),
    metricCard('Cost Basis', metrics.currentCostBasis, 'Current cost basis of on-hand cigars', true),
    metricCard('MSRP Value', metrics.currentMsrpValue, 'Current MSRP of on-hand cigars', true),
  )

  if (items.length === 0) {
    const empty = document.createElement('div')
    empty.className = 'empty-state'
    empty.innerHTML = `
      <h3>No On-Hand Collection Yet</h3>
      <p>Create a purchase and at least one purchase line, or upload your Excel data so I can help convert it into local records.</p>
    `
    view.append(controls, summary, empty)
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
    row.className = isSelected ? 'selected-row' : ''
    row.innerHTML = `
      <td>
        <div class="collection-cigar-cell">
          <button type="button" class="linkish-button" data-cigar-id="${item.cigar.id}"><strong>${escapeHtml(cigarName(item.cigar))}</strong></button>
          <small>${strengthBadge(item.cigar.strength)} ${escapeHtml(item.cigar.wrapper || '')}</small>
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
    tbody.append(row)

    if (isSelected) {
      const detailRow = document.createElement('tr')
      detailRow.className = 'collection-expanded-row'
      detailRow.innerHTML = `
        <td colspan="7">
          <div class="collection-expanded-card">
            <div class="section-heading compact-heading">
              <div>
                <h3>${escapeHtml(cigarName(item.cigar))}</h3>
                <p class="muted">${strengthBadge(item.cigar.strength)} Wrapper ${escapeHtml(item.cigar.wrapper || 'Unknown')} • Binder ${escapeHtml(item.cigar.binder || 'Unknown')} • Filler ${escapeHtml(item.cigar.filler || 'Unknown')}</p>
              </div>
            </div>
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
                        </div>
                        <form class="inline-move-form" data-balance-id="${balance.balance.id}">
                          <input type="hidden" name="sourceBalanceId" value="${balance.balance.id}">
                          <label class="form-field">
                            <span>Qty</span>
                            <input name="quantity" type="number" min="1" max="${Math.max(1, Number(balance.quantity || 1))}" step="1" value="1" required>
                          </label>
                          <label class="form-field">
                            <span>Humidor</span>
                            <select name="toStorageLocationId" required data-destination-humidor>
                              <option value="">Select...</option>
                              ${records('storage-locations').map((humidor) => `<option value="${humidor.id}">${escapeHtml(humidor.name || `Humidor ${humidor.id}`)}</option>`).join('')}
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
      const cigarId = Number(button.dataset.cigarId || 0)
      state.selectedCollectionCigarId = Number(state.selectedCollectionCigarId || 0) === cigarId ? null : cigarId
      render()
    })
  })
  tableWrap.append(table)
  table.querySelectorAll('button[data-remove-balance-id]').forEach((button) => {
    button.addEventListener('click', async () => {
      try {
        await apiPost('/inventory/remove', {
          sourceBalanceId: String(button.dataset.removeBalanceId || '').trim(),
          quantity: '1',
          eventType: String(button.dataset.removeType || '').trim(),
          notes: `${button.dataset.removeType === 'GIFTED' ? 'Gifted' : 'Smoked'} from collection`,
        })
        await refreshCollections(['lot-location-balances', 'inventory-events'])
      } catch (error) {
        state.formError = error.message
      }
      render()
    })
  })
  table.querySelectorAll('button[data-move-toggle-id]').forEach((button) => {
    button.addEventListener('click', () => {
      const form = table.querySelector(`form[data-balance-id="${button.dataset.moveToggleId}"]`)
      form?.classList.toggle('is-open')
    })
  })
  table.querySelectorAll('form[data-balance-id]').forEach((form) => {
    const humidorSelect = form.querySelector('[data-destination-humidor]')
    const sectionSelect = form.querySelector('[data-destination-section]')
    const fillSections = () => {
      sectionSelect.replaceChildren(new Option('General', ''))
      records('storage-sub-locations')
        .filter((section) => Number(section.storageLocationId) === Number(humidorSelect.value || 0))
        .forEach((section) => sectionSelect.append(new Option(sectionName(section), String(section.id))))
    }
    humidorSelect.addEventListener('change', fillSections)
    fillSections()
    form.addEventListener('submit', async (event) => {
      event.preventDefault()
      try {
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

  view.append(controls, summary, tableWrap)
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
    const emptyOption = document.createElement('option')
    emptyOption.value = ''
    emptyOption.textContent = 'Select...'
    select.append(emptyOption)
    if (field.options) {
      field.options.forEach((option) => {
        const item = document.createElement('option')
        item.value = option.value
        item.textContent = option.label
        select.append(item)
      })
    } else {
      records(field.collection).forEach((option) => {
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

function renderManagedTable(view, pageConfig) {
  const collection = pageConfig.collection
  const rows = collection === 'purchases' ? sortPurchasesNewest(records(collection)) : records(collection)
  const inlineEdit = pageConfig.inlineEdit === true
  const heading = document.createElement('div')
  heading.className = 'section-heading'
  heading.innerHTML = `
    <div>
      <h3>${escapeHtml(pageConfig.title)} Records</h3>
      <p class="muted">${formatCount(rows.length)} records in <code>data/${escapeHtml(collection)}.json</code>.</p>
    </div>
  `

  if (rows.length === 0) {
    const empty = document.createElement('div')
    empty.className = 'empty-state'
    empty.innerHTML = `<p>No ${escapeHtml(pageConfig.title.toLowerCase())} records yet.</p>`
    view.append(heading, empty)
    return
  }

  const tableWrap = document.createElement('div')
  tableWrap.className = 'table-scroll'
  const table = document.createElement('table')
  table.className = 'data-table managed-table'
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
    pageConfig.columns.forEach((column) => {
      const cell = document.createElement('td')
      cell.textContent = column.value(record)
      row.append(cell)
    })
    const actions = document.createElement('td')
    actions.className = 'row-actions'

    if (!(collection === 'purchases' && purchaseIsReceived(record))) {
      const edit = document.createElement('button')
      edit.type = 'button'
      edit.className = 'secondary-button compact-button'
      edit.textContent = 'Edit'
      edit.addEventListener('click', () => {
        state.editing[collection] = record
        state.formError = null
        if (collection === 'purchases') {
          state.selectedPurchaseId = Number(record.id)
        }
        render()
      })
      actions.append(edit)
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

    actions.append(remove)
    row.append(actions)
    tbody.append(row)

    if (isEditing) {
      const editRow = document.createElement('tr')
      editRow.className = 'collection-expanded-row'
      const editCell = document.createElement('td')
      editCell.colSpan = pageConfig.columns.length + 1
      const editCard = document.createElement('div')
      editCard.className = 'collection-expanded-card'
      if (collection === 'purchases') {
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
  view.append(heading, tableWrap)
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
    payload.receivedDate = existingPurchase?.receivedDate || new Date().toISOString().slice(0, 10)
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
  msrpInput.value = draftEntry.msrpPerCigar || ''
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
      msrpInput.value = draftEntry.msrpPerCigar || (cigar.msrp ? String(cigar.msrp) : '')
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
  const form = document.createElement('form')
  form.className = 'data-form compact-top-gap'
  form.innerHTML = `
    <div class="section-heading">
      <div>
        <h3>Update Purchase Status</h3>
        <p class="muted">Pending purchase orders can be marked received here. Once received, assign the cigars below.</p>
      </div>
    </div>
  `
  const grid = document.createElement('div')
  grid.className = 'form-grid'
  ;[
    { label: 'Vendor', value: vendorName(purchase.vendorId) || 'Unassigned' },
    { label: 'Invoice / PO Number', value: purchase.invoiceNumber || '' },
    { label: 'Purchase Date', value: purchase.purchaseDate || '' },
    { label: 'Total Paid', value: money(purchase.totalPaid) },
  ].forEach((field) => {
    const label = document.createElement('label')
    label.className = 'form-field'
    label.innerHTML = `<span>${escapeHtml(field.label)}</span><input value="${escapeHtml(field.value)}" disabled>`
    grid.append(label)
  })
  const statusField = renderField(
    { name: 'status', label: 'Status', type: 'select', options: purchaseStatusOptions, required: true },
    { ...purchase, status: 'received' },
  )
  const receivedDateField = renderField({ name: 'receivedDate', label: 'Received Date', type: 'date' }, { ...purchase, receivedDate: purchase.receivedDate || todayIsoDate() })
  grid.append(statusField, receivedDateField)
  const actions = document.createElement('div')
  actions.className = 'form-actions'
  const save = document.createElement('button')
  save.type = 'submit'
  save.className = 'primary-button'
  save.textContent = 'Save Status'
  const cancel = document.createElement('button')
  cancel.type = 'button'
  cancel.className = 'secondary-button'
  cancel.textContent = 'Cancel'
  cancel.addEventListener('click', () => {
    state.editing.purchases = null
    state.formError = null
    render()
  })
  actions.append(save, cancel)
  form.append(grid, actions)
  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    try {
      const data = new FormData(form)
      await apiPut(`/records/purchases/${purchase.id}`, {
        ...purchase,
        status: String(data.get('status') || '').trim(),
        receivedDate: String(data.get('receivedDate') || '').trim(),
      })
      state.selectedPurchaseId = Number(purchase.id)
      await refreshCollections(['purchases', 'purchase-lines', 'lots', 'lot-location-balances', 'inventory-events'])
      state.editing.purchases = recordById('purchases', purchase.id) || purchase
    } catch (error) {
      state.formError = error.message
    }
    render()
  })
  container.append(form)
  const latestPurchase = recordById('purchases', purchase.id) || purchase
  renderReceivedAssignments(container, latestPurchase, records('purchase-lines').filter((line) => Number(line.purchaseId) === Number(purchase.id)))
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
  records('catalog-cigars').forEach((cigar) => cigarSelect.append(new Option(cigarName(cigar), String(cigar.id))))
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
  msrpInput.value = editingLine ? String(editingLine.msrpPerCigar || '') : ''

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

function renderReceivedAssignments(container, purchase, lines) {
  if (!purchaseIsReceived(purchase)) {
    return
  }
  const panel = document.createElement('section')
  panel.className = 'dashboard-panel compact-top-gap'
  panel.innerHTML = `
    <div class="section-heading">
      <div>
        <h3>Assign Received Cigars</h3>
        <p class="muted">Now that this order is received, assign each purchased cigar to a humidor and optional drawer.</p>
      </div>
    </div>
  `
  const unassigned = lines.filter((line) => Number(line.storageLocationId || 0) < 1)
  if (unassigned.length === 0) {
    const complete = document.createElement('p')
    complete.className = 'muted'
    complete.textContent = 'All received cigars on this order have already been assigned to a location.'
    panel.append(complete)
    container.append(panel)
    return
  }

  unassigned.forEach((line) => {
    const form = document.createElement('form')
    form.className = 'inline-assignment-form'
    form.innerHTML = `
      <strong>${escapeHtml(cigarNameById(line.catalogCigarId))}</strong>
      <span class="muted">${formatCount(line.quantity)} cigars</span>
    `
    const humidorSelect = document.createElement('select')
    humidorSelect.name = 'storageLocationId'
    humidorSelect.required = true
    humidorSelect.append(new Option('Select humidor...', ''))
    records('storage-locations').forEach((humidor) => humidorSelect.append(new Option(humidor.name || `Humidor ${humidor.id}`, String(humidor.id))))

    const sectionSelect = document.createElement('select')
    sectionSelect.name = 'storageSubLocationId'
    function fillSections() {
      sectionSelect.replaceChildren(new Option('General', ''))
      records('storage-sub-locations')
        .filter((section) => Number(section.storageLocationId) === Number(humidorSelect.value || 0))
        .forEach((section) => sectionSelect.append(new Option(sectionName(section), String(section.id))))
    }
    humidorSelect.addEventListener('change', fillSections)
    fillSections()

    const save = document.createElement('button')
    save.type = 'submit'
    save.className = 'primary-button compact-button'
    save.textContent = 'Assign Location'

    form.append(humidorSelect, sectionSelect, save)
    form.addEventListener('submit', async (event) => {
      event.preventDefault()
      try {
        await apiPut(`/records/purchase-lines/${line.id}`, purchaseLinePayloadFromRecord(line, {
          storageLocationId: String(humidorSelect.value || '').trim(),
          storageSubLocationId: String(sectionSelect.value || '').trim(),
        }))
        await refreshCollections(['purchase-lines', 'lots', 'lot-location-balances', 'inventory-events'])
      } catch (error) {
        state.formError = error.message
      }
      render()
    })
    panel.append(form)
  })
  container.append(panel)
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
      <p class="muted">Add cigars to a purchase order, then assign their location after the order is received.</p>
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
  const summary = document.createElement('div')
  summary.className = 'metric-grid compact'
  summary.append(
    metricCard('Status', purchaseStatusLabel(purchase.status), `${lines.length} linked line items`),
    metricCard('Qty Purchased', lines.reduce((sum, line) => sum + numericValue(line.quantity), 0), 'Cigars on this purchase'),
    metricCard('True Cost Basis', lines.reduce((sum, line) => sum + numericValue(line.trueCostBasis), 0), 'Allocated line cost basis', true),
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
    const locationLabel = Number(line.storageLocationId || 0) > 0
      ? [humidorName(line.storageLocationId), line.storageSubLocationId ? sectionName(recordById('storage-sub-locations', line.storageSubLocationId)) : 'General'].filter(Boolean).join(' / ')
      : 'Not assigned yet'
    row.innerHTML = `
      <td>${escapeHtml(cigarNameById(line.catalogCigarId))}</td>
      <td>${escapeHtml(locationLabel)}</td>
      <td>${formatCount(line.quantity)}</td>
      <td>${escapeHtml(money(line.purchasePrice || line.lineSubtotal))}</td>
      <td>${escapeHtml(money(line.msrpPerCigar || line.msrpPerCigarResolved))}</td>
      <td>${escapeHtml(money(purchaseLineTrueCostPerCigar(line)))}</td>
      <td>${escapeHtml(money(line.trueCostBasis))}</td>
      <td class="row-actions"></td>
    `
    const actions = row.querySelector('.row-actions')
    const remove = document.createElement('button')
    remove.type = 'button'
    remove.className = 'danger-button compact-button'
    remove.textContent = 'Delete'
    remove.disabled = purchaseIsReceived(purchase)
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

  renderReceivedAssignments(panel, purchase, lines)
  view.append(panel)
}

function renderPurchaseOverview(view) {
  const purchases = records('purchases')
  const lines = records('purchase-lines')
  const totalPaid = purchases.reduce((sum, purchase) => sum + numericValue(purchase.totalPaid), 0)
  const totalPurchased = lines.reduce((sum, line) => sum + numericValue(line.quantity), 0)

  const hero = document.querySelector('.hero-panel')
  const subtitle = document.querySelector('#page-subtitle')
  const pageActions = document.querySelector('#page-actions')
  hero.classList.add('purchase-hero')
  subtitle.textContent = 'Track vendor history, purchase costs, and line-level receiving.'
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
    const locationLabel = Number(line.storageLocationId || 0) > 0
      ? [humidorName(line.storageLocationId), line.storageSubLocationId ? sectionName(recordById('storage-sub-locations', line.storageSubLocationId)) : 'General'].filter(Boolean).join(' / ')
      : 'Not assigned yet'
    const row = document.createElement('tr')
    row.innerHTML = `
      <td>${escapeHtml(cigarNameById(line.catalogCigarId))}</td>
      <td>${escapeHtml(locationLabel)}</td>
      <td>${formatCount(line.quantity)}</td>
      <td>${escapeHtml(money(line.purchasePrice || line.lineSubtotal))}</td>
      <td>${escapeHtml(money(line.msrpPerCigar || line.msrpPerCigarResolved))}</td>
      <td>${escapeHtml(money(purchaseLineTrueCostPerCigar(line)))}</td>
      <td>${escapeHtml(money(line.trueCostBasis))}</td>
    `
    tbody.append(row)
  })
  tableWrap.append(table)
  container.append(tableWrap)
}

function renderPurchaseRecords(view) {
  const purchases = sortPurchasesNewest(records('purchases'))
  const heading = document.createElement('div')
  heading.className = 'section-heading purchase-records-heading'
  heading.innerHTML = `
    <div>
      <h3>Purchase Records</h3>
      <p class="muted">Select a purchase order to view its cigars. En route orders can be edited and received.</p>
    </div>
  `
  view.append(heading)

  if (purchases.length === 0) {
    const empty = document.createElement('div')
    empty.className = 'empty-state'
    empty.innerHTML = '<p>No purchase records yet.</p>'
    view.append(empty)
    return
  }

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
    row.className = 'clickable-record-row'
    row.tabIndex = 0
    row.setAttribute('aria-expanded', String(isExpanded))
    managedPages.Purchases.columns.forEach((column) => {
      const cell = document.createElement('td')
      cell.textContent = column.value(purchase)
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
    if (!purchaseIsReceived(purchase)) {
      const edit = document.createElement('button')
      edit.type = 'button'
      edit.className = 'primary-button compact-button'
      edit.textContent = 'Edit / Receive'
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
  const humidors = records('storage-locations')
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
  header.append(humidorSelect)
  panel.append(header)

  if (!state.selectedHumidorId) {
    panel.append(document.createTextNode('Create a humidor first.'))
    view.append(panel)
    return
  }

  const sections = records('storage-sub-locations').filter((row) => Number(row.storageLocationId) === Number(state.selectedHumidorId))
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
      <td>${escapeHtml(sectionName(section))}</td>
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
    actions.append(edit, remove)
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
  const location = humidorName(event.storageLocationId)
  const section = event.storageSubLocationId
    ? sectionName(recordById('storage-sub-locations', event.storageSubLocationId))
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
  return records('inventory-events')
    .filter((event) => ['SMOKED', 'GIFTED'].includes(normalizeEventType(event.eventType)))
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
      return [details.cigarLabel, details.locationLabel, details.lotLabel, event.notes]
        .some((value) => String(value || '').toLowerCase().includes(search))
    })
    .sort((left, right) => removalEventDate(right).localeCompare(removalEventDate(left)) || Number(right.id || 0) - Number(left.id || 0))
}

function removalReportMetrics(events) {
  const quantity = events.reduce((sum, event) => sum + numericValue(event.quantity), 0)
  const totalCost = events.reduce((sum, event) => sum + numericValue(event.quantity) * numericValue(event.costPerCigarAtEvent), 0)
  const totalMsrp = events.reduce((sum, event) => sum + numericValue(event.quantity) * numericValue(event.msrpPerCigarAtEvent), 0)
  return {
    quantity,
    smoked: events.filter((event) => normalizeEventType(event.eventType) === 'SMOKED').reduce((sum, event) => sum + numericValue(event.quantity), 0),
    gifted: events.filter((event) => normalizeEventType(event.eventType) === 'GIFTED').reduce((sum, event) => sum + numericValue(event.quantity), 0),
    totalCost,
    totalMsrp,
    totalSavings: totalMsrp - totalCost,
    averageCost: quantity > 0 ? totalCost / quantity : 0,
    averageMsrp: quantity > 0 ? totalMsrp / quantity : 0,
  }
}

function reportFilterButton(label, value, stateKey) {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = `report-filter-button${state[stateKey] === value ? ' active' : ''}`
  button.textContent = label
  button.addEventListener('click', () => {
    state[stateKey] = value
    if (stateKey === 'reportPeriod' && value === 'custom') {
      const year = new Date().getFullYear()
      state.reportCustomStart ||= `${year}-01-01`
      state.reportCustomEnd ||= todayIsoDate()
    }
    render()
  })
  return button
}

function renderRemovalHistory(view) {
  const events = filteredRemovalEvents()
  const metrics = removalReportMetrics(events)
  const panel = document.createElement('section')
  panel.className = 'dashboard-panel removal-report-panel'
  panel.innerHTML = `
    <div class="section-heading report-title">
      <div>
        <h3>Removal History</h3>
        <p class="muted">Choose a date range and removal type to recalculate the counts and values below.</p>
      </div>
    </div>
  `

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
  )
  removalType.append(typeButtons)
  filters.append(period, removalType)
  panel.append(filters)

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
    panel.append(customDates)
  }

  const searchForm = document.createElement('form')
  searchForm.className = 'report-search-form'
  searchForm.innerHTML = `
    <label class="form-field"><span>Search</span><input name="reportSearch" value="${escapeHtml(state.reportSearch)}" placeholder="Search cigar, location, notes, or lot number"></label>
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
  panel.append(searchForm)

  const counts = document.createElement('div')
  counts.className = 'metric-grid compact report-count-grid'
  counts.append(
    metricCard('Total Removed', metrics.quantity, ''),
    metricCard('Smoked', metrics.smoked, ''),
    metricCard('Gifted', metrics.gifted, ''),
  )
  panel.append(counts)

  const valuesTitle = document.createElement('h3')
  valuesTitle.className = 'report-values-title'
  valuesTitle.textContent = state.reportRemovalType === 'all'
    ? 'All Removal Values'
    : `${state.reportRemovalType === 'SMOKED' ? 'Smoked' : 'Gifted'} Values`
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
  panel.append(valuesTitle, values)

  const historyTitle = document.createElement('div')
  historyTitle.className = 'section-heading report-events-heading'
  historyTitle.innerHTML = `<div><h3>Removal Events</h3><p class="muted">${formatCount(events.length)} matching event records.</p></div>`
  panel.append(historyTitle)
  if (events.length === 0) {
    const empty = document.createElement('div')
    empty.className = 'empty-state'
    empty.innerHTML = '<p>No smoked or gifted events match the selected filters.</p>'
    panel.append(empty)
  } else {
    const tableWrap = document.createElement('div')
    tableWrap.className = 'table-scroll'
    const table = document.createElement('table')
    table.className = 'data-table'
    table.innerHTML = `
      <thead><tr><th>Date</th><th>Type</th><th>Cigar</th><th>Location</th><th>Qty</th><th>Cost / Cigar</th><th>MSRP / Cigar</th></tr></thead>
      <tbody></tbody>
    `
    const tbody = table.querySelector('tbody')
    events.forEach((event) => {
      const details = removalEventDetails(event)
      const row = document.createElement('tr')
      row.innerHTML = `
        <td>${escapeHtml(removalEventDate(event))}</td>
        <td>${escapeHtml(normalizeEventType(event.eventType))}</td>
        <td>${escapeHtml(details.cigarLabel)}</td>
        <td>${escapeHtml(details.locationLabel || 'Unassigned')}</td>
        <td>${formatCount(event.quantity)}</td>
        <td>${escapeHtml(money(event.costPerCigarAtEvent))}</td>
        <td>${escapeHtml(money(event.msrpPerCigarAtEvent))}</td>
      `
      tbody.append(row)
    })
    tableWrap.append(table)
    panel.append(tableWrap)
  }
  view.append(panel)
}

function renderReportsPage(view) {
  renderRemovalHistory(view)

  const activity = document.createElement('section')
  activity.className = 'dashboard-panel report-activity-panel'
  activity.innerHTML = `
    <div class="section-heading">
      <div>
        <h3>Activity</h3>
        <p class="muted">Purchase receipts, moves, smoked cigars, gifts, and discard events.</p>
      </div>
    </div>
  `
  const tableWrap = document.createElement('div')
  tableWrap.className = 'table-scroll'
  const table = document.createElement('table')
  table.className = 'data-table'
  table.innerHTML = `
    <thead>
      <tr>
        <th>Date</th>
        <th>Type</th>
        <th>Cigar</th>
        <th>Qty</th>
        <th>Cost / Cigar</th>
        <th>MSRP / Cigar</th>
      </tr>
    </thead>
    <tbody></tbody>
  `
  const tbody = table.querySelector('tbody')
  recentEvents().forEach((event) => {
    const lot = recordById('lots', event.lotId)
    const cigar = lot?.catalogCigarId ? recordById('catalog-cigars', lot.catalogCigarId) : recordById('catalog-cigars', event.catalogCigarId)
    const row = document.createElement('tr')
    row.innerHTML = `
      <td>${escapeHtml(displayDate(event.eventDate || event.occurredAt || event.updatedAt))}</td>
      <td>${escapeHtml(normalizeEventType(event.eventType))}</td>
      <td>${escapeHtml(cigar ? cigarName(cigar) : '')}</td>
      <td>${formatCount(event.quantity)}</td>
      <td>${escapeHtml(money(event.costPerCigarAtEvent))}</td>
      <td>${escapeHtml(money(event.msrpPerCigarAtEvent))}</td>
    `
    tbody.append(row)
  })
  tableWrap.append(table)
  activity.append(tableWrap)

  view.append(activity)
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
  summary.textContent = `${formatCount(state.auditData?.total || 0)} audit records tracked in data/audit-log.jsonl.`
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
  document.body.classList.toggle('auth-pending', state.isLoading)
  document.body.classList.toggle('is-authenticated', isAuthenticated())
  document.body.classList.toggle('is-unauthenticated', !state.isLoading && !isAuthenticated())
  installSidebarToggle()
  applySidebarCollapsed()
  renderProjectMeta()
  renderSidebarAccount()
  renderNav()

  document.querySelector('#page-title').textContent = isAuthenticated() ? pageLabel(state.activePage) : 'Sign In'
  document.querySelector('.hero-panel').classList.remove('purchase-hero')
  const pageSubtitle = document.querySelector('#page-subtitle')
  pageSubtitle.textContent = ''
  pageSubtitle.hidden = true
  document.querySelector('#page-actions').replaceChildren()
  const view = document.querySelector('#app-view')
  view.replaceChildren()

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

installKeyboardShortcuts()
init()
