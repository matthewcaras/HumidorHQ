import { useEffect, useRef, useState, type FormEvent } from 'react'
import {
  getCollection,
  type CatalogCigar,
  type CollectionInventoryIssue,
  type CollectionItem,
  type CollectionLocationSummary,
  type CollectionResponse,
  type CollectionSortBy,
  type CollectionSortDirection,
} from '../services/api'

type PageSize = 50 | 100 | 'all'

const DEFAULT_PAGE_SIZE: PageSize = 50
const PAGE_SIZE_OPTIONS: { value: PageSize; label: string }[] = [
  { value: 50, label: '50 cigars' },
  { value: 100, label: '100 cigars' },
  { value: 'all', label: 'All cigars' },
]

const SORT_OPTIONS: { value: CollectionSortBy; label: string }[] = [
  { value: 'CIGAR', label: 'Cigar' },
  { value: 'QUANTITY', label: 'Quantity' },
  { value: 'LOTS', label: 'Lots' },
  { value: 'LOCATIONS', label: 'Locations' },
  { value: 'OLDEST', label: 'Oldest' },
  { value: 'AVERAGE_COST', label: 'Avg Cost' },
]

const SORT_LABELS: Record<CollectionSortBy, string> = {
  CIGAR: 'Cigar',
  QUANTITY: 'Qty',
  LOTS: 'Lots',
  LOCATIONS: 'Locations',
  OLDEST: 'Oldest',
  AVERAGE_COST: 'Avg Cost',
}

const NATURAL_SORT_DIRECTIONS: Record<CollectionSortBy, CollectionSortDirection> = {
  CIGAR: 'ASC',
  QUANTITY: 'DESC',
  LOTS: 'DESC',
  LOCATIONS: 'DESC',
  OLDEST: 'ASC',
  AVERAGE_COST: 'ASC',
}

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'UTC',
})

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
  const formatted = `$${dollars}.${centsText}`

  return isNegative ? `$(${dollars}.${centsText})` : formatted
}

function cigarTitle(cigar: CatalogCigar) {
  return cigar.manufacturer
}

function cigarSubtitle(cigar: CatalogCigar) {
  return `${cigar.series} · ${cigar.vitola}`
}

function cigarDetails(cigar: CatalogCigar) {
  const details = []

  if (cigar.length || cigar.ringGauge) {
    details.push(
      [cigar.length ? String(cigar.length) : null, cigar.ringGauge ? String(cigar.ringGauge) : null]
        .filter(Boolean)
        .join(' x '),
    )
  }

  if (cigar.wrapper) {
    details.push(cigar.wrapper)
  }

  return details.join(' · ')
}

function locationLine(location: CollectionLocationSummary) {
  return `${location.storageLocationName} / ${location.storageSubLocationName}`
}

function locationQuantityLine(location: CollectionLocationSummary) {
  return `${locationLine(location)} - Qty ${location.quantity}`
}

function issueTitle(issues: CollectionInventoryIssue[]) {
  return issues.map((issue) => issue.message).join(' ')
}

function issueKey(issue: CollectionInventoryIssue) {
  return [
    issue.code,
    issue.lotId ?? '',
    issue.catalogCigarId ?? '',
    issue.storageLocationId ?? '',
    issue.storageSubLocationId ?? '',
  ].join(':')
}

function topLevelIssues(collection: CollectionResponse) {
  const itemIssueKeys = new Set(
    collection.items.flatMap((item) => item.issues.map((issue) => issueKey(issue))),
  )

  return collection.issues.filter((issue) => !itemIssueKeys.has(issueKey(issue)))
}

function locationDisplay(item: CollectionItem, isSearchActive: boolean) {
  if (
    isSearchActive &&
    (item.searchMatchType === 'LOCATION' || item.searchMatchType === 'BOTH') &&
    item.matchingLocations.length > 0
  ) {
    return {
      locations: item.matchingLocations,
      moreCount: 0,
      isMatch: true,
    }
  }

  return {
    locations: item.primaryLocations.slice(0, 1),
    moreCount: Math.max(item.locationCount - 1, 0),
    isMatch: false,
  }
}

