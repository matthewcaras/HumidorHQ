<!--
Filename: AGENTS.md
Revision: 1.0.1
Description: Shared Codex working instructions for the HumidorHQ repository.
Modified Date: 2026-07-16 08:22 ET
-->

# HumidorHQ Codex Instructions

These instructions apply to Codex sessions working in this repository. They are intended to keep Jason and Matt using the same project rules without copying private machine-specific Codex settings.

## Project Scope

- HumidorHQ is a flat-file PHP/JSON/JavaScript/HTML/CSS app.
- Do not add React, TypeScript, Vite, Prisma, a Node server runtime, or any compile/build requirement.
- The app is intended for GitHub deployment to Hostinger.
- Treat Hostinger/runtime data as live data. Do not overwrite deployed or local runtime records unless explicitly asked.
- Do not commit real runtime secrets or live credentials.
- Do not commit `data/auth-users.json` or `data/audit-log.jsonl`.
- Be careful with `data/*.json`. Only commit sample or structural JSON changes when explicitly requested.

## Git Workflow

- Do not work directly on `main`.
- Ask once per Codex session whether Matt or Jason is also actively working on this repo or the same page/function, then remember and reuse that answer for the rest of the session unless the user says the situation changed.
- If both people may be editing the same area, use separate branches and merge by PR so changes are reviewed instead of overwritten.
- Start feature work from the latest `main`:

```powershell
git checkout main
git pull origin main
git checkout -b <short-feature-branch>
```

- Commit focused changes.
- Push the branch.
- Open a PR into `main`.
- Merge only after verification passes.
- Do not delete `php-json-migration-map` unless Jason or Matt explicitly asks.

## Verification

- For JavaScript changes, run:

```powershell
node --check .\public\assets\js\app.js
```

- For PHP changes, run:

```powershell
php -l .\api\index.php
```

- Run the repo smoke test before saying work is complete:

```powershell
.\tests\flat-file-smoke.ps1
```

- The smoke test creates temporary runtime records and should restore them. Confirm `git status --short` does not show unintended `data/*.json` changes afterward.

## Revision Policy

- `CHANGELOG.md` holds the project revision.
- Footer/project rev should match `CHANGELOG.md`.
- Individual file revisions are independent.
- Use `major.minor.feature` for project rev:
  - `major` means breaking architecture or data changes.
  - `minor` means new workflow, page, API, or significant enhancement.
  - `feature` means focused feature work, fixes, docs, or cache updates.
- Update `CHANGELOG.md` for meaningful changes.
- Update `README.md` when behavior or workflow changes.

## File Metadata

- Tracked non-JSON files should have a header with:
  - Filename
  - Revision
  - Description
  - Modified Date
- Ignore author for HumidorHQ because Matt and Jason both work on it.

## PowerShell Scripts

Use this header for new PowerShell scripts:

```powershell
# Filename: ScriptName.ps1
# Revision : 1.0.0
# Description : Brief description
# Author : Jason Lamb (with help from Codex CLI)
# Created Date : YYYY-MM-DD
# Modified Date : YYYY-MM-DD
# Changelog :
# 1.0.0 initial release
```

Add example usage at the bottom:

```powershell
# Example Usage:
#   .\ScriptName.ps1
```

## UI And Workflow Preferences

- Keep the app usable as the first screen, not a marketing page.
- Keep forms and tables purpose-built for cigar catalog, vendors, purchases, humidors, and inventory.
- Hide unfinished or utility pages from the menu rather than deleting them unless explicitly told to delete.
- Preserve existing design language unless asked to redesign.

## Current App Behavior

- Purchases track status: In Route, Partially Received, Received.
- PO Lines hold purchased cigar quantities and create lots, balances, and inventory events.
- Catalog shows purchased and on-hand quantities from linked records.
- Humidors can have sections such as drawers, shelves, trays, or zones.
- Audit, Changelog, Todo, and PO Lines may exist but can be hidden from the menu.

## Editing Rules

- Inspect existing code before changing it.
- Keep changes scoped.
- Do not refactor unrelated files.
- Do not revert user changes unless explicitly asked.
- If `git status --short` shows unrelated changes, leave them alone.
- Before final response, report what changed, tests run, branch/PR status, and whether the working tree is clean.

## Matt Quiet Mode

If Matt is working with Codex and does not want verbose progress messages, he should add this to his personal `~/.codex/AGENTS.md`, not this shared file:

```text
Quiet mode:
- Do not send progress updates while working.
- Do not narrate each file read, command, or edit.
- Only message me if you are blocked, need approval, or need a decision.
- When done, give a short final summary with files changed, tests run, branch/PR status, and anything not completed.
```

