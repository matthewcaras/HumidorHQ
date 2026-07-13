import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import {
  getManagedCatalog,
  getManagedCatalogDetails,
  type CatalogManagementCigar,
  type CatalogManagementDetails,
  type CatalogManagementListItem,
  type CatalogManagementResponse,
  type CatalogManagementSortBy,
  type CatalogManagementSortDirection,
  type CatalogManagementStatus,
} from '../services/api'

type PageSize = 50 | 100 | 'all'

const DEFAULT_PAGE_SIZE: PageSize = 50
const DEFAULT_SORT_BY: CatalogManagementSortBy = 'CIGAR'
const DEFAULT_SORT_DIRECTION: CatalogManagementSortDirection = 'ASC'
const DEFAULT_STATUS: CatalogManagementStatus = 'ACTIVE'

const PAGE_SIZE_OPTIONS: { value: PageSize; label: string }[] = [
  { value: 50, label: '50' },
  { value: 100, label: '100' },
  { value: 'all', label: 'All' },
]

const STATUS_OPTIONS: { value: CatalogManagementStatus; label: string }[] = [
  { value: 'ACTIVE', label: 'Active' },
  { value: 'ARCHIVED', label: 'Archived' },
  { value: 'ALL', label: 'All' },
]

const SORT_OPTIONS: { value: CatalogManagementSortBy; label: string }[] = [
  { value: 'CIGAR', label: 'Cigar' },
  { value: 'MSRP', label: 'MSRP' },
  { value: 'UPDATED', label: 'Updated' },
]

const FIRST_SORT_DIRECTION: Record<
  CatalogManagementSortBy,
  CatalogManagementSortDirection
> = {
  CIGAR: 'ASC',
  MSRP: 'ASC',
  UPDATED: 'DESC',
}

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'UTC',
})

function formatMoney(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === '') {
    return '-'
  }

  const text = String(value).trim()
  const match = text.match(/^(-)?(\d+)(?:\.(\d+))?$/)

  if (!match) {
    return '-'
  }

  const fraction = match[3] ?? ''
  const cents =
    BigInt(match[2]) * 100n +
    BigInt(Number(fraction.slice(0, 2).padEnd(2, '0'))) +
    BigInt(Number(fraction[2] ?? '0') >= 5 ? 1 : 0)
  const isNegative = match[1] === '-' && cents !== 0n
  const dollars = cents / 100n
  const centsText = String(cents % 100n).padStart(2, '0')

  return isNegative ? `$(${dollars}.${centsText})` : `$${dollars}.${centsText}`
}

function formatDate(value: string | null | undefined) {
  if (!value) {
    return '-'
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return '-'
  }

  return dateFormatter.format(date)
}

function cigarSubtitle(cigar: CatalogManagementCigar) {
  return `${cigar.series} - ${cigar.vitola}`
}

function dimensionsText(cigar: CatalogManagementCigar) {
  return [cigar.length ? String(cigar.length) : null, cigar.ringGauge ? String(cigar.ringGauge) : null]
    .filter(Boolean)
    .join(' x ')
}

function sizeText(cigar: CatalogManagementCigar) {
  const dimensions = dimensionsText(cigar)
  const parts = [cigar.shape, dimensions].filter(Boolean)

  return parts.length > 0 ? parts.join(' - ') : '-'
}

function cardSizeText(cigar: CatalogManagementCigar) {
  const dimensions = dimensionsText(cigar)
  const parts = [cigar.shape, dimensions].filter(Boolean)

  return parts.length > 0 ? parts.join(' / ') : '-'
}

function statusLabel(isActive: boolean) {
  return isActive ? 'Active' : 'Archived'
}

function statusClass(isActive: boolean) {
  return isActive ? 'catalog-status-badge active' : 'catalog-status-badge archived'
}

function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return count === 1 ? singular : plural
}

