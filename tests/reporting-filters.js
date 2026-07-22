/*
 * Filename: reporting-filters.js
 * Revision: 1.10.10
 * Description: Isolated assertions for Collection, Catalog, purchase-history, purchase-trend, rating breakdown, Buy Again, Smoking Journal, Activity, and inventory-aging report behavior.
 * Modified Date: 2026-07-22 09:35 ET
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

const savedLocalStorage = new Map()
globalThis.localStorage = {
  getItem(key) {
    return savedLocalStorage.has(String(key)) ? savedLocalStorage.get(String(key)) : null
  },
  setItem(key, value) {
    savedLocalStorage.set(String(key), String(value))
  },
  removeItem(key) {
    savedLocalStorage.delete(String(key))
  },
}

state.records = {
  'catalog-cigars': [
    { id: 2, manufacturer: 'Bravo', series: 'Maduro', vitola: 'Toro', length: '6.00', ringGauge: 54, strength: 'Full', wrapper: 'Maduro', country: 'Dominican Republic', buyAgainStatus: 'YES', buyAgainNotes: 'Stock up' },
    { id: 1, manufacturer: 'Alpha', series: 'Reserve', vitola: 'Robusto', length: '5.00', ringGauge: 50, strength: 'Mild', wrapper: 'Connecticut', country: 'Nicaragua', buyAgainStatus: null, buyAgainNotes: 'Evaluate after another smoke' },
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
let ratingRows = ratingBreakdownRows()
testAssert(ratingRows.length === 2 && ratingRows[0].label === 'Mild' && ratingRows[0].averageRating === 8.5 && ratingRows[0].ratingCount === 2 && ratingRows[1].label === 'Full' && ratingRows[1].averageRating === 10, 'Rating Breakdown strength summary is incorrect.')
state.ratingBreakdownDimension = 'wrapper'
ratingRows = ratingBreakdownRows()
testAssert(ratingRows.length === 2 && ratingRows[0].label === 'Connecticut' && ratingRows[0].averageRating === 8.5 && ratingRows[1].label === 'Maduro' && ratingRows[1].averageRating === 10, 'Rating Breakdown wrapper summary is incorrect.')
state.ratingBreakdownDimension = 'origin'
ratingRows = ratingBreakdownRows()
testAssert(ratingRows.length === 2 && ratingRows[0].label === 'Dominican Republic' && ratingRows[0].averageRating === 10 && ratingRows[1].label === 'Nicaragua' && ratingRows[1].averageRating === 8.5, 'Rating Breakdown origin summary is incorrect.')
state.ratingBreakdownDimension = 'size'
ratingRows = ratingBreakdownRows()
testAssert(ratingRows.length === 2 && ratingRows[0].label === 'Robusto (5.00 × 50)' && ratingRows[0].averageRating === 8.5 && ratingRows[1].label === 'Toro (6.00 × 54)' && ratingRows[1].averageRating === 10, 'Rating Breakdown size summary is incorrect.')
state.ratingBreakdownDimension = 'strength'
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
const preInventorySummary = preInventoryReconciliationSummary(preInventory)
testAssert(preInventorySummary?.stagedQuantity === 2 && preInventorySummary?.placedQuantity === 1 && preInventorySummary?.totalQuantity === 3, 'Pre Inventory reconciliation summary is incorrect.')
testAssert(Math.abs(preInventorySummary.placementPercent - (100 / 3)) < 0.0001, 'Pre Inventory reconciliation completion percent is incorrect.')
testAssert(preInventoryFirstStagedCigarId(preInventory) === 2, 'Pre Inventory focus target did not resolve the first staged cigar.')
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
state.collectionSort = 'location'
state.collectionDirection = 'desc'
state.collectionHumidorFilterId = 2
state.collectionSectionFilterId = 5
state.collectionStrengthFilter = 'full'
state.collectionBuyAgainFilter = 'YES'
state.collectionSearch = 'stock'
state.selectedCollectionCigarId = 1
state.collectionScrollTargetCigarId = 1
testAssert(saveCollectionView('  Work In Progress  '), 'Collection saved view should accept a trimmed name.')
testAssert(collectionSavedViews().length === 1 && collectionSavedViews()[0].name === 'Work In Progress', 'Collection saved view was not stored correctly.')
state.collectionSort = 'alpha'
state.collectionDirection = 'asc'
state.collectionHumidorFilterId = null
state.collectionSectionFilterId = null
state.collectionStrengthFilter = ''
state.collectionBuyAgainFilter = ''
state.collectionSearch = ''
state.selectedCollectionCigarId = null
state.collectionScrollTargetCigarId = null
testAssert(applyCollectionView('Work In Progress'), 'Collection saved view should apply by name.')
testAssert(state.collectionSort === 'location' && state.collectionDirection === 'desc' && state.collectionHumidorFilterId === 2 && state.collectionSectionFilterId === 5 && state.collectionStrengthFilter === 'full' && state.collectionBuyAgainFilter === 'YES' && state.collectionSearch === 'stock' && state.selectedCollectionCigarId === null && state.collectionScrollTargetCigarId === null, 'Collection saved view did not restore the expected filters.')
testAssert(deleteCollectionView('Work In Progress'), 'Collection saved view should delete by name.')
testAssert(collectionSavedViews().length === 0, 'Collection saved view delete did not clear storage.')
state.purchaseHistoryGroup = 'manufacturer'
state.purchaseHistoryVendorId = '1'
state.purchaseHistoryManufacturer = 'alpha'
state.purchaseHistoryBuyAgainFilter = 'YES'
testAssert(savePurchaseHistoryView('  Report Snapshot  '), 'Purchase History saved view should accept a trimmed name.')
testAssert(purchaseHistorySavedViews().length === 1 && purchaseHistorySavedViews()[0].name === 'Report Snapshot', 'Purchase History saved view was not stored correctly.')
state.purchaseHistoryGroup = 'vendor'
state.purchaseHistoryVendorId = ''
state.purchaseHistoryManufacturer = ''
state.purchaseHistoryBuyAgainFilter = ''
testAssert(applyPurchaseHistoryView('Report Snapshot'), 'Purchase History saved view should apply by name.')
testAssert(state.purchaseHistoryGroup === 'manufacturer' && state.purchaseHistoryVendorId === '1' && state.purchaseHistoryManufacturer === 'alpha' && state.purchaseHistoryBuyAgainFilter === 'YES', 'Purchase History saved view did not restore the expected filters.')
testAssert(deletePurchaseHistoryView('Report Snapshot'), 'Purchase History saved view should delete by name.')
testAssert(purchaseHistorySavedViews().length === 0, 'Purchase History saved view delete did not clear storage.')
state.purchaseTrendPeriod = 'month'
state.purchaseRecordsFilterType = 'manufacturer'
state.purchaseRecordsFilterValue = 'bravo'
state.purchaseRecordsFilterLabel = 'Bravo'
state.purchaseHistoryGroup = 'manufacturer'
state.purchaseHistoryVendorId = ''
state.purchaseHistoryManufacturer = 'alpha'
state.purchaseHistoryBuyAgainFilter = 'YES'
state.ratingBreakdownDimension = 'wrapper'
state.reportPeriod = 'custom'
state.reportRemovalType = 'SMOKED'
state.reportSearch = 'pepper'
state.agingManufacturer = 'Bravo'
state.agingHumidorId = '2'
state.selectedAgingBucketKey = '91-180'
state.activityPeriod = 'custom'
state.activityType = 'MOVE'
state.activitySearch = 'event 20'
state.activityLotId = '2'
state.activityHumidorId = '2'
state.activityCustomStart = '2026-01-01'
state.activityCustomEnd = '2026-12-31'
state.showAllActivity = true
state.reportSectionState = {
  purchaseTrend: true,
  purchaseHistory: false,
  ratingBreakdown: true,
  inventoryAging: true,
  removalHistory: false,
  activity: true,
}
testAssert(saveReportsView('  Reports Snapshot  '), 'Reports saved view should accept a trimmed name.')
testAssert(reportsSavedViews().length === 1 && reportsSavedViews()[0].name === 'Reports Snapshot', 'Reports saved view was not stored correctly.')
state.purchaseTrendPeriod = 'year'
state.purchaseRecordsFilterType = ''
state.purchaseRecordsFilterValue = ''
state.purchaseRecordsFilterLabel = ''
state.purchaseHistoryGroup = 'vendor'
state.purchaseHistoryVendorId = ''
state.purchaseHistoryManufacturer = ''
state.purchaseHistoryBuyAgainFilter = ''
state.ratingBreakdownDimension = 'strength'
state.reportPeriod = 'lifetime'
state.reportRemovalType = 'all'
state.reportSearch = ''
state.agingManufacturer = ''
state.agingHumidorId = ''
state.selectedAgingBucketKey = null
state.activityPeriod = 'lifetime'
state.activityType = 'all'
state.activitySearch = ''
state.activityLotId = ''
state.activityHumidorId = ''
state.activityCustomStart = ''
state.activityCustomEnd = ''
state.showAllActivity = false
state.reportSectionState = {
  purchaseTrend: false,
  purchaseHistory: false,
  ratingBreakdown: false,
  inventoryAging: false,
  removalHistory: false,
  activity: false,
}
testAssert(applyReportsView('Reports Snapshot'), 'Reports saved view should apply by name.')
testAssert(state.purchaseTrendPeriod === 'month' && state.purchaseRecordsFilterType === 'manufacturer' && state.purchaseRecordsFilterValue === 'bravo' && state.purchaseRecordsFilterLabel === 'Bravo' && state.purchaseHistoryGroup === 'manufacturer' && state.purchaseHistoryManufacturer === 'alpha' && state.purchaseHistoryBuyAgainFilter === 'YES' && state.ratingBreakdownDimension === 'wrapper' && state.reportPeriod === 'custom' && state.reportRemovalType === 'SMOKED' && state.reportSearch === 'pepper' && state.agingManufacturer === 'Bravo' && state.agingHumidorId === '2' && state.selectedAgingBucketKey === '91-180' && state.activityPeriod === 'custom' && state.activityType === 'MOVE' && state.activitySearch === 'event 20' && state.activityLotId === '2' && state.activityHumidorId === '2' && state.activityCustomStart === '2026-01-01' && state.activityCustomEnd === '2026-12-31' && state.showAllActivity === true, 'Reports saved view did not restore the expected filters.')
testAssert(state.reportSectionState.purchaseTrend === true && state.reportSectionState.ratingBreakdown === true && state.reportSectionState.inventoryAging === true && state.reportSectionState.activity === true, 'Reports saved view did not restore report section open state.')
testAssert(deleteReportsView('Reports Snapshot'), 'Reports saved view should delete by name.')
testAssert(reportsSavedViews().length === 0, 'Reports saved view delete did not clear storage.')
state.purchaseTrendPeriod = 'year'
state.purchaseRecordsFilterType = ''
state.purchaseRecordsFilterValue = ''
state.purchaseRecordsFilterLabel = ''
state.purchaseHistoryGroup = 'vendor'
state.purchaseHistoryVendorId = ''
state.purchaseHistoryManufacturer = ''
state.purchaseHistoryBuyAgainFilter = ''
state.reportPeriod = 'lifetime'
state.reportRemovalType = 'all'
state.reportSearch = ''
state.agingManufacturer = ''
state.agingHumidorId = ''
state.selectedAgingBucketKey = null
state.activityPeriod = 'lifetime'
state.activityType = 'all'
state.activitySearch = ''
state.activityLotId = ''
state.activityHumidorId = ''
state.activityCustomStart = ''
state.activityCustomEnd = ''
state.showAllActivity = false
state.reportSectionState = {
  purchaseTrend: false,
  purchaseHistory: false,
  inventoryAging: false,
  removalHistory: false,
  activity: false,
}

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
state.purchaseHistoryManufacturer = ''
state.purchaseHistoryBuyAgainFilter = ''
let history = purchaseHistoryRows()
testAssert(history.length === 2, 'Vendor purchase-history filter is incorrect.')
testAssert(purchaseHistoryTotalPaid(history) === 30, 'Vendor totalPaid summary is incorrect.')
state.purchaseHistoryGroup = 'manufacturer'
state.purchaseHistoryManufacturer = 'bravo'
state.purchaseHistoryVendorId = ''
state.purchaseHistoryBuyAgainFilter = ''
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
state.purchaseTrendPeriod = 'year'
let trendRows = purchaseTrendRows()
testAssert(trendRows.length === 1 && trendRows[0].purchaseCount === 2 && trendRows[0].cigarCount === 6, 'Purchase trend yearly summary is incorrect.')
testAssert(trendRows[0].totalPaid === 65 && trendRows[0].averagePaidPerCigar === 10.83, 'Purchase trend yearly total paid or average per cigar is incorrect.')
state.purchaseTrendPeriod = 'month'
trendRows = purchaseTrendRows()
testAssert(trendRows.length === 2 && trendRows[0].label === 'Feb 2026' && trendRows[0].totalPaid === 35 && trendRows[1].label === 'Jan 2026' && trendRows[1].totalPaid === 30, 'Purchase trend monthly grouping is incorrect.')
const vendorTrendRows = purchaseTrendVendorRows()
testAssert(vendorTrendRows.length === 2 && vendorTrendRows[0].label === 'Vendor Two' && vendorTrendRows[0].totalPaid === 35 && vendorTrendRows[1].label === 'Vendor One' && vendorTrendRows[1].totalPaid === 30, 'Purchase trend vendor breakdown is incorrect.')
const manufacturerTrendRows = purchaseTrendManufacturerRows()
testAssert(manufacturerTrendRows.length === 2 && manufacturerTrendRows.find((row) => row.label === 'Alpha')?.totalPaid === 20 && manufacturerTrendRows.find((row) => row.label === 'Bravo')?.totalPaid === 45, 'Purchase trend manufacturer breakdown is incorrect.')
testAssert(manufacturerTrendRows.find((row) => row.label === 'Bravo')?.averagePaidPerCigar === 11.25, 'Purchase trend manufacturer average paid per cigar is incorrect.')
testAssert(manufacturerTrendRows.map((row) => row.label).join(',') === 'Alpha,Bravo', 'Purchase trend manufacturer breakdown is not alphabetical.')
state.purchaseRecordsFilterType = 'month'
state.purchaseRecordsFilterValue = '2026-02'
state.purchaseRecordsFilterLabel = 'Feb 2026'
let filteredPurchases = purchaseRecordsForDisplay()
testAssert(filteredPurchases.length === 1 && filteredPurchases[0].id === 2, 'Purchase trend month click-through is incorrect.')
state.purchaseRecordsFilterType = 'vendor'
state.purchaseRecordsFilterValue = '1'
state.purchaseRecordsFilterLabel = 'Vendor One'
filteredPurchases = purchaseRecordsForDisplay()
testAssert(filteredPurchases.length === 1 && filteredPurchases[0].id === 1, 'Purchase trend vendor click-through is incorrect.')
state.purchaseRecordsFilterType = 'manufacturer'
state.purchaseRecordsFilterValue = 'bravo'
state.purchaseRecordsFilterLabel = 'Bravo'
filteredPurchases = purchaseRecordsForDisplay()
testAssert(filteredPurchases.length === 2 && filteredPurchases[0].id === 2 && filteredPurchases[1].id === 1, 'Purchase trend manufacturer click-through is incorrect.')
state.purchaseRecordsFilterType = ''
state.purchaseRecordsFilterValue = ''
state.purchaseRecordsFilterLabel = ''
openCatalogForBuyAgainCigar(1)
testAssert(state.selectedCatalogHistoryCigarId === 1 && state.catalogSearch === '' && state.activePage === 'Catalog', 'Buy Again drill-through did not select the Catalog cigar.')
state.selectedCatalogHistoryCigarId = null
state.ratingBreakdownDimension = 'strength'
const ratingDrillRow = ratingBreakdownRows().find((row) => row.label === 'Mild')
openCatalogForRatingBreakdown(ratingDrillRow)
testAssert(state.selectedCatalogHistoryCigarId === null && state.catalogSearch === 'Mild' && state.activePage === 'Catalog', 'Rating Breakdown drill-through did not open the matching Catalog subset.')
state.catalogSearch = ''
state.agingHumidorId = '2'
openCollectionForAgingCigar(2)
testAssert(state.collectionHumidorFilterId === 2 && state.collectionSectionFilterId === null && state.selectedCollectionCigarId === 2 && state.collectionScrollTargetCigarId === 2 && state.activePage === 'Collection', 'Inventory Aging drill-through did not open the filtered Collection view.')
state.agingHumidorId = ''
state.activePage = 'Dashboard'
state.purchaseTrendPeriod = 'year'
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
testAssert(activityEventContextTarget(state.records['inventory-events'].find((event) => event.id === 21))?.label === 'Open Purchase', 'Activity purchase context target is incorrect.')
testAssert(activityEventContextTarget(state.records['inventory-events'].find((event) => event.id === 20))?.label === 'Open Collection', 'Activity collection context target is incorrect.')
state.purchaseRecordsFilterType = 'vendor'
state.purchaseRecordsFilterValue = 'temp'
state.purchaseRecordsFilterLabel = 'Temp'
state.selectedPurchaseId = null
openActivityEventContext(state.records['inventory-events'].find((event) => event.id === 21))
testAssert(state.activePage === 'Purchases' && state.selectedPurchaseId === 2 && state.purchaseRecordsFilterType === '' && state.purchaseRecordsFilterValue === '' && state.purchaseRecordsFilterLabel === '', 'Activity purchase drill-through did not open the matching Purchases context.')
state.activePage = 'Dashboard'
state.selectedPurchaseId = null
state.collectionHumidorFilterId = null
state.collectionSectionFilterId = 10
state.collectionStrengthFilter = 'full'
state.collectionBuyAgainFilter = 'YES'
state.collectionSearch = 'search'
state.selectedCollectionCigarId = 1
state.collectionScrollTargetCigarId = 1
openActivityEventContext(state.records['inventory-events'].find((event) => event.id === 20))
testAssert(state.activePage === 'Collection' && state.collectionHumidorFilterId === 2 && state.collectionSectionFilterId === null && state.collectionStrengthFilter === '' && state.collectionBuyAgainFilter === '' && state.collectionSearch === '' && state.selectedCollectionCigarId === 2 && state.collectionScrollTargetCigarId === 2, 'Activity collection drill-through did not open the filtered Collection context.')
state.activePage = 'Dashboard'
state.collectionHumidorFilterId = null
state.collectionSectionFilterId = null
state.collectionStrengthFilter = ''
state.collectionBuyAgainFilter = ''
state.collectionSearch = ''
state.selectedCollectionCigarId = null
state.collectionScrollTargetCigarId = null
state.selectedCollectionCigarId = null
toggleCollectionCigarSelection('2')
testAssert(state.selectedCollectionCigarId === 2, 'Whole-card Collection selection did not expand the requested cigar.')
toggleCollectionCigarSelection(2)
testAssert(state.selectedCollectionCigarId === null, 'Whole-card Collection selection did not collapse the selected cigar.')
console.log('Reporting filter assertions passed.')
`

vm.runInNewContext(`${appSource}\n${assertions}`, { console })
