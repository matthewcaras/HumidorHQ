<!--
Filename: humidorhq-review-and-remediation.md
Revision: 1.0.0
Description: Consolidated HumidorHQ code review (Claude Code review + functional stabilization audit) with a remediation task list and approval/breakage callouts.
Modified Date: 2026-07-17 ET
-->

# HumidorHQ — Consolidated Review & Remediation Plan

**Sources merged:** the Claude Code high-effort workflow review (10 confirmed findings) and the functional stabilization audit (22 findings). Overlapping items are reconciled under a single ID scheme below; where the two disagreed, the more accurate reading is noted.

**Branch:** `critical-issue-review` · **Verified with:** PHP 8.4.21, Node v24.14.0, PowerShell 7.6.3 · **Date:** 2026-07-17

> Every item is a draft for a qualified engineer to verify. Inventory and accounting logic especially must be validated by an engineer of record before any change ships. Nothing here has been changed in the code.

**Legend:** 🔴 Critical · 🟠 High · 🟡 Medium · ⚪ Low · **[APPROVAL]** needs a product/owner/ops decision before fixing · **[BREAKS]** likely to break other code/tests/data unless changed together · **[MIGRATION]** existing data must be corrected.

---

## 1. Findings (merged)

| ID | Sev | Finding | Also found by Claude review |
|----|-----|---------|------|
| C-1 | 🔴 | Same-location move inflates inventory (phantom stock) | Yes (#1) |
| C-2 | 🔴 | Purchase re-sync after a move double-counts inventory | Yes (#2) |
| C-3 | 🔴 | Legacy/partial purchase status silently deletes received inventory | Yes (#3) |
| C-4 | 🔴 | `DISCARDED` removals vanish from every report and total | Audit only |
| C-5 | 🔴 | Live runtime data is committed inside the Git deploy tree | Audit only |
| H-1 | 🟠 | `todayIsoDate()` hardcoded to `'2026-07-16'` | Yes (#6) |
| H-2 | 🟠 | Lock-free read-modify-write loses concurrent writes | Yes (#5) |
| H-3 | 🟠 | No backup or restore mechanism | Audit only |
| H-4 | 🟠 | `next_id` defaults to 1 and writes counters non-atomically | Yes (#7, #8) |
| H-5 | 🟠 | No login throttling; failed logins never audited | Audit only |
| H-6 | 🟠 | Event dates derived from UTC → timezone rollover | Audit only |
| H-7 | 🟠 | No CSRF token (mitigated only by SameSite=Strict) | Audit only |
| M-1 | 🟡 | `data/smoking-journal-entries.json` is malformed (empty) | Audit only |
| M-2 | 🟡 | Smoking-journal reads `kind`, records store `type` → always 'GENERAL' | Yes (#9) |
| M-3 | 🟡 | Journal drops humidor name for humidor-level smokes | Yes (#10) |
| M-4 | 🟡 | Location snapshots resolved live, not captured at event time | Audit only |
| M-5 | 🟡 | Unknown money silently treated as zero | Audit only |
| M-6 | 🟡 | Floating-point money in all frontend calculations | Audit only |
| M-7 | 🟡 | Humidor deletion cascades sections, orphaning historical references | Yes (#4, corrected) |
| L-1 | ⚪ | No security headers beyond `X-Content-Type-Options` | Audit only |
| L-2 | ⚪ | No idle/absolute session timeout | Audit only |
| L-3 | ⚪ | Username enumeration via login timing | Audit only |
| L-4 | ⚪ | Validation/cleaning helpers live in the router, not `Validation.php` | Audit only |

**Reconciliation note (M-7):** the Claude review said humidor deletion was "guarded only by a live-balance check." The current code (`api/index.php:955–987`) **also** guards on `$hasLines` (purchase-lines referencing the humidor or its sections), so a humidor with assigned cigars *cannot* be deleted. The residual risk is narrower: once all lines are gone, deleting the humidor cascades its sections, and past `inventory-events` / smoking-journal snapshots still referencing those section IDs resolve to blank locations. Downgraded to Medium accordingly.

**Claude-review items considered and NOT actioned** (verification rejected them or they are style-only): non-numeric `unitCost` zeroing (`index.php:251`), sub-location destination-match merge (`index.php:588`), seeded-balance deletion (`index.php:494`), duplicated MSRP-resolution chains, copy-pasted upsert block, `app_meta`/`changelog` both reading CHANGELOG.md, repeated `find_by_id` scans, and the unused `X-HTTP-Method-Override` (folded into H-7). Several duplications are real cleanups but not defects; leave for a later refactor pass.

---

## 2. Finding detail (evidence + fix intent)

**C-1 — Same-location move inflates inventory.** `move_inventory()` (`api/index.php:578–604`). Destination balance captured by value before the source subtraction; when source==destination, line 603 overwrites line 599 using the pre-subtraction snapshot → quantity grows by the moved amount. Fix: no-op/reject same-row moves; compute the destination increment from the freshly written value; exclude the current location in the Move form. **[MIGRATION]** audit balances exceeding lot `initialQuantity`.

**C-2 — Re-sync double-counts after a move.** `sync_purchase_inventory()` (`api/index.php:387–500`) indexes balances by `purchaseLineId` only and resets the matched one to the line's original location/quantity, while `move_inventory` created a second balance with the same `purchaseLineId` (`:608`). Editing the purchase after a move restores the origin to full quantity and keeps the moved balance. Fix: reconcile total quantity per line across all balances, or key balances by `(purchaseLineId, location, subLocation)` and treat post-receipt moves as immutable to re-sync. **[BREAKS]** core sync runs on every purchase/line create/update/delete.

**C-3 — Status coercion deletes inventory.** `normalize_purchase_status_value()` (`:795–802`) maps `in-route`/`partially-received` → `pending`; `$isReceived=false` then triggers the retention filters (`:488–508`) that delete lots/balances/receipt events. Editing an unrelated field on a legacy purchase wipes its received inventory. Fix: preserve/upgrade legacy statuses; never treat an unknown status as a delete signal; guard against destructive status *downgrades*. **[APPROVAL]** confirm intended "un-receive" semantics. **[MIGRATION]** reclassify existing purchases first.

**C-4 — Discarded removals vanish.** `remove_inventory` records `DISCARDED` (`:672–675`), but `filteredRemovalEvents()` (`app.js:2763`) and `removalMetrics`/dashboard (`app.js:594–607, 907–911`) include only `SMOKED`/`GIFTED`. Discarded cost basis leaves inventory and appears in no total. Contradicts DESIGN_PRINCIPLES ("preserve … damage"). Fix: include discarded in reports and lifetime accounting. **[APPROVAL]** this changes displayed savings/cost numbers — product decision on whether discarded counts as "consumption."

**C-5 — Live data in the Git deploy tree.** Only `auth-users.json` and `audit-log.jsonl` are gitignored; all other `data/*.json` are tracked. A pull/redeploy can overwrite production inventory. Fix: move live data outside the deploy root, commit only `*.example.json` seeds, gitignore runtime collections, add first-run seeding. **[APPROVAL/BREAKS]** changes `DATA_ROOT` and touches `bootstrap.php`, `.htaccess`, the test harness, and deploy scripts — coordinate with the repo owner and whoever deploys. **[MIGRATION]** relocate existing data.

**H-1 — Hardcoded date.** `todayIsoDate()` returns `'2026-07-16'` (`app.js:334–336`); used for purchase-date (356), received-date (1920), report end default (2821). Fix with H-6 for timezone consistency. Bump the `?v=` asset version (the smoke test asserts it).

**H-2 — Lock-free RMW.** `load_collection` takes no lock; `save_collection` locks only the write (`JsonStore.php:19–61`). Concurrent writers lose rows. Fix: hold an exclusive per-collection lock spanning read→write in mutating paths. **[BREAKS]** touches every write path; verify no deadlock and Windows `flock` behavior.

**H-3 — No backups.** No retained prior copy or restore path. Fix: timestamped backups outside the deploy path before destructive syncs. Ties to C-5 (location).

**H-4 — `next_id`.** Defaults a missing counter to 1 (`JsonStore.php:76`) → ID collisions; writes counters with plain `file_put_contents` (`:79`) → truncation bricks all creates. Fix: derive from `max(existing id)+1` when absent; write atomically (temp+rename). **[MIGRATION]** verify counters exceed all existing IDs.

**H-5 — No throttling / unlogged failures.** `login_with_credentials` (`Auth.php:71–90`) has no rate limit; the audit call runs only on success (`index.php:1032`). Fix: per-username/IP throttle + lockout; log failed attempts (no password). **[APPROVAL]** lockout policy (risk of locking out legitimate users).

**H-6 — UTC rollover.** `now_iso` uses `gmdate` (`bootstrap.php:62`); move/remove `eventDate = substr($now,0,10)` (`index.php:638,726`) is the UTC date; `app.js:1584` uses UTC `toISOString()` while H-1 is hardcoded — inconsistent. Fix: one authoritative timezone (ET already used for audit); derive event dates in it server-side; align the frontend. **[APPROVAL]** confirm canonical timezone. **[MIGRATION]** optional; past evening events may be off by a day.

**H-7 — No CSRF.** No token issued/checked; only SameSite=Strict defends (`Auth.php:25`); `X-HTTP-Method-Override` honored (`bootstrap.php:26`). Fix: per-session CSRF token required on mutations; drop/restrict the override. **[BREAKS]** requires matching changes in `app.js` fetch calls and `flat-file-smoke.ps1`.

**M-1 — Malformed empty JSON.** `data/smoking-journal-entries.json` is 2 bytes and fails `JSON.parse` (the app tolerates it via `load_collection`). Fix: write `[]`. Safe, do first.

**M-2 — `kind` vs `type`.** `SmokingJournalService.php:126` reads `$source['kind']`; records store `type`. Always 'GENERAL'. Fix: read `type`.

**M-3 — Journal null humidor.** `SmokingJournalService.php:104–130,152–154` resolves location only via `fromStorageSubLocationId`; null for humidor-level smokes → blank source. Fix: resolve humidor from `fromStorageLocationId`.

**M-4 — Live location snapshots.** Location name/kind/active looked up live at read time; renames/archives rewrite history. Fix: snapshot location labels onto removal events. **[MIGRATION]** optional backfill; adds event fields.

**M-5 — Unknown money = zero.** `money_to_cents(null)=0` (`index.php:232–239`); `numericValue(null)→0` across JS metrics. Missing cost basis reads as $0; averages understated, savings overstated. Fix: distinguish null vs 0; exclude unknown-cost quantities from average denominators; flag incomplete data. **[APPROVAL/BREAKS]** `money_to_cents(null)=0` is also used in allocation where 0 is correct — scope carefully; over-fixing breaks allocation. Changes displayed numbers.

**M-6 — Float money in JS.** All dashboard/report totals are floating-point (`app.js:527–607, 2795–2808`). Fix: integer cents (or consistent rounding points); reconcile against server basis. **[BREAKS]** touches all report math; expect small display diffs.

**M-7 — Humidor deletion history integrity.** `delete_managed_record` for `storage-locations` (`index.php:955–987`) cascades section deletion (after inventory/line guards), orphaning historical event/journal references to those section IDs. Fix: block deletion when historical events reference the humidor/sections, or snapshot location labels (see M-4) so history survives.

**L-1 — Security headers.** `Response.php` sets only `nosniff`. Add CSP/frame-ancestors/Referrer-Policy (test CSP against the SPA's inline scripts/styles). **L-2 — Session timeout.** Add idle + absolute expiry in `require_auth` (`Auth.php`). **[APPROVAL]** timeout durations. **L-3 — Timing enumeration.** `Auth.php:82` short-circuits before `password_verify`; call it against a dummy hash on the miss path. **L-4 — Helper placement.** Move `clean_*`/`money_to_cents` from the router into `Validation.php`; behavior-preserving.

---

## 3. Remediation task list

Work top-to-bottom; stages are ordered by risk-reduction. Check items as completed. **Do the [APPROVAL] items' sign-off before writing code for them.**

### Stage 0 — Stop data loss (do before any real data is trusted)
- [ ] **C-5** Move live data out of the Git/deploy tree; commit only `*.example.json` seeds; gitignore all runtime collections; add first-run seeding. **[APPROVAL: repo owner + deploy owner] [BREAKS: bootstrap.php, .htaccess, test harness, deploy scripts] [MIGRATION]**
- [ ] **H-3** Add timestamped backups outside the deploy path before destructive syncs, plus a restore path. *(depends on C-5's data location)*
- [x] **M-1** ✅ **DONE (CHANGELOG 1.10.2)** — Replaced the empty `data/smoking-journal-entries.json` with `[]`. *(safe, trivial)*
- [ ] Add a CI check that `JSON.parse`-validates every `data/*.json` (would have caught M-1).

### Stage 1 — Inventory correctness (highest-value bugs)
- [ ] **C-1** Guard same-row moves; compute destination increment from the written value; exclude current location in the Move form. **[MIGRATION: reconcile inflated balances]**
- [ ] **C-2** Fix `sync_purchase_inventory` to reconcile total per-line quantity across balances / preserve post-receipt moves. **[BREAKS: core sync path — needs regression tests before merge]**
- [ ] **C-3** Stop coercing legacy statuses to `pending`; never delete received inventory on an unknown/downgraded status. **[APPROVAL: un-receive semantics] [MIGRATION: reclassify purchases]**
- [ ] Add regression tests: same-location move; move→edit-purchase; legacy-status edit preserves inventory.

### Stage 2 — Accounting truth
- [ ] **C-4** Include `DISCARDED` in removal history and lifetime totals. **[APPROVAL: is discarded "consumption"? affects savings math]**
- [ ] **M-5** Distinguish unknown (null) from known-zero money; keep unknown out of average denominators; surface "incomplete cost data." **[APPROVAL + BREAKS: don't change `money_to_cents(null)=0` where allocation relies on it]**
- [ ] **M-6** Move frontend money math to integer cents; reconcile against server-allocated basis. **[BREAKS: all report/dashboard totals — expect minor display diffs]**

### Stage 3 — Durability & dates
- [ ] **H-2** Hold an exclusive per-collection lock spanning read→write in all mutating handlers. **[BREAKS: every write path — test for deadlocks / Windows flock]**
- [ ] **H-4** Derive `next_id` from existing rows when the counter is absent; write counters atomically. **[MIGRATION: verify counters > max id]**
- [ ] **H-1 + H-6** Replace the hardcoded date with the real date in one authoritative timezone; make server event dates and the frontend default consistent. **[APPROVAL: canonical timezone]** Bump the `app.js`/`app.css` `?v=` versions (smoke test asserts them).

### Stage 4 — Security hardening
- [ ] **H-5** Add login throttling + lockout; log failed attempts (no password). **[APPROVAL: lockout policy]**
- [ ] **H-7** Issue and require a per-session CSRF token on mutations; drop/restrict `X-HTTP-Method-Override`. **[BREAKS: app.js fetch calls + flat-file-smoke.ps1 must send the token]**
- [ ] **L-1** Add security headers (CSP tuned to the SPA, frame-ancestors, Referrer-Policy).
- [ ] **L-2** Add idle + absolute session timeout. **[APPROVAL: durations]**
- [x] **L-3** ✅ **DONE (CHANGELOG 1.10.2)** — Login now always runs `password_verify` (against `AUTH_TIMING_DUMMY_HASH` on the miss path). *(Does not replace H-5 throttling.)*

### Stage 5 — History fidelity, cleanup & tests
- [x] **M-2** ✅ **DONE (CHANGELOG 1.10.2)** — Journal snapshot now reads `type` (not `kind`).
- [x] **M-3** ✅ **DONE (CHANGELOG 1.10.2)** — Humidor resolved from `fromStorageLocationId` for humidor-level smokes; `smoking_journal_location_snapshot()` signature changed to `($storageLocation, $subLocation)` (only caller updated — see changelog note).
- [ ] **M-4 + M-7** Snapshot location labels onto removal events; block or preserve history on humidor/section deletion. **[MIGRATION: optional backfill of existing events]** *(supersedes the M-3 stopgap above with the complete fix)*
- [x] **L-4** ✅ **DONE (CHANGELOG 1.10.2)** — Moved `clean_text_field`/`clean_optional_int`/`clean_optional_money`/`money_to_cents`/`cents_to_money` into `Validation.php` (behavior-preserving).
- [ ] Build out the test suite: remove smoke/gift/discard, partial receiving, JSON locking/concurrency, money allocation + missing-money, backup/restore, deployment-preserves-data, auth throttling/permissions. Make the smoke test PowerShell-5.1-compatible or document the `pwsh` requirement.

---

## 4. Must be reviewed or approved BEFORE fixing

| Item | Why sign-off is needed | Who |
|------|------------------------|-----|
| **C-5** | Relocating data + changing `DATA_ROOT` affects deployment, `.htaccess`, tests, and could disrupt however production currently gets data. | Repo owner (matthewcaras) + whoever deploys |
| **C-3** | The current "un-receive deletes inventory" behavior may be intentional; the fix changes destructive semantics and needs a data reclassification first. | Product owner |
| **C-4** | Adding discarded to totals **changes the savings/cost numbers users see**; whether discarded is "consumption" is a product call. | Product owner |
| **M-5** | Changes reported averages/savings and risks breaking deterministic server allocation if `money_to_cents(null)=0` is altered too broadly. | Engineer of record (accounting) |
| **H-6 / H-1** | Choosing the canonical timezone changes stored/displayed dates going forward. | Product owner |
| **H-5 / L-2** | Lockout and timeout durations are policy decisions that can lock out legitimate users. | Owner/ops |

## 5. Cross-issue breakage risks (fix these together, or in this order)

- **Inventory cluster (C-1, C-2, C-3):** all live in `move_inventory` / `sync_purchase_inventory` / the balance model. Fixing one without the others can mask or shift the corruption. Land them as one reviewed change set with the Stage 1 regression tests, not piecemeal.
- **Locking cluster (H-2, H-4):** both change JsonStore's concurrency model; design the lock strategy once and apply to records *and* counters together.
- **Date cluster (H-1, H-6):** fixing the hardcoded date without the UTC fix just swaps one wrong date for another (off-by-a-day). Do both, and bump the cache-busting asset version the smoke test checks.
- **Money cluster (C-4, M-5, M-6):** all change the numbers on the dashboard/reports; validate them against a single reconciled fixture so the displayed totals stay internally consistent.
- **CSRF (H-7):** a backend-only change here **will break the frontend and the smoke test** — the token must be added to `app.js` requests and the PowerShell test in the same change.
- **Data relocation (C-5):** the test harness reads `data/*.json` by absolute path; moving `DATA_ROOT` requires updating the harness and deploy scripts or the smoke test will fail.
- **History cluster (M-3, M-4, M-7):** all touch how past location context is resolved/stored; a location-snapshot approach (M-4) largely resolves M-3 and M-7 too.

## 6. Quick wins (low risk, no approval needed — safe to land first)
✅ **Landed in CHANGELOG 1.10.2** (verified: `php -l`, `JSON.parse` all data files, full smoke test): M-1 (empty JSON → `[]`), M-2 (`kind`→`type`), M-3 (humidor fallback), L-3 (timing), L-4 (helper move), **and the JSON-parse guard** (added to `flat-file-smoke.ps1` 1.10.10 — every committed `data/*.json` must be valid JSON).

---

*Consolidated from `functional-stabilization-audit.md` and `claude-code-review.md`, which are retained until Jason or Matt removes them.*
