const API_BASE_URL = 'api'

const state = {
  activePage: 'Dashboard',
  session: null,
  sampleData: null,
  auditData: null,
  changelog: null,
  error: null,
  authError: null,
  isLoading: true,
}

const pages = [
  { id: 'Dashboard', label: 'Dashboard' },
  { id: 'Collection', label: 'Collection' },
  { id: 'Catalog', label: 'Catalog' },
  { id: 'Purchases', label: 'Purchases' },
  { id: 'Humidors', label: 'Humidors' },
  { id: 'Reports', label: 'Reports' },
  { id: 'Audit', label: 'Audit' },
  { id: 'Changelog', label: 'Changelog' },
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

function isAuthenticated() {
  return state.session?.authenticated === true
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
    <span>Rev ${state.appMeta.revision}</span>
    <span>Modified ${state.appMeta.modifiedEt}</span>
  `
}
function renderNav() {
  const nav = document.querySelector('#app-nav')
  nav.replaceChildren(
    ...pages.map((page) => {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = page.id === state.activePage ? 'nav-item active' : 'nav-item'
      button.textContent = page.label
      button.disabled = !isAuthenticated()
      button.addEventListener('click', () => {
        state.activePage = page.id
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
  accountBar.innerHTML = `<span>Signed in as <strong>${userName}</strong></span>`

  const logoutButton = document.createElement('button')
  logoutButton.type = 'button'
  logoutButton.className = 'secondary-button'
  logoutButton.textContent = 'Log out'
  logoutButton.addEventListener('click', async () => {
    await apiPost('/logout')
    state.session = { authenticated: false, user: null }
    state.sampleData = null
    state.auditData = null
    state.changelog = null
    state.error = null
    state.authError = null
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
  note.textContent = 'This shell is running without React, TypeScript, Vite, Node, Prisma, or a compile step. Each page reads the current protected JSON data through the PHP API.'

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

const pageSections = {
  Catalog: {
    intro: 'Catalog source files currently available through the PHP JSON API.',
    collections: ['catalog-cigars'],
  },
  Purchases: {
    intro: 'Purchase and receipt source files currently available through the PHP JSON API.',
    collections: ['purchases', 'purchase-lines', 'vendors'],
  },
  Humidors: {
    intro: 'Storage and placement source files currently available through the PHP JSON API.',
    collections: ['storage-locations', 'storage-sub-locations', 'lot-location-balances', 'lots'],
  },
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
      <td>${record.dateTime || ''}</td>
      <td>${record.user || ''}</td>
      <td>${record.page || ''}</td>
      <td>${record.action || ''}</td>
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
      state.sampleData = await apiGet('/sample-data')
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
    <h3>Sample data could not be loaded</h3>
    <p>${state.error.message}</p>
  `
  view.append(message)
}

function render() {
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

  renderSectionSummary(view, state.activePage)
}

async function init() {
  render()
  try {
    state.appMeta = await apiGet('/app-meta')
    state.session = await apiGet('/session')
    if (isAuthenticated()) {
      state.sampleData = await apiGet('/sample-data')
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

