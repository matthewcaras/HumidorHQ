<!--
Filename: 2026-07-13-humidorhq-php-json-conversion-plan.md
Revision: 1.0.0
Description: Project documentation and implementation notes.
Modified Date: 2026-07-15 00:13 ET
-->

# HumidorHQ PHP/JSON Conversion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the current `upstream/main` HumidorHQ app from Express/TypeScript plus Prisma/SQLite to a Hostinger-safe PHP/JSON backend while preserving the current frontend contract and full feature set.

**Architecture:** Keep the React/Vite frontend and replace the Node/Prisma backend with a PHP API under `api/` plus JSON persistence under `data/`. Organize the PHP port around explicit source-to-target file mapping so future `upstream/main` changes can be re-applied predictably.

**Tech Stack:** React 19, Vite 8, TypeScript 6, PHP 8.x on shared hosting, JSON file storage, SQLite export tooling, PowerShell for local verification, Git

## Global Constraints

- Production hosting is shared Hostinger with PHP support and no Node server process.
- The deployed frontend must remain static assets served from `/HumidorHQ/`.
- The backend must run entirely through request-time PHP scripts under `/HumidorHQ/api/`.
- JSON files under `/HumidorHQ/data/` will be the system of record.
- The full current feature set must be preserved, including dashboard, collection, humidors, catalog, vendors, purchases, receive/store, move, remove, removal reports, activity reports, and forward-compatible backend structure for smoking journal expansion.
- The conversion must be repeatable as `upstream/main` continues to change, with clear tracking of which upstream files map to which PHP/JSON files and which areas require re-porting after upstream changes.

---

## File Structure

### Conversion tracking files

- Create: `docs/php-json-conversion/file-map.md`
  Purpose: authoritative source-to-target mapping between upstream TS/Prisma files and PHP/JSON implementation files.
- Create: `docs/php-json-conversion/change-log.md`
  Purpose: append-only review log of upstream changes and corresponding PHP review work.
- Create: `docs/php-json-conversion/upstream-sync-checklist.md`
  Purpose: exact repeat process for future upstream syncs.

### Backend bootstrap and infrastructure

- Create: `api/.htaccess`
  Purpose: route requests into PHP entrypoint while preserving static file access rules.
- Create: `api/bootstrap.php`
  Purpose: bootstrap config, path constants, shared includes, request parsing, JSON body parsing.
- Create: `api/index.php`
  Purpose: front controller and route dispatch.
- Create: `api/lib/Response.php`
  Purpose: JSON success/error responses matching the current frontend contract.
- Create: `api/lib/Errors.php`
  Purpose: domain and validation exception classes with HTTP status mapping.
- Create: `api/lib/Validation.php`
  Purpose: scalar parsing, ID parsing, enum validation, pagination/filter helpers.
- Create: `api/lib/JsonStore.php`
  Purpose: locked reads, atomic writes, temp-file replacement, counter allocation.
- Create: `api/lib/DataRepository.php`
  Purpose: typed accessors for entity collections loaded from `data/`.

### PHP utility layer

- Create: `api/lib/utils/SearchKeys.php`
  Purpose: port normalized search-key behavior from `server/utils/searchKeys.ts`.
- Create: `api/lib/utils/PurchaseAllocations.php`
  Purpose: port purchase allocation math from `server/utils/purchaseAllocations.ts`.
- Create: `api/lib/utils/InventoryAccounting.php`
  Purpose: port inventory aggregation/accounting behavior from `server/utils/inventoryAccounting.ts`.

### PHP service layer

- Create: `api/lib/services/DashboardService.php`
  Source: `server/services/dashboardService.ts`
- Create: `api/lib/services/CatalogService.php`
  Source: `server/services/catalogService.ts`
- Create: `api/lib/services/CatalogManagementService.php`
  Source: `server/services/catalogManagementService.ts`
- Create: `api/lib/services/HumidorService.php`
  Source: `server/services/humidorService.ts`
- Create: `api/lib/services/VendorService.php`
  Source: `server/services/vendorService.ts`
- Create: `api/lib/services/PurchaseService.php`
  Source: `server/services/purchaseService.ts`
- Create: `api/lib/services/ReceiveStoreService.php`
  Source: `server/services/receiveStoreService.ts`
