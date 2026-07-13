import { useState } from 'react'
import ActivityHistoryReport from '../components/reports/ActivityHistoryReport'
import RemovalHistoryReport from '../components/reports/RemovalHistoryReport'

type ActiveReport = 'removals' | 'activity'

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
        <ActivityHistoryReport isActive={activeReport === 'activity'} />
      </div>
    </div>
  )
}

export default Reports
