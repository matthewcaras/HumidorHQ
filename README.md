<!--
Filename: README.md
Revision: 1.1.0
Description: Project documentation and implementation notes.
Modified Date: 2026-07-15 01:14 ET
-->

# HumidorHQ

HumidorHQ is a cigar collection and humidor management app using a flat-file hosting model for GitHub-driven deployment to Hostinger.

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

Signed-in users can add, edit, and delete records from the left menu:

- `Catalog` manages `data/catalog-cigars.json`.
- `Vendors` manages `data/vendors.json`.
- `Humidors` manages `data/storage-locations.json`.
- `Purchases` manages purchase headers in `data/purchases.json`.

The first CRUD pass intentionally keeps purchase lines, lot creation, and inventory event automation out of scope. Those workflows affect cost basis and inventory accounting and should be added as a separate pass.
## Audit Trail

HumidorHQ writes user activity to `data/audit-log.jsonl`. Each record includes date-time, user, page, and action. The live audit file is ignored by Git and created automatically by the PHP API.

The left menu includes an Audit page for recent activity and a Changelog page that reads `CHANGELOG.md` through the protected PHP API.

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









