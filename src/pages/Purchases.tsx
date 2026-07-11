import { useEffect, useMemo, useState } from 'react'
import {
  getPurchaseById,
  getPurchases,
  type Purchase,
  type PurchaseLine,
  type PurchaseReceiptState,
} from '../services/api'

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
})

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'UTC',
})

function money(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === '') {
    return '-'
  }

  return currencyFormatter.format(Number(value))
}

function dateLabel(value: string | null | undefined) {
  if (!value) {
    return '-'
  }

  return dateFormatter.format(new Date(value))
}

function receiptLabel(state: PurchaseReceiptState) {
  switch (state) {
    case 'PARTIALLY_RECEIVED':
      return 'Partially Received'
    case 'RECEIVED':
      return 'Received'
    case 'EN_ROUTE':
    default:
      return 'En Route'
  }
}

function cigarName(line: PurchaseLine) {
  const cigar = line.catalogCigar
  return `${cigar.manufacturer} ${cigar.series} ${cigar.vitola}`
}

function purchaseCigarQuantity(purchase: Purchase) {
  return purchase.lines.reduce((total, line) => total + line.quantity, 0)
}

function trueCostEach(line: PurchaseLine) {
  if (line.lot?.costPerCigarSnapshot !== null && line.lot?.costPerCigarSnapshot !== undefined) {
    return money(line.lot.costPerCigarSnapshot)
  }

  if (line.lot?.allocatedCostPerCigar !== null && line.lot?.allocatedCostPerCigar !== undefined) {
    return money(line.lot.allocatedCostPerCigar)
  }

  const basis =
    Number(line.lineSubtotal) +
    Number(line.allocatedShipping) +
    Number(line.allocatedExciseTax) +
    Number(line.allocatedSalesTax) -
    Number(line.allocatedDiscount)

  return currencyFormatter.format(basis / line.quantity)
}

function enRouteCigars(purchases: Purchase[]) {
  return purchases.reduce(
    (total, purchase) =>
      total +
      purchase.lines.reduce(
        (lineTotal, line) => lineTotal + (line.receivedDate ? 0 : line.quantity),
        0,
      ),
    0,
  )
}

