import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import {
  getCollectionCigarDetails,
  getCollectionHumidorDetails,
  getDashboard,
  type CollectionCigarDetails,
  type CollectionHumidorDetails,
  type DashboardActivity,
  type DashboardActivityLocation,
  type DashboardHumidor,
  type DashboardInventoryIssue,
  type DashboardRemovalMetric,
  type DashboardResponse,
} from '../services/api'
import {
  CigarDetailsPanel,
  HumidorDetailsPanel,
} from '../components/collection/CollectionDetailsPanels'

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'UTC',
})

function formatMoney(value: string | null | undefined) {
  if (value === null || value === undefined || value === '') {
    return '—'
  }

  const text = String(value).trim()
  const match = text.match(/^(-)?(\d+)(?:\.(\d+))?$/)

  if (!match) {
    return '—'
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
    return '—'
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return '—'
  }

  return dateFormatter.format(date)
}

function isSameUtcDate(left: string, right: string) {
  return formatDate(left) === formatDate(right)
}

function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return count === 1 ? singular : plural
}

function missingValueWarning(
  count: number,
  valueName: 'Cost' | 'MSRP',
  context: string,
) {
  if (count <= 0) {
    return ''
  }

  return `${valueName} data is unavailable for ${count} ${context} ${pluralize(
    count,
    'cigar',
  )}.`
}

function removalMissingWarning(
  count: number,
  valueName: 'Cost' | 'MSRP',
  context: string,
) {
  if (count <= 0) {
    return ''
  }

  return `${valueName} unavailable for ${count} ${context} ${pluralize(
    count,
    'cigar',
  )}.`
}

function issueMessage(issue: DashboardInventoryIssue) {
  switch (issue.code) {
    case 'LOT_BALANCE_MISMATCH':
      return 'A lot quantity does not match its stored location balances.'
    case 'COST_DATA_MISSING':
      return 'Cost history is missing for part of the current inventory.'
    case 'MSRP_DATA_MISSING':
      return 'MSRP history is missing for part of the current inventory.'
    case 'ARCHIVED_CATALOG_WITH_INVENTORY':
      return 'An archived Catalog cigar still has current inventory.'
    case 'CATALOG_CIGAR_MISSING':
      return 'Current inventory is linked to a lot without a Catalog cigar.'
    case 'ARCHIVED_LOCATION_WITH_INVENTORY':
      return 'Inventory is stored in an archived humidor or section.'
    default:
      return issue.message
  }
}

function compactIssueMessages(issues: DashboardInventoryIssue[]) {
  return Array.from(new Set(issues.map((issue) => issueMessage(issue))))
}

function capacitySummary(humidor: DashboardHumidor) {
  const capacity = humidor.storageLocation.capacity

  if (capacity === null || capacity <= 0) {
    return {
      countText: 'Capacity not set',
      percentText: '',
    }
  }

  return {
    countText: `${humidor.totalQuantity} of ${capacity} cigars`,
    percentText:
      humidor.capacityUsedPercent === null
        ? ''
        : `${humidor.capacityUsedPercent.toFixed(1)}% full`,
  }
}

function locationText(location: DashboardActivityLocation | null) {
  if (!location) {
    return ''
  }

  return `${location.storageLocationName} / ${location.storageSubLocationName}`
}

function activityVerb(activity: DashboardActivity) {
  const quantity = activity.quantity
  const source = locationText(activity.sourceLocation)
  const destination = locationText(activity.destinationLocation)

  switch (activity.eventType) {
    case 'INITIAL_PLACEMENT':
      return `Received ${quantity} into ${destination || 'inventory'}`
    case 'MOVE':
      if (source && destination) {
        return `Moved ${quantity} from ${source} to ${destination}`
      }

      return `Moved ${quantity} ${pluralize(quantity, 'cigar')}`
    case 'SMOKED':
      return `Smoked ${quantity} ${pluralize(quantity, 'cigar')}`
    case 'GIFTED':
      return `Gifted ${quantity} ${pluralize(quantity, 'cigar')}`
    case 'DISCARDED':
      return `Discarded ${quantity} ${pluralize(quantity, 'cigar')}`
    default:
      return `Recorded ${quantity} ${pluralize(quantity, 'cigar')}`
  }
}

