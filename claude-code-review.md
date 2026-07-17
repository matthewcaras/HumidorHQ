<!--
Filename: claude-code-review.md
Revision: 1.0.0
Description: Exported findings from the Claude Code high-effort workflow code review of HumidorHQ.
Modified Date: 2026-07-17 ET
-->

# Claude Code Review — HumidorHQ

- **Branch reviewed:** `critical-issue-review` (fresh from `main`, no diff — reviewed current source tree state)
- **Mode:** Workflow-backed review, high effort
- **Coverage:** 53 agents, 8 finder angles, 43 candidate findings, each independently verified
- **Result:** 32 raw findings → merged/capped to **10 confirmed**, 11 refuted on verification
- **Generated:** 2026-07-17

> This is a draft review artifact for the reviewer to validate. Findings should be confirmed by a qualified engineer before any code change.

## Confirmed findings (ranked most-severe first)

### Critical — inventory corruption / data loss

1. **Same-location move inflates inventory** — `api/index.php:603`
   `move_inventory` captures the destination balance by value before subtracting from the source. When source and destination resolve to the same row (the Move form does not exclude the current location), line 599 writes `qty - moved` and line 603 overwrites it with `qty + moved`, so the balance grows by the moved amount. Repeated same-location moves manufacture unlimited phantom cigars, corrupting inventory, cost basis, and reports.

2. **Move + purchase re-sync double-counts** — `api/index.php:446`
   `sync_purchase_inventory` matches balances only by `purchaseLineId` and resets them to the line's original location/quantity, but `move_inventory` creates a second balance carrying the same `purchaseLineId`. Receive → move A→B → edit the purchase, and Humidor A resets to full quantity while Humidor B's moved balance survives → double-counted / phantom stock and the move is effectively undone.

3. **Legacy purchase status silently wipes inventory** — `api/index.php:795`
   `normalize_purchase_status_value` accepts only `pending`/`received` and maps legacy `in-route`/`partially-received` → `pending`. Editing an older purchase coerces it to `pending`, driving the `$isReceived=false` branch that deletes every lot, balance, and receipt event for that purchase — no error surfaced.

4. **Deleting a humidor cascades away its sections** — `api/index.php:955`
   Deletion cascades all `storage-sub-locations` for the humidor when live balances are zero, orphaning historical inventory-events, lots, and journal snapshots that still reference those section IDs.
   *(Audit note: the current code also guards on `$hasLines` (purchase-lines), so this review's "guarded only by live-balance" characterization is incomplete — see the functional audit.)*

5. **Lock-free read-modify-write drops committed writes** — `api/lib/JsonStore.php:36`
   `load_collection()` reads with no lock; `save_collection()` locks only the write. Two overlapping requests each read the same array and write their full copy back; the second `rename()` wins and silently discards the first request's record. Affects every write path.

### High — wrong data / ID collisions

6. **Hardcoded `todayIsoDate()` returns `'2026-07-16'`** — `public/assets/js/app.js:335`
   Not the real date. New purchases and received-date fields pre-fill to 2026-07-16, and the Reports custom-range end defaults there, filtering out SMOKED/GIFTED events dated after that day and understating quantity/cost/savings.

7. **`next_id` defaults a missing counter to 1** — `api/lib/JsonStore.php:63`
   If `counters.json` is regenerated, restored from an older backup, or a collection is imported without a counter, IDs restart at 1 and collide with existing records; later find/update/delete act on the wrong row.

8. **`next_id` writes counters non-atomically** — `api/lib/JsonStore.php:79`
   Direct `file_put_contents` (no temp-file + rename, unlike `save_collection`). A mid-write failure leaves `counters.json` truncated → every subsequent create 500s until repaired.

### Medium — wrong display data

9. **Smoking journal always reports 'GENERAL'** — `api/lib/services/SmokingJournalService.php:126`
   Reads `$source['kind']` but sub-locations store the field as `'type'`, so the location classification is always 'GENERAL'.

10. **Journal drops humidor name for humidor-level smokes** — `api/lib/services/SmokingJournalService.php:104`
    The snapshot resolves location only via `fromStorageSubLocationId`; when null (cigar assigned at humidor level), `sourceLocation` returns null even though `fromStorageLocationId` is known.

## Refuted on verification (not reported as defects)

- `line_subtotal_cents` non-numeric `unitCost` zeroing (`api/index.php:251`)
- `move_inventory` sub-location destination-match merge (`api/index.php:588`, two variants)
- `sync_purchase_inventory` seeded-balance deletion erasing moves (`api/index.php:494`)
- Duplicated MSRP-resolution chains (`api/index.php:407`, `359`)
- Copy-pasted upsert block ×3 in `sync_purchase_inventory` (`api/index.php:424`)
- `app_meta_payload`/`changelog_payload` both read CHANGELOG.md (`api/index.php:46`)
- Repeated `find_by_id` linear scans in journal build (`SmokingJournalService.php:147`)
- `X-HTTP-Method-Override` honored but unused (`api/bootstrap.php:26`)
- Field-cleaning helpers living in the router vs Validation lib (`api/index.php:203`)

*(Refuted items are lower-severity cleanups or false positives the verification pass rejected; several overlap with the more nuanced findings in the functional stabilization audit.)*