function Purchases() {
  const [purchases, setPurchases] = useState<Purchase[]>([])
  const [selectedPurchase, setSelectedPurchase] = useState<Purchase | null>(null)
  const [search, setSearch] = useState('')
  const [submittedSearch, setSubmittedSearch] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isDetailLoading, setIsDetailLoading] = useState(false)
  const [error, setError] = useState('')

  async function loadPurchases(searchValue = '') {
    setIsLoading(true)
    setError('')

    try {
      const data = await getPurchases(searchValue)
      setPurchases(data)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load purchases.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadPurchases()
  }, [])

  async function handleSearch(event: React.FormEvent) {
    event.preventDefault()
    const nextSearch = search.trim()
    setSubmittedSearch(nextSearch)
    await loadPurchases(nextSearch)
  }

  async function clearSearch() {
    setSearch('')
    setSubmittedSearch('')
    await loadPurchases()
  }

  async function openPurchaseDetails(purchase: Purchase) {
    setIsDetailLoading(true)
    setError('')

    try {
      const detail = await getPurchaseById(purchase.id)
      setSelectedPurchase(detail)
    } catch (detailError) {
      setError(detailError instanceof Error ? detailError.message : 'Unable to load purchase.')
    } finally {
      setIsDetailLoading(false)
    }
  }

  const summary = useMemo(
    () => ({
      totalPurchases: purchases.length,
      totalCigars: purchases.reduce(
        (total, purchase) =>
          total + purchase.lines.reduce((lineTotal, line) => lineTotal + line.quantity, 0),
        0,
      ),
      totalPaid: purchases.reduce((total, purchase) => total + Number(purchase.totalPaid ?? 0), 0),
      enRoute: enRouteCigars(purchases),
    }),
    [purchases],
  )

  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">Purchases</p>
          <h2>Purchases</h2>
          <p className="page-subtitle">
            Track vendor history, purchase costs, and line-level receiving.
          </p>
        </div>
        <button className="primary-button" type="button" disabled title="Coming Soon">
          + Add Purchase
        </button>
      </header>

      <section className="summary-grid">
        <div className="card">
          <p>Total Purchases</p>
          <strong>{summary.totalPurchases}</strong>
        </div>
        <div className="card">
          <p>Total Cigars Purchased</p>
          <strong>{summary.totalCigars}</strong>
        </div>
        <div className="card">
          <p>Total Paid</p>
          <strong>{money(summary.totalPaid)}</strong>
        </div>
        <div className="card">
          <p>En Route Cigars</p>
          <strong>{summary.enRoute}</strong>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header-row">
          <h3>Purchase History</h3>
          <form className="search-form" onSubmit={handleSearch}>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search vendor, invoice, or cigar"
            />
            <button className="secondary-button" type="submit">
              Search
            </button>
            {submittedSearch && (
              <button className="secondary-button" type="button" onClick={clearSearch}>
                Clear
              </button>
            )}
          </form>
        </div>

        {isLoading && <p className="muted">Loading purchases...</p>}

        {error && <p className="error-text">{error}</p>}

        {!isLoading && !error && submittedSearch && (
          <p className="search-results-message">
            {purchases.length === 0
              ? `No purchases found for "${submittedSearch}"`
              : `${purchases.length} ${
                  purchases.length === 1 ? 'purchase' : 'purchases'
                } found for "${submittedSearch}"`}
          </p>
        )}

        {!isLoading && !error && purchases.length === 0 && (
          <p className="muted">
            {submittedSearch ? 'Try another search term.' : 'No purchases have been recorded yet.'}
          </p>
        )}

        {!isLoading && purchases.length > 0 && (
          <>
            <div className="desktop-table">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Purchase Date</th>
                    <th>Vendor</th>
                    <th>Invoice Number</th>
                    <th>Lines</th>
                    <th>Cigars</th>
                    <th>Total Paid</th>
                    <th>Receipt Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {purchases.map((purchase) => (
                    <tr key={purchase.id}>
                      <td>{dateLabel(purchase.purchaseDate)}</td>
                      <td>{purchase.vendor?.name ?? '-'}</td>
                      <td>{purchase.invoiceNumber ?? '-'}</td>
                      <td>{purchase.lines.length}</td>
                      <td>{purchaseCigarQuantity(purchase)}</td>
                      <td>{money(purchase.totalPaid)}</td>
                      <td>{receiptLabel(purchase.receiptState)}</td>
                      <td>
                        <button
                          className="table-action"
                          type="button"
                          disabled={isDetailLoading}
                          onClick={() => openPurchaseDetails(purchase)}
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="purchase-card-list">
              {purchases.map((purchase) => (
                <article className="purchase-card" key={purchase.id}>
                  <div>
                    <p>Purchase Date</p>
                    <strong>{dateLabel(purchase.purchaseDate)}</strong>
                  </div>
                  <div>
                    <p>Vendor</p>
                    <strong>{purchase.vendor?.name ?? '-'}</strong>
                  </div>
                  <div>
                    <p>Invoice Number</p>
                    <strong>{purchase.invoiceNumber ?? '-'}</strong>
                  </div>
                  <div>
                    <p>Cigars</p>
                    <strong>{purchaseCigarQuantity(purchase)}</strong>
                  </div>
                  <div>
                    <p>Total Paid</p>
                    <strong>{money(purchase.totalPaid)}</strong>
                  </div>
                  <div>
                    <p>Receipt Status</p>
                    <strong>{receiptLabel(purchase.receiptState)}</strong>
                  </div>
                  <button
                    className="primary-button purchase-card-action"
                    type="button"
                    disabled={isDetailLoading}
                    onClick={() => openPurchaseDetails(purchase)}
                  >
                    View
                  </button>
                </article>
              ))}
            </div>
          </>
        )}
      </section>

      {selectedPurchase && (
        <div className="modal-backdrop">
          <div className="modal purchase-detail-modal">
            <div className="modal-header">
              <h3>Purchase Details</h3>
              <button
                aria-label="Close purchase details"
                className="icon-button"
                type="button"
                onClick={() => setSelectedPurchase(null)}
              >
                &times;
              </button>
            </div>

            <div className="detail-grid">
              <div>
                <p>Vendor</p>
                <strong>{selectedPurchase.vendor?.name ?? '-'}</strong>
              </div>
              <div>
                <p>Purchase Date</p>
                <strong>{dateLabel(selectedPurchase.purchaseDate)}</strong>
              </div>
              <div>
                <p>Invoice Number</p>
                <strong>{selectedPurchase.invoiceNumber ?? '-'}</strong>
              </div>
              <div>
                <p>Receipt Status</p>
                <strong>{receiptLabel(selectedPurchase.receiptState)}</strong>
              </div>
              <div>
                <p>Shipping</p>
                <strong>{money(selectedPurchase.shipping)}</strong>
              </div>
              <div>
                <p>Excise Tax</p>
                <strong>{money(selectedPurchase.exciseTax)}</strong>
              </div>
              <div>
                <p>Sales Tax</p>
                <strong>{money(selectedPurchase.salesTax)}</strong>
              </div>
              <div>
                <p>Discount</p>
                <strong>{money(selectedPurchase.discount)}</strong>
              </div>
              <div>
                <p>Total Paid</p>
                <strong>{money(selectedPurchase.totalPaid)}</strong>
              </div>
            </div>

            <div className="table-scroll desktop-line-table">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Cigar</th>
                    <th>Quantity</th>
                    <th>Unit Price</th>
                    <th>Line Subtotal</th>
                    <th>MSRP Each</th>
                    <th>Received Date</th>
                    <th>Allocated Shipping</th>
                    <th>Allocated Excise Tax</th>
                    <th>Allocated Sales Tax</th>
                    <th>Allocated Discount</th>
                    <th>True Cost Each</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedPurchase.lines.map((line) => (
                    <tr key={line.id}>
                      <td>{cigarName(line)}</td>
                      <td>{line.quantity}</td>
                      <td>{money(line.unitPrice)}</td>
                      <td>{money(line.lineSubtotal)}</td>
                      <td>{money(line.msrpPerCigar)}</td>
                      <td>{dateLabel(line.receivedDate)}</td>
                      <td>{money(line.allocatedShipping)}</td>
                      <td>{money(line.allocatedExciseTax)}</td>
                      <td>{money(line.allocatedSalesTax)}</td>
                      <td>{money(line.allocatedDiscount)}</td>
                      <td>{trueCostEach(line)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="purchase-line-card-list">
              {selectedPurchase.lines.map((line) => (
                <article className="purchase-line-card" key={line.id}>
                  <div className="purchase-line-card-title">{cigarName(line)}</div>
                  <div className="purchase-line-fields">
                    <div>
                      <p>Quantity</p>
                      <strong>{line.quantity}</strong>
                    </div>
                    <div>
                      <p>Unit Price</p>
                      <strong>{money(line.unitPrice)}</strong>
                    </div>
                    <div>
                      <p>Subtotal</p>
                      <strong>{money(line.lineSubtotal)}</strong>
                    </div>
                    <div>
                      <p>MSRP Each</p>
                      <strong>{money(line.msrpPerCigar)}</strong>
                    </div>
                    <div>
                      <p>Received Date</p>
                      <strong>{dateLabel(line.receivedDate)}</strong>
                    </div>
                    <div>
                      <p>Allocated Shipping</p>
                      <strong>{money(line.allocatedShipping)}</strong>
                    </div>
                    <div>
                      <p>Allocated Excise Tax</p>
                      <strong>{money(line.allocatedExciseTax)}</strong>
                    </div>
                    <div>
                      <p>Allocated Sales Tax</p>
                      <strong>{money(line.allocatedSalesTax)}</strong>
                    </div>
                    <div>
                      <p>Allocated Discount</p>
                      <strong>{money(line.allocatedDiscount)}</strong>
                    </div>
                    <div>
                      <p>True Cost Each</p>
                      <strong>{trueCostEach(line)}</strong>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default Purchases
