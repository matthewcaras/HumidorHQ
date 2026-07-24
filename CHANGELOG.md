<!--
Filename: CHANGELOG.md
Revision: 1.30.44
Description: Project documentation and implementation notes.
Modified Date: 2026-07-24 10:00 ET
-->

# Changelog

All meaningful project changes should be recorded here before deployment.

Revision format: `major.minor.feature`

- `major` - breaking architecture or data changes
- `minor` - new workflow, page, API, or significant enhancement
- `feature` - focused feature work, fixes, documentation updates, or small compatibility updates

Author convention:

- `jasrasr`, `Jason Lamb`, `jason@jasr.me`, `jason@icwnow.com`, and `92162022+jasrasr@users.noreply.github.com` are Jason.
- `matthewcaras` and `matthewcaras@gmail.com` are Matt.
- `copilot-swe-agent[bot]` and `198982749+Copilot@users.noreply.github.com` are Copilot.

## 1.30.37 - 2026-07-23

Changed by: Matt

- Moved the Collection saved views bar to the bottom of the Collection page.

## 1.30.38 - 2026-07-23

Changed by: Matt

- Reworked the Collection saved views section into a footer block so it stays below the cigar table.

## 1.30.39 - 2026-07-23

Changed by: Matt

- Updated the Collection app cache-bust pin to load the footer placement fix in live browsers.

## 1.30.40 - 2026-07-24

Changed by: Matt

- Exempted the Matt account from automatic session idle and absolute timeouts so it remains signed in until explicit logout.

## 1.30.41 - 2026-07-24

Changed by: Matt

- Added auth-security regression coverage for Matt’s no-timeout session behavior.

## 1.30.42 - 2026-07-24

Changed by: Matt

- Made Matt’s session cookie persistent so the login remains available across browser restarts until explicit logout.

## 1.30.43 - 2026-07-24

Changed by: Matt

- Added automatic first-auth-use daily backups tied to the authenticated account and verified same-day dedupe.

## 1.30.44 - 2026-07-24

Changed by: Matt

- Hardened automatic daily backups so repeat logins and refreshes on the same day do not create duplicate daily bundles.

## 1.30.36 - 2026-07-23

Changed by: Matt

- Reordered the Collection filters and search below the summary boxes, removed the collection lot-count column, suppressed General drawer/section labels in Collection, removed the top intro copy from Catalog, Vendors, Purchases, and Humidors, moved archived toggles to the bottom of the managed pages and section panel, and closed purchases by default.

## 1.30.35 - 2026-07-23

Changed by: Matt

- Reordered the Reports page so Inventory Aging appears first, followed by Rating Breakdown, Purchase Trend Analytics, Purchase History, Removal History, and Activity. Removed the Rated Entries and Breakdown Rows summary cards from Rating Breakdown.

## 1.30.34 - 2026-07-23

Changed by: Matt

- Corrected the expanded Collection lot label so the lot number appears once and the purchase date appears beneath it.

## 1.30.33 - 2026-07-23

Changed by: Matt

- Changed the expanded Collection lot label to display as `Lot ID - Purchase Date` for quicker smoke-date validation.

## 1.30.32 - 2026-07-23

Changed by: Matt

- Added the purchase date beside each lot number in the expanded Collection cigar detail so smoke-date validation is easier during historical entry.

## 1.30.27 - 2026-07-22

Changed by: Matt

- Updated the browser entry point cache key so the production app loads the current JavaScript bundle and exposes the Production Import button from Backup & Restore.

## 1.30.28 - 2026-07-22

Changed by: Matt

- Made authenticated login land on the Dashboard first instead of preserving a Collection page hash from a prior session.

## 1.30.29 - 2026-07-22

Changed by: Matt

- Aligned the collection cost basis display with the authoritative purchase total in the current pre-inventory state so it matches the purchase total when no removals or collection filters are active.

## 1.30.30 - 2026-07-22

Changed by: Matt

- Centered the pending Smoking Journal panel on render and displayed the report average rating as a numeric value with two decimal places.

## 1.30.31 - 2026-07-22

Changed by: Matt

- Corrected the Collection summary so the default, unfiltered view also matches the authoritative purchase total while filtered views still use filtered inventory valuation.

## 1.30.29 - 2026-07-22

Changed by: Matt

- Aligned the dashboard cost basis display with the authoritative purchase totals while there are no removals, so the dashboard matches Purchase History for the current pre-inventory state.

## 1.30.26 - 2026-07-22

Changed by: Matt

- Added an admin-only production runtime import page and API route for uploading a locally packaged ZIP of approved runtime JSON files.
- Added a local packaging utility that assembles the import ZIP with per-file SHA-256 hashes, record counts, and production inventory totals.
- Added isolated import-route rehearsal tests covering auth, CSRF, tamper rejection, duplicate rejection, and rollback.

## 1.30.25 - 2026-07-22

Changed by: Matt

- Removed the Excel COM dependency from the rich workbook importer so it reads `.xlsx` files directly through OpenXML.
- Updated the README import notes to state that Excel is not required for import validation.

## 1.30.21 - 2026-07-22

Changed by: Matt and Jason

- Added Collection drill-through from Rating Breakdown rows as a search-only subset opener and sorted the breakdown by strength order, alphabetical wrapper/origin/manufacturer, and ascending size length.
- Added local-data/ Git ignore rules that keep the folder path visible through a committed `.placeholder` file while ignoring all machine-local contents.
- Documented the local-data/.placeholder pattern in the README so empty local working folders can stay present without tracking runtime files.

## 1.30.24 - 2026-07-22

Changed by: Matt

- Aligned the rich workbook importer and workbook-strength sync defaults to the provided `HumidorHQ_Rich_Import_Workbook - v2.xlsx` file.
- Updated the README import examples to reference the v2 workbook filename.

## 1.30.23 - 2026-07-22

Changed by: Matt

