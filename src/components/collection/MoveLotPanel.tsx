import { useEffect, useMemo, useState, type FormEvent } from 'react'
import type {
  CatalogCigar,
  CollectionLotLocation,
  CollectionLotSummary,
  Humidor,
  MoveLotResult,
  StorageSubLocation,
} from '../../services/api'
import { getHumidors, moveLot } from '../../services/api'

const nameCollator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: 'base',
})

function todayLocalDate() {
  const date = new Date()
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

function sortHumidorsByName(a: Humidor, b: Humidor) {
  const nameCompare = nameCollator.compare(a.name, b.name)

  return nameCompare === 0 ? a.id - b.id : nameCompare
}

function sortSubLocations(a: StorageSubLocation, b: StorageSubLocation) {
  if (a.displayOrder !== b.displayOrder) {
    return a.displayOrder - b.displayOrder
  }

  const nameCompare = nameCollator.compare(a.name, b.name)

  return nameCompare === 0 ? a.id - b.id : nameCompare
}

function parseQuantity(value: string) {
  const trimmed = value.trim()

  if (!/^\d+$/.test(trimmed)) {
    return null
  }

  const parsed = Number(trimmed)

  return Number.isSafeInteger(parsed) ? parsed : null
}

type MoveLotPanelProps = {
  cigar: CatalogCigar
  lot: CollectionLotSummary
  placement: CollectionLotLocation
  onClose: () => void
  onSuccess: (result: MoveLotResult) => void | Promise<void>
}

export function MoveLotPanel({
  cigar,
  lot,
  placement,
  onClose,
  onSuccess,
}: MoveLotPanelProps) {
  const [humidors, setHumidors] = useState<Humidor[]>([])
  const [isLoadingDestinations, setIsLoadingDestinations] = useState(true)
  const [destinationError, setDestinationError] = useState('')
  const [selectedHumidorId, setSelectedHumidorId] = useState('')
  const [selectedSubLocationId, setSelectedSubLocationId] = useState('')
  const [quantity, setQuantity] = useState(String(placement.quantity))
  const [eventDate, setEventDate] = useState(todayLocalDate())
  const [notes, setNotes] = useState('')
  const [submitAttempted, setSubmitAttempted] = useState(false)
  const [serverError, setServerError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const today = useMemo(() => todayLocalDate(), [])
  const quantityValue = parseQuantity(quantity)
  const selectedHumidor = humidors.find((humidor) => String(humidor.id) === selectedHumidorId)
  const eligibleSubLocations = useMemo(() => {
    if (!selectedHumidor) {
      return []
    }

    return selectedHumidor.subLocations
      .filter((subLocation) => (
        subLocation.isActive && subLocation.id !== placement.storageSubLocationId
      ))
      .sort(sortSubLocations)
  }, [placement.storageSubLocationId, selectedHumidor])

  const selectedSubLocation = eligibleSubLocations.find(
    (subLocation) => String(subLocation.id) === selectedSubLocationId,
  )
  const quantityError = (() => {
    if (quantity.trim() === '') {
      return 'Quantity is required.'
    }

    if (quantityValue === null) {
      return 'Enter a whole-number quantity.'
    }

    if (quantityValue < 1) {
      return 'Quantity must be at least 1.'
    }

    if (quantityValue > placement.quantity) {
      return `Only ${placement.quantity} cigars are available in this section.`
    }

    return ''
  })()
  const dateError = !eventDate
    ? 'Move Date is required.'
    : eventDate > today
      ? 'Move Date cannot be in the future.'
      : ''
  const destinationErrorMessage = selectedSubLocationId
    ? ''
    : 'Choose a destination section.'
  const canSubmit =
    !isSubmitting &&
    !isLoadingDestinations &&
    !destinationError &&
    !quantityError &&
    !dateError &&
    selectedSubLocation !== undefined

  useEffect(() => {
    let isActive = true

    async function loadDestinations() {
      setIsLoadingDestinations(true)
      setDestinationError('')

      try {
        const data = await getHumidors()

        if (!isActive) {
          return
        }

        setHumidors([...data].sort(sortHumidorsByName))
      } catch (error) {
        if (isActive) {
          setDestinationError(
            error instanceof Error
              ? error.message
              : 'Unable to load destination humidors.',
          )
        }
      } finally {
        if (isActive) {
          setIsLoadingDestinations(false)
        }
      }
    }

    void loadDestinations()

    return () => {
      isActive = false
    }
  }, [])

  useEffect(() => {
    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key !== 'Escape') {
        return
      }

      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()
      onClose()
    }

    document.addEventListener('keydown', handleKeyDown, true)

    return () => {
      document.removeEventListener('keydown', handleKeyDown, true)
    }
  }, [onClose])

  useEffect(() => {
    if (!selectedHumidor) {
      return
    }

    if (eligibleSubLocations.length === 1) {
      setSelectedSubLocationId(String(eligibleSubLocations[0].id))
      return
    }

    if (
      selectedSubLocationId &&
      !eligibleSubLocations.some((subLocation) => String(subLocation.id) === selectedSubLocationId)
    ) {
      setSelectedSubLocationId('')
    }
  }, [eligibleSubLocations, selectedHumidor, selectedSubLocationId])

  function handleHumidorChange(value: string) {
    setSelectedHumidorId(value)
    setSelectedSubLocationId('')
    setServerError('')
  }

  function stepQuantity(delta: number) {
    if (quantityValue === null) {
      return
    }

    const nextQuantity = quantityValue + delta

    if (nextQuantity < 1 || nextQuantity > placement.quantity) {
      return
    }

    setQuantity(String(nextQuantity))
    setServerError('')
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitAttempted(true)
    setServerError('')

    if (!canSubmit || quantityValue === null || !selectedSubLocation) {
      return
    }

    setIsSubmitting(true)

    try {
      const result = await moveLot(lot.lotId, {
        fromStorageSubLocationId: placement.storageSubLocationId,
        toStorageSubLocationId: selectedSubLocation.id,
        quantity: quantityValue,
        eventDate,
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      })

      await onSuccess(result)
    } catch (error) {
      setServerError(
        error instanceof Error
          ? error.message
          : 'The Move request could not be completed.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div
      className="modal-backdrop move-panel-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose()
        }
      }}
    >
      <section
        className="modal move-panel-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="move-panel-title"
      >
        <div className="modal-header move-panel-header">
          <div>
            <p className="modal-kicker">Move Cigars</p>
            <h3 id="move-panel-title">
              {cigar.manufacturer}
            </h3>
            <span>
              {cigar.series} - {cigar.vitola}
            </span>
          </div>
          <button
            className="icon-button"
            type="button"
            aria-label="Close Move"
            disabled={isSubmitting}
            onClick={onClose}
          >
            &times;
          </button>
        </div>

        <form className="move-panel-content" onSubmit={handleSubmit}>
          <section className="move-context-grid" aria-label="Move context">
            <div className="move-context-card">
              <span>Lot</span>
              <strong>#{lot.lotId}</strong>
              <small>{lot.currentQuantity ?? 0} currently owned in this Lot</small>
            </div>
            <div className="move-context-card">
              <span>Source</span>
              <strong>{placement.storageLocationName}</strong>
              <small>
                {placement.storageSubLocationName} - {placement.quantity} available
              </small>
            </div>
          </section>

          {destinationError ? <p className="error-text">{destinationError}</p> : null}
          {serverError ? <p className="error-text move-panel-server-error">{serverError}</p> : null}

          <div className="move-form-grid">
            <label>
              <span>Quantity</span>
              <div className="move-quantity-control">
                <button
                  type="button"
                  disabled={isSubmitting || quantityValue === null || quantityValue <= 1}
                  onClick={() => stepQuantity(-1)}
                  aria-label="Decrease move quantity"
                >
                  -
                </button>
                <input
                  type="text"
                  inputMode="numeric"
                  value={quantity}
                  onChange={(event) => {
                    setQuantity(event.target.value)
                    setServerError('')
                  }}
                  aria-invalid={submitAttempted && Boolean(quantityError)}
                />
                <button
                  type="button"
                  disabled={
                    isSubmitting ||
                    quantityValue === null ||
                    quantityValue >= placement.quantity
                  }
                  onClick={() => stepQuantity(1)}
                  aria-label="Increase move quantity"
                >
                  +
                </button>
              </div>
              {submitAttempted && quantityError ? (
                <small className="field-error">{quantityError}</small>
              ) : null}
            </label>

            <label>
              <span>Move Date</span>
              <input
                type="date"
                value={eventDate}
                max={today}
                onChange={(event) => {
                  setEventDate(event.target.value)
                  setServerError('')
                }}
                aria-invalid={submitAttempted && Boolean(dateError)}
              />
              {submitAttempted && dateError ? (
                <small className="field-error">{dateError}</small>
              ) : null}
            </label>

            <label>
              <span>Destination Humidor</span>
              <select
                value={selectedHumidorId}
                disabled={isLoadingDestinations || isSubmitting}
                onChange={(event) => handleHumidorChange(event.target.value)}
              >
                <option value="">
                  {isLoadingDestinations ? 'Loading humidors...' : 'Select humidor'}
                </option>
                {humidors.map((humidor) => (
                  <option key={humidor.id} value={humidor.id}>
                    {humidor.name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>Destination Section</span>
              <select
                value={selectedSubLocationId}
                disabled={!selectedHumidor || isLoadingDestinations || isSubmitting}
                onChange={(event) => {
                  setSelectedSubLocationId(event.target.value)
                  setServerError('')
                }}
                aria-invalid={submitAttempted && Boolean(destinationErrorMessage)}
              >
                <option value="">
                  {selectedHumidor
                    ? eligibleSubLocations.length > 0
                      ? 'Select section'
                      : 'No eligible sections'
                    : 'Select humidor first'}
                </option>
                {eligibleSubLocations.map((subLocation) => (
                  <option key={subLocation.id} value={subLocation.id}>
                    {subLocation.name}
                  </option>
                ))}
              </select>
              {submitAttempted && destinationErrorMessage ? (
                <small className="field-error">{destinationErrorMessage}</small>
              ) : null}
            </label>

            <label className="move-notes-field">
              <span>Notes</span>
              <textarea
                rows={3}
                value={notes}
                disabled={isSubmitting}
                onChange={(event) => {
                  setNotes(event.target.value)
                  setServerError('')
                }}
                placeholder="Optional"
              />
            </label>
          </div>

          <div className="form-actions move-panel-actions">
            <button
              type="button"
              className="secondary-button"
              disabled={isSubmitting}
              onClick={onClose}
            >
              Cancel
            </button>
            <button type="submit" disabled={!canSubmit}>
              {isSubmitting ? 'Moving...' : 'Move Cigars'}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}