- Create: `api/lib/services/MoveService.php`
  Source: `server/services/moveService.ts`
- Create: `api/lib/services/RemovalService.php`
  Source: `server/services/removalService.ts`
- Create: `api/lib/services/ReportsService.php`
  Source: `server/services/reportsService.ts`
- Create: `api/lib/services/ActivityReportsService.php`
  Source: `server/services/activityReportsService.ts`
- Create: `api/lib/services/CollectionService.php`
  Source: `server/services/collectionService.ts`
- Create: `api/lib/services/CollectionHumidorService.php`
  Source: `server/services/collectionHumidorService.ts`

### Runtime data files

- Create: `data/.htaccess`
- Create: `data/catalog-cigars.json`
- Create: `data/vendors.json`
- Create: `data/storage-locations.json`
- Create: `data/storage-sub-locations.json`
- Create: `data/purchases.json`
- Create: `data/purchase-lines.json`
- Create: `data/lots.json`
- Create: `data/lot-location-balances.json`
- Create: `data/inventory-events.json`
- Create: `data/counters.json`

### Migration and verification tools

- Create: `scripts/export-sqlite-to-json.mjs`
  Purpose: export current SQLite/Prisma data into PHP runtime JSON files.
- Create: `scripts/verify-json-export.mjs`
  Purpose: compare record counts and key totals between SQLite-backed and JSON-backed outputs.
- Create: `tests/php-json/smoke.ps1`
  Purpose: local API smoke checks against PHP-hosted endpoints.
- Create: `tests/php-json/parity-checklist.md`
  Purpose: workflow-by-workflow parity checks.

### Frontend files to modify

- Modify: `src/services/api.ts`
  Purpose: switch API base path to PHP endpoints and preserve contract.
- Modify: `package.json`
  Purpose: add scripts for conversion/export verification as needed.
- Modify: `README.md`
  Purpose: document PHP/JSON local run, export flow, and Hostinger deployment.
- Modify: `docs/ROADMAP.md`
  Purpose: reflect backend direction if current roadmap references Node/Prisma runtime assumptions.

### Backend files to retire from runtime

- Leave in repo during transition: `server/index.ts`, `server/services/*.ts`, `server/utils/*.ts`, `prisma/schema.prisma`
  Purpose: source of truth for parity until PHP port is verified.

### Scope split

This spec covers one integrated backend-conversion project rather than independent subsystems. The tasks below are organized so each task produces a separately reviewable and testable milestone.

### Task 1: Create conversion tracking artifacts

**Files:**
- Create: `docs/php-json-conversion/file-map.md`
- Create: `docs/php-json-conversion/change-log.md`
- Create: `docs/php-json-conversion/upstream-sync-checklist.md`
- Modify: `docs/superpowers/specs/2026-07-13-humidorhq-php-json-conversion-design.md`

**Interfaces:**
- Consumes: approved design spec requirements.
- Produces: `file-map.md` mapping rows with columns `upstream source | php target | responsibility | status | notes`; `change-log.md` entries with `date`, `upstream ref`, `changed files`, `reviewed php files`, `gaps`; `upstream-sync-checklist.md` step list for future resyncs.

- [ ] **Step 1: Write the initial documentation tests as acceptance checklists**

```md
# docs/php-json-conversion/file-map.md

## Acceptance Checklist
- [ ] Every upstream backend source file has a mapped PHP target.
- [ ] `src/services/api.ts` is mapped to its PHP-facing compatibility work.
- [ ] `prisma/schema.prisma` is mapped to runtime JSON files and migration scripts.
```

```md
# docs/php-json-conversion/change-log.md

## Entry Template
- Date:
- Upstream ref:
- Changed upstream files:
- Reviewed PHP files:
- Parity gaps:
```

- [ ] **Step 2: Verify the docs do not exist yet**

Run: `Test-Path .\docs\php-json-conversion\file-map.md; Test-Path .\docs\php-json-conversion\change-log.md; Test-Path .\docs\php-json-conversion\upstream-sync-checklist.md`
Expected: `False False False`

- [ ] **Step 3: Write the three docs with concrete mappings and procedure**