function emptyStateMessage(status: CatalogManagementStatus, activeSearch: string) {
  if (activeSearch.trim()) {
    return 'No Catalog cigars matched your search.'
  }

  if (status === 'ARCHIVED') {
    return 'No archived Catalog cigars were found.'
  }

  return 'No active Catalog cigars were found.'
}

function resultMessage(catalog: CatalogManagementResponse | null) {
  if (!catalog) {
    return ''
  }

  const noun = `Catalog ${pluralize(catalog.total, 'cigar')}`

  if (catalog.total === 0) {
    return catalog.search ? `Showing 0 ${noun} matching "${catalog.search}".` : `Showing 0 ${noun}.`
  }

  if (catalog.limit === 'all') {
    return catalog.search
      ? `Showing all ${catalog.total} ${noun} matching "${catalog.search}".`
      : `Showing all ${catalog.total} ${noun}.`
  }

  const start = catalog.offset + 1
  const end = Math.min(catalog.offset + catalog.items.length, catalog.total)

  return catalog.search
    ? `Showing ${start}-${end} of ${catalog.total} ${noun} matching "${catalog.search}".`
    : `Showing ${start}-${end} of ${catalog.total} ${noun}.`
}

function nextSortDirection(
  currentSortBy: CatalogManagementSortBy,
  currentDirection: CatalogManagementSortDirection,
  selectedSortBy: CatalogManagementSortBy,
) {
  if (currentSortBy !== selectedSortBy) {
    return FIRST_SORT_DIRECTION[selectedSortBy]
  }

  return currentDirection === 'ASC' ? 'DESC' : 'ASC'
}

function sortIndicator(direction: CatalogManagementSortDirection) {
  return direction === 'ASC' ? 'ASC' : 'DESC'
}

function directionLabel(sortBy: CatalogManagementSortBy, direction: CatalogManagementSortDirection) {
  if (sortBy === 'CIGAR') {
    return direction === 'ASC' ? 'A-Z' : 'Z-A'
  }

  if (sortBy === 'UPDATED') {
    return direction === 'ASC' ? 'Oldest first' : 'Newest first'
  }

  return direction === 'ASC' ? 'Low to high' : 'High to low'
}

function CatalogStatusBadge({ isActive }: { isActive: boolean }) {
  return <span className={statusClass(isActive)}>{statusLabel(isActive)}</span>
}

type CatalogDetailsPanelProps = {
  details: CatalogManagementDetails | null
  isLoading: boolean
  error: string
  onClose: () => void
}

