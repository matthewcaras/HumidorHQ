# HumidorHQ PHP/JSON Conversion Design

## Goal

Convert the current `upstream/main` HumidorHQ application from its Express/TypeScript plus Prisma/SQLite backend to a PHP plus JSON backend that runs on Hostinger shared hosting at `https://jasr.me/HumidorHQ`, while preserving the full current feature set and frontend behavior.

## Constraints

- Production hosting is shared Hostinger with PHP support and no Node server process.
- The deployed frontend must remain static assets served from `/HumidorHQ/`.
- The backend must run entirely through request-time PHP scripts under `/HumidorHQ/api/`.
- JSON files under `/HumidorHQ/data/` will be the system of record.
- The full current feature set must be preserved, including dashboard, collection, humidors, catalog, vendors, purchases, receive/store, move, remove, removal reports, activity reports, and forward-compatible backend structure for smoking journal expansion.
- The conversion must be repeatable as `upstream/main` continues to change, with clear tracking of which upstream files map to which PHP/JSON files and which areas require re-porting after upstream changes.

## Recommended Approach

Keep the React/Vite frontend and replace the current Express/Prisma backend with a PHP/JSON API that preserves the current API contract. Use the older PHP/JSON branch as a reference for deployment shape and bootstrap patterns, but do not merge it blindly because `upstream/main` has moved significantly beyond it.

This keeps frontend churn low, preserves the current component/page structure, and concentrates the migration work in the backend and data layer where Hostinger compatibility is required.

It also supports repeated upstream sync work because the frontend contract stays stable and the backend port can be organized around explicit source-to-target file mappings.

## Current State

### Frontend

The current application uses a Vite/React frontend with its API surface centralized in `src/services/api.ts`. The frontend expects JSON APIs with `{ data: ... }` success envelopes and structured error responses.

### Backend

The current backend is an Express app in `server/index.ts` that exposes routes for:

- dashboard
- reports/removals
- reports/activity
- collection
- collection humidors
- catalog read/write/archival
- vendors
- purchases
- receive/store
- lot move
- lot remove
- humidors

The route handlers delegate most logic to TypeScript service files in `server/services/` and helper utilities in `server/utils/`.

### Persistence

Persistence is currently Prisma plus SQLite, defined by `prisma/schema.prisma` and supporting migrations. `upstream/main` has significantly expanded beyond the older PHP/JSON branch.

## Target Architecture

### Frontend

- Keep Vite/React.
- Keep the current page and component structure.
- Preserve the API contract exposed through `src/services/api.ts`.
- Change the API base URL from the local Node server to a deploy-safe relative PHP path.

Preferred API base behavior:

- production: `/HumidorHQ/api`
- local/dev PHP host: relative `./api` or configurable base path

The frontend should remain mostly unchanged apart from API base-path handling and any small compatibility adjustments discovered during verification.

### PHP API Layer

Add a PHP API under `api/` that mirrors the current route surface from `server/index.ts`.

Recommended structure:

- `api/bootstrap.php`
- `api/index.php` or individual route files, depending on hosting/routing needs
- `api/lib/JsonStore.php`
- `api/lib/Response.php`
- `api/lib/Validation.php`
- `api/lib/Errors.php`
- `api/lib/services/*.php`
- `api/lib/utils/*.php`

The PHP API must preserve:

- endpoint shapes
- HTTP verbs where feasible on shared hosting
- response envelope format
- error code and message structure
- filtering, sorting, pagination, and archival semantics

### Conversion Tracking Layer

Add repo-local conversion tracking documents that record how the upstream implementation maps to the PHP/JSON implementation and which files must be reviewed whenever upstream changes.

Recommended tracking artifacts:

- `docs/php-json-conversion/file-map.md`
- `docs/php-json-conversion/change-log.md`

`file-map.md` should list:

- upstream source file
- PHP/JSON target file or files
- responsibility of the source file
- conversion status
- notes about behavior quirks or known divergence

`change-log.md` should record:

- upstream commit or date reviewed
- files changed upstream that affect the PHP/JSON port
- whether each affected PHP/JSON file was reviewed
- whether any parity gaps remain

