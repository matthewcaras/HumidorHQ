<!--
Filename: CHANGELOG.md
Revision: 1.6.9
Description: Project documentation and implementation notes.
Modified Date: 2026-07-16 09:20 ET
-->

# Changelog

All meaningful project changes should be recorded here before deployment.

Revision format: `major.minor.feature`

- `major` - breaking architecture or data changes
- `minor` - new workflow, page, API, or significant enhancement
- `feature` - focused feature work, fixes, documentation updates, or small compatibility updates

## 1.6.9 - 2026-07-16

- Added `setup-codex-profile.ps1` to save and reuse the HumidorHQ project path in PowerShell.
- Fixed the incomplete profile setup flow with path validation, profile creation, existing variable replacement, and Codex launch handling.

## 1.6.8 - 2026-07-16

- Updated shared Codex instructions to keep Jason work on `Jason-Bug-Fixes` by default.
- Removed automatic merge and branch fast-forward expectations unless explicitly requested.

## 1.6.7 - 2026-07-16

- Fixed Catalog and related pages failing when read-only internal collections were loaded for quantity calculations.
- Added read-only API access for lots, location balances, and inventory events while keeping writes blocked.
- Cleared stale page errors during navigation so one failed request does not affect every tab.

## 1.6.6 - 2026-07-16

- Removed temporary repository probe files `do-you-see-me.txt` and `test.txt`.
- Updated active branches from `main` after cleanup.

## 1.6.5 - 2026-07-16

- Moved signed-in user and logout controls to the lower-left sidebar with project revision metadata.
- Bumped static asset versions for the sidebar account layout update.

## 1.6.4 - 2026-07-16

- Removed visible Purchase Lines and PO Lines rows from the Dashboard while keeping internal records available.
- Made Dashboard inventory and purchase pipeline rows navigate to their related pages.
- Added hash-based page routing so browser refresh stays on the active page.
- Expanded README with user-facing HumidorHQ page functions and added README-update guidance to AGENTS.md.

## 1.6.3 - 2026-07-16

- Added one-time per-computer Codex skills, plugins, and tools check guidance to `AGENTS.md`.
- Added ignored `.codex-local/tool-check.json` marker path with a tracked placeholder.

## 1.6.2 - 2026-07-16

- Updated `AGENTS.md` so Matt/Jason overlap is prompted once per Codex session and remembered unless the situation changes.

## 1.6.1 - 2026-07-16

- Added repo-level `AGENTS.md` so Jason and Matt share HumidorHQ Codex working rules.
- Documented Matt-specific quiet mode guidance for his personal `~/.codex/AGENTS.md`.

## 1.6.0 - 2026-07-16

- Hid PO Lines, Audit, Changelog, and Todo from the left menu while keeping their pages and endpoints available.
- Added purchase status tracking for in-route, partially received, and received orders with expected date and tracking number fields.
- Added Humidor Sections for drawers, shelves, trays, and other sub-locations inside a humidor.
- Bumped JavaScript asset version so deployed browsers load the purchase and humidor workflow update.

## 1.5.7 - 2026-07-15

- Added purchased quantity totals to Purchases by summing linked PO Lines.
- Added Catalog quantity columns for purchased and on-hand counts from linked PO Lines, lots, and location balances.
- Bumped JavaScript asset version so deployed browsers load the quantity display update.

## 1.5.6 - 2026-07-15

- Removed the top-left technology label and top-right API status pill from the page header.
- Bumped the JavaScript asset version so deployed browsers load the header cleanup.
## 1.5.5 - 2026-07-15

- Removed the Dashboard Data Health widget from the screenshot-style dashboard layout.
- Bumped CSS and JavaScript asset versions so deployed browsers load the Dashboard widget removal.
## 1.5.4 - 2026-07-15

- Reworked the Dashboard into a screenshot-style operational layout with summary cards, inventory map, pipeline, quick actions, and data health panels.
- Bumped CSS and JavaScript asset versions so deployed browsers load the Dashboard visual update.
## 1.5.3 - 2026-07-15

- Restyled the flat-file app to match the warm dark brown screenshot palette and denser layout.
- Bumped the CSS asset version so deployed browsers load the visual update.
## 1.5.2 - 2026-07-15

- Added a protected Todo menu page that renders `TODO.md` through the PHP API.
- Added `/api/todo` and smoke-test coverage for the todo page content.
- Bumped the app JavaScript asset version so browsers load the Todo menu update.

## 1.5.1 - 2026-07-15

- Added `TODO.md` to track future development items.
- Added smoked-cigar rating and comments as the first backlog item for future buying assistance.

## 1.5.0 - 2026-07-15