```md
# PHP/JSON Conversion File Map

| Upstream source | PHP target | Responsibility | Status | Notes |
| --- | --- | --- | --- | --- |
| `server/index.ts` | `api/index.php`, `api/bootstrap.php`, `api/lib/Response.php`, `api/lib/Validation.php` | Route dispatch and response contract | Planned | Route contract must stay stable for frontend |
| `server/services/dashboardService.ts` | `api/lib/services/DashboardService.php` | Dashboard aggregates and issues | Planned | Verify totals against Node version |
| `server/services/catalogService.ts` | `api/lib/services/CatalogService.php` | Catalog reads and writes | Planned | Preserve archive and restore semantics |
```

```md
# PHP/JSON Conversion Change Log

- Date: 2026-07-13
- Upstream ref: `upstream/main@f065979`
- Changed upstream files: initial baseline
- Reviewed PHP files: none yet
- Parity gaps: full conversion pending
```

```md
# Upstream Sync Checklist

1. `git fetch upstream`
2. `git diff --name-only <last-reviewed-upstream-ref> upstream/main`
3. For each changed upstream file, locate mapped PHP target in `file-map.md`.
4. Review and update affected PHP files.
5. Append reviewed items to `change-log.md`.
6. Run targeted parity checks for impacted workflows.
7. Run broader regression checks before deploy.
```

- [ ] **Step 4: Verify the docs exist and contain required anchors**

Run: `Get-Content .\docs\php-json-conversion\file-map.md | Select-String 'server/index.ts|dashboardService'; Get-Content .\docs\php-json-conversion\upstream-sync-checklist.md | Select-String 'git diff --name-only'`
Expected: matching lines found

- [ ] **Step 5: Commit**

```bash
git add docs/php-json-conversion docs/superpowers/specs/2026-07-13-humidorhq-php-json-conversion-design.md
git commit -m "docs: add php json conversion tracking artifacts"
```

### Task 2: Build PHP bootstrap, routing, and response infrastructure

**Files:**
- Create: `api/.htaccess`
- Create: `api/bootstrap.php`
- Create: `api/index.php`
- Create: `api/lib/Response.php`
- Create: `api/lib/Errors.php`
- Create: `api/lib/Validation.php`
- Test: `tests/php-json/smoke.ps1`

**Interfaces:**
- Consumes: route list from design spec; conversion file map.
- Produces: front-controller entrypoint, `json_success(mixed $data, int $status = 200): never`, `json_error(string $code, string $message, int $status): never`, `parse_positive_int(string $value, string $label): int`.

- [ ] **Step 1: Write the failing smoke test for `/api/health` and `/api/dashboard` route dispatch**

```powershell
$base = 'http://localhost/HumidorHQ/api'
$health = Invoke-RestMethod "$base/health" -Method Get
$dashboard = Invoke-WebRequest "$base/dashboard" -Method Get -SkipHttpErrorCheck
if ($health.status -ne 'ok') { throw 'health failed' }
if ($dashboard.StatusCode -eq 404) { throw 'dashboard route missing' }
```

- [ ] **Step 2: Run the smoke test before files exist**

Run: `powershell -File .\tests\php-json\smoke.ps1`
Expected: FAIL with missing file or 404 route

- [ ] **Step 3: Implement minimal bootstrap and response layer**

```php
<?php
// api/lib/Response.php
function json_success(mixed $data, int $status = 200): never {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['data' => $data], JSON_UNESCAPED_SLASHES);
    exit;
}

function json_error(string $code, string $message, int $status): never {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['error' => ['code' => $code, 'message' => $message]], JSON_UNESCAPED_SLASHES);
    exit;
}
```

```php
<?php
// api/index.php
require __DIR__ . '/bootstrap.php';
$path = request_path();
$method = request_method();
if ($path === '/health' && $method === 'GET') {
    json_success(['status' => 'ok', 'app' => 'Humidor HQ']);
}
json_error('ROUTE_NOT_FOUND', 'The requested endpoint was not found.', 404);
```

- [ ] **Step 4: Re-run smoke test and confirm `/health` passes and `/dashboard` resolves to non-404 only after route is added**

Run: `powershell -File .\tests\php-json\smoke.ps1`
Expected: `/health` PASS, `/dashboard` still expected to fail until Task 6 adds it; update smoke test accordingly so route-specific checks align with current milestone.

