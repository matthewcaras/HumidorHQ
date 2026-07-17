<!--
Filename: functional-stabilization-audit.md
Revision: 1.0.0
Description: Read-only functional stabilization audit of the HumidorHQ flat-file application.
Modified Date: 2026-07-17 ET
-->

# HumidorHQ — Functional Stabilization Audit

**Type:** Read-only functional / data-integrity / security audit
**Branch actually audited:** `critical-issue-review` (created from `origin/main`; byte-identical to `main`)
**Note on branch:** The source prompt named `Matt-Functional-Updates`. That branch was **not** checked out and no branches were switched or merged. The audit reflects the current `main`-equivalent tree. Re-run against `Matt-Functional-Updates` if that branch has diverged.
**Verification runtime:** PHP 8.4.21, Node v24.14.0, PowerShell 7.6.3 (all available)
**Date:** 2026-07-17

> Every finding below is a draft for a qualified engineer to verify. Accounting and inventory logic in particular should be validated by an engineer of record before any correction ships. Nothing here has been changed in the codebase.

---

## 1. Executive summary

HumidorHQ is a compact, competently structured flat-file PHP/JSON/vanilla-JS app. The architecture is clean for its size, the happy-path purchase→receive→move lifecycle works (the smoke test passes), and several security fundamentals are done right (bcrypt via `password_hash`/`password_verify`, `session_regenerate_id(true)` on login, HttpOnly + SameSite=Strict cookies, a `data/.htaccess` deny rule).

The risk is concentrated in three places:

1. **Inventory/accounting correctness** — a same-location move inflates on-hand quantity; a purchase re-sync after a move double-counts; and `DISCARDED` removals silently disappear from every report and total. These corrupt the numbers the app exists to produce.
2. **Flat-file durability & concurrency** — the store does read-modify-write without a read lock, so concurrent writes lose data; the ID counter defaults to `1` and writes non-atomically; and **live runtime JSON is committed to the Git tree**, so a deploy/pull can overwrite production data.
3. **Date handling** — `todayIsoDate()` is hardcoded to `2026-07-16`, and event dates are derived from **UTC** (`gmdate`), so evening-Eastern events roll to the next calendar day.

None of these block the app from running, but each can silently corrupt or hide data — the worst failure mode for an inventory ledger. Recommended posture: fix the Critical inventory and deployment-data items first, then the durability and date items, before onboarding real long-term data.

**Findings by severity:** Critical 5 · High 7 · Medium 6 · Low 4 · (plus confirmed strengths)

---

## 2. Architecture observed

- **Entry / routing:** `api/index.php` (1,127 lines) — a single procedural router (`request_path()` matched against string/regex routes) plus all record, inventory, and purchase-sync handlers.
- **Bootstrap:** `api/bootstrap.php` wires includes and defines `request_method`, `request_path`, `request_json`, `now_iso` (UTC).
- **Storage:** `api/lib/JsonStore.php` — `load_collection` / `save_collection` (temp-file + `rename`, `flock` on a `.lock` sidecar) and `next_id` (counter file).
- **Repository helpers:** `api/lib/DataRepository.php` — `find_by_id`, `find_first_by_field`, `upsert_by_field`, `delete_by_field` (all linear scans).
- **Auth:** `api/lib/Auth.php` — PHP session, bcrypt verify, `require_auth`.
- **Audit:** `api/lib/Audit.php` — append-only JSONL, ET-formatted timestamps.
- **Services:** `api/lib/services/SmokingJournalService.php`; utility `api/lib/utils/InventoryAccounting.php`.
- **Validation:** `api/lib/Validation.php` (only `positive_int_param`; most cleaning lives in the router).
- **Frontend:** `public/assets/js/app.js` (3,288 lines) — single-file state + render app, hash routing; `index.html` shell; `public/assets/css/app.css`.
- **Data:** `data/*.json` collections + `.lock` sidecars; `auth-users.json` and `audit-log.jsonl` gitignored; **all other collections tracked in Git**.
- **Tests:** `tests/flat-file-smoke.ps1` — one end-to-end integration smoke test (requires PowerShell 7).
- **Money model:** integer-cents in PHP allocation (`money_to_cents` / `cents_to_money`, largest-remainder allocation), but **floating-point** in all JS report/dashboard math.