### Data Storage

Use entity-based JSON files instead of a single monolithic file.

Expected `data/` files:

- `catalog-cigars.json`
- `vendors.json`
- `storage-locations.json`
- `storage-sub-locations.json`
- `purchases.json`
- `purchase-lines.json`
- `lots.json`
- `lot-location-balances.json`
- `inventory-events.json`
- `counters.json`

Supporting files:

- `.htaccess` to deny direct web access
- optional lock/temp files created transiently during atomic writes

`counters.json` stores next-ID values per entity type.

### Runtime Behavior

- All writes use file locking.
- All writes use atomic rewrite behavior.
- Reads are centralized through shared JSON-store helpers.
- Derived totals and reports are computed from source records, not duplicated cached truth, unless profiling later proves a targeted cache is required.

## Data Model Mapping

The PHP/JSON model must cover the current logical entities from `upstream/main`, including:

- catalog cigars
- vendors
- storage locations
- storage sub-locations
- purchases
- purchase lines
- lots
- lot location balances
- inventory events

The JSON format does not need to mirror Prisma exactly, but it must preserve the same business meaning, identifiers, relationships, and invariants required by the current frontend and service logic.

## Backend Logic To Port

The following TypeScript logic areas must be ported faithfully into PHP:

- dashboard aggregation
- catalog reads and writes
- catalog management views and usage summaries
- humidor CRUD and archival behavior
- vendor CRUD and archival behavior
- purchase CRUD and note updates
- receive/store workflows
- move workflows
- remove workflows
- collection list and cigar detail aggregation
- collection humidor summaries and details
- removal reports
- activity reports
- allocation/accounting helpers
- normalized search-key handling

Particularly sensitive logic:

- purchase allocation math
- quantity tracking across lots and locations
- inventory event generation
- archived/inactive entity filtering
- cost/MSRP snapshot behavior
- report summary totals and event-level derived values

The port should be structured so these logic areas are split into focused PHP service files that remain traceable back to the upstream TypeScript source files. That traceability is required for repeat conversions after upstream changes.

## Routing Design

The PHP backend should mirror the current route contract as closely as possible, including:

- `GET /api/dashboard`
- `GET /api/reports/removals`
- `GET /api/reports/activity`
- `GET /api/collection`
- `GET /api/collection/humidors`
- `GET /api/collection/humidors/:storageLocationId`
- `GET /api/collection/:catalogCigarId`
- `GET /api/catalog`
- `GET /api/catalog/manage`
- `GET /api/catalog/:catalogCigarId`
- `POST /api/catalog`
- `PUT /api/catalog/:id`
- `PATCH /api/catalog/:id/archive`
- `PATCH /api/catalog/:id/restore`
- `GET /api/vendors`
- `POST /api/vendors`
- `PUT /api/vendors/:id`
- `PATCH /api/vendors/:id/archive`
- `GET /api/purchases`
- `GET /api/purchases/:id`
- `POST /api/purchases`
- `PUT /api/purchases/:id`
- `PATCH /api/purchases/:id/notes`
- `POST /api/purchase-lines/:id/receive-store`
- `POST /api/lots/:lotId/move`
- `POST /api/lots/:lotId/remove`
- `GET /api/humidors`
- `POST /api/humidors`
- `PUT /api/humidors/:id`
- `PATCH /api/humidors/:id/archive`

If Hostinger routing limitations require method overrides or a front-controller pattern, the external route contract should still remain stable from the frontend's perspective.

## Migration Design

### One-Time Migration

Create a one-time migration/import tool that exports the current SQLite-backed data into the runtime JSON format used by the PHP backend.

Migration requirements:

- read the current Prisma/SQLite data source
- emit JSON files matching the PHP runtime schema
- preserve IDs and relationships
- preserve historical purchase, lot, and inventory event data
- preserve archived/inactive states
- verify totals and record counts after export

### Deployment Cutover

- Build frontend assets
- deploy static frontend
- deploy PHP API
- deploy protected JSON data files
- switch frontend API base to PHP endpoints

