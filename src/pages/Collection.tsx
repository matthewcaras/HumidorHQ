import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import {
  getCollection,
  getCollectionCigarDetails,
  getCollectionHumidorDetails,
  getCollectionHumidors,
  type CatalogCigar,
  type CollectionCigarDetails,
  type CollectionHumidorDetails,
  type CollectionHumidorSectionCigar,
  type CollectionHumidorSummary,
  type CollectionHumidorsResponse,
  type CollectionInventoryIssue,
  type CollectionItem,
  type CollectionLocationSummary,
  type CollectionLotSummary,
  type CollectionResponse,
  type CollectionSortBy,
  type CollectionSortDirection,
} from '../services/api'

type PageSize = 50 | 100 | 'all'
type CollectionView = 'CIGAR' | 'HUMIDOR'

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

function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '-'
  }

  return `${value.toFixed(1)}%`
}

function sectionKindLabel(value: string | null | undefined) {
  switch (value) {
    case 'DRAWER':
      return 'Drawer'
    case 'SHELF':
      return 'Shelf'
    case 'CUSTOM':
      return 'Custom'
    case 'GENERAL':
    default:
      return 'General'
  }
}

function capacityText(totalQuantity: number, capacity: number | null | undefined) {
  if (capacity === null || capacity === undefined || capacity <= 0) {
    return 'Capacity not set'
  }

  return `${totalQuantity} of ${capacity} cigars`
}

function capacityPercentText(percent: number | null | undefined) {
  if (percent === null || percent === undefined || !Number.isFinite(percent)) {
    return ''
  }

  return percent > 100 ? `${formatPercent(percent)} of stated capacity` : `${formatPercent(percent)} full`
}