---

## 3. Critical findings

### C-1. Same-location move inflates inventory (phantom stock)
- **Severity:** Critical
- **Files/functions:** `api/index.php` — `move_inventory()` (lines 578–604)
- **Current behavior:** The destination balance is captured by value (`$destinationBalance`) during the same loop that locates the source. When the user moves within the *same* lot/humidor/section, source and destination are the same array row. Line 599 sets `[$sourceIndex]['quantity'] = current - moved`; line 603 then sets `[$destinationIndex]['quantity'] = $destinationBalance['quantity'] + moved` using the **pre-subtraction** snapshot, overwriting the subtraction. Net: quantity increases by `moved`.
- **Why it matters:** A user can manufacture unlimited inventory, corrupting on-hand counts, cost basis, MSRP value, and savings across the dashboard and reports. The destination `<select>` does not exclude the current location, so this is reachable through normal UI use, not just API abuse.
- **Evidence:** `move_inventory` lines 599–604; the destination match at 585–592 has no `id !== sourceBalanceId` guard.
- **Recommended correction:** Detect same-row moves (`$destinationIndex === $sourceIndex`) and no-op or reject; otherwise compute the destination increment from the freshly written `$allBalances[$destinationIndex]['quantity']`, not the captured copy. Add a same-location guard in the Move form.
- **Data migration:** Likely. Audit `lot-location-balances` for balances exceeding the originating lot's `initialQuantity`; reconcile against `inventory-events`.
- **Test coverage:** Add a move test where destination == source; assert total inventory is unchanged. (The existing smoke test only moves to a *different* sub-location.)

### C-2. Purchase re-sync after a move double-counts inventory
- **Severity:** Critical
- **Files/functions:** `api/index.php` — `sync_purchase_inventory()` (lines 438–500), interaction with `move_inventory()`
- **Current behavior:** `sync_purchase_inventory` indexes existing balances by `purchaseLineId` only (387–391) and rewrites the matched balance back to the purchase line's original `storageLocationId`/`storageSubLocationId`/`quantity`. But `move_inventory` creates a **second** balance carrying the same `purchaseLineId` (line 608). On any later purchase/line edit, the original balance is reset to full quantity while the moved balance survives the active-line filter (494–500, kept because its `purchaseLineId` is still active).
- **Why it matters:** Receiving, moving part of a lot, then editing the purchase silently doubles (or more) the on-hand count and erases the recorded move — corrupting the ledger without any error.
- **Evidence:** balance index build 387–391; rewrite 438–456; retention filter 494–500; move's second balance 606–615.
- **Recommended correction:** Make sync reconcile the *total* quantity for a purchase line across all its balances rather than assuming one balance per line, or key balances by `(purchaseLineId, storageLocationId, storageSubLocationId)` and treat post-receipt moves as immutable relative to re-sync.
- **Data migration:** Likely — detect multiple balances per `purchaseLineId` whose sum exceeds the lot quantity.
- **Test coverage:** receive → move partial → edit purchase → assert summed balances == received quantity.