function CatalogDetailsPanel({
  details,
  isLoading,
  error,
  onClose,
}: CatalogDetailsPanelProps) {
  const cigar = details?.catalogCigar
  const title = cigar ? cigar.manufacturer : 'Catalog Details'

  return (
    <div
      className="modal-backdrop catalog-details-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose()
        }
      }}
    >
      <section
        className="modal catalog-details-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="catalog-details-title"
      >
        <div className="modal-header catalog-details-header">
          <div>
            <p className="modal-kicker">Catalog Details</p>
            <h3 id="catalog-details-title">{title}</h3>
            {cigar ? <span>{cigarSubtitle(cigar)}</span> : null}
          </div>
          <button
            className="icon-button"
            type="button"
            aria-label="Close Catalog details"
            onClick={onClose}
          >
            &times;
          </button>
        </div>

        {isLoading ? <p className="muted">Loading Catalog details...</p> : null}
        {error ? <p className="error-text">{error}</p> : null}

        {details && cigar ? (
          <div className="catalog-details-content">
            <section className="catalog-details-hero">
              <div>
                <p>{cigar.manufacturer}</p>
                <h4>{cigarSubtitle(cigar)}</h4>
              </div>
              <CatalogStatusBadge isActive={cigar.isActive} />
            </section>

            <section className="catalog-details-section">
              <div className="catalog-section-heading">
                <h4>Identity and Attributes</h4>
              </div>
              <div className="catalog-attribute-grid">
                <article>
                  <span>Shape</span>
                  <strong>{cigar.shape ?? '-'}</strong>
                </article>
                <article>
                  <span>Length</span>
                  <strong>{cigar.length ? String(cigar.length) : '-'}</strong>
                </article>
                <article>
                  <span>Ring Gauge</span>
                  <strong>{cigar.ringGauge ?? '-'}</strong>
                </article>
                <article>
                  <span>Wrapper</span>
                  <strong>{cigar.wrapper ?? '-'}</strong>
                </article>
                <article>
                  <span>Binder</span>
                  <strong>{cigar.binder ?? '-'}</strong>
                </article>
                <article>
                  <span>Filler</span>
                  <strong>{cigar.filler ?? '-'}</strong>
                </article>
                <article>
                  <span>Country</span>
                  <strong>{cigar.country ?? '-'}</strong>
                </article>
                <article>
                  <span>Strength</span>
                  <strong>{cigar.strength ?? '-'}</strong>
                </article>
                <article>
                  <span>MSRP</span>
                  <strong>{formatMoney(cigar.msrp)}</strong>
                </article>
                <article>
                  <span>Updated</span>
                  <strong>{formatDate(cigar.updatedAt)}</strong>
                </article>
              </div>
            </section>

            <section className="catalog-details-section">
              <div className="catalog-section-heading">
                <h4>Usage</h4>
              </div>
              <div className="catalog-usage-grid">
                <article>
                  <span>Current Quantity</span>
                  <strong>{details.usage.currentQuantity}</strong>
                </article>
                <article>
                  <span>Lots</span>
                  <strong>{details.usage.lotCount}</strong>
                </article>
                <article>
                  <span>Purchase Lines</span>
                  <strong>{details.usage.purchaseLineCount}</strong>
                </article>
                <article>
                  <span>Inventory Events</span>
                  <strong>{details.usage.inventoryEventCount}</strong>
                </article>
                <article>
                  <span>Current Locations</span>
                  <strong>{details.usage.currentLocationCount}</strong>
                </article>
              </div>
            </section>

            <section className="catalog-details-section">
              <div className="catalog-section-heading">
                <h4>Current Locations</h4>
              </div>
              {details.currentLocations.length === 0 ? (
                <p className="catalog-empty-message">
                  No current inventory is stored for this Catalog cigar.
                </p>
              ) : (
                <div className="catalog-location-list">
                  {details.currentLocations.map((location) => (
                    <article
                      className="catalog-location-card"
                      key={location.storageSubLocationId}
                    >
                      <div>
                        <strong>{location.storageLocationName}</strong>
                        <span>{location.storageSubLocationName}</span>
                      </div>
                      <div className="catalog-location-quantity">
                        <span>Qty</span>
                        <strong>{location.quantity}</strong>
                      </div>
                      {!location.storageLocationIsActive ||
                      !location.storageSubLocationIsActive ? (
                        <span className="attention-badge">Archived Location</span>
                      ) : null}
                    </article>
                  ))}
                </div>
              )}
            </section>
          </div>
        ) : null}
      </section>
    </div>
  )
}