- Required authentication and CSRF protection on all direct backup create/import/preview/restore API routes.
- Promoted lot cache and purchase-header integrity mismatches to nonzero integrity-check failures.
- Made the smoke harness validate runnable PHP executables before use and invoke PHP through redirected subprocesses.
- Removed the now-unused Buy Again report renderer from the browser app.

## 1.30.22 - 2026-07-22

Changed by: Matt

- Switched Rating Breakdown row drill-through to open Collection with a focused search instead of Catalog.

## 1.30.20 - 2026-07-22

Changed by: Matt

- Added Collection drill-through from Rating Breakdown rows as a search-only subset opener and sorted the breakdown by strength order, alphabetical wrapper/origin/manufacturer, and ascending size length.

## 1.30.19 - 2026-07-22

Changed by: Matt

- Added a collapsible Rating Breakdown report that averages smoking journal ratings by strength, wrapper, origin, size, or manufacturer with sample counts and last-smoked dates.

## 1.30.18 - 2026-07-22

Changed by: Matt

- Made the Collection-side Pre Inventory focus action open the first staged cigar's Move form so the next permanent placement step is guided directly from the staging view.

## 1.30.17 - 2026-07-21

Changed by: Matt

- Added a Collection-side Pre Inventory reconciliation summary with focus and clear-filter actions to support the manual move workflow after staging inventory.

## 1.30.16 - 2026-07-21

Changed by: Matt

- Added smoke-test coverage and documentation for the workbook-import staging mode.

## 1.30.15 - 2026-07-21

Changed by: Matt

- Added an explicit workbook-import staging mode that forces current inventory into `Pre Inventory / General` for manual reconciliation after import.
## 1.30.14 - 2026-07-21

Changed by: Matt

- Added local saved views to the Reports page and placed the preset bar at the bottom of the report list.

## 1.30.13 - 2026-07-21

Changed by: Matt

- Moved Collection saved views to the bottom of the page and added the same bottom-position saved-view pattern to Purchase History.

## 1.30.12 - 2026-07-21

Changed by: Matt

- Added local saved views for the Collection page so sort, filter, direction, and search combinations can be recalled without touching runtime data.

## 1.30.11 - 2026-07-21

Changed by: Matt

- Made report sections remember their open state so filter clicks do not collapse the report you are working in.

## 1.30.10 - 2026-07-21

Changed by: Matt

- Added an Apple touch icon so home-screen saves use a cigar mark instead of the fallback site snapshot.

## 1.30.9 - 2026-07-20

Changed by: Matt

- Tightened the report header layout and bumped the stylesheet cache version so the live site picks up the left-aligned collapsible report summaries.

## 1.30.8 - 2026-07-20

Changed by: Matt

- Tightened the report header layout and shortened the summary text on the collapsible report sections.

## 1.30.7 - 2026-07-20

Changed by: Matt

- Made the report sections collapsible and removed the dedicated Buy Again report section from Reports.

## 1.30.6 - 2026-07-20

Changed by: Matt

- Added direct drill-through actions from Activity rows into the matching Purchase or Collection context.

## 1.30.5 - 2026-07-20

Changed by: Matt

- Added Activity drill-through actions for opening the matching Purchase or Collection context directly from report rows.

## 1.30.4 - 2026-07-20

Changed by: Matt

- Made the drill-through page navigation safe for isolated regression tests that do not provide a browser window.

## 1.30.3 - 2026-07-20

Changed by: Matt

- Added drill-through from Buy Again rows to the matching Catalog cigar and from Inventory Aging rows to the filtered Collection view.

## 1.30.2 - 2026-07-20

Changed by: Matt

- Made Purchase Trend Analytics rows open the Purchases page filtered to the selected year, month, vendor, or manufacturer slice.

## 1.30.1 - 2026-07-20

Changed by: Matt

- Sorted the Purchase Trend Analytics manufacturer breakdown alphabetically for easier review.

## 1.30.0 - 2026-07-20

Changed by: Matt

- Added a read-only Purchase Trend Analytics report with year and month grouping.
- Added vendor and manufacturer breakdowns that reuse stored purchase totals and weighted line allocations.
- Added average paid per cigar so purchase totals can be reviewed alongside cigar volume without changing stored data.
- Added isolated regression coverage for yearly and monthly purchase trend summaries plus vendor/manufacturer reconciliation.

## 1.29.0 - 2026-07-20

Changed by: Matt

- Added a read-only Inventory Aging report using positive Lot/location balances and Lot receipt-date snapshots.
- Added 0–30, 31–90, 91–180, 181–365, over-one-year, future-date, and unknown-date buckets.
- Added manufacturer and Humidor filters with on-hand quantity, distinct Lot, quantity-weighted age, cost basis, MSRP, and potential-savings summaries.
- Preserved unknown money semantics and calculated known monetary totals in integer cents so incomplete values cannot appear complete.
- Added aging details by Lot/location with links into the existing filtered and centered Collection view.
- Simplified the Aging summary to On Hand, Distinct Lots, and Weighted Average Age, and moved cigar-level detail into expandable nonempty age-bucket rows.
- Added isolated reconciliation coverage for split Lots, filters, bucket boundaries, invalid/future/unknown dates, monetary totals, and missing-cost handling.

## 1.28.0 - 2026-07-20

Changed by: Matt

- Expanded Activity into a read-only audit report with Lifetime, Current Year, Prior Year, and Custom date filters.
- Added event-type, Humidor, Lot, cigar/reference text, location, and notes filtering without changing InventoryEvents.
- Added source/destination location context and explicit Event, Lot, original-event, and reversal references.
- Made cigar names open the matching Catalog Journal and event references focus the related original/reversal pair.
- Preserved the recent-12 default for unfiltered Activity while showing every matching record when filters are active.
- Added isolated regression coverage for event type, location, Humidor, Lot, date, notes, and reversal relationship behavior.

## 1.27.0 - 2026-07-20

Changed by: Matt