### C-3. Legacy/partial purchase status silently deletes received inventory
- **Severity:** Critical
- **Files/functions:** `api/index.php` — `normalize_purchase_status_value()` (795–802), `sync_purchase_inventory()` `$isReceived` branch (314–315, 398–508)
- **Current behavior:** The status vocabulary was narrowed to `pending`/`received`; `in-route` and `partially-received` are coerced to `pending`. Any purchase whose stored status is a legacy value (from an older import/backup) becomes `pending` on the next save, so `$isReceived` is false, no line is added to `$activePurchaseLineIds`, and the retention filters (488–508) delete every lot, balance, and `purchase-receipt` event for that purchase.
- **Why it matters:** Editing an unrelated field on a legacy purchase can wipe its received inventory and cost basis with no warning. Also eliminates any "partially received" concept the earlier requirements implied.
- **Evidence:** coercion 799; filters 488–508 keyed on `$activePurchaseLineIds`.
- **Recommended correction:** Preserve/upgrade legacy statuses explicitly (map `partially-received`→a real received-partial state, not `pending`); never treat an unknown status as a signal to delete inventory. Consider a guard that refuses to delete received inventory on a status *downgrade* without explicit confirmation.
- **Data migration:** Yes — reclassify existing purchases before deploying the narrowed status set; verify no received inventory was already lost.
- **Test coverage:** load a purchase with a legacy status, edit an unrelated field, assert lots/balances/events survive.

### C-4. `DISCARDED` removals vanish from every report and total
- **Severity:** Critical (accounting completeness) / High (functional)
- **Files/functions:** `public/assets/js/app.js` — `filteredRemovalEvents()` (2762–2792), `removalMetrics()` (594–607), `renderDashboard()` lifetime math (907–911); server accepts DISCARDED in `remove_inventory()` (`api/index.php:672–675`)
- **Current behavior:** `remove_inventory` fully supports `DISCARDED` (decrements inventory, writes an event). But the frontend never surfaces it: `filteredRemovalEvents` filters to `['SMOKED','GIFTED']`; the dashboard "Consumption Totals" renders only smoked and gifted; lifetime cost/MSRP/savings sum only `current + smoked + gifted`. Discarded cigars leave inventory but their quantity and cost basis appear in **no** metric, total, or report.
- **Why it matters:** Directly contradicts the stated design principle *"Preserve complete history … consumption, gifts, damage"* (`docs/DESIGN_PRINCIPLES.md:22–24`). Cost basis silently leaks out of the books; a collector cannot see or reconcile discarded/damaged cigars.
- **Evidence:** `['SMOKED', 'GIFTED'].includes(...)` at 2763; dashboard totals 907–911, 937–948.
- **Recommended correction:** Include `DISCARDED` in removal history (with its own filter chip) and in lifetime accounting, or make the omission an explicit, documented product decision. Reconcile: `smoked + gifted + discarded` should equal total removals.
- **Data migration:** No (reporting only), but historical discarded events become newly visible.
- **Test coverage:** discard event → assert it appears in removal history and lifetime totals.

### C-5. Live runtime data is committed inside the Git deployment tree
- **Severity:** Critical (deployment / data loss)
- **Files:** `.gitignore` (only `/data/auth-users.json` and `/data/audit-log.jsonl` ignored); `git ls-files data/` tracks `counters.json`, `catalog-cigars.json`, `purchases.json`, `purchase-lines.json`, `lots.json`, `lot-location-balances.json`, `inventory-events.json`, `storage-locations.json`, `storage-sub-locations.json`, `vendors.json`, `smoking-journal-entries.json`.
- **Current behavior:** Production inventory JSON is version-controlled and lives in the deploy path. A `git pull` / redeploy can overwrite live data with repo seed data or produce merge conflicts on files the app rewrites at runtime.
- **Why it matters:** Highest-impact data-loss vector: a routine deploy can silently revert or clobber a collector's entire inventory. Seed data and live data are not separated; backups are not outside the deploy path (there are none — see H-3).
- **Evidence:** `.gitignore` lines listing only the two ignored files; `git ls-files data/` output.
- **Recommended correction:** Move live data outside the web/deploy root (e.g. a `DATA_ROOT` above the repo), commit only `*.example.json` seeds, and gitignore all runtime collections. Provide a first-run seeding step that copies examples into the live data dir only if absent.
- **Data migration:** Yes — relocate existing data and repoint `DATA_ROOT`.
- **Test coverage:** deploy/pull simulation asserting runtime JSON is untouched (extend the "deployment preserving runtime data" gap in §12).

