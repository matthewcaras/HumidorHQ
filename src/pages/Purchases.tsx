import { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import {
  createCatalogCigar,
  createVendor,
  getCatalogCigars,
  getPurchaseById,
  getPurchases,
  getVendors,
  type CatalogCigar,
  type Purchase,
  type PurchaseLine,
  type PurchaseReceiptState,
  type Vendor,
} from '../services/api'

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
})

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'UTC',
})

const orderDiscountHelpText =
  'Enter the dollar discount shown on the invoice. Do not enter a percentage or a discount already reflected in individual cigar unit prices.'

type PageMode = 'HISTORY' | 'ADD'

type PurchaseFormLine = {
  localId: string
  catalogCigar: CatalogCigar | null
  cigarSearch: string
  quantity: string
  unitPrice: string
  msrpPerCigar: string
}

type PurchaseFormState = {
  vendor: Vendor | null
  vendorSearch: string
  purchaseDate: string
  invoiceNumber: string
  shipping: string
  exciseTax: string
  salesTax: string
  discount: string
  totalPaid: string
  notes: string
  lines: PurchaseFormLine[]
}

type HeaderField = Exclude<keyof PurchaseFormState, 'vendor' | 'lines'>

type PurchaseFormAction =
  | { type: 'SET_HEADER_FIELD'; field: HeaderField; value: string }
  | { type: 'SET_VENDOR'; vendor: Vendor | null; vendorSearch: string }
  | { type: 'ADD_LINE' }
  | { type: 'REMOVE_LINE'; localId: string }
  | {
      type: 'UPDATE_LINE'
      localId: string
      field: keyof Omit<PurchaseFormLine, 'localId' | 'catalogCigar'>
      value: string
    }
  | {
      type: 'SET_LINE_CATALOG_CIGAR'
      localId: string
      catalogCigar: CatalogCigar | null
      cigarSearch: string
    }
  | { type: 'RESET_FORM' }

type CatalogCreateDraft = {
  manufacturer: string
  series: string
  vitola: string
  shape: string
  length: string
  ringGauge: string
  wrapper: string
  strength: string
  msrp: string
}

type CatalogCreateField = keyof CatalogCreateDraft