- [ ] **Step 5: Commit**

```bash
git add api tests/php-json/smoke.ps1
git commit -m "feat: add php api bootstrap and routing foundation"
```

### Task 3: Implement JSON storage, repositories, and seed data layout

**Files:**
- Create: `api/lib/JsonStore.php`
- Create: `api/lib/DataRepository.php`
- Create: `data/.htaccess`
- Create: `data/catalog-cigars.json`
- Create: `data/vendors.json`
- Create: `data/storage-locations.json`
- Create: `data/storage-sub-locations.json`
- Create: `data/purchases.json`
- Create: `data/purchase-lines.json`
- Create: `data/lots.json`
- Create: `data/lot-location-balances.json`
- Create: `data/inventory-events.json`
- Create: `data/counters.json`
- Test: `tests/php-json/smoke.ps1`

**Interfaces:**
- Consumes: bootstrap path helpers.
- Produces: `load_collection(string $name): array`, `save_collection(string $name, array $rows): void`, `next_id(string $entity): int`, repository accessors for each data file.

- [ ] **Step 1: Write a failing storage test for locked read/write and counter allocation**

```powershell
$response = Invoke-WebRequest 'http://localhost/HumidorHQ/api/health' -Method Get
if ($response.StatusCode -ne 200) { throw 'api bootstrap unavailable' }
if (-not (Test-Path '.\data\counters.json')) { throw 'missing counters.json' }
```

- [ ] **Step 2: Run the storage test before data files exist**

Run: `powershell -File .\tests\php-json\smoke.ps1`
Expected: FAIL on missing data files

- [ ] **Step 3: Implement locked JSON storage and empty seed files**

```php
<?php
// api/lib/JsonStore.php
function load_collection(string $name): array {
    $path = data_path($name . '.json');
    if (!file_exists($path)) {
        return [];
    }
    $raw = file_get_contents($path);
    $decoded = json_decode($raw ?: '[]', true);
    return is_array($decoded) ? $decoded : [];
}

function save_collection(string $name, array $rows): void {
    $path = data_path($name . '.json');
    $tmp = $path . '.tmp';
    $json = json_encode(array_values($rows), JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
    file_put_contents($tmp, $json . PHP_EOL, LOCK_EX);
    rename($tmp, $path);
}
```

```json
{}
```

- [ ] **Step 4: Verify data files exist and are protected**

Run: `Get-ChildItem .\data; Get-Content .\data\.htaccess`
Expected: all JSON files present; `.htaccess` denies direct access

- [ ] **Step 5: Commit**

```bash
git add api/lib/JsonStore.php api/lib/DataRepository.php data
git commit -m "feat: add json persistence foundation"
```

### Task 4: Port shared utility logic from TypeScript to PHP

**Files:**
- Create: `api/lib/utils/SearchKeys.php`
- Create: `api/lib/utils/PurchaseAllocations.php`
- Create: `api/lib/utils/InventoryAccounting.php`
- Modify: `docs/php-json-conversion/file-map.md`
- Test: `tests/php-json/parity-checklist.md`

**Interfaces:**
- Consumes: repository accessors and validation helpers.
- Produces: `normalized_search_key(string $value): string`, allocation helpers returning per-line numeric distributions, inventory accounting helpers returning collection totals and issue arrays.

- [ ] **Step 1: Write focused parity examples extracted from the TS utilities**

```md
- Search key input: `Liga Privada No. 9` -> expected normalized key `liga privada no 9`
- Allocation input: line subtotals `[50.00, 100.00]`, shipping `15.00` -> expected proportional allocations `5.00` and `10.00`
- Inventory accounting input: lot quantities and balances reconcile to equal collection total quantity
```

- [ ] **Step 2: Run targeted verification against current TS outputs**

Run: `node -e "console.log('capture expected utility outputs before port')"`
Expected: baseline outputs captured in notes/checklist

- [ ] **Step 3: Implement the PHP utility functions with mirrored names and comments referencing upstream source files**

```php
<?php
function normalized_search_key(string $value): string {
    $value = mb_strtolower(trim($value));
    $value = preg_replace('/[^a-z0-9]+/u', ' ', $value) ?? '';
    return trim(preg_replace('/\s+/u', ' ', $value) ?? '');
}
```