- Added a read-only Catalog Smoking Journal panel with prior ratings, notes, quantity, Lot, source location, effective status, average rating, and last effective smoke date.
- Preserved reversed smoke Journal entries in the Catalog history while clearly marking them and excluding them from effective quantity, rating, and latest-date summaries.
- Made Removal History cigar names open the corresponding Catalog Journal and expanded report search to include Journal ratings and notes.
- Corrected the mobile Catalog Journal expansion to fill the available view width and added a stronger border around individual mobile cigar records.
- Added isolated regression coverage for Journal ordering, summaries, source context, report-note search, and reversal handling.

## 1.26.4 - 2026-07-20

Changed by: Matt

- Made the complete Collection cigar summary row/card toggle its expanded Lot/location details instead of limiting the click target to the cigar name.
- Added focus, expanded-state labeling, and Enter/Space keyboard activation while preserving interactive child-control behavior.
- Added regression coverage for selection toggling and accessible whole-card hooks.

## 1.26.3 - 2026-07-20

Changed by: Matt

- Hid the aggregate On Hand, Lots, Oldest, average cost/MSRP, and Humidor-location cells from mobile cigar cards even while expanded, leaving the Lot/location detail as the single mobile source for those values.
- Restored wrapper, binder, and filler information beside strength and Buy Again in the primary cigar identity shown on desktop and mobile.
- Added regression coverage for the non-duplicated mobile summary and retained blend information.

## 1.26.2 - 2026-07-20

Changed by: Matt

- Removed the duplicated cigar heading and blend summary from expanded Collection details on desktop and mobile.
- Arranged mobile Collection actions in two columns to shorten each expanded Lot/location card.
- Limited the Reconcile Count action to positive balances inside the active `Pre Inventory` Humidor so it disappears after permanent placement.
- Added regression coverage for active staging visibility and permanent/archived location suppression.

## 1.26.1 - 2026-07-19

Changed by: Matt

- Kept the desktop sidebar toggle arrow-only while retaining an accessible label and a visible Menu label on mobile.
- Added paired Dashboard and Collection shortcuts to the initial collapsed mobile header.
- Compacted mobile Dashboard and purchase cards and placed Collection On Hand, Cost Basis, and MSRP summary values in one row.
- Limited collapsed mobile Collection records to cigar identity and collapsed purchase records to a concise date/vendor/total summary until selected.
- Linked active Humidor names on both Dashboard and Humidors management to Collection with the selected Humidor filter applied.
- Added regression coverage for shortcut navigation, compact mobile hooks, progressive disclosure, and shared Humidor filtering.

## 1.26.0 - 2026-07-19

Changed by: Matt

- Added an accessible collapsible sidebar that becomes a compact closed menu by default on mobile and closes after mobile navigation.
- Replaced horizontal-scrolling mobile data tables with labeled stacked records while preserving expanded detail panels and table behavior on larger screens.
- Compacted Collection sort/filter controls into a two-column mobile grid with explicit accessible labels and kept Search actions side by side.
- Tightened mobile spacing and report controls without changing desktop workflow behavior or application data.
- Added isolated regression coverage for navigation, responsive-table enhancement, mobile overflow prevention, and updated asset cache versions.

## 1.25.2 - 2026-07-19

Changed by: Matt

- Strengthened the shared border treatment around expanded Collection records, managed-record edit panels, and purchase details.
- Added a matching bordered surface around open Smoke, Give, Discard, Move, Reconcile Count, and Activity reversal forms.
- Added isolated regression coverage for the expanded-state styling and updated the stylesheet cache version.

## 1.25.1 - 2026-07-19

Changed by: Matt

- Defaulted each Collection move to the full quantity available in the selected Lot/location balance while retaining the ability to enter a smaller split quantity.
- Made Pre Inventory worklist cigar links center and focus the expanded matching Collection record after navigation.
- Added isolated regression coverage for both behaviors.

## 1.25.0 - 2026-07-19

Changed by: Matt

- Added a guarded Collection physical-count workflow showing expected quantity, actual count, and signed variance before confirmation.
- Added an authenticated, transactional, idempotent adjustment endpoint with exact expected-balance preconditions, required date/reason, immutable cost/MSRP snapshots, and atomic balance/Lot/event updates.
- Added append-only reversal support for both increasing and decreasing `INVENTORY_ADJUSTMENT` events without rewriting purchase or receipt history.
- Added signed adjustments to Activity and updated the read-only integrity checker to reconcile effective adjustment quantities into expected inventory.
- Standardized user-facing terminology on `Discard` and `Discarded`, removing damage wording from current workflows and documentation.
- Added isolated regression coverage for rejected/stale requests, exact replay, conflicting keys, upward/downward counts, adjustment reversals, snapshot preservation, and runtime-data hash safety.

## 1.24.0 - 2026-07-19

Changed by: Matt

- Added a Pre Inventory reconciliation worklist to Dashboard using current positive location balances without introducing a new collection or migrating runtime data.
- Reconciled each worklist row across staged quantity, quantity placed elsewhere, and total on hand, with a current placement percentage.
- Made the Pre Inventory metric keyboard-accessible and linked it directly to Collection filtered to the staging Humidor.
- Made each worklist cigar open its filtered, expanded Collection record so the existing guarded Move workflow remains authoritative.
- Kept the empty-state archive reminder while the staging Humidor is active and removed the complete worklist automatically after archive.
- Added isolated regression coverage for split-location quantities, placement percentages, and archived worklist removal.

## 1.23.0 - 2026-07-19

Changed by: Matt

- Designated the existing active `Pre Inventory` Humidor by name as the staging location without adding schema fields or migrating runtime data.
- Added a Dashboard staging count for cigars awaiting permanent placement; the count remains visible at zero while the Humidor is active and disappears automatically after archive.
- Shortened the Dashboard removal-total label to `Discarded`.
- Removed internal runtime JSON filename wording from Catalog, Vendor, and Humidor record counts.
- Added isolated regression coverage for active/archived Pre Inventory visibility and its reconciled positive balance quantity.

