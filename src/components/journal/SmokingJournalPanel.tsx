import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react'
import {
  deleteSmokingJournal,
  getSmokingJournal,
  type SmokingJournalResponse,
  upsertSmokingJournal,
} from '../../services/api'
import {
  formatReportsDate,
  formatReportsMoney,
  reportsPluralize,
} from '../reports/reportsFormatters'

type SmokingJournalPanelProps = {
  inventoryEventId: number
  onClose: () => void
  onSaved?: (response: SmokingJournalResponse) => void
  onDeleted?: (response: SmokingJournalResponse) => void
}

type SavedSnapshot = {
  rating: number | null
  notes: string
}

const RATINGS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
const MAX_NOTES_LENGTH = 2000

function savedSnapshot(response: SmokingJournalResponse | null): SavedSnapshot {
  return {
    rating: response?.journalEntry?.rating ?? null,
    notes: response?.journalEntry?.notes ?? '',
  }
}

function cigarTitle(response: SmokingJournalResponse) {
  const cigar = response.inventoryEvent.catalogCigar

  return cigar ? cigar.manufacturer : 'Catalog unavailable'
}

function cigarDetails(response: SmokingJournalResponse) {
  const cigar = response.inventoryEvent.catalogCigar

  if (!cigar) {
    return ''
  }

  return [cigar.series, cigar.vitola, cigar.wrapper].filter(Boolean).join(' - ')
}

function sourceLocationText(response: SmokingJournalResponse) {
  const source = response.inventoryEvent.sourceLocation

  if (!source) {
    return 'Unknown location'
  }

  return `${source.storageLocationName} / ${source.storageSubLocationName}`
}

