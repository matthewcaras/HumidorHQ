/*
 * Filename: reporting-filters.js
 * Revision: 1.4.0
 * Description: Isolated assertions for Collection, Catalog, purchase-history, and Buy Again behavior.
 * Modified Date: 2026-07-19 17:00 ET
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
    { id: 2, manufacturer: 'Bravo', series: 'Maduro', vitola: 'Toro', strength: 'Full', wrapper: 'Maduro', buyAgainStatus: 'YES', buyAgainNotes: 'Stock up' },
    { id: 1, manufacturer: 'Alpha', series: 'Reserve', vitola: 'Robusto', strength: 'Mild', wrapper: 'Connecticut', buyAgainStatus: null, buyAgainNotes: 'Evaluate after another smoke' },
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
    { id: 2, lotId: 2, purchaseLineId: 2, purchaseId: 2, storageLocationId: 2, storageSubLocationId: null, quantity: 2 },
    { id: 3, lotId: 2, purchaseLineId: 2, purchaseId: 2, storageLocationId: 1, storageSubLocationId: null, quantity: 1 },
  ],
  'storage-locations': [{ id: 1, name: 'Main Humidor', isActive: true }, { id: 2, name: 'Pre Inventory', isActive: true }],
  'storage-sub-locations': [],
  'inventory-events': [
    { id: 10, eventType: 'SMOKED', lotId: 1, catalogCigarId: 1 },
    { id: 11, eventType: 'SMOKED', lotId: 1, catalogCigarId: 1 },
    { id: 12, eventType: 'SMOKED', lotId: 2, catalogCigarId: 2 },
  ],
  'smoking-journal-entries': [
    { id: 1, inventoryEventId: 10, rating: 8 },
    { id: 2, inventoryEventId: 11, rating: 9 },
    { id: 3, inventoryEventId: 12, rating: 10 },
  ],
}

const sortedCatalog = catalogRecordsForDisplay(records('catalog-cigars'))
testAssert(sortedCatalog[0].manufacturer === 'Alpha' && sortedCatalog[1].manufacturer === 'Bravo', 'Catalog alphabetical sorting is incorrect.')
testAssert(catalogRecordsForDisplay(records('catalog-cigars'), 'stock up').length === 1 && catalogRecordsForDisplay(records('catalog-cigars'), 'stock up')[0].id === 2, 'Catalog search did not match Buy Again notes.')
testAssert(catalogRecordsForDisplay(records('catalog-cigars'), 'connecticut')[0].id === 1, 'Catalog search did not match cigar attributes.')
const journalDefaults = smokingJournalBuyAgainDefaults({ lotId: 2 })
testAssert(journalDefaults.status === 'YES' && journalDefaults.notes === 'Stock up', 'Smoking Journal did not default to the Catalog Buy Again decision.')
let preInventory = preInventoryDashboardSummary()
testAssert(preInventory?.humidor.id === 2 && preInventory.totalQuantity === 2, 'Dashboard Pre Inventory summary is incorrect.')
let stagingRows = preInventoryWorklist(preInventory)
testAssert(stagingRows.length === 1 && stagingRows[0].cigar.id === 2, 'Pre Inventory worklist cigar selection is incorrect.')
testAssert(stagingRows[0].stagedQuantity === 2 && stagingRows[0].placedQuantity === 1 && stagingRows[0].totalQuantity === 3, 'Pre Inventory staged and placed quantities do not reconcile.')
testAssert(Math.abs(stagingRows[0].placementPercent - (100 / 3)) < 0.0001, 'Pre Inventory placement progress is incorrect.')
state.records['storage-locations'][1].isActive = false
preInventory = preInventoryDashboardSummary()
testAssert(preInventory === null, 'Archived Pre Inventory Humidor should not appear in the Dashboard summary.')
stagingRows = preInventoryWorklist(preInventory)
testAssert(stagingRows.length === 0, 'Archived Pre Inventory Humidor should not retain a worklist.')
state.records['storage-locations'][1].isActive = true

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
state.collectionBuyAgainFilter = 'NOT_EVALUATED'
metrics = currentCollectionMetrics()
testAssert(metrics.totalQuantity === 2 && metrics.items[0].cigar.manufacturer === 'Alpha', 'Collection Buy Again filtering is incorrect.')
state.collectionBuyAgainFilter = ''
state.collectionSearch = 'stock up'
metrics = currentCollectionMetrics()
testAssert(metrics.totalQuantity === 3 && metrics.items[0].cigar.manufacturer === 'Bravo', 'Collection Buy Again note search is incorrect.')
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
state.purchaseHistoryBuyAgainFilter = 'YES'
const yesHistory = purchaseHistoryRows()
testAssert(yesHistory.length === 2 && yesHistory.every((row) => row.cigar.id === 2), 'Purchase-history Buy Again filtering is incorrect.')
testAssert(purchaseHistoryTotalPaid(yesHistory) === 45, 'Buy Again filtered totalPaid allocation is incorrect.')
state.purchaseHistoryBuyAgainFilter = ''
const insights = buyAgainInsights()
testAssert(insights.counts.NOT_EVALUATED === 1 && insights.counts.YES === 1, 'Buy Again decision counts are incorrect.')
testAssert(insights.highlyRatedNotEvaluated.length === 1 && insights.highlyRatedNotEvaluated[0].cigar.id === 1 && insights.highlyRatedNotEvaluated[0].averageRating === 8.5, 'Highly rated unevaluated summary is incorrect.')
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