## 1.22.1 - 2026-07-19

Changed by: Matt

- Sorted Catalog records alphabetically by cigar name with a stable ID tie-breaker.
- Added Catalog search across cigar identity, blend details, strength, general notes, and Buy Again decisions and notes.
- Confirmed and regression-tested that Smoking Journal defaults to the linked Catalog cigar's latest Buy Again decision and notes; saving a changed decision continues to update Catalog transactionally.

## 1.22.0 - 2026-07-19

Changed by: Matt

- Added Catalog-level Buy Again decisions (`Not Evaluated`, `Yes`, `Maybe`, or `No`) with optional decision notes and shared PHP validation.
- Added transactional Buy Again updates to the immediate Smoking Journal workflow so a failed decision cannot leave the Journal and Catalog out of sync.
- Added Collection Buy Again filtering and search across decision labels and notes.
- Added purchase-history Buy Again filtering with deterministic line-level paid allocations and a Reports summary of decision counts and highly rated unevaluated cigars.
- Added isolated JavaScript and API smoke coverage for valid decisions, invalid-decision rollback, report totals, and legacy records without a decision.

## 1.21.0 - 2026-07-19

Changed by: Matt

- Added read-only purchase-history summaries by Vendor or Catalog cigar manufacturer using purchase counts, cigar quantities, and the same authoritative purchase-header totals in both views.
- Allocated manufacturer-specific shares deterministically in integer cents from stored line weights so all manufacturer totals foot exactly to the corresponding Vendor totals.
- Added Collection search across cigar identity, blend details, strength, notes, and current location labels.
- Added Collection strength filtering and mild-to-full strength sorting while keeping filtered quantities and financial summaries reconciled to the displayed on-hand records.
- Added isolated JavaScript regression coverage for Vendor/manufacturer reporting, Collection search, strength filtering/sorting, and unknown-versus-zero monetary totals.
- Kept purchase-line details in the Purchases workflow and organized Collection controls into separate heading, filter, and full-width search rows.

## 1.20.0 - 2026-07-19

Changed by: Matt

- Added an authenticated Backup & Restore workflow for the complete runtime JSON collection set, including secure download and validated import of portable bundles.
- Added SHA-256 verification, duplicate-ID/counter/relationship/inventory checks, a preview fingerprint, an exact confirmation phrase, and transaction-safe restore.
- Added an automatic pre-restore safety backup while leaving the append-only audit log unchanged and keeping all backup bundles ignored by Git and denied direct Apache access.
- Added isolated PowerShell 7 rehearsal coverage for create, list, preview, stale-state rejection, confirmation rejection, restore, import, tamper detection, JSON parsing, and source-runtime hash preservation.

## 1.19.2 - 2026-07-19

Changed by: Matt

- Added locked, idempotent, create-only first-run initialization of missing non-auth runtime JSON from validated tracked `seed-data/` templates.
- Added atomic creation of a missing empty audit log while preserving every existing runtime file byte-for-byte.
- Kept credentials out of automatic initialization and added the explicit `AUTH_USERS_SETUP_REQUIRED` response for separate secure provisioning.
- Added isolated PowerShell 7 coverage for an empty runtime directory, template validity, repeat bootstrap, optional overrides, existing-file preservation, and deployment hash preservation.
- Made reversal smoke fixtures use the current local calendar date so the existing suite remains valid after day rollover.

## 1.19.1 - 2026-07-19

Changed by: Matt

- Made `APP_ROOT/data` the runtime-data default while retaining `HUMIDORHQ_DATA_ROOT` as an optional override.
- Retired external-only startup checks and aligned local startup, authentication provisioning, integrity tooling, tests, and deployment documentation with the in-application default.
- Preserved strict startup validation, transaction recovery, authentication and security controls, Git ignore protection, and Apache denial of direct `data/` access without changing runtime JSON.

## 1.19.0 - 2026-07-18

Changed by: Matt

- Added transactional, append-only full-event reversals for purchase receipts, moves, smokes, gifts, and discards through `POST /api/inventory-events/{id}/reverse`.
- Required a validated reversal date, correction reason, and idempotency key; exact retries return the original compensating event while conflicting keys and second reversals are rejected without writes.
- Preserved original InventoryEvents, cost/MSRP snapshots, Lots, depleted history, counters, and Smoking Journal entries while restoring only the target event's inventory effect.
- Derived receipt quantities and purchase status from effective unreversed receipt events, allowing an incorrect receipt to be reversed and replaced through the existing partial-receipt workflow.
- Excluded reversed removals from Dashboard/report metrics and added reversible Activity controls that clearly mark original and compensating events.
- Updated the read-only integrity checker and isolated smoke suite for reversal references, effective-ledger reconciliation, unavailable quantities, journal preservation, retries, and corrected replacement receipts.

## 1.18.0 - 2026-07-18

Changed by: Matt

- Added transactional archive/restore lifecycle routes for Catalog cigars, Vendors, Humidors, and Humidor sections without deleting or rewriting historical relationships.
- Treated existing records without `isActive` as active, marked newly created lifecycle records active, and avoided any automatic runtime-data migration.
- Kept archived identities available to Collection and report history while excluding them from new purchase, receipt, move, Humidor filter, and section choices.
- Blocked archiving Humidors or sections with positive inventory, required active sections to be archived before their Humidor, and rejected direct API assignment, receiving, or movement into archived records.
- Added active/archived management toggles and archive/restore controls using the existing interface design; permanent deletion remains protected for every linked record.
- Added isolated coverage for lifecycle retries, linked-history preservation, active-inventory guards, archived destination rejection, and rejected-request hash stability.

## 1.17.0 - 2026-07-18

Changed by: Matt

