<!--
Filename: CHANGELOG.md
Revision: 1.12.2
Description: Project documentation and implementation notes.
Modified Date: 2026-07-17 8:28 AM ET
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

## 1.12.2 - 2026-07-17

Changed by: Jason

- Made the private utility keyboard command explicit as `!jnl` so it matches the prefixed shortcut pattern.
- Bumped the JavaScript asset version and smoke-test coverage for the shortcut label.
## 1.12.1 - 2026-07-17

Changed by: Jason

- Cleared keyboard shortcut command buffers when ignored keys are pressed so shortcuts require a consecutive typed sequence.
- Kept the primary navigation landmark as a real sidebar container while preserving the mobile footer layout.
- Hid app navigation chrome until authentication is confirmed.
- Gated utility and mobile preview pages behind the PHP session.
- Added Apache/Hostinger rules to deny direct browser access to raw markdown files while keeping authenticated app views available.
- Updated README, asset versions, and smoke-test coverage for the authentication and review-feedback fixes.

## 1.12.0 - 2026-07-17

Changed by: Jason

- Added prefixed keyboard shortcuts for Dashboard, Collection, Catalog, Vendors, Purchases, Humidors, and Reports.
- Required the `!` prefix so page shortcuts do not trigger from normal page typing.
- Kept shortcut handling disabled while focus is inside form fields or editable content.
- Updated README, asset version, and smoke-test coverage for the keyboard shortcut workflow.

## 1.11.1 - 2026-07-17

Changed by: Jason

- Changed small-screen menu collapse to hide the menu vertically instead of shrinking to the desktop rail.
- Kept the mobile navigation in two columns so it does not consume the full preview height.
- Moved the signed-in account controls and project revision footer below the mobile content area.
- Updated README, asset version, and smoke-test coverage for the mobile menu layout fix.

## 1.11.0 - 2026-07-17

Changed by: Jason

- Added a collapsible main sidebar with saved browser preference.
- Added a collapsible left utility menu on `/j/` with saved browser preference.
- Added the `!jnl` keyboard shortcut from the main app to open `/j/` when not typing in a form field.
- Updated README, asset versions, and smoke-test coverage for the collapsible menus and shortcut.

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
