<!--
Filename: AGENTS.md
Revision: 1.1.2
Description: Shared Codex working instructions for the HumidorHQ repository.
Modified Date: 2026-07-16 09:11 ET
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

- Default all Codex work for Jason to the `Jason-Bug-Fixes` branch.
- Do not work directly on `main`.
- Do not automatically merge to `main`.
- Do not automatically fast-forward, merge, rebase, or push updates into `Matt-Functional-Updates`, `Matt-Design-Changes`, or any other branch.
- Only merge, fast-forward, rebase, create PRs, or update other branches when Jason explicitly asks for that specific branch operation in the current conversation.
- Ask once per Codex session whether Matt or Jason is also actively working on this repo or the same page/function, then remember and reuse that answer for the rest of the session unless the user says the situation changed.
- If both people may be editing the same area, use separate branches and merge by PR so changes are reviewed instead of overwritten.
- Before feature or bug-fix work, confirm the current branch is `Jason-Bug-Fixes` unless the user explicitly requested another branch:

```powershell
git branch --show-current
```

- Commit focused changes.
- Push only the current working branch unless explicitly asked to push another branch.
- Do not delete `php-json-migration-map` unless Jason or Matt explicitly asks.
## One-Time Local Capability Check

- Once per computer, check the local Codex skills, plugins, and tools needed for this repo before doing feature work.
- Verify the machine has the expected basics for HumidorHQ work: Git, GitHub CLI, PHP, Node for JavaScript syntax checks, and PowerShell.
- Verify Codex can see the skills/plugins/tools expected for repo work, including GitHub/PR workflow support and any local skills the user relies on.
- Save the result in `.codex-local/tool-check.json` after the check is complete.
- Do not commit `.codex-local/tool-check.json`; it is per-computer state.
- If `.codex-local/tool-check.json` already exists, reuse it and do not repeat the capability check unless the user asks, the file is deleted, or tooling errors suggest it is stale.
- Keep `.codex-local/tool-check.json.placeholder` tracked so each checkout has the expected local marker path.

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
- Update `CHANGELOG.md`, `README.md`, and project revision metadata for every project update.

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