Do not attempt to run Prisma/SQLite and JSON as parallel production sources on Hostinger.

### Ongoing Upstream Re-Conversion

This project also needs a repeatable process for reapplying the PHP/JSON conversion as `upstream/main` evolves.

Process requirements:

- keep a maintained source-to-target file map
- compare upstream changed files against that map after each upstream sync
- review affected PHP service, utility, schema, and frontend API files
- re-run parity checks only for impacted workflows first, then broader regression verification
- document intentional divergences instead of leaving them implicit

The design should assume that future upstream work may touch:

- `server/index.ts`
- `server/services/*.ts`
- `server/utils/*.ts`
- `prisma/schema.prisma`
- `src/services/api.ts`
- frontend pages/components that depend on API response shape

## Error Handling

The PHP API must preserve structured error responses:

```json
{
  "error": {
    "code": "SOME_ERROR_CODE",
    "message": "Human-readable message"
  }
}
```

Validation and domain errors should map cleanly to HTTP status codes. Unexpected failures should return stable generic messages without leaking file paths or sensitive runtime details.

## Concurrency and Integrity

Shared hosting plus JSON persistence creates the main operational risk area.

The design requires:

- centralized JSON IO helpers
- exclusive locks for writes
- atomic file replacement
- defensive validation before write
- rollback-safe temp-file behavior where applicable

The system should not assume low traffic is a substitute for safe write behavior.

## Testing Strategy

Testing should focus on behavioral parity with the current `upstream/main` application.

Primary verification areas:

- humidors CRUD and archival
- vendors CRUD and archival
- catalog read/write/archive/restore
- purchases CRUD
- purchase notes updates
- receive/store flow
- move flow
- remove flow
- dashboard totals and issues
- collection summaries and detail pages
- humidor collection summaries and details
- removal reports filters, sorts, summaries, and paging
- activity reports filters, sorts, summaries, and paging
- archived/inactive entity handling
- accounting edge cases

Verification should compare the PHP/JSON behavior against the current Node/Prisma behavior using the same representative dataset where possible.

For repeat upstream syncs, verification should be scoped in two layers:

- targeted parity tests for the workflows touched by upstream file changes
- full regression checks before deployment

## Implementation Order

Recommended sequence:

1. Create a new branch from `upstream/main` for the PHP/JSON conversion.
2. Create and maintain the conversion tracking artifacts:
   - upstream-to-PHP file map
   - upstream change review log
3. Define runtime JSON schema and storage helpers.
4. Port the shared utility logic for search keys and accounting.
5. Port foundational read APIs first:
   - dashboard
   - catalog
   - collection
   - humidors
   - vendors
   - purchases
   - reports
6. Port write workflows:
   - catalog writes
   - vendor writes
   - humidor writes
   - purchase writes
   - receive/store
   - move
   - remove
7. Build the SQLite-to-JSON migration tool.
8. Switch frontend API configuration to PHP endpoints.
9. Run parity verification across key workflows.
10. Prepare Hostinger deployment packaging and routing checks.
11. Define the repeat upstream-sync procedure using the file map and targeted parity review.

## Risks

- Logic drift during TypeScript-to-PHP porting
- data corruption from unsafe JSON writes
- route/path mismatches under `/HumidorHQ/`
- hidden coupling between frontend expectations and current backend response details
- performance degradation in large report and aggregation views if JSON scans are not organized carefully

## Out Of Scope

- Rewriting the React frontend into PHP-rendered pages
- keeping Node/Prisma running in production on Hostinger
- unrelated UI redesign
- speculative caching layers before parity is established

## Success Criteria

The project is successful when:

- the app runs on Hostinger shared hosting with no Node runtime
- the frontend works against PHP endpoints under `/HumidorHQ/api/`
- JSON files under `/HumidorHQ/data/` are the persistent source of truth
- the current `upstream/main` feature set is preserved
- key workflows and summaries behave equivalently to the current Node/Prisma version
- deployment does not expose raw data files publicly
- the conversion can be maintained as upstream changes land, using explicit file mapping and change review artifacts