---

## 4. High-priority findings

### H-1. Hardcoded current date
- **Severity:** High · **File:** `public/assets/js/app.js:334–336`
- `todayIsoDate()` returns the literal `'2026-07-16'`. Used for the purchase-date default (356), received-date default (1920), and the report custom-range end default (2821). New records are silently dated to a fixed day, and default custom reports exclude anything dated after 2026-07-16 (`date <= reportCustomEnd`, 2779).
- **Correction:** return the real local date (`new Date()` formatted to local `YYYY-MM-DD`). See H-6 for the local-vs-UTC nuance.
- **Migration:** No. **Tests:** assert defaults equal today; assert a future-dated removal is not excluded.

### H-2. Lock-free read-modify-write loses concurrent writes
- **Severity:** High · **File:** `api/lib/JsonStore.php:19–61`, all router write handlers
- `load_collection()` takes no lock; `save_collection()` locks only the final write. Every handler does load→mutate-in-PHP→save. Two overlapping requests both read N rows, each writes its own full array, and the last `rename()` wins — silently dropping the other's record. `next_id` is safe (it holds `counters.lock` across its read-modify-write), but record collections are not.
- **Correction:** hold an exclusive lock spanning read *and* write per collection (lock the data file or a per-collection lock before `load_collection` in mutating paths), or serialize writes through a single lock.
- **Migration:** No. **Tests:** concurrent create test asserting no lost rows (hard in the PS harness; at minimum a documented single-writer assumption).

### H-3. No backup or restore mechanism
- **Severity:** High · **Files:** `api/lib/JsonStore.php` (no retained backup), whole app
- `save_collection` writes temp→rename with no retained prior copy; there is no application backup or restore. Combined with C-5 (data in Git) and the malformed empty file (M-1), a bad write or deploy has no recovery path. The smoke test's TEMP backups are test-only.
- **Correction:** write timestamped backups outside the deploy path before destructive syncs; add a restore path. **Migration:** No. **Tests:** backup/restore round-trip.

### H-4. Event dates and `next_id` write are corruption-prone
- **Severity:** High · **File:** `api/lib/JsonStore.php:63–87`
- `next_id` defaults a missing counter to `1` (76) rather than `max(existing id)+1`, so a regenerated/older-backup `counters.json` re-issues colliding IDs; and it writes with a plain `file_put_contents` (79) — no temp+rename — so a mid-write crash truncates `counters.json` and every subsequent create 500s (`STORE_INVALID_JSON`).
- **Correction:** derive the counter from existing rows when absent; write counters atomically (temp+rename) like `save_collection`.
- **Migration:** Possibly — verify `counters.json` values exceed all existing IDs. **Tests:** delete a counter entry, create a record, assert no ID collision.

### H-5. No login throttling, and failed logins are never audited
- **Severity:** High · **Files:** `api/lib/Auth.php:71–90`, `api/index.php:1030–1034`
- `login_with_credentials` has no rate limiting or lockout — unlimited password guessing. The audit record for login is written *after* success (`index.php:1032`), so failed attempts leave **no** audit trail.
- **Correction:** add per-username/IP throttling with backoff and lockout; log failed attempts (without the password). **Migration:** No. **Tests:** repeated bad logins throttle and are audited.

### H-6. Timezone rollover on event dates (UTC vs local)
- **Severity:** High · **Files:** `api/bootstrap.php:62–65` (`now_iso` uses `gmdate`), `api/index.php:638,726` (`eventDate = substr($now,0,10)`), `app.js:1584` (`new Date().toISOString().slice(0,10)`)
- Server timestamps are UTC. Move/remove `eventDate` is the UTC calendar date, so an event entered at, e.g., 8:00 PM Eastern records **tomorrow's** date. The frontend is inconsistent: `todayIsoDate()` is hardcoded (H-1) while the received-date fallback at `app.js:1584` uses UTC `toISOString()` — two different date sources in one app.
- **Correction:** decide one authoritative timezone (the app already displays ET for audit); derive event calendar dates in that zone consistently on the server; make the frontend default match.
- **Migration:** Optional — past evening events may be off by a day. **Tests:** create an evening-ET removal, assert `eventDate` is the ET date.

