<!--
Filename: README.md
Revision: 1.15.0
Description: Project documentation and implementation notes.
Modified Date: 2026-07-18 9:30 AM ET
-->

# HumidorHQ

HumidorHQ is a cigar collection and humidor management app using a flat-file hosting model for GitHub-driven deployment to Hostinger.

## Page Functions And Features

- `Dashboard` shows on-hand and en route cigars, current cost basis, current MSRP value, lifetime savings, average on-hand cost and MSRP, lifetime smoked, gifted, and discarded/damaged totals with per-cigar averages, and each humidor's current count with oldest inventory date.
- `Collection` shows the cigars currently on hand, can sort them alphabetically or by humidor location, and provides quantity/date-aware Smoke, Give, Discard / Damage, and Move actions. Removal retries are idempotent, and smoked removals can immediately capture a 1-10 rating and tasting notes.
- `Catalog` manages master cigar records and shows purchased and on-hand quantities calculated from linked purchase and inventory records.
- `Vendors` manages vendor contact records used by purchases.
- `Purchases` summarizes total orders, cigars purchased, lifetime paid, and en route quantity; its on-demand order builder creates pending purchases with weighted cost allocation, and purchase records expand to show cigar lines and receiving controls.
- `Humidors` manages storage locations, current count, oldest inventory date, inline name/detail editing, protected deletion while linked records exist, and drawer/shelf/tray/zone setup.
- `Humidor Sections` remains an internal linked collection for drawers, shelves, trays, and zones inside humidors, now managed inline from the Humidors page.
- `Reports` provides filterable smoked, gifted, and discarded/damaged removal history by period, custom date range, type, and search; it calculates quantity, cost, MSRP, savings, per-cigar averages, shows Smoking Journal ratings/notes, and keeps recent inventory activity below the report.
- `Audit`, `Changelog`, `TODO`, and internal `PO Lines` remain protected and routable, but are hidden from the left menu.
- Browser refresh keeps the active page by storing page navigation in the URL hash, such as `#Purchases`.
- Signed-in user, logout controls, Mobile preview access, project revision, and a stacked modified date/time sit in the lower-left sidebar.
- `Mobile` opens `/mobile/`, a visible viewport preview page for phone and tablet widths that defaults to iPhone 16 Pro without exposing Jason-only utility links.
- Hidden Jason utility page at `/j/` provides quick links to Dashboard, Changelog, Audit, TODO, and an in-page preview that defaults to full web view with optional mobile presets.

## Current Target

The target runtime is:

- PHP for API endpoints
- JSON files in an external configured directory for runtime data
- Empty sample/initialization JSON tracked under `seed-data/`
- Plain JavaScript for browser behavior
- HTML and CSS for the frontend
- No TypeScript
- No React runtime
- No Vite or build/compile step
- No Node server process
- No Prisma runtime

The app should be deployable as normal files to Hostinger, with GitHub used as the source repo and webhook/deployment flow.

## Project Layout

- `index.html` - browser entry point
- `public/` - static assets
- `api/` - PHP API front controller and supporting libraries
- `seed-data/` - tracked empty initialization JSON; never used directly at runtime
- external `HUMIDORHQ_DATA_ROOT` - live JSON and credentials, outside Git and the deployed application
- `docs/` - design notes, migration notes, and conversion tracking
- `CHANGELOG.md` - revisioned project change history
- Changelog entries include `Changed by` labels derived from Git author history where the author can be identified.

Legacy TypeScript, React, Vite, Node, and Prisma runtime files have been removed from the deployable app. Historical conversion notes may still reference those technologies for migration context only.

Temporary probe files are not part of the deployable app and should not be committed.

## Data Model

Runtime data is stored in the external directory identified by `HUMIDORHQ_DATA_ROOT`. Startup fails safely if the variable is missing, the directory is inside the application tree, required JSON is missing or malformed, or PHP cannot read and write the directory.

Data-changing API workflows use one serialized transaction boundary. Collections are reloaded while that lock is held, IDs are allocated with their records, all changed JSON is staged before replacement, and exact backups plus a recovery journal restore the prior state after a write failure or interrupted process. Successful mutation audit entries are delayed until the JSON commit completes.

Purchase dates use the browser's local calendar by default and are validated as real `YYYY-MM-DD` dates by PHP. Inventory event dates use `HUMIDORHQ_TIMEZONE`, defaulting to `America/Indiana/Indianapolis`.

PHP is authoritative for purchase totals and weighted allocations. Monetary calculations use integer cents and a stable line-ID largest-remainder allocation. Known zero remains `$0.00`; missing adjustments, costs, and MSRP values remain `Unknown` rather than being included as zero in complete-looking totals.

The browser app never fetches raw JSON directly. It calls PHP endpoints under `api/`, and PHP reads and writes the external files. `seed-data/` contains empty Git-tracked initialization data and is blocked from browser access. See [External Runtime Data Setup](docs/RUNTIME_DATA.md) for Windows migration and Hostinger configuration.


