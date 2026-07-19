<!--
Filename: README.md
Revision: 1.24.0
Description: Project documentation and implementation notes.
Modified Date: 2026-07-19 17:00 ET
-->

# HumidorHQ

HumidorHQ is a cigar collection and humidor management app using a flat-file hosting model for GitHub-driven deployment to Hostinger.

## Page Functions And Features

- `Dashboard` shows on-hand and en route cigars, current cost basis, current MSRP value, lifetime savings, average on-hand cost and MSRP, lifetime smoked, gifted, and discarded totals with per-cigar averages, and each humidor's current count with oldest inventory date. An active Humidor named `Pre Inventory` receives a staging count and reconciliation worklist showing each staged cigar, its quantity placed elsewhere, total on hand, and current placement percentage. The card and cigar links open the existing filtered Collection move workflow, and all staging information disappears when the Humidor is archived.
- `Collection` shows the cigars currently on hand, supports search, strength, Buy Again, and Humidor filters, sorting alphabetically/by location/by strength, and quantity/date-aware Smoke, Give, Discard / Damage, and Move actions. Removal retries are idempotent, and smoked removals can immediately capture a 1-10 rating, tasting notes, and an optional Buy Again decision.
- `Catalog` alphabetically lists active and archived master cigar records, supports search across cigar details and Buy Again information, and manages a Buy Again status (`Not Evaluated`, `Yes`, `Maybe`, or `No`) with optional decision notes. Purchased and on-hand quantities are calculated from linked purchase and inventory records. Archived cigars remain visible wherever history references them but cannot be assigned to new purchase lines. Catalog record counts omit internal runtime filenames.
- `Vendors` manages active and archived vendor contact records used by purchases. Archived Vendors remain attached to historical purchases but cannot be assigned to new purchases. Vendor record counts omit internal runtime filenames.
- `Purchases` summarizes total orders, cigars purchased, lifetime paid, and en route quantity; its on-demand order builder creates pending purchases with weighted cost allocation, and purchase records expand to show cigar lines and receiving controls.
- `Humidors` manages active and archived storage locations, current count, oldest inventory date, inline name/detail editing, protected deletion while linked records exist, and drawer/shelf/tray/zone setup. A Humidor cannot be archived while it contains inventory, and Humidor record counts omit internal runtime filenames.
- `Humidor Sections` remains an internal linked collection for drawers, shelves, trays, and zones inside humidors, now managed inline from the Humidors page with archive/restore support and an inventory-empty archive requirement.
- `Reports` provides purchase-history summaries by Vendor or cigar manufacturer with an optional Buy Again filter, a Buy Again decision summary and highly rated (8.0+) unevaluated follow-up list, plus filterable smoked, gifted, and discarded/damaged removal history by period, custom date range, type, and search. Both purchase-summary views foot to stored purchase `totalPaid`; filtered shares use deterministic cent allocations from line weights without duplicating Purchases-page detail.
- `Backup & Restore` creates portable runtime JSON backups, downloads or imports validated bundles, previews restores, and creates a safety backup before a guarded transactional restore.
- `Audit`, `Changelog`, `TODO`, and internal `PO Lines` remain protected and routable, but are hidden from the left menu.
- Browser refresh keeps the active page by storing page navigation in the URL hash, such as `#Purchases`.
- Signed-in user, logout controls, Mobile preview access, project revision, and a stacked modified date/time sit in the lower-left sidebar.
- `Mobile` opens `/mobile/`, a visible viewport preview page for phone and tablet widths that defaults to iPhone 16 Pro without exposing Jason-only utility links.
- Hidden Jason utility page at `/j/` provides quick links to Dashboard, Changelog, Audit, TODO, and an in-page preview that defaults to full web view with optional mobile presets.

## Current Target

The target runtime is:

- PHP for API endpoints
- JSON files in the ignored in-repository `data/` directory by default, with an optional external override
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
- `data/` - default runtime JSON and credentials, ignored by Git and denied direct browser access
- `seed-data/` - tracked empty initialization JSON for explicitly initialized copies
- `HUMIDORHQ_DATA_ROOT` - optional override for a different runtime directory
- `docs/` - design notes, migration notes, and conversion tracking
- `CHANGELOG.md` - revisioned project change history
- Changelog entries include `Changed by` labels derived from Git author history where the author can be identified.

Legacy TypeScript, React, Vite, Node, and Prisma runtime files have been removed from the deployable app. Historical conversion notes may still reference those technologies for migration context only.

