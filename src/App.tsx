import './App.css'

function App() {
  return (
    <main className="app">
      <section className="hero">
        <p className="eyebrow">Personal Cigar Inventory</p>
        <h1>Humidor HQ</h1>
        <p className="subtitle">
          Track inventory, MSRP, actual cost, savings, humidors, purchases, and smoking history.
        </p>
      </section>

      <section className="dashboard-grid">
        <div className="card">
          <p>Total Cigars</p>
          <h2>500</h2>
        </div>

        <div className="card">
          <p>Humidors</p>
          <h2>7</h2>
        </div>

        <div className="card">
          <p>MSRP Value</p>
          <h2>$0.00</h2>
        </div>

        <div className="card">
          <p>Actual Cost</p>
          <h2>$0.00</h2>
        </div>

        <div className="card">
          <p>Total Savings</p>
          <h2>$0.00</h2>
        </div>

        <div className="card">
          <p>Average Discount</p>
          <h2>0%</h2>
        </div>
      </section>
    </main>
  )
}

export default App