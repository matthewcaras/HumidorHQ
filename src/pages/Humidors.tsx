import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import {
  archiveHumidor,
  createHumidor,
  getCollectionCigarDetails,
  getCollectionHumidorDetails,
  getCollectionHumidors,
  getHumidors,
  updateHumidor,
  type CollectionCigarDetails,
  type CollectionHumidorDetails,
  type CollectionHumidorSummary,
  type Humidor,
  type StorageOrganizationType,
} from '../services/api'
import {
  CigarDetailsPanel,
  HumidorDetailsPanel,
} from '../components/collection/CollectionDetailsPanels'

const ORGANIZATION_OPTIONS: {
  value: StorageOrganizationType
  label: string
  disabled?: boolean
}[] = [
  { value: 'GENERAL', label: 'General' },
  { value: 'DRAWERS', label: 'Drawers' },
  { value: 'SHELVES', label: 'Shelves' },
  { value: 'CUSTOM', label: 'Custom - Coming Soon', disabled: true },
]

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'UTC',
})

function organizationLabel(organizationType: StorageOrganizationType) {
  switch (organizationType) {
    case 'DRAWERS':
      return 'Drawers'
    case 'SHELVES':
      return 'Shelves'
    case 'CUSTOM':
      return 'Custom'
    case 'GENERAL':
    default:
      return 'General'
  }
}

function inferSectionCount(humidor: Humidor) {
  if (humidor.organizationType === 'DRAWERS') {
    return String(
      humidor.subLocations.filter(
        (subLocation) => subLocation.isActive && subLocation.kind === 'DRAWER',
      ).length,
    )
  }

  if (humidor.organizationType === 'SHELVES') {
    return String(
      humidor.subLocations.filter(
        (subLocation) => subLocation.isActive && subLocation.kind === 'SHELF',
      ).length,
    )
  }

  return ''
}

function visibleSectionCount(humidor: Humidor) {
  if (humidor.organizationType === 'GENERAL') {
    return 1
  }

  return humidor.subLocations.filter((subLocation) => subLocation.isActive).length
}

function previewSections(organizationType: StorageOrganizationType, sectionCount: string) {
  if (organizationType === 'GENERAL') {
    return ['General']
  }

  const count = Number(sectionCount)

  if (!Number.isInteger(count) || count < 1) {
    return []
  }

  const prefix = organizationType === 'DRAWERS' ? 'Drawer' : 'Shelf'

  return Array.from({ length: count }, (_, index) => `${prefix} ${index + 1}`)
}

function formatDate(value: string | null | undefined) {
  if (!value) {
    return '-'
  }

  return dateFormatter.format(new Date(value))
}

function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '-'
  }

  return `${value.toFixed(1)}%`
}

function formatCapacity(capacity: number | null) {
  return capacity && capacity > 0 ? String(capacity) : 'Not set'
}

function sortHumidorsByName(a: Humidor, b: Humidor) {
  return (
    a.name.localeCompare(b.name, undefined, {
      numeric: true,
      sensitivity: 'base',
    }) || a.id - b.id
  )
}