function localDateString(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

function makeLocalId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function blankPurchaseLine(): PurchaseFormLine {
  return {
    localId: makeLocalId(),
    catalogCigar: null,
    cigarSearch: '',
    quantity: '',
    unitPrice: '',
    msrpPerCigar: '',
  }
}

function blankCatalogCreateDraft(searchText = ''): CatalogCreateDraft {
  return {
    manufacturer: searchText,
    series: '',
    vitola: '',
    shape: '',
    length: '',
    ringGauge: '',
    wrapper: '',
    strength: '',
    msrp: '',
  }
}

function initialPurchaseFormState(): PurchaseFormState {
  return {
    vendor: null,
    vendorSearch: '',
    purchaseDate: localDateString(),
    invoiceNumber: '',
    shipping: '',
    exciseTax: '',
    salesTax: '',
    discount: '',
    totalPaid: '',
    notes: '',
    lines: [blankPurchaseLine()],
  }
}

function purchaseFormReducer(
  state: PurchaseFormState,
  action: PurchaseFormAction,
): PurchaseFormState {
  switch (action.type) {
    case 'SET_HEADER_FIELD':
      return {
        ...state,
        [action.field]: action.value,
      }
    case 'SET_VENDOR':
      return {
        ...state,
        vendor: action.vendor,
        vendorSearch: action.vendorSearch,
      }
    case 'ADD_LINE':
      return {
        ...state,
        lines: [...state.lines, blankPurchaseLine()],
      }
    case 'REMOVE_LINE':
      if (state.lines.length === 1) {
        return state
      }

      return {
        ...state,
        lines: state.lines.filter((line) => line.localId !== action.localId),
      }
    case 'UPDATE_LINE':
      return {
        ...state,
        lines: state.lines.map((line) =>
          line.localId === action.localId ? { ...line, [action.field]: action.value } : line,
        ),
      }
    case 'SET_LINE_CATALOG_CIGAR':
      return {
        ...state,
        lines: state.lines.map((line) =>
          line.localId === action.localId
            ? {
                ...line,
                catalogCigar: action.catalogCigar,
                cigarSearch: action.cigarSearch,
                msrpPerCigar:
                  action.catalogCigar?.msrp === null || action.catalogCigar?.msrp === undefined
                    ? ''
                    : String(action.catalogCigar.msrp),
              }
            : line,
        ),
      }
    case 'RESET_FORM':
      return initialPurchaseFormState()
    default:
      return state
  }
}

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

function catalogCigarName(cigar: CatalogCigar) {
  return `${cigar.manufacturer} — ${cigar.series} — ${cigar.vitola}`
}

function catalogCigarDetails(cigar: CatalogCigar) {
  const size =
    cigar.length && cigar.ringGauge
      ? `${cigar.length} × ${cigar.ringGauge}`
      : cigar.length
        ? String(cigar.length)
        : cigar.ringGauge
          ? String(cigar.ringGauge)
          : ''
  const details = [cigar.shape, size, cigar.wrapper].filter(Boolean)

  return details.join(' · ')
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

function isPurchaseDraftNonempty(state: PurchaseFormState) {
  const headerFields = [
    state.vendorSearch,
    state.invoiceNumber,
    state.shipping,
    state.exciseTax,
    state.salesTax,
    state.discount,
    state.totalPaid,
    state.notes,
  ]

  const hasLineText = state.lines.some((line) =>
    [
      line.cigarSearch,
      line.quantity,
      line.unitPrice,
      line.msrpPerCigar,
    ].some((value) => value.trim().length > 0),
  )

  return (
    state.vendor !== null ||
    headerFields.some((value) => value.trim().length > 0) ||
    hasLineText ||
    state.lines.length > 1 ||
    state.purchaseDate !== localDateString()
  )
}

function Purchases() {
  const [pageMode, setPageMode] = useState<PageMode>('HISTORY')
  const [purchaseForm, dispatchPurchaseForm] = useReducer(
    purchaseFormReducer,
    undefined,
    initialPurchaseFormState,
  )
  const [vendorResults, setVendorResults] = useState<Vendor[]>([])
  const [isVendorSearching, setIsVendorSearching] = useState(false)
  const [isVendorCreating, setIsVendorCreating] = useState(false)
  const [vendorError, setVendorError] = useState('')
  const [isVendorListOpen, setIsVendorListOpen] = useState(false)
  const vendorSearchRequestId = useRef(0)
  const catalogSearchRequestIds = useRef<Record<string, number>>({})
  const catalogSearchTimeouts = useRef<Record<string, number>>({})
  const [catalogResultsByLine, setCatalogResultsByLine] = useState<Record<string, CatalogCigar[]>>(
    {},
  )
  const [catalogSearchingByLine, setCatalogSearchingByLine] = useState<Record<string, boolean>>({})
  const [catalogErrorByLine, setCatalogErrorByLine] = useState<Record<string, string>>({})
  const [openCatalogLineId, setOpenCatalogLineId] = useState<string | null>(null)
  const [activeCatalogCreateLineId, setActiveCatalogCreateLineId] = useState<string | null>(null)
  const [catalogCreateDraft, setCatalogCreateDraft] = useState<CatalogCreateDraft>(
    blankCatalogCreateDraft(),
  )
  const [catalogCreateError, setCatalogCreateError] = useState('')
  const [isCatalogCreating, setIsCatalogCreating] = useState(false)
  const orderDiscountInfoRef = useRef<HTMLDivElement | null>(null)
  const [isOrderDiscountInfoPinned, setIsOrderDiscountInfoPinned] = useState(false)
  const [isOrderDiscountInfoHovered, setIsOrderDiscountInfoHovered] = useState(false)
  const [isOrderDiscountInfoFocused, setIsOrderDiscountInfoFocused] = useState(false)
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

  useEffect(() => {
    function handleDocumentPointerDown(event: PointerEvent) {
      if (
        orderDiscountInfoRef.current &&
        !orderDiscountInfoRef.current.contains(event.target as Node)
      ) {
        setIsOrderDiscountInfoPinned(false)
        setIsOrderDiscountInfoHovered(false)
        setIsOrderDiscountInfoFocused(false)
      }
    }

    function handleDocumentKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOrderDiscountInfoPinned(false)
        setIsOrderDiscountInfoHovered(false)
        setIsOrderDiscountInfoFocused(false)
        setOpenCatalogLineId(null)
        setActiveCatalogCreateLineId(null)
      }
    }

    document.addEventListener('pointerdown', handleDocumentPointerDown)
    document.addEventListener('keydown', handleDocumentKeyDown)

    return () => {
      document.removeEventListener('pointerdown', handleDocumentPointerDown)
      document.removeEventListener('keydown', handleDocumentKeyDown)
    }
  }, [])

  useEffect(
    () => () => {
      for (const timeoutId of Object.values(catalogSearchTimeouts.current)) {
        window.clearTimeout(timeoutId)
      }
    },
    [],
  )

  useEffect(() => {
    if (pageMode !== 'ADD' || purchaseForm.vendor) {
      vendorSearchRequestId.current += 1
      setVendorResults([])
      setIsVendorSearching(false)
      setIsVendorListOpen(false)
      return
    }

    const searchText = purchaseForm.vendorSearch.trim()

    if (searchText.length < 2) {
      vendorSearchRequestId.current += 1
      setVendorResults([])
      setIsVendorSearching(false)
      setIsVendorListOpen(false)
      return
    }

    const requestId = vendorSearchRequestId.current + 1
    vendorSearchRequestId.current = requestId
    setIsVendorSearching(true)
    setVendorError('')
    setIsVendorListOpen(true)

    const timeoutId = window.setTimeout(async () => {
      try {
        const vendors = await getVendors(searchText)

        if (vendorSearchRequestId.current === requestId) {
          setVendorResults(vendors)
        }
      } catch (searchError) {
        if (vendorSearchRequestId.current === requestId) {
          setVendorResults([])
          setVendorError(
            searchError instanceof Error ? searchError.message : 'Unable to search vendors.',
          )
        }
      } finally {
        if (vendorSearchRequestId.current === requestId) {
          setIsVendorSearching(false)
        }
      }
    }, 250)

    return () => window.clearTimeout(timeoutId)
  }, [pageMode, purchaseForm.vendor, purchaseForm.vendorSearch])

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

  function openAddPurchase() {
    dispatchPurchaseForm({ type: 'RESET_FORM' })
    setError('')
    setVendorError('')
    setVendorResults([])
    setIsVendorListOpen(false)
    setSelectedPurchase(null)
    setPageMode('ADD')
  }

  function returnToHistory() {
    if (
      isPurchaseDraftNonempty(purchaseForm) &&
      !window.confirm('Discard this purchase draft and return to Purchase History?')
    ) {
      return
    }

    dispatchPurchaseForm({ type: 'RESET_FORM' })
    setError('')
    setVendorError('')
    setVendorResults([])
    setIsVendorListOpen(false)
    setPageMode('HISTORY')
  }

  function updateVendorSearch(value: string) {
    setVendorError('')

    if (value.trim().length === 0) {
      setVendorResults([])
      setIsVendorListOpen(false)
    }

    if (purchaseForm.vendor) {
      dispatchPurchaseForm({ type: 'SET_VENDOR', vendor: null, vendorSearch: value })
      return
    }

    dispatchPurchaseForm({
      type: 'SET_HEADER_FIELD',
      field: 'vendorSearch',
      value,
    })
  }

  function selectVendor(vendor: Vendor) {
    vendorSearchRequestId.current += 1
    dispatchPurchaseForm({ type: 'SET_VENDOR', vendor, vendorSearch: vendor.name })
    setVendorResults([])
    setIsVendorListOpen(false)
    setVendorError('')
  }

  function clearSelectedVendor() {
    vendorSearchRequestId.current += 1
    dispatchPurchaseForm({ type: 'SET_VENDOR', vendor: null, vendorSearch: '' })
    setVendorResults([])
    setIsVendorListOpen(false)
    setVendorError('')
  }

  async function createVendorFromSearch() {
    const name = purchaseForm.vendorSearch.trim()

    if (!name || isVendorCreating) {
      return
    }

    setIsVendorCreating(true)
    setVendorError('')

    try {
      const vendor = await createVendor({ name })
      selectVendor(vendor)
    } catch (createError) {
      setVendorError(
        createError instanceof Error ? createError.message : 'Unable to create vendor.',
      )
    } finally {
      setIsVendorCreating(false)
    }
  }

  function selectedCatalogIds(excludeLineId?: string) {
    return new Set(
      purchaseForm.lines
        .filter((line) => line.localId !== excludeLineId)
        .map((line) => line.catalogCigar?.id)
        .filter((id): id is number => id !== undefined),
    )
  }

  function clearCatalogLineState(localId: string) {
    catalogSearchRequestIds.current[localId] = (catalogSearchRequestIds.current[localId] ?? 0) + 1

    if (catalogSearchTimeouts.current[localId]) {
      window.clearTimeout(catalogSearchTimeouts.current[localId])
      delete catalogSearchTimeouts.current[localId]
    }

    setCatalogResultsByLine((current) => ({ ...current, [localId]: [] }))
    setCatalogSearchingByLine((current) => ({ ...current, [localId]: false }))
    setCatalogErrorByLine((current) => ({ ...current, [localId]: '' }))

    if (openCatalogLineId === localId) {
      setOpenCatalogLineId(null)
    }
  }

  function scheduleCatalogSearch(localId: string, searchText: string) {
    const trimmedSearch = searchText.trim()

    if (catalogSearchTimeouts.current[localId]) {
      window.clearTimeout(catalogSearchTimeouts.current[localId])
    }

    if (trimmedSearch.length < 2) {
      clearCatalogLineState(localId)
      return
    }

    const requestId = (catalogSearchRequestIds.current[localId] ?? 0) + 1
    catalogSearchRequestIds.current[localId] = requestId
    setCatalogSearchingByLine((current) => ({ ...current, [localId]: true }))
    setCatalogErrorByLine((current) => ({ ...current, [localId]: '' }))
    setOpenCatalogLineId(localId)

    catalogSearchTimeouts.current[localId] = window.setTimeout(async () => {
      try {
        const cigars = await getCatalogCigars({ search: trimmedSearch, limit: 10 })

        if (catalogSearchRequestIds.current[localId] === requestId) {
          setCatalogResultsByLine((current) => ({ ...current, [localId]: cigars }))
        }
      } catch (searchError) {
        if (catalogSearchRequestIds.current[localId] === requestId) {
          setCatalogResultsByLine((current) => ({ ...current, [localId]: [] }))
          setCatalogErrorByLine((current) => ({
            ...current,
            [localId]:
              searchError instanceof Error ? searchError.message : 'Unable to search catalog.',
          }))
        }
      } finally {
        if (catalogSearchRequestIds.current[localId] === requestId) {
          setCatalogSearchingByLine((current) => ({ ...current, [localId]: false }))
        }
      }
    }, 250)
  }

  function updateCigarSearch(line: PurchaseFormLine, value: string) {
    setCatalogErrorByLine((current) => ({ ...current, [line.localId]: '' }))

    if (line.catalogCigar) {
      dispatchPurchaseForm({
        type: 'SET_LINE_CATALOG_CIGAR',
        localId: line.localId,
        catalogCigar: null,
        cigarSearch: value,
      })
    } else {
      dispatchPurchaseForm({
        type: 'UPDATE_LINE',
        localId: line.localId,
        field: 'cigarSearch',
        value,
      })
    }

    if (activeCatalogCreateLineId === line.localId) {
      setActiveCatalogCreateLineId(null)
    }

    scheduleCatalogSearch(line.localId, value)
  }

  function selectCatalogCigar(localId: string, cigar: CatalogCigar) {
    if (selectedCatalogIds(localId).has(cigar.id)) {
      setCatalogErrorByLine((current) => ({
        ...current,
        [localId]: 'This cigar is already selected on another purchase line.',
      }))
      return
    }

    dispatchPurchaseForm({
      type: 'SET_LINE_CATALOG_CIGAR',
      localId,
      catalogCigar: cigar,
      cigarSearch: catalogCigarName(cigar),
    })
    clearCatalogLineState(localId)
    setActiveCatalogCreateLineId(null)
  }

  function clearSelectedCatalogCigar(line: PurchaseFormLine) {
    dispatchPurchaseForm({
      type: 'SET_LINE_CATALOG_CIGAR',
      localId: line.localId,
      catalogCigar: null,
      cigarSearch: '',
    })
    clearCatalogLineState(line.localId)
  }

  function openCatalogCreate(line: PurchaseFormLine) {
    setActiveCatalogCreateLineId(line.localId)
    setCatalogCreateDraft(blankCatalogCreateDraft(line.cigarSearch.trim()))
    setCatalogCreateError('')
    setOpenCatalogLineId(null)
  }

  function updateCatalogCreateField(field: CatalogCreateField, value: string) {
    setCatalogCreateDraft((current) => ({ ...current, [field]: value }))
  }

  async function createCatalogForLine(localId: string) {
    if (isCatalogCreating) {
      return
    }

    setIsCatalogCreating(true)
    setCatalogCreateError('')

    try {
      const created = await createCatalogCigar({
        manufacturer: catalogCreateDraft.manufacturer,
        series: catalogCreateDraft.series,
        vitola: catalogCreateDraft.vitola,
        shape: catalogCreateDraft.shape || undefined,
        length: catalogCreateDraft.length || undefined,
        ringGauge: catalogCreateDraft.ringGauge || undefined,
        wrapper: catalogCreateDraft.wrapper || undefined,
        strength: catalogCreateDraft.strength || undefined,
        msrp: catalogCreateDraft.msrp || undefined,
      })
      selectCatalogCigar(localId, created)
      setActiveCatalogCreateLineId(null)
      setCatalogCreateDraft(blankCatalogCreateDraft())
    } catch (createError) {
      setCatalogCreateError(
        createError instanceof Error ? createError.message : 'Unable to create catalog cigar.',
      )
    } finally {
      setIsCatalogCreating(false)
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
  const isOrderDiscountInfoOpen =
    isOrderDiscountInfoPinned || isOrderDiscountInfoHovered || isOrderDiscountInfoFocused

  if (pageMode === 'ADD') {
    return (
      <>
        <header className="page-header purchase-form-header">
          <div>
            <p className="eyebrow">Purchases</p>
            <h2>Add Purchase</h2>
            <p className="page-subtitle">
              Record one purchase with one or more cigar lines.
            </p>
          </div>
          <div className="page-header-actions">
            <button className="secondary-button" type="button" onClick={returnToHistory}>
              Back to Purchases
            </button>
            <button
              className="primary-button"
              type="button"
              disabled
              title="Purchase saving will be enabled in a later stage."
            >
              Save Purchase
            </button>
          </div>
        </header>

        <form className="purchase-form" onSubmit={(event) => event.preventDefault()}>
          <section className="panel purchase-form-section">
            <div className="section-heading">
              <h3>Purchase Header</h3>
              <p className="muted">
                Search for an existing vendor or create one from the entered name.
              </p>
            </div>

            <div className="purchase-form-grid">
              <div className="vendor-autocomplete">
                <label htmlFor="purchase-vendor-search">
                  Vendor Search
                  <input
                    aria-autocomplete="list"
                    aria-controls="vendor-autocomplete-results"
                    aria-expanded={isVendorListOpen}
                    autoComplete="off"
                    id="purchase-vendor-search"
                    value={purchaseForm.vendorSearch}
                    onChange={(event) => updateVendorSearch(event.target.value)}
                    placeholder="Search vendors"
                  />
                </label>

                {purchaseForm.vendor && (
                  <div className="selected-vendor">
                    <div>
                      <p>Selected Vendor</p>
                      <strong>{purchaseForm.vendor.name}</strong>
                    </div>
                    <button className="secondary-button" type="button" onClick={clearSelectedVendor}>
                      Change
                    </button>
                  </div>
                )}

                {!purchaseForm.vendor && isVendorListOpen && (
                  <div
                    aria-label="Vendor search results"
                    className="autocomplete-results"
                    id="vendor-autocomplete-results"
                    role="listbox"
                  >
                    {isVendorSearching && <p className="muted">Searching vendors...</p>}

                    {!isVendorSearching &&
                      purchaseForm.vendorSearch.trim().length >= 2 &&
                      vendorResults.length === 0 && (
                        <p className="muted">No vendors found.</p>
                      )}

                    {!isVendorSearching &&
                      vendorResults.map((vendor) => (
                        <button
                          className="autocomplete-option"
                          key={vendor.id}
                          role="option"
                          type="button"
                          onClick={() => selectVendor(vendor)}
                        >
                          {vendor.name}
                        </button>
                      ))}
                  </div>
                )}

                {!purchaseForm.vendor && purchaseForm.vendorSearch.trim().length > 0 && (
                  <button
                    className="create-inline-button"
                    type="button"
                    disabled={isVendorCreating}
                    onClick={createVendorFromSearch}
                  >
                    {isVendorCreating
                      ? 'Creating Vendor...'
                      : `Create "${purchaseForm.vendorSearch.trim()}"`}
                  </button>
                )}

                {vendorError && <p className="error-text vendor-field-error">{vendorError}</p>}
              </div>

              <label>
                Purchase Date
                <input
                  type="date"
                  value={purchaseForm.purchaseDate}
                  onChange={(event) =>
                    dispatchPurchaseForm({
                      type: 'SET_HEADER_FIELD',
                      field: 'purchaseDate',
                      value: event.target.value,
                    })
                  }
                />
              </label>

              <label>
                Invoice Number
                <input
                  value={purchaseForm.invoiceNumber}
                  onChange={(event) =>
                    dispatchPurchaseForm({
                      type: 'SET_HEADER_FIELD',
                      field: 'invoiceNumber',
                      value: event.target.value,
                    })
                  }
                  placeholder="Example: INV-1001"
                />
              </label>

              <label className="purchase-form-notes">
                Notes
                <textarea
                  value={purchaseForm.notes}
                  onChange={(event) =>
                    dispatchPurchaseForm({
                      type: 'SET_HEADER_FIELD',
                      field: 'notes',
                      value: event.target.value,
                    })
                  }
                  placeholder="Optional purchase notes"
                  rows={3}
                />
              </label>
            </div>
          </section>

          <section className="panel purchase-form-section">
            <div className="section-heading">
              <h3>Invoice Amounts</h3>
              <p className="muted">Accounting preview and reconciliation will be added later.</p>
            </div>

            <div className="purchase-money-grid">
              <label>
                Shipping
                <input
                  value={purchaseForm.shipping}
                  inputMode="decimal"
                  onChange={(event) =>
                    dispatchPurchaseForm({
                      type: 'SET_HEADER_FIELD',
                      field: 'shipping',
                      value: event.target.value,
                    })
                  }
                  placeholder="0.00"
                />
              </label>
              <label>
                Excise Tax
                <input
                  value={purchaseForm.exciseTax}
                  inputMode="decimal"
                  onChange={(event) =>
                    dispatchPurchaseForm({
                      type: 'SET_HEADER_FIELD',
                      field: 'exciseTax',
                      value: event.target.value,
                    })
                  }
                  placeholder="0.00"
                />
              </label>
              <label>
                Sales Tax
                <input
                  value={purchaseForm.salesTax}
                  inputMode="decimal"
                  onChange={(event) =>
                    dispatchPurchaseForm({
                      type: 'SET_HEADER_FIELD',
                      field: 'salesTax',
                      value: event.target.value,
                    })
                  }
                  placeholder="0.00"
                />
              </label>
              <label className="order-discount-field">
                <span className="field-label-row">
                  <span>Order Discount</span>
                  <span
                    className="info-popover-control"
                    onMouseEnter={() => setIsOrderDiscountInfoHovered(true)}
                    onMouseLeave={() => setIsOrderDiscountInfoHovered(false)}
                    ref={orderDiscountInfoRef}
                  >
                    <button
                      aria-describedby="order-discount-info-popover"
                      aria-expanded={isOrderDiscountInfoOpen}
                      aria-label="About Order Discount"
                      className="info-button"
                      type="button"
                      onBlur={() => setIsOrderDiscountInfoFocused(false)}
                      onClick={() => {
                        if (isOrderDiscountInfoOpen) {
                          setIsOrderDiscountInfoPinned(false)
                          setIsOrderDiscountInfoHovered(false)
                          setIsOrderDiscountInfoFocused(false)
                          return
                        }

                        setIsOrderDiscountInfoPinned(true)
                      }}
                      onFocus={() => setIsOrderDiscountInfoFocused(true)}
                      onMouseDown={(event) => event.preventDefault()}
                    >
                      i
                    </button>
                  </span>
                </span>
                {isOrderDiscountInfoOpen && (
                  <span
                    className="order-discount-help-popover"
                    id="order-discount-info-popover"
                    role="note"
                  >
                    {orderDiscountHelpText}
                  </span>
                )}
                <input
                  value={purchaseForm.discount}
                  inputMode="decimal"
                  onChange={(event) =>
                    dispatchPurchaseForm({
                      type: 'SET_HEADER_FIELD',
                      field: 'discount',
                      value: event.target.value,
                    })
                  }
                  placeholder="0.00"
                />
              </label>
              <label>
                Total Paid
                <input
                  value={purchaseForm.totalPaid}
                  inputMode="decimal"
                  onChange={(event) =>
                    dispatchPurchaseForm({
                      type: 'SET_HEADER_FIELD',
                      field: 'totalPaid',
                      value: event.target.value,
                    })
                  }
                  placeholder="0.00"
                />
              </label>
            </div>
          </section>

          <section className="panel purchase-form-section">
            <div className="panel-header-row purchase-lines-heading">
              <div className="section-heading">
                <h3>Purchase Lines</h3>
                <p className="muted">
                  Search the Catalog first, then create a new cigar only when no match exists.
                </p>
              </div>
            </div>

            <div className="purchase-lines-grid" role="list">
              {purchaseForm.lines.map((line, index) => (
                <div className="purchase-line-row" role="listitem" key={line.localId}>
                  <div className="purchase-line-number">Line {index + 1}</div>
                  <label className="purchase-line-cigar">
                    Cigar Search
                    <input
                      aria-autocomplete="list"
                      aria-controls={`catalog-results-${line.localId}`}
                      aria-expanded={openCatalogLineId === line.localId}
                      autoComplete="off"
                      value={line.cigarSearch}
                      onChange={(event) => updateCigarSearch(line, event.target.value)}
                      placeholder="Search Catalog cigars"
                    />
                  </label>
                  {line.catalogCigar && (
                    <div className="selected-catalog-cigar">
                      <div>
                        <p>Selected Cigar</p>
                        <strong>{catalogCigarName(line.catalogCigar)}</strong>
                        {catalogCigarDetails(line.catalogCigar) && (
                          <span>{catalogCigarDetails(line.catalogCigar)}</span>
                        )}
                      </div>
                      <button
                        className="secondary-button"
                        type="button"
                        onClick={() => clearSelectedCatalogCigar(line)}
                      >
                        Change
                      </button>
                    </div>
                  )}
                  {!line.catalogCigar && openCatalogLineId === line.localId && (
                    <div
                      aria-label={`Catalog cigar search results for line ${index + 1}`}
                      className="catalog-autocomplete-results"
                      id={`catalog-results-${line.localId}`}
                      role="listbox"
                    >
                      {catalogSearchingByLine[line.localId] && (
                        <p className="muted">Searching catalog...</p>
                      )}

                      {!catalogSearchingByLine[line.localId] &&
                        line.cigarSearch.trim().length >= 2 &&
                        (catalogResultsByLine[line.localId] ?? []).length === 0 && (
                          <p className="muted">No catalog cigars found.</p>
                        )}

                      {!catalogSearchingByLine[line.localId] &&
                        (catalogResultsByLine[line.localId] ?? []).map((cigar) => {
                          const isAlreadySelected = selectedCatalogIds(line.localId).has(cigar.id)

                          return (
                            <button
                              className="catalog-option"
                              disabled={isAlreadySelected}
                              key={cigar.id}
                              role="option"
                              type="button"
                              onClick={() => selectCatalogCigar(line.localId, cigar)}
                            >
                              <span>{catalogCigarName(cigar)}</span>
                              {catalogCigarDetails(cigar) && (
                                <small>{catalogCigarDetails(cigar)}</small>
                              )}
                              {isAlreadySelected && <em>Already selected</em>}
                            </button>
                          )
                        })}
                    </div>
                  )}
                  {!line.catalogCigar && line.cigarSearch.trim().length > 0 && (
                    <button
                      className="create-inline-button catalog-create-toggle"
                      type="button"
                      onClick={() => openCatalogCreate(line)}
                    >
                      Create new cigar
                    </button>
                  )}
                  {catalogErrorByLine[line.localId] && (
                    <p className="error-text line-field-message">
                      {catalogErrorByLine[line.localId]}
                    </p>
                  )}
                  {activeCatalogCreateLineId === line.localId && (
                    <div className="catalog-create-panel">
                      <div className="catalog-create-grid">
                        <label>
                          Manufacturer *
                          <input
                            value={catalogCreateDraft.manufacturer}
                            onChange={(event) =>
                              updateCatalogCreateField('manufacturer', event.target.value)
                            }
                          />
                        </label>
                        <label>
                          Series *
                          <input
                            value={catalogCreateDraft.series}
                            onChange={(event) =>
                              updateCatalogCreateField('series', event.target.value)
                            }
                          />
                        </label>
                        <label>
                          Vitola *
                          <input
                            value={catalogCreateDraft.vitola}
                            onChange={(event) =>
                              updateCatalogCreateField('vitola', event.target.value)
                            }
                          />
                        </label>
                        <label>
                          Shape
                          <input
                            value={catalogCreateDraft.shape}
                            onChange={(event) =>
                              updateCatalogCreateField('shape', event.target.value)
                            }
                          />
                        </label>
                        <label>
                          Length
                          <input
                            inputMode="decimal"
                            value={catalogCreateDraft.length}
                            onChange={(event) =>
                              updateCatalogCreateField('length', event.target.value)
                            }
                          />
                        </label>
                        <label>
                          Ring Gauge
                          <input
                            inputMode="numeric"
                            value={catalogCreateDraft.ringGauge}
                            onChange={(event) =>
                              updateCatalogCreateField('ringGauge', event.target.value)
                            }
                          />
                        </label>
                        <label>
                          Wrapper
                          <input
                            value={catalogCreateDraft.wrapper}
                            onChange={(event) =>
                              updateCatalogCreateField('wrapper', event.target.value)
                            }
                          />
                        </label>
                        <label>
                          Strength
                          <input
                            value={catalogCreateDraft.strength}
                            onChange={(event) =>
                              updateCatalogCreateField('strength', event.target.value)
                            }
                          />
                        </label>
                        <label>
                          MSRP
                          <input
                            inputMode="decimal"
                            value={catalogCreateDraft.msrp}
                            onChange={(event) =>
                              updateCatalogCreateField('msrp', event.target.value)
                            }
                            placeholder="0.00"
                          />
                        </label>
                      </div>

                      {catalogCreateError && (
                        <p className="error-text line-field-message">{catalogCreateError}</p>
                      )}

                      <div className="catalog-create-actions">
                        <button
                          className="secondary-button"
                          type="button"
                          onClick={() => setActiveCatalogCreateLineId(null)}
                        >
                          Cancel
                        </button>
                        <button
                          className="primary-button"
                          disabled={isCatalogCreating}
                          type="button"
                          onClick={() => createCatalogForLine(line.localId)}
                        >
                          {isCatalogCreating ? 'Creating...' : 'Create Cigar'}
                        </button>
                      </div>
                    </div>
                  )}
                  <label>
                    Quantity
                    <input
                      value={line.quantity}
                      inputMode="numeric"
                      onChange={(event) =>
                        dispatchPurchaseForm({
                          type: 'UPDATE_LINE',
                          localId: line.localId,
                          field: 'quantity',
                          value: event.target.value,
                        })
                      }
                    />
                  </label>
                  <label>
                    Unit Price
                    <input
                      value={line.unitPrice}
                      inputMode="decimal"
                      onChange={(event) =>
                        dispatchPurchaseForm({
                          type: 'UPDATE_LINE',
                          localId: line.localId,
                          field: 'unitPrice',
                          value: event.target.value,
                        })
                      }
                      placeholder="0.00"
                    />
                  </label>
                  <label>
                    MSRP Each
                    <input
                      value={line.msrpPerCigar}
                      inputMode="decimal"
                      onChange={(event) =>
                        dispatchPurchaseForm({
                          type: 'UPDATE_LINE',
                          localId: line.localId,
                          field: 'msrpPerCigar',
                          value: event.target.value,
                        })
                      }
                      placeholder="0.00"
                    />
                  </label>
                  <button
                    className="table-action danger purchase-line-remove"
                    type="button"
                    disabled={purchaseForm.lines.length === 1}
                    onClick={() =>
                      dispatchPurchaseForm({
                        type: 'REMOVE_LINE',
                        localId: line.localId,
                      })
                    }
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>

            <div className="purchase-lines-actions">
              <button
                className="secondary-button"
                type="button"
                onClick={() => dispatchPurchaseForm({ type: 'ADD_LINE' })}
              >
                Add Line
              </button>
            </div>
          </section>
        </form>
      </>
    )
  }

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
        <button className="primary-button" type="button" onClick={openAddPurchase}>
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
