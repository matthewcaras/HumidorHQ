import { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import {
  createCatalogCigar,
  createPurchase,
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
import {
  buildPurchasePreview,
  decimalStringToCents,
  formatCents,
  formatBasisPoints,
  formatCentsForInput,
  formatSignedCents,
  parseMoneyCents,
  parsePositiveWholeNumber,
  type PurchasePreview,
  type LinePreview,
} from '../utils/purchaseAllocations'

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
                    : normalizeMoneyInput(String(action.catalogCigar.msrp)),
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

function previewValue(cents: number | null) {
  return cents === null ? '-' : formatCents(cents)
}

function signedPreviewValue(cents: number | null) {
  return formatSignedCents(cents)
}

function trueCostDisplay(line: LinePreview) {
  if (!line.trueCostPerCigar) {
    return '-'
  }

  return formatCents(decimalStringToCents(line.trueCostPerCigar))
}

function normalizeMoneyInput(value: string) {
  if (value.trim() === '') {
    return value
  }

  try {
    return formatCentsForInput(parseMoneyCents(value, 'Amount'))
  } catch {
    return value
  }
}

type PurchaseSubmissionField =
  | 'vendor'
  | 'purchaseDate'
  | 'invoiceNumber'
  | 'shipping'
  | 'exciseTax'
  | 'salesTax'
  | 'discount'
  | 'totalPaid'

type PurchaseLineSubmissionErrors = {
  catalogCigar?: string
  quantity?: string
  unitPrice?: string
  msrpPerCigar?: string
  previewErrors?: string[]
}

type PurchaseSubmissionValidation = {
  fieldErrors: Partial<Record<PurchaseSubmissionField, string>>
  lineErrors: Record<string, PurchaseLineSubmissionErrors>
  summaryErrors: string[]
  reconciliationErrors: string[]
  isValid: boolean
}

function isValidCalendarDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false
  }

  const date = new Date(`${value}T00:00:00Z`)

  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

function uniqueStrings(values: string[]) {
  return [...new Set(values)]
}

function validatePurchaseSubmission(
  state: PurchaseFormState,
  preview: PurchasePreview,
): PurchaseSubmissionValidation {
  const fieldErrors: Partial<Record<PurchaseSubmissionField, string>> = {}
  const lineErrors: Record<string, PurchaseLineSubmissionErrors> = {}

  if (!state.vendor) {
    fieldErrors.vendor = 'Select or create a vendor before saving.'
  }

  if (!isValidCalendarDate(state.purchaseDate)) {
    fieldErrors.purchaseDate = 'Purchase date must be a valid date.'
  }

  for (const [field, label] of [
    ['shipping', 'Shipping'],
    ['exciseTax', 'Excise Tax'],
    ['salesTax', 'Sales Tax'],
    ['discount', 'Order Discount'],
  ] as const) {
    try {
      parseMoneyCents(state[field], label)
    } catch (error) {
      fieldErrors[field] = error instanceof Error ? error.message : `${label} is invalid.`
    }
  }

  try {
    const totalPaidCents = parseMoneyCents(state.totalPaid, 'Total Paid', false)

    if (totalPaidCents === null) {
      fieldErrors.totalPaid = 'Total Paid is required.'
    }
  } catch (error) {
    fieldErrors.totalPaid = error instanceof Error ? error.message : 'Total Paid is invalid.'
  }

  const catalogCounts = new Map<number, number>()
  for (const line of state.lines) {
    if (line.catalogCigar) {
      catalogCounts.set(line.catalogCigar.id, (catalogCounts.get(line.catalogCigar.id) ?? 0) + 1)
    }
  }

  state.lines.forEach((line, index) => {
    const errors: PurchaseLineSubmissionErrors = {}
    const lineNumber = index + 1

    if (!line.catalogCigar) {
      errors.catalogCigar = 'Select a catalog cigar before saving.'
    } else if ((catalogCounts.get(line.catalogCigar.id) ?? 0) > 1) {
      errors.catalogCigar = 'This cigar appears more than once in the purchase.'
    }

    try {
      parsePositiveWholeNumber(line.quantity, `Line ${lineNumber} quantity`)
    } catch (error) {
      errors.quantity = error instanceof Error ? error.message : 'Quantity is invalid.'
    }

    try {
      const unitPriceCents = parseMoneyCents(line.unitPrice, `Line ${lineNumber} unit price`, false)

      if (unitPriceCents === null) {
        errors.unitPrice = 'Unit Price is required.'
      }
    } catch (error) {
      errors.unitPrice = error instanceof Error ? error.message : 'Unit Price is invalid.'
    }

    if (line.msrpPerCigar.trim().length > 0) {
      try {
        parseMoneyCents(line.msrpPerCigar, `Line ${lineNumber} MSRP`, false)
      } catch (error) {
        errors.msrpPerCigar = error instanceof Error ? error.message : 'MSRP Each is invalid.'
      }
    }

    if (preview.lines[index]?.errors.length) {
      errors.previewErrors = [...preview.lines[index].errors]
    }

    if (Object.keys(errors).length > 0) {
      lineErrors[line.localId] = errors
    }
  })

  const summaryErrors = uniqueStrings([
    ...Object.values(fieldErrors).filter((value): value is string => Boolean(value)),
    ...Object.values(lineErrors).flatMap((errors) =>
      ['catalogCigar', 'quantity', 'unitPrice', 'msrpPerCigar']
        .map((key) => errors[key as keyof PurchaseLineSubmissionErrors])
        .filter((value): value is string => Boolean(value)),
    ),
    ...preview.errors,
  ])

  return {
    fieldErrors,
    lineErrors,
    summaryErrors,
    reconciliationErrors: preview.errors,
    isValid:
      summaryErrors.length === 0 &&
      Object.keys(fieldErrors).length === 0 &&
      Object.keys(lineErrors).length === 0,
  }
}

function classifyServerPurchaseError(message: string) {
  const lower = message.toLowerCase()

  if (lower.includes('invoice') && (lower.includes('duplicate') || lower.includes('already exists'))) {
    return 'invoiceNumber' as const
  }

  if (lower.includes('vendor')) {
    return 'vendor' as const
  }

  if (lower.includes('total') || lower.includes('reconcil')) {
    return 'totalPaid' as const
  }

  return 'summary' as const
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
  const [purchases, setPurchases] = useState<Purchase[]>([])
  const [selectedPurchase, setSelectedPurchase] = useState<Purchase | null>(null)
  const [search, setSearch] = useState('')
  const [submittedSearch, setSubmittedSearch] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isDetailLoading, setIsDetailLoading] = useState(false)
  const [error, setError] = useState('')
  const [isSavingPurchase, setIsSavingPurchase] = useState(false)
  const [saveAttempted, setSaveAttempted] = useState(false)
  const [saveSuccessMessage, setSaveSuccessMessage] = useState('')
  const [saveErrorMessage, setSaveErrorMessage] = useState('')
  const successMessageTimerRef = useRef<number | null>(null)

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
      }
    }

    function handleDocumentKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOrderDiscountInfoPinned(false)
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
    setSaveAttempted(false)
    setSaveErrorMessage('')
    setSaveSuccessMessage('')
    setPageMode('ADD')
  }

  function returnToHistory() {
    if (isSavingPurchase) {
      return
    }

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
    setSaveAttempted(false)
    setSaveErrorMessage('')
    setSaveSuccessMessage('')
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

  function normalizeHeaderMoneyField(field: HeaderField, value: string) {
    dispatchPurchaseForm({
      type: 'SET_HEADER_FIELD',
      field,
      value: normalizeMoneyInput(value),
    })
  }

  function normalizeLineMoneyField(
    localId: string,
    field: keyof Omit<PurchaseFormLine, 'localId' | 'catalogCigar'>,
    value: string,
  ) {
    dispatchPurchaseForm({
      type: 'UPDATE_LINE',
      localId,
      field,
      value: normalizeMoneyInput(value),
    })
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

  async function handleSavePurchase(event?: React.FormEvent<HTMLFormElement>) {
    event?.preventDefault()

    if (isSavingPurchase) {
      return
    }

    setSaveAttempted(true)
    setSaveErrorMessage('')

    if (!purchaseSubmissionValidation.isValid) {
      return
    }

    setIsSavingPurchase(true)

    try {
      const normalizePayloadMoney = (value: string, fieldName: string, required = false) => {
        const cents = parseMoneyCents(value, fieldName, false)

        if (cents === null) {
          if (required) {
            throw new Error(`${fieldName} is required.`)
          }

          return undefined
        }

        return formatCentsForInput(cents)
      }

      const createdPurchase = await createPurchase({
        vendorId: purchaseForm.vendor!.id,
        purchaseDate: purchaseForm.purchaseDate,
        invoiceNumber: purchaseForm.invoiceNumber.trim() || undefined,
        shipping: normalizePayloadMoney(purchaseForm.shipping, 'Shipping') ?? undefined,
        exciseTax: normalizePayloadMoney(purchaseForm.exciseTax, 'Excise Tax') ?? undefined,
        salesTax: normalizePayloadMoney(purchaseForm.salesTax, 'Sales Tax') ?? undefined,
        discount: normalizePayloadMoney(purchaseForm.discount, 'Order Discount') ?? undefined,
        totalPaid: normalizePayloadMoney(purchaseForm.totalPaid, 'Total Paid', true)!,
        notes: purchaseForm.notes.trim() || undefined,
        lines: purchaseForm.lines.map((line) => ({
          catalogCigarId: line.catalogCigar!.id,
          quantity: parsePositiveWholeNumber(line.quantity, 'Quantity'),
          unitPrice: normalizePayloadMoney(line.unitPrice, 'Unit Price', true)!,
          msrpPerCigar:
            line.msrpPerCigar.trim().length > 0
              ? normalizePayloadMoney(line.msrpPerCigar, 'MSRP Each', true)
              : undefined,
        })),
      })

      setPurchases((current) => [createdPurchase, ...current.filter((purchase) => purchase.id !== createdPurchase.id)])
      dispatchPurchaseForm({ type: 'RESET_FORM' })
      setPageMode('HISTORY')
      setSearch('')
      setSubmittedSearch('')
      setSelectedPurchase(null)
      setSaveAttempted(false)
      setSaveSuccessMessage('Purchase saved successfully.')
      void loadPurchases('')
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : 'Unable to save purchase.'
      setSaveErrorMessage(message)
    } finally {
      setIsSavingPurchase(false)
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
    isOrderDiscountInfoPinned
  const purchasePreview = useMemo(
    () =>
      buildPurchasePreview({
        shipping: purchaseForm.shipping,
        exciseTax: purchaseForm.exciseTax,
        salesTax: purchaseForm.salesTax,
        discount: purchaseForm.discount,
        totalPaid: purchaseForm.totalPaid,
        lines: purchaseForm.lines.map((line, index) => ({
          lineNumber: index + 1,
          cigarName: line.catalogCigar ? catalogCigarName(line.catalogCigar) : undefined,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          msrpPerCigar: line.msrpPerCigar,
        })),
      }),
    [purchaseForm],
  )
  const purchaseSubmissionValidation = useMemo(
    () => validatePurchaseSubmission(purchaseForm, purchasePreview),
    [purchaseForm, purchasePreview],
  )
  const purchaseSubmissionSummaryErrors = uniqueStrings([
    ...purchaseSubmissionValidation.summaryErrors,
    ...(saveErrorMessage ? [saveErrorMessage] : []),
  ])
  const saveErrorField = saveErrorMessage ? classifyServerPurchaseError(saveErrorMessage) : null
  const visibleFieldErrors: Partial<Record<PurchaseSubmissionField, string>> = saveAttempted
    ? purchaseSubmissionValidation.fieldErrors
    : {}
  const visibleLineErrors: Record<string, PurchaseLineSubmissionErrors> = saveAttempted
    ? purchaseSubmissionValidation.lineErrors
    : {}
  const visibleReconciliationErrors: string[] = saveAttempted
    ? purchaseSubmissionValidation.reconciliationErrors
    : []
  const canSubmitPurchase = purchaseSubmissionValidation.isValid && !isSavingPurchase
  const savePurchaseButtonLabel = isSavingPurchase ? 'Saving...' : 'Save Purchase'
  const savePurchaseButtonTitle = isSavingPurchase
    ? 'Saving purchase...'
    : purchaseSubmissionValidation.isValid
      ? 'Save this purchase.'
      : 'Complete the vendor, line items, and balanced invoice before saving.'

  useEffect(() => {
    if (saveErrorMessage) {
      setSaveErrorMessage('')
    }
  }, [purchaseForm])

  useEffect(() => {
    if (successMessageTimerRef.current !== null) {
      window.clearTimeout(successMessageTimerRef.current)
      successMessageTimerRef.current = null
    }

    if (!saveSuccessMessage) {
      return
    }

    successMessageTimerRef.current = window.setTimeout(() => {
      setSaveSuccessMessage('')
      successMessageTimerRef.current = null
    }, 3000)

    return () => {
      if (successMessageTimerRef.current !== null) {
        window.clearTimeout(successMessageTimerRef.current)
        successMessageTimerRef.current = null
      }
    }
  }, [saveSuccessMessage])

  if (pageMode === 'ADD') {
    return (
      <>
        <header className="page-header purchase-form-header">
          <div className="page-header-copy">
            <h2>Add Purchase</h2>
            <p className="page-subtitle">
              Record one purchase with one or more cigar lines.
            </p>
          </div>
          <div className="page-header-actions">
            <button
              className="secondary-button"
              disabled={isSavingPurchase}
              title={isSavingPurchase ? 'Wait for the current save to finish.' : undefined}
              type="button"
              onClick={returnToHistory}
            >
              Back to Purchases
            </button>
            <button
              className="primary-button"
              disabled={!canSubmitPurchase}
              title={savePurchaseButtonTitle}
              type="button"
              onClick={() => void handleSavePurchase()}
            >
              {savePurchaseButtonLabel}
            </button>
          </div>
        </header>

        <form className="purchase-form" onSubmit={handleSavePurchase}>
          {saveAttempted && purchaseSubmissionSummaryErrors.length > 0 && (
            <div className="purchase-form-error-summary" role="alert">
              <p className="error-text">Please fix the following before saving:</p>
              <ul>
                {purchaseSubmissionSummaryErrors.map((message) => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
            </div>
          )}
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
                {visibleFieldErrors.vendor && (
                  <p className="error-text vendor-field-error">{visibleFieldErrors.vendor}</p>
                )}
                {saveErrorField === 'vendor' && saveErrorMessage && (
                  <p className="error-text vendor-field-error">{saveErrorMessage}</p>
                )}
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
                {visibleFieldErrors.purchaseDate && (
                  <p className="error-text line-field-message">{visibleFieldErrors.purchaseDate}</p>
                )}
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
                {visibleFieldErrors.invoiceNumber && (
                  <p className="error-text line-field-message">{visibleFieldErrors.invoiceNumber}</p>
                )}
                {saveErrorField === 'invoiceNumber' && saveErrorMessage && (
                  <p className="error-text line-field-message">{saveErrorMessage}</p>
                )}
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
              <p className="muted">Review calculated invoice totals before final submission.</p>
            </div>

            <div className="purchase-money-grid">
              <label>
                Shipping
                <span className="money-input">
                  <span aria-hidden="true">$</span>
                  <input
                    value={purchaseForm.shipping}
                    inputMode="decimal"
                    onBlur={(event) => normalizeHeaderMoneyField('shipping', event.target.value)}
                    onChange={(event) =>
                      dispatchPurchaseForm({
                        type: 'SET_HEADER_FIELD',
                        field: 'shipping',
                        value: event.target.value,
                      })
                    }
                    placeholder="0.00"
                  />
                </span>
                {visibleFieldErrors.shipping && (
                  <p className="error-text line-field-message">{visibleFieldErrors.shipping}</p>
                )}
              </label>
              <label>
                Excise Tax
                <span className="money-input">
                  <span aria-hidden="true">$</span>
                  <input
                    value={purchaseForm.exciseTax}
                    inputMode="decimal"
                    onBlur={(event) => normalizeHeaderMoneyField('exciseTax', event.target.value)}
                    onChange={(event) =>
                      dispatchPurchaseForm({
                        type: 'SET_HEADER_FIELD',
                        field: 'exciseTax',
                        value: event.target.value,
                      })
                    }
                    placeholder="0.00"
                  />
                </span>
                {visibleFieldErrors.exciseTax && (
                  <p className="error-text line-field-message">{visibleFieldErrors.exciseTax}</p>
                )}
              </label>
              <label>
                Sales Tax
                <span className="money-input">
                  <span aria-hidden="true">$</span>
                  <input
                    value={purchaseForm.salesTax}
                    inputMode="decimal"
                    onBlur={(event) => normalizeHeaderMoneyField('salesTax', event.target.value)}
                    onChange={(event) =>
                      dispatchPurchaseForm({
                        type: 'SET_HEADER_FIELD',
                        field: 'salesTax',
                        value: event.target.value,
                      })
                    }
                    placeholder="0.00"
                  />
                </span>
                {visibleFieldErrors.salesTax && (
                  <p className="error-text line-field-message">{visibleFieldErrors.salesTax}</p>
                )}
              </label>
              <label className="order-discount-field">
                <span className="field-label-row">
                  <span>Order Discount</span>
              <span className="info-popover-control" ref={orderDiscountInfoRef}>
                <button
                      aria-describedby="order-discount-info-popover"
                      aria-expanded={isOrderDiscountInfoOpen}
                      aria-label="About Order Discount"
                      className="info-button"
                      tabIndex={-1}
                      type="button"
                      onClick={() => {
                        setIsOrderDiscountInfoPinned((current) => !current)
                      }}
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
                <span className="money-input">
                  <span aria-hidden="true">$</span>
                  <input
                    value={purchaseForm.discount}
                    inputMode="decimal"
                    onBlur={(event) => normalizeHeaderMoneyField('discount', event.target.value)}
                    onChange={(event) =>
                      dispatchPurchaseForm({
                        type: 'SET_HEADER_FIELD',
                        field: 'discount',
                        value: event.target.value,
                      })
                    }
                    placeholder="0.00"
                  />
                </span>
                {visibleFieldErrors.discount && (
                  <p className="error-text line-field-message">{visibleFieldErrors.discount}</p>
                )}
              </label>
              <label>
                Total Paid
                <span className="money-input">
                  <span aria-hidden="true">$</span>
                  <input
                    value={purchaseForm.totalPaid}
                    inputMode="decimal"
                    onBlur={(event) => normalizeHeaderMoneyField('totalPaid', event.target.value)}
                    onChange={(event) =>
                      dispatchPurchaseForm({
                        type: 'SET_HEADER_FIELD',
                        field: 'totalPaid',
                        value: event.target.value,
                      })
                    }
                    placeholder="0.00"
                  />
                </span>
                {visibleFieldErrors.totalPaid && (
                  <p className="error-text line-field-message">{visibleFieldErrors.totalPaid}</p>
                )}
                {saveErrorField === 'totalPaid' && saveErrorMessage && (
                  <p className="error-text line-field-message">{saveErrorMessage}</p>
                )}
              </label>
            </div>

            <div className="accounting-summary">
              <div className="accounting-summary-grid">
                <div>
                  <p>Cigar Subtotal</p>
                  <strong>{formatCents(purchasePreview.purchaseSubtotalCents)}</strong>
                </div>
                <div>
                  <p>Shipping</p>
                  <strong>{formatCents(purchasePreview.shippingCents)}</strong>
                </div>
                <div>
                  <p>Excise Tax</p>
                  <strong>{formatCents(purchasePreview.exciseTaxCents)}</strong>
                </div>
                <div>
                  <p>Sales Tax</p>
                  <strong>{formatCents(purchasePreview.salesTaxCents)}</strong>
                </div>
                <div>
                  <p>Order Discount</p>
                  <strong>{formatCents(-purchasePreview.discountCents)}</strong>
                </div>
                <div>
                  <p>Calculated Invoice Total</p>
                  <strong>{formatCents(purchasePreview.calculatedInvoiceTotalCents)}</strong>
                </div>
                <div>
                  <p>Entered Total Paid</p>
                  <strong>{previewValue(purchasePreview.totalPaidCents)}</strong>
                </div>
                <div>
                  <p>Difference</p>
                  <strong>{signedPreviewValue(purchasePreview.differenceCents)}</strong>
                </div>
              </div>

              <div className="reconciliation-status">
                {purchasePreview.totalPaidCents === null && (
                  <p className="muted">Enter Total Paid to check invoice reconciliation.</p>
                )}
                {purchasePreview.totalPaidCents !== null && purchasePreview.isBalanced && (
                  <p className="balanced-text">Balanced</p>
                )}
                {purchasePreview.totalPaidCents !== null &&
                  !purchasePreview.isBalanced &&
                  purchasePreview.differenceCents !== null && (
                    <p className="warning-text">
                      Difference: {signedPreviewValue(purchasePreview.differenceCents)}
                    </p>
                  )}
                {saveAttempted && visibleReconciliationErrors.length > 0 && (
                  <div className="preview-errors">
                    {visibleReconciliationErrors.map((previewError) => (
                      <p className="error-text" key={previewError}>
                        {previewError}
                      </p>
                    ))}
                  </div>
                )}
                {saveErrorField === 'totalPaid' && saveErrorMessage && (
                  <p className="error-text">{saveErrorMessage}</p>
                )}
              </div>
            </div>
          </section>

          <section className="panel purchase-form-section">
            <div className="panel-header-row purchase-lines-heading">
              <div className="section-heading">
                <h3>Purchase Lines</h3>
                <p className="muted">
                  Add one line for each cigar you purchased. Catalog selection arrives in the
                  next stage.
                </p>
              </div>
            </div>

            <div className="purchase-lines-grid" role="list">
              {purchaseForm.lines.map((line, index) => {
                const linePreview = purchasePreview.lines[index]

                return (
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
                  {visibleLineErrors[line.localId]?.catalogCigar && (
                    <p className="error-text line-field-message">
                      {visibleLineErrors[line.localId]?.catalogCigar}
                    </p>
                  )}
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
                  <div className="line-entry-fields">
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
                      {visibleLineErrors[line.localId]?.quantity && (
                        <p className="error-text line-field-message">
                          {visibleLineErrors[line.localId]?.quantity}
                        </p>
                      )}
                    </label>
                    <label>
                      Unit Price
                      <span className="money-input">
                        <span aria-hidden="true">$</span>
                        <input
                          value={line.unitPrice}
                          inputMode="decimal"
                          onBlur={(event) =>
                            normalizeLineMoneyField(line.localId, 'unitPrice', event.target.value)
                          }
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
                      </span>
                      {visibleLineErrors[line.localId]?.unitPrice && (
                        <p className="error-text line-field-message">
                          {visibleLineErrors[line.localId]?.unitPrice}
                        </p>
                      )}
                    </label>
                    <label>
                      MSRP Each
                      <span className="money-input">
                        <span aria-hidden="true">$</span>
                        <input
                          value={line.msrpPerCigar}
                          inputMode="decimal"
                          onBlur={(event) =>
                            normalizeLineMoneyField(
                              line.localId,
                              'msrpPerCigar',
                              event.target.value,
                            )
                          }
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
                      </span>
                      {visibleLineErrors[line.localId]?.msrpPerCigar && (
                        <p className="error-text line-field-message">
                          {visibleLineErrors[line.localId]?.msrpPerCigar}
                        </p>
                      )}
                    </label>
                  </div>
                  {linePreview && (
                    <div className="line-accounting-preview">
                      <div>
                        <p>Line Subtotal</p>
                        <strong>{previewValue(linePreview.lineSubtotalCents)}</strong>
                      </div>
                      <div>
                        <p>True Line Cost Basis</p>
                        <strong>{previewValue(linePreview.trueLineCostBasisCents)}</strong>
                      </div>
                      <div>
                        <p>True Cost Per Cigar</p>
                        <strong>{trueCostDisplay(linePreview)}</strong>
                      </div>
                      <div>
                        <p>MSRP Per Cigar</p>
                        <strong>{previewValue(linePreview.msrpPerCigarCents)}</strong>
                      </div>
                      <div>
                        <p>Savings Per Cigar</p>
                        <strong>{previewValue(linePreview.savingsPerCigarCents)}</strong>
                      </div>
                      <div>
                        <p>Savings Percentage</p>
                        <strong>
                          {formatBasisPoints(linePreview.savingsPercentageBasisPoints)}
                        </strong>
                      </div>
                    </div>
                  )}
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
                )
              })}
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

          <div className="purchase-form-footer-actions">
            <button
              className="secondary-button"
              disabled={isSavingPurchase}
              title={isSavingPurchase ? 'Wait for the current save to finish.' : undefined}
              type="button"
              onClick={returnToHistory}
            >
              Back to Purchases
            </button>
            <button
              className="primary-button"
              disabled={!canSubmitPurchase}
              title={savePurchaseButtonTitle}
              type="button"
              onClick={() => void handleSavePurchase()}
            >
              {savePurchaseButtonLabel}
            </button>
          </div>
        </form>
      </>
    )
  }

    return (
    <>
      <header className="page-header">
        <div className="page-header-copy">
          <h2>Purchases</h2>
          <p className="page-subtitle">
            Track vendor history, purchase costs, and line-level receiving.
          </p>
        </div>
        <button className="primary-button" type="button" onClick={openAddPurchase}>
          + Add Purchase
        </button>
      </header>

      {saveSuccessMessage && (
        <p className="purchase-save-message" role="status">
          {saveSuccessMessage}
        </p>
      )}

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
                    {/* TODO: Add Edit after Receive & Store locking rules are defined. TODO: Add line-level Receive & Store in a later stage. */}
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
                        {/* TODO: Add Edit after Receive & Store locking rules are defined. TODO: Add line-level Receive & Store in a later stage. */}
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
                  {/* TODO: Add Edit after Receive & Store locking rules are defined. TODO: Add line-level Receive & Store in a later stage. */}
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
