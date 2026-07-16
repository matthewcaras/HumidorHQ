/*
 * Filename: app.js
 * Revision: 1.4.0
 * Description: Plain JavaScript browser source for HumidorHQ connected record management screens.
 * Modified Date: 2026-07-16 07:45 ET
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
  error: null,
  authError: null,
  formError: null,
  appMeta: null,
  isLoading: true,
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
  { id: 'Todo', label: 'Todo', hidden: true },
]

const purchaseStatusOptions = [
  { value: 'in-route', label: 'In Route' },
  { value: 'partially-received', label: 'Partially Received' },
  { value: 'received', label: 'Received' },
]

const managedPages = {
  Catalog: {
    collection: 'catalog-cigars',
    title: 'Catalog Cigar',
    intro: 'Add and maintain master cigar records. Quantity totals are calculated from PO Lines, lots, and humidor balances.',
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
      { label: 'Cigar', value: (row) => [row.manufacturer, row.series].filter(Boolean).join(' ') },
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
    intro: 'Track purchase headers from in-route through partial receipt and received status. PO Lines still hold cigar quantities.',
    dependencies: ['vendors', 'purchase-lines'],
    fields: [
      { name: 'vendorId', label: 'Vendor', type: 'select', collection: 'vendors', optionLabel: 'name' },
      { name: 'status', label: 'Status', type: 'select', options: purchaseStatusOptions, required: true },
      { name: 'purchaseDate', label: 'Purchase Date', type: 'date', required: true },
      { name: 'expectedDate', label: 'Expected Date', type: 'date' },
      { name: 'receivedDate', label: 'Received Date', type: 'date' },
      { name: 'trackingNumber', label: 'Tracking Number' },
      { name: 'invoiceNumber', label: 'Invoice / PO Number' },
      { name: 'shipping', label: 'Shipping', type: 'number', step: '0.01' },
      { name: 'exciseTax', label: 'Excise Tax', type: 'number', step: '0.01' },
      { name: 'salesTax', label: 'Sales Tax', type: 'number', step: '0.01' },
      { name: 'discount', label: 'Discount', type: 'number', step: '0.01' },
      { name: 'totalPaid', label: 'Total Paid', type: 'number', step: '0.01' },
      { name: 'notes', label: 'Notes', type: 'textarea' },
    ],
    columns: [
      { label: 'Date', value: (row) => row.purchaseDate || '' },
      { label: 'Status', value: (row) => purchaseStatusLabel(row.status) },
      { label: 'Vendor', value: (row) => vendorName(row.vendorId) },
      { label: 'Expected', value: (row) => row.expectedDate || '' },
      { label: 'Invoice / PO', value: (row) => row.invoiceNumber || '' },
      { label: 'Qty Purchased', value: (row) => formatCount(purchasedQuantityForPurchase(row.id)) },
      { label: 'Total', value: (row) => money(row.totalPaid) },
    ],
  },
  PurchaseLines: {
    collection: 'purchase-lines',
    title: 'Purchase Line',
    intro: 'Connect a purchase to a catalog cigar and humidor. Saving a line creates the linked lot, starting humidor balance, and purchase-receipt inventory event.',
    dependencies: ['purchases', 'catalog-cigars', 'storage-locations', 'vendors'],
    readOnlyActions: true,
    fields: [
      { name: 'purchaseId', label: 'Purchase / PO', type: 'select', collection: 'purchases', optionLabel: purchaseLabel, required: true },
      { name: 'catalogCigarId', label: 'Catalog Cigar', type: 'select', collection: 'catalog-cigars', optionLabel: cigarName, required: true },
      { name: 'storageLocationId', label: 'Humidor', type: 'select', collection: 'storage-locations', optionLabel: 'name', required: true },
      { name: 'quantity', label: 'Quantity', type: 'number', step: '1', required: true },
      { name: 'unitCost', label: 'Unit Cost', type: 'number', step: '0.01' },
      { name: 'notes', label: 'Notes', type: 'textarea' },
    ],
    columns: [
      { label: 'Purchase / PO', value: (row) => purchaseLabelById(row.purchaseId) },
      { label: 'Cigar', value: (row) => cigarNameById(row.catalogCigarId) },
      { label: 'Humidor', value: (row) => humidorName(row.storageLocationId) },
      { label: 'Qty', value: (row) => row.quantity ?? '' },
      { label: 'Line Total', value: (row) => money(Number(row.quantity || 0) * Number(row.unitCost || 0)) },
    ],
  },
  Humidors: {
    collection: 'storage-locations',
    title: 'Humidor',
    intro: 'Add humidors, tupperdores, coolers, or other storage locations. Drawer and shelf records are managed in Humidor Sections.',
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
      { label: 'Capacity', value: (row) => row.capacity ?? '' },
      { label: 'Sections', value: (row) => formatCount(humidorSectionCount(row.id)) },
      { label: 'Notes', value: (row) => row.notes || '' },
    ],
  },
  HumidorSections: {
    collection: 'storage-sub-locations',
    title: 'Humidor Section',
    intro: 'Add drawers, shelves, trays, or zones inside a humidor.',
    dependencies: ['storage-locations'],
    fields: [
      { name: 'storageLocationId', label: 'Humidor', type: 'select', collection: 'storage-locations', optionLabel: 'name', required: true },
      { name: 'name', label: 'Section Name', required: true },
      { name: 'type', label: 'Type' },
      { name: 'capacity', label: 'Capacity', type: 'number', step: '1' },
      { name: 'notes', label: 'Notes', type: 'textarea' },
    ],
    columns: [
      { label: 'Section', value: (row) => sectionName(row) },
      { label: 'Humidor', value: (row) => humidorName(row.storageLocationId) },
      { label: 'Type', value: (row) => row.type || '' },
      { label: 'Capacity', value: (row) => row.capacity ?? '' },
    ],
  },
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

function purchasedQuantityForCatalog(catalogCigarId) {
  const id = Number(catalogCigarId || 0)
  return (state.records['purchase-lines'] || [])
    .filter((row) => Number(row.catalogCigarId) === id)
    .reduce((total, row) => total + numericValue(row.quantity), 0)
}

function purchasedQuantityForPurchase(purchaseId) {
  const id = Number(purchaseId || 0)
  return (state.records['purchase-lines'] || [])
    .filter((row) => Number(row.purchaseId) === id)
    .reduce((total, row) => total + numericValue(row.quantity), 0)
}

function onHandQuantityForCatalog(catalogCigarId) {
  const id = Number(catalogCigarId || 0)
  const lotIds = new Set(
    (state.records.lots || [])
      .filter((row) => Number(row.catalogCigarId) === id)
      .map((row) => Number(row.id))
  )

  return (state.records['lot-location-balances'] || [])
    .filter((row) => lotIds.has(Number(row.lotId)))
    .reduce((total, row) => total + numericValue(row.quantity), 0)
}

function purchaseStatusLabel(value) {
  const option = purchaseStatusOptions.find((item) => item.value === value)
  return option?.label || ''
}

function humidorSectionCount(storageLocationId) {
  const id = Number(storageLocationId || 0)
  return (state.records['storage-sub-locations'] || []).filter((row) => Number(row.storageLocationId) === id).length
}

function sectionName(row) {
  return row?.name || `Section ${row?.id || ''}`.trim()
}

function money(value) {
  if (value === null || value === undefined || value === '') {
    return ''
  }
  return Number(value).toLocaleString(undefined, { style: 'currency', currency: 'USD' })
}

function vendorName(vendorId) {
  const id = Number(vendorId || 0)
  const vendor = (state.records.vendors || []).find((row) => Number(row.id) === id)
  return vendor?.name || ''
}


function cigarName(row) {
  return [row?.manufacturer, row?.series, row?.vitola].filter(Boolean).join(' ') || `Cigar ${row?.id || ''}`.trim()
}

function cigarNameById(cigarId) {
  const id = Number(cigarId || 0)
  const cigar = (state.records['catalog-cigars'] || []).find((row) => Number(row.id) === id)
  return cigar ? cigarName(cigar) : ''
}

function purchaseLabel(row) {
  const vendor = vendorName(row?.vendorId)
  const invoice = row?.invoiceNumber ? `PO ${row.invoiceNumber}` : `Purchase ${row?.id || ''}`
  return [invoice, vendor, row?.purchaseDate].filter(Boolean).join(' - ')
}

function purchaseLabelById(purchaseId) {
  const id = Number(purchaseId || 0)
  const purchase = (state.records.purchases || []).find((row) => Number(row.id) === id)
  return purchase ? purchaseLabel(purchase) : ''
}

function humidorName(storageLocationId) {
  const id = Number(storageLocationId || 0)
  const humidor = (state.records['storage-locations'] || []).find((row) => Number(row.id) === id)
  return humidor?.name || ''
}
function collectionCount(name) {
  return state.sampleData?.collections?.[name]?.count || 0
}

function setStatus(text, mode = 'neutral') {
  const status = document.querySelector('#api-status')
  if (!status) {
    return
  }
  status.textContent = text
  status.dataset.mode = mode
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

function isAuthenticated() {
  return state.session?.authenticated === true
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

async function ensureManagedPageData(pageConfig) {
  await Promise.all([pageConfig.collection, ...(pageConfig.dependencies || [])].map(ensureRecords))
}

async function recordPageView(page) {
  if (!isAuthenticated()) {
    return
  }
  try {
    await apiPost('/audit/page', { page, action: 'view' })
    state.auditData = null
  } catch {
    // Audit failure should not block navigation.
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
  meta.innerHTML = `
    <span>Rev ${escapeHtml(state.appMeta.revision)}</span>
    <span>Modified ${escapeHtml(state.appMeta.modifiedEt)}</span>
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
        state.activePage = page.id
        state.formError = null
        render()
        recordPageView(page.id)
      })
      return button
    }),
  )
}

function renderAccountBar(view) {
  if (!isAuthenticated()) {
    return
  }

  const accountBar = document.createElement('div')
  accountBar.className = 'account-bar'
  const userName = state.session.user?.displayName || state.session.user?.username || 'Signed in'
  accountBar.innerHTML = `<span>Signed in as <strong>${escapeHtml(userName)}</strong></span>`

  const logoutButton = document.createElement('button')
  logoutButton.type = 'button'
  logoutButton.className = 'secondary-button'
  logoutButton.textContent = 'Log out'
  logoutButton.addEventListener('click', async () => {
    await apiPost('/logout')
    state.session = { authenticated: false, user: null }
    state.sampleData = null
    state.records = {}
    state.editing = {}
    state.auditData = null
    state.changelog = null
    state.error = null
    state.authError = null
    state.formError = null
    setStatus('Signed out', 'neutral')
    render()
  })

  accountBar.append(logoutButton)
  view.append(accountBar)
}

function metricCard(label, value, detail) {
  const card = document.createElement('article')
  card.className = 'metric-card'
  card.innerHTML = `
    <span>${escapeHtml(label)}</span>
    <strong>${formatCount(value)}</strong>
    <small>${escapeHtml(detail)}</small>
  `
  return card
}

function renderDashboard(view) {
  const counts = {
    catalog: collectionCount('catalog-cigars'),
    vendors: collectionCount('vendors'),
    humidors: collectionCount('storage-locations'),
    purchases: collectionCount('purchases'),
    lines: collectionCount('purchase-lines'),
    lots: collectionCount('lots'),
    balances: collectionCount('lot-location-balances'),
    events: collectionCount('inventory-events'),
  }

  const shell = document.createElement('div')
  shell.className = 'dashboard-shell'

  const summary = document.createElement('section')
  summary.className = 'dashboard-summary'
  summary.append(
    metricCard('Catalog', counts.catalog, 'Master cigar records'),
    metricCard('Humidors', counts.humidors, 'Storage locations'),
    metricCard('Lots', counts.lots, 'Inventory lots'),
    metricCard('Events', counts.events, 'Inventory history'),
  )

  const inventory = document.createElement('section')
  inventory.className = 'dashboard-panel dashboard-inventory'
  inventory.innerHTML = `
    <div class="section-heading compact-heading">
      <div>
        <p class="eyebrow">Inventory Map</p>
        <h3>Current Flat-File Snapshot</h3>
      </div>
      <span class="dashboard-badge">${formatCount(counts.catalog + counts.lots + counts.balances)} linked records</span>
    </div>
    <div class="dashboard-record-list">
      <div><span>Catalog Cigars</span><strong>${formatCount(counts.catalog)}</strong><small>data/catalog-cigars.json</small></div>
      <div><span>Purchase Lines</span><strong>${formatCount(counts.lines)}</strong><small>data/purchase-lines.json</small></div>
      <div><span>Lots</span><strong>${formatCount(counts.lots)}</strong><small>data/lots.json</small></div>
      <div><span>Location Balances</span><strong>${formatCount(counts.balances)}</strong><small>data/lot-location-balances.json</small></div>
    </div>
  `

  const activity = document.createElement('section')
  activity.className = 'dashboard-panel dashboard-activity'
  activity.innerHTML = `
    <div class="section-heading compact-heading">
      <div>
        <p class="eyebrow">Buying Flow</p>
        <h3>Purchase Pipeline</h3>
      </div>
    </div>
    <div class="pipeline-list">
      <div><span>Vendors</span><strong>${formatCount(counts.vendors)}</strong></div>
      <div><span>Purchase Headers</span><strong>${formatCount(counts.purchases)}</strong></div>
      <div><span>PO Lines</span><strong>${formatCount(counts.lines)}</strong></div>
      <div><span>Receipt Events</span><strong>${formatCount(counts.events)}</strong></div>
    </div>
  `

  const actions = document.createElement('section')
  actions.className = 'dashboard-panel dashboard-actions'
  actions.innerHTML = `
    <p class="eyebrow">Next Actions</p>
    <h3>Manage Records</h3>
    <div class="quick-action-list">
      <button type="button" data-page="Catalog">Add Catalog Cigar</button>
      <button type="button" data-page="Purchases">Create Purchase</button>
      <button type="button" data-page="Humidors">Manage Humidors</button>
      <button type="button" data-page="HumidorSections">Add Humidor Section</button>
    </div>
  `
  actions.querySelectorAll('button[data-page]').forEach((button) => {
    button.addEventListener('click', () => {
      state.activePage = button.dataset.page
      state.formError = null
      render()
      recordPageView(state.activePage)
    })
  })

  const main = document.createElement('div')
  main.className = 'dashboard-main-grid'
  main.append(inventory, activity)

  const side = document.createElement('aside')
  side.className = 'dashboard-side-grid'
  side.append(actions)

  const body = document.createElement('div')
  body.className = 'dashboard-body'
  body.append(main, side)

  shell.append(summary, body)
  view.append(shell)
}

function renderCollectionList(view) {
  const collections = state.sampleData?.collections || {}
  const table = document.createElement('table')
  table.className = 'data-table'
  table.innerHTML = `
    <thead>
      <tr>
        <th>JSON File</th>
        <th>Records</th>
        <th>Purpose</th>
      </tr>
    </thead>
    <tbody></tbody>
  `

  const purposes = {
    'catalog-cigars': 'Cigar catalog runtime records',
    vendors: 'Vendor records',
    'storage-locations': 'Humidor records',
    'storage-sub-locations': 'Humidor section records',
    purchases: 'Purchase header records',
    'purchase-lines': 'Purchase line records',
    lots: 'Inventory lot records',
    'lot-location-balances': 'Current location balance records',
    'inventory-events': 'Inventory movement and removal records',
    'smoking-journal-entries': 'Smoking journal records',
  }

  const tbody = table.querySelector('tbody')
  Object.keys(collections).sort().forEach((name) => {
    const row = document.createElement('tr')
    row.innerHTML = `
      <td><code>data/${escapeHtml(name)}.json</code></td>
      <td>${formatCount(collections[name].count)}</td>
      <td>${escapeHtml(purposes[name] || 'Runtime JSON collection')}</td>
    `
    tbody.append(row)
  })

  view.append(table)
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
      ;(state.records[field.collection] || []).forEach((option) => {
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
    setStatus('Saving record', 'neutral')
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
      state.auditData = null
      setStatus('Record saved', 'ok')
    } catch (error) {
      state.formError = error.message
      setStatus('Save failed', 'error')
    }
    render()
  })

  view.append(form)
}

function renderManagedTable(view, pageConfig) {
  const collection = pageConfig.collection
  const records = state.records[collection] || []
  const heading = document.createElement('div')
  heading.className = 'section-heading'
  heading.innerHTML = `
    <div>
      <h3>${escapeHtml(pageConfig.title)} Records</h3>
      <p class="muted">${formatCount(records.length)} records in <code>data/${escapeHtml(collection)}.json</code>.</p>
    </div>
  `

  if (records.length === 0) {
    const empty = document.createElement('div')
    empty.className = 'empty-state'
    empty.innerHTML = `<p>No ${escapeHtml(pageConfig.title.toLowerCase())} records yet.</p>`
    view.append(heading, empty)
    return
  }

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
  records.forEach((record) => {
    const row = document.createElement('tr')
    pageConfig.columns.forEach((column) => {
      const cell = document.createElement('td')
      cell.textContent = column.value(record)
      row.append(cell)
    })
    const actions = document.createElement('td')
    actions.className = 'row-actions'
    if (pageConfig.readOnlyActions) {
      const locked = document.createElement('span')
      locked.className = 'muted'
      locked.textContent = 'Linked'
      actions.append(locked)
    } else {
      const edit = document.createElement('button')
      edit.type = 'button'
      edit.className = 'secondary-button compact-button'
      edit.textContent = 'Edit'
      edit.addEventListener('click', () => {
        state.editing[collection] = record
        state.formError = null
        render()
      })
      const remove = document.createElement('button')
      remove.type = 'button'
      remove.className = 'danger-button compact-button'
      remove.textContent = 'Delete'
      remove.addEventListener('click', async () => {
        if (!confirm(`Delete this ${pageConfig.title.toLowerCase()} record?`)) {
          return
        }
        setStatus('Deleting record', 'neutral')
        try {
          await apiDelete(`/records/${collection}/${record.id}`)
          state.records[collection] = null
          await ensureRecords(collection)
          await refreshSampleData()
          state.auditData = null
          setStatus('Record deleted', 'ok')
        } catch (error) {
          state.formError = error.message
          setStatus('Delete failed', 'error')
        }
        render()
      })
      actions.append(edit, remove)
    }
    row.append(actions)
    tbody.append(row)
  })

  view.append(heading, table)
}

function renderManagedPage(view, pageConfig) {
  renderManagedTable(view, pageConfig)
  renderManagedForm(view, pageConfig)
}

const pageSections = {
  Reports: {
    intro: 'Report source files currently available through the PHP JSON API.',
    collections: ['inventory-events', 'lots', 'smoking-journal-entries'],
  },
}

function renderSectionSummary(view, pageTitle) {
  const section = pageSections[pageTitle]
  if (!section) {
    renderCollectionList(view)
    return
  }

  const intro = document.createElement('p')
  intro.className = 'muted'
  intro.textContent = section.intro

  const grid = document.createElement('div')
  grid.className = 'metric-grid compact'
  section.collections.forEach((name) => {
    grid.append(metricCard(name, collectionCount(name), `Loaded from data/${name}.json`))
  })

  view.append(intro, grid)
}

async function ensureAuditData() {
  state.auditData = await apiGet('/audit')
}

function renderAudit(view) {
  const records = state.auditData?.records || []
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
  records.forEach((record) => {
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
  const panel = document.createElement('pre')
  panel.className = 'markdown-panel'
  panel.textContent = state.changelog?.content || 'CHANGELOG.md is empty.'
  view.append(panel)
}


async function ensureTodo() {
  state.todo = await apiGet('/todo')
}

function renderTodo(view) {
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
    setStatus('Signing in', 'neutral')
    try {
      state.session = await apiPost('/login', {
        username: String(formData.get('username') || ''),
        password: String(formData.get('password') || ''),
      })
      await refreshSampleData()
      await recordPageView(state.activePage)
      setStatus('PHP API connected', 'ok')
    } catch (error) {
      state.authError = error.message
      setStatus('Sign in required', 'error')
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
  renderNav()

  document.querySelector('#page-title').textContent = isAuthenticated() ? state.activePage : 'Sign In'
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

  renderAccountBar(view)

  if (state.error) {
    renderError(view)
    return
  }

  if (!state.sampleData) {
    view.innerHTML = '<p class="muted">Loading JSON data through PHP...</p>'
    return
  }

  if (state.activePage === 'Dashboard') {
    renderDashboard(view)
    return
  }

  if (state.activePage === 'Collection') {
    renderCollectionList(view)
    return
  }

  const managedPage = managedPages[state.activePage]
  if (managedPage) {
    const collections = [managedPage.collection, ...(managedPage.dependencies || [])]
    if (collections.some((collection) => !state.records[collection])) {
      view.innerHTML = '<p class="muted">Loading records...</p>'
      ensureManagedPageData(managedPage).then(render).catch((error) => { state.error = error; render() })
      return
    }
    renderManagedPage(view, managedPage)
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
    return
  }
  renderSectionSummary(view, state.activePage)
}

async function init() {
  render()
  try {
    state.appMeta = await apiGet('/app-meta')
    state.session = await apiGet('/session')
    if (isAuthenticated()) {
      await refreshSampleData()
      await recordPageView(state.activePage)
      setStatus('PHP API connected', 'ok')
    } else {
      setStatus('Sign in required', 'neutral')
    }
  } catch (error) {
    state.error = error
    setStatus('PHP API unavailable', 'error')
  } finally {
    state.isLoading = false
    render()
  }
}

init()

