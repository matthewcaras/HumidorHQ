<!--
Filename: file-map.md
Revision: 1.0.0
Description: Project documentation and implementation notes.
Modified Date: 2026-07-15 00:13 ET
-->

# PHP/JSON Conversion File Map

## Acceptance Checklist
- [x] Every current upstream backend source file has a mapped PHP target.
- [x] `src/services/api.ts` is mapped to its PHP-facing compatibility work.
- [x] `prisma/schema.prisma` is mapped to runtime JSON files and migration scripts.

| Upstream source | PHP target | Responsibility | Status | Notes |
| --- | --- | --- | --- | --- |
| `server/index.ts` | `api/index.php`, `api/bootstrap.php`, `api/lib/Response.php`, `api/lib/Validation.php` | Route dispatch and response contract | Planned | Keep method handling and `/api` route shapes stable for the React frontend, including Smoking Journal routes added in `upstream/main@37df9a0`. |
| `server/services/dashboardService.ts` | `api/lib/services/DashboardService.php` | Dashboard aggregates and issues | Planned | Verify totals, counts, and issue ordering against the Node implementation. |
| `server/services/catalogService.ts` | `api/lib/services/CatalogService.php` | Catalog reads, writes, archive, and restore behavior | Planned | Preserve archive/restore semantics and catalog summaries. |
| `server/services/catalogManagementService.ts` | `api/lib/services/CatalogManagementService.php` | Catalog management list, details, usage summaries, and archive visibility | Planned | Keep management filters, sort behavior, usage counts, and current-location summaries aligned with the React Catalog page. |
| `server/services/humidorService.ts` | `api/lib/services/HumidorService.php` | Humidor CRUD, archive behavior, organization type, and sub-location setup | Planned | Preserve active/inactive behavior and generated shelf/drawer/custom sections. |
| `server/services/vendorService.ts` | `api/lib/services/VendorService.php` | Vendor CRUD, permanent identity, active/archive behavior, and search | Planned | Preserve `nameKey` behavior and prevent duplicate active vendor identities. |
| `server/services/purchaseService.ts` | `api/lib/services/PurchaseService.php` | Purchase CRUD, purchase lines, notes-only updates, receipt/edit state, and allocation snapshots | Planned | Coordinate with `PurchaseAllocations.php` and write purchase, line, lot, and event records consistently. |
| `server/services/receiveStoreService.ts` | `api/lib/services/ReceiveStoreService.php` | Receive a purchase line into storage, create lots, balances, and inventory events | Planned | Must lock all affected JSON files in one write transaction equivalent. |
| `server/services/moveService.ts` | `api/lib/services/MoveService.php` | Move lot quantities between sub-locations and create move events | Planned | Must reconcile source/destination balances and total current quantity. |
| `server/services/removalService.ts` | `api/lib/services/RemovalService.php` | Remove smoked, gifted, or discarded quantities from inventory | Planned | Smoking Journal depends on SMOKED inventory events created here. |
| `server/services/reportsService.ts` | `api/lib/services/ReportsService.php` | Removal history reports, filters, sorting, paging, and totals | Planned | Preserve event-level cost/MSRP/savings calculations. |
| `server/services/activityReportsService.ts` | `api/lib/services/ActivityReportsService.php` | Full inventory activity report, filters, sorting, paging, summaries, and issues | Planned | Must include journal-related SMOKED events without changing existing event semantics. |
| `server/services/collectionService.ts` | `api/lib/services/CollectionService.php` | Collection list, cigar details, location summaries, search, and issue reporting | Planned | Preserve matching-location behavior and lot-level detail fields. |
| `server/services/collectionHumidorService.ts` | `api/lib/services/CollectionHumidorService.php` | Humidor collection summaries and storage-section details | Planned | Preserve occupied sub-location counts, oldest dates, and capacity usage. |
| `server/services/smokingJournalService.ts` | `api/lib/services/SmokingJournalService.php` | Smoking Journal read, upsert, delete, event validation, and response shaping | Planned | New in `upstream/main@37df9a0`; only SMOKED inventory events can have journal entries. |
| `server/utils/inventoryAccounting.ts` | `api/lib/utils/InventoryAccounting.php` | Decimal normalization, millionths math, inventory totals, and accounting helpers | Planned | Shared by dashboard, reports, collection, and journal response cost/MSRP fields. |
| `server/utils/purchaseAllocations.ts` | `api/lib/utils/PurchaseAllocations.php` | Purchase cost allocation across lines | Planned | Preserve rounding and proportional allocation behavior. |
| `server/utils/searchKeys.ts` | `api/lib/utils/SearchKeys.php` | Normalized search keys for catalog and vendor identity | Planned | Keep search behavior consistent across TS and PHP runtimes. |
| `src/services/api.ts` | `src/services/api.ts` compatibility shim plus PHP endpoint base-path handling | Frontend API contract and PHP endpoint compatibility | Planned | Change the runtime base URL, but keep success/error envelopes and Smoking Journal client functions unchanged. |
| `prisma/schema.prisma` | `data/*.json`, `data/counters.json`, and migration tooling under `scripts/` | Runtime JSON schema and one-time SQLite-to-JSON migration | Planned | Preserve IDs, relationships, historical inventory records, and `SmokingJournalEntry` rows in JSON form. |
| `prisma/migrations/20260713232934_add_smoking_journal/migration.sql` | `data/smoking-journal-entries.json`, `data/counters.json`, and `scripts/export-sqlite-to-json.mjs` | Smoking Journal data migration | Planned | Adds `smoking-journal-entries` storage keyed by unique `inventoryEventId`. |
| `src/components/journal/SmokingJournalPanel.tsx` | `api/lib/services/SmokingJournalService.php`, `src/services/api.ts` | Frontend journal workflow and API expectations | Planned | Frontend requires get, save, and delete flows plus protected event context fields. |
| `src/components/collection/RemoveLotPanel.tsx` | `api/lib/services/RemovalService.php`, `api/lib/services/SmokingJournalService.php` | Opens journal after smoked removals | Planned | PHP removal response must continue exposing the inventory event needed by the journal panel. |
| `src/components/collection/CollectionDetailsPanels.tsx` | `api/lib/services/CollectionService.php`, `api/lib/services/SmokingJournalService.php` | Collection detail workflow integration with journal panel | Planned | Verify journal launch points still have event IDs after PHP conversion. |
| `src/pages/Collection.tsx` | `api/lib/services/CollectionService.php`, `api/lib/services/SmokingJournalService.php` | Collection page state integration for journal panel | Planned | Review whenever journal modal state or API response dependencies change. |
| `src/pages/Humidors.tsx` | `api/lib/services/CollectionHumidorService.php`, `api/lib/services/SmokingJournalService.php` | Humidor page state integration for journal panel | Planned | Review whenever journal modal state or humidor detail response dependencies change. |
| `src/App.css` | `src/App.css` | Styling for Smoking Journal panel and existing app surfaces | Planned | No PHP target, but visual behavior must remain intact after API conversion. |