function eventQuantityText(quantity: number) {
  return `${quantity} ${reportsPluralize(quantity, 'cigar')}`
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

export function SmokingJournalPanel({
  inventoryEventId,
  onClose,
  onSaved,
  onDeleted,
}: SmokingJournalPanelProps) {
  const [response, setResponse] = useState<SmokingJournalResponse | null>(null)
  const [rating, setRating] = useState<number | null>(null)
  const [notes, setNotes] = useState('')
  const [saved, setSaved] = useState<SavedSnapshot>({ rating: null, notes: '' })
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [actionError, setActionError] = useState('')
  const [statusMessage, setStatusMessage] = useState('')
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false)
  const [showDiscardConfirmation, setShowDiscardConfirmation] = useState(false)
  const requestSequenceRef = useRef(0)
  const mutationInFlightRef = useRef(false)
  const panelRef = useRef<HTMLElement | null>(null)
  const priorFocusRef = useRef<HTMLElement | null>(null)

  const hasJournalEntry = response?.journalEntry !== null && response !== null
  const isMutationPending = isSaving || isDeleting
  const isPending = isLoading || isSaving || isDeleting
  const isDirty = useMemo(
    () => rating !== saved.rating || notes !== saved.notes,
    [notes, rating, saved],
  )
  const canSave =
    !isPending &&
    rating !== null &&
    (!hasJournalEntry || isDirty) &&
    notes.length <= MAX_NOTES_LENGTH
  const notesRemaining = MAX_NOTES_LENGTH - notes.length

  const loadJournal = useCallback(async () => {
    const sequence = requestSequenceRef.current + 1
    requestSequenceRef.current = sequence

    setIsLoading(true)
    setLoadError('')
    setActionError('')
    setStatusMessage('')
    setShowDeleteConfirmation(false)
    setShowDiscardConfirmation(false)

    try {
      const data = await getSmokingJournal(inventoryEventId)

      if (requestSequenceRef.current !== sequence) {
        return
      }

      const nextSaved = savedSnapshot(data)
      setResponse(data)
      setRating(nextSaved.rating)
      setNotes(nextSaved.notes)
      setSaved(nextSaved)
    } catch (error) {
      if (requestSequenceRef.current === sequence) {
        setLoadError(errorMessage(error, 'Unable to load Smoking Journal.'))
      }
    } finally {
      if (requestSequenceRef.current === sequence) {
        setIsLoading(false)
      }
    }
  }, [inventoryEventId])

  useEffect(() => {
    priorFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    window.setTimeout(() => panelRef.current?.focus(), 0)

    return () => {
      requestSequenceRef.current += 1
      priorFocusRef.current?.focus()
    }
  }, [])

  useEffect(() => {
    void loadJournal()
  }, [loadJournal])

  function closeOrConfirm() {
    if (isMutationPending) {
      return
    }

    if (isDirty) {
      setShowDeleteConfirmation(false)
      setShowDiscardConfirmation(true)
      return
    }

    onClose()
  }

  useEffect(() => {
    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key !== 'Escape') {
        return
      }

      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()

      if (showDeleteConfirmation) {
        setShowDeleteConfirmation(false)
        return
      }

      if (showDiscardConfirmation) {
        setShowDiscardConfirmation(false)
        return
      }

      closeOrConfirm()
    }

    document.addEventListener('keydown', handleKeyDown, true)

    return () => {
      document.removeEventListener('keydown', handleKeyDown, true)
    }
  }, [isDirty, isMutationPending, showDeleteConfirmation, showDiscardConfirmation])

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!canSave || rating === null || mutationInFlightRef.current) {
      return
    }

    const wasExistingEntry = response !== null && response.journalEntry !== null
    mutationInFlightRef.current = true
    const sequence = requestSequenceRef.current + 1
    requestSequenceRef.current = sequence
    setIsSaving(true)
    setActionError('')
    setStatusMessage('')
    setShowDeleteConfirmation(false)
    setShowDiscardConfirmation(false)

    try {
      const data = await upsertSmokingJournal(inventoryEventId, {
        rating,
        notes: notes.trim(),
      })

      if (requestSequenceRef.current !== sequence) {
        return
      }

      const nextSaved = savedSnapshot(data)
      setResponse(data)
      setRating(nextSaved.rating)
      setNotes(nextSaved.notes)
      setSaved(nextSaved)
      onSaved?.(data)

      if (!wasExistingEntry) {
        onClose()
        return
      }

      setStatusMessage('Journal entry updated.')
    } catch (error) {
      if (requestSequenceRef.current === sequence) {
        setActionError(errorMessage(error, 'Unable to save Smoking Journal.'))
      }
    } finally {
      if (requestSequenceRef.current === sequence) {
        setIsSaving(false)
      }
      mutationInFlightRef.current = false
    }
  }

  async function confirmDelete() {
    if (isMutationPending || !response?.journalEntry || mutationInFlightRef.current) {
      return
    }

    mutationInFlightRef.current = true
    const sequence = requestSequenceRef.current + 1
    requestSequenceRef.current = sequence
    setIsDeleting(true)
    setActionError('')
    setStatusMessage('')

    try {
      const data = await deleteSmokingJournal(inventoryEventId)

      if (requestSequenceRef.current !== sequence) {
        return
      }

      const nextSaved = savedSnapshot(data)
      setResponse(data)
      setRating(null)
      setNotes('')
      setSaved(nextSaved)
      setShowDeleteConfirmation(false)
      setStatusMessage('Journal entry deleted.')
      onDeleted?.(data)
    } catch (error) {
      if (requestSequenceRef.current === sequence) {
        setActionError(errorMessage(error, 'Unable to delete Smoking Journal.'))
      }
    } finally {
      if (requestSequenceRef.current === sequence) {
        setIsDeleting(false)
      }
      mutationInFlightRef.current = false
    }
  }

  const title = hasJournalEntry ? 'Smoking Journal Entry' : 'Add Smoking Journal Entry'
  const saveLabel = hasJournalEntry ? 'Save Changes' : 'Save Journal Entry'
  const pendingSaveLabel = hasJournalEntry ? 'Saving Changes...' : 'Saving Journal Entry...'

  return (
    <div
      className="modal-backdrop smoking-journal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          closeOrConfirm()
        }
      }}
    >
      <section
        ref={panelRef}
        className="modal smoking-journal-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="smoking-journal-title"
        tabIndex={-1}
      >
        <div className="modal-header smoking-journal-header">
          <div>
            <p className="modal-kicker">Smoking Journal</p>
            <h3 id="smoking-journal-title">{title}</h3>
          </div>
          <button
            className="icon-button"
            type="button"
            aria-label="Close Smoking Journal"
            disabled={isMutationPending}
            onClick={closeOrConfirm}
          >
            &times;
          </button>
        </div>

        {isLoading ? (
          <section className="smoking-journal-loading" aria-live="polite">
            <p>Loading Smoking Journal...</p>
          </section>
        ) : null}

        {loadError ? (
          <section className="smoking-journal-alert smoking-journal-alert-error" role="alert">
            <strong>Smoking Journal could not be loaded.</strong>
            <p>{loadError}</p>
            <button className="secondary-button" type="button" onClick={() => void loadJournal()}>
              Retry
            </button>
          </section>
        ) : null}

        {!isLoading && !loadError && response ? (
          <form className="smoking-journal-content" onSubmit={handleSave}>
            {statusMessage ? (
              <p className="smoking-journal-status" role="status">
                {statusMessage}
              </p>
            ) : null}

            {actionError ? (
              <section className="smoking-journal-alert smoking-journal-alert-error" role="alert">
                <strong>Smoking Journal request failed.</strong>
                <p>{actionError}</p>
              </section>
            ) : null}

            <section className="smoking-journal-context" aria-label="Smoked cigar context">
              <div className="smoking-journal-cigar">
                <span>Cigar</span>
                <strong>{cigarTitle(response)}</strong>
                {cigarDetails(response) ? <small>{cigarDetails(response)}</small> : null}
                {response.inventoryEvent.catalogCigar &&
                !response.inventoryEvent.catalogCigar.isActive ? (
                  <em>Archived Catalog</em>
                ) : null}
              </div>
              <div className="smoking-journal-context-grid">
                <div>
                  <span>Lot</span>
                  <strong>#{response.inventoryEvent.lotId}</strong>
                </div>
                <div>
                  <span>Date Smoked</span>
                  <strong>{formatReportsDate(response.inventoryEvent.eventDate)}</strong>
                </div>
                <div>
                  <span>Quantity</span>
                  <strong>{eventQuantityText(response.inventoryEvent.quantity)}</strong>
                </div>
                <div>
                  <span>Source</span>
                  <strong>{sourceLocationText(response)}</strong>
                  {response.inventoryEvent.sourceLocation?.isArchived ? (
                    <small>Archived source</small>
                  ) : null}
                </div>
                <div>
                  <span>Cost Each</span>
                  <strong>{formatReportsMoney(response.inventoryEvent.costPerCigarAtEvent)}</strong>
                </div>
                <div>
                  <span>MSRP Each</span>
                  <strong>{formatReportsMoney(response.inventoryEvent.msrpPerCigarAtEvent)}</strong>
                </div>
              </div>
            </section>

            <fieldset className="smoking-journal-rating">
              <legend>Rating</legend>
              <p>Select a rating from 1 to 10.</p>
              <div>
                {RATINGS.map((value) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={rating === value}
                    className={rating === value ? 'selected' : undefined}
                    disabled={isPending}
                    onClick={() => {
                      setRating(value)
                      setActionError('')
                      setStatusMessage('')
                    }}
                  >
                    {value}
                  </button>
                ))}
              </div>
            </fieldset>

            <label className="smoking-journal-notes">
              <span>Journal Notes</span>
              <textarea
                rows={5}
                maxLength={MAX_NOTES_LENGTH}
                value={notes}
                disabled={isPending}
                placeholder="What did you think of this cigar?"
                onChange={(event) => {
                  setNotes(event.target.value)
                  setActionError('')
                  setStatusMessage('')
                }}
              />
              <small>{notesRemaining} characters remaining</small>
            </label>

            {showDeleteConfirmation ? (
              <section
                className="smoking-journal-confirmation smoking-journal-confirmation-danger"
                role="alert"
              >
                <strong>Delete Journal Entry?</strong>
                <p>
                  This removes the rating and Journal notes only. The cigar will remain recorded
                  as smoked, and inventory will not be restored.
                </p>
                <div>
                  <button
                    type="button"
                    className="danger-button"
                    disabled={isDeleting}
                    onClick={() => void confirmDelete()}
                  >
                    {isDeleting ? 'Deleting...' : 'Delete Journal Entry'}
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={isDeleting}
                    onClick={() => setShowDeleteConfirmation(false)}
                  >
                    Keep Journal Entry
                  </button>
                </div>
              </section>
            ) : null}

            {showDiscardConfirmation ? (
              <section className="smoking-journal-confirmation" role="alert">
                <strong>Discard unsaved Journal changes?</strong>
                <div>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => setShowDiscardConfirmation(false)}
                  >
                    Keep Editing
                  </button>
                  <button type="button" className="danger-button" onClick={onClose}>
                    Discard Changes
                  </button>
                </div>
              </section>
            ) : null}

            <div className="form-actions smoking-journal-actions">
              {hasJournalEntry ? (
                <button
                  type="button"
                  className="danger-button"
                  disabled={isPending}
                  onClick={() => {
                    setShowDiscardConfirmation(false)
                    setShowDeleteConfirmation(true)
                  }}
                >
                  Delete Journal Entry
                </button>
              ) : (
                <button
                  type="button"
                  className="secondary-button"
                  disabled={isPending}
                  onClick={closeOrConfirm}
                >
                  Not Now
                </button>
              )}
              {hasJournalEntry ? (
                <button
                  type="button"
                  className="secondary-button"
                  disabled={isPending}
                  onClick={closeOrConfirm}
                >
                  Close
                </button>
              ) : null}
              <button type="submit" disabled={!canSave}>
                {isSaving ? pendingSaveLabel : saveLabel}
              </button>
            </div>
          </form>
        ) : null}
      </section>
    </div>
  )
}

export default SmokingJournalPanel