## Authentication

Public deployments require sign-in before data routes can be read or changed. The PHP API uses server-side sessions and verifies users against password hashes in external runtime `auth-users.json`.

Runtime credentials are never read from the repository. Do not commit real usernames or password hashes.

Authentication applies shared username and client-address throttles, audits failed and rate-limited attempts without passwords, and uses a constant-work dummy verification for unknown usernames. Authenticated sessions expire after 30 minutes of inactivity or 12 hours total by default. Login and every authenticated state-changing request require a session CSRF token. Session cookies are HttpOnly, SameSite Strict, and Secure whenever HTTPS is detected or forced by production configuration.

Production deployments should set `HUMIDORHQ_FORCE_SECURE_COOKIES=1`. Set `HUMIDORHQ_TRUST_PROXY_HEADERS=1` only when the hosting proxy reliably overwrites forwarded headers. Session and throttle defaults can be adjusted with the documented `HUMIDORHQ_SESSION_*` and `HUMIDORHQ_LOGIN_*` environment variables in [External Runtime Data Setup](docs/RUNTIME_DATA.md).

Create or update a local user with:

```powershell
php tools/create-auth-user.php "your-username" "your-password" "Your Display Name"
```

That command requires `HUMIDORHQ_DATA_ROOT` and atomically writes `auth-users.json` there. For an empty installation, copy `seed-data/` externally first, set the variable, then create the first user.

Public routes:

- `GET /api/health`
- `GET /api/session`
- `POST /api/login`
- `POST /api/logout`

Protected routes include `GET /api/sample-data` and future data-changing endpoints.


## Data Management

Signed-in users can add, edit, and delete records from the working navigation, Dashboard linked count rows, and Dashboard quick actions:

- `Catalog` manages external runtime `catalog-cigars.json` and shows purchased/on-hand quantities from linked records.
- `Vendors` manages external runtime `vendors.json`.
- `Humidors` manages external runtime `storage-locations.json`, shows current count and oldest inventory date, and includes inline section management.
- `Humidor Sections` stores drawers, shelves, trays, and zones in external runtime `storage-sub-locations.json`.
- `Purchases` manages purchase headers in external runtime `purchases.json`.
- `PO Lines` links purchases, cigars, and storage in external runtime `purchase-lines.json`.

Creating or updating an unreceived PO Line synchronizes its weighted purchase allocation fields. Receiving is a separate authoritative operation:

- `POST /api/purchase-lines/{id}/receive` accepts a receipt quantity, local calendar date, Humidor, optional drawer/section, and required idempotency key.
- `lots.json` receives one Lot per purchase line and accumulates the quantity actually received.
- `lot-location-balances.json` accumulates the receipt in the exact Humidor and optional drawer/section without resetting other split balances.
- `inventory-events.json` records each accepted `purchase-receipt` with immutable cost/MSRP snapshots and the idempotency key.

The API validates those links before writing so a PO Line cannot point to a missing purchase, cigar, humidor, or mismatched drawer/section. Purchase totals such as shipping, excise tax, sales tax, and discount are calculated authoritatively in PHP and allocated across lines by weighted purchase price. Receipt retries with the same key and payload return the original event without changing files, counters, or the audit log; reuse of a key with different input is rejected. Moves and removals also reconcile the affected Lot quantity cache from current positive balances. Git deployments cannot overwrite live records because `HUMIDORHQ_DATA_ROOT` must resolve outside the deployed application.

Purchase status is derived from receipt events: `pending` means nothing has been received, `partially-received` means at least one ordered cigar remains, and `received` means every line is complete. Purchase lines retain ordered `quantity`, store their received-quantity cache and first/latest/completion dates, and reconcile those values to receipt events. The purchase header receives its completion date only after every line is complete. Existing records are not automatically migrated or repaired.

Codex work for Jason should stay on `Jason-Bug-Fixes`; merges to `main` and fast-forwards to Matt branches only happen when explicitly requested.

Lots, location balances, and inventory events are readable by the app for reports and quantity calculations, but direct writes stay controlled by purchase-line and inventory workflows.

### Functional Stabilization Stage 0 Guardrails

- An exact same-Humidor/same-section inventory move is rejected before balances, events, or counters are changed. The move form also prevents selecting the exact current destination.
- Purchase lines attached to a received purchase, or to a purchase with Lots, balances, or InventoryEvents, are temporarily immutable except for notes. New lines cannot be added or reassigned to those purchases, including when an existing received line is incomplete and has no history of its own.
- Received purchase headers with inventory history permit only non-inventory edits to invoice number, expected date, tracking number, and notes. Generic edits cannot reconstruct established receipt state.
- Catalog cigars, Vendors, Humidors, and Humidor sections cannot be physically deleted while the relationships protected by the API still reference them. Purchase lines and purchases with inventory history cannot be physically deleted.
- No existing runtime records are automatically migrated, repaired, cascaded, or reconstructed by these guardrails.
- `tools/check-data-integrity.ps1` is read-only. It reports inventory reconciliation, relationship, identifier, counter, move, journal, and purchase-total issues and never repairs data.

