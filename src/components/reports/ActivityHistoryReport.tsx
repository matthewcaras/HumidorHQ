import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import {
  getActivityReport,
  type ActivityReportEventType,
  type ActivityReportItem,
  type ActivityReportPeriod,
  type ActivityReportResponse,
  type ActivityReportSortBy,
  type ActivityReportSortDirection,
} from '../../services/api'
import {
  formatReportsDate,
  formatReportsMoney,
  REPORTS_EMPTY_VALUE,
  reportsDirectionLabel,
  reportsLocalYearBounds,
  reportsPluralize,
  reportsUtcDateKey,
} from './reportsFormatters'

type PageSize = 50 | 100 | 'all'
type DetailActivityEventType = Exclude<ActivityReportEventType, 'ALL'>

const DEFAULT_EVENT_TYPE: ActivityReportEventType = 'ALL'
const DEFAULT_PERIOD: ActivityReportPeriod = 'LIFETIME'
const DEFAULT_SORT_BY: ActivityReportSortBy = 'EVENT_DATE'
const DEFAULT_SORT_DIRECTION: ActivityReportSortDirection = 'DESC'
const DEFAULT_PAGE_SIZE: PageSize = 50
const UNKNOWN_LOCATION = 'Unknown location'

const PERIOD_OPTIONS: { value: ActivityReportPeriod; label: string }[] = [
  { value: 'LIFETIME', label: 'Lifetime' },
  { value: 'CURRENT_YEAR', label: 'Current Year' },
  { value: 'PRIOR_YEAR', label: 'Prior Year' },
  { value: 'CUSTOM', label: 'Custom' },
]

const EVENT_TYPE_OPTIONS: { value: ActivityReportEventType; label: string }[] = [
  { value: 'ALL', label: 'All Activity' },
  { value: 'INITIAL_PLACEMENT', label: 'Received / Stored' },
  { value: 'MOVE', label: 'Moved' },
  { value: 'SMOKED', label: 'Smoked' },
  { value: 'GIFTED', label: 'Gifted' },
  { value: 'DISCARDED', label: 'Discarded / Damaged' },
]

const SORT_OPTIONS: { value: ActivityReportSortBy; label: string }[] = [
  { value: 'EVENT_DATE', label: 'Event Date' },
  { value: 'RECORDED_DATE', label: 'Recorded Date' },
  { value: 'EVENT_TYPE', label: 'Event Type' },
  { value: 'CIGAR', label: 'Cigar' },
  { value: 'QUANTITY', label: 'Quantity' },
]

const PAGE_SIZE_OPTIONS: { value: PageSize; label: string }[] = [
  { value: 50, label: '50' },
  { value: 100, label: '100' },
  { value: 'all', label: 'All' },
]

const FIRST_SORT_DIRECTION: Record<ActivityReportSortBy, ActivityReportSortDirection> = {
  EVENT_DATE: 'DESC',
  RECORDED_DATE: 'DESC',
  EVENT_TYPE: 'ASC',
  CIGAR: 'ASC',
  QUANTITY: 'DESC',
}

type LoadReportOptions = {
  nextEventType?: ActivityReportEventType
  nextPeriod?: ActivityReportPeriod
  nextCustomStartDate?: string
  nextCustomEndDate?: string
  nextSearch?: string
  nextSortBy?: ActivityReportSortBy
  nextSortDirection?: ActivityReportSortDirection
  nextPageSize?: PageSize
  nextOffset?: number
}

function effectiveDateBounds(
  selectedPeriod: ActivityReportPeriod,
  startDate: string,
  endDate: string,
) {
  if (selectedPeriod === 'LIFETIME') {
    return {}
  }

  if (selectedPeriod === 'CURRENT_YEAR') {
    return reportsLocalYearBounds(new Date().getFullYear())
  }

  if (selectedPeriod === 'PRIOR_YEAR') {
    return reportsLocalYearBounds(new Date().getFullYear() - 1)
  }

  return {
    startDate,
    endDate,
  }
}