function nextSortDirection(
  currentSortBy: CollectionSortBy,
  currentSortDirection: CollectionSortDirection,
  selectedSortBy: CollectionSortBy,
) {
  if (currentSortBy !== selectedSortBy) {
    return NATURAL_SORT_DIRECTIONS[selectedSortBy]
  }

  return currentSortDirection === 'ASC' ? 'DESC' : 'ASC'
}

function sortDirectionLabel(sortBy: CollectionSortBy, sortDirection: CollectionSortDirection) {
  if (sortBy === 'CIGAR') {
    return sortDirection === 'ASC' ? 'A-Z' : 'Z-A'
  }

  if (sortBy === 'QUANTITY' || sortBy === 'LOTS' || sortBy === 'LOCATIONS') {
    return sortDirection === 'ASC' ? 'Low-High' : 'High-Low'
  }

  if (sortBy === 'OLDEST') {
    return sortDirection === 'ASC' ? 'Oldest-Newest' : 'Newest-Oldest'
  }

  return sortDirection === 'ASC' ? 'Low-High' : 'High-Low'
}

function nextSortLabel(
  currentSortBy: CollectionSortBy,
  currentSortDirection: CollectionSortDirection,
  selectedSortBy: CollectionSortBy,
) {
  return sortDirectionLabel(
    selectedSortBy,
    nextSortDirection(currentSortBy, currentSortDirection, selectedSortBy),
  )
}

