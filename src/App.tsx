import { useState } from 'react'
import Dashboard from './pages/Dashboard'
import Collection from './pages/Collection'
import Humidors from './pages/Humidors'
import Purchases from './pages/Purchases'
import './App.css'

const navItems = [
  'Dashboard',
  'Collection',
  'Purchases',
  'Consumption',
  'Humidors',
  'Catalog',
  'Reports',
  'Settings',
]

function App() {
  const [activePage, setActivePage] = useState('Purchases')

  function renderPage() {
    if (activePage === 'Dashboard') {
      return <Dashboard />
    }

    if (activePage === 'Purchases') {
      return <Purchases />
    }

    if (activePage === 'Collection') {
      return <Collection />
    }

    if (activePage === 'Humidors') {
      return <Humidors />
    }

    return (
      <section className="panel">
        <h3>{activePage}</h3>
        <p className="muted">This section is not implemented yet.</p>
      </section>
    )
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <h1>Humidor HQ</h1>
          <p>Collection Management</p>
        </div>

        <nav className="nav">
          {navItems.map((item) => (
            <button
              key={item}
              className={item === activePage ? 'nav-item active' : 'nav-item'}
              onClick={() => setActivePage(item)}
            >
              {item}
            </button>
          ))}
        </nav>
      </aside>

      <main className="main-content">
        {renderPage()}
      </main>
    </div>
  )
}

export default App
