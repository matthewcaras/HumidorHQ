# Changelog

All meaningful project changes should be recorded here before deployment.

Revision format: `major.minor.feature`

- `major` - breaking architecture or data changes
- `minor` - new workflow, page, API, or significant enhancement
- `feature` - focused feature work, fixes, documentation updates, or small compatibility updates

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