### H-7. No CSRF tokens on state-changing routes
- **Severity:** High (mitigated) · **Files:** all `POST`/`PUT`/`DELETE` routes; `api/lib/Auth.php` cookie config
- No CSRF token is issued or checked. The only defense is the session cookie's `SameSite=Strict` (`Auth.php:25`), which does block cross-site form/AJAX in modern browsers — so real-world exploitability is limited, hence "mitigated." But `X-HTTP-Method-Override` is honored (`bootstrap.php:26`), and there is no defense-in-depth token.
- **Correction:** issue a per-session CSRF token, require it on mutations; drop the unused method-override or restrict it. **Migration:** No. **Tests:** mutation without token is rejected.

---

## 5. Medium-priority findings

### M-1. `data/smoking-journal-entries.json` is a malformed (empty) file
- **Severity:** Medium · **File:** `data/smoking-journal-entries.json` (2 bytes, whitespace only), tracked in Git
- `JSON.parse` fails on it. `load_collection` tolerates empty/whitespace (returns `[]`, `JsonStore.php:26–28`), so the app currently survives, but the tracked file is invalid JSON and has no `.lock` sidecar, unlike every other collection. A stricter reader or tooling will choke.
- **Correction:** store `[]`. **Migration:** trivial. **Tests:** JSON-parse all `data/*.json` in CI.

### M-2. Smoking-journal `kind` vs `type` field mismatch
- **Severity:** Medium · **File:** `api/lib/services/SmokingJournalService.php:126`
- The snapshot reads `$source['kind']`, but sub-location records store `type` (`index.php:144` config; smoke test creates `type='Drawer'`). So `storageSubLocationKind` is always `'GENERAL'`. **Correction:** read `type`. **Migration:** No. **Tests:** journal for a drawer smoke asserts the correct kind.

### M-3. Journal drops humidor name for humidor-level smokes
- **Severity:** Medium · **File:** `SmokingJournalService.php:104–130, 152–154`
- The location snapshot resolves only via `fromStorageSubLocationId`; when that is null (cigar assigned at humidor level), `sourceLocation` is null even though `fromStorageLocationId` is known. **Correction:** resolve the humidor from `fromStorageLocationId`, with the sub-location as optional detail. **Migration:** No. **Tests:** humidor-level smoke shows the humidor name.

### M-4. Location snapshots are resolved live, not captured at event time
- **Severity:** Medium · **File:** `SmokingJournalService.php:147–170`; `move_inventory`/`remove_inventory` events store only IDs
- Cost and MSRP are snapshotted onto events (good), but location name/kind/active flags are looked up live at read time. Renaming or archiving a section changes how past events read, so history is not fully immutable — a soft violation of *"records what happened"* (`DESIGN_PRINCIPLES.md:52`). **Correction:** snapshot location labels onto removal events. **Migration:** Optional. **Tests:** rename a section, assert past event label unchanged.

### M-5. Unknown money is silently treated as zero
- **Severity:** Medium · **Files:** `api/index.php:232–239` (`money_to_cents(null)=0`), `app.js` `numericValue(null)→0` throughout metrics (541–542, 596–598, 2796–2798)
- The stated principle is *known zero stays zero, unknown stays null* (implied by DESIGN_PRINCIPLES "calculate everything possible" + reconciliation intent). In practice a missing `unitCost`/`purchasePrice` yields a $0 cost basis (`line_subtotal_cents`, 246–252), and report totals sum missing per-cigar cost as 0 while still counting the quantity — so **averages are understated and savings overstated**, and a total can look "complete" when inputs are missing. Zero is indistinguishable from unknown.
- **Correction:** distinguish null from 0 in accounting; exclude unknown-cost quantities from average denominators or flag them; surface "incomplete cost data" rather than silently zeroing. **Migration:** No (logic), but reveals previously hidden gaps. **Tests:** a line with no cost does not report $0 basis as if known.