function Collection() {
  const [collection, setCollection] = useState<CollectionResponse | null>(null)
  const [searchInput, setSearchInput] = useState('')
  const [activeSearch, setActiveSearch] = useState('')
  const [offset, setOffset] = useState(0)
  const [pageSize, setPageSize] = useState<PageSize>(DEFAULT_PAGE_SIZE)
  const [sortBy, setSortBy] = useState<CollectionSortBy>('CIGAR')
  const [sortDirection, setSortDirection] = useState<CollectionSortDirection>('ASC')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const requestIdRef = useRef(0)
  const headingRef = useRef<HTMLHeadingElement | null>(null)

  async function loadCollection(
    search: string,
    nextOffset: number,
    selectedPageSize = pageSize,
    selectedSortBy = sortBy,
    selectedSortDirection = sortDirection,
  ) {
    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId
    setIsLoading(true)
    setError('')

    try {
      const data = await getCollection({
        search,
        limit: selectedPageSize,
        offset: selectedPageSize === 'all' ? 0 : nextOffset,
        sortBy: selectedSortBy,
        sortDirection: selectedSortDirection,
      })

      if (requestId !== requestIdRef.current) {
        return
      }

      setCollection(data)
    } catch (loadError) {
      if (requestId !== requestIdRef.current) {
        return
      }

      setError(loadError instanceof Error ? loadError.message : 'Unable to load collection.')
    } finally {
      if (requestId === requestIdRef.current) {
        setIsLoading(false)
      }
    }
  }

  useEffect(() => {
    void loadCollection('', 0, DEFAULT_PAGE_SIZE, 'CIGAR', 'ASC')
  }, [])

  function handleSearch(event: FormEvent) {
    event.preventDefault()
    const submittedSearch = searchInput.trim()

    setSearchInput(submittedSearch)
    setActiveSearch(submittedSearch)
    setOffset(0)
    void loadCollection(submittedSearch, 0, pageSize, sortBy, sortDirection)
  }

  function handleClearSearch() {
    setSearchInput('')
    setActiveSearch('')
    setOffset(0)
    void loadCollection('', 0, pageSize, sortBy, sortDirection)
  }

  function handlePageChange(nextOffset: number) {
    setOffset(nextOffset)
    void loadCollection(activeSearch, nextOffset, pageSize, sortBy, sortDirection)
    headingRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  function handlePageSizeChange(value: string) {
    const nextPageSize: PageSize = value === 'all' ? 'all' : value === '100' ? 100 : 50

    setPageSize(nextPageSize)
    setOffset(0)
    void loadCollection(activeSearch, 0, nextPageSize, sortBy, sortDirection)
    headingRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  function handleSortChange(nextSortBy: CollectionSortBy, nextDirection?: CollectionSortDirection) {
    const resolvedDirection =
      nextDirection ?? nextSortDirection(sortBy, sortDirection, nextSortBy)

    setSortBy(nextSortBy)
    setSortDirection(resolvedDirection)
    setOffset(0)
    void loadCollection(activeSearch, 0, pageSize, nextSortBy, resolvedDirection)
    headingRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const summary = collection?.summary ?? {
    totalQuantity: 0,
    uniqueCigarCount: 0,
    lotCount: 0,
    locationCount: 0,
  }
  const isSearchActive = activeSearch.trim().length > 0
  const items = collection?.items ?? []
  const effectiveOffset = collection?.offset ?? offset
  const isShowingAll = pageSize === 'all'
  const resultStart = collection && collection.total > 0 ? effectiveOffset + 1 : 0
  const resultEnd = collection
    ? Math.min(effectiveOffset + collection.items.length, collection.total)
    : 0
  const resultNoun = collection?.total === 1 ? 'cigar' : 'cigars'
  const resultText =
    collection && isShowingAll
      ? `Showing all ${collection.total} ${resultNoun}`
      : collection
        ? `Showing ${resultStart}-${resultEnd} of ${collection.total}`
        : ''
  const canPageBackward = !isShowingAll && effectiveOffset > 0
  const canPageForward =
    !isShowingAll &&
    collection !== null &&
    collection.offset + collection.items.length < collection.total
  const showPageButtons = canPageBackward || canPageForward
  const visibleTopLevelIssues = collection ? topLevelIssues(collection) : []
  const renderSortHeader = (headerSortBy: CollectionSortBy) => {
    const isActive = sortBy === headerSortBy
    const nextDirection = nextSortDirection(sortBy, sortDirection, headerSortBy)

    return (
      <button
        className={isActive ? 'collection-sort-header active' : 'collection-sort-header'}
        type="button"
        onClick={() => handleSortChange(headerSortBy)}
        aria-label={`Sort by ${SORT_LABELS[headerSortBy]} ${nextSortLabel(
          sortBy,
          sortDirection,
          headerSortBy,
        )}`}
      >
        <span className="collection-sort-label">{SORT_LABELS[headerSortBy]}</span>
        {isActive ? (
          <span className="collection-sort-indicator" aria-hidden="true">
            {sortDirection === 'ASC' ? '▲' : '▼'}
          </span>
        ) : null}
        <span className="collection-sort-spacer" aria-hidden="true" />
      </button>
    )
  }

  return (
    <div className="collection-page">
      <header className="page-header">
        <div className="page-header-copy">
          <h2 ref={headingRef}>Collection</h2>
          <p className="page-subtitle">
            Browse your current cigars and find exactly where they are stored.
          </p>
        </div>
      </header>

      <section className="summary-grid collection-summary-grid">
        <article className="card collection-summary-card">
          <p>Total Cigars</p>
          <strong>{summary.totalQuantity}</strong>
        </article>
        <article className="card collection-summary-card">
          <p>Unique Cigars</p>
          <strong>{summary.uniqueCigarCount}</strong>
        </article>
        <article className="card collection-summary-card">
          <p>Lots</p>
          <strong>{summary.lotCount}</strong>
        </article>
        <article className="card collection-summary-card">
          <p>Storage Locations</p>
          <strong>{summary.locationCount}</strong>
        </article>
      </section>

      <section className="panel collection-panel">
        <div className="panel-header-row collection-panel-header">
          <div>
            <h3>By Cigar</h3>
            <p className="muted">Current inventory grouped by catalog cigar.</p>
          </div>

          <form className="search-form collection-search-form" onSubmit={handleSearch}>
            <input
              type="search"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Search cigars, humidors, drawers, or shelves"
              aria-label="Search Collection"
            />
            <button className="primary-button" type="submit" disabled={isLoading}>
              Search
            </button>
            {isSearchActive ? (
              <button
                className="secondary-button"
                type="button"
                onClick={handleClearSearch}
                disabled={isLoading}
              >
                Clear
              </button>
            ) : null}
          </form>
        </div>

        <div className="collection-mobile-sort">
          <label>
            <span>Sort By</span>
            <select
              value={sortBy}
              onChange={(event) =>
                handleSortChange(
                  event.target.value as CollectionSortBy,
                  NATURAL_SORT_DIRECTIONS[event.target.value as CollectionSortBy],
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
                handleSortChange(sortBy, event.target.value as CollectionSortDirection)
              }
              disabled={isLoading}
            >
              <option value="ASC">{sortDirectionLabel(sortBy, 'ASC')}</option>
              <option value="DESC">{sortDirectionLabel(sortBy, 'DESC')}</option>
            </select>
          </label>
        </div>

        {error ? <p className="error-text">{error}</p> : null}
        {isLoading && !collection ? <p className="muted">Loading Collection...</p> : null}
        {isLoading && collection ? <p className="search-results-message">Updating Collection...</p> : null}

        {collection && isSearchActive ? (
          <p className="search-results-message">
            {collection.total === 0
              ? `No Collection cigars match "${activeSearch}".`
              : `${collection.total} ${
                  collection.total === 1 ? 'cigar' : 'cigars'
                } found for "${activeSearch}"${
                  collection.searchSummary.matchedLocationQuantity > 0
                    ? ` · ${collection.searchSummary.matchedLocationQuantity} cigars in matching locations`
                    : ''
                }.`}
          </p>
        ) : null}

        {visibleTopLevelIssues.length > 0 ? (
          <div className="collection-warning-panel" role="status">
            <strong>Needs attention</strong>
            <p>
              Some inventory records need review. Collection quantities are still shown from
              current positive location balances.
            </p>
          </div>
        ) : null}

        {collection && collection.total === 0 && !isSearchActive ? (
          <div className="collection-empty-state">
            <h3>No cigars are currently stored in your Collection.</h3>
            <p>Receive and store a purchase line to add it here.</p>
          </div>
        ) : null}

        {collection && collection.total === 0 && isSearchActive ? (
          <div className="collection-empty-state">
            <h3>No Collection cigars match "{activeSearch}".</h3>
            <button className="secondary-button" type="button" onClick={handleClearSearch}>
              Clear Search
            </button>
          </div>
        ) : null}

        {items.length > 0 ? (
          <>
            <div className="desktop-table collection-desktop-table">
              <table className="data-table collection-table">
                <colgroup>
                  <col className="collection-col-cigar" />
                  <col className="collection-col-qty" />
                  <col className="collection-col-lots" />
                  <col className="collection-col-locations" />
                  <col className="collection-col-oldest" />
                  <col className="collection-col-avg-cost" />
                  <col className="collection-col-primary-location" />
                </colgroup>
                <thead>
                  <tr>
                    <th aria-sort={sortBy === 'CIGAR' ? (sortDirection === 'ASC' ? 'ascending' : 'descending') : 'none'}>
                      {renderSortHeader('CIGAR')}
                    </th>
                    <th aria-sort={sortBy === 'QUANTITY' ? (sortDirection === 'ASC' ? 'ascending' : 'descending') : 'none'}>
                      {renderSortHeader('QUANTITY')}
                    </th>
                    <th aria-sort={sortBy === 'LOTS' ? (sortDirection === 'ASC' ? 'ascending' : 'descending') : 'none'}>
                      {renderSortHeader('LOTS')}
                    </th>
                    <th aria-sort={sortBy === 'LOCATIONS' ? (sortDirection === 'ASC' ? 'ascending' : 'descending') : 'none'}>
                      {renderSortHeader('LOCATIONS')}
                    </th>
                    <th aria-sort={sortBy === 'OLDEST' ? (sortDirection === 'ASC' ? 'ascending' : 'descending') : 'none'}>
                      {renderSortHeader('OLDEST')}
                    </th>
                    <th aria-sort={sortBy === 'AVERAGE_COST' ? (sortDirection === 'ASC' ? 'ascending' : 'descending') : 'none'}>
                      {renderSortHeader('AVERAGE_COST')}
                    </th>
                    <th>Primary Location</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => {
                    const cigar = item.catalogCigar
                    const display = locationDisplay(item, isSearchActive)
                    const details = cigarDetails(cigar)

                    return (
                      <tr key={cigar.id}>
                        <td>
                          <div className="collection-cigar-cell">
                            <strong>{cigarTitle(cigar)}</strong>
                            <span>{cigarSubtitle(cigar)}</span>
                            {details ? <small>{details}</small> : null}
                            {item.issues.length > 0 ? (
                              <em title={issueTitle(item.issues)}>Needs Attention</em>
                            ) : null}
                          </div>
                        </td>
                        <td className="collection-number-cell">{item.totalQuantity}</td>
                        <td className="collection-number-cell">{item.lotCount}</td>
                        <td className="collection-number-cell">{item.locationCount}</td>
                        <td className="collection-number-cell">
                          {formatDate(item.oldestReceivedDate)}
                        </td>
                        <td className="collection-money-cell">
                          {formatMoney(item.weightedAverageCostPerCigar)}
                        </td>
                        <td>
                          <div className="collection-location-cell">
                            {display.isMatch ? (
                              <strong>
                                {item.matchingLocationQuantity} in matching location
                                {item.matchingLocations.length === 1 ? '' : 's'} ·{' '}
                                {item.totalQuantity} owned total
                              </strong>
                            ) : null}
                            {display.locations.length > 0 ? (
                              display.locations.map((location) => (
                                <span key={location.storageSubLocationId}>
                                  {locationQuantityLine(location)}
                                </span>
                              ))
                            ) : (
                              <span>-</span>
                            )}
                            {!display.isMatch && display.moreCount > 0 ? (
                              <small>
                                +{display.moreCount} more{' '}
                                {display.moreCount === 1 ? 'location' : 'locations'}
                              </small>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="collection-card-list">
              {items.map((item) => {
                const cigar = item.catalogCigar
                const display = locationDisplay(item, isSearchActive)
                const details = cigarDetails(cigar)

                return (
                  <article className="collection-card" key={cigar.id}>
                    <div className="collection-card-title">
                      <strong>{cigarTitle(cigar)}</strong>
                      <span>{cigarSubtitle(cigar)}</span>
                      {details ? <small>{details}</small> : null}
                    </div>

                    {item.issues.length > 0 ? (
                      <span className="attention-badge" title={issueTitle(item.issues)}>
                        Needs Attention
                      </span>
                    ) : null}

                    <div className="collection-card-stats">
                      <div>
                        <p>Total</p>
                        <strong>{item.totalQuantity} owned</strong>
                      </div>
                      <div>
                        <p>Lots</p>
                        <strong>{item.lotCount}</strong>
                      </div>
                      <div>
                        <p>Locations</p>
                        <strong>{item.locationCount}</strong>
                      </div>
                      <div>
                        <p>Oldest</p>
                        <strong>{formatDate(item.oldestReceivedDate)}</strong>
                      </div>
                      <div>
                        <p>Avg Cost</p>
                        <strong>{formatMoney(item.weightedAverageCostPerCigar)}</strong>
                      </div>
                    </div>

                    <div className="collection-card-locations">
                      {display.isMatch ? (
                        <strong>
                          {item.matchingLocationQuantity} in matching location
                          {item.matchingLocations.length === 1 ? '' : 's'} ·{' '}
                          {item.totalQuantity} owned total
                        </strong>
                      ) : null}
                      {display.locations.length > 0 ? (
                        display.locations.map((location) => (
                          <span key={location.storageSubLocationId}>
                            {locationQuantityLine(location)}
                          </span>
                        ))
                      ) : (
                        <span>-</span>
                      )}
                      {!display.isMatch && display.moreCount > 0 ? (
                        <small>
                          +{display.moreCount} more{' '}
                          {display.moreCount === 1 ? 'location' : 'locations'}
                        </small>
                      ) : null}
                    </div>
                  </article>
                )
              })}
            </div>
          </>
        ) : null}

        {collection && collection.total > 0 ? (
          <div className="collection-pagination">
            <p>{resultText}</p>
            <div className="collection-pagination-controls">
              {showPageButtons ? (
                <div className="collection-pagination-buttons">
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() =>
                      handlePageChange(
                        Math.max(effectiveOffset - (pageSize === 'all' ? 0 : pageSize), 0),
                      )
                    }
                    disabled={!canPageBackward || isLoading}
                  >
                    Previous
                  </button>
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() =>
                      handlePageChange(effectiveOffset + (pageSize === 'all' ? 0 : pageSize))
                    }
                    disabled={!canPageForward || isLoading}
                  >
                    Next
                  </button>
                </div>
              ) : null}
              <label className="collection-page-size">
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
      </section>
    </div>
  )
}

export default Collection
