import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import {
  type CatalogManagementDetails,
  type CatalogStrength,
  type CatalogWriteInput,
} from '../../services/api'

type CatalogFormMode = 'ADD' | 'EDIT'

type CatalogFormDraft = {
  manufacturer: string
  series: string
  vitola: string
  wrapper: string
  shape: string
  length: string
  ringGauge: string
  strength: '' | CatalogStrength
  binder: string
  filler: string
  country: string
  msrp: string
}

type CatalogFormField = keyof CatalogFormDraft

type CatalogFormErrors = Partial<Record<CatalogFormField, string>>

type CatalogFormPanelProps = {
  mode: CatalogFormMode
  details: CatalogManagementDetails | null
  isLoading: boolean
  loadError: string
  saveError: string
  identityError: string
  isSaving: boolean
  onSave: (input: CatalogWriteInput) => Promise<void>
  onClose: () => void
}

const STRENGTH_OPTIONS: CatalogStrength[] = [
  'Mild',
  'Mild-Medium',
  'Medium',
  'Medium-Full',
  'Full',
]

const blankDraft: CatalogFormDraft = {
  manufacturer: '',
  series: '',
  vitola: '',
  wrapper: '',
  shape: '',
  length: '',
  ringGauge: '',
  strength: '',
  binder: '',
  filler: '',
  country: '',
  msrp: '',
}

function draftFromDetails(details: CatalogManagementDetails): CatalogFormDraft {
  const cigar = details.catalogCigar

  return {
    manufacturer: cigar.manufacturer,
    series: cigar.series,
    vitola: cigar.vitola,
    wrapper: cigar.wrapper ?? '',
    shape: cigar.shape ?? '',
    length: cigar.length === null || cigar.length === undefined ? '' : String(cigar.length),
    ringGauge: cigar.ringGauge === null || cigar.ringGauge === undefined ? '' : String(cigar.ringGauge),
    strength: STRENGTH_OPTIONS.includes(cigar.strength as CatalogStrength)
      ? (cigar.strength as CatalogStrength)
      : '',
    binder: cigar.binder ?? '',
    filler: cigar.filler ?? '',
    country: cigar.country ?? '',
    msrp: cigar.msrp === null || cigar.msrp === undefined ? '' : String(cigar.msrp),
  }
}

function draftSnapshot(draft: CatalogFormDraft) {
  return JSON.stringify(draft)
}

function hasMeaningfulDraftData(draft: CatalogFormDraft) {
  return Object.values(draft).some((value) => value.trim().length > 0)
}

function splitDecimal(value: string) {
  const match = value.match(/^(\d+)(?:\.(\d+))?$/)

  if (!match) {
    return null
  }

  return {
    integer: match[1].replace(/^0+(?=\d)/, '') || '0',
    fraction: (match[2] ?? '').replace(/0+$/, ''),
  }
}

function compareDecimals(left: NonNullable<ReturnType<typeof splitDecimal>>, right: NonNullable<ReturnType<typeof splitDecimal>>) {
  if (left.integer.length !== right.integer.length) {
    return left.integer.length - right.integer.length
  }

  const integerCompare = left.integer.localeCompare(right.integer)
  if (integerCompare !== 0) {
    return integerCompare
  }

  const maxFractionLength = Math.max(left.fraction.length, right.fraction.length)

  return left.fraction
    .padEnd(maxFractionLength, '0')
    .localeCompare(right.fraction.padEnd(maxFractionLength, '0'))
}

function normalizeOptionalText(value: string) {
  const trimmed = value.trim()
  return trimmed.length === 0 ? null : trimmed
}

function validateRequiredText(value: string, label: string) {
  const trimmed = value.trim()

  if (!trimmed) {
    return `${label} is required.`
  }

  if (trimmed.length > 120) {
    return `${label} must be 120 characters or fewer.`
  }

  return ''
}

function validateOptionalText(value: string, label: string) {
  return value.trim().length > 120 ? `${label} must be 120 characters or fewer.` : ''
}