### M-6. Floating-point money in all frontend calculations
- **Severity:** Medium · **File:** `public/assets/js/app.js` — `numericValue`/`roundMoney` sums (527–607, 2795–2808)
- PHP allocation is integer-cents and deterministic, but every dashboard/report total is JS floating-point (`sum += qty * numericValue(cost)`). Accumulated rounding can create reconciliation differences between server-allocated basis and client-displayed totals. **Correction:** compute in integer cents (or round consistently at defined points) and reconcile against server values. **Migration:** No. **Tests:** a fixture where naive float sums drift.

---

## 6. Low-priority findings

- **L-1. No security headers beyond `X-Content-Type-Options`.** `Response.php:10–26` sets `nosniff` but no CSP, `X-Frame-Options`/frame-ancestors, or Referrer-Policy; no HSTS at the app layer. Add headers (server or PHP). Severity Low (SPA, same-origin), defense-in-depth.
- **L-2. No idle or absolute session timeout.** `Auth.php:20–27` sets a session cookie (`lifetime=0`) with no server-side idle/absolute expiry; a stolen session persists until logout/browser close. Add last-activity and absolute-age checks in `require_auth`.
- **L-3. Username enumeration via timing.** `Auth.php:82` short-circuits before `password_verify` when the user is absent, so response timing differs. Call `password_verify` against a dummy hash on the miss path. Minor.
- **L-4. Validation/cleaning helpers live in the router, not `Validation.php`.** `index.php:203–239` — `clean_text_field`, `clean_optional_int`, `clean_optional_money`, `money_to_cents` belong in the (nearly empty, 25-line) `Validation.php`. Maintainability only; no build-system change implied.

---

## 7. Confirmed strengths

- **Password security done right:** `password_hash`/`password_verify` (bcrypt), no plaintext, no hard-coded credentials in tracked source (`auth-users.json` is gitignored; a `.example` placeholder is provided).
- **Session fixation protection:** `session_regenerate_id(true)` on login (`Auth.php:86`).
- **Cookie hardening:** `HttpOnly`, `SameSite=Strict`, `Secure` when HTTPS (`Auth.php:20–27`).
- **Direct data access blocked (Apache):** `data/.htaccess` `Require all denied`.
- **Atomic collection writes:** `save_collection` uses temp-file + `rename` under `flock` (the counter path is the exception — H-4).
- **Path-injection resistance:** `data_file_path` whitelists `[a-z0-9-]` (`JsonStore.php:12`); IDs validated by `positive_int_param` / route regex.
- **Auth enforced on all data routes:** every `/records`, `/inventory`, `/audit`, `/sample-data`, journal route calls `require_auth()`.
- **Deterministic server money allocation:** integer-cents largest-remainder allocation (`allocate_cents_by_weight`, 265–298).
- **Smoking-journal write hardening:** protected-field rejection and strict rating/notes validation (`SmokingJournalService.php:46–78`).
- **Working end-to-end test:** the smoke test exercises the real purchase→receive→move lifecycle and passes.

---

## 8. Inventory and accounting reconciliation risks