function activityTypeLabel(type: ActivityReportEventType) {
  switch (type) {
    case 'INITIAL_PLACEMENT':
      return 'Received / Stored'
    case 'MOVE':
      return 'Moved'
    case 'SMOKED':
      return 'Smoked'
    case 'GIFTED':
      return 'Gifted'
    case 'DISCARDED':
      return 'Discarded / Damaged'
    default:
      return 'All Activity'
  }
}

function activityBadgeLabel(type: DetailActivityEventType) {
  switch (type) {
    case 'INITIAL_PLACEMENT':
      return 'Received'
    case 'MOVE':
      return 'Moved'
    case 'SMOKED':
      return 'Smoked'
    case 'GIFTED':
      return 'Gifted'
    case 'DISCARDED':
      return 'Discarded / Damaged'
  }
}

function activityEventNoun(type: ActivityReportEventType, count: number) {
  if (type === 'INITIAL_PLACEMENT') {
    return reportsPluralize(count, 'received event')
  }

  if (type === 'MOVE') {
    return reportsPluralize(count, 'move event')
  }

  if (type === 'SMOKED') {
    return reportsPluralize(count, 'smoked event')
  }

  if (type === 'GIFTED') {
    return reportsPluralize(count, 'gifted event')
  }

  if (type === 'DISCARDED') {
    return reportsPluralize(count, 'discarded event')
  }

  return reportsPluralize(count, 'activity event')
}

function resultMessage(report: ActivityReportResponse, activeSearch: string) {
  const noun = activityEventNoun(report.filters.eventType, report.total)
  const searchText = activeSearch ? ` matching "${activeSearch}"` : ''

  if (report.total === 0) {
    return `Showing 0 ${noun}${searchText}.`
  }

  if (report.limit === 'all') {
    return `Showing all ${report.total} ${noun}${searchText}.`
  }

  const start = report.offset + 1
  const end = Math.min(report.offset + report.items.length, report.total)

  if (report.offset === 0 && report.total === report.items.length) {
    return `Showing ${report.total} ${noun}${searchText}.`
  }

  return `Showing ${start}-${end} of ${report.total} ${noun}${searchText}.`
}

function emptyStateMessage(
  report: ActivityReportResponse,
  activeSearch: string,
  selectedPeriod: ActivityReportPeriod,
) {
  if (activeSearch.trim()) {
    return 'No activity events matched your search.'
  }

  if (selectedPeriod !== 'LIFETIME') {
    return 'No activity events were found for this date range.'
  }

  if (report.filters.eventType === 'INITIAL_PLACEMENT') {
    return 'No received events matched these filters.'
  }

  if (report.filters.eventType === 'MOVE') {
    return 'No move events matched these filters.'
  }

  if (report.filters.eventType === 'SMOKED') {
    return 'No smoked events matched these filters.'
  }

  if (report.filters.eventType === 'GIFTED') {
    return 'No gifted events matched these filters.'
  }

  if (report.filters.eventType === 'DISCARDED') {
    return 'No discarded events matched these filters.'
  }

  return 'No inventory activity has been recorded yet.'
}

function nextSortDirection(
  currentSortBy: ActivityReportSortBy,
  currentDirection: ActivityReportSortDirection,
  selectedSortBy: ActivityReportSortBy,
) {
  if (currentSortBy !== selectedSortBy) {
    return FIRST_SORT_DIRECTION[selectedSortBy]
  }

  return currentDirection === 'ASC' ? 'DESC' : 'ASC'
}

function cigarPrimary(item: ActivityReportItem) {
  return item.catalogCigar?.manufacturer ?? 'Catalog unavailable'
}

function cigarSecondary(item: ActivityReportItem) {
  const cigar = item.catalogCigar

  if (!cigar) {
    return ''
  }

  return `${cigar.series} / ${cigar.vitola}`
}

