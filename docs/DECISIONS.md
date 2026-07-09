# HumidorHQ Project Decisions

This document records important architectural and product decisions made during development. It explains why a decision was made so it does not need to be rediscovered later.

## Catalog and Collection

Decision:
Catalog records are separate from owned inventory.

Reason:
A cigar should only be described once. Purchases, lots, and inventory should reference catalog records instead of duplicating cigar information.

---

## Humidors

Decision:
Archiving a humidor is only available from the Edit dialog.

Reason:
This keeps the Humidors table clean and reduces accidental archiving.

---

## Inventory Model

Decision:
Inventory will be derived from purchases, lots, and events rather than manually maintained totals.

Reason:
This preserves complete history and makes calculations reliable.

---

## Consumption

Decision:
Version 1 supports:
- Smoked
- Gifted / Shared
- Damaged

Trading and loss tracking are intentionally out of scope.

Reason:
The application is optimized around the owner's collecting workflow.

---

## Primary User Workflow

1. Dashboard
   - Landing page.
   - Provides collection statistics, recent activity, aging information, and items requiring attention.

2. Collection
   - The primary screen of the application.
   - Shows cigars currently owned.
   - Organized by Manufacturer -> Series -> Vitola.
   - Displays current quantities, lots, age, humidor location, cost basis, MSRP value, and related collection information.
   - Users should spend most of their time here.

3. Purchases
   - Primary data-entry workflow.
   - New purchases create inventory.
   - Purchase entry should always search the Catalog first.
   - If a catalog record exists, reuse it.
   - If not, allow creation of a new Catalog record during purchase entry.
   - The user should rarely need to open the Catalog directly.

4. Consumption
   - Records cigars that have been smoked, gifted, or otherwise removed from inventory.
   - Drives inventory changes through events.

5. Humidors
   - Administrative management of storage locations.
   - Used occasionally.

6. Catalog
   - Supporting reference data.
   - Stores immutable cigar information.
   - Primarily maintained automatically through Purchases.
   - Manual editing should be infrequent.
   - Catalog exists to prevent duplicate cigar definitions and support search, imports, and reporting.

7. Reports
   - Collection analytics and historical reporting.

8. Settings
   - Application configuration.

---

## Navigation Philosophy

Decision:
Navigation order reflects expected frequency of use rather than alphabetical order.

Reason:
Dashboard, Collection, and Purchases are intentionally placed first because they represent the primary workflow of the application. Catalog is intentionally near the bottom because it supports the workflow rather than driving it.

---

## Design Philosophy

Decision:
HumidorHQ follows these principles:

- Enter facts once.
- Never type the same thing twice.
- Preserve complete history.
- Let the software calculate everything possible.
- Reduce friction.

Additional decisions should be documented here whenever they affect the long-term architecture or user experience.