- Added quantity-aware Smoke, Give, and Discard forms with validated historical event dates and transaction-safe removal mutations.
- Added required removal idempotency keys so exact retries return the original event without changing balances, Lots, counters, events, or audit success records, while conflicting reuse is rejected.
- Corrected removal reports and Smoking Journal snapshots to use the event's original Humidor and optional section, including General locations.
- Added discarded quantities and values to Dashboard lifetime totals and removal report filters, summaries, and history.
- Reconnected smoked removals to a 1-10 Smoking Journal follow-up and displayed journal ratings and notes in removal history.
- Added isolated regression coverage for retry safety, rejected dates, exact source locations, all three removal types, inventory reconciliation, journal constraints, and read-only journal reporting.

## 1.16.0 - 2026-07-18

Changed by: Matt

- Added a transactional `POST /api/purchase-lines/{id}/receive` workflow for full or partial line receipts into an exact Humidor and optional section.
- Made purchase-receipt InventoryEvents authoritative for received quantity and derived `pending`, `partially-received`, and `received` purchase status after every receipt.
- Added required idempotency keys, exact replay responses, conflicting-key rejection, over-receipt protection, real-date validation, and pre-mutation Lot reconciliation checks.
- Kept one Lot per purchase line while accumulating its received quantity, exact location balances, immutable cost/MSRP snapshots, and line-level first/latest/completion receipt dates.
- Replaced the manual all-at-once receiving control with line-level quantity/date/location forms without changing the existing visual design.
- Added isolated regression coverage for retries, rejected-request hash stability, split receipt locations, multi-line completion, partial notes edits, counters, Lots, balances, events, and status dates.

## 1.15.0 - 2026-07-17

Changed by: Matt

- Replaced the fixed/UTC browser date defaults with local-calendar dates and added strict server validation for purchase, expected, and received dates plus local-timezone inventory event dates.
- Made PHP authoritative for purchase totals and deterministic integer-cent largest-remainder allocations; rejected negative, over-precision, out-of-range, and invalid numeric inputs.
- Preserved unknown purchase adjustments and cost/MSRP values as unknown through allocations, dashboards, purchase summaries, and removal reports while keeping known zero as `$0.00`.
- Synchronized each affected Lot `currentQuantity` from positive balances during move/removal transactions and added regression coverage for exact reconciliation.
- Explicitly rejected unsupported partially received status instead of silently treating it as pending; line-level partial receiving remains deferred to a separately migrated, idempotent workflow.

## 1.14.0 - 2026-07-17

Changed by: Matt

- Added shared username/client login throttling with bounded inputs, constant-work unknown-user verification, and failed/rate-limited attempt auditing that never records passwords.
- Added 30-minute idle and 12-hour absolute session limits, strict session mode, CSRF tokens for login and every authenticated mutation, and token rotation at login.
- Added configurable forced/proxy-aware Secure-cookie detection plus API and Apache content, framing, referrer, permissions, cache, and content-type response defenses.
- Added isolated regression coverage for throttling, audit safety, CSRF rejection/acceptance, cookie flags, security headers, and both session-expiration policies.

## 1.13.0 - 2026-07-17

Changed by: Matt

- Serialized runtime mutations behind one external-data transaction lock so reads, relationship validation, ID allocation, and writes use one consistent snapshot.
- Staged every changed JSON collection before replacement and added exact backups plus a recovery journal that rolls back failed commits and is recovered automatically after an interrupted process.
- Moved counter allocation into the same transaction as its records and delayed mutation success-audit entries until the data commit succeeds.
- Added isolated concurrent-writer, injected-failure rollback, and simulated-process-interruption recovery tests without touching current runtime JSON.

## 1.12.0 - 2026-07-17

Changed by: Matt

- Required `HUMIDORHQ_DATA_ROOT` to resolve to readable, writable runtime JSON outside the repository and deployed application tree.
- Added tracked empty `seed-data/`, guarded external data-copy tooling, startup validation, and external-aware local/auth/integrity utilities.
- Moved smoke fixtures to tracked seed data and added isolated coverage proving repeated code deployment leaves external runtime hashes unchanged.
- Documented explicit Windows preservation and Hostinger setup; no current runtime JSON was automatically copied, moved, or modified.

## 1.11.3 - 2026-07-17

Changed by: Matt

- Added a dry-run-first offline migration for the approved Purchases 1-40 header-only subtotal and discount repair.
- Preserved every stored `totalPaid` as authoritative, including the back-solved subtotals for purchases 10, 15, and 22.
- Added exact per-purchase preconditions, external backup and manifest verification, automatic failure restoration, and protected collection/hash checks.
- Rehearsed against copied temporary data only and reached zero integrity-checker errors or warnings without modifying live runtime JSON.

## 1.11.2 - 2026-07-17

Changed by: Matt

- Added a preconditioned offline migration for the confirmed Balance 66 location correction and Lots 30, 54, 65, and 70 quantity-cache corrections.
- Required an external timestamped backup, SHA-256 manifest, explicit apply confirmation, protected repository-data override, and post-repair inventory reconciliation.
- Kept purchases, purchase lines, events, journals, counters, balance quantities, and cost/MSRP snapshots outside the migration scope.
- Rehearsed the migration only against a copied temporary data root; no existing runtime records were repaired.

## 1.11.1 - 2026-07-17

Changed by: Matt

- Blocked new purchase lines from being added to received purchases or purchases with existing inventory history.
- Blocked draft lines from being reassigned to those purchases before any line, counter, inventory, or audit mutation.
- Applied notes-only immutability and deletion protection to incomplete lines already attached to received purchases.
- Added isolated regression coverage for rejected creation, reassignment, structural edits, deletion, unchanged hashes/counters, and the preserved pending-purchase workflow.

## 1.11.0 - 2026-07-17

Changed by: Matt

