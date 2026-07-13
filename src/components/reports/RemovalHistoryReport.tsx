import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import {
  getRemovalReport,
  type RemovalReportItem,
  type RemovalReportMetric,
  type RemovalReportPeriod,
  type RemovalReportResponse,
  type RemovalReportSortBy,
  type RemovalReportSortDirection,
  type RemovalReportType,
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

const DEFAULT_REMOVAL_TYPE: RemovalReportType = 'ALL'
const DEFAULT_PERIOD: RemovalReportPeriod = 'LIFETIME'
const DEFAULT_SORT_BY: RemovalReportSortBy = 'EVENT_DATE'
const DEFAULT_SORT_DIRECTION: RemovalReportSortDirection = 'DESC'
const DEFAULT_PAGE_SIZE: PageSize = 50
const PERIOD_OPTIONS: { value: RemovalReportPeriod; label: string }[] = [
  { value: 'LIFETIME', label: 'Lifetime' },
  { value: 'CURRENT_YEAR', label: 'Current Year' },
  { value: 'PRIOR_YEAR', label: 'Prior Year' },
  { value: 'CUSTOM', label: 'Custom' },
]

const REMOVAL_TYPE_OPTIONS: { value: RemovalReportType; label: string }[] = [
  { value: 'ALL', label: 'All Removals' },
  { value: 'SMOKED', label: 'Smoked' },
  { value: 'GIFTED', label: 'Gifted' },
  { value: 'DISCARDED', label: 'Discarded / Damaged' },
]

const SORT_OPTIONS: { value: RemovalReportSortBy; label: string }[] = [
  { value: 'EVENT_DATE', label: 'Event Date' },
  { value: 'RECORDED_DATE', label: 'Recorded Date' },
  { value: 'CIGAR', label: 'Cigar' },
  { value: 'QUANTITY', label: 'Quantity' },
  { value: 'COST', label: 'Cost' },
  { value: 'MSRP', label: 'MSRP' },
]

const PAGE_SIZE_OPTIONS: { value: PageSize; label: string }[] = [
  { value: 50, label: '50' },
  { value: 100, label: '100' },
  { value: 'all', label: 'All' },
]

const FIRST_SORT_DIRECTION: Record<RemovalReportSortBy, RemovalReportSortDirection> = {
  EVENT_DATE: 'DESC',
  RECORDED_DATE: 'DESC',
  CIGAR: 'ASC',
  QUANTITY: 'DESC',
  COST: 'DESC',
  MSRP: 'DESC',
}

type LoadReportOptions = {
  nextRemovalType?: RemovalReportType
  nextPeriod?: RemovalReportPeriod
  nextCustomStartDate?: string
  nextCustomEndDate?: string
  nextSearch?: string
  nextSortBy?: RemovalReportSortBy
  nextSortDirection?: RemovalReportSortDirection
  nextPageSize?: PageSize
  nextOffset?: number
}

function effectiveDateBounds(
  selectedPeriod: RemovalReportPeriod,
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

function removalTypeLabel(type: RemovalReportType) {
  switch (type) {
    case 'SMOKED':
      return 'Smoked'
    case 'GIFTED':
      return 'Gifted'
    case 'DISCARDED':
      return 'Discarded / Damaged'
    default:
      return 'All Removals'
  }
}

function removalEventNoun(type: RemovalReportType, count: number) {
  if (type === 'SMOKED') {
    return `${reportsPluralize(count, 'smoked event')}`
  }

  if (type === 'GIFTED') {
    return `${reportsPluralize(count, 'gifted event')}`
  }

  if (type === 'DISCARDED') {
    return `${reportsPluralize(count, 'discarded event')}`
  }

  return `${reportsPluralize(count, 'removal event')}`
}

function tableTypeLabel(type: RemovalReportItem['removalType']) {
  switch (type) {
    case 'SMOKED':
      return 'Smoked'
    case 'GIFTED':
      return 'Gifted'
    case 'DISCARDED':
      return 'Discarded / Damaged'
  }
}

function selectedMetric(report: RemovalReportResponse, type: RemovalReportType) {
  if (type === 'SMOKED') {
    return report.summary.smoking
  }

  if (type === 'GIFTED') {
    return report.summary.gifted
  }

  if (type === 'DISCARDED') {
    return report.summary.discarded
  }

  return report.summary.combined
}

function selectedValueTitle(type: RemovalReportType) {
  if (type === 'SMOKED') {
    return 'Smoking Values'
  }

  if (type === 'GIFTED') {
    return 'Gifted Values'
  }

  if (type === 'DISCARDED') {
    return 'Discarded / Damaged Values'
  }

  return 'All Removal Values'
}

function missingWarnings(metric: RemovalReportMetric) {
  const warnings: string[] = []

  if (metric.quantityMissingCost > 0) {
    warnings.push(
      `Cost is unavailable for ${metric.quantityMissingCost} ${reportsPluralize(
        metric.quantityMissingCost,
        'cigar',
      )}.`,
    )
  }

  if (metric.quantityMissingMsrp > 0) {
    warnings.push(
      `MSRP is unavailable for ${metric.quantityMissingMsrp} ${reportsPluralize(
        metric.quantityMissingMsrp,
        'cigar',
      )}.`,
    )
  }

  return warnings
}

function resultMessage(report: RemovalReportResponse, activeSearch: string) {
  const noun = removalEventNoun(report.filters.removalType, report.total)
  const searchText = activeSearch ? ` matching "${activeSearch}"` : ''

  if (report.total === 0) {
    return `Showing 0 ${noun}${searchText}.`
  }

  if (report.limit === 'all') {
    return `Showing all ${report.total} ${noun}${searchText}.`
  }

  const start = report.offset + 1
  const end = Math.min(report.offset + report.items.length, report.total)

  if (report.total === report.items.length) {
    return `Showing ${report.total} ${noun}${searchText}.`
  }

  return `Showing ${start}-${end} of ${report.total} ${noun}${searchText}.`
}

function emptyStateMessage(
  report: RemovalReportResponse,
  activeSearch: string,
  selectedPeriod: RemovalReportPeriod,
) {
  if (activeSearch.trim()) {
    return 'No removal events matched your search.'
  }

  if (selectedPeriod !== 'LIFETIME') {
    return 'No removal events were found for this date range.'
  }

  if (report.filters.removalType === 'SMOKED') {
    return 'No smoked cigars matched these filters.'
  }

  if (report.filters.removalType === 'GIFTED') {
    return 'No gifted cigars matched these filters.'
  }

  if (report.filters.removalType === 'DISCARDED') {
    return 'No discarded cigars matched these filters.'
  }

  return 'No cigar removals have been recorded yet.'
}

function nextSortDirection(
  currentSortBy: RemovalReportSortBy,
  currentDirection: RemovalReportSortDirection,
  selectedSortBy: RemovalReportSortBy,
) {
  if (currentSortBy !== selectedSortBy) {
    return FIRST_SORT_DIRECTION[selectedSortBy]
  }

  return currentDirection === 'ASC' ? 'DESC' : 'ASC'
}

function cigarPrimary(item: RemovalReportItem) {
  return item.catalogCigar?.manufacturer ?? 'Catalog unavailable'
}

function cigarSecondary(item: RemovalReportItem) {
  const cigar = item.catalogCigar

  if (!cigar) {
    return ''
  }

  return `${cigar.series} · ${cigar.vitola}`
}

function sourceText(item: RemovalReportItem) {
  const source = item.sourceLocation

  if (!source) {
    return REPORTS_EMPTY_VALUE
  }

  return `${source.storageLocationName} / ${source.storageSubLocationName}`
}

function shouldShowRecordedDate(item: RemovalReportItem) {
  return reportsUtcDateKey(item.eventDate) !== reportsUtcDateKey(item.createdAt)
}

function MetricCard({ label, value }: { label: string; value: string | number }) {
  return (
    <article className="reports-metric-card">
      <p>{label}</p>
      <strong>{value}</strong>
    </article>
  )
}

function RemovalHistoryReport() {
  const [report, setReport] = useState<RemovalReportResponse | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [dateError, setDateError] = useState('')
  const [removalType, setRemovalType] =
    useState<RemovalReportType>(DEFAULT_REMOVAL_TYPE)
  const [periodDraft, setPeriodDraft] = useState<RemovalReportPeriod>(DEFAULT_PERIOD)
  const [activePeriod, setActivePeriod] =
    useState<RemovalReportPeriod>(DEFAULT_PERIOD)
  const [customStartDate, setCustomStartDate] = useState('')
  const [customEndDate, setCustomEndDate] = useState('')
  const [appliedCustomStartDate, setAppliedCustomStartDate] = useState('')
  const [appliedCustomEndDate, setAppliedCustomEndDate] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [activeSearch, setActiveSearch] = useState('')
  const [sortBy, setSortBy] = useState<RemovalReportSortBy>(DEFAULT_SORT_BY)
  const [sortDirection, setSortDirection] =
    useState<RemovalReportSortDirection>(DEFAULT_SORT_DIRECTION)
  const [pageSize, setPageSize] = useState<PageSize>(DEFAULT_PAGE_SIZE)
  const [offset, setOffset] = useState(0)
  const requestIdRef = useRef(0)
  const customEndDateInputRef = useRef<HTMLInputElement | null>(null)

  async function loadReport(options: LoadReportOptions = {}) {
    const resolvedRemovalType = options.nextRemovalType ?? removalType
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
      const data = await getRemovalReport({
        removalType: resolvedRemovalType,
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

      setError(loadError instanceof Error ? loadError.message : 'Unable to load Reports.')
    } finally {
      if (requestId === requestIdRef.current) {
        setIsLoading(false)
      }
    }
  }

  useEffect(() => {
    void loadReport({
      nextRemovalType: DEFAULT_REMOVAL_TYPE,
      nextPeriod: DEFAULT_PERIOD,
      nextSearch: '',
      nextSortBy: DEFAULT_SORT_BY,
      nextSortDirection: DEFAULT_SORT_DIRECTION,
      nextPageSize: DEFAULT_PAGE_SIZE,
      nextOffset: 0,
    })

    return () => {
      requestIdRef.current += 1
    }
  }, [])

  function handlePeriodChange(nextPeriod: RemovalReportPeriod) {
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

  function handleRemovalTypeChange(nextRemovalType: RemovalReportType) {
    setRemovalType(nextRemovalType)
    setOffset(0)
    void loadReport({
      nextRemovalType,
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
    nextSortBy: RemovalReportSortBy,
    nextDirection?: RemovalReportSortDirection,
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

  function renderSortHeader(headerSortBy: RemovalReportSortBy, label: string) {
    const isActive = sortBy === headerSortBy
    const activeDirectionLabel = reportsDirectionLabel(headerSortBy, sortDirection)

    return (
      <button
        className={isActive ? 'reports-sort-header active' : 'reports-sort-header'}
        type="button"
        onClick={() => handleSortChange(headerSortBy)}
        aria-pressed={isActive}
        aria-label={
          isActive
            ? `${label} sorted ${activeDirectionLabel}`
            : `Sort by ${label}`
        }
      >
        <span>{label}</span>
        {isActive ? (
          <span className="reports-sort-direction" aria-hidden="true">
            {sortDirection === 'ASC' ? '↑' : '↓'}
          </span>
        ) : null}
      </button>
    )
  }

  function renderReportRow(item: RemovalReportItem) {
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
          <span className={`reports-type-badge reports-type-${item.removalType.toLowerCase()}`}>
            {tableTypeLabel(item.removalType)}
          </span>
        </td>
        <td>
          <div className="reports-cigar-cell">
            <strong>{cigarPrimary(item)}</strong>
            {cigarSecondary(item) ? <span>{cigarSecondary(item)}</span> : null}
            {item.catalogCigar?.wrapper ? <small>{item.catalogCigar.wrapper}</small> : null}
            <small>Lot #{item.lotId}</small>
            {item.catalogCigar && !item.catalogCigar.isActive ? (
              <em>Archived Catalog</em>
            ) : null}
            {item.notes ? <small className="reports-note">{item.notes}</small> : null}
          </div>
        </td>
        <td className="reports-number-cell">{item.quantity}</td>
        <td>
          <div className="reports-source-cell">
            <strong>{sourceText(item)}</strong>
            {item.sourceLocation?.isArchived ? <em>Archived location</em> : null}
          </div>
        </td>
        <td className="reports-money-cell">{formatReportsMoney(item.totalEventCost)}</td>
        <td className="reports-money-cell">{formatReportsMoney(item.totalEventMsrp)}</td>
        <td className="reports-money-cell">{formatReportsMoney(item.eventSavings)}</td>
      </tr>
    )
  }

  function renderReportCard(item: RemovalReportItem) {
    return (
      <article className="reports-event-card" key={item.id}>
        <div className="reports-event-card-header">
          <span className={`reports-type-badge reports-type-${item.removalType.toLowerCase()}`}>
            {tableTypeLabel(item.removalType)}
          </span>
          <strong>{formatReportsDate(item.eventDate)}</strong>
        </div>

        <div className="reports-card-cigar">
          <h4>{cigarPrimary(item)}</h4>
          {cigarSecondary(item) ? <span>{cigarSecondary(item)}</span> : null}
          {item.catalogCigar?.wrapper ? <small>{item.catalogCigar.wrapper}</small> : null}
          {!item.catalogCigar ? <span className="attention-badge">Catalog unavailable</span> : null}
          {item.catalogCigar && !item.catalogCigar.isActive ? (
            <span className="attention-badge">Archived Catalog</span>
          ) : null}
        </div>

        <dl className="reports-card-metrics">
          <div>
            <dt>Qty</dt>
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
          <div>
            <dt>Savings</dt>
            <dd>{formatReportsMoney(item.eventSavings)}</dd>
          </div>
          <div>
            <dt>Source</dt>
            <dd>{sourceText(item)}</dd>
          </div>
        </dl>

        {item.sourceLocation?.isArchived ? (
          <span className="attention-badge">Archived location</span>
        ) : null}
        {shouldShowRecordedDate(item) ? (
          <small className="reports-recorded-date">Recorded {formatReportsDate(item.createdAt)}</small>
        ) : null}
        {item.notes ? <p className="reports-card-note">{item.notes}</p> : null}
      </article>
    )
  }

  const currentMetric = report ? selectedMetric(report, removalType) : null
  const warnings = currentMetric ? missingWarnings(currentMetric) : []
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
    <section className="panel reports-panel">
        <div className="reports-section-heading">
          <div>
            <h3>Removal History</h3>
            <p>
              Summary cards cover the active date and search filters. The removal type narrows
              the event list below.
            </p>
          </div>
        </div>

        <div className="reports-filter-grid">
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

          <fieldset className="reports-segment-control reports-removal-control">
            <legend>Removal Type</legend>
            <div>
              {REMOVAL_TYPE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  className={removalType === option.value ? 'active' : ''}
                  type="button"
                  aria-pressed={removalType === option.value}
                  disabled={isLoading}
                  onClick={() => handleRemovalTypeChange(option.value)}
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
              placeholder="Search cigar, location, notes, or Lot number"
              aria-label="Search removal history"
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
            <p>Loading removal history...</p>
          </section>
        ) : null}

        {error ? (
          <section className="reports-error" role="alert">
            <h3>Removal history could not be loaded</h3>
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
                Updating removal history...
              </p>
            ) : null}

            <section className="reports-quantity-grid" aria-label="Removal quantity summary">
              <MetricCard label="Total Removed" value={report.summary.combined.quantity} />
              <MetricCard label="Smoked" value={report.summary.smoking.quantity} />
              <MetricCard label="Gifted" value={report.summary.gifted.quantity} />
              <MetricCard
                label="Discarded / Damaged"
                value={report.summary.discarded.quantity}
              />
            </section>

            {currentMetric ? (
              <section className="reports-value-section">
                <div className="reports-section-heading">
                  <h3>{selectedValueTitle(removalType)}</h3>
                </div>
                <div className="reports-value-grid">
                  <MetricCard label="Total Cost" value={formatReportsMoney(currentMetric.totalCost)} />
                  <MetricCard label="Total MSRP" value={formatReportsMoney(currentMetric.totalMsrp)} />
                  <MetricCard label="Total Savings" value={formatReportsMoney(currentMetric.totalSavings)} />
                  <MetricCard
                    label="Average Cost per Cigar"
                    value={formatReportsMoney(currentMetric.averageCostPerCigar)}
                  />
                  <MetricCard
                    label="Average MSRP per Cigar"
                    value={formatReportsMoney(currentMetric.averageMsrpPerCigar)}
                  />
                  <MetricCard label="Quantity Included" value={currentMetric.quantity} />
                </div>
                {warnings.length > 0 ? (
                  <div className="reports-warning-list" role="status">
                    {warnings.map((warning) => (
                      <p key={warning}>{warning}</p>
                    ))}
                  </div>
                ) : null}
              </section>
            ) : null}

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
                          event.target.value as RemovalReportSortBy,
                          FIRST_SORT_DIRECTION[event.target.value as RemovalReportSortBy],
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
                          event.target.value as RemovalReportSortDirection,
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

            <div className="reports-desktop-table">
              <table className="data-table reports-table">
                <colgroup>
                  <col className="reports-col-date" />
                  <col className="reports-col-type" />
                  <col className="reports-col-cigar" />
                  <col className="reports-col-qty" />
                  <col className="reports-col-source" />
                  <col className="reports-col-money" />
                  <col className="reports-col-money" />
                  <col className="reports-col-money" />
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
                    <th>Type</th>
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
                    <th>Source</th>
                    <th
                      aria-sort={
                        sortBy === 'COST'
                          ? sortDirection === 'ASC'
                            ? 'ascending'
                            : 'descending'
                          : 'none'
                      }
                    >
                      {renderSortHeader('COST', 'Total Cost')}
                    </th>
                    <th
                      aria-sort={
                        sortBy === 'MSRP'
                          ? sortDirection === 'ASC'
                            ? 'ascending'
                            : 'descending'
                          : 'none'
                      }
                    >
                      {renderSortHeader('MSRP', 'Total MSRP')}
                    </th>
                    <th>Savings</th>
                  </tr>
                </thead>
                <tbody>{report.items.map((item) => renderReportRow(item))}</tbody>
              </table>
            </div>

            {report.items.length > 0 ? (
              <div className="reports-card-list">
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

export default RemovalHistoryReport

