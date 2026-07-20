/*
 * Filename: reporting-filters.js
 * Revision: 1.9.0
 * Description: Isolated assertions for Collection, Catalog, purchase-history, Buy Again, Smoking Journal, Activity, and inventory-aging report behavior.
 * Modified Date: 2026-07-20 09:30 ET
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
    { id: 1, purchaseLineId: 1, purchaseId: 1, catalogCigarId: 1, currentQuantity: 2, receivedDateSnapshot: '2025-01-01', costPerCigarSnapshot: '11.00', msrpPerCigarSnapshot: '15.00' },
    { id: 2, purchaseLineId: 2, purchaseId: 2, catalogCigarId: 2, currentQuantity: 3, receivedDateSnapshot: '2025-04-01', costPerCigarSnapshot: '11.00', msrpPerCigarSnapshot: '16.00' },
  ],
  'lot-location-balances': [
    { id: 1, lotId: 1, purchaseLineId: 1, purchaseId: 1, storageLocationId: 1, storageSubLocationId: null, quantity: 2 },
    { id: 2, lotId: 2, purchaseLineId: 2, purchaseId: 2, storageLocationId: 2, storageSubLocationId: null, quantity: 2 },
    { id: 3, lotId: 2, purchaseLineId: 2, purchaseId: 2, storageLocationId: 1, storageSubLocationId: null, quantity: 1 },
  ],
  'storage-locations': [{ id: 1, name: 'Main Humidor', isActive: true }, { id: 2, name: 'Pre Inventory', isActive: true }],
  'storage-sub-locations': [{ id: 5, storageLocationId: 1, name: 'Top Tray', isActive: true }],
  'inventory-events': [
    { id: 10, eventType: 'SMOKED', lotId: 1, catalogCigarId: 1, eventDate: '2026-01-05', quantity: 1, fromStorageLocationId: 1 },
    { id: 11, eventType: 'SMOKED', lotId: 1, catalogCigarId: 1, eventDate: '2026-02-05', quantity: 1, fromStorageLocationId: 1 },
    { id: 12, eventType: 'SMOKED', lotId: 2, catalogCigarId: 2, eventDate: '2026-03-05', quantity: 1, fromStorageLocationId: 2 },
    { id: 20, eventType: 'MOVE', lotId: 2, catalogCigarId: 2, eventDate: '2025-12-31', quantity: 1, fromStorageLocationId: 1, fromStorageSubLocationId: 5, toStorageLocationId: 2, notes: 'Moved for staging' },
    { id: 21, eventType: 'PURCHASE_RECEIPT', lotId: 2, purchaseId: 2, catalogCigarId: 2, eventDate: '2026-04-01', quantity: 3, storageLocationId: 2 },
    { id: 22, eventType: 'INVENTORY_ADJUSTMENT', lotId: 2, catalogCigarId: 2, eventDate: '2026-04-02', quantity: 1, quantityChange: -1, storageLocationId: 2, notes: 'Physical count correction' },
  ],
  'smoking-journal-entries': [
    { id: 1, inventoryEventId: 10, rating: 8, notes: 'Cedar and cream' },
    { id: 2, inventoryEventId: 11, rating: 9, notes: 'Pepper finish' },
    { id: 3, inventoryEventId: 12, rating: 10, notes: 'Dark chocolate' },
  ],
}

const sortedCatalog = catalogRecordsForDisplay(records('catalog-cigars'))
testAssert(sortedCatalog[0].manufacturer === 'Alpha' && sortedCatalog[1].manufacturer === 'Bravo', 'Catalog alphabetical sorting is incorrect.')
testAssert(catalogRecordsForDisplay(records('catalog-cigars'), 'stock up').length === 1 && catalogRecordsForDisplay(records('catalog-cigars'), 'stock up')[0].id === 2, 'Catalog search did not match Buy Again notes.')
testAssert(catalogRecordsForDisplay(records('catalog-cigars'), 'connecticut')[0].id === 1, 'Catalog search did not match cigar attributes.')
const journalDefaults = smokingJournalBuyAgainDefaults({ lotId: 2 })
testAssert(journalDefaults.status === 'YES' && journalDefaults.notes === 'Stock up', 'Smoking Journal did not default to the Catalog Buy Again decision.')
let catalogJournalRows = smokingJournalHistoryRows(1)
let catalogJournalMetrics = smokingJournalHistoryMetrics(catalogJournalRows)
testAssert(catalogJournalRows.length === 2 && catalogJournalRows[0].event.id === 11 && catalogJournalRows[1].event.id === 10, 'Catalog Smoking Journal history is not ordered newest first.')
testAssert(catalogJournalRows.every((row) => row.locationLabel === 'Main Humidor'), 'Catalog Smoking Journal history lost its source Humidor context.')
testAssert(catalogJournalMetrics.totalEntries === 2 && catalogJournalMetrics.effectiveQuantity === 2, 'Catalog Smoking Journal entry or effective quantity totals are incorrect.')
testAssert(catalogJournalMetrics.averageRating === 8.5 && catalogJournalMetrics.lastSmokedDate === '2026-02-05', 'Catalog Smoking Journal rating or last-smoked summary is incorrect.')
state.reportPeriod = 'lifetime'
state.reportRemovalType = 'all'
state.reportSearch = 'pepper finish'
testAssert(filteredRemovalEvents().length === 1 && filteredRemovalEvents()[0].id === 11, 'Removal History search did not match Smoking Journal notes.')
state.reportSearch = ''
state.activityType = 'MOVE'
testAssert(filteredActivityEvents().length === 1 && filteredActivityEvents()[0].id === 20, 'Activity event-type filtering is incorrect.')
testAssert(activityEventLocationLabel(filteredActivityEvents()[0]) === 'Main Humidor / Top Tray → Pre Inventory', 'Activity move location context is incorrect.')
state.activityType = 'all'
state.activityHumidorId = '2'
testAssert(filteredActivityEvents().map((event) => event.id).join(',') === '22,21,12,20', 'Activity Humidor filtering must include source, destination, and assigned locations.')
state.activityHumidorId = ''
state.activityLotId = '1'
testAssert(filteredActivityEvents().length === 2 && filteredActivityEvents().every((event) => Number(event.lotId) === 1), 'Activity Lot filtering is incorrect.')
state.activityLotId = ''
state.activitySearch = 'physical count correction'
testAssert(filteredActivityEvents().length === 1 && filteredActivityEvents()[0].id === 22, 'Activity search did not match event notes.')
state.activitySearch = ''
state.activityPeriod = 'custom'
state.activityCustomStart = '2026-04-01'
state.activityCustomEnd = '2026-04-01'
testAssert(filteredActivityEvents().length === 1 && filteredActivityEvents()[0].id === 21, 'Activity custom-date filtering is incorrect.')
state.activityPeriod = 'lifetime'
state.activityCustomStart = ''
state.activityCustomEnd = ''
state.showAllActivity = false
testAssert(activityEventsForDisplay(filteredActivityEvents()).length === 6, 'Activity recent-event display unexpectedly removed fixture events.')
let preInventory = preInventoryDashboardSummary()
testAssert(preInventory?.humidor.id === 2 && preInventory.totalQuantity === 2, 'Dashboard Pre Inventory summary is incorrect.')
let stagingRows = preInventoryWorklist(preInventory)
testAssert(stagingRows.length === 1 && stagingRows[0].cigar.id === 2, 'Pre Inventory worklist cigar selection is incorrect.')
testAssert(stagingRows[0].stagedQuantity === 2 && stagingRows[0].placedQuantity === 1 && stagingRows[0].totalQuantity === 3, 'Pre Inventory staged and placed quantities do not reconcile.')
testAssert(Math.abs(stagingRows[0].placementPercent - (100 / 3)) < 0.0001, 'Pre Inventory placement progress is incorrect.')
testAssert(inventoryEventCanBeReversed({ eventType: 'INVENTORY_ADJUSTMENT', id: 99 }), 'Inventory adjustments must support append-only reversal.')
testAssert(inventoryEventDisplayQuantity({ eventType: 'INVENTORY_ADJUSTMENT', quantity: 2, quantityChange: -2 }) === -2, 'Activity must display a signed adjustment quantity.')
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

let agingRows = inventoryAgingRows('2025-05-01')
let agingSummary = summarizeInventoryAging(agingRows)
testAssert(inventoryAgeDays('2025-02-30', '2025-05-01') === null, 'Inventory Aging accepted an invalid calendar date.')
testAssert(inventoryAgingBucket(inventoryAgeDays('2025-05-02', '2025-05-01')).key === 'future', 'Inventory Aging did not flag a future receipt date.')
testAssert(agingRows.length === 3 && agingSummary.quantity === 5 && agingSummary.lotCount === 2, 'Inventory Aging must reconcile split balances without double-counting Lots.')
testAssert(agingSummary.weightedAverageAge === 66 && agingSummary.knownAgeQuantity === 5, 'Inventory Aging weighted average is incorrect.')
testAssert(agingSummary.totalCostBasis === 55 && agingSummary.totalMsrp === 78, 'Inventory Aging cost basis or MSRP does not reconcile.')
const agingBuckets = inventoryAgingBucketSummaries(agingRows)
testAssert(agingBuckets.find((item) => item.bucket.key === '0-30').quantity === 3, 'Inventory Aging 0-30 day bucket is incorrect.')
testAssert(agingBuckets.find((item) => item.bucket.key === '91-180').quantity === 2, 'Inventory Aging 91-180 day bucket is incorrect.')
state.agingManufacturer = 'Bravo'
agingRows = inventoryAgingRows('2025-05-01')
testAssert(summarizeInventoryAging(agingRows).quantity === 3 && agingRows.every((row) => row.cigar.id === 2), 'Inventory Aging manufacturer filter is incorrect.')
state.agingManufacturer = ''
state.agingHumidorId = '1'
agingRows = inventoryAgingRows('2025-05-01')
testAssert(summarizeInventoryAging(agingRows).quantity === 3 && summarizeInventoryAging(agingRows).lotCount === 2, 'Inventory Aging Humidor filter is incorrect.')
state.agingHumidorId = ''
const lotTwo = state.records.lots.find((lot) => lot.id === 2)
const lotTwoCost = lotTwo.costPerCigarSnapshot
const lotTwoDate = lotTwo.receivedDateSnapshot
lotTwo.costPerCigarSnapshot = null
lotTwo.receivedDateSnapshot = null
agingRows = inventoryAgingRows('2025-05-01')
agingSummary = summarizeInventoryAging(agingRows)
testAssert(agingSummary.totalCostBasis === null && agingSummary.knownCostQuantity === 2, 'Inventory Aging must preserve unknown cost instead of reporting a complete total.')
testAssert(inventoryAgingBucketSummaries(agingRows).find((item) => item.bucket.key === 'unknown').quantity === 3, 'Inventory Aging must retain unknown receipt dates in an explicit bucket.')
lotTwo.costPerCigarSnapshot = lotTwoCost
lotTwo.receivedDateSnapshot = lotTwoDate

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

function mockClassList() {
  const values = new Set()
  return {
    add(value) { values.add(value) },
    toggle(value, enabled) { if (enabled) values.add(value); else values.delete(value) },
    contains(value) { return values.has(value) },
  }
}
const responsiveCells = [{ colSpan: 1, dataset: {} }, { colSpan: 1, dataset: {} }]
const responsiveRow = { cells: responsiveCells, classList: mockClassList() }
const responsiveDetailRow = { cells: [{ colSpan: 2, dataset: {} }], classList: mockClassList() }
const responsiveTable = {
  tHead: { rows: [{ cells: [{ textContent: 'Cigar' }, { textContent: 'On Hand' }] }] },
  tBodies: [{ rows: [responsiveRow, responsiveDetailRow] }],
  classList: mockClassList(),
}
enhanceResponsiveTables({ querySelectorAll: () => [responsiveTable] })
testAssert(responsiveTable.classList.contains('responsive-table'), 'Responsive table enhancement did not mark the table.')
testAssert(responsiveCells[0].dataset.label === 'Cigar' && responsiveCells[1].dataset.label === 'On Hand', 'Responsive table enhancement did not assign column labels.')
testAssert(responsiveDetailRow.classList.contains('responsive-detail-row'), 'Responsive table enhancement did not preserve an expanded detail row.')
state.collectionHumidorFilterId = null
state.collectionSectionFilterId = 10
state.selectedCollectionCigarId = 2
selectCollectionHumidor('2')
testAssert(state.collectionHumidorFilterId === 2 && state.collectionSectionFilterId === null && state.selectedCollectionCigarId === null, 'Humidor navigation did not apply a clean Collection filter.')
testAssert(balanceAllowsCountReconciliation({ humidor: { name: 'Pre Inventory', isActive: true } }), 'Active Pre Inventory balance should allow count reconciliation.')
testAssert(!balanceAllowsCountReconciliation({ humidor: { name: 'Main Humidor', isActive: true } }), 'Permanently placed balance should not show count reconciliation.')
testAssert(!balanceAllowsCountReconciliation({ humidor: { name: 'Pre Inventory', isActive: false } }), 'Archived Pre Inventory balance should not show count reconciliation.')
state.records['inventory-events'].push({ id: 13, eventType: 'REVERSAL', reversesInventoryEventId: 11 })
catalogJournalRows = smokingJournalHistoryRows(1)
catalogJournalMetrics = smokingJournalHistoryMetrics(catalogJournalRows)
testAssert(catalogJournalRows.find((row) => row.event.id === 11)?.reversed === true, 'Catalog Smoking Journal did not mark reversed smoke history.')
testAssert(catalogJournalMetrics.totalEntries === 2 && catalogJournalMetrics.effectiveQuantity === 1, 'Reversed Smoking Journal history was not excluded from effective quantity.')
testAssert(catalogJournalMetrics.averageRating === 8 && catalogJournalMetrics.lastSmokedDate === '2026-01-05', 'Reversed Smoking Journal history was not excluded from effective rating and date summaries.')
state.activitySearch = 'event 11'
const relatedActivity = filteredActivityEvents()
testAssert(relatedActivity.length === 2 && relatedActivity.some((event) => event.id === 11) && relatedActivity.some((event) => event.id === 13), 'Activity event-reference search did not link an original event and its reversal.')
testAssert(activityRelationshipEvent(state.records['inventory-events'].find((event) => event.id === 11))?.id === 13, 'Activity original event did not resolve its reversal relationship.')
testAssert(activityRelationshipEvent(state.records['inventory-events'].find((event) => event.id === 13))?.id === 11, 'Activity reversal did not resolve its original event relationship.')
state.activitySearch = ''
state.selectedCollectionCigarId = null
toggleCollectionCigarSelection('2')
testAssert(state.selectedCollectionCigarId === 2, 'Whole-card Collection selection did not expand the requested cigar.')
toggleCollectionCigarSelection(2)
testAssert(state.selectedCollectionCigarId === null, 'Whole-card Collection selection did not collapse the selected cigar.')
console.log('Reporting filter assertions passed.')
`

vm.runInNewContext(`${appSource}\n${assertions}`, { console })