- Rejected exact same-location moves in PHP before any balance, event, audit, or counter mutation and prevented the same selection in the existing move form.
- Made received purchase inventory history immutable through generic edits and deletion while leaving isolated draft-line deletion available.
- Added referential deletion guards for linked Catalog cigars, Vendors, Humidors, Humidor sections, purchases, purchase lines, and Smoking Journal history.
- Prevented generic purchase synchronization from resetting existing received Lots, balances, or receipt events.
- Made the smoke test use a disposable data root and added isolated regression checks for the Stage 0 safeguards.
- Required an isolated data root or deliberate destructive override for import and inventory-rebuild tools.
- Added a read-only integrity checker for quantity, relationship, ID, counter, move, journal, and purchase-total defects.
- Documented that no existing records were automatically repaired or migrated.

## 1.10.1 - 2026-07-17

Changed by: Jason

- Removed the Full Web View preset from the visible `/mobile/` preview page.
- Set `/mobile/` to default to the iPhone 16 Pro viewport on page load.
- Updated README and smoke-test coverage for the visible mobile preview behavior.

## 1.10.0 - 2026-07-16

Changed by: Jason

- Added a visible Mobile link in the lower-left sidebar between Log out and project revision metadata.
- Added `/mobile/` as a Matt-visible viewport preview page with full web, phone, and tablet presets.
- Kept Jason-only `/j/` links separate from the visible Mobile preview page.
- Reduced the left sidebar width to 165px to give the dashboard more usable horizontal space.
- Bumped static asset versions so deployed browsers load the Mobile link and layout updates.

## 1.9.8 - 2026-07-16

Changed by: Jason

- Reduced only the Consumption Totals dashboard number sizes so cost and MSRP values stay inside their cards.
- Prevented Consumption Totals currency values from wrapping after the decimal while leaving the other dashboard metric card numbers unchanged.
- Bumped the CSS asset version so deployed browsers load the Consumption Totals layout fix.

## 1.9.7 - 2026-07-16

Changed by: Jason

- Split the sidebar project modified timestamp into separate Modified, date, and time lines.
- Reduced the sidebar width now that the footer metadata no longer needs a single wide timestamp line.
- Bumped static asset versions so deployed browsers load the sidebar layout update.

## 1.9.6 - 2026-07-16

Changed by: Jason

- Added Jason Tools links back to `/j/` from the hidden Audit, Changelog, and TODO pages.
- Renamed the hidden Todo page label to TODO while keeping the backing file as `TODO.md`.
- Updated `/j/` to default to full web preview mode while retaining mobile and tablet preview presets.
- Bumped static asset versions so deployed browsers load the hidden utility navigation update.

## 1.9.5 - 2026-07-16

Changed by: Jason

- Recursively added `Changed by` attribution to the existing flat-file changelog entries using Git commit author history.
- Added a pre-1.0 historical Git summary for the original React/Vite era covering Matt, Jason, and Copilot-authored work.
- Kept the changelog author convention visible so future entries can consistently distinguish Jason and Matt changes.

## 1.9.4 - 2026-07-16

Changed by: Jason

- Added hidden `/j/` Jason utility page with links to Dashboard, Changelog, Audit, and TODO.md.
- Added an in-page mobile viewport preview with iPhone and iPad presets.
- Added changelog author attribution convention and recent-entry author labels based on Git commit authors.

## 1.9.3 - 2026-07-16

Changed by: Jason

- Merged the latest `main` application updates into `Jason-Bug-Fixes` while preserving Jason-specific branch workflow notes, setup helper documentation, and old reference screenshots.

## 1.9.2 - 2026-07-16

Changed by: Matt

- Allowed empty humidors to be deleted when their only linked records are empty drawers or sections.
- Automatically removes those empty sections with the humidor while retaining deletion protection for current inventory and linked purchase history.

## 1.9.1 - 2026-07-16

Changed by: Matt

- Kept Dashboard inventory totals independent from Collection humidor and drawer filters.
- Fixed Humidor Edit so the form expands inline and permits safe name and detail changes.
- Disabled Humidor Delete when positive inventory is assigned and added matching API-side validation.

## 1.9.0 - 2026-07-16

Changed by: Matt

- Added a Removal History report above Activity with Lifetime, Current Year, Prior Year, and Custom date filters.
- Added All Removals, Smoked, and Gifted type filters plus cigar, location, notes, and lot search.
- Added filtered removal counts, total cost, MSRP, savings, per-cigar averages, quantity included, and matching event details.
- Preserved the existing Activity history directly below the new report and added responsive report controls for mobile use.

## 1.8.3 - 2026-07-16

Changed by: Matt

- Removed the sidebar's Flat-file collection manager tagline.
- Simplified Consumption Totals by removing redundant section labels, count badge, and monetary helper text.
- Renamed the event quantity helper labels to Smoked and Gifted and removed the redundant Humidors eyebrow.

## 1.8.2 - 2026-07-16

Changed by: Matt

- Reorganized lifetime smoked and gifted metrics with a tall quantity card, Cost above Avg Cost, and MSRP above Avg MSRP.
- Added responsive behavior that preserves the paired metric layout on tablets and stacks it cleanly on phones.

## 1.8.1 - 2026-07-16

Changed by: Matt

- Moved Update Purchase Status above purchased cigar details and defaulted the Edit / Receive status selection to Received.
- Simplified the Dashboard top summary by removing redundant Humidors and Lifetime Smoked cards and moving On Hand / En Route into the first position.
- Added average cost and average MSRP metrics for both lifetime smoked and gifted events.
- Replaced the inherited purple lightning favicon with a warm HumidorHQ cigar icon.

## 1.8.0 - 2026-07-16

Changed by: Matt

- Reworked Purchases around a compact summary header with total orders, total cigars, lifetime paid, and en route cigar counts.
- Made the new purchase order builder open only from `+ Add Purchase` and removed the redundant Pending status input.
- Moved purchased cigar details into expandable purchase records while preserving edit, receive, and location assignment actions for en route orders.
- Removed the separate Purchased Cigars panel and tightened the calculated total and Add Cigar layout.

## 1.7.2 - 2026-07-16

Changed by: Matt

