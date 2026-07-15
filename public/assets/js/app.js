const API_BASE_URL = 'api'

const state = {
  activePage: 'Dashboard',
  sampleData: null,
  error: null,
}

const pages = [
  { id: 'Dashboard', label: 'Dashboard' },
  { id: 'Collection', label: 'Collection' },
  { id: 'Catalog', label: 'Catalog' },
  { id: 'Purchases', label: 'Purchases' },
  { id: 'Humidors', label: 'Humidors' },
  { id: 'Reports', label: 'Reports' },
]

function formatCount(value) {
  return Number(value || 0).toLocaleString()
}

function collectionCount(name) {
  return state.sampleData?.collections?.[name]?.count || 0
}

function setStatus(text, mode = 'neutral') {
  const status = document.querySelector('#api-status')
  status.textContent = text
  status.dataset.mode = mode
}

async function apiGet(path) {
  const response = await fetch(`${API_BASE_URL}${path}`)
  const body = await response.json().catch(() => null)

  if (!response.ok) {
    const message = body?.error?.message || `Request failed with HTTP ${response.status}`
    throw new Error(message)
  }

  return body.data
}

function renderNav() {
  const nav = document.querySelector('#app-nav')
  nav.replaceChildren(
    ...pages.map((page) => {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = page.id === state.activePage ? 'nav-item active' : 'nav-item'
      button.textContent = page.label
      button.addEventListener('click', () => {
        state.activePage = page.id
        render()
      })
      return button
    }),
  )
}

function metricCard(label, value, detail) {
  const card = document.createElement('article')
  card.className = 'metric-card'
  card.innerHTML = `
    <span>${label}</span>
    <strong>${formatCount(value)}</strong>
    <small>${detail}</small>
  `
  return card
}

function renderDashboard(view) {
  const grid = document.createElement('div')
  grid.className = 'metric-grid'
  grid.append(
    metricCard('Catalog Cigars', collectionCount('catalog-cigars'), 'Loaded from data/catalog-cigars.json'),
    metricCard('Vendors', collectionCount('vendors'), 'Loaded from data/vendors.json'),
    metricCard('Humidors', collectionCount('storage-locations'), 'Loaded from data/storage-locations.json'),
    metricCard('Inventory Events', collectionCount('inventory-events'), 'Loaded from data/inventory-events.json'),
  )

  const note = document.createElement('p')
  note.className = 'muted'
  note.textContent = 'This shell is running without React, TypeScript, Vite, Node, Prisma, or a compile step. Feature pages will be filled in with plain JavaScript against the PHP API.'

  view.append(grid, note)
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
    'catalog-cigars': 'Cigar catalog sample/runtime records',
    vendors: 'Vendor sample/runtime records',
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
      <td><code>data/${name}.json</code></td>
      <td>${formatCount(collections[name].count)}</td>
      <td>${purposes[name] || 'Runtime JSON collection'}</td>
    `
    tbody.append(row)
  })

  view.append(table)
}

function renderPlaceholder(view, pageTitle) {
  const message = document.createElement('div')
  message.className = 'empty-state'
  message.innerHTML = `
    <h3>${pageTitle}</h3>
    <p>This page is queued for plain JavaScript conversion. The PHP API and repo JSON data are available now.</p>
  `
  view.append(message)
}

function renderError(view) {
  const message = document.createElement('div')
  message.className = 'error-state'
  message.innerHTML = `
    <h3>Sample data could not be loaded</h3>
    <p>${state.error.message}</p>
  `
  view.append(message)
}

function render() {
  renderNav()

  document.querySelector('#page-title').textContent = state.activePage
  const view = document.querySelector('#app-view')
  view.replaceChildren()

  if (state.error) {
    renderError(view)
    return
  }

  if (!state.sampleData) {
    view.innerHTML = '<p class="muted">Loading JSON sample data through PHP...</p>'
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

  renderPlaceholder(view, state.activePage)
}

async function init() {
  render()
  try {
    state.sampleData = await apiGet('/sample-data')
    setStatus('PHP API connected', 'ok')
  } catch (error) {
    state.error = error
    setStatus('PHP API unavailable', 'error')
  }
  render()
}

init()

