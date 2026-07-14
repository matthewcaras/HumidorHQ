# Upstream Sync Checklist

Use this checklist every time the original author updates `upstream/main` and the PHP/JSON conversion branch needs to catch up.

## Commands

1. Fetch latest upstream refs without merging:

```powershell
git fetch upstream
```

2. Compare the last reviewed upstream commit to current upstream main:

```powershell
git diff --name-status <last-reviewed-upstream-ref> upstream/main
git diff --stat <last-reviewed-upstream-ref> upstream/main
```

3. List new upstream commits:

```powershell
git log --oneline <last-reviewed-upstream-ref>..upstream/main
```

4. For each changed upstream file, find the PHP/JSON target in `docs/php-json-conversion/file-map.md`.

5. Review and update the affected PHP, JSON, migration, and frontend compatibility files.

6. Append a dated entry to `docs/php-json-conversion/change-log.md` naming:

- upstream ref reviewed
- changed upstream files
- PHP/JSON files reviewed or changed
- remaining parity gaps

7. Run targeted parity checks for the workflows touched by the upstream changes.

8. Run broader regression checks before deploy.

9. Update the file map when a new upstream source file appears or when a target split changes.

## Current Baseline

- Last reviewed upstream ref: `upstream/main@37df9a0`
- Newest upstream feature included in tracking: Smoking Journal
- Next conversion targets from this baseline: `SmokingJournalService.php`, `data/smoking-journal-entries.json`, `GET|PUT|DELETE /api/inventory-events/:inventoryEventId/smoking-journal`, and SQLite-to-JSON export support for `SmokingJournalEntry`
