import Humidors from './pages/Humidors'
import './App.css'

const navItems = [
  'Collection',
  'Dashboard',
  'Purchases',
  'Humidors',
  'Catalog',
  'Vendors',
  'Consumption',
  'Reports',
  'Settings',
]

function App() {
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
              className={item === 'Humidors' ? 'nav-item active' : 'nav-item'}
            >
              {item}
            </button>
          ))}
        </nav>
      </aside>

      <main className="main-content">
        <Humidors />
      </main>
    </div>
  )
}

export default App