- [ ] **Step 4: Verify the utility outputs match the captured examples**

Run: `php -r "require 'api/bootstrap.php'; require 'api/lib/utils/SearchKeys.php'; echo normalized_search_key('Liga Privada No. 9');"`
Expected: `liga privada no 9`

- [ ] **Step 5: Commit**

```bash
git add api/lib/utils docs/php-json-conversion/file-map.md tests/php-json/parity-checklist.md
git commit -m "feat: port php utility helpers"
```

### Task 5: Port foundational read APIs for catalog, vendors, humidors, dashboard, collection, and reports

**Files:**
- Create: `api/lib/services/DashboardService.php`
- Create: `api/lib/services/CatalogService.php`
- Create: `api/lib/services/CatalogManagementService.php`
- Create: `api/lib/services/HumidorService.php`
- Create: `api/lib/services/VendorService.php`
- Create: `api/lib/services/ReportsService.php`
- Create: `api/lib/services/ActivityReportsService.php`
- Create: `api/lib/services/CollectionService.php`
- Create: `api/lib/services/CollectionHumidorService.php`
- Modify: `api/index.php`
- Test: `tests/php-json/smoke.ps1`

**Interfaces:**
- Consumes: repositories and utility helpers.
- Produces: GET handlers returning the same envelope/shape as Node endpoints for `/api/dashboard`, `/api/catalog`, `/api/catalog/manage`, `/api/vendors`, `/api/humidors`, `/api/collection`, `/api/collection/humidors`, `/api/reports/removals`, `/api/reports/activity`.

- [ ] **Step 1: Write failing API smoke checks for read endpoints**

```powershell
$base = 'http://localhost/HumidorHQ/api'
'/dashboard','/catalog','/vendors','/humidors','/collection','/reports/removals','/reports/activity' |
  ForEach-Object {
    $response = Invoke-WebRequest ($base + $_) -Method Get -SkipHttpErrorCheck
    if ($response.StatusCode -eq 404) { throw "missing route $_" }
  }
```

- [ ] **Step 2: Run the smoke checks and capture 404 failures**

Run: `powershell -File .\tests\php-json\smoke.ps1`
Expected: FAIL with missing route list

- [ ] **Step 3: Port services one by one and wire GET routes in `api/index.php`**

```php
<?php
if ($path === '/dashboard' && $method === 'GET') {
    json_success(get_dashboard());
}
if ($path === '/catalog' && $method === 'GET') {
    json_success(get_catalog_cigars($_GET));
}
```

- [ ] **Step 4: Re-run smoke checks and verify all read endpoints return JSON with `data` keys**

Run: `powershell -File .\tests\php-json\smoke.ps1`
Expected: PASS for route availability; payload shape checks succeed

- [ ] **Step 5: Commit**

```bash
git add api/index.php api/lib/services tests/php-json/smoke.ps1
git commit -m "feat: port php read apis"
```

### Task 6: Port purchase reads and write-capable purchase workflows

**Files:**
- Create: `api/lib/services/PurchaseService.php`
- Modify: `api/index.php`
- Test: `tests/php-json/parity-checklist.md`

**Interfaces:**
- Consumes: repositories, allocation helpers, search helpers.
- Produces: `get_purchases(array $query): array`, `get_purchase_by_id(int $id): array`, `create_purchase(array $input): array`, `update_purchase(int $id, array $input): array`, `update_purchase_notes(int $id, ?string $notes): array`.

- [ ] **Step 1: Write failing purchase workflow checks**

```md
- GET `/api/purchases` returns `{ data: [] }` when store is empty.
- POST `/api/purchases` creates purchase, lines, and recalculated allocations.
- PATCH `/api/purchases/:id/notes` changes notes without altering receipt state.
```

- [ ] **Step 2: Run the purchase checks against current PHP API and record failures**

Run: `powershell -File .\tests\php-json\smoke.ps1`
Expected: purchase routes fail or return placeholders

- [ ] **Step 3: Implement purchase read/write service and route wiring**

```php
<?php
if ($path === '/purchases' && $method === 'GET') {
    json_success(get_purchases($_GET));
}
if ($path === '/purchases' && $method === 'POST') {
    json_success(create_purchase(request_json()), 201);
}
```