function humidorMetadataLine(
  isActive: boolean,
  totalQuantity: number,
  capacity: number | null | undefined,
  percent: number | null | undefined,
) {
  const status = isActive ? 'Active' : 'Archived'
  const percentText = capacityPercentText(percent)

  if (capacity === null || capacity === undefined || capacity <= 0) {
    return totalQuantity > 0 ? `${status} - ${totalQuantity} cigars` : `${status} - Capacity not set`
  }

  if (totalQuantity === 0) {
    return `${status} - Empty - Capacity ${capacity}`
  }

  return `${status} - ${totalQuantity} of ${capacity} cigars${percentText ? ` - ${percentText}` : ''}`
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

function dimensionsLabel(cigar: CatalogCigar) {
  if (!cigar.length && !cigar.ringGauge) {
    return ''
  }

  return [cigar.length ? String(cigar.length) : null, cigar.ringGauge ? String(cigar.ringGauge) : null]
    .filter(Boolean)
    .join(' x ')
}

function cigarHeaderMeta(cigar: CatalogCigar) {
  return [
    dimensionsLabel(cigar),
    cigar.wrapper,
    cigar.strength,
    cigar.country,
  ].filter(Boolean)
}

function issueMessage(issue: CollectionInventoryIssue) {
  switch (issue.code) {
    case 'LOT_BALANCE_MISMATCH':
      return 'A lot quantity does not match its stored location balances.'
    case 'LOT_CURRENT_WITHOUT_LOCATION_BALANCE':
      return 'A lot has current quantity but no stored location balance.'
    case 'ARCHIVED_LOCATION_WITH_INVENTORY':
      return 'Inventory is stored in an archived humidor or section.'
    case 'ARCHIVED_CATALOG_WITH_INVENTORY':
      return 'This cigar is archived in the Catalog but still has inventory.'
    case 'COST_FALLBACK_USED':
      return 'Original unit price is being used because true-cost history is missing.'
    case 'MSRP_CATALOG_FALLBACK_USED':
      return 'Current Catalog MSRP is being used because lot MSRP history is missing.'
    case 'COST_DATA_MISSING':
      return 'Cost history is missing for part of this inventory.'
    case 'MSRP_DATA_MISSING':
      return 'MSRP history is missing for part of this inventory.'
    default:
      return issue.message
  }
}

function issueTitle(issues: CollectionInventoryIssue[]) {
  return issues.map((issue) => issueMessage(issue)).join(' ')
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

function lotIssueTitle(lot: CollectionLotSummary) {
  return lot.issues.map((issue) => issueMessage(issue)).join(' ')
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
  const [activeView, setActiveView] = useState<CollectionView>('HUMIDOR')
  const [collection, setCollection] = useState<CollectionResponse | null>(null)
  const [searchInput, setSearchInput] = useState('')
  const [activeSearch, setActiveSearch] = useState('')
  const [offset, setOffset] = useState(0)
  const [pageSize, setPageSize] = useState<PageSize>(DEFAULT_PAGE_SIZE)
  const [sortBy, setSortBy] = useState<CollectionSortBy>('CIGAR')
  const [sortDirection, setSortDirection] = useState<CollectionSortDirection>('ASC')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedCigarId, setSelectedCigarId] = useState<number | null>(null)
  const [cigarDetailsData, setCigarDetailsData] = useState<CollectionCigarDetails | null>(null)
  const [isDetailsLoading, setIsDetailsLoading] = useState(false)
  const [detailsError, setDetailsError] = useState('')
  const [collectionHumidors, setCollectionHumidors] =
    useState<CollectionHumidorsResponse | null>(null)
  const [isHumidorsLoading, setIsHumidorsLoading] = useState(false)
  const [humidorsError, setHumidorsError] = useState('')
  const [selectedHumidorId, setSelectedHumidorId] = useState<number | null>(null)
  const [humidorDetails, setHumidorDetails] = useState<CollectionHumidorDetails | null>(null)
  const [isHumidorDetailsLoading, setIsHumidorDetailsLoading] = useState(false)
  const [humidorDetailsError, setHumidorDetailsError] = useState('')
  const requestIdRef = useRef(0)
  const detailsRequestIdRef = useRef(0)
  const humidorsRequestIdRef = useRef(0)
  const humidorDetailsRequestIdRef = useRef(0)
  const detailsOpenerRef = useRef<HTMLElement | null>(null)
  const humidorOpenerRef = useRef<HTMLElement | null>(null)
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

  async function openCigarDetails(catalogCigarId: number, opener: HTMLElement) {
    const requestId = detailsRequestIdRef.current + 1
    detailsRequestIdRef.current = requestId
    detailsOpenerRef.current = opener
    setSelectedCigarId(catalogCigarId)
    setCigarDetailsData(null)
    setDetailsError('')
    setIsDetailsLoading(true)

    try {
      const data = await getCollectionCigarDetails(catalogCigarId)

      if (requestId !== detailsRequestIdRef.current) {
        return
      }

      setCigarDetailsData(data)
    } catch (loadError) {
      if (requestId !== detailsRequestIdRef.current) {
        return
      }

      setDetailsError(loadError instanceof Error ? loadError.message : 'Unable to load cigar details.')
    } finally {
      if (requestId === detailsRequestIdRef.current) {
        setIsDetailsLoading(false)
      }
    }
  }

  async function loadCollectionHumidors() {
    const requestId = humidorsRequestIdRef.current + 1
    humidorsRequestIdRef.current = requestId
    setIsHumidorsLoading(true)
    setHumidorsError('')

    try {
      const data = await getCollectionHumidors()

      if (requestId !== humidorsRequestIdRef.current) {
        return
      }

      setCollectionHumidors(data)
    } catch (loadError) {
      if (requestId !== humidorsRequestIdRef.current) {
        return
      }

      setHumidorsError(
        loadError instanceof Error ? loadError.message : 'Unable to load Collection humidors.',
      )
    } finally {
      if (requestId === humidorsRequestIdRef.current) {
        setIsHumidorsLoading(false)
      }
    }
  }

  async function openHumidorDetails(storageLocationId: number, opener: HTMLElement) {
    const requestId = humidorDetailsRequestIdRef.current + 1
    humidorDetailsRequestIdRef.current = requestId
    humidorOpenerRef.current = opener
    setSelectedHumidorId(storageLocationId)
    setHumidorDetails(null)
    setHumidorDetailsError('')
    setIsHumidorDetailsLoading(true)

    try {
      const data = await getCollectionHumidorDetails(storageLocationId)

      if (requestId !== humidorDetailsRequestIdRef.current) {
        return
      }

      setHumidorDetails(data)
    } catch (loadError) {
      if (requestId !== humidorDetailsRequestIdRef.current) {
        return
      }

      setHumidorDetailsError(
        loadError instanceof Error ? loadError.message : 'Unable to load Humidor details.',
      )
    } finally {
      if (requestId === humidorDetailsRequestIdRef.current) {
        setIsHumidorDetailsLoading(false)
      }
    }
  }

  function closeCigarDetails() {
    detailsRequestIdRef.current += 1
    setSelectedCigarId(null)
    setCigarDetailsData(null)
    setDetailsError('')
    setIsDetailsLoading(false)

    window.setTimeout(() => {
      detailsOpenerRef.current?.focus()
    }, 0)
  }

  function closeHumidorDetails() {
    humidorDetailsRequestIdRef.current += 1
    setSelectedHumidorId(null)
    setHumidorDetails(null)
    setHumidorDetailsError('')
    setIsHumidorDetailsLoading(false)

    window.setTimeout(() => {
      humidorOpenerRef.current?.focus()
    }, 0)
  }

  useEffect(() => {
    void loadCollectionHumidors()
  }, [])

  useEffect(() => {
    if (selectedCigarId === null) {
      return
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        closeCigarDetails()
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [selectedCigarId])

  useEffect(() => {
    if (selectedHumidorId === null) {
      return
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && selectedCigarId === null) {
        closeHumidorDetails()
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [selectedHumidorId, selectedCigarId])

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

  function handleViewChange(nextView: CollectionView) {
    setActiveView(nextView)

    if (nextView === 'HUMIDOR' && !collectionHumidors && !isHumidorsLoading) {
      void loadCollectionHumidors()
    }
  }

  const summary = collection?.summary ?? {
    totalQuantity: 0,
    uniqueCigarCount: 0,
    lotCount: 0,
    locationCount: 0,
  }
  const humidorSummary = collectionHumidors?.summary ?? {
    humidorCount: 0,
    totalQuantity: 0,
    uniqueCigarCount: 0,
    lotCount: 0,
    occupiedSubLocationCount: 0,
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

  function handleOpenDetailsKeyDown(
    event: KeyboardEvent<HTMLElement>,
    catalogCigarId: number,
  ) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      void openCigarDetails(catalogCigarId, event.currentTarget)
    }
  }

  function handleOpenHumidorDetailsKeyDown(
    event: KeyboardEvent<HTMLElement>,
    storageLocationId: number,
  ) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      void openHumidorDetails(storageLocationId, event.currentTarget)
    }
  }

  function renderHumidorSummaryCards() {
    return (
      <section className="summary-grid collection-summary-grid collection-humidor-summary-grid">
        <article className="card collection-summary-card">
          <p>Humidors</p>
          <strong>{humidorSummary.humidorCount}</strong>
        </article>
        <article className="card collection-summary-card">
          <p>Total Cigars</p>
          <strong>{humidorSummary.totalQuantity}</strong>
        </article>
        <article className="card collection-summary-card">
          <p>Unique Cigars</p>
          <strong>{humidorSummary.uniqueCigarCount}</strong>
        </article>
        <article className="card collection-summary-card">
          <p>Lots</p>
          <strong>{humidorSummary.lotCount}</strong>
        </article>
      </section>
    )
  }

  function renderHumidorCard(humidor: CollectionHumidorSummary) {
    const capacitySummary = capacityText(
      humidor.totalQuantity,
      humidor.storageLocation.capacity,
    )
    const capacityPercent = capacityPercentText(humidor.capacityUsedPercent)
    const moreSections = Math.max(
      humidor.occupiedSubLocationCount - humidor.sectionsPreview.length,
      0,
    )

    return (
      <article
        className="collection-humidor-card"
        key={humidor.storageLocation.id}
        tabIndex={0}
        role="button"
        aria-label={`Open ${humidor.storageLocation.name} Collection details`}
        onClick={(event) =>
          void openHumidorDetails(humidor.storageLocation.id, event.currentTarget)
        }
        onKeyDown={(event) =>
          handleOpenHumidorDetailsKeyDown(event, humidor.storageLocation.id)
        }
      >
        <div className="collection-humidor-card-header">
          <div>
            <h4>{humidor.storageLocation.name}</h4>
          </div>
          {!humidor.storageLocation.isActive ? (
            <span className="attention-badge">Archived</span>
          ) : null}
          {humidor.issues.length > 0 ? (
            <span className="attention-badge" title={issueTitle(humidor.issues)}>
              Needs Attention
            </span>
          ) : null}
        </div>

        <div className="collection-humidor-stats">
          <div>
            <p>Total</p>
            <strong>{humidor.totalQuantity}</strong>
          </div>
          <div>
            <p>Unique</p>
            <strong>{humidor.uniqueCigarCount}</strong>
          </div>
          <div>
            <p>Lots</p>
            <strong>{humidor.lotCount}</strong>
          </div>
          <div>
            <p>Sections</p>
            <strong>
              {humidor.occupiedSubLocationCount}/{humidor.totalSubLocationCount}
            </strong>
          </div>
          <div>
            <p>Oldest</p>
            <strong>{formatDate(humidor.oldestReceivedDate)}</strong>
          </div>
          <div>
            <p>Capacity</p>
            <strong>{capacitySummary}</strong>
            {capacityPercent ? <small>{capacityPercent}</small> : null}
          </div>
        </div>

        <div className="collection-humidor-sections-preview">
          {humidor.sectionsPreview.length > 0 ? (
            humidor.sectionsPreview.map((section) => (
              <div key={section.storageSubLocationId}>
                <strong>{section.name}</strong>
                <span>
                  {sectionKindLabel(section.kind)} - Qty {section.quantity}
                </span>
                <small>
                  {section.uniqueCigarCount} unique - {section.lotCount}{' '}
                  {section.lotCount === 1 ? 'lot' : 'lots'}
                </small>
              </div>
            ))
          ) : (
            <div>
              <strong>Empty</strong>
              <span>{humidor.totalSubLocationCount} active sections</span>
            </div>
          )}
          {moreSections > 0 ? (
            <small>
              +{moreSections} more occupied {moreSections === 1 ? 'section' : 'sections'}
            </small>
          ) : null}
        </div>
      </article>
    )
  }

  function renderHumidorView() {
    const humidors = collectionHumidors?.humidors ?? []

    return (
      <>
        {renderHumidorSummaryCards()}

        <section className="panel collection-panel collection-humidor-panel">
          <div className="panel-header-row collection-panel-header collection-humidor-panel-header">
            <div>
              <h3>By Humidor</h3>
              <p className="muted">Current inventory grouped by humidor and section.</p>
            </div>
          </div>

          {humidorsError ? <p className="error-text">{humidorsError}</p> : null}
          {isHumidorsLoading && !collectionHumidors ? (
            <p className="muted">Loading Collection humidors...</p>
          ) : null}
          {isHumidorsLoading && collectionHumidors ? (
            <p className="search-results-message">Updating Collection humidors...</p>
          ) : null}

          {collectionHumidors && collectionHumidors.issues.length > 0 ? (
            <div className="collection-warning-panel" role="status">
              <strong>Needs attention</strong>
              <p>
                Some Humidor inventory records need review. Quantities are still shown from
                current positive location balances.
              </p>
            </div>
          ) : null}

          {collectionHumidors && humidors.length === 0 ? (
            <div className="collection-empty-state">
              <h3>No active humidors are available.</h3>
            </div>
          ) : null}

          {humidors.length > 0 ? (
            <div className="collection-humidor-grid">
              {humidors.map((humidor) => renderHumidorCard(humidor))}
            </div>
          ) : null}
        </section>
      </>
    )
  }

  function renderSectionCigar(cigar: CollectionHumidorSectionCigar) {
    const details = cigarDetails(cigar.catalogCigar)

    return (
      <button
        className="collection-section-cigar"
        key={cigar.catalogCigar.id}
        type="button"
        onClick={(event) => {
          event.stopPropagation()
          void openCigarDetails(cigar.catalogCigar.id, event.currentTarget)
        }}
      >
        <div className="collection-section-cigar-identity">
          <strong>{cigar.catalogCigar.manufacturer}</strong>
          <span>
            {cigar.catalogCigar.series} - {cigar.catalogCigar.vitola}
          </span>
          {details ? <small>{details}</small> : null}
          {cigar.issues.length > 0 ? (
            <em title={issueTitle(cigar.issues)}>Needs Attention</em>
          ) : null}
        </div>
        <div className="collection-section-cigar-stats">
          <span>
            <strong>{cigar.quantity}</strong>
            Qty
          </span>
          <span>
            <strong>{cigar.lotCount}</strong>
            {cigar.lotCount === 1 ? 'Lot' : 'Lots'}
          </span>
          <span>
            <strong>{formatDate(cigar.oldestReceivedDate)}</strong>
            Oldest
          </span>
        </div>
      </button>
    )
  }

  function renderHumidorDetailsPanel() {
    if (selectedHumidorId === null) {
      return null
    }

    const details = humidorDetails
    const storageLocation = details?.storageLocation
    const metadataLine =
      details && storageLocation
        ? humidorMetadataLine(
            storageLocation.isActive,
            details.summary.totalQuantity,
            storageLocation.capacity,
            details.summary.capacityUsedPercent,
          )
        : ''

    return (
      <div
        className="modal-backdrop collection-details-backdrop collection-humidor-details-backdrop"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget && selectedCigarId === null) {
            closeHumidorDetails()
          }
        }}
      >
        <section
          className="modal collection-details-modal collection-humidor-details-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="collection-humidor-details-title"
        >
          <div className="modal-header collection-details-header collection-humidor-modal-header">
            <div>
              <p className="modal-kicker">Humidor Details</p>
              <h3 id="collection-humidor-details-title">
                {storageLocation ? storageLocation.name : 'Humidor Details'}
              </h3>
              {metadataLine ? (
                <span className="collection-humidor-modal-meta">{metadataLine}</span>
              ) : null}
              {storageLocation && !storageLocation.isActive ? (
                <span className="attention-badge">Archived</span>
              ) : null}
            </div>
            <button
              className="icon-button"
              type="button"
              aria-label="Close humidor details"
              onClick={closeHumidorDetails}
            >
              &times;
            </button>
          </div>

          {isHumidorDetailsLoading ? <p className="muted">Loading Humidor details...</p> : null}
          {humidorDetailsError ? <p className="error-text">{humidorDetailsError}</p> : null}

          {details && storageLocation ? (
            <div className="collection-details-content collection-humidor-details-content">
              {storageLocation.notes ? (
                <section className="collection-humidor-notes">
                  <p>{storageLocation.notes}</p>
                </section>
              ) : null}

              {details.issues.length > 0 ? (
                <section className="collection-detail-warning">
                  <strong>Needs Attention</strong>
                  <ul>
                    {details.issues.map((issue) => (
                      <li key={issueKey(issue)}>{issueMessage(issue)}</li>
                    ))}
                  </ul>
                </section>
              ) : null}

              <section className="collection-details-section">
                <div className="collection-section-heading">
                  <h4>Current Humidor</h4>
                </div>
                <div className="collection-detail-summary-grid collection-humidor-detail-summary-grid">
                  <article>
                    <span>Total Cigars</span>
                    <strong>{details.summary.totalQuantity}</strong>
                  </article>
                  <article>
                    <span>Unique Cigars</span>
                    <strong>{details.summary.uniqueCigarCount}</strong>
                  </article>
                  <article>
                    <span>Lots</span>
                    <strong>{details.summary.lotCount}</strong>
                  </article>
                  <article>
                    <span>Oldest Received</span>
                    <strong>{formatDate(details.summary.oldestReceivedDate)}</strong>
                  </article>
                  <article>
                    <span>Capacity Used</span>
                    <strong>{formatPercent(details.summary.capacityUsedPercent)}</strong>
                  </article>
                </div>
              </section>

              {details.summary.totalQuantity === 0 ? (
                <div className="collection-empty-state collection-humidor-empty-state">
                  <h3>No cigars are currently stored in this Humidor.</h3>
                </div>
              ) : null}

              <section className="collection-details-section">
                <div className="collection-section-heading">
                  <h4>Sections</h4>
                </div>
                <div className="collection-humidor-section-grid">
                  {details.sections.map((section) => (
                    <article className="collection-humidor-section-card" key={section.storageSubLocationId}>
                      <div className="collection-humidor-section-header">
                        <div>
                          <h5>{section.name}</h5>
                        </div>
                        {!section.isActive ? <span className="attention-badge">Archived</span> : null}
                        {section.issues.length > 0 ? (
                          <span className="attention-badge" title={issueTitle(section.issues)}>
                            Needs Attention
                          </span>
                        ) : null}
                      </div>

                      {section.issues.length > 0 ? (
                        <div className="collection-lot-warning">
                          {section.issues.map((issue) => (
                            <p key={issueKey(issue)}>{issueMessage(issue)}</p>
                          ))}
                        </div>
                      ) : null}

                      <div className="collection-humidor-section-stats">
                        <div>
                          <p>Qty</p>
                          <strong>{section.quantity}</strong>
                        </div>
                        <div>
                          <p>Unique</p>
                          <strong>{section.uniqueCigarCount}</strong>
                        </div>
                        <div>
                          <p>Lots</p>
                          <strong>{section.lotCount}</strong>
                        </div>
                        <div>
                          <p>Oldest</p>
                          <strong>{formatDate(section.oldestReceivedDate)}</strong>
                        </div>
                      </div>

                      {section.cigars.length > 0 ? (
                        <div className="collection-section-cigar-list">
                          {section.cigars.map((cigar) => renderSectionCigar(cigar))}
                        </div>
                      ) : (
                        <p className="collection-section-empty">
                          No cigars stored in this section.
                        </p>
                      )}
                    </article>
                  ))}
                </div>
              </section>
            </div>
          ) : null}
        </section>
      </div>
    )
  }

  function renderDetailsPanel() {
    if (selectedCigarId === null) {
      return null
    }

    const details = cigarDetailsData
    const cigar = details?.catalogCigar
    const headerMeta = cigar ? cigarHeaderMeta(cigar) : []

    return (
      <div
        className="modal-backdrop collection-details-backdrop"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) {
            closeCigarDetails()
          }
        }}
      >
        <section
          className="modal collection-details-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="collection-cigar-details-title"
        >
          <div className="modal-header collection-details-header">
            <div>
              <p className="modal-kicker">Cigar Details</p>
              <h3 id="collection-cigar-details-title">
                {cigar ? cigar.manufacturer : 'Cigar Details'}
              </h3>
            </div>
            <button
              className="icon-button"
              type="button"
              aria-label="Close cigar details"
              onClick={closeCigarDetails}
            >
              &times;
            </button>
          </div>

          {isDetailsLoading ? <p className="muted">Loading cigar details...</p> : null}
          {detailsError ? <p className="error-text">{detailsError}</p> : null}

          {details ? (
            <div className="collection-details-content">
              <section className="collection-details-hero">
                <div>
                  <p>{details.catalogCigar.manufacturer}</p>
                  <h4>
                    {details.catalogCigar.series} - {details.catalogCigar.vitola}
                  </h4>
                  {headerMeta.length > 0 ? (
                    <span>{headerMeta.join(' - ')}</span>
                  ) : null}
                </div>
                {!details.catalogCigar.isActive ? (
                  <span className="attention-badge">Catalog Archived</span>
                ) : null}
              </section>

              {details.issues.length > 0 ? (
                <section className="collection-detail-warning">
                  <strong>Needs Attention</strong>
                  <ul>
                    {details.issues.map((issue) => (
                      <li key={issueKey(issue)}>{issueMessage(issue)}</li>
                    ))}
                  </ul>
                </section>
              ) : null}

              <section className="collection-details-section">
                <div className="collection-section-heading">
                  <h4>Current Collection</h4>
                </div>
                <div className="collection-detail-summary-grid">
                  <article>
                    <span>Total Owned</span>
                    <strong>{details.summary.totalQuantity}</strong>
                  </article>
                  <article>
                    <span>Lots</span>
                    <strong>{details.summary.lotCount}</strong>
                  </article>
                  <article>
                    <span>Locations</span>
                    <strong>{details.summary.locationCount}</strong>
                  </article>
                  <article>
                    <span>Oldest Received</span>
                    <strong>{formatDate(details.summary.oldestReceivedDate)}</strong>
                  </article>
                  <article>
                    <span>Avg True Cost</span>
                    <strong>{formatMoney(details.summary.weightedAverageCostPerCigar)}</strong>
                  </article>
                  <article>
                    <span>Avg MSRP</span>
                    <strong>{formatMoney(details.summary.averageMsrpPerCigar)}</strong>
                  </article>
                  <article>
                    <span>Current Cost Basis</span>
                    <strong>{formatMoney(details.summary.currentCostBasis)}</strong>
                  </article>
                  <article>
                    <span>Current MSRP Value</span>
                    <strong>{formatMoney(details.summary.currentMsrpValue)}</strong>
                  </article>
                  <article>
                    <span>Total Savings</span>
                    <strong>{formatMoney(details.summary.totalSavings)}</strong>
                  </article>
                </div>
              </section>

              <section className="collection-details-section">
                <div className="collection-section-heading">
                  <h4>Current Locations</h4>
                </div>
                <div className="collection-detail-location-table">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Humidor</th>
                        <th>Section</th>
                        <th>Qty</th>
                        <th>Lots</th>
                        <th>Oldest</th>
                      </tr>
                    </thead>
                    <tbody>
                      {details.locations.map((location) => (
                        <tr key={location.storageSubLocationId}>
                          <td>
                            {location.storageLocationName}
                            {!location.storageLocationIsActive ? (
                              <span className="inline-warning">Archived</span>
                            ) : null}
                          </td>
                          <td>
                            {location.storageSubLocationName}
                            {!location.storageSubLocationIsActive ? (
                              <span className="inline-warning">Archived</span>
                            ) : null}
                          </td>
                          <td>{location.quantity}</td>
                          <td>{location.lotCount}</td>
                          <td>{formatDate(location.oldestReceivedDate)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="collection-detail-location-cards">
                  {details.locations.map((location) => (
                    <article key={location.storageSubLocationId}>
                      <div>
                        <strong>{location.storageLocationName}</strong>
                        <span>{location.storageSubLocationName}</span>
                      </div>
                      <dl>
                        <div>
                          <dt>Qty</dt>
                          <dd>{location.quantity}</dd>
                        </div>
                        <div>
                          <dt>Lots</dt>
                          <dd>{location.lotCount}</dd>
                        </div>
                        <div>
                          <dt>Oldest</dt>
                          <dd>{formatDate(location.oldestReceivedDate)}</dd>
                        </div>
                      </dl>
                      {!location.storageLocationIsActive || !location.storageSubLocationIsActive ? (
                        <span className="attention-badge">Archived Location</span>
                      ) : null}
                    </article>
                  ))}
                </div>
              </section>

              <section className="collection-details-section">
                <div className="collection-section-heading">
                  <h4>Lots</h4>
                </div>
                <div className="collection-lot-grid">
                  {details.lots.map((lot) => (
                    <article className="collection-lot-card" key={lot.lotId}>
                      <div className="collection-lot-card-header">
                        <div className="collection-lot-title">
                          <p>Lot #{lot.lotId}</p>
                          <strong>{lot.vendorNameSnapshot ?? 'Unknown Vendor'}</strong>
                        </div>
                        {lot.issues.length > 0 ? (
                          <span className="attention-badge" title={lotIssueTitle(lot)}>
                            Needs Attention
                          </span>
                        ) : null}
                      </div>

                      {lot.issues.length > 0 ? (
                        <div className="collection-lot-warning">
                          {lot.issues.map((issue) => (
                            <p key={issueKey(issue)}>{issueMessage(issue)}</p>
                          ))}
                        </div>
                      ) : null}

                      <dl className="collection-lot-definition">
                        <div className="collection-lot-field-wide">
                          <dt>Invoice/source</dt>
                          <dd>{lot.invoiceOrSource ?? '-'}</dd>
                        </div>
                        <div>
                          <dt>Purchase date</dt>
                          <dd>{formatDate(lot.purchaseDate)}</dd>
                        </div>
                        <div>
                          <dt>Received date</dt>
                          <dd>{formatDate(lot.receivedDate)}</dd>
                        </div>
                        <div>
                          <dt>Original qty</dt>
                          <dd>{lot.originalQuantity ?? '-'}</dd>
                        </div>
                        <div>
                          <dt>Current qty</dt>
                          <dd>{lot.currentQuantity}</dd>
                        </div>
                        <div>
                          <dt>True cost each</dt>
                          <dd>
                            {formatMoney(lot.costPerCigar)}
                            {lot.costSource === 'ACTUAL_FALLBACK' ? (
                              <small>Using original unit price</small>
                            ) : null}
                          </dd>
                        </div>
                        <div>
                          <dt>MSRP each</dt>
                          <dd>
                            {formatMoney(lot.msrpPerCigar)}
                            {lot.msrpSource === 'CATALOG_FALLBACK' ? (
                              <small>Using current Catalog MSRP</small>
                            ) : null}
                          </dd>
                        </div>
                        <div>
                          <dt>Cost basis</dt>
                          <dd>{formatMoney(lot.currentCostBasis)}</dd>
                        </div>
                        <div>
                          <dt>MSRP value</dt>
                          <dd>{formatMoney(lot.currentMsrpValue)}</dd>
                        </div>
                        <div className="collection-lot-field-wide collection-lot-total-savings">
                          <dt>Total savings</dt>
                          <dd>{formatMoney(lot.totalSavings)}</dd>
                        </div>
                      </dl>

                      <div className="collection-lot-placements">
                        <span>Current placement</span>
                        {lot.locations.map((location) => (
                          <p key={location.storageSubLocationId}>
                            {location.storageLocationName} / {location.storageSubLocationName}{' '}
                            &mdash; Qty {location.quantity}
                          </p>
                        ))}
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            </div>
          ) : null}
        </section>
      </div>
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
        <div className="collection-view-switch" role="tablist" aria-label="Collection view">
          <button
            className={activeView === 'CIGAR' ? 'active' : ''}
            type="button"
            role="tab"
            aria-selected={activeView === 'CIGAR'}
            onClick={() => handleViewChange('CIGAR')}
          >
            By Cigar
          </button>
          <button
            className={activeView === 'HUMIDOR' ? 'active' : ''}
            type="button"
            role="tab"
            aria-selected={activeView === 'HUMIDOR'}
            onClick={() => handleViewChange('HUMIDOR')}
          >
            By Humidor
          </button>
        </div>
      </header>

      {activeView === 'CIGAR' ? (
        <>
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
                      <tr
                        className="collection-row-interactive"
                        key={cigar.id}
                        tabIndex={0}
                        role="button"
                        aria-label={`View details for ${cigar.manufacturer} ${cigar.series} ${cigar.vitola}`}
                        onClick={(event) => void openCigarDetails(cigar.id, event.currentTarget)}
                        onKeyDown={(event) => handleOpenDetailsKeyDown(event, cigar.id)}
                      >
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
                  <article
                    className="collection-card collection-card-interactive"
                    key={cigar.id}
                    tabIndex={0}
                    role="button"
                    aria-label={`View details for ${cigar.manufacturer} ${cigar.series} ${cigar.vitola}`}
                    onClick={(event) => void openCigarDetails(cigar.id, event.currentTarget)}
                    onKeyDown={(event) => handleOpenDetailsKeyDown(event, cigar.id)}
                  >
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
                    <span className="collection-card-details-cue">View Details</span>
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
        </>
      ) : (
        renderHumidorView()
      )}
      {renderHumidorDetailsPanel()}
      {renderDetailsPanel()}
    </div>
  )
}

export default Collection
