<!--
Filename: README.md
Revision: 1.7.5
Description: Project documentation and implementation notes.
Modified Date: 2026-07-16 18:05 ET
-->

# HumidorHQ

HumidorHQ is a cigar collection and humidor management app using a flat-file hosting model for GitHub-driven deployment to Hostinger.

## Page Functions And Features

- `Dashboard` shows on-hand and en route cigars, current cost basis, current MSRP value, lifetime savings, average on-hand cost and MSRP, lifetime smoked and gifted totals with per-cigar averages, and each humidor's current count with oldest inventory date.
- `Collection` shows the cigars currently on hand and can sort them alphabetically or by humidor location.
- `Catalog` manages master cigar records and shows purchased and on-hand quantities calculated from linked purchase and inventory records.
- `Vendors` manages vendor contact records used by purchases.
- `Purchases` summarizes total orders, cigars purchased, lifetime paid, and en route quantity; its on-demand order builder creates pending purchases with weighted cost allocation, and purchase records expand to show cigar lines and receiving controls.
- `Humidors` manages storage locations, current count, oldest inventory date, inline name/detail editing, protected deletion while inventory is assigned, cleanup of empty linked sections during deletion, and drawer/shelf/tray/zone setup.
- `Humidor Sections` remains an internal linked collection for drawers, shelves, trays, and zones inside humidors, now managed inline from the Humidors page.
- `Reports` provides filterable smoked and gifted removal history by period, custom date range, type, and search; it calculates quantity, cost, MSRP, savings, per-cigar averages, and keeps recent inventory activity below the report.
- `Audit`, `Changelog`, `Todo`, and internal `PO Lines` remain protected and routable, but are hidden from the left menu.
- Browser refresh keeps the active page by storing page navigation in the URL hash, such as `#Purchases`.
- Signed-in user and logout controls sit in the lower-left sidebar with the project revision and modified timestamp.
- Hidden Jason utility page at `/j/` provides quick links to Dashboard, Changelog, Audit, TODO.md, and an in-page mobile viewport preview.

## Current Target

The target runtime is:

- PHP for API endpoints
- JSON files for persistent data and sample data
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
- `data/` - JSON data files used by the PHP API
- `docs/` - design notes, migration notes, and conversion tracking
- `CHANGELOG.md` - revisioned project change history
- Changelog entries include `Changed by` labels derived from Git author history where the author can be identified.

Legacy TypeScript, React, Vite, Node, and Prisma runtime files have been removed from the deployable app. Historical conversion notes may still reference those technologies for migration context only.

Temporary probe files are not part of the deployable app and should not be committed.

## Data Model

Runtime data is stored in JSON files under `data/`. These files also serve as sample data for local and deployed testing.

The browser app should not fetch raw JSON files directly. It should call PHP endpoints under `api/`, and the PHP layer should read and write the JSON files. This keeps the frontend contract stable and allows `data/.htaccess` to block direct web access to the backing files on Hostinger. `GET /api/sample-data` summarizes the current repo JSON files for the flat dashboard shell.


## Authentication

Public deployments require sign-in before data routes can be read or changed. The PHP API uses server-side sessions and verifies users against password hashes in `data/auth-users.json`.

`data/auth-users.json` is intentionally ignored by Git. Do not commit real usernames or password hashes.

Create or update a local user with:

```powershell
php tools/create-auth-user.php "your-username" "your-password" "Your Display Name"
```

That command writes `data/auth-users.json`. Upload that file securely to Hostinger with the rest of the protected `data/` folder. The committed `data/auth-users.example.json` file shows the expected shape only. The committed `data/auth-users.json.placeholder` file documents the ignored runtime credential file that must exist in deployed environments.

Public routes:

- `GET /api/health`
- `GET /api/session`
- `POST /api/login`
- `POST /api/logout`

Protected routes include `GET /api/sample-data` and future data-changing endpoints.


## Data Management

Signed-in users can add, edit, and delete records from the working navigation, Dashboard linked count rows, and Dashboard quick actions:

- `Catalog` manages `data/catalog-cigars.json` and shows purchased/on-hand quantities from linked records.
- `Vendors` manages `data/vendors.json`.
- `Humidors` manages `data/storage-locations.json`, shows current count and oldest inventory date, and includes inline section management.
- `Humidor Sections` stores drawers, shelves, trays, and zones in `data/storage-sub-locations.json`; it is managed inline from the Humidors page.
- `Purchases` manages purchase headers in `data/purchases.json`, including status values for in-route, partially received, and received orders.
- `PO Lines` links a purchase, catalog cigar, humidor, and optional drawer/section in `data/purchase-lines.json`; it stays internally routable but is managed inline from the Purchases page.

Creating or updating a PO Line automatically syncs the related inventory records and weighted purchase allocation fields:

- `data/lots.json` receives the lot tied to the purchase line and catalog cigar.
- `data/lot-location-balances.json` receives the current humidor and optional drawer/section balance.
- `data/inventory-events.json` receives the `purchase-receipt` event with cost and MSRP snapshots.

The API validates those links before writing so a PO Line cannot point to a missing purchase, cigar, humidor, or mismatched drawer/section. Purchase totals such as shipping, excise tax, sales tax, and discount are allocated across lines by weighted purchase price. Runtime record JSON on Hostinger should be treated as live data; do not overwrite deployed `data/*.json` records from GitHub unless that overwrite is intentional.

Codex work for Jason should stay on `Jason-Bug-Fixes`; merges to `main` and fast-forwards to Matt branches only happen when explicitly requested.

Lots, location balances, and inventory events are readable by the app for reports and quantity calculations, but direct writes stay controlled by purchase-line and inventory workflows.

## Audit Trail

HumidorHQ writes user activity to `data/audit-log.jsonl`. Each record includes date-time, user, page, and action. The live audit file is ignored by Git and created automatically by the PHP API.

Audit, Changelog, and Todo pages remain protected PHP-backed pages, but they are hidden from the left menu to keep the working navigation focused.

The committed `data/audit-log.jsonl.placeholder` file documents the ignored runtime audit file.

## Codex Setup Shortcut

For a new computer or Matt's setup, run:

```powershell
.\setup-codex-profile.ps1
```

The script prompts for the existing HumidorHQ project folder, validates that it looks like this repo, saves `$HumidorHQ` to the current user's PowerShell profile, changes into that folder, and launches Codex. It does not create the project folder.

## Local Development

For the final flat-file version, no package install or build command should be required. Serve the project with PHP so API routes are available.

Recommended:

```powershell
.\start-local-server.ps1
```

To import the rich historical workbook into the local JSON model:

```powershell
.\tools\import-rich-workbook.ps1 -WorkbookPath "C:\Users\mcaras\OneDrive\Documents\HumidorHQ_Rich_Import_Workbook.xlsx"
```

If the workbook does not yet contain rows in `Current Inventory`, the importer places remaining on-hand lots into the placeholder humidor and section `Imported Inventory / General` so the collection can still be reviewed and moved locally.

To stop the local server:

```powershell
.\stop-local-server.ps1
```

Manual PHP equivalent:

```powershell
php -S 127.0.0.1:8000 -t .
```

Then open:

```text
http://127.0.0.1:8000/
```

## Deployment

The intended deployment flow is:

1. Push changes to GitHub.
2. GitHub webhook or deployment automation sends the flat files to Hostinger.
3. Hostinger serves `index.html`, static assets, PHP API files, and protected JSON data files.
4. The frontend calls relative PHP API paths.

No build artifact is required for deployment.

## Revision Policy

Project revisions start at `1.0.0`.

Use `major.minor.feature` numbering:

- `major` - breaking architecture or data changes
- `minor` - new workflow, page, API, or significant enhancement
- `feature` - focused feature work, fixes, documentation updates, or small compatibility updates

Every meaningful change should be recorded in `CHANGELOG.md` before deployment.