- Added `tools/import-rich-workbook.ps1` to import the HumidorHQ rich Excel workbook into the local flat-file JSON model.
- Imported the provided local workbook into catalog, vendors, humidors, purchases, purchase lots, and on-hand balances for local verification.
- Added a safe fallback that places lots into `Imported Inventory / General` when the workbook has no populated Current Inventory sheet yet.

## 1.7.1 - 2026-07-16

Changed by: Matt

- Moved the Dashboard humidor summary card to the first position and reordered the remaining cards so average cost and average MSRP line up beneath cost basis and MSRP value.
- Removed the redundant Dashboard collection value panel and added lifetime gifted quantity, cost, and MSRP metrics beside the smoked totals.
- Removed the visible section-count column from the Humidors management table and the humidor summary table on the Dashboard.
- Added a Collection-page partial-lot move form so inventory can be split between humidors or drawers while preserving lot-level cost, MSRP, and event history.

## 1.7.0 - 2026-07-16

Changed by: Matt

- Reworked the Dashboard to show on-hand cigars, current cost basis, current MSRP value, savings, average on-hand cost, average on-hand MSRP, lifetime smoked totals, and a humidor summary with oldest dates.
- Replaced the Collection JSON-file list with an actual on-hand cigar view sortable by alphabetical order or humidor location.
- Expanded Purchases so users can manage purchased cigar lines inline and automatically allocate shipping, excise tax, sales tax, and discount across lines by weighted purchase price.
- Expanded Humidors so users can manage drawers and sections inline while seeing each humidor's current count and oldest inventory date.
- Synced purchase-line edits and deletes to lots, lot balances, and purchase-receipt inventory events, including cost and MSRP snapshots used by current-value and lifetime metrics.
- Updated the local server script to find winget-installed PHP even before the terminal PATH refreshes.

## 1.6.9 - 2026-07-16

Changed by: Jason

- Added `setup-codex-profile.ps1` to save and reuse the HumidorHQ project path in PowerShell.
- Fixed the incomplete profile setup flow with path validation, profile creation, existing variable replacement, and Codex launch handling.

## 1.6.8 - 2026-07-16

Changed by: Jason

- Updated shared Codex instructions to keep Jason work on `Jason-Bug-Fixes` by default.
- Removed automatic merge and branch fast-forward expectations unless explicitly requested.

## 1.6.7 - 2026-07-16

Changed by: Jason

- Fixed Catalog and related pages failing when read-only internal collections were loaded for quantity calculations.
- Added read-only API access for lots, location balances, and inventory events while keeping writes blocked.
- Cleared stale page errors during navigation so one failed request does not affect every tab.

## 1.6.6 - 2026-07-16

Changed by: Jason

- Removed temporary repository probe files `do-you-see-me.txt` and `test.txt`.
- Updated active branches from `main` after cleanup.

## 1.6.5 - 2026-07-16

Changed by: Jason

- Moved signed-in user and logout controls to the lower-left sidebar with project revision metadata.
- Bumped static asset versions for the sidebar account layout update.

## 1.6.4 - 2026-07-16

Changed by: Jason

- Removed visible Purchase Lines and PO Lines rows from the Dashboard while keeping internal records available.
- Made Dashboard inventory and purchase pipeline rows navigate to their related pages.
- Added hash-based page routing so browser refresh stays on the active page.
- Expanded README with user-facing HumidorHQ page functions and added README-update guidance to AGENTS.md.

## 1.6.3 - 2026-07-16

Changed by: Jason

- Added one-time per-computer Codex skills, plugins, and tools check guidance to `AGENTS.md`.
- Added ignored `.codex-local/tool-check.json` marker path with a tracked placeholder.

## 1.6.2 - 2026-07-16

Changed by: Jason

- Updated `AGENTS.md` so Matt/Jason overlap is prompted once per Codex session and remembered unless the situation changes.

## 1.6.1 - 2026-07-16

Changed by: Jason

- Added repo-level `AGENTS.md` so Jason and Matt share HumidorHQ Codex working rules.
- Documented Matt-specific quiet mode guidance for his personal `~/.codex/AGENTS.md`.

## 1.6.0 - 2026-07-16

Changed by: Jason

- Hid PO Lines, Audit, Changelog, and Todo from the left menu while keeping their pages and endpoints available.
- Added purchase status tracking for in-route, partially received, and received orders with expected date and tracking number fields.
- Added Humidor Sections for drawers, shelves, trays, and other sub-locations inside a humidor.
- Bumped JavaScript asset version so deployed browsers load the purchase and humidor workflow update.

## 1.5.7 - 2026-07-15

Changed by: Jason

- Added purchased quantity totals to Purchases by summing linked PO Lines.
- Added Catalog quantity columns for purchased and on-hand counts from linked PO Lines, lots, and location balances.
- Bumped JavaScript asset version so deployed browsers load the quantity display update.

## 1.5.6 - 2026-07-15

Changed by: Jason

- Removed the top-left technology label and top-right API status pill from the page header.
- Bumped the JavaScript asset version so deployed browsers load the header cleanup.

## 1.5.5 - 2026-07-15

Changed by: Jason

- Removed the Dashboard Data Health widget from the screenshot-style dashboard layout.
- Bumped CSS and JavaScript asset versions so deployed browsers load the Dashboard widget removal.

## 1.5.4 - 2026-07-15

Changed by: Jason

- Reworked the Dashboard into a screenshot-style operational layout with summary cards, inventory map, pipeline, quick actions, and data health panels.
- Bumped CSS and JavaScript asset versions so deployed browsers load the Dashboard visual update.

## 1.5.3 - 2026-07-15

Changed by: Jason

- Restyled the flat-file app to match the warm dark brown screenshot palette and denser layout.
- Bumped the CSS asset version so deployed browsers load the visual update.

## 1.5.2 - 2026-07-15

Changed by: Jason

- Added a protected Todo menu page that renders `TODO.md` through the PHP API.
- Added `/api/todo` and smoke-test coverage for the todo page content.
- Bumped the app JavaScript asset version so browsers load the Todo menu update.