## Audit Trail

HumidorHQ writes user activity to external runtime `audit-log.jsonl`. Each record includes date-time, user, page, and action. The file is created automatically by the PHP API.

Audit, Changelog, and Todo pages remain protected PHP-backed pages, but they are hidden from the left menu to keep the working navigation focused.

The audit log, lock files, temporary writes, credentials, and backups remain outside Git and the deployed code tree.

## Codex Setup Shortcut

For a new computer or Matt's setup, run:

```powershell
.\setup-codex-profile.ps1
```

The script prompts for the existing HumidorHQ project folder, validates that it looks like this repo, saves `$HumidorHQ` to the current user's PowerShell profile, changes into that folder, and launches Codex. It does not create the project folder.

## Local Development

No package install or build command is required. Before starting PHP, create or copy an external runtime directory and set `HUMIDORHQ_DATA_ROOT`. Preview preservation of the current local records with:

```powershell
.\tools\copy-runtime-data.ps1 -SourceRoot '.\data' -DestinationRoot 'C:\HumidorHQ\runtime-data' -ManifestRoot 'C:\HumidorHQ\migration-manifests'
```

The copy utility is dry-run by default. The explicit apply command and complete Windows setup are documented in [docs/RUNTIME_DATA.md](docs/RUNTIME_DATA.md). This change does not automatically copy, move, or delete existing records.

Recommended:

```powershell
$env:HUMIDORHQ_DATA_ROOT = 'C:\HumidorHQ\runtime-data'
.\start-local-server.ps1
```

To import the rich historical workbook into the local JSON model:

```powershell
.\tools\import-rich-workbook.ps1 -WorkbookPath "C:\Path\HumidorHQ_Rich_Import_Workbook.xlsx" -DataRoot "$env:TEMP\humidorhq-import-test"
```

The importer and inventory rebuild utility require an explicit isolated `-DataRoot` for testing or a deliberate destructive override. They are not part of runtime initialization.

Run the read-only integrity checker with:

```powershell
.\tools\check-data-integrity.ps1 # reads HUMIDORHQ_DATA_ROOT
```

`tools/repair-inventory-only.ps1` is a narrowly scoped offline migration for the confirmed Balance 66 location and Lots 30, 54, 65, and 70 quantity-cache corrections. It requires exact before-value matches, an external backup directory, an explicit apply confirmation, and an additional override for repository runtime data. Rehearse it only against a copied temporary data root. It does not use API synchronization, import, or rebuild logic and does not modify purchase, purchase-line, event, journal, counter, balance-quantity, or cost/MSRP snapshot data.

`tools/repair-purchase-headers.ps1` is a separately guarded offline migration for the approved Purchases 1-40 subtotal population and negative-discount normalization. Stored `totalPaid` remains authoritative. The script is dry-run by default, requires exact header preconditions and an external verified backup, and changes only `subtotal` and negative `discount` fields in `purchases.json`. It does not resynchronize purchase lines or modify allocations, inventory, history, counters, quantities, IDs, or snapshots.

The automated smoke, runtime-separation, transaction, and authentication-security tests create and remove external temporary data roots from tracked seed data; they do not use or overwrite current local runtime JSON. Run them with:

```powershell
.\tests\flat-file-smoke.ps1
.\tests\runtime-data-separation.ps1
.\tests\flat-file-transaction.ps1
.\tests\auth-security.ps1
```

If the workbook does not yet contain rows in `Current Inventory`, the importer places remaining on-hand lots into the placeholder humidor and section `Imported Inventory / General` so the collection can still be reviewed and moved locally.

To stop the local server:

```powershell
.\stop-local-server.ps1
```

Manual PHP equivalent after setting `HUMIDORHQ_DATA_ROOT`:

```powershell
php -S 127.0.0.1:8000 -t .
```

Then open:

```text
http://127.0.0.1:8000/
```

## Deployment

The intended deployment flow is:

1. Create and protect an external Hostinger runtime directory outside `public_html` and any Git deployment target.
2. Configure `HUMIDORHQ_DATA_ROOT` persistently in Hostinger/PHP configuration.
3. Push code and tracked seed data to GitHub.
4. GitHub deployment replaces only the application tree; the external runtime directory is not a deployment target.
5. The frontend calls relative PHP API paths, and PHP accesses the external JSON directory.

No build artifact is required. Account-specific paths, runtime JSON, credentials, audit logs, manifests, and backups must remain outside Git. See [docs/RUNTIME_DATA.md](docs/RUNTIME_DATA.md) for Hostinger setup and permissions.

## Revision Policy

Project revisions start at `1.0.0`.

Use `major.minor.feature` numbering:

- `major` - breaking architecture or data changes
- `minor` - new workflow, page, API, or significant enhancement
- `feature` - focused feature work, fixes, documentation updates, or small compatibility updates

Every meaningful change should be recorded in `CHANGELOG.md` before deployment.

