import { useEffect, useState } from 'react'
import {
  archiveHumidor,
  createHumidor,
  getHumidors,
  updateHumidor,
  type Humidor,
} from '../services/api'

function Humidors() {
  const [humidors, setHumidors] = useState<Humidor[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [name, setName] = useState('')
  const [capacity, setCapacity] = useState('')
  const [hasShelves, setHasShelves] = useState(false)
  const [shelfCount, setShelfCount] = useState('')
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

    try {
      if (editingHumidor) {
        const updatedHumidor = await updateHumidor(editingHumidor.id, {
          name: name.trim(),
          capacity,
          hasShelves,
          shelfCount,
        })

        setHumidors((current) =>
          current.map((humidor) =>
            humidor.id === updatedHumidor.id ? updatedHumidor : humidor,
          ),
        )
      } else {
        const createdHumidor = await createHumidor({
          name: name.trim(),
          capacity,
          hasShelves,
          shelfCount,
        })

        setHumidors((current) => [...current, createdHumidor])
      }

      setName('')
      setCapacity('')
      setHasShelves(false)
      setShelfCount('')
      setEditingHumidor(null)
      setIsModalOpen(false)
      setError('')
    } catch {
      setError('Unable to save humidor.')
    }
  }

  function openAddModal() {
    setEditingHumidor(null)
    setName('')
    setCapacity('')
    setHasShelves(false)
    setShelfCount('')
    setError('')
    setIsModalOpen(true)
  }

  function openEditModal(humidor: Humidor) {
    setEditingHumidor(humidor)
    setName(humidor.name)
    setCapacity(humidor.capacity ? String(humidor.capacity) : '')
    setHasShelves(humidor.hasShelves)
    setShelfCount(humidor.shelfCount ? String(humidor.shelfCount) : '')
    setIsModalOpen(true)
  }

  async function handleArchiveHumidor(humidor: Humidor) {
    const confirmed = window.confirm(`Archive ${humidor.name}?`)

    if (!confirmed) {
      return
    }

    try {
      await archiveHumidor(humidor.id)

      setHumidors((current) =>
        current.filter((item) => item.id !== humidor.id),
      )

      setEditingHumidor(null)
      setIsModalOpen(false)
    } catch {
      setError('Unable to archive humidor.')
    }
  }

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
            You have not created any humidors yet. Click “Add Humidor” to create your first one.
          </p>
        )}

        {!isLoading && humidors.length > 0 && (
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Capacity</th>
                <th>Shelves</th>
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
                  <td>
                    {humidor.hasShelves
                      ? humidor.shelfCount ?? 0
                      : '—'}
                  </td>
                  <td>0</td>
                  <td>0%</td>
                  <td>—</td>
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
                ×
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

              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={hasShelves}
                  onChange={(event) => setHasShelves(event.target.checked)}
                />
                This humidor has shelves
              </label>

              {hasShelves && (
                <label>
                  Number of Shelves
                  <input
                    value={shelfCount}
                    onChange={(event) => setShelfCount(event.target.value)}
                    placeholder="Example: 5"
                    inputMode="numeric"
                  />
                </label>
              )}

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