function Humidors() {
  const [humidors, setHumidors] = useState<Humidor[]>([])
  const [collectionHumidors, setCollectionHumidors] = useState<
    CollectionHumidorSummary[]
  >([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [inventoryWarning, setInventoryWarning] = useState('')
  const [inventoryLoadFailed, setInventoryLoadFailed] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [name, setName] = useState('')
  const [capacity, setCapacity] = useState('')
  const [organizationType, setOrganizationType] =
    useState<StorageOrganizationType>('GENERAL')
  const [sectionCount, setSectionCount] = useState('')
  const [editingHumidor, setEditingHumidor] = useState<Humidor | null>(null)
  const [selectedHumidorId, setSelectedHumidorId] = useState<number | null>(null)
  const [humidorDetails, setHumidorDetails] = useState<CollectionHumidorDetails | null>(
    null,
  )
  const [isHumidorDetailsLoading, setIsHumidorDetailsLoading] = useState(false)
  const [humidorDetailsError, setHumidorDetailsError] = useState('')
  const [selectedCigarId, setSelectedCigarId] = useState<number | null>(null)
  const [cigarDetailsData, setCigarDetailsData] =
    useState<CollectionCigarDetails | null>(null)
  const [isCigarDetailsLoading, setIsCigarDetailsLoading] = useState(false)
  const [cigarDetailsError, setCigarDetailsError] = useState('')
  const humidorDetailsRequestIdRef = useRef(0)
  const cigarDetailsRequestIdRef = useRef(0)
  const humidorDetailsOpenerRef = useRef<HTMLElement | null>(null)
  const cigarDetailsOpenerRef = useRef<HTMLElement | null>(null)

  async function refreshInventorySummaries() {
    try {
      const data = await getCollectionHumidors()
      setCollectionHumidors(data.humidors)
      setInventoryLoadFailed(false)
      setInventoryWarning('')
    } catch {
      setCollectionHumidors([])
      setInventoryLoadFailed(true)
      setInventoryWarning(
        'Current inventory totals could not be loaded. Humidor management actions remain available.',
      )
    }
  }

  async function loadHumidors() {
    setIsLoading(true)
    setError('')

    try {
      const [humidorResult, collectionResult] = await Promise.allSettled([
        getHumidors(),
        getCollectionHumidors(),
      ])

      if (humidorResult.status === 'rejected') {
        setError('Unable to load humidors.')
        setHumidors([])
      } else {
        setHumidors(humidorResult.value)
      }

      if (collectionResult.status === 'rejected') {
        setCollectionHumidors([])
        setInventoryLoadFailed(true)
        setInventoryWarning(
          'Current inventory totals could not be loaded. Humidor management actions remain available.',
        )
      } else {
        setCollectionHumidors(collectionResult.value.humidors)
        setInventoryLoadFailed(false)
        setInventoryWarning('')
      }
    } catch {
      setError('Unable to load humidors.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadHumidors()
  }, [])

  useEffect(() => {
    if (selectedCigarId === null) {
      return
    }

    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') {
        closeCigarDetails()
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [selectedCigarId])

  useEffect(() => {
    if (selectedHumidorId === null) {
      return
    }

    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape' && selectedCigarId === null) {
        closeHumidorDetails()
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [selectedHumidorId, selectedCigarId])

  async function openHumidorDetails(storageLocationId: number, opener: HTMLElement) {
    const requestId = humidorDetailsRequestIdRef.current + 1
    humidorDetailsRequestIdRef.current = requestId
    humidorDetailsOpenerRef.current = opener
    setSelectedHumidorId(storageLocationId)
    setHumidorDetails(null)
    setHumidorDetailsError('')
    setIsHumidorDetailsLoading(true)

    try {
      const data = await getCollectionHumidorDetails(storageLocationId)

      if (requestId !== humidorDetailsRequestIdRef.current) {
        return
      }

      setHumidorDetails(data)
    } catch (loadError) {
      if (requestId !== humidorDetailsRequestIdRef.current) {
        return
      }

      setHumidorDetailsError(
        loadError instanceof Error ? loadError.message : 'Unable to load Humidor details.',
      )
    } finally {
      if (requestId === humidorDetailsRequestIdRef.current) {
        setIsHumidorDetailsLoading(false)
      }
    }
  }

  async function openCigarDetails(catalogCigarId: number, opener: HTMLElement) {
    const requestId = cigarDetailsRequestIdRef.current + 1
    cigarDetailsRequestIdRef.current = requestId
    cigarDetailsOpenerRef.current = opener
    setSelectedCigarId(catalogCigarId)
    setCigarDetailsData(null)
    setCigarDetailsError('')
    setIsCigarDetailsLoading(true)

    try {
      const data = await getCollectionCigarDetails(catalogCigarId)

      if (requestId !== cigarDetailsRequestIdRef.current) {
        return
      }

      setCigarDetailsData(data)
    } catch (loadError) {
      if (requestId !== cigarDetailsRequestIdRef.current) {
        return
      }

      setCigarDetailsError(
        loadError instanceof Error ? loadError.message : 'Unable to load cigar details.',
      )
    } finally {
      if (requestId === cigarDetailsRequestIdRef.current) {
        setIsCigarDetailsLoading(false)
      }
    }
  }

  function closeCigarDetails() {
    cigarDetailsRequestIdRef.current += 1
    setSelectedCigarId(null)
    setCigarDetailsData(null)
    setCigarDetailsError('')
    setIsCigarDetailsLoading(false)

    window.setTimeout(() => {
      cigarDetailsOpenerRef.current?.focus()
    }, 0)
  }

  function closeHumidorDetails() {
    humidorDetailsRequestIdRef.current += 1
    setSelectedHumidorId(null)
    setHumidorDetails(null)
    setHumidorDetailsError('')
    setIsHumidorDetailsLoading(false)

    window.setTimeout(() => {
      humidorDetailsOpenerRef.current?.focus()
    }, 0)
  }

  function clearDetailsPanels() {
    humidorDetailsRequestIdRef.current += 1
    cigarDetailsRequestIdRef.current += 1
    setSelectedHumidorId(null)
    setHumidorDetails(null)
    setHumidorDetailsError('')
    setIsHumidorDetailsLoading(false)
    setSelectedCigarId(null)
    setCigarDetailsData(null)
    setCigarDetailsError('')
    setIsCigarDetailsLoading(false)
  }

  function handleOpenHumidorDetailsKeyDown(
    event: KeyboardEvent<HTMLElement>,
    humidorId: number,
  ) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      void openHumidorDetails(humidorId, event.currentTarget)
    }
  }

  async function handleSaveHumidor(event: React.FormEvent) {
    event.preventDefault()

    if (!name.trim()) {
      setError('Humidor name is required.')
      return
    }

    if (
      (organizationType === 'DRAWERS' || organizationType === 'SHELVES') &&
      (!Number.isInteger(Number(sectionCount)) || Number(sectionCount) < 1)
    ) {
      setError(
        organizationType === 'DRAWERS'
          ? 'Number of Drawers must be a positive whole number.'
          : 'Number of Shelves must be a positive whole number.',
      )
      return
    }

    try {
      const humidorInput = {
        name: name.trim(),
        capacity,
        organizationType,
        sectionCount:
          organizationType === 'DRAWERS' || organizationType === 'SHELVES'
            ? sectionCount
            : undefined,
      }

      if (editingHumidor) {
        const updatedHumidor = await updateHumidor(editingHumidor.id, humidorInput)

        setHumidors((current) =>
          current.map((humidor) =>
            humidor.id === updatedHumidor.id ? updatedHumidor : humidor,
          ),
        )
      } else {
        const createdHumidor = await createHumidor(humidorInput)

        setHumidors((current) => [...current, createdHumidor])
      }

      await refreshInventorySummaries()

      setName('')
      setCapacity('')
      setOrganizationType('GENERAL')
      setSectionCount('')
      setEditingHumidor(null)
      setIsModalOpen(false)
      setError('')
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save humidor.')
    }
  }

  function openAddModal() {
    clearDetailsPanels()
    setEditingHumidor(null)
    setName('')
    setCapacity('')
    setOrganizationType('GENERAL')
    setSectionCount('')
    setError('')
    setIsModalOpen(true)
  }

  function openEditModal(humidor: Humidor) {
    clearDetailsPanels()
    setEditingHumidor(humidor)
    setName(humidor.name)
    setCapacity(humidor.capacity ? String(humidor.capacity) : '')
    setOrganizationType(humidor.organizationType)
    setSectionCount(inferSectionCount(humidor))
    setError('')
    setIsModalOpen(true)
  }

  async function handleArchiveHumidor(humidor: Humidor) {
    const confirmed = window.confirm(`Archive ${humidor.name}?`)

    if (!confirmed) {
      return
    }

    try {
      await archiveHumidor(humidor.id)

      setHumidors((current) => current.filter((item) => item.id !== humidor.id))
      await refreshInventorySummaries()

      setEditingHumidor(null)
      setIsModalOpen(false)
    } catch {
      setError('Unable to archive humidor.')
    }
  }

  const sectionPreview = previewSections(organizationType, sectionCount)
  const sectionCountLabel =
    organizationType === 'DRAWERS' ? 'Number of Drawers' : 'Number of Shelves'
  const collectionHumidorsById = useMemo(
    () =>
      new Map(
        collectionHumidors.map((collectionHumidor) => [
          collectionHumidor.storageLocation.id,
          collectionHumidor,
        ]),
      ),
    [collectionHumidors],
  )
  const humidorViews = useMemo(
    () =>
      [...humidors].sort(sortHumidorsByName).map((humidor) => {
        const inventorySummary = collectionHumidorsById.get(humidor.id)

        return {
          humidor,
          inventorySummary,
          currentCount: inventorySummary?.totalQuantity,
          occupancyPercent: inventorySummary?.capacityUsedPercent,
          oldestLotDate: inventorySummary?.oldestReceivedDate,
          configuredSectionCount: visibleSectionCount(humidor),
        }
      }),
    [collectionHumidorsById, humidors],
  )
  const hasMissingInventorySummaries =
    !inventoryLoadFailed &&
    humidorViews.some(({ inventorySummary }) => inventorySummary === undefined)
  const displayedInventoryWarning =
    inventoryWarning ||
    (hasMissingInventorySummaries
      ? 'Current inventory totals could not be matched for one or more humidors.'
      : '')
  const totalCapacity = humidorViews.reduce((total, { humidor }) => {
    if (!humidor.capacity || humidor.capacity <= 0) {
      return total
    }

    return total + humidor.capacity
  }, 0)
  const totalCurrentCount = inventoryLoadFailed
    ? null
    : humidorViews.reduce(
        (total, { currentCount }) => total + (currentCount ?? 0),
        0,
      )
  const summaryOccupancy =
    totalCapacity > 0 && totalCurrentCount !== null && !hasMissingInventorySummaries
      ? `${((totalCurrentCount / totalCapacity) * 100).toFixed(1)}%`
      : '-'

  return (
    <>
      <header className="page-header">
        <div className="page-header-copy">
          <h2>Humidors</h2>
          <p className="page-subtitle">
            Manage your storage locations, capacity, shelves, and occupancy.
          </p>
        </div>
        <button className="primary-button" onClick={openAddModal}>
          + Add Humidor
        </button>
      </header>

      <section className="summary-grid humidor-summary-grid">
        <div className="card">
          <p>Humidors</p>
          <strong>{humidorViews.length}</strong>
        </div>
        <div className="card">
          <p>Capacity</p>
          <strong>{totalCapacity}</strong>
        </div>
        <div className="card">
          <p>Current Count</p>
          <strong>{totalCurrentCount ?? '-'}</strong>
        </div>
        <div className="card">
          <p>Occupancy</p>
          <strong>{summaryOccupancy}</strong>
        </div>
      </section>

      <section className="panel humidor-management-panel">
        <h3>Your Humidors</h3>

        {isLoading && <p className="muted">Loading humidors...</p>}

        {error && <p className="error-text">{error}</p>}

        {!isLoading && !error && displayedInventoryWarning && (
          <div className="inventory-warning" role="status">
            {displayedInventoryWarning}
          </div>
        )}

        {!isLoading && !error && humidorViews.length === 0 && (
          <p className="muted">
            You have not created any humidors yet. Click "Add Humidor" to create your first one.
          </p>
        )}

        {!isLoading && humidorViews.length > 0 && (
          <>
            <table className="data-table humidor-management-table desktop-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Capacity</th>
                  <th>Organization</th>
                  <th>Sections</th>
                  <th>Current Count</th>
                  <th>Occupancy</th>
                  <th>Oldest Lot</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {humidorViews.map(
                  ({
                    humidor,
                    currentCount,
                    occupancyPercent,
                    oldestLotDate,
                    configuredSectionCount,
                  }) => (
                    <tr
                      className="humidor-management-row"
                      key={humidor.id}
                      tabIndex={0}
                      role="button"
                      aria-label={`Open ${humidor.name} Humidor details`}
                      onClick={(event) =>
                        void openHumidorDetails(humidor.id, event.currentTarget)
                      }
                      onKeyDown={(event) =>
                        handleOpenHumidorDetailsKeyDown(event, humidor.id)
                      }
                    >
                      <td>{humidor.name}</td>
                      <td>{formatCapacity(humidor.capacity)}</td>
                      <td>{organizationLabel(humidor.organizationType)}</td>
                      <td>{configuredSectionCount}</td>
                      <td>{currentCount ?? '-'}</td>
                      <td>{formatPercent(occupancyPercent)}</td>
                      <td>{formatDate(oldestLotDate)}</td>
                      <td>
                        <button
                          className="table-action"
                          onClick={(event) => {
                            event.stopPropagation()
                            openEditModal(humidor)
                          }}
                          onKeyDown={(event) => event.stopPropagation()}
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>

            <div className="humidor-management-card-list">
              {humidorViews.map(
                ({
                  humidor,
                  currentCount,
                  occupancyPercent,
                  oldestLotDate,
                  configuredSectionCount,
                }) => (
                  <article
                    className="humidor-management-card humidor-management-card-interactive"
                    key={humidor.id}
                    tabIndex={0}
                    role="button"
                    aria-label={`Open ${humidor.name} Humidor details`}
                    onClick={(event) =>
                      void openHumidorDetails(humidor.id, event.currentTarget)
                    }
                    onKeyDown={(event) =>
                      handleOpenHumidorDetailsKeyDown(event, humidor.id)
                    }
                  >
                    <div className="humidor-management-card-header">
                      <h4>{humidor.name}</h4>
                      <button
                        className="table-action"
                        onClick={(event) => {
                          event.stopPropagation()
                          openEditModal(humidor)
                        }}
                        onKeyDown={(event) => event.stopPropagation()}
                      >
                        Edit
                      </button>
                    </div>

                    <dl>
                      <div>
                        <dt>Capacity</dt>
                        <dd>{formatCapacity(humidor.capacity)}</dd>
                      </div>
                      <div>
                        <dt>Organization</dt>
                        <dd>{organizationLabel(humidor.organizationType)}</dd>
                      </div>
                      <div>
                        <dt>Sections</dt>
                        <dd>{configuredSectionCount}</dd>
                      </div>
                      <div>
                        <dt>Current Count</dt>
                        <dd>{currentCount ?? '-'}</dd>
                      </div>
                      <div>
                        <dt>Occupancy</dt>
                        <dd>{formatPercent(occupancyPercent)}</dd>
                      </div>
                      <div>
                        <dt>Oldest Lot</dt>
                        <dd>{formatDate(oldestLotDate)}</dd>
                      </div>
                    </dl>
                  </article>
                ),
              )}
            </div>
          </>
        )}
      </section>

      {selectedHumidorId !== null ? (
        <HumidorDetailsPanel
          details={humidorDetails}
          isLoading={isHumidorDetailsLoading}
          error={humidorDetailsError}
          isNestedPanelOpen={selectedCigarId !== null}
          onClose={closeHumidorDetails}
          onOpenCigarDetails={(catalogCigarId, opener) =>
            void openCigarDetails(catalogCigarId, opener)
          }
        />
      ) : null}

      {selectedCigarId !== null ? (
        <CigarDetailsPanel
          details={cigarDetailsData}
          isLoading={isCigarDetailsLoading}
          error={cigarDetailsError}
          onClose={closeCigarDetails}
        />
      ) : null}

      {isModalOpen && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-header">
              <h3>{editingHumidor ? 'Edit Humidor' : 'Add Humidor'}</h3>
              <button className="icon-button" onClick={() => setIsModalOpen(false)}>
                &times;
              </button>
            </div>

            <form onSubmit={handleSaveHumidor} className="form">
              <label>
                Name *
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Example: Tupperdore 1"
                />
              </label>

              <label>
                Capacity
                <input
                  value={capacity}
                  onChange={(event) => setCapacity(event.target.value)}
                  placeholder="Example: 100"
                  inputMode="numeric"
                />
              </label>

              <fieldset className="organization-section">
                <legend>Organization</legend>

                <div className="organization-options">
                  {ORGANIZATION_OPTIONS.map((option) => (
                    <label
                      key={option.value}
                      className={`organization-option${option.disabled ? ' disabled' : ''}`}
                    >
                      <input
                        type="radio"
                        name="organizationType"
                        value={option.value}
                        checked={organizationType === option.value}
                        disabled={option.disabled}
                        onChange={() => {
                          setOrganizationType(option.value)
                          setSectionCount('')
                        }}
                      />
                      <span>{option.label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              {(organizationType === 'DRAWERS' || organizationType === 'SHELVES') && (
                <label className="section-count-field">
                  {sectionCountLabel}
                  <input
                    value={sectionCount}
                    onChange={(event) => setSectionCount(event.target.value)}
                    placeholder="Example: 4"
                    inputMode="numeric"
                  />
                </label>
              )}

              <div className="organization-preview">
                <p>Preview</p>
                {sectionPreview.length > 0 ? (
                  <ul>
                    {sectionPreview.map((section) => (
                      <li key={section}>{section}</li>
                    ))}
                  </ul>
                ) : (
                  <span>Enter a section count to preview.</span>
                )}
              </div>

              {editingHumidor && (
                <div className="archive-section">
                  <button
                    type="button"
                    className="archive-link"
                    onClick={() => handleArchiveHumidor(editingHumidor)}
                  >
                    Archive
                  </button>
                </div>
              )}

              <div className="form-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setIsModalOpen(false)}
                >
                  Cancel
                </button>

                <button type="submit" className="primary-button">
                  {editingHumidor ? 'Save Changes' : 'Save Humidor'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}

export default Humidors