Temporary probe files are not part of the deployable app and should not be committed.

## Data Model

Runtime data defaults to `APP_ROOT/data`. `HUMIDORHQ_DATA_ROOT` remains an optional override. On first run, PHP creates a missing runtime directory and initializes missing non-auth collections from validated, tracked `seed-data/` templates using create-only atomic replacement; existing files are never overwritten. Startup still fails safely if the selected directory is unavailable or unwritable, existing JSON is malformed, or secure credentials have not been provisioned.

Data-changing API workflows use one serialized transaction boundary. Collections are reloaded while that lock is held, IDs are allocated with their records, all changed JSON is staged before replacement, and exact backups plus a recovery journal restore the prior state after a write failure or interrupted process. Successful mutation audit entries are delayed until the JSON commit completes.

Purchase dates use the browser's local calendar by default and are validated as real `YYYY-MM-DD` dates by PHP. Inventory event dates use `HUMIDORHQ_TIMEZONE`, defaulting to `America/Indiana/Indianapolis`.

PHP is authoritative for purchase totals and weighted allocations. Monetary calculations use integer cents and a stable line-ID largest-remainder allocation. Known zero remains `$0.00`; missing adjustments, costs, and MSRP values remain `Unknown` rather than being included as zero in complete-looking totals.

The browser app never fetches raw JSON directly. It calls authenticated PHP endpoints under `api/`. Runtime JSON is ignored by Git, and `data/.htaccess` denies direct browser access. See [Runtime Data Setup](docs/RUNTIME_DATA.md) for Windows and Hostinger configuration.


## Authentication

Public deployments require sign-in before data routes can be read or changed. The PHP API uses server-side sessions and verifies users against password hashes in runtime `auth-users.json`.

Runtime credentials are never read from the repository. Do not commit real usernames or password hashes.

Authentication applies shared username and client-address throttles, audits failed and rate-limited attempts without passwords, and uses a constant-work dummy verification for unknown usernames. Authenticated sessions expire after 30 minutes of inactivity or 12 hours total by default. Login and every authenticated state-changing request require a session CSRF token. Session cookies are HttpOnly, SameSite Strict, and Secure whenever HTTPS is detected or forced by production configuration.

Production deployments should set `HUMIDORHQ_FORCE_SECURE_COOKIES=1`. Set `HUMIDORHQ_TRUST_PROXY_HEADERS=1` only when the hosting proxy reliably overwrites forwarded headers. Session and throttle defaults can be adjusted with the documented `HUMIDORHQ_SESSION_*` and `HUMIDORHQ_LOGIN_*` environment variables in [Runtime Data Setup](docs/RUNTIME_DATA.md).

Create or update a local user with:

```powershell
php tools/create-auth-user.php "your-username" "your-password" "Your Display Name"
```

That command defaults to `data/auth-users.json` and atomically writes it. `auth-users.json` is never copied from seed data during first-run initialization; startup returns `AUTH_USERS_SETUP_REQUIRED` until credentials are created securely. Set `HUMIDORHQ_DATA_ROOT` only when intentionally using another runtime directory.

Public routes:

- `GET /api/health`
- `GET /api/session`
- `POST /api/login`
- `POST /api/logout`

Protected routes include `GET /api/sample-data` and future data-changing endpoints.


## Data Management

Signed-in users can add, edit, and delete records from the working navigation, Dashboard linked count rows, and Dashboard quick actions:

- `Catalog` manages runtime `catalog-cigars.json`, including optional Buy Again decisions and notes, and shows purchased/on-hand quantities from linked records in searchable alphabetical order. Existing records without a decision are treated as `Not Evaluated` without a data migration. When a cigar is smoked, the Journal defaults to its current Catalog decision and saving a changed decision updates the Catalog.
- `Vendors` manages runtime `vendors.json`.
- `Humidors` manages runtime `storage-locations.json`, shows current count and oldest inventory date, and includes inline section management.
- `Humidor Sections` stores drawers, shelves, trays, and zones in runtime `storage-sub-locations.json`.
- `Purchases` manages purchase headers in runtime `purchases.json`.
- `PO Lines` links purchases, cigars, and storage in runtime `purchase-lines.json`.

Creating or updating an unreceived PO Line synchronizes its weighted purchase allocation fields. Receiving is a separate authoritative operation:

- `POST /api/purchase-lines/{id}/receive` accepts a receipt quantity, local calendar date, Humidor, optional drawer/section, and required idempotency key.
- `lots.json` receives one Lot per purchase line and accumulates the quantity actually received.
- `lot-location-balances.json` accumulates the receipt in the exact Humidor and optional drawer/section without resetting other split balances.
- `inventory-events.json` records each accepted `purchase-receipt` with immutable cost/MSRP snapshots and the idempotency key.

The API validates those links before writing so a PO Line cannot point to a missing purchase, cigar, humidor, or mismatched drawer/section. Purchase totals such as shipping, excise tax, sales tax, and discount are calculated authoritatively in PHP and allocated across lines by weighted purchase price. Receipt retries with the same key and payload return the original event without changing files, counters, or the audit log; reuse of a key with different input is rejected. Moves and removals also reconcile the affected Lot quantity cache from current positive balances. Runtime files under `data/` are ignored by Git so normal code pulls do not manage their contents.

Purchase status is derived from receipt events: `pending` means nothing has been received, `partially-received` means at least one ordered cigar remains, and `received` means every line is complete. Purchase lines retain ordered `quantity`, store their received-quantity cache and first/latest/completion dates, and reconcile those values to receipt events. The purchase header receives its completion date only after every line is complete. Existing records are not automatically migrated or repaired.

Inventory correction uses append-only full-event reversal rather than editing or deleting history. `POST /api/inventory-events/{id}/reverse` supports purchase receipts, moves, smokes, gifts, and discards. It requires a local calendar date, correction reason, and idempotency key; only one reversal may target an event. The original event and any Smoking Journal entry remain intact. Receipt and move reversals require the original destination to still contain the complete event quantity. After a receipt reversal, corrected quantity, date, and storage placement are entered through the normal Receive and Store workflow. Direct Catalog-cigar relationship correction remains deferred.

Codex work for Jason should stay on `Jason-Bug-Fixes`; merges to `main` and fast-forwards to Matt branches only happen when explicitly requested.

Lots, location balances, and inventory events are readable by the app for reports and quantity calculations, but direct writes stay controlled by purchase-line and inventory workflows.

### Functional Stabilization Stage 0 Guardrails

- An exact same-Humidor/same-section inventory move is rejected before balances, events, or counters are changed. The move form also prevents selecting the exact current destination.
- Purchase lines attached to a received purchase, or to a purchase with Lots, balances, or InventoryEvents, are temporarily immutable except for notes. New lines cannot be added or reassigned to those purchases, including when an existing received line is incomplete and has no history of its own.
- Received purchase headers with inventory history permit only non-inventory edits to invoice number, expected date, tracking number, and notes. Generic edits cannot reconstruct established receipt state.
- Catalog cigars, Vendors, Humidors, and Humidor sections cannot be physically deleted while the relationships protected by the API still reference them. Purchase lines and purchases with inventory history cannot be physically deleted.
- Catalog cigars, Vendors, Humidors, and Humidor sections can be archived and restored without changing their IDs or linked history. Existing records without an `isActive` field are treated as active; no runtime migration is performed automatically.
- Archived records are excluded from new purchase, receiving, movement, and storage-selection workflows. Humidors and sections with positive balances must be emptied before archive, and a Humidor's active sections must be archived first.
- Inventory Events are never edited or deleted by corrections. Supported events may receive one append-only, idempotent full reversal; effective inventory, receipt status, Dashboard values, and reports exclude the reversed event's effect while Activity retains both records.
- No existing runtime records are automatically migrated, repaired, cascaded, or reconstructed by these guardrails.
- `tools/check-data-integrity.ps1` is read-only. It reports inventory reconciliation, relationship, identifier, counter, move, journal, and purchase-total issues and never repairs data.

## Audit Trail

HumidorHQ writes user activity to runtime `audit-log.jsonl`. Each record includes date-time, user, page, and action. The file is created automatically by the PHP API.

Audit, Changelog, and Todo pages remain protected PHP-backed pages, but they are hidden from the left menu to keep the working navigation focused.

The audit log, lock files, temporary writes, credentials, and backups remain outside Git tracking.

## Backup And Restore

The authenticated `Backup & Restore` page creates portable JSON bundles under `backups/`. Bundle files are ignored by Git, and tracked `backups/.htaccess` denies direct HTTP access. Use the authenticated Download action to keep an off-server copy; bundles contain `auth-users.json` password hashes and must be stored securely.

