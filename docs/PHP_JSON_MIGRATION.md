# Humidor HQ PHP + JSON Migration Map

## Goal

Migrate Humidor HQ from its current `Vite + React + Prisma/SQLite` direction to a `React frontend + PHP + JSON` backend that can run on standard Hostinger PHP hosting.

This is practical because the current frontend is still mostly static and the Prisma data layer is not yet integrated into the UI.

## Recommended Target Architecture

### Frontend

- Keep the existing React frontend.
- Build with Vite into static assets.
- Replace any future Prisma usage with HTTP requests to PHP endpoints.

### Backend

- Add a `public/api/` or `api/` directory with PHP endpoints.
- Store application data in JSON files under a non-public writable `data/` directory.
- Use PHP for:
  - CRUD operations
  - validation
  - ID generation
  - inventory calculations
  - report aggregation

### Hostinger Fit

This architecture fits Hostinger well if:

- the app is single-user or very low concurrency
- data volume remains moderate
- reporting stays relatively simple

## Proposed Folder Layout

> **Deployment Note**: This layout assumes `public/` as the web document root. In that configuration, `api/` and `data/` sit outside the web root and are not directly accessible via HTTP. If deploying with the repository root as the document root instead, ensure `data/` is protected from public access (see section 4 below).

```text
/
|-- api/
|   |-- bootstrap.php
|   |-- response.php
|   |-- auth.php
|   |-- dashboard.php
|   |-- manufacturers.php
|   |-- lines.php
|   |-- vitolas.php
|   |-- vendors.php
|   |-- storage-locations.php
|   |-- purchase-orders.php
|   |-- lots.php
|   |-- inventory-events.php
|   |-- reports.php
|
|-- data/
|   |-- manufacturers.json
|   |-- cigar-lines.json
|   |-- vitolas.json
|   |-- vendors.json
|   |-- storage-locations.json
|   |-- purchase-orders.json
|   |-- lots.json
|   |-- inventory-events.json
|   |-- counters.json
|
|-- public/
|   |-- dist/              # built React app if deployed from same host root
|   |-- .htaccess
|
|-- src/
|   |-- services/
|   |   |-- api.ts
|   |   |-- dashboard.ts
|   |   |-- inventory.ts
|   |   |-- purchases.ts
|   |   |-- humidors.ts
|   |   |-- journal.ts
```

## Data Storage Strategy

Use one JSON file per entity plus one counter file for numeric IDs.

### `data/counters.json`

```json
{
  "manufacturers": 1,
  "cigarLines": 1,
  "vitolas": 1,
  "vendors": 1,
  "storageLocations": 1,
  "purchaseOrders": 1,
  "lots": 1,
  "inventoryEvents": 1
}
```

Each create operation should:

1. lock `counters.json`
2. increment the relevant counter
3. use that value as the new ID
4. write the entity record

## Prisma-to-JSON Model Mapping

The current Prisma schema already maps cleanly to JSON records.

### StorageLocation -> `data/storage-locations.json`

```json
[
  {
    "id": 1,
    "name": "Coolidor 1",
    "capacity": 200,
    "notes": "Top shelf for boxes",
    "createdAt": "2026-07-05T18:00:00Z",
    "updatedAt": "2026-07-05T18:00:00Z"
  }
]
```

### Vendor -> `data/vendors.json`

```json
[
  {
    "id": 1,
    "name": "Small Batch",
    "website": "https://example.com",
    "notes": "",
    "createdAt": "2026-07-05T18:00:00Z",
    "updatedAt": "2026-07-05T18:00:00Z"
  }
]
```

### Manufacturer -> `data/manufacturers.json`

```json
[
  {
    "id": 1,
    "name": "Padron",
    "createdAt": "2026-07-05T18:00:00Z",
    "updatedAt": "2026-07-05T18:00:00Z"
  }
]
```

### CigarLine -> `data/cigar-lines.json`

```json
[
  {
    "id": 1,
    "name": "1964 Anniversary",
    "manufacturerId": 1,
    "createdAt": "2026-07-05T18:00:00Z",
    "updatedAt": "2026-07-05T18:00:00Z"
  }
]
```

### Vitola -> `data/vitolas.json`

```json
[
  {
    "id": 1,
    "name": "Exclusivo",
    "size": "5 x 50",
    "strength": "Medium-Full",
    "lineId": 1,
    "createdAt": "2026-07-05T18:00:00Z",
    "updatedAt": "2026-07-05T18:00:00Z"
  }
]
```

### PurchaseOrder -> `data/purchase-orders.json`

```json
[
  {
    "id": 1,
    "vendorId": 1,
    "orderDate": "2026-07-05",
    "orderNumber": "SB-1001",
    "shipping": "12.00",
    "tax": "0.00",
    "discount": "15.00",
    "notes": "",
    "createdAt": "2026-07-05T18:00:00Z",
    "updatedAt": "2026-07-05T18:00:00Z"
  }
]
```

### Lot -> `data/lots.json`

```json
[
  {
    "id": 1,
    "vitolaId": 1,
    "storageLocationId": 1,
    "purchaseOrderId": 1,
    "quantityPurchased": 10,
    "quantityRemaining": 8,
    "msrpPerCigar": "15.00",
    "actualCostPerCigar": "10.75",
    "allocatedCostPerCigar": "11.20",
    "purchaseDate": "2026-07-05",
    "boxCode": "BOX-001",
    "notes": "",
    "createdAt": "2026-07-05T18:00:00Z",
    "updatedAt": "2026-07-05T18:00:00Z"
  }
]
```

### InventoryEvent -> `data/inventory-events.json`

