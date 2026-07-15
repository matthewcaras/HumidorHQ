<!--
Filename: DESIGN_PRINCIPLES.md
Revision: 1.0.0
Description: Project documentation and implementation notes.
Modified Date: 2026-07-15 00:13 ET
-->

# HumidorHQ Design Principles

HumidorHQ should feel like a practical collection tool, not a spreadsheet with nicer colors. The app should preserve accurate history while reducing the amount of manual entry required from the collector.

## Core Principles

### Enter facts once.

The user should record a fact in one place, then the rest of the system should reuse it. A cigar catalog entry, vendor, humidor, purchase, or lot should not need to be recreated for every workflow.

### Never type the same thing twice.

Search, autocomplete, lookup, import, and sensible defaults should prevent repeated manual entry. When a cigar already exists in the catalog, the user should select it instead of retyping its details.

### Preserve complete history.

Inventory should be derived from purchases, lot changes, movements, consumption, gifts, damage, and adjustments. Historical records should remain available even when inventory reaches zero.

### Let the software calculate everything possible.

Totals, remaining quantity, cost basis, MSRP value, savings, occupancy, average age, and report data should be calculated from stored facts whenever possible.

### Reduce friction.

Common workflows should be quick: add a purchase, place cigars in a humidor, find a cigar, smoke or gift one, and understand the collection at a glance. The interface should ask only for information that is useful now or necessary for future calculations.

### Minimize ongoing maintenance.

HumidorHQ should prioritize information that remains accurate over time. Before adding a manually maintained field, ask whether the collector will realistically keep it current for years. If not, calculate it, automate it, or omit it.

- Track humidor and applicable drawer or shelf because those locations are useful and reasonably stable.
- Do not track exact positions such as front-right or back-left.
- Do not require manually maintained statuses such as New Arrival, Ready to Smoke, or Long-Term Aging.
- Prefer calculations based on purchase dates, received dates, lots, and events.

## Product Direction

- Favor workflow clarity over dense configuration.
- Keep catalog data separate from owned inventory.
- Treat lots as the bridge between purchases, storage, aging, and consumption.
- Prefer transaction history over direct count editing.
- Make imports reviewable before they create permanent records.
- Build reports from real collection history instead of manually maintained summary fields.

Humidor HQ records what happened, not just what exists.

