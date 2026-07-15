# HumidorHQ

HumidorHQ is a cigar collection and humidor management app being converted to a flat-file hosting model for GitHub-driven deployment to Hostinger.

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

Legacy TypeScript, React, Vite, Node, and Prisma files may remain during migration only as reference material. They are not part of the final hosting target.

## Data Model

Runtime data is stored in JSON files under `data/`. These files also serve as sample data for local and deployed testing.

The browser app should not fetch raw JSON files directly. It should call PHP endpoints under `api/`, and the PHP layer should read and write the JSON files. This keeps the frontend contract stable and allows `data/.htaccess` to block direct web access to the backing files on Hostinger.

## Local Development

For the final flat-file version, no package install or build command should be required. Serve the project with PHP so API routes are available.

Example:

```powershell
php -S localhost:8000
```

Then open:

```text
http://localhost:8000/
```

## Deployment

The intended deployment flow is:

1. Push changes to GitHub.
2. GitHub webhook or deployment automation sends the flat files to Hostinger.
3. Hostinger serves `index.html`, static assets, PHP API files, and protected JSON data files.
4. The frontend calls relative PHP API paths.

No build artifact should be required for deployment once the conversion is complete.

## Revision Policy

Project revisions start at `1.0.0`.

Use `major.minor.feature` numbering:

- `major` - breaking architecture or data changes
- `minor` - new workflow, page, API, or significant enhancement
- `feature` - focused feature work, fixes, documentation updates, or small compatibility updates

Every meaningful change should be recorded in `CHANGELOG.md` before deployment.