function locationText(location: ActivityReportItem['sourceLocation']) {
  if (!location) {
    return UNKNOWN_LOCATION
  }

  return `${location.storageLocationName} / ${location.storageSubLocationName}`
}

function activitySentence(item: ActivityReportItem) {
  const source = locationText(item.sourceLocation)
  const destination = locationText(item.destinationLocation)

  switch (item.eventType) {
    case 'INITIAL_PLACEMENT':
      return `Received ${item.quantity} into ${destination}`
    case 'MOVE':
      return `Moved ${item.quantity} from ${source} to ${destination}`
    case 'SMOKED':
      return `Smoked ${item.quantity} from ${source}`
    case 'GIFTED':
      return `Gifted ${item.quantity} from ${source}`
    case 'DISCARDED':
      return `Discarded ${item.quantity} from ${source}`
  }
}

function shouldShowRecordedDate(item: ActivityReportItem) {
  return reportsUtcDateKey(item.eventDate) !== reportsUtcDateKey(item.createdAt)
}

function issueSeverityLabel(severity: 'INFO' | 'WARNING') {
  return severity === 'WARNING' ? 'Warning' : 'Info'
}

function visibleActivityIssues(item: ActivityReportItem) {
  return item.issues.filter((issue) => {
    if (issue.code === 'ACTIVITY_ARCHIVED_CATALOG') {
      return !(item.catalogCigar && !item.catalogCigar.isActive)
    }

    if (issue.code === 'ACTIVITY_ARCHIVED_SOURCE') {
      return !item.sourceLocation?.isArchived
    }

    if (issue.code === 'ACTIVITY_ARCHIVED_DESTINATION') {
      return !item.destinationLocation?.isArchived
    }

    return true
  })
}

function ActivityMetricCard({ label, value }: { label: string; value: string | number }) {
  return (
    <article className="reports-metric-card activity-summary-card">
      <p>{label}</p>
      <strong>{value}</strong>
    </article>
  )
}

function ActivityQuantityCard({ label, value }: { label: string; value: string | number }) {
  return (
    <article className="reports-metric-card activity-quantity-card">
      <p>{label}</p>
      <strong>{value}</strong>
    </article>
  )
}