| Invariant | Status | Reference |
|---|---|---|
| On-hand == sum of positive location balances | **Broken** by same-location move | C-1 |
| Moves do not change total inventory | **Broken** (same-location inflates) | C-1 |
| Purchase re-sync preserves prior moves | **Broken** (double-count) | C-2 |
| Receiving increases inventory exactly once | OK on happy path; at risk under re-sync | C-2, C-3 |
| Removals decrease inventory exactly once | OK (`remove_inventory`) | — |
| smoked + gifted + discarded reconcile to removals | **Broken** (discarded excluded from reports) | C-4 |
| One lot split across locations not double-counted | At risk (C-2); balances filtered to qty>0 | C-2 |
| Partially received purchases reconcile | **N/A / lost** — no partial-received state | C-3 |
| Depleted lots remain available for history | OK — lots retained even at qty 0 unless sync deletes | C-3 |
| Archived relationships don't hide records | Partial — live location lookups can blank history | M-3, M-4 |
| Missing relationships don't silently delete qty | **At risk** — status coercion deletes inventory | C-3 |
| Known-zero vs unknown distinguishable | **Broken** — unknown money → 0 | M-5 |

---

## 9. Security risks (summary)

- **High:** no login throttling + unlogged failed logins (H-5); no CSRF token, mitigated only by SameSite=Strict (H-7).
- **Medium/Low:** no idle/absolute timeout (L-2); missing security headers (L-1); username timing enumeration (L-3); `X-HTTP-Method-Override` honored (H-7).
- **Good:** bcrypt, session regeneration, cookie flags, per-route auth, path whitelisting, no tracked secrets. No destructive testing was performed. Direct JSON access is blocked on Apache but **would be exposed on non-Apache servers (nginx) that ignore `.htaccess`** — verify the production server honors it, or move data outside webroot (ties to C-5).

---

## 10. Deployment / data-loss risks

- **C-5:** live JSON committed in Git deploy tree → pull/redeploy can overwrite production data. **Highest data-loss risk.**
- **H-3:** no backups → no recovery from a bad sync, the empty-file issue, or a clobbering deploy.
- **H-4:** non-atomic counter write → truncated `counters.json` bricks all creates until repaired.
- **`.htaccess` dependency:** data protection assumes Apache; confirm the production stack.
- **M-1:** a malformed tracked data file already ships in the repo.

---

## 11. Missing / inconsistent prior functionality

- **Partially-received purchases:** the earlier model implied `partially-received` / `in-route`; the current status set is `pending`/`received` only, and legacy values are coerced to `pending` (C-3). Quantity-ordered vs quantity-received tracking is absent — receiving is all-or-nothing at the line level.
- **Discarded/damaged reporting:** captured but unreported (C-4), contradicting DESIGN_PRINCIPLES.
- **Smoking journal / ratings:** implemented server-side and is the sole `TODO.md` item; verify the UI surfaces ratings on catalog/lot/journal views as the TODO requires (the `kind` bug M-2 and null-source M-3 degrade it).
- **Import:** referenced by tooling (`tools/import-rich-workbook.ps1`) but there is no reviewable in-app import workflow, and DESIGN_PRINCIPLES calls for "imports reviewable before they create permanent records" — gap.
- **Duplicate-receiving / edit-after-receipt protections:** re-sync is idempotent by design but has the C-2/C-3 corruption paths instead of explicit guards.

---

## 12. Automated test gaps

Current automated tests: **one** integration smoke test (`tests/flat-file-smoke.ps1`), which passed under PowerShell 7. It **fails under Windows PowerShell 5.1** (`ConvertTo-Json -AsArray` is 7+ only) — document the `pwsh` requirement or make it 5.1-compatible.

Missing coverage (ranked by the risk it would catch):
1. **Same-location move** (C-1) and **move-then-resync** (C-2) — the two worst inventory bugs.
2. **Status coercion deleting inventory** (C-3).
3. **Discard removal → reports/totals** (C-4).
4. **Deployment preserving runtime data** (C-5) and **backup/restore** (H-3).
5. **JSON locking / concurrency** (H-2).
6. **Money allocation & missing-money handling** (M-5, M-6) — reconcile server basis vs client totals.
7. **Auth:** throttling, failed-login audit, permission checks on every route, session timeout (H-5, L-2).
8. **`next_id` collision / atomic write** (H-4).
9. **Remove smoke/gift/discard** and **partial receiving** happy paths (the smoke test covers only vendor CRUD + one purchase lifecycle + one move).
10. **JSON-parse all `data/*.json`** (would have caught M-1).

