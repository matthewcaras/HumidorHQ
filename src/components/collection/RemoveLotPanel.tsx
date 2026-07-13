import { useEffect, useMemo, useState, type FormEvent } from 'react'
import type {
  CatalogCigar,
  CollectionLotLocation,
  CollectionLotSummary,
  RemovalType,
  RemoveFromLotResult,
} from '../../services/api'
import { removeFromLot } from '../../services/api'

const REMOVAL_OPTIONS: Array<{
  value: RemovalType
  label: string
  description: string
}> = [
  {
    value: 'SMOKED',
    label: 'Smoked',
    description: 'Record cigars you smoked.',
  },
  {
    value: 'GIFTED',
    label: 'Gifted',
    description: 'Record cigars given or shared.',
  },
  {
    value: 'DISCARDED',
    label: 'Discarded / Damaged',
    description: 'Record cigars removed because of damage or disposal.',
  },
]

function todayLocalDate() {
  const date = new Date()
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

function parseQuantity(value: string) {
  const trimmed = value.trim()

  if (!/^\d+$/.test(trimmed)) {
    return null
  }

  const parsed = Number(trimmed)

  return Number.isSafeInteger(parsed) ? parsed : null
}

function formatMoney(value: string | number | null | undefined) {
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

  return isNegative ? `$(${dollars}.${centsText})` : `$${dollars}.${centsText}`
}

function confirmationLabel(removalType: RemovalType) {
  switch (removalType) {
    case 'GIFTED':
      return 'Record Gifted'
    case 'DISCARDED':
      return 'Record Discarded'
    case 'SMOKED':
    default:
      return 'Record Smoked'
  }
}

function successVerb(removalType: RemovalType) {
  switch (removalType) {
    case 'GIFTED':
      return 'gifted'
    case 'DISCARDED':
      return 'discarded'
    case 'SMOKED':
    default:
      return 'smoked'
  }
}

function notesPlaceholder(removalType: RemovalType) {
  switch (removalType) {
    case 'GIFTED':
      return 'Optional recipient or occasion note'
    case 'DISCARDED':
      return 'Optional reason or damage note'
    case 'SMOKED':
    default:
      return 'Optional tasting or smoking note'
  }
}

function userFacingServerError(message: string) {
  const normalized = message.toLowerCase()

  if (
    normalized.includes('reconcile') ||
    normalized.includes('changed during') ||
    normalized.includes('balance changed') ||
    normalized.includes('quantity changed')
  ) {
    return 'The removal was not completed because the inventory changed or requires review. Close this panel and refresh the cigar details before trying again.'
  }

  return message
}

type RemoveLotPanelProps = {
  cigar: CatalogCigar
  lot: CollectionLotSummary
  placement: CollectionLotLocation
  onClose: () => void
  onSuccess: (result: RemoveFromLotResult, quantity: number) => void | Promise<void>
}

export function RemoveLotPanel({
  cigar,
  lot,
  placement,
  onClose,
  onSuccess,
}: RemoveLotPanelProps) {
  const [removalType, setRemovalType] = useState<RemovalType>('SMOKED')
  const [quantity, setQuantity] = useState('1')
  const [eventDate, setEventDate] = useState(todayLocalDate())
  const [notes, setNotes] = useState('')
  const [submitAttempted, setSubmitAttempted] = useState(false)
  const [serverError, setServerError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const today = useMemo(() => todayLocalDate(), [])
  const quantityValue = parseQuantity(quantity)
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
    ? 'Removal Date is required.'
    : eventDate > today
      ? 'Removal Date cannot be in the future.'
      : ''
  const canSubmit =
    !isSubmitting &&
    REMOVAL_OPTIONS.some((option) => option.value === removalType) &&
    !quantityError &&
    !dateError

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

    if (!canSubmit || quantityValue === null) {
      return
    }

    setIsSubmitting(true)

    try {
      const result = await removeFromLot(lot.lotId, {
        fromStorageSubLocationId: placement.storageSubLocationId,
        quantity: quantityValue,
        removalType,
        eventDate,
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      })

      await onSuccess(result, quantityValue)
    } catch (error) {
      setServerError(
        userFacingServerError(
          error instanceof Error
            ? error.message
            : 'The removal request could not be completed.',
        ),
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div
      className="modal-backdrop removal-panel-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose()
        }
      }}
    >
      <section
        className="modal removal-panel-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="removal-panel-title"
      >
        <div className="modal-header removal-panel-header">
          <div>
            <p className="modal-kicker">Remove Cigars</p>
            <h3 id="removal-panel-title">{cigar.manufacturer}</h3>
            <span>
              {cigar.series} - {cigar.vitola}
            </span>
          </div>
          <button
            className="icon-button"
            type="button"
            aria-label="Close removal"
            disabled={isSubmitting}
            onClick={onClose}
          >
            &times;
          </button>
        </div>

        <form className="removal-panel-content" onSubmit={handleSubmit}>
          <section className="removal-context-grid" aria-label="Removal context">
            <div className="removal-context-card">
              <span>Lot</span>
              <strong>#{lot.lotId}</strong>
              <small>{lot.currentQuantity ?? 0} currently owned in this Lot</small>
            </div>
            <div className="removal-context-card">
              <span>Source</span>
              <strong>{placement.storageLocationName}</strong>
              <small>
                {placement.storageSubLocationName} - {placement.quantity} available
              </small>
            </div>
            <div className="removal-context-card">
              <span>True cost each</span>
              <strong>{formatMoney(lot.costPerCigar)}</strong>
            </div>
            <div className="removal-context-card">
              <span>MSRP each</span>
              <strong>{formatMoney(lot.msrpPerCigar)}</strong>
            </div>
          </section>

          {serverError ? (
            <p className="error-text removal-panel-server-error">{serverError}</p>
          ) : null}

          <fieldset className="removal-type-group">
            <legend>Removal Type</legend>
            <div className="removal-type-options">
              {REMOVAL_OPTIONS.map((option) => (
                <label
                  className={
                    removalType === option.value
                      ? 'removal-type-option selected'
                      : 'removal-type-option'
                  }
                  key={option.value}
                >
                  <input
                    type="radio"
                    name="removalType"
                    value={option.value}
                    checked={removalType === option.value}
                    disabled={isSubmitting}
                    onChange={() => {
                      setRemovalType(option.value)
                      setServerError('')
                    }}
                  />
                  <span>{option.label}</span>
                  <small>{option.description}</small>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="removal-form-grid">
            <label>
              <span>Quantity</span>
              <div className="removal-quantity-control">
                <button
                  type="button"
                  disabled={isSubmitting || quantityValue === null || quantityValue <= 1}
                  onClick={() => stepQuantity(-1)}
                  aria-label="Decrease removal quantity"
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
                  aria-label="Increase removal quantity"
                >
                  +
                </button>
              </div>
              {submitAttempted && quantityError ? (
                <small className="field-error">{quantityError}</small>
              ) : null}
            </label>

            <label>
              <span>Removal Date</span>
              <input
                type="date"
                value={eventDate}
                max={today}
                disabled={isSubmitting}
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

            <label className="removal-notes-field">
              <span>Notes</span>
              <textarea
                rows={3}
                value={notes}
                disabled={isSubmitting}
                onChange={(event) => {
                  setNotes(event.target.value)
                  setServerError('')
                }}
                placeholder={notesPlaceholder(removalType)}
              />
            </label>
          </div>

          <div className="form-actions removal-panel-actions">
            <button
              type="button"
              className="secondary-button"
              disabled={isSubmitting}
              onClick={onClose}
            >
              Cancel
            </button>
            <button type="submit" disabled={!canSubmit}>
              {isSubmitting ? 'Recording...' : confirmationLabel(removalType)}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}

export function removalSuccessMessage(removalType: RemovalType, quantity: number) {
  const noun = quantity === 1 ? 'Cigar' : 'Cigars'
  return `${noun} recorded as ${successVerb(removalType)}.`
}
