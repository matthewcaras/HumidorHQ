import { useState } from 'react'
import type {
  CatalogCigar,
  CollectionCigarDetails,
  CollectionHumidorDetails,
  CollectionHumidorSectionCigar,
  CollectionInventoryIssue,
  CollectionLotLocation,
  CollectionLotSummary,
  MoveLotResult,
} from '../../services/api'
import { MoveLotPanel } from './MoveLotPanel'

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'UTC',
})

export function formatDate(value: string | null | undefined) {
  if (!value) {
    return '-'
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return '-'
  }

  return dateFormatter.format(date)
}

export function formatMoney(value: string | number | null | undefined) {
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

export function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '-'
  }

  return `${value.toFixed(1)}%`
}

export function sectionKindLabel(value: string | null | undefined) {
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

export function capacityText(totalQuantity: number, capacity: number | null | undefined) {
  if (capacity === null || capacity === undefined || capacity <= 0) {
    return 'Capacity not set'
  }

  return `${totalQuantity} of ${capacity} cigars`
}

export function capacityPercentText(percent: number | null | undefined) {
  if (percent === null || percent === undefined || !Number.isFinite(percent)) {
    return ''
  }

  return percent > 100
    ? `${formatPercent(percent)} of stated capacity`
    : `${formatPercent(percent)} full`
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

function dimensionsLabel(cigar: CatalogCigar) {
  if (!cigar.length && !cigar.ringGauge) {
    return ''
  }

  return [cigar.length ? String(cigar.length) : null, cigar.ringGauge ? String(cigar.ringGauge) : null]
    .filter(Boolean)
    .join(' x ')
}

export function cigarDetails(cigar: CatalogCigar) {
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

  return details.join(' - ')
}

function cigarHeaderMeta(cigar: CatalogCigar) {
  return [
    dimensionsLabel(cigar),
    cigar.wrapper,
    cigar.strength,
    cigar.country,
  ].filter(Boolean)
}

export function issueMessage(issue: CollectionInventoryIssue) {
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

export function issueTitle(issues: CollectionInventoryIssue[]) {
  return issues.map((issue) => issueMessage(issue)).join(' ')
}

export function issueKey(issue: CollectionInventoryIssue) {
  return [
    issue.code,
    issue.lotId ?? '',
    issue.catalogCigarId ?? '',
    issue.storageLocationId ?? '',
    issue.storageSubLocationId ?? '',
  ].join(':')
}

function lotIssueTitle(lot: CollectionLotSummary) {
  return lot.issues.map((issue) => issueMessage(issue)).join(' ')
}

type CigarDetailsPanelProps = {
  details: CollectionCigarDetails | null
  isLoading: boolean
  error: string
  onClose: () => void
  onReloadDetails?: () => Promise<void>
  onInventoryChanged?: () => void | Promise<void>
}

export function CigarDetailsPanel({
  details,
  isLoading,
  error,
  onClose,
  onReloadDetails,
  onInventoryChanged,
}: CigarDetailsPanelProps) {
  const [moveTarget, setMoveTarget] = useState<{
    lot: CollectionLotSummary
    placement: CollectionLotLocation
  } | null>(null)
  const [successMessage, setSuccessMessage] = useState('')
  const cigar = details?.catalogCigar
  const headerMeta = cigar ? cigarHeaderMeta(cigar) : []

  async function handleMoveSuccess(_result: MoveLotResult) {
    setMoveTarget(null)
    setSuccessMessage('Cigars moved successfully.')

    try {
      await onReloadDetails?.()
      await onInventoryChanged?.()
    } catch {
      setSuccessMessage('Cigars moved successfully. Refresh the page if the updated placement is not visible.')
    }
  }

  return (
    <div
      className="modal-backdrop collection-details-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose()
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
            onClick={onClose}
          >
            &times;
          </button>
        </div>

        {isLoading ? <p className="muted">Loading cigar details...</p> : null}
        {error ? <p className="error-text">{error}</p> : null}
        {successMessage ? (
          <p className="collection-detail-success" role="status">
            {successMessage}
          </p>
        ) : null}

        {details ? (
          <div className="collection-details-content">
            <section className="collection-details-hero">
              <div>
                <p>{details.catalogCigar.manufacturer}</p>
                <h4>
                  {details.catalogCigar.series} - {details.catalogCigar.vitola}
                </h4>
                {headerMeta.length > 0 ? <span>{headerMeta.join(' - ')}</span> : null}
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
                        <div
                          className="collection-lot-placement-row"
                          key={location.storageSubLocationId}
                        >
                          <p>
                            {location.storageLocationName} / {location.storageSubLocationName}{' '}
                            &mdash; Qty {location.quantity}
                          </p>
                          <button
                            className="secondary-button collection-placement-move-button"
                            type="button"
                            onClick={() => {
                              setSuccessMessage('')
                              setMoveTarget({ lot, placement: location })
                            }}
                          >
                            Move
                          </button>
                        </div>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </div>
        ) : null}

        {moveTarget && cigar ? (
          <MoveLotPanel
            cigar={cigar}
            lot={moveTarget.lot}
            placement={moveTarget.placement}
            onClose={() => setMoveTarget(null)}
            onSuccess={handleMoveSuccess}
          />
        ) : null}
      </section>
    </div>
  )
}

type HumidorDetailsPanelProps = {
  details: CollectionHumidorDetails | null
  isLoading: boolean
  error: string
  isNestedPanelOpen: boolean
  onClose: () => void
  onOpenCigarDetails: (catalogCigarId: number, opener: HTMLElement) => void
}

export function HumidorDetailsPanel({
  details,
  isLoading,
  error,
  isNestedPanelOpen,
  onClose,
  onOpenCigarDetails,
}: HumidorDetailsPanelProps) {
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

  function renderSectionCigar(cigar: CollectionHumidorSectionCigar) {
    const detailsText = cigarDetails(cigar.catalogCigar)

    return (
      <button
        className="collection-section-cigar"
        key={cigar.catalogCigar.id}
        type="button"
        onClick={(event) => {
          event.stopPropagation()
          onOpenCigarDetails(cigar.catalogCigar.id, event.currentTarget)
        }}
      >
        <div className="collection-section-cigar-identity">
          <strong>{cigar.catalogCigar.manufacturer}</strong>
          <span>
            {cigar.catalogCigar.series} - {cigar.catalogCigar.vitola}
          </span>
          {detailsText ? <small>{detailsText}</small> : null}
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

  return (
    <div
      className="modal-backdrop collection-details-backdrop collection-humidor-details-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isNestedPanelOpen) {
          onClose()
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
            onClick={onClose}
          >
            &times;
          </button>
        </div>

        {isLoading ? <p className="muted">Loading Humidor details...</p> : null}
        {error ? <p className="error-text">{error}</p> : null}

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
                  <article
                    className="collection-humidor-section-card"
                    key={section.storageSubLocationId}
                  >
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