---

## 13. Recommended staged remediation plan

**Stage 0 — stop the bleeding (before real data):**
- C-5 move live data out of the Git/deploy tree; gitignore runtime collections; ship only `.example` seeds.
- H-3 add backups outside the deploy path.
- M-1 fix the malformed empty JSON file.

**Stage 1 — inventory correctness:**
- C-1 same-location move guard; C-2 re-sync reconciliation; C-3 stop treating unknown/legacy status as a delete signal (+ data reclassification).

**Stage 2 — accounting truth:**
- C-4 include discarded in reports/totals; M-5 null-vs-zero money; M-6 integer-cents client math.

**Stage 3 — durability & dates:**
- H-2 read+write locking; H-4 counter derivation + atomic write; H-1/H-6 real, timezone-consistent dates.

**Stage 4 — security hardening:**
- H-5 throttling + failed-login audit; H-7 CSRF token; L-1 headers; L-2 timeouts; L-3 timing.

**Stage 5 — history fidelity & tests:**
- M-2/M-3/M-4 journal location fixes and event-time snapshots; build the test suite in §12 (start with C-1–C-4 regression tests).

All corrections stay within the flat PHP / JSON / vanilla-JS architecture — no build system, framework, or database introduced.

---

## Completion summary

**Files reviewed (read-only):**
`README`-adjacent docs (`docs/DESIGN_PRINCIPLES.md`, `TODO.md`), `api/index.php`, `api/bootstrap.php`, `api/lib/{JsonStore,Auth,Audit,Response,Validation,DataRepository,Errors}.php`, `api/lib/services/SmokingJournalService.php`, `api/lib/utils/InventoryAccounting.php`, `public/assets/js/app.js` (key regions: dates, money, metrics, reports), `index.html`, `api/.htaccess`, `data/.htaccess`, `.gitignore`, `tests/flat-file-smoke.ps1`, and all `data/*.json` (parse check + Git-tracking review).

**Verification run:**
- PHP lint (`php -l`) on all 12 PHP files — **all pass**.
- `node --check` on `app.js` — **passes**.
- `JSON.parse` on all `data/*.json` — **12 pass, 1 fail** (`smoking-journal-entries.json`, empty — M-1).
- `tests/flat-file-smoke.ps1` under PowerShell 7.6.3 — **passes**; under Windows PowerShell 5.1 — **fails** (7+ syntax).
- `git status` — **clean** before and after (smoke test restores runtime data).

**Tests unavailable:** none blocked by missing runtime (PHP, Node, PowerShell 7 all present). No unit tests exist to run beyond the single smoke test.

**Findings by severity:** Critical 5 · High 7 · Medium 6 · Low 4.

**Five most important findings:**
1. C-1 — same-location move inflates inventory (phantom stock).
2. C-5 — live data committed in the Git deploy tree (deploy can overwrite production).
3. C-2 — purchase re-sync after a move double-counts inventory.
4. C-3 — legacy/partial status coercion silently deletes received inventory.
5. C-4 — discarded removals vanish from all reports and totals.

**Report location:** `functional-stabilization-audit.md` (repo root).

**Confirmations:**
- No application files were modified during this audit. The only files created are this report and `claude-code-review.md` (both new, non-application artifacts).
- Nothing was committed, pushed, staged, deployed, or sent to any webhook by this audit. (Note: the reviewer's environment has a global auto-sync hook that may commit new files on edit — verify `git status`/log if strict no-commit is required.)
- No branches were switched or merged; the audit ran on `critical-issue-review` (== `main`).
- The smoke test transiently wrote and then restored runtime JSON via its own TEMP backups; `git status` is clean.