A bundle contains all twelve runtime JSON collections but deliberately excludes `audit-log.jsonl`. Creation and download remain available for preserving parseable legacy data. Import and restore additionally validate IDs, counters, required relationships, and Lot/balance reconciliation without changing runtime data; an integrity failure must be corrected before that bundle can be restored. Restore requires a fresh preview, the exact phrase `RESTORE-HUMIDORHQ-BACKUP`, and an unchanged current-state fingerprint. It creates a timestamped pre-restore safety bundle before replacing collections through the existing journaled multi-file transaction. Existing audit history is never replaced by restore.

## Codex Setup Shortcut

For a new computer or Matt's setup, run:

```powershell
.\setup-codex-profile.ps1
```

The script prompts for the existing HumidorHQ project folder, validates that it looks like this repo, saves `$HumidorHQ` to the current user's PowerShell profile, changes into that folder, and launches Codex. It does not create the project folder.

## Local Development

No package install or build command is required. Existing runtime JSON remains in `data/` and is never overwritten by initialization. Missing non-auth runtime files are created from validated `seed-data/` templates, and a missing audit log is created empty. The optional copy utility remains dry-run by default for deliberately creating a separate runtime directory.

Recommended:

```powershell
.\start-local-server.ps1
```

To use an optional external override, pass `-DataRoot` or set `HUMIDORHQ_DATA_ROOT` before starting.

To import the rich historical workbook into the local JSON model:

```powershell
.\tools\import-rich-workbook.ps1 -WorkbookPath "C:\Path\HumidorHQ_Rich_Import_Workbook.xlsx" -DataRoot "$env:TEMP\humidorhq-import-test"
```

The importer and inventory rebuild utility require an explicit isolated `-DataRoot` for testing or a deliberate destructive override. They are not part of runtime initialization.

Run the read-only integrity checker with:

```powershell
.\tools\check-data-integrity.ps1 # defaults to .\data
```

`tools/repair-inventory-only.ps1` is a narrowly scoped offline migration for the confirmed Balance 66 location and Lots 30, 54, 65, and 70 quantity-cache corrections. It requires exact before-value matches, an external backup directory, an explicit apply confirmation, and an additional override for repository runtime data. Rehearse it only against a copied temporary data root. It does not use API synchronization, import, or rebuild logic and does not modify purchase, purchase-line, event, journal, counter, balance-quantity, or cost/MSRP snapshot data.

`tools/repair-purchase-headers.ps1` is a separately guarded offline migration for the approved Purchases 1-40 subtotal population and negative-discount normalization. Stored `totalPaid` remains authoritative. The script is dry-run by default, requires exact header preconditions and an external verified backup, and changes only `subtotal` and negative `discount` fields in `purchases.json`. It does not resynchronize purchase lines or modify allocations, inventory, history, counters, quantities, IDs, or snapshots.

The automated smoke, runtime-location, transaction, and authentication-security tests create and remove isolated temporary data roots from tracked seed data; they do not use or overwrite current local runtime JSON. Run them with:

```powershell
.\tests\flat-file-smoke.ps1
.\tests\runtime-data-separation.ps1
.\tests\flat-file-transaction.ps1
.\tests\auth-security.ps1
.\tests\backup-restore.ps1
node .\tests\reporting-filters.js
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

1. Keep live runtime files in the deployed application's `data/` directory; missing non-auth files are initialized from tracked `seed-data/` templates on first request.
2. Confirm `data/.htaccess` is deployed and Apache honors its deny rules.
3. Keep every runtime JSON/JSONL file ignored by Git so code pulls do not manage it.
4. Ensure PHP can create, read, and write `data/`; use `HUMIDORHQ_DATA_ROOT` only as an optional override.
5. Provision `auth-users.json` separately with `tools/create-auth-user.php`; initialization never installs example credentials or password hashes.
6. The frontend calls relative authenticated PHP API paths, and PHP accesses the selected JSON directory.

No build artifact is required. Runtime JSON, credentials, audit logs, manifests, and backups must remain outside Git tracking. See [docs/RUNTIME_DATA.md](docs/RUNTIME_DATA.md) for Hostinger setup and permissions.

## Revision Policy

Project revisions start at `1.0.0`.

Use `major.minor.feature` numbering:

- `major` - breaking architecture or data changes
- `minor` - new workflow, page, API, or significant enhancement
- `feature` - focused feature work, fixes, documentation updates, or small compatibility updates

Every meaningful change should be recorded in `CHANGELOG.md` before deployment.