function cigarTitle(activity: DashboardActivity) {
  const cigar = activity.catalogCigar

  if (!cigar) {
    return 'Unknown cigar'
  }

  return `${cigar.manufacturer} ${cigar.series} ${cigar.vitola}`
}

function archivedLocationText(activity: DashboardActivity) {
  const archived = [
    activity.sourceLocation?.isArchived ? locationText(activity.sourceLocation) : '',
    activity.destinationLocation?.isArchived ? locationText(activity.destinationLocation) : '',
  ].filter(Boolean)

  if (archived.length === 0) {
    return ''
  }

  return `Archived location: ${archived.join(', ')}`
}

type MetricCardProps = {
  label: string
  value: string | number
}

function MetricCard({ label, value }: MetricCardProps) {
  return (
    <article className="dashboard-metric-card">
      <p>{label}</p>
      <strong>{value}</strong>
    </article>
  )
}

type RemovalCardProps = {
  title: string
  metric: DashboardRemovalMetric
}

function RemovalCard({ title, metric }: RemovalCardProps) {
  const warnings = [
    removalMissingWarning(metric.quantityMissingCost, 'Cost', title.toLowerCase()),
    removalMissingWarning(metric.quantityMissingMsrp, 'MSRP', title.toLowerCase()),
  ].filter(Boolean)

  return (
    <article className="dashboard-removal-card">
      <div className="dashboard-card-heading">
        <h4>{title}</h4>
      </div>
      <dl>
        <div>
          <dt>Quantity</dt>
          <dd>{metric.quantity}</dd>
        </div>
        <div>
          <dt>Total Cost</dt>
          <dd>{formatMoney(metric.totalCost)}</dd>
        </div>
        <div>
          <dt>Total MSRP</dt>
          <dd>{formatMoney(metric.totalMsrp)}</dd>
        </div>
      </dl>
      {warnings.length > 0 ? (
        <div className="dashboard-card-warning">
          {warnings.map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
        </div>
      ) : null}
    </article>
  )
}

function Dashboard() {
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedHumidorId, setSelectedHumidorId] = useState<number | null>(null)
  const [humidorDetails, setHumidorDetails] = useState<CollectionHumidorDetails | null>(null)
  const [isHumidorDetailsLoading, setIsHumidorDetailsLoading] = useState(false)
  const [humidorDetailsError, setHumidorDetailsError] = useState('')
  const [selectedCigarId, setSelectedCigarId] = useState<number | null>(null)
  const [cigarDetails, setCigarDetails] = useState<CollectionCigarDetails | null>(null)
  const [isCigarDetailsLoading, setIsCigarDetailsLoading] = useState(false)
  const [cigarDetailsError, setCigarDetailsError] = useState('')
  const dashboardRequestIdRef = useRef(0)
  const humidorDetailsRequestIdRef = useRef(0)
  const cigarDetailsRequestIdRef = useRef(0)
  const humidorOpenerRef = useRef<HTMLElement | null>(null)
  const cigarOpenerRef = useRef<HTMLElement | null>(null)

  async function loadDashboard() {
    const requestId = dashboardRequestIdRef.current + 1
    dashboardRequestIdRef.current = requestId
    setIsLoading(true)
    setError('')

    try {
      const data = await getDashboard()

      if (requestId !== dashboardRequestIdRef.current) {
        return
      }

      setDashboard(data)
    } catch (loadError) {
      if (requestId !== dashboardRequestIdRef.current) {
        return
      }

      setError(loadError instanceof Error ? loadError.message : 'Unable to load Dashboard.')
    } finally {
      if (requestId === dashboardRequestIdRef.current) {
        setIsLoading(false)
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

  async function reloadOpenHumidorDetails() {
    if (selectedHumidorId === null) {
      return
    }

    const requestId = humidorDetailsRequestIdRef.current + 1
    humidorDetailsRequestIdRef.current = requestId
    setHumidorDetailsError('')
    setIsHumidorDetailsLoading(true)

    try {
      const data = await getCollectionHumidorDetails(selectedHumidorId)

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

  async function openCigarDetails(catalogCigarId: number, opener: HTMLElement) {
    const requestId = cigarDetailsRequestIdRef.current + 1
    cigarDetailsRequestIdRef.current = requestId
    cigarOpenerRef.current = opener
    setSelectedCigarId(catalogCigarId)
    setCigarDetails(null)
    setCigarDetailsError('')
    setIsCigarDetailsLoading(true)

    try {
      const data = await getCollectionCigarDetails(catalogCigarId)

      if (requestId !== cigarDetailsRequestIdRef.current) {
        return
      }

      setCigarDetails(data)
    } catch (loadError) {
      if (requestId !== cigarDetailsRequestIdRef.current) {
        return
      }

      setCigarDetailsError(
        loadError instanceof Error ? loadError.message : 'Unable to load cigar details.',
      )
    } finally {
      if (requestId === cigarDetailsRequestIdRef.current) {
        setIsCigarDetailsLoading(false)
      }
    }
  }

  async function reloadOpenCigarDetails() {
    if (selectedCigarId === null) {
      return false
    }

    const requestId = cigarDetailsRequestIdRef.current + 1
    cigarDetailsRequestIdRef.current = requestId
    setCigarDetailsError('')
    setIsCigarDetailsLoading(true)

    try {
      const data = await getCollectionCigarDetails(selectedCigarId)

      if (requestId !== cigarDetailsRequestIdRef.current) {
        return false
      }

      setCigarDetails(data)
      return true
    } catch (loadError) {
      if (requestId !== cigarDetailsRequestIdRef.current) {
        return false
      }

      setCigarDetailsError(
        loadError instanceof Error ? loadError.message : 'Unable to load cigar details.',
      )
      return false
    } finally {
      if (requestId === cigarDetailsRequestIdRef.current) {
        setIsCigarDetailsLoading(false)
      }
    }
  }

  async function handleInventoryChanged() {
    await Promise.all([
      loadDashboard(),
      selectedHumidorId !== null ? reloadOpenHumidorDetails() : Promise.resolve(),
    ])
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

  function closeCigarDetails() {
    cigarDetailsRequestIdRef.current += 1
    setSelectedCigarId(null)
    setCigarDetails(null)
    setCigarDetailsError('')
    setIsCigarDetailsLoading(false)

    window.setTimeout(() => {
      cigarOpenerRef.current?.focus()
    }, 0)
  }

  function handleOpenHumidorKeyDown(
    event: KeyboardEvent<HTMLElement>,
    storageLocationId: number,
  ) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      void openHumidorDetails(storageLocationId, event.currentTarget)
    }
  }

  useEffect(() => {
    void loadDashboard()

    return () => {
      dashboardRequestIdRef.current += 1
      humidorDetailsRequestIdRef.current += 1
      cigarDetailsRequestIdRef.current += 1
    }
  }, [])

  useEffect(() => {
    if (selectedHumidorId === null) {
      return
    }

    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape' && selectedCigarId === null) {
        closeHumidorDetails()
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [selectedHumidorId, selectedCigarId])

  useEffect(() => {
    if (selectedCigarId === null) {
      return
    }

    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') {
        closeCigarDetails()
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [selectedCigarId])

  const collection = dashboard?.currentCollection
  const smoking = dashboard?.smoking
  const currentWarnings = collection
    ? [
        missingValueWarning(collection.quantityMissingCost, 'Cost', 'current'),
        missingValueWarning(collection.quantityMissingMsrp, 'MSRP', 'current'),
      ].filter(Boolean)
    : []
  const smokingWarnings = smoking
    ? [
        removalMissingWarning(smoking.quantityMissingCost, 'Cost', 'smoked'),
        removalMissingWarning(smoking.quantityMissingMsrp, 'MSRP', 'smoked'),
      ].filter(Boolean)
    : []
  const issueMessages = dashboard ? compactIssueMessages(dashboard.issues) : []

  return (
    <div className="dashboard-page">
      <header className="page-header">
        <div className="page-header-copy">
          <h2>Dashboard</h2>
          <p className="page-subtitle">
            A current view of your collection, smoking history, humidors, and recent activity.
          </p>
        </div>
      </header>

      {isLoading && !dashboard ? (
        <section className="dashboard-loading" aria-live="polite">
          <p>Loading Dashboard...</p>
        </section>
      ) : null}

      {error ? (
        <section className="dashboard-error panel" role="alert">
          <h3>Dashboard could not be loaded</h3>
          <p>{error}</p>
          <button className="primary-button" type="button" onClick={() => void loadDashboard()}>
            Retry
          </button>
        </section>
      ) : null}

      {dashboard && collection && smoking ? (
        <>
          {isLoading ? (
            <p className="dashboard-refresh-message" role="status">
              Updating Dashboard...
            </p>
          ) : null}

          <section className="dashboard-primary-grid" aria-label="Dashboard summary">
            <MetricCard label="Total Cigars" value={collection.totalQuantity} />
            <MetricCard label="Current Cost Basis" value={formatMoney(collection.currentCostBasis)} />
            <MetricCard label="Lifetime Smoked" value={smoking.quantity} />
            <MetricCard label="Total Cost Smoked" value={formatMoney(smoking.totalCost)} />
          </section>

          {issueMessages.length > 0 ? (
            <section className="dashboard-attention-panel" role="status">
              <strong>Needs Attention</strong>
              <ul>
                {issueMessages.map((message) => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
            </section>
          ) : null}

          <div className="dashboard-section-grid">
            <section className="panel dashboard-section dashboard-current-section">
              <div className="dashboard-section-heading">
                <h3>Current Collection</h3>
              </div>
              <div className="dashboard-secondary-grid">
                <MetricCard label="Unique Cigars" value={collection.uniqueCigarCount} />
                <MetricCard label="Lots" value={collection.lotCount} />
                <MetricCard label="Current MSRP Value" value={formatMoney(collection.currentMsrpValue)} />
                <MetricCard label="Current Savings" value={formatMoney(collection.totalSavings)} />
                <MetricCard label="Average Cost per Cigar" value={formatMoney(collection.averageCostPerCigar)} />
                <MetricCard label="Average MSRP per Cigar" value={formatMoney(collection.averageMsrpPerCigar)} />
              </div>
              {currentWarnings.length > 0 ? (
                <div className="dashboard-warning-list">
                  {currentWarnings.map((warning) => (
                    <p key={warning}>{warning}</p>
                  ))}
                </div>
              ) : null}
            </section>

            <section className="panel dashboard-section dashboard-smoking-section">
              <div className="dashboard-section-heading">
                <h3>Smoking</h3>
              </div>
              {smoking.quantity === 0 ? (
                <p className="dashboard-empty-message">
                  No cigars have been recorded as smoked yet.
                </p>
              ) : null}
              <div className="dashboard-smoking-grid">
                <MetricCard label="Smoked MSRP" value={formatMoney(smoking.totalMsrp)} />
                <MetricCard label="Smoking Savings" value={formatMoney(smoking.totalSavings)} />
                <MetricCard label="Average Cost Smoked" value={formatMoney(smoking.averageCostPerCigar)} />
                <MetricCard label="Average MSRP Smoked" value={formatMoney(smoking.averageMsrpPerCigar)} />
              </div>
              {smokingWarnings.length > 0 ? (
                <div className="dashboard-warning-list">
                  {smokingWarnings.map((warning) => (
                    <p key={warning}>{warning}</p>
                  ))}
                </div>
              ) : null}
            </section>
          </div>

          <section className="panel dashboard-section dashboard-humidors-section">
            <div className="dashboard-section-heading">
              <h3>Humidors</h3>
            </div>
            {dashboard.humidors.length === 0 ? (
              <p className="dashboard-empty-message">No humidors are available.</p>
            ) : (
              <div className="dashboard-humidor-grid">
                {dashboard.humidors.map((humidor) => {
                  const capacity = capacitySummary(humidor)

                  return (
                    <article
                      className="dashboard-humidor-card"
                      key={humidor.storageLocation.id}
                      tabIndex={0}
                      role="button"
                      aria-label={`Open ${humidor.storageLocation.name} Humidor details`}
                      onClick={(event) =>
                        void openHumidorDetails(
                          humidor.storageLocation.id,
                          event.currentTarget,
                        )
                      }
                      onKeyDown={(event) =>
                        handleOpenHumidorKeyDown(event, humidor.storageLocation.id)
                      }
                    >
                      <div className="dashboard-humidor-card-header">
                        <h4>{humidor.storageLocation.name}</h4>
                        {!humidor.storageLocation.isActive ? (
                          <span className="attention-badge">Archived</span>
                        ) : null}
                        {humidor.issues.length > 0 ? (
                          <span
                            className="attention-badge"
                            title={compactIssueMessages(humidor.issues).join(' ')}
                          >
                            Needs Attention
                          </span>
                        ) : null}
                      </div>
                      <div className="dashboard-humidor-count">
                        <strong>{humidor.totalQuantity}</strong>
                        <span>{humidor.totalQuantity === 0 ? 'Empty' : 'Current quantity'}</span>
                      </div>
                      <dl>
                        <div>
                          <dt>Capacity</dt>
                          <dd>
                            {capacity.countText}
                            {capacity.percentText ? <span>{capacity.percentText}</span> : null}
                          </dd>
                        </div>
                        <div>
                          <dt>Unique Cigars</dt>
                          <dd>{humidor.uniqueCigarCount}</dd>
                        </div>
                        <div>
                          <dt>Oldest Received</dt>
                          <dd>{formatDate(humidor.oldestReceivedDate)}</dd>
                        </div>
                        <div>
                          <dt>Avg MSRP / Cigar</dt>
                          <dd>{formatMoney(humidor.averageMsrpPerCigar)}</dd>
                        </div>
                      </dl>
                    </article>
                  )
                })}
              </div>
            )}
          </section>

          <section className="panel dashboard-section dashboard-removals-section">
            <div className="dashboard-section-heading">
              <h3>Other Removals</h3>
            </div>
            <div className="dashboard-removal-grid">
              <RemovalCard title="Gifted" metric={dashboard.gifted} />
              <RemovalCard title="Discarded / Damaged" metric={dashboard.discarded} />
            </div>
          </section>

          <section className="panel dashboard-section dashboard-activity-section">
            <div className="dashboard-section-heading">
              <h3>Recent Activity</h3>
            </div>
            {dashboard.recentActivity.length === 0 ? (
              <p className="dashboard-empty-message">
                No inventory activity has been recorded yet.
              </p>
            ) : (
              <div className="dashboard-activity-list">
                {dashboard.recentActivity.map((activity) => {
                  const archivedText = archivedLocationText(activity)
                  const showRecordedDate = !isSameUtcDate(
                    activity.eventDate,
                    activity.createdAt,
                  )

                  return (
                    <article className="dashboard-activity-card" key={activity.id}>
                      <div className="dashboard-activity-main">
                        <p>{formatDate(activity.eventDate)}</p>
                        <h4>{activityVerb(activity)}</h4>
                        <strong>{cigarTitle(activity)}</strong>
                      </div>
                      <dl>
                        <div>
                          <dt>Lot</dt>
                          <dd>#{activity.lotId}</dd>
                        </div>
                        <div>
                          <dt>Cost / Cigar</dt>
                          <dd>{formatMoney(activity.costPerCigarAtEvent)}</dd>
                        </div>
                        <div>
                          <dt>MSRP / Cigar</dt>
                          <dd>{formatMoney(activity.msrpPerCigarAtEvent)}</dd>
                        </div>
                      </dl>
                      {showRecordedDate ? (
                        <small>Recorded {formatDate(activity.createdAt)}</small>
                      ) : null}
                      {activity.notes ? <p className="dashboard-activity-note">{activity.notes}</p> : null}
                      {archivedText ? (
                        <span className="attention-badge">{archivedText}</span>
                      ) : null}
                    </article>
                  )
                })}
              </div>
            )}
          </section>

          {selectedHumidorId !== null ? (
            <HumidorDetailsPanel
              details={humidorDetails}
              isLoading={isHumidorDetailsLoading}
              error={humidorDetailsError}
              isNestedPanelOpen={selectedCigarId !== null}
              onClose={closeHumidorDetails}
              onOpenCigarDetails={(catalogCigarId, opener) =>
                void openCigarDetails(catalogCigarId, opener)
              }
            />
          ) : null}

          {selectedCigarId !== null ? (
            <CigarDetailsPanel
              details={cigarDetails}
              isLoading={isCigarDetailsLoading}
              error={cigarDetailsError}
              onClose={closeCigarDetails}
              onReloadDetails={reloadOpenCigarDetails}
              onInventoryChanged={handleInventoryChanged}
            />
          ) : null}
        </>
      ) : null}
    </div>
  )
}

export default Dashboard