function Catalog() {
  const [catalog, setCatalog] = useState<CatalogManagementResponse | null>(null)
  const [searchInput, setSearchInput] = useState('')
  const [activeSearch, setActiveSearch] = useState('')
  const [status, setStatus] = useState<CatalogManagementStatus>(DEFAULT_STATUS)
  const [sortBy, setSortBy] = useState<CatalogManagementSortBy>(DEFAULT_SORT_BY)
  const [sortDirection, setSortDirection] =
    useState<CatalogManagementSortDirection>(DEFAULT_SORT_DIRECTION)
  const [pageSize, setPageSize] = useState<PageSize>(DEFAULT_PAGE_SIZE)
  const [offset, setOffset] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedCatalogCigarId, setSelectedCatalogCigarId] = useState<number | null>(null)
  const [details, setDetails] = useState<CatalogManagementDetails | null>(null)
  const [isDetailsLoading, setIsDetailsLoading] = useState(false)
  const [detailsError, setDetailsError] = useState('')
  const listRequestIdRef = useRef(0)
  const detailsRequestIdRef = useRef(0)
  const detailsOpenerRef = useRef<HTMLElement | null>(null)
  const headingRef = useRef<HTMLHeadingElement | null>(null)

  async function loadCatalog(
    search = activeSearch,
    nextStatus = status,
    nextSortBy = sortBy,
    nextSortDirection = sortDirection,
    nextPageSize = pageSize,
    nextOffset = offset,
  ) {
    const requestId = listRequestIdRef.current + 1
    listRequestIdRef.current = requestId
    setIsLoading(true)
    setError('')

    try {
      const data = await getManagedCatalog({
        search,
        status: nextStatus,
        sortBy: nextSortBy,
        sortDirection: nextSortDirection,
        limit: nextPageSize,
        offset: nextPageSize === 'all' ? 0 : nextOffset,
      })

      if (requestId !== listRequestIdRef.current) {
        return
      }

      setCatalog(data)
    } catch (loadError) {
      if (requestId !== listRequestIdRef.current) {
        return
      }

      setError(loadError instanceof Error ? loadError.message : 'Unable to load Catalog.')
    } finally {
      if (requestId === listRequestIdRef.current) {
        setIsLoading(false)
      }
    }
  }

  async function openCatalogDetails(catalogCigarId: number, opener: HTMLElement) {
    const requestId = detailsRequestIdRef.current + 1
    detailsRequestIdRef.current = requestId
    detailsOpenerRef.current = opener
    setSelectedCatalogCigarId(catalogCigarId)
    setDetails(null)
    setDetailsError('')
    setIsDetailsLoading(true)

    try {
      const data = await getManagedCatalogDetails(catalogCigarId)

      if (requestId !== detailsRequestIdRef.current) {
        return
      }

      setDetails(data)
    } catch (loadError) {
      if (requestId !== detailsRequestIdRef.current) {
        return
      }

      setDetailsError(
        loadError instanceof Error ? loadError.message : 'Unable to load Catalog details.',
      )
    } finally {
      if (requestId === detailsRequestIdRef.current) {
        setIsDetailsLoading(false)
      }
    }
  }

  function closeCatalogDetails() {
    detailsRequestIdRef.current += 1
    setSelectedCatalogCigarId(null)
    setDetails(null)
    setDetailsError('')
    setIsDetailsLoading(false)

    window.setTimeout(() => {
      detailsOpenerRef.current?.focus()
    }, 0)
  }

  useEffect(() => {
    void loadCatalog('', DEFAULT_STATUS, DEFAULT_SORT_BY, DEFAULT_SORT_DIRECTION, DEFAULT_PAGE_SIZE, 0)

    return () => {
      listRequestIdRef.current += 1
      detailsRequestIdRef.current += 1
    }
  }, [])

  useEffect(() => {
    if (selectedCatalogCigarId === null) {
      return
    }

    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') {
        closeCatalogDetails()
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [selectedCatalogCigarId])

  function handleSearch(event: FormEvent) {
    event.preventDefault()
    const submittedSearch = searchInput.trim()

    setSearchInput(submittedSearch)
    setActiveSearch(submittedSearch)
    setOffset(0)
    void loadCatalog(submittedSearch, status, sortBy, sortDirection, pageSize, 0)
  }

  function handleClearSearch() {
    setSearchInput('')
    setActiveSearch('')
    setOffset(0)
    void loadCatalog('', status, sortBy, sortDirection, pageSize, 0)
  }

  function handleStatusChange(nextStatus: CatalogManagementStatus) {
    setStatus(nextStatus)
    setOffset(0)
    void loadCatalog(activeSearch, nextStatus, sortBy, sortDirection, pageSize, 0)
  }

  function handlePageSizeChange(value: string) {
    const nextPageSize: PageSize = value === 'all' ? 'all' : value === '100' ? 100 : 50

    setPageSize(nextPageSize)
    setOffset(0)
    void loadCatalog(activeSearch, status, sortBy, sortDirection, nextPageSize, 0)
  }

  function handleSortChange(
    nextSortBy: CatalogManagementSortBy,
    nextDirection?: CatalogManagementSortDirection,
  ) {
    const resolvedDirection =
      nextDirection ?? nextSortDirection(sortBy, sortDirection, nextSortBy)

    setSortBy(nextSortBy)
    setSortDirection(resolvedDirection)
    setOffset(0)
    void loadCatalog(activeSearch, status, nextSortBy, resolvedDirection, pageSize, 0)
    headingRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  function handlePageChange(nextOffset: number) {
    setOffset(nextOffset)
    void loadCatalog(activeSearch, status, sortBy, sortDirection, pageSize, nextOffset)
    headingRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  function handleOpenDetailsKeyDown(
    event: KeyboardEvent<HTMLElement>,
    catalogCigarId: number,
  ) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      void openCatalogDetails(catalogCigarId, event.currentTarget)
    }
  }

  function renderSortHeader(headerSortBy: CatalogManagementSortBy, label: string) {
    const isActive = sortBy === headerSortBy

    return (
      <button
        className={isActive ? 'catalog-sort-header active' : 'catalog-sort-header'}
        type="button"
        onClick={() => handleSortChange(headerSortBy)}
        aria-label={`Sort by ${label}`}
      >
        <span>{label}</span>
        {isActive ? (
          <span aria-hidden="true">{sortIndicator(sortDirection)}</span>
        ) : null}
      </button>
    )
  }

  function renderCatalogRow(item: CatalogManagementListItem) {
    const cigar = item.catalogCigar

    return (
      <tr
        className="catalog-row"
        key={cigar.id}
        tabIndex={0}
        role="button"
        aria-label={`View Catalog details for ${cigar.manufacturer} ${cigar.series} ${cigar.vitola}`}
        onClick={(event) => void openCatalogDetails(cigar.id, event.currentTarget)}
        onKeyDown={(event) => handleOpenDetailsKeyDown(event, cigar.id)}
      >
        <td>
          <div className="catalog-cigar-cell">
            <strong>{cigar.manufacturer}</strong>
            <span>{cigarSubtitle(cigar)}</span>
          </div>
        </td>
        <td>{sizeText(cigar)}</td>
        <td>{cigar.wrapper ?? '-'}</td>
        <td className="catalog-money-cell">{formatMoney(cigar.msrp)}</td>
        <td className="catalog-number-cell">{item.usage.currentQuantity}</td>
        <td className="catalog-number-cell">{item.usage.lotCount}</td>
        <td>
          <CatalogStatusBadge isActive={cigar.isActive} />
        </td>
        <td className="catalog-action-cell">
          <button
            className="table-action catalog-view-button"
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              void openCatalogDetails(cigar.id, event.currentTarget)
            }}
            onKeyDown={(event) => event.stopPropagation()}
          >
            View
          </button>
        </td>
      </tr>
    )
  }

  function renderCatalogCard(item: CatalogManagementListItem) {
    const cigar = item.catalogCigar

    return (
      <article
        className="catalog-card"
        key={cigar.id}
        tabIndex={0}
        role="button"
        aria-label={`View Catalog details for ${cigar.manufacturer} ${cigar.series} ${cigar.vitola}`}
        onClick={(event) => void openCatalogDetails(cigar.id, event.currentTarget)}
        onKeyDown={(event) => handleOpenDetailsKeyDown(event, cigar.id)}
      >
        <div className="catalog-card-header">
          <div>
            <h4>{cigar.manufacturer}</h4>
            <span>{cigarSubtitle(cigar)}</span>
          </div>
          {!cigar.isActive ? <CatalogStatusBadge isActive={cigar.isActive} /> : null}
        </div>
        <div className="catalog-card-quantity">
          <strong>{item.usage.currentQuantity}</strong>
          <span>Current Qty</span>
        </div>
        <dl>
          <div>
            <dt>Size</dt>
            <dd>{cardSizeText(cigar)}</dd>
          </div>
          <div>
            <dt>Wrapper</dt>
            <dd>{cigar.wrapper ?? '-'}</dd>
          </div>
          <div>
            <dt>MSRP</dt>
            <dd>{formatMoney(cigar.msrp)}</dd>
          </div>
          <div>
            <dt>Lots</dt>
            <dd>{item.usage.lotCount}</dd>
          </div>
        </dl>
        <span className="catalog-card-details-cue">View Details</span>
      </article>
    )
  }

  const summary = catalog?.summary ?? {
    totalCatalogCount: 0,
    activeCount: 0,
    archivedCount: 0,
  }
  const items = catalog?.items ?? []
  const effectiveOffset = catalog?.offset ?? offset
  const isShowingAll = pageSize === 'all'
  const canPageBackward = !isShowingAll && effectiveOffset > 0
  const canPageForward =
    !isShowingAll &&
    catalog !== null &&
    catalog.offset + catalog.items.length < catalog.total
  const pageStep = pageSize === 'all' ? 0 : pageSize

  return (
    <div className="catalog-page">
      <header className="page-header">
        <div className="page-header-copy">
          <h2 ref={headingRef}>Catalog</h2>
          <p className="page-subtitle">
            Manage the master cigar records used by purchases and your collection.
          </p>
        </div>
      </header>

      <section className="catalog-summary-grid" aria-label="Catalog summary">
        <article className="catalog-summary-card">
          <p>Total Catalog</p>
          <strong>{summary.totalCatalogCount}</strong>
        </article>
        <article className="catalog-summary-card">
          <p>Active</p>
          <strong>{summary.activeCount}</strong>
        </article>
        <article className="catalog-summary-card">
          <p>Archived</p>
          <strong>{summary.archivedCount}</strong>
        </article>
      </section>

      <section className="panel catalog-panel">
        <div className="catalog-toolbar">
          <form className="catalog-search-form" onSubmit={handleSearch}>
            <label>
              <span>Search</span>
              <input
                type="search"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Search cigars, wrappers, or size"
                aria-label="Search Catalog"
              />
            </label>
            <div className="catalog-search-actions">
              <button className="primary-button" type="submit" disabled={isLoading}>
                Search
              </button>
              <button
                className="secondary-button"
                type="button"
                disabled={isLoading && !activeSearch && !searchInput}
                onClick={handleClearSearch}
              >
                Clear
              </button>
            </div>
          </form>

          <div className="catalog-toolbar-controls">
            <fieldset className="catalog-status-control">
              <legend>Status</legend>
              <div>
                {STATUS_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    className={status === option.value ? 'active' : ''}
                    type="button"
                    aria-pressed={status === option.value}
                    disabled={isLoading}
                    onClick={() => handleStatusChange(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </fieldset>

            <label className="catalog-page-size">
              <span>Show</span>
              <select
                value={String(pageSize)}
                onChange={(event) => handlePageSizeChange(event.target.value)}
                disabled={isLoading}
              >
                {PAGE_SIZE_OPTIONS.map((option) => (
                  <option key={option.value} value={String(option.value)}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div className="catalog-mobile-sort">
          <label>
            <span>Sort By</span>
            <select
              value={sortBy}
              onChange={(event) =>
                handleSortChange(
                  event.target.value as CatalogManagementSortBy,
                  FIRST_SORT_DIRECTION[event.target.value as CatalogManagementSortBy],
                )
              }
              disabled={isLoading}
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Direction</span>
            <select
              value={sortDirection}
              onChange={(event) =>
                handleSortChange(sortBy, event.target.value as CatalogManagementSortDirection)
              }
              disabled={isLoading}
            >
              <option value="ASC">{directionLabel(sortBy, 'ASC')}</option>
              <option value="DESC">{directionLabel(sortBy, 'DESC')}</option>
            </select>
          </label>
        </div>

        {isLoading && !catalog ? (
          <section className="catalog-loading" aria-live="polite">
            <p>Loading Catalog...</p>
          </section>
        ) : null}

        {error ? (
          <section className="catalog-error" role="alert">
            <h3>Catalog could not be loaded</h3>
            <p>{error}</p>
            <button className="primary-button" type="button" onClick={() => void loadCatalog()}>
              Retry
            </button>
          </section>
        ) : null}

        {catalog && !error ? (
          <>
            {isLoading ? (
              <p className="catalog-refresh-message" role="status">
                Updating Catalog...
              </p>
            ) : null}

            <p className="catalog-results-message">{resultMessage(catalog)}</p>

            {catalog.total === 0 ? (
              <div className="catalog-empty-state">
                <h3>{emptyStateMessage(status, activeSearch)}</h3>
              </div>
            ) : null}

            {items.length > 0 ? (
              <>
                <div className="catalog-desktop-table">
                  <table className="data-table catalog-table">
                    <colgroup>
                      <col className="catalog-col-cigar" />
                      <col className="catalog-col-size" />
                      <col className="catalog-col-wrapper" />
                      <col className="catalog-col-msrp" />
                      <col className="catalog-col-qty" />
                      <col className="catalog-col-lots" />
                      <col className="catalog-col-status" />
                      <col className="catalog-col-view" />
                    </colgroup>
                    <thead>
                      <tr>
                        <th
                          aria-sort={
                            sortBy === 'CIGAR'
                              ? sortDirection === 'ASC'
                                ? 'ascending'
                                : 'descending'
                              : 'none'
                          }
                        >
                          {renderSortHeader('CIGAR', 'Cigar')}
                        </th>
                        <th>Size</th>
                        <th>Wrapper</th>
                        <th
                          aria-sort={
                            sortBy === 'MSRP'
                              ? sortDirection === 'ASC'
                                ? 'ascending'
                                : 'descending'
                              : 'none'
                          }
                        >
                          {renderSortHeader('MSRP', 'MSRP')}
                        </th>
                        <th>Current Qty</th>
                        <th>Lots</th>
                        <th>Status</th>
                        <th className="catalog-action-header">View</th>
                      </tr>
                    </thead>
                    <tbody>{items.map((item) => renderCatalogRow(item))}</tbody>
                  </table>
                </div>

                <div className="catalog-card-list">
                  {items.map((item) => renderCatalogCard(item))}
                </div>
              </>
            ) : null}

            {catalog.total > 0 ? (
              <div className="catalog-pagination">
                <p>{resultMessage(catalog)}</p>
                <div className="catalog-pagination-controls">
                  {!isShowingAll && (canPageBackward || canPageForward) ? (
                    <div className="catalog-pagination-buttons">
                      <button
                        className="secondary-button"
                        type="button"
                        disabled={!canPageBackward || isLoading}
                        onClick={() => handlePageChange(Math.max(effectiveOffset - pageStep, 0))}
                      >
                        Previous
                      </button>
                      <button
                        className="secondary-button"
                        type="button"
                        disabled={!canPageForward || isLoading}
                        onClick={() => handlePageChange(effectiveOffset + pageStep)}
                      >
                        Next
                      </button>
                    </div>
                  ) : null}
                  <label className="catalog-page-size catalog-page-size-bottom">
                    <span>Show</span>
                    <select
                      value={String(pageSize)}
                      onChange={(event) => handlePageSizeChange(event.target.value)}
                      disabled={isLoading}
                    >
                      {PAGE_SIZE_OPTIONS.map((option) => (
                        <option key={option.value} value={String(option.value)}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>
            ) : null}
          </>
        ) : null}
      </section>

      {selectedCatalogCigarId !== null ? (
        <CatalogDetailsPanel
          details={details}
          isLoading={isDetailsLoading}
          error={detailsError}
          onClose={closeCatalogDetails}
        />
      ) : null}
    </div>
  )
}

export default Catalog