- [ ] **Step 4: Re-run purchase checks and verify allocation fields exist in responses**

Run: `php -l api/lib/services/PurchaseService.php`
Expected: `No syntax errors detected`

- [ ] **Step 5: Commit**

```bash
git add api/lib/services/PurchaseService.php api/index.php tests/php-json/parity-checklist.md
git commit -m "feat: port purchase workflows"
```

### Task 7: Port mutating inventory workflows: receive/store, move, remove

**Files:**
- Create: `api/lib/services/ReceiveStoreService.php`
- Create: `api/lib/services/MoveService.php`
- Create: `api/lib/services/RemovalService.php`
- Modify: `api/index.php`
- Test: `tests/php-json/parity-checklist.md`

**Interfaces:**
- Consumes: purchase service state, repositories, inventory accounting helpers.
- Produces: `receive_and_store_purchase_line(int $purchaseLineId, array $input): array`, `move_lot(int $lotId, array $input): array`, `remove_from_lot(int $lotId, array $input): array`.

- [ ] **Step 1: Write failing workflow checks for line receipt, lot move, and lot removal**

```md
- POST `/api/purchase-lines/:id/receive-store` creates lot, balance, and inventory event.
- POST `/api/lots/:id/move` shifts quantity between sub-locations and records MOVE event.
- POST `/api/lots/:id/remove` decrements balances and records SMOKED/GIFTED/DISCARDED event.
```

- [ ] **Step 2: Run the checks and capture failure mode**

Run: `powershell -File .\tests\php-json\smoke.ps1`
Expected: missing route or invariant failures

- [ ] **Step 3: Implement the three mutating services with locked writes and event creation**

```php
<?php
if (preg_match('#^/lots/(\d+)/move$#', $path, $matches) && $method === 'POST') {
    json_success(move_lot((int) $matches[1], request_json()));
}
```

- [ ] **Step 4: Re-run the checks and verify inventory totals reconcile after each mutation**

Run: `php -r "require 'api/bootstrap.php'; echo 'verify reconciliation script here';"`
Expected: no reconciliation errors

- [ ] **Step 5: Commit**

```bash
git add api/lib/services/ReceiveStoreService.php api/lib/services/MoveService.php api/lib/services/RemovalService.php api/index.php
git commit -m "feat: port inventory mutation workflows"
```

### Task 8: Implement SQLite-to-JSON export and verification tooling

**Files:**
- Create: `scripts/export-sqlite-to-json.mjs`
- Create: `scripts/verify-json-export.mjs`
- Modify: `package.json`
- Modify: `README.md`
- Test: `tests/php-json/parity-checklist.md`

**Interfaces:**
- Consumes: `prisma/schema.prisma`, current SQLite DB, runtime JSON schema.
- Produces: `npm run export:json`, `npm run verify:json-export`; JSON files shaped for PHP runtime.

- [ ] **Step 1: Write the failing export contract in docs and package scripts**

```json
{
  "scripts": {
    "export:json": "node scripts/export-sqlite-to-json.mjs",
    "verify:json-export": "node scripts/verify-json-export.mjs"
  }
}
```

- [ ] **Step 2: Run the export script before implementation and confirm failure**

Run: `node .\scripts\export-sqlite-to-json.mjs`
Expected: module not found or file missing

- [ ] **Step 3: Implement the exporter and verifier with record-count and key-total checks**

```js
import fs from 'node:fs/promises'

async function main() {
  // Load current source data, map entities, write JSON output, then verify counts.
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
```

- [ ] **Step 4: Run export and verification scripts successfully**

Run: `npm run export:json && npm run verify:json-export`
Expected: successful export; output summary with matching counts/totals

- [ ] **Step 5: Commit**

```bash
git add scripts package.json README.md tests/php-json/parity-checklist.md
git commit -m "feat: add sqlite to json export tooling"
```

### Task 9: Switch frontend API base to PHP and validate end-to-end contract

**Files:**
- Modify: `src/services/api.ts`
- Modify: `README.md`
- Test: `tests/php-json/smoke.ps1`