function ActivityHistoryReport({ isActive }: { isActive: boolean }) {
  const [report, setReport] = useState<ActivityReportResponse | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [dateError, setDateError] = useState('')
  const [eventType, setEventType] = useState<ActivityReportEventType>(DEFAULT_EVENT_TYPE)
  const [periodDraft, setPeriodDraft] = useState<ActivityReportPeriod>(DEFAULT_PERIOD)
  const [activePeriod, setActivePeriod] = useState<ActivityReportPeriod>(DEFAULT_PERIOD)
  const [customStartDate, setCustomStartDate] = useState('')
  const [customEndDate, setCustomEndDate] = useState('')
  const [appliedCustomStartDate, setAppliedCustomStartDate] = useState('')
  const [appliedCustomEndDate, setAppliedCustomEndDate] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [activeSearch, setActiveSearch] = useState('')
  const [sortBy, setSortBy] = useState<ActivityReportSortBy>(DEFAULT_SORT_BY)
  const [sortDirection, setSortDirection] =
    useState<ActivityReportSortDirection>(DEFAULT_SORT_DIRECTION)
  const [pageSize, setPageSize] = useState<PageSize>(DEFAULT_PAGE_SIZE)
  const [offset, setOffset] = useState(0)
  const requestIdRef = useRef(0)
  const customEndDateInputRef = useRef<HTMLInputElement | null>(null)

  async function loadReport(options: LoadReportOptions = {}) {
    const resolvedEventType = options.nextEventType ?? eventType
    const resolvedPeriod = options.nextPeriod ?? activePeriod
    const resolvedCustomStartDate = options.nextCustomStartDate ?? appliedCustomStartDate
    const resolvedCustomEndDate = options.nextCustomEndDate ?? appliedCustomEndDate
    const resolvedSearch = options.nextSearch ?? activeSearch
    const resolvedSortBy = options.nextSortBy ?? sortBy
    const resolvedSortDirection = options.nextSortDirection ?? sortDirection
    const resolvedPageSize = options.nextPageSize ?? pageSize
    const resolvedOffset = resolvedPageSize === 'all' ? 0 : options.nextOffset ?? offset

    if (resolvedPeriod === 'CUSTOM') {
      if (!resolvedCustomStartDate || !resolvedCustomEndDate) {
        setDateError('Start Date and End Date are required.')
        return
      }

      if (resolvedCustomStartDate > resolvedCustomEndDate) {
        setDateError('Start Date must be on or before End Date.')
        return
      }
    }

    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId
    setIsLoading(true)
    setError('')
    setDateError('')

    const dateBounds = effectiveDateBounds(
      resolvedPeriod,
      resolvedCustomStartDate,
      resolvedCustomEndDate,
    )

    try {
      const data = await getActivityReport({
        eventType: resolvedEventType,
        period: resolvedPeriod,
        startDate: dateBounds.startDate,
        endDate: dateBounds.endDate,
        search: resolvedSearch,
        sortBy: resolvedSortBy,
        sortDirection: resolvedSortDirection,
        limit: resolvedPageSize,
        offset: resolvedOffset,
      })

      if (requestId !== requestIdRef.current) {
        return
      }

      if (
        resolvedPageSize !== 'all' &&
        resolvedOffset > 0 &&
        data.total > 0 &&
        data.items.length === 0
      ) {
        setOffset(0)
        void loadReport({
          ...options,
          nextOffset: 0,
        })
        return
      }

      setReport(data)
    } catch (loadError) {
      if (requestId !== requestIdRef.current) {
        return
      }

      setError(loadError instanceof Error ? loadError.message : 'Unable to load Activity History.')
    } finally {
      if (requestId === requestIdRef.current) {
        setIsLoading(false)
      }
    }
  }

  useEffect(() => {
    if (isActive && !report && !isLoading && !error) {
      void loadReport({
        nextEventType: DEFAULT_EVENT_TYPE,
        nextPeriod: DEFAULT_PERIOD,
        nextSearch: '',
        nextSortBy: DEFAULT_SORT_BY,
        nextSortDirection: DEFAULT_SORT_DIRECTION,
        nextPageSize: DEFAULT_PAGE_SIZE,
        nextOffset: 0,
      })
    }
  }, [isActive, report, isLoading, error])

  useEffect(() => {
    return () => {
      requestIdRef.current += 1
    }
  }, [])

  function handlePeriodChange(nextPeriod: ActivityReportPeriod) {
    setPeriodDraft(nextPeriod)
    setDateError('')

    if (nextPeriod === 'CUSTOM') {
      return
    }

    setOffset(0)
    setActivePeriod(nextPeriod)
    void loadReport({
      nextPeriod,
      nextOffset: 0,
    })
  }

  function handleApplyCustomDates(event: FormEvent) {
    event.preventDefault()

    if (!customStartDate || !customEndDate) {
      setDateError('Start Date and End Date are required.')
      return
    }

    if (customStartDate > customEndDate) {
      setDateError('Start Date must be on or before End Date.')
      return
    }

    setPeriodDraft('CUSTOM')
    setActivePeriod('CUSTOM')
    setAppliedCustomStartDate(customStartDate)
    setAppliedCustomEndDate(customEndDate)
    setOffset(0)
    void loadReport({
      nextPeriod: 'CUSTOM',
      nextCustomStartDate: customStartDate,
      nextCustomEndDate: customEndDate,
      nextOffset: 0,
    })
  }

  function handleEventTypeChange(nextEventType: ActivityReportEventType) {
    setEventType(nextEventType)
    setOffset(0)
    void loadReport({
      nextEventType,
      nextOffset: 0,
    })
  }

  function handleSearch(event: FormEvent) {
    event.preventDefault()
    const submittedSearch = searchInput.trim()

    setSearchInput(submittedSearch)
    setActiveSearch(submittedSearch)
    setOffset(0)
    void loadReport({
      nextSearch: submittedSearch,
      nextOffset: 0,
    })
  }

  function handleClearSearch() {
    setSearchInput('')
    setActiveSearch('')
    setOffset(0)
    void loadReport({
      nextSearch: '',
      nextOffset: 0,
    })
  }

  function handleSortChange(
    nextSortBy: ActivityReportSortBy,
    nextDirection?: ActivityReportSortDirection,
  ) {
    const resolvedDirection =
      nextDirection ?? nextSortDirection(sortBy, sortDirection, nextSortBy)

    setSortBy(nextSortBy)
    setSortDirection(resolvedDirection)
    setOffset(0)
    void loadReport({
      nextSortBy,
      nextSortDirection: resolvedDirection,
      nextOffset: 0,
    })
  }

  function handlePageSizeChange(value: string) {
    const nextPageSize: PageSize = value === 'all' ? 'all' : value === '100' ? 100 : 50

    setPageSize(nextPageSize)
    setOffset(0)
    void loadReport({
      nextPageSize,
      nextOffset: 0,
    })
  }

  function handlePageChange(nextOffset: number) {
    setOffset(nextOffset)
    void loadReport({
      nextOffset,
    })
  }

  function handleCustomStartDateKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Tab' || event.shiftKey || !customStartDate.trim()) {
      return
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(customStartDate)) {
      return
    }

    event.preventDefault()
    customEndDateInputRef.current?.focus()
  }

  function renderSortHeader(headerSortBy: ActivityReportSortBy, label: string) {
    const isActiveSort = sortBy === headerSortBy
    const activeDirectionLabel = reportsDirectionLabel(headerSortBy, sortDirection)

    return (
      <button
        className={isActiveSort ? 'reports-sort-header active' : 'reports-sort-header'}
        type="button"
        onClick={() => handleSortChange(headerSortBy)}
        aria-pressed={isActiveSort}
        aria-label={
          isActiveSort
            ? `${label} sorted ${activeDirectionLabel}`
            : `Sort by ${label}`
        }
      >
        <span>{label}</span>
        {isActiveSort ? (
          <span className="reports-sort-direction" aria-hidden="true">
            {sortDirection === 'ASC' ? '↑' : '↓'}
          </span>
        ) : null}
      </button>
    )
  }

  function renderIssueList(item: ActivityReportItem) {
    const issues = visibleActivityIssues(item)

    if (issues.length === 0) {
      return null
    }

    return (
      <div className="activity-issue-list">
        {issues.map((issue) => (
          <p
            key={`${item.id}-${issue.code}`}
            className={`activity-issue activity-issue-${issue.severity.toLowerCase()}`}
          >
            <strong>{issueSeverityLabel(issue.severity)}:</strong> {issue.message}
          </p>
        ))}
      </div>
    )
  }

  function renderLocationIndicators(item: ActivityReportItem) {
    const indicators: string[] = []

    if (item.sourceLocation?.isArchived) {
      indicators.push('Archived source')
    }

    if (item.destinationLocation?.isArchived) {
      indicators.push('Archived destination')
    }

    if (indicators.length === 0) {
      return null
    }

    return (
      <div className="activity-indicator-list">
        {indicators.map((indicator) => (
          <span className="attention-badge" key={indicator}>
            {indicator}
          </span>
        ))}
      </div>
    )
  }

  function renderReportRow(item: ActivityReportItem) {
    return (
      <tr key={item.id}>
        <td>
          <div className="reports-date-cell">
            <strong>{formatReportsDate(item.eventDate)}</strong>
            {shouldShowRecordedDate(item) ? (
              <span>Recorded {formatReportsDate(item.createdAt)}</span>
            ) : null}
          </div>
        </td>
        <td>
          <div className="activity-type-cell">
            <span className={`activity-type-badge activity-type-${item.eventType.toLowerCase()}`}>
              {activityBadgeLabel(item.eventType)}
            </span>
          </div>
        </td>
        <td>
          <div className="reports-cigar-cell">
            <strong>{cigarPrimary(item)}</strong>
            {cigarSecondary(item) ? <span>{cigarSecondary(item)}</span> : null}
            {item.catalogCigar?.wrapper ? <small>{item.catalogCigar.wrapper}</small> : null}
            <small>Lot #{item.lotId}</small>
            {item.catalogCigar && !item.catalogCigar.isActive ? <em>Archived Catalog</em> : null}
            {item.notes ? <small className="reports-note">{item.notes}</small> : null}
          </div>
        </td>
        <td className="reports-number-cell">{item.quantity}</td>
        <td>
          <div className="activity-movement-cell">
            <strong>{activitySentence(item)}</strong>
            {renderLocationIndicators(item)}
            {renderIssueList(item)}
          </div>
        </td>
        <td>
          <div className="activity-value-cell">
            <span>Cost: {formatReportsMoney(item.totalEventCost)}</span>
            <span>MSRP: {formatReportsMoney(item.totalEventMsrp)}</span>
          </div>
        </td>
      </tr>
    )
  }

  function renderReportCard(item: ActivityReportItem) {
    return (
      <article className="activity-event-card" key={item.id}>
        <div className="reports-event-card-header">
          <span className={`activity-type-badge activity-type-${item.eventType.toLowerCase()}`}>
            {activityBadgeLabel(item.eventType)}
          </span>
          <strong>{formatReportsDate(item.eventDate)}</strong>
        </div>

        <div className="reports-card-cigar">
          <h4>{cigarPrimary(item)}</h4>
          {cigarSecondary(item) ? <span>{cigarSecondary(item)}</span> : null}
          {item.catalogCigar?.wrapper ? <small>{item.catalogCigar.wrapper}</small> : null}
          {item.catalogCigar && !item.catalogCigar.isActive ? (
            <span className="attention-badge">Archived Catalog</span>
          ) : null}
        </div>

        <p className="activity-card-sentence">{activitySentence(item)}</p>

        <dl className="reports-card-metrics activity-card-metrics">
          <div>
            <dt>Quantity</dt>
            <dd>{item.quantity}</dd>
          </div>
          <div>
            <dt>Lot</dt>
            <dd>#{item.lotId}</dd>
          </div>
          <div>
            <dt>Total Cost</dt>
            <dd>{formatReportsMoney(item.totalEventCost)}</dd>
          </div>
          <div>
            <dt>Total MSRP</dt>
            <dd>{formatReportsMoney(item.totalEventMsrp)}</dd>
          </div>
        </dl>

        {renderLocationIndicators(item)}
        {shouldShowRecordedDate(item) ? (
          <small className="reports-recorded-date">Recorded {formatReportsDate(item.createdAt)}</small>
        ) : null}
        {item.notes ? <p className="reports-card-note">{item.notes}</p> : null}
        {renderIssueList(item)}
      </article>
    )
  }

  const effectiveOffset = report?.offset ?? offset
  const isShowingAll = pageSize === 'all'
  const canPageBackward = !isShowingAll && effectiveOffset > 0
  const canPageForward =
    !isShowingAll &&
    report !== null &&
    report.offset + report.items.length < report.total
  const showPageButtons = canPageBackward || canPageForward
  const pageStep = pageSize === 'all' ? 0 : pageSize
  const hasUnappliedCustomDates =
    periodDraft === 'CUSTOM' &&
    (activePeriod !== 'CUSTOM' ||
      customStartDate !== appliedCustomStartDate ||
      customEndDate !== appliedCustomEndDate)

  return (
    <section className="panel reports-panel activity-report-panel">
      <div className="reports-section-heading">
        <div>
          <h3>Inventory Activity History</h3>
          <p>
            Summary cards cover the active date and search filters. The activity type narrows
            the event list below.
          </p>
        </div>
      </div>

      <div className="reports-filter-grid activity-filter-grid">
        <fieldset className="reports-segment-control">
          <legend>Period</legend>
          <div>
            {PERIOD_OPTIONS.map((option) => (
              <button
                key={option.value}
                className={periodDraft === option.value ? 'active' : ''}
                type="button"
                aria-pressed={periodDraft === option.value}
                disabled={isLoading}
                onClick={() => handlePeriodChange(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="reports-segment-control activity-type-control">
          <legend>Activity Type</legend>
          <div>
            {EVENT_TYPE_OPTIONS.map((option) => (
              <button
                key={option.value}
                className={eventType === option.value ? 'active' : ''}
                type="button"
                aria-pressed={eventType === option.value}
                disabled={isLoading}
                onClick={() => handleEventTypeChange(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </fieldset>
      </div>

      {periodDraft === 'CUSTOM' ? (
        <form className="reports-custom-dates" onSubmit={handleApplyCustomDates}>
          <label>
            <span>Start Date</span>
            <input
              type="date"
              value={customStartDate}
              max={customEndDate || undefined}
              onChange={(event) => setCustomStartDate(event.target.value)}
              onKeyDown={handleCustomStartDateKeyDown}
            />
          </label>
          <label>
            <span>End Date</span>
            <input
              ref={customEndDateInputRef}
              type="date"
              value={customEndDate}
              min={customStartDate || undefined}
              onChange={(event) => setCustomEndDate(event.target.value)}
            />
          </label>
          <button className="primary-button" type="submit" disabled={isLoading}>
            Apply Dates
          </button>
          {dateError ? (
            <p className="reports-date-error" role="alert">
              {dateError}
            </p>
          ) : null}
          {hasUnappliedCustomDates ? (
            <p className="reports-date-info" role="status">
              Apply Dates to update the report.
            </p>
          ) : null}
        </form>
      ) : null}

      <form className="reports-search-form" onSubmit={handleSearch}>
        <label>
          <span>Search</span>
          <input
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search cigar, activity, location, notes, or Lot number"
            aria-label="Search activity history"
          />
        </label>
        <div className="reports-search-actions">
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

      {isLoading && !report ? (
        <section className="reports-loading" aria-live="polite">
          <p>Loading inventory activity history...</p>
        </section>
      ) : null}

      {error ? (
        <section className="reports-error" role="alert">
          <h3>Activity history could not be loaded</h3>
          <p>{error}</p>
          <button className="primary-button" type="button" onClick={() => void loadReport()}>
            Retry
          </button>
        </section>
      ) : null}

      {report && !error ? (
        <>
          {isLoading ? (
            <p className="reports-refresh-message" role="status">
              Updating inventory activity history...
            </p>
          ) : null}

          <section className="activity-primary-summary" aria-label="Inventory activity summary">
            <ActivityMetricCard label="Total Events" value={report.summary.totalEvents} />
            <ActivityMetricCard
              label="Received"
              value={report.summary.initialPlacement.eventCount}
            />
            <ActivityMetricCard label="Moved" value={report.summary.moved.eventCount} />
            <ActivityMetricCard label="Removed" value={report.summary.removed.eventCount} />
          </section>

          <section className="activity-quantity-section">
            <div className="reports-section-heading">
              <div>
                <h3>Activity Quantities</h3>
                <p>
                  Moved quantity reflects activity volume and may count the same cigar more than
                  once across multiple moves.
                </p>
              </div>
            </div>
            <div className="activity-quantity-grid" aria-label="Activity quantity breakdown">
              <ActivityQuantityCard
                label="Received Quantity"
                value={report.summary.initialPlacement.quantity}
              />
              <ActivityQuantityCard label="Moved Quantity" value={report.summary.moved.quantity} />
              <ActivityQuantityCard label="Smoked Quantity" value={report.summary.smoked.quantity} />
              <ActivityQuantityCard label="Gifted Quantity" value={report.summary.gifted.quantity} />
              <ActivityQuantityCard
                label="Discarded Quantity"
                value={report.summary.discarded.quantity}
              />
            </div>
          </section>

          <div className="reports-result-controls">
            <p className="reports-results-message">{resultMessage(report, activeSearch)}</p>
            <div className="reports-control-row">
              <div className="reports-mobile-sort">
                <label>
                  <span>Sort By</span>
                  <select
                    value={sortBy}
                    onChange={(event) =>
                      handleSortChange(
                        event.target.value as ActivityReportSortBy,
                        FIRST_SORT_DIRECTION[event.target.value as ActivityReportSortBy],
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
                      handleSortChange(
                        sortBy,
                        event.target.value as ActivityReportSortDirection,
                      )
                    }
                    disabled={isLoading}
                  >
                    <option value="ASC">{reportsDirectionLabel(sortBy, 'ASC')}</option>
                    <option value="DESC">{reportsDirectionLabel(sortBy, 'DESC')}</option>
                  </select>
                </label>
              </div>
              <label className="reports-page-size">
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

          {report.total === 0 ? (
            <div className="reports-empty-state">
              <h3>{emptyStateMessage(report, activeSearch, report.filters.period)}</h3>
            </div>
          ) : null}

          <div className="reports-desktop-table activity-desktop-table">
            <table className="data-table reports-table activity-table">
              <colgroup>
                <col className="activity-col-date" />
                <col className="activity-col-type" />
                <col className="activity-col-cigar" />
                <col className="activity-col-qty" />
                <col className="activity-col-movement" />
                <col className="activity-col-value" />
              </colgroup>
              <thead>
                <tr>
                  <th
                    aria-sort={
                      sortBy === 'EVENT_DATE'
                        ? sortDirection === 'ASC'
                          ? 'ascending'
                          : 'descending'
                        : 'none'
                    }
                  >
                    <div className="reports-date-sort-stack">
                      {renderSortHeader('EVENT_DATE', 'Event Date')}
                      {renderSortHeader('RECORDED_DATE', 'Recorded')}
                    </div>
                  </th>
                  <th
                    aria-sort={
                      sortBy === 'EVENT_TYPE'
                        ? sortDirection === 'ASC'
                          ? 'ascending'
                          : 'descending'
                        : 'none'
                    }
                  >
                    {renderSortHeader('EVENT_TYPE', 'Activity')}
                  </th>
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
                  <th
                    aria-sort={
                      sortBy === 'QUANTITY'
                        ? sortDirection === 'ASC'
                          ? 'ascending'
                          : 'descending'
                        : 'none'
                    }
                  >
                    {renderSortHeader('QUANTITY', 'Qty')}
                  </th>
                  <th>Movement</th>
                  <th>Event Value</th>
                </tr>
              </thead>
              <tbody>{report.items.map((item) => renderReportRow(item))}</tbody>
            </table>
          </div>

          {report.items.length > 0 ? (
            <div className="activity-card-list">
              {report.items.map((item) => renderReportCard(item))}
            </div>
          ) : null}

          {report.total > 0 ? (
            <div className="reports-pagination">
              <p>{resultMessage(report, activeSearch)}</p>
              <div className="reports-pagination-controls">
                {showPageButtons ? (
                  <div className="reports-pagination-buttons">
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
                <label className="reports-page-size reports-page-size-bottom">
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
  )
}

export default ActivityHistoryReport
