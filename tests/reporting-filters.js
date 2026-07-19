/*
 * Filename: reporting-filters.js
 * Revision: 1.0.0
 * Description: Isolated assertions for Collection search/strength controls and purchase-history report calculations.
 * Modified Date: 2026-07-19 16:00 ET
 */

const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const appPath = path.join(__dirname, '..', 'public', 'assets', 'js', 'app.js')
const appSource = fs.readFileSync(appPath, 'utf8').split("window.addEventListener('hashchange'")[0]
const assertions = String.raw`
function testAssert(condition, message) {
  if (!condition) throw new Error(message)
}

state.records = {
  'catalog-cigars': [
    { id: 1, manufacturer: 'Alpha', series: 'Reserve', vitola: 'Robusto', strength: 'Mild', wrapper: 'Connecticut' },
    { id: 2, manufacturer: 'Bravo', series: 'Maduro', vitola: 'Toro', strength: 'Full', wrapper: 'Maduro' },
  ],
  vendors: [{ id: 1, name: 'Vendor One' }, { id: 2, name: 'Vendor Two' }],
  purchases: [
    { id: 1, vendorId: 1, purchaseDate: '2026-01-01', status: 'received', totalPaid: '30.00' },
    { id: 2, vendorId: 2, purchaseDate: '2026-02-01', status: 'received', totalPaid: '35.00' },
  ],
  'purchase-lines': [
    { id: 1, purchaseId: 1, catalogCigarId: 1, quantity: 2, purchasePrice: '20.00', trueCostBasis: '22.00' },
    { id: 2, purchaseId: 2, catalogCigarId: 2, quantity: 3, purchasePrice: '30.00', trueCostBasis: '33.00' },
    { id: 3, purchaseId: 1, catalogCigarId: 2, quantity: 1, purchasePrice: '10.00', trueCostBasis: '11.00' },
  ],
  lots: [
    { id: 1, purchaseLineId: 1, purchaseId: 1, catalogCigarId: 1, currentQuantity: 2, costPerCigarSnapshot: '11.00' },
    { id: 2, purchaseLineId: 2, purchaseId: 2, catalogCigarId: 2, currentQuantity: 3, costPerCigarSnapshot: '11.00' },
  ],
  'lot-location-balances': [
    { id: 1, lotId: 1, purchaseLineId: 1, purchaseId: 1, storageLocationId: 1, storageSubLocationId: null, quantity: 2 },
    { id: 2, lotId: 2, purchaseLineId: 2, purchaseId: 2, storageLocationId: 1, storageSubLocationId: null, quantity: 3 },
  ],
  'storage-locations': [{ id: 1, name: 'Main Humidor', isActive: true }],
  'storage-sub-locations': [],
  'inventory-events': [],
  'smoking-journal-entries': [],
}

let metrics = currentCollectionMetrics()
testAssert(metrics.totalQuantity === 5 && metrics.uniqueCigarCount === 2, 'Unfiltered Collection metrics are incorrect.')
state.collectionStrengthFilter = 'mild'
metrics = currentCollectionMetrics()
testAssert(metrics.totalQuantity === 2 && metrics.items[0].cigar.manufacturer === 'Alpha', 'Strength filtering is incorrect.')
state.collectionStrengthFilter = ''
state.collectionSearch = 'maduro'
metrics = currentCollectionMetrics()
testAssert(metrics.totalQuantity === 3 && metrics.items[0].cigar.manufacturer === 'Bravo', 'Collection search is incorrect.')
state.collectionSearch = ''
state.collectionSort = 'strength'
state.collectionDirection = 'asc'
testAssert(sortCollectionItems(buildCollectionItems())[0].cigar.strength === 'Mild', 'Ascending strength sort is incorrect.')
state.collectionDirection = 'desc'
testAssert(sortCollectionItems(buildCollectionItems())[0].cigar.strength === 'Full', 'Descending strength sort is incorrect.')

state.purchaseHistoryGroup = 'vendor'
state.purchaseHistoryVendorId = '1'
let history = purchaseHistoryRows()
testAssert(history.length === 2, 'Vendor purchase-history filter is incorrect.')
testAssert(purchaseHistoryTotalPaid(history) === 30, 'Vendor totalPaid summary is incorrect.')
state.purchaseHistoryGroup = 'manufacturer'
state.purchaseHistoryManufacturer = 'bravo'
history = purchaseHistoryRows()
testAssert(history.length === 2, 'Manufacturer purchase-history filter is incorrect.')
testAssert(purchaseHistoryTotalPaid(history) === 45, 'Manufacturer totalPaid allocation is incorrect.')
state.purchaseHistoryManufacturer = 'alpha'
const alphaHistory = purchaseHistoryRows()
const alphaTotal = purchaseHistoryTotalPaid(alphaHistory)
testAssert(alphaTotal === 20, 'Second manufacturer totalPaid allocation is incorrect.')
state.purchaseHistoryVendorId = ''
state.purchaseHistoryManufacturer = ''
const allManufacturerRows = purchaseHistoryRows()
const allManufacturerTotal = purchaseHistoryTotalPaid(allManufacturerRows)
state.purchaseHistoryGroup = 'vendor'
const allVendorRows = purchaseHistoryRows()
const allVendorTotal = purchaseHistoryTotalPaid(allVendorRows)
testAssert(allVendorTotal === 65 && allManufacturerTotal === 65, 'All Vendor and All Manufacturer totals do not foot.')
testAssert(alphaTotal + 45 === allVendorTotal, 'Manufacturer-specific totals do not foot to the all-Vendor total.')
const pennyAllocation = allocatePurchasePaidCents(
  { totalPaid: '0.01' },
  [{ id: 5, trueCostBasis: '1.00' }, { id: 4, trueCostBasis: '1.00' }],
)
testAssert(pennyAllocation.get(4) === 1 && pennyAllocation.get(5) === 0, 'Cent remainder allocation is not deterministic by line ID.')
testAssert(allocatePurchasePaidCents({ totalPaid: '4.00' }, [{ id: 1 }, { id: 2 }]) === null, 'Missing allocation weights should remain unknown.')
testAssert(completeMoneyTotal([0, '0.00']) === 0, 'Known zero money was not preserved.')
testAssert(completeMoneyTotal([null, '1.00']) === null, 'Unknown money was incorrectly converted to zero.')
console.log('Reporting filter assertions passed.')
`

vm.runInNewContext(`${appSource}\n${assertions}`, { console })
