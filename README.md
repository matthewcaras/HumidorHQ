<!--
Filename: README.md
Revision: 1.4.3
Description: Project documentation and implementation notes.
Modified Date: 2026-07-16 09:45 ET
-->

# HumidorHQ

HumidorHQ is a cigar collection and humidor management app using a flat-file hosting model for GitHub-driven deployment to Hostinger.

## Page Functions And Features

- `Dashboard` summarizes catalog, humidor, inventory, vendor, purchase, and receipt-event counts. Dashboard count rows link to the related working pages and keep internal purchase-line records hidden from the user-facing dashboard.
- `Collection` shows the current flat-file JSON collections and source files returned by the PHP API.
- `Catalog` manages master cigar records and shows purchased and on-hand quantities calculated from linked purchase and inventory records.
- `Vendors` manages vendor contact records used by purchases.
- `Purchases` tracks purchase headers, vendor, status, expected date, received date, tracking number, invoice/PO number, costs, and purchased quantity totals.
- `Humidors` manages storage locations and shows linked drawer, shelf, tray, or zone counts.
- `Humidor Sections` manages drawers, shelves, trays, and zones inside humidors. It is available from Dashboard actions but hidden from the left menu.
- `Reports` is the current destination for inventory lots, balances, and receipt-event summaries until dedicated report screens are added.
- `Audit`, `Changelog`, `Todo`, and internal `PO Lines` remain protected and routable, but are hidden from the left menu.
- Browser refresh keeps the active page by storing page navigation in the URL hash, such as `#Purchases`.
- Signed-in user and logout controls sit in the lower-left sidebar with the project revision and modified timestamp.

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
- `Humidors` manages `data/storage-locations.json` and shows the number of linked sections.
- `Humidor Sections` stores drawers, shelves, trays, and zones in `data/storage-sub-locations.json`; it is available from Dashboard quick actions, not the left menu.
- `Purchases` manages purchase headers in `data/purchases.json`, including status values for in-route, partially received, and received orders.
- `PO Lines` links a purchase, catalog cigar, and humidor in `data/purchase-lines.json`; it is still available internally but hidden from the left menu for now.

Creating a PO Line automatically creates the related inventory records:

- `data/lots.json` receives the lot tied to the purchase line and catalog cigar.
- `data/lot-location-balances.json` receives the starting humidor balance.
- `data/inventory-events.json` receives a `purchase-receipt` event.

The API validates those links before writing so a PO Line cannot point to a missing purchase, cigar, or humidor. Runtime record JSON on Hostinger should be treated as live data; do not overwrite deployed `data/*.json` records from GitHub unless that overwrite is intentional.

Lots, location balances, and inventory events are readable by the app for reports and quantity calculations, but direct writes stay controlled by purchase-line and inventory workflows.

## Audit Trail

HumidorHQ writes user activity to `data/audit-log.jsonl`. Each record includes date-time, user, page, and action. The live audit file is ignored by Git and created automatically by the PHP API.

Audit, Changelog, and Todo pages remain protected PHP-backed pages, but they are hidden from the left menu to keep the working navigation focused.

The committed `data/audit-log.jsonl.placeholder` file documents the ignored runtime audit file.

## Local Development

For the final flat-file version, no package install or build command should be required. Serve the project with PHP so API routes are available.

Recommended:

```powershell
.\start-local-server.ps1
```

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

