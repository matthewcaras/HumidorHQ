<!--
Filename: CHANGELOG.md
Revision: 1.0.1
Description: Project documentation and implementation notes.
Modified Date: 2026-07-15 00:36 ET
-->

# Changelog

All meaningful project changes should be recorded here before deployment.

Revision format: `major.minor.feature`

- `major` - breaking architecture or data changes
- `minor` - new workflow, page, API, or significant enhancement
- `feature` - focused feature work, fixes, documentation updates, or small compatibility updates

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
- Added `data/audit-log.placeholder` and ignored the live `data/audit-log.jsonl` runtime file.
- Expanded the smoke test to verify audit records and changelog access.

## 1.2.2 - 2026-07-15

- Updated `.gitignore` for the current flat PHP/JSON/static project scope.
- Removed stale Node/Vite/Prisma-specific ignore rules from the active ignore list.
- Added runtime ignores for protected auth credentials and generated JSON lock/temp files while keeping placeholders trackable.

## 1.2.1 - 2026-07-15

- Replaced queued page placeholder text with JSON-backed summary views for Catalog, Purchases, Humidors, and Reports.
- Added `data/auth-users.placeholder` to document the ignored runtime credential file.
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












