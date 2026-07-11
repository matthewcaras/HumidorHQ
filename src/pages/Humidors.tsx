import { useEffect, useState } from 'react'
import {
  archiveHumidor,
  createHumidor,
  getHumidors,
  updateHumidor,
  type Humidor,
  type StorageOrganizationType,
} from '../services/api'

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

function Humidors() {
  const [humidors, setHumidors] = useState<Humidor[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [name, setName] = useState('')
  const [capacity, setCapacity] = useState('')
  const [organizationType, setOrganizationType] =
    useState<StorageOrganizationType>('GENERAL')
  const [sectionCount, setSectionCount] = useState('')
  const [editingHumidor, setEditingHumidor] = useState<Humidor | null>(null)

  async function loadHumidors() {
    try {
      const data = await getHumidors()
      setHumidors(data)
    } catch {
      setError('Unable to load humidors.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadHumidors()
  }, [])

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
    setEditingHumidor(null)
    setName('')
    setCapacity('')
    setOrganizationType('GENERAL')
    setSectionCount('')
    setError('')
    setIsModalOpen(true)
  }

  function openEditModal(humidor: Humidor) {
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

      setEditingHumidor(null)
      setIsModalOpen(false)
    } catch {
      setError('Unable to archive humidor.')
    }
  }

  const sectionPreview = previewSections(organizationType, sectionCount)
  const sectionCountLabel =
    organizationType === 'DRAWERS' ? 'Number of Drawers' : 'Number of Shelves'

  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">Humidors</p>
          <h2>Humidors</h2>
          <p className="page-subtitle">
            Manage your storage locations, capacity, shelves, and occupancy.
          </p>
        </div>
        <button className="primary-button" onClick={openAddModal}>
          + Add Humidor
        </button>
      </header>

      <section className="summary-grid">
        <div className="card">
          <p>Humidors</p>
          <strong>{humidors.length}</strong>
        </div>
        <div className="card">
          <p>Capacity</p>
          <strong>
            {humidors.reduce((total, humidor) => total + (humidor.capacity ?? 0), 0)}
          </strong>
        </div>
        <div className="card">
          <p>Current Count</p>
          <strong>0</strong>
        </div>
        <div className="card">
          <p>Occupancy</p>
          <strong>0%</strong>
        </div>
      </section>

      <section className="panel">
        <h3>Your Humidors</h3>

        {isLoading && <p className="muted">Loading humidors...</p>}

        {error && <p className="error-text">{error}</p>}

        {!isLoading && !error && humidors.length === 0 && (
          <p className="muted">
            You have not created any humidors yet. Click "Add Humidor" to create your first one.
          </p>
        )}

        {!isLoading && humidors.length > 0 && (
          <table className="data-table">
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
              {humidors.map((humidor) => (
                <tr key={humidor.id}>
                  <td>{humidor.name}</td>
                  <td>{humidor.capacity ?? 'Not set'}</td>
                  <td>{organizationLabel(humidor.organizationType)}</td>
                  <td>{visibleSectionCount(humidor)}</td>
                  <td>0</td>
                  <td>0%</td>
                  <td>-</td>
                  <td>
                    <button className="table-action" onClick={() => openEditModal(humidor)}>
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

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