- Added PO Lines as a connected record workflow linking purchases, catalog cigars, and humidors.
- Creating a purchase line now creates the related lot, starting lot-location balance, and purchase-receipt inventory event.
- Added validation so purchase lines cannot reference missing purchases, catalog cigars, or humidors.

## 1.4.3 - 2026-07-15

- Changed audit date-time values to display in Eastern Time as `YYYY-MM-DD HH:mm:ss ET`.
- Converted older UTC `Z` audit timestamps to Eastern Time when audit records are read without rewriting the runtime audit file.

## 1.4.2 - 2026-07-15

- Moved add/edit forms below the current records tables on Catalog, Vendors, Purchases, and Humidors pages.
- Bumped static asset query strings so deployed browsers load the reordered management screens.

## 1.4.1 - 2026-07-15

- Added version query strings to the flat CSS and JavaScript asset URLs so Hostinger and browser caches load the current deployed files.

## 1.4.0 - 2026-07-15

- Added authenticated CRUD routes for managed JSON records under `/api/records/{collection}`.
- Added purpose-built add/edit/delete screens for Catalog, Vendors, Humidors, and purchase headers.
- Added a Vendors navigation item so vendor records can be managed directly.
- Expanded the smoke test to verify CRUD API create, list, update, and delete behavior while restoring touched JSON files.
## 1.3.3 - 2026-07-15

- Fixed the sidebar project metadata so the bottom-left revision and modified timestamp refresh after /api/app-meta loads.
- Expanded the smoke test to verify the main JavaScript render path updates project metadata.

## 1.3.2 - 2026-07-15

- Added metadata headers with filename, revision, description, and modified date-time to tracked non-JSON project files.
- Excluded JSON data files from comment headers because comments would make them invalid JSON or change runtime data shape.
- Expanded the smoke test to verify metadata headers on tracked non-JSON files.
## 1.3.1 - 2026-07-15

- Added the project revision and Eastern Time modified timestamp to the bottom-left sidebar.
- Added public `/api/app-meta` metadata for the flat JavaScript app.
- Expanded the smoke test to verify app metadata revision format and ET timestamp labeling.

## 1.3.0 - 2026-07-15

- Added append-only JSONL audit logging for user activity by date-time, user, page, and action.
- Added protected `/api/audit`, `/api/audit/page`, and `/api/changelog` routes.
- Added Audit and Changelog links to the left menu.
- Added `data/audit-log.jsonl.placeholder` and ignored the live `data/audit-log.jsonl` runtime file.
- Expanded the smoke test to verify audit records and changelog access.

## 1.2.2 - 2026-07-15

- Updated `.gitignore` for the current flat PHP/JSON/static project scope.
- Removed stale Node/Vite/Prisma-specific ignore rules from the active ignore list.
- Added runtime ignores for protected auth credentials and generated JSON lock/temp files while keeping placeholders trackable.

## 1.2.1 - 2026-07-15

- Replaced queued page placeholder text with JSON-backed summary views for Catalog, Purchases, Humidors, and Reports.
- Added `data/auth-users.json.placeholder` to document the ignored runtime credential file.
- Expanded the flat-file smoke test to reject stale queued page text and verify the auth placeholder exists.
## 1.2.0 - 2026-07-15

- Added PHP session authentication with `/api/session`, `/api/login`, and `/api/logout` routes.
- Protected JSON-backed data routes from anonymous access.
- Added plain JavaScript login and logout UI.
- Added `tools/create-auth-user.php` to generate ignored hashed credentials in `data/auth-users.json`.
- Added `data/auth-users.example.json` to document the protected credential file shape.
- Expanded `tests/flat-file-smoke.ps1` to verify login, protected access, sample-data access after login, and logout.

## 1.1.0 - 2026-07-15

- Replaced the React/TypeScript/Vite browser entry with flat `index.html`, `public/assets/js/app.js`, and `public/assets/css/app.css`.
- Added `GET /api/sample-data` to summarize repo JSON data files through PHP.
- Added `tests/flat-file-smoke.ps1` to verify the no-build app shell, PHP API health, sample-data endpoint, and absence of tracked compile/runtime files.
- Removed tracked React, TypeScript, Vite, Node package, and Prisma runtime files from the deployable repo.

## 1.0.0 - 2026-07-15

- Established the flat-file HumidorHQ target: PHP, JSON, plain JavaScript, HTML, and CSS.
- Documented that TypeScript, React, Vite, Node server runtime, and Prisma runtime are being removed from the final hosted app.
- Documented that repo `data/*.json` files serve as sample/runtime data through the PHP API.
- Added README deployment guidance for GitHub-to-Hostinger hosting with no compile step.