function validateLength(value: string) {
  const trimmed = value.trim()

  if (!trimmed) {
    return ''
  }

  const parsed = splitDecimal(trimmed)
  const zero = splitDecimal('0')
  const max = splitDecimal('20')

  if (!parsed || !zero || !max) {
    return 'Length must be a valid decimal value.'
  }

  if (compareDecimals(parsed, zero) <= 0) {
    return 'Length must be greater than zero.'
  }

  if (compareDecimals(parsed, max) > 0) {
    return 'Length must be no more than 20 inches.'
  }

  return ''
}

function validateRingGauge(value: string) {
  const trimmed = value.trim()

  if (!trimmed) {
    return ''
  }

  if (!/^\d+$/.test(trimmed)) {
    return 'Ring Gauge must be a whole number.'
  }

  const numericValue = Number(trimmed)

  if (!Number.isSafeInteger(numericValue) || numericValue < 10 || numericValue > 100) {
    return 'Ring Gauge must be between 10 and 100.'
  }

  return ''
}

function validateMsrp(value: string) {
  const trimmed = value.trim()

  if (!trimmed) {
    return ''
  }

  return splitDecimal(trimmed) ? '' : 'MSRP must be a valid nonnegative decimal value.'
}

function validateDraft(draft: CatalogFormDraft): CatalogFormErrors {
  const errors: CatalogFormErrors = {
    manufacturer: validateRequiredText(draft.manufacturer, 'Manufacturer'),
    series: validateRequiredText(draft.series, 'Series'),
    vitola: validateRequiredText(draft.vitola, 'Vitola'),
    wrapper: validateOptionalText(draft.wrapper, 'Wrapper'),
    shape: validateOptionalText(draft.shape, 'Shape'),
    binder: validateOptionalText(draft.binder, 'Binder'),
    filler: validateOptionalText(draft.filler, 'Filler'),
    country: validateOptionalText(draft.country, 'Country'),
    length: validateLength(draft.length),
    ringGauge: validateRingGauge(draft.ringGauge),
    msrp: validateMsrp(draft.msrp),
  }

  if (draft.strength && !STRENGTH_OPTIONS.includes(draft.strength)) {
    errors.strength = 'Choose a supported strength.'
  }

  for (const key of Object.keys(errors) as CatalogFormField[]) {
    if (!errors[key]) {
      delete errors[key]
    }
  }

  return errors
}

function buildInput(draft: CatalogFormDraft): CatalogWriteInput {
  const ringGauge = draft.ringGauge.trim()

  return {
    manufacturer: draft.manufacturer.trim(),
    series: draft.series.trim(),
    vitola: draft.vitola.trim(),
    wrapper: normalizeOptionalText(draft.wrapper),
    shape: normalizeOptionalText(draft.shape),
    length: normalizeOptionalText(draft.length),
    ringGauge: ringGauge ? Number(ringGauge) : null,
    strength: draft.strength || null,
    binder: normalizeOptionalText(draft.binder),
    filler: normalizeOptionalText(draft.filler),
    country: normalizeOptionalText(draft.country),
    msrp: normalizeOptionalText(draft.msrp),
  }
}

function textInputMode(field: CatalogFormField) {
  return field === 'length' || field === 'msrp' ? 'decimal' : field === 'ringGauge' ? 'numeric' : undefined
}