```json
[
  {
    "id": 1,
    "lotId": 1,
    "eventType": "purchase",
    "quantity": 10,
    "eventDate": "2026-07-05",
    "notes": "Initial purchase",
    "costPerCigarAtEvent": "10.75",
    "msrpPerCigarAtEvent": "15.00",
    "createdAt": "2026-07-05T18:00:00Z"
  }
]
```

## Important PHP Rules

### 1. Treat `InventoryEvent` as source of truth

The design document says inventory should be calculated from historical transactions. Keep that rule.

Recommended approach:

- `inventory-events.json` is the audit log
- `lots.json` stores cached summary fields like `quantityRemaining`
- every write updates both the event log and the affected lot summary

This keeps reads fast while preserving the audit trail.

### 2. Use file locking on every write

Every JSON write should use `flock()` to avoid corruption.

Safe pattern:

1. open file
2. acquire exclusive lock
3. read current JSON
4. modify in memory
5. rewind and rewrite full JSON
6. truncate remainder
7. flush and unlock

### 3. Store money as strings

PHP floats are unsafe for money.

Use string values like:

- `"15.00"`
- `"10.75"`

Then format and calculate carefully in PHP. If precision becomes painful, store cents as integers instead.

### 4. Keep public access away from `data/`

Do not expose raw JSON files directly over the web.

Preferred setup:

- place `data/` outside the web root if Hostinger layout allows it
- otherwise deny direct access with `.htaccess`

If `data/` must live inside the web root, add `data/.htaccess` with:

```apache
Require all denied
```

## Proposed API Endpoints

### Dashboard

- `GET /api/dashboard.php`
  - returns:
    - total cigars
    - humidor count
    - MSRP value
    - actual cost
    - savings
    - average discount

### Reference data

- `GET /api/manufacturers.php`
- `POST /api/manufacturers.php`
- `GET /api/lines.php`
- `POST /api/lines.php`
- `GET /api/vitolas.php`
- `POST /api/vitolas.php`
- `GET /api/vendors.php`
- `POST /api/vendors.php`
- `GET /api/storage-locations.php`
- `POST /api/storage-locations.php`

### Purchases and inventory

- `GET /api/purchase-orders.php`
- `POST /api/purchase-orders.php`
- `GET /api/lots.php`
- `POST /api/lots.php`
- `PATCH /api/lots.php?id=1`
- `GET /api/inventory-events.php`
- `POST /api/inventory-events.php`

### Reports

- `GET /api/reports.php?type=collection-value`
- `GET /api/reports.php?type=spending-history`
- `GET /api/reports.php?type=inventory-by-humidor`

## Frontend Integration Map

The current [src/App.tsx](../src/App.tsx) is static. The first frontend conversion should be:

1. replace hard-coded dashboard values with a request to `/api/dashboard.php`
2. add service wrappers in `src/services/`
3. expand into page-level features after the dashboard is live

### Suggested frontend service shape

`src/services/api.ts`

```ts
export async function apiGet<T>(url: string): Promise<T> {
  const response = await fetch(url)

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`)
  }

  const data = await response.json()
  return data as T
}
```

`src/services/dashboard.ts`

```ts
export type DashboardSummary = {
  totalCigars: number
  humidorCount: number
  msrpValue: string
  actualCost: string
  totalSavings: string
  averageDiscount: string
}

export function getDashboardSummary() {
  return apiGet<DashboardSummary>('/api/dashboard.php')
}
```

## Suggested PHP Utilities

Create a small shared bootstrap instead of duplicating file code in every endpoint.

### `api/bootstrap.php`

Responsibilities:

- set JSON headers
- handle CORS only if needed
- define data-path constants
- provide:
  - `read_json_file($path)`
  - `write_json_file($path, $data)`
  - `next_id($counterKey)`
  - `json_response($payload, $status = 200)`
  - `read_request_body()`

## Migration Sequence

### Phase 1: Freeze the data contract

- treat the current Prisma schema as the domain model
- stop expanding Prisma usage
- define equivalent JSON record shapes

### Phase 2: Stand up PHP read endpoints

- create `dashboard.php`
- create read endpoints for manufacturers, lines, vitolas, vendors, storage locations, lots, and events
- seed JSON files with sample data

### Phase 3: Wire the React dashboard

- replace static card values in `src/App.tsx`
- fetch live values from `dashboard.php`
- handle loading and error UI

### Phase 4: Add write flows

- create purchase order entry
- create lots
- record inventory events
- recalculate lot remaining quantity

### Phase 5: Add reporting

- collection value
- actual spend
- savings
- inventory by humidor
- smoking history

## Derived Calculations

These should be computed server-side in PHP:

- `total cigars` = sum of `quantityRemaining` across lots
- `MSRP value` = sum of `quantityRemaining * msrpPerCigar`
- `actual cost on hand` = sum of `quantityRemaining * allocatedCostPerCigar`
- `savings` = `MSRP value - actual cost on hand`
- `average discount` = aggregate discount percentage across purchased inventory

## Where JSON Will Hurt First

This approach is fine for a personal app, but these areas will become awkward first:

- filtering lots across multiple related entities
- sorting and searching large collections
- enforcing referential integrity
- multi-step write consistency
- multi-user concurrency

If those become important, the clean upgrade path is:

- keep PHP
- swap JSON storage for SQLite
- preserve the same endpoint contract

That would make Hostinger deployment easier to keep while avoiding a frontend rewrite.

## Practical Recommendation

If the deployment goal is "get this running on Hostinger with minimal infrastructure," PHP + JSON is a good first backend.

If the goal is "build this once and keep growing it," PHP + SQLite is the stronger long-term choice even on shared hosting.

For this repo, the cleanest near-term implementation path is:

1. keep React
2. add PHP endpoints
3. start with JSON files
4. keep the endpoint contract stable
5. leave room to swap JSON for SQLite later