## 1.5.1 - 2026-07-15

Changed by: Jason

- Added `TODO.md` to track future development items.
- Added smoked-cigar rating and comments as the first backlog item for future buying assistance.

## 1.5.0 - 2026-07-15

Changed by: Jason

- Added PO Lines as a connected record workflow linking purchases, catalog cigars, and humidors.
- Creating a purchase line now creates the related lot, starting lot-location balance, and purchase-receipt inventory event.
- Added validation so purchase lines cannot reference missing purchases, catalog cigars, or humidors.

## 1.4.3 - 2026-07-15

Changed by: Jason

- Changed audit date-time values to display in Eastern Time as `YYYY-MM-DD HH:mm:ss ET`.
- Converted older UTC `Z` audit timestamps to Eastern Time when audit records are read without rewriting the runtime audit file.

## 1.4.2 - 2026-07-15

Changed by: Jason

- Moved add/edit forms below the current records tables on Catalog, Vendors, Purchases, and Humidors pages.
- Bumped static asset query strings so deployed browsers load the reordered management screens.

## 1.4.1 - 2026-07-15

Changed by: Jason

- Added version query strings to the flat CSS and JavaScript asset URLs so Hostinger and browser caches load the current deployed files.

## 1.4.0 - 2026-07-15

Changed by: Jason

- Added authenticated CRUD routes for managed JSON records under `/api/records/{collection}`.
- Added purpose-built add/edit/delete screens for Catalog, Vendors, Humidors, and purchase headers.
- Added a Vendors navigation item so vendor records can be managed directly.
- Expanded the smoke test to verify CRUD API create, list, update, and delete behavior while restoring touched JSON files.

## 1.3.3 - 2026-07-15

Changed by: Jason

- Fixed the sidebar project metadata so the bottom-left revision and modified timestamp refresh after /api/app-meta loads.
- Expanded the smoke test to verify the main JavaScript render path updates project metadata.

## 1.3.2 - 2026-07-15

Changed by: Jason

- Added metadata headers with filename, revision, description, and modified date-time to tracked non-JSON project files.
- Excluded JSON data files from comment headers because comments would make them invalid JSON or change runtime data shape.
- Expanded the smoke test to verify metadata headers on tracked non-JSON files.

## 1.3.1 - 2026-07-15

Changed by: Jason

- Added the project revision and Eastern Time modified timestamp to the bottom-left sidebar.
- Added public `/api/app-meta` metadata for the flat JavaScript app.
- Expanded the smoke test to verify app metadata revision format and ET timestamp labeling.

## 1.3.0 - 2026-07-15

Changed by: Jason

- Added append-only JSONL audit logging for user activity by date-time, user, page, and action.
- Added protected `/api/audit`, `/api/audit/page`, and `/api/changelog` routes.
- Added Audit and Changelog links to the left menu.
- Added `data/audit-log.jsonl.placeholder` and ignored the live `data/audit-log.jsonl` runtime file.
- Expanded the smoke test to verify audit records and changelog access.

## 1.2.2 - 2026-07-15

Changed by: Jason

- Updated `.gitignore` for the current flat PHP/JSON/static project scope.
- Removed stale Node/Vite/Prisma-specific ignore rules from the active ignore list.
- Added runtime ignores for protected auth credentials and generated JSON lock/temp files while keeping placeholders trackable.

## 1.2.1 - 2026-07-15

Changed by: Jason

- Replaced queued page placeholder text with JSON-backed summary views for Catalog, Purchases, Humidors, and Reports.
- Added `data/auth-users.json.placeholder` to document the ignored runtime credential file.
- Expanded the flat-file smoke test to reject stale queued page text and verify the auth placeholder exists.

## 1.2.0 - 2026-07-15

Changed by: Jason

- Added PHP session authentication with `/api/session`, `/api/login`, and `/api/logout` routes.
- Protected JSON-backed data routes from anonymous access.
- Added plain JavaScript login and logout UI.
- Added `tools/create-auth-user.php` to generate ignored hashed credentials in `data/auth-users.json`.
- Added `data/auth-users.example.json` to document the protected credential file shape.
- Expanded `tests/flat-file-smoke.ps1` to verify login, protected access, sample-data access after login, and logout.

## 1.1.0 - 2026-07-15

Changed by: Jason

- Replaced the React/TypeScript/Vite browser entry with flat `index.html`, `public/assets/js/app.js`, and `public/assets/css/app.css`.
- Added `GET /api/sample-data` to summarize repo JSON data files through PHP.
- Added `tests/flat-file-smoke.ps1` to verify the no-build app shell, PHP API health, sample-data endpoint, and absence of tracked compile/runtime files.
- Removed tracked React, TypeScript, Vite, Node package, and Prisma runtime files from the deployable repo.

## 1.0.0 - 2026-07-15

Changed by: Jason

- Established the flat-file HumidorHQ target: PHP, JSON, plain JavaScript, HTML, and CSS.
- Documented that TypeScript, React, Vite, Node server runtime, and Prisma runtime are being removed from the final hosted app.
- Documented that repo `data/*.json` files serve as sample/runtime data through the PHP API.
- Added README deployment guidance for GitHub-to-Hostinger hosting with no compile step.

## Pre-1.0 Historical Git History - 2026-07-05 to 2026-07-14

Changed by: Matt, Jason, and Copilot

- Matt created the original React/Vite project foundation, database design, Prisma setup, humidor management, catalog management, purchase workflows, collection browsing, dashboard reports, removal history, activity history, and smoking journal workflows.
- Jason created the PHP/JSON migration branch baseline, smoking journal conversion foundation, branch test files, and later flat-file migration direction that became the 1.0.0+ changelog stream.
- Copilot contributed an intermediate PHP/JSON conversion pass with PWA support, deployment notes, htaccess data protection clarification, promise-handling fixes, and code-review fixes before the current flat-file implementation path continued.