function CatalogFormPanel({
  mode,
  details,
  isLoading,
  loadError,
  saveError,
  identityError,
  isSaving,
  onSave,
  onClose,
}: CatalogFormPanelProps) {
  const [draft, setDraft] = useState<CatalogFormDraft>(blankDraft)
  const [fieldErrors, setFieldErrors] = useState<CatalogFormErrors>({})
  const initialSnapshotRef = useRef(draftSnapshot(blankDraft))
  const manufacturerInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (mode === 'ADD') {
      setDraft(blankDraft)
      setFieldErrors({})
      initialSnapshotRef.current = draftSnapshot(blankDraft)
      window.setTimeout(() => manufacturerInputRef.current?.focus(), 0)
      return
    }

    if (!details) {
      return
    }

    const nextDraft = draftFromDetails(details)
    setDraft(nextDraft)
    setFieldErrors({})
    initialSnapshotRef.current = draftSnapshot(nextDraft)
    window.setTimeout(() => manufacturerInputRef.current?.focus(), 0)
  }, [mode, details])

  const isDirty = useMemo(() => {
    if (mode === 'ADD') {
      return hasMeaningfulDraftData(draft)
    }

    return draftSnapshot(draft) !== initialSnapshotRef.current
  }, [draft, mode])

  const hasUsage =
    mode === 'EDIT' &&
    details !== null &&
    (details.usage.currentQuantity > 0 ||
      details.usage.lotCount > 0 ||
      details.usage.purchaseLineCount > 0 ||
      details.usage.inventoryEventCount > 0)

  useEffect(() => {
    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key !== 'Escape' || isSaving) {
        return
      }

      event.preventDefault()
      requestClose()
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  })

  function requestClose() {
    if (isSaving) {
      return
    }

    if (isDirty && !window.confirm('Discard your unsaved Catalog changes?')) {
      return
    }

    onClose()
  }

  function updateField(field: CatalogFormField, value: string) {
    setDraft((current) => ({ ...current, [field]: value }))
    setFieldErrors((current) => {
      if (!current[field]) {
        return current
      }

      const next = { ...current }
      delete next[field]
      return next
    })
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()

    if (isSaving || isLoading || loadError) {
      return
    }

    const errors = validateDraft(draft)
    setFieldErrors(errors)

    if (Object.keys(errors).length > 0) {
      return
    }

    await onSave(buildInput(draft))
  }

  function renderInput(
    field: CatalogFormField,
    label: string,
    options: {
      required?: boolean
      hint?: string
      autoComplete?: string
    } = {},
  ) {
    const errorId = `catalog-${field}-error`
    const hintId = `catalog-${field}-hint`

    return (
      <label className="catalog-form-field">
        <span>
          {label}
          {options.required ? <em>Required</em> : null}
        </span>
        <input
          ref={field === 'manufacturer' ? manufacturerInputRef : undefined}
          type="text"
          value={draft[field]}
          disabled={isSaving || isLoading}
          autoComplete={options.autoComplete}
          inputMode={textInputMode(field)}
          aria-invalid={Boolean(fieldErrors[field])}
          aria-describedby={[
            options.hint ? hintId : null,
            fieldErrors[field] ? errorId : null,
          ]
            .filter(Boolean)
            .join(' ') || undefined}
          onChange={(event) => updateField(field, event.target.value)}
        />
        {options.hint ? (
          <small id={hintId} className="catalog-form-hint">
            {options.hint}
          </small>
        ) : null}
        {fieldErrors[field] ? (
          <small id={errorId} className="catalog-form-error">
            {fieldErrors[field]}
          </small>
        ) : null}
      </label>
    )
  }

  const title = mode === 'ADD' ? 'Add Catalog Cigar' : 'Edit Catalog Cigar'
  const saveLabel = mode === 'ADD' ? 'Add Cigar' : 'Save Changes'
  const pendingLabel = mode === 'ADD' ? 'Adding...' : 'Saving...'

  return (
    <div
      className="modal-backdrop catalog-form-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          requestClose()
        }
      }}
    >
      <section
        className="modal catalog-form-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="catalog-form-title"
      >
        <div className="modal-header catalog-form-header">
          <div>
            <p className="modal-kicker">Catalog</p>
            <h3 id="catalog-form-title">{title}</h3>
          </div>
          <button
            className="icon-button"
            type="button"
            aria-label="Close Catalog form"
            disabled={isSaving}
            onClick={requestClose}
          >
            &times;
          </button>
        </div>

        {isLoading ? (
          <section className="catalog-form-loading" aria-live="polite">
            <p>Loading Catalog cigar...</p>
          </section>
        ) : null}

        {loadError ? (
          <section className="catalog-form-alert catalog-form-alert-error" role="alert">
            <strong>Catalog cigar could not be loaded.</strong>
            <p>{loadError}</p>
          </section>
        ) : null}

        {!isLoading && !loadError ? (
          <form className="catalog-form" onSubmit={handleSubmit}>
            {saveError ? (
              <section className="catalog-form-alert catalog-form-alert-error" role="alert">
                <strong>Catalog cigar could not be saved.</strong>
                <p>{saveError}</p>
              </section>
            ) : null}

            {hasUsage ? (
              <section className="catalog-form-alert catalog-form-alert-info">
                <p>
                  This cigar is used by purchases or inventory. Changes update the Catalog identity
                  displayed across the app but do not rewrite purchase, Lot, or inventory-event
                  history.
                </p>
              </section>
            ) : null}

            <section className="catalog-form-section">
              <div className="catalog-form-section-heading">
                <h4>Identity</h4>
              </div>
              {identityError ? (
                <p className="catalog-form-identity-error" role="alert">
                  {identityError}
                </p>
              ) : null}
              <div className="catalog-form-grid catalog-form-grid-two">
                {renderInput('manufacturer', 'Manufacturer', {
                  required: true,
                  autoComplete: 'off',
                })}
                {renderInput('series', 'Series', {
                  required: true,
                  autoComplete: 'off',
                })}
                {renderInput('vitola', 'Vitola', {
                  required: true,
                  autoComplete: 'off',
                })}
                {renderInput('wrapper', 'Wrapper', { autoComplete: 'off' })}
              </div>
            </section>

            <section className="catalog-form-section">
              <div className="catalog-form-section-heading">
                <h4>Size and Strength</h4>
              </div>
              <div className="catalog-form-grid catalog-form-grid-two">
                {renderInput('shape', 'Shape', { autoComplete: 'off' })}
                {renderInput('length', 'Length (inches)', {
                  hint: 'Example: 6.25',
                  autoComplete: 'off',
                })}
                {renderInput('ringGauge', 'Ring Gauge', {
                  hint: '10-100',
                  autoComplete: 'off',
                })}
                <label className="catalog-form-field">
                  <span>Strength</span>
                  <select
                    value={draft.strength}
                    disabled={isSaving || isLoading}
                    aria-invalid={Boolean(fieldErrors.strength)}
                    aria-describedby={fieldErrors.strength ? 'catalog-strength-error' : undefined}
                    onChange={(event) =>
                      updateField('strength', event.target.value as CatalogFormDraft['strength'])
                    }
                  >
                    <option value="">Not specified</option>
                    {STRENGTH_OPTIONS.map((strength) => (
                      <option key={strength} value={strength}>
                        {strength}
                      </option>
                    ))}
                  </select>
                  {fieldErrors.strength ? (
                    <small id="catalog-strength-error" className="catalog-form-error">
                      {fieldErrors.strength}
                    </small>
                  ) : null}
                </label>
              </div>
            </section>

            <section className="catalog-form-section">
              <div className="catalog-form-section-heading">
                <h4>Blend and Origin</h4>
              </div>
              <div className="catalog-form-grid catalog-form-grid-three">
                {renderInput('binder', 'Binder', { autoComplete: 'off' })}
                {renderInput('filler', 'Filler', { autoComplete: 'off' })}
                {renderInput('country', 'Country', { autoComplete: 'off' })}
              </div>
            </section>

            <section className="catalog-form-section">
              <div className="catalog-form-section-heading">
                <h4>Pricing</h4>
              </div>
              <div className="catalog-form-grid catalog-form-grid-price">
                {renderInput('msrp', 'MSRP per Cigar', {
                  hint: 'Example: 12.50',
                  autoComplete: 'off',
                })}
              </div>
            </section>

            <div className="catalog-form-actions">
              <button
                className="secondary-button"
                type="button"
                disabled={isSaving}
                onClick={requestClose}
              >
                Cancel
              </button>
              <button className="primary-button" type="submit" disabled={isSaving}>
                {isSaving ? pendingLabel : saveLabel}
              </button>
            </div>
          </form>
        ) : null}
      </section>
    </div>
  )
}

export default CatalogFormPanel
