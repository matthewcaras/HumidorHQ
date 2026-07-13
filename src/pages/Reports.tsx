import { useEffect, useRef, useState } from 'react'
import RemovalHistoryReport from '../components/reports/RemovalHistoryReport'
import {
  getActivityReport,
  type ActivityReportResponse,
} from '../services/api'

type ActiveReport = 'removals' | 'activity'

function ActivityMetricCard({ label, value }: { label: string; value: string | number }) {
  return (
    <article className="reports-metric-card activity-summary-card">
      <p>{label}</p>
      <strong>{value}</strong>
    </article>
  )
}

function ActivityHistoryFoundationPanel({ isActive }: { isActive: boolean }) {
  const [report, setReport] = useState<ActivityReportResponse | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const requestIdRef = useRef(0)

  async function loadActivityReport() {
    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId
    setIsLoading(true)
    setError('')

    try {
      const data = await getActivityReport({ limit: 50 })

      if (requestId !== requestIdRef.current) {
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
      void loadActivityReport()
    }
  }, [isActive, report, isLoading, error])

  useEffect(() => {
    return () => {
      requestIdRef.current += 1
    }
  }, [])

  return (
    <section className="panel reports-panel activity-foundation-panel">
      <div className="reports-section-heading">
        <div>
          <h3>Inventory Activity History</h3>
          <p>Review received, moved, smoked, gifted, and discarded cigar activity.</p>
        </div>
      </div>

      {isLoading && !report ? (
        <section className="reports-loading" aria-live="polite">
          <p>Loading inventory activity history...</p>
        </section>
      ) : null}

      {error ? (
        <section className="reports-error" role="alert">
          <h3>Activity history could not be loaded</h3>
          <p>{error}</p>
          <button className="primary-button" type="button" onClick={() => void loadActivityReport()}>
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

          <section
            className="activity-secondary-breakdown"
            aria-label="Removed activity quantity breakdown"
          >
            <div>
              <span>Smoked quantity</span>
              <strong>{report.summary.smoked.quantity}</strong>
            </div>
            <div>
              <span>Gifted quantity</span>
              <strong>{report.summary.gifted.quantity}</strong>
            </div>
            <div>
              <span>Discarded quantity</span>
              <strong>{report.summary.discarded.quantity}</strong>
            </div>
          </section>

          <p className="activity-foundation-note">
            Detailed Activity History controls and event rows will be added in the next stage.
          </p>
        </>
      ) : null}
    </section>
  )
}

function Reports() {
  const [activeReport, setActiveReport] = useState<ActiveReport>('removals')

  return (
    <div className="reports-page">
      <header className="page-header reports-page-header">
        <div className="page-header-copy">
          <h2>Reports</h2>
          <p className="page-subtitle">
            Review smoking, gifting, discarded cigars, and inventory activity history.
          </p>
          <div className="reports-switch" role="group" aria-label="Choose report">
            <button
              type="button"
              className={activeReport === 'removals' ? 'active' : ''}
              aria-pressed={activeReport === 'removals'}
              onClick={() => setActiveReport('removals')}
            >
              Removal History
            </button>
            <button
              type="button"
              className={activeReport === 'activity' ? 'active' : ''}
              aria-pressed={activeReport === 'activity'}
              onClick={() => setActiveReport('activity')}
            >
              Activity History
            </button>
          </div>
        </div>
      </header>

      <div hidden={activeReport !== 'removals'}>
        <RemovalHistoryReport />
      </div>

      <div hidden={activeReport !== 'activity'}>
        <ActivityHistoryFoundationPanel isActive={activeReport === 'activity'} />
      </div>
    </div>
  )
}

export default Reports