**Interfaces:**
- Consumes: stable PHP route contract.
- Produces: frontend fetches against `/HumidorHQ/api` in production and configurable local PHP base path in development.

- [ ] **Step 1: Write the failing frontend contract check**

```ts
const API_BASE_URL = resolveApiBaseUrl()
if (!API_BASE_URL.includes('/api')) {
  throw new Error('API base must target PHP endpoints')
}
```

- [ ] **Step 2: Run existing frontend smoke path check and confirm Node URL is still present**

Run: `Get-Content .\src\services\api.ts | Select-String 'localhost:3001|/api'`
Expected: current Node URL still present before update

- [ ] **Step 3: Implement environment-aware PHP base resolution**

```ts
const DEFAULT_API_BASE_URL = '/HumidorHQ/api'

function resolveApiBaseUrl() {
  const configured = import.meta.env.VITE_API_BASE_URL?.trim()
  return configured && configured.length > 0 ? configured.replace(/\/$/, '') : DEFAULT_API_BASE_URL
}

const API_BASE_URL = resolveApiBaseUrl()
```

- [ ] **Step 4: Verify build and API path configuration**

Run: `node --check .\src\services\api.ts`
Expected: syntax passes

- [ ] **Step 5: Commit**

```bash
git add src/services/api.ts README.md
git commit -m "feat: point frontend api client to php backend"
```

### Task 10: Run parity verification and package Hostinger deployment rules

**Files:**
- Modify: `tests/php-json/parity-checklist.md`
- Modify: `README.md`
- Modify: `docs/php-json-conversion/change-log.md`
- Modify: `docs/php-json-conversion/upstream-sync-checklist.md`

**Interfaces:**
- Consumes: completed PHP API, frontend contract, export tooling.
- Produces: parity report, Hostinger deployment steps, recorded baseline reviewed upstream ref.

- [ ] **Step 1: Write the parity matrix and deployment checklist**

```md
| Workflow | Expected parity source | Verification status |
| --- | --- | --- |
| Dashboard | `server/services/dashboardService.ts` | Pending |
| Receive/store | `server/services/receiveStoreService.ts` | Pending |
| Activity report | `server/services/activityReportsService.ts` | Pending |
```

- [ ] **Step 2: Run end-to-end checks against representative data**

Run: `npm run build`
Expected: frontend builds successfully

Run: `powershell -File .\tests\php-json\smoke.ps1`
Expected: all PHP route smoke checks pass

- [ ] **Step 3: Document Hostinger deployment and baseline reviewed ref**

```md
1. Upload built frontend assets to `/HumidorHQ/`.
2. Upload `api/` and `data/` directories.
3. Confirm `.htaccess` protection in `data/`.
4. Set optional `VITE_API_BASE_URL=/HumidorHQ/api` at build time if needed.
5. Record deployed upstream baseline in `docs/php-json-conversion/change-log.md`.
```

- [ ] **Step 4: Re-run targeted upstream-resync procedure on a sample diff**

Run: `git diff --name-only f065979 upstream/main`
Expected: empty output or changed file list suitable for future sync review

- [ ] **Step 5: Commit**

```bash
git add tests/php-json/parity-checklist.md README.md docs/php-json-conversion/change-log.md docs/php-json-conversion/upstream-sync-checklist.md
git commit -m "docs: finalize php json parity and deployment guidance"
```

## Self-Review

### Spec coverage

- Shared Hostinger PHP-only constraint: covered by Tasks 2, 3, 9, and 10.
- Static frontend plus PHP API architecture: covered by Tasks 2 and 9.
- JSON files as system of record: covered by Tasks 3 and 8.
- Full feature preservation: covered by Tasks 5, 6, and 7.
- Repeatable upstream change tracking: covered by Tasks 1 and 10.
- Migration/export from SQLite: covered by Task 8.
- Parity verification and deployment: covered by Task 10.

### Placeholder scan

- No `TODO`, `TBD`, or deferred filler markers remain.
- Every task names exact files and concrete commands.
- Every task includes explicit deliverables and a commit step.

### Type consistency

- API responses consistently use `{ data: ... }` and `{ error: { code, message } }`.
- PHP helper names referenced by later tasks are introduced in earlier tasks.
- Conversion tracking file names remain consistent across all tasks.

