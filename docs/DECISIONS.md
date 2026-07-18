<!--
Filename: DECISIONS.md
Revision: 1.2.0
Description: Project documentation and implementation notes.
Modified Date: 2026-07-18 11:00 AM ET
-->

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

Correction decision:
Inventory mistakes are corrected with one full, append-only reversal of the immutable event. Reversal is allowed only when its physical quantity can be reconciled safely, and corrected receipt facts are then entered through the normal idempotent receiving workflow. Original events, snapshots, and Smoking Journal history remain available.

---

## Purchase Lifecycle and Inferred Status

Decision:
HumidorHQ will not require the user to manually maintain normal purchase statuses. Operational status will be inferred from existing data.

- En Route means the purchase or lot has no receivedDate.
- Received means receivedDate exists but no initial placement has been recorded.
- Stored means the lot has a positive current location balance.
- "Received, Not Stored" is a valid temporary state but does not need a prominent dashboard card because cigars will normally be stored the same day they arrive.
- Historical purchases may include both the actual purchase date and actual received date.
- Accurate historical dates should drive aging calculations.
- Administrative statuses such as Draft or Cancelled may be stored explicitly later if needed.

Reason:
This follows the principle of minimizing ongoing maintenance by deriving state rather than asking the user to update another field.

---

## Line-Level Receiving and Storage

Decision:
Receiving and storage are tracked at the purchase-line level.

- One purchase may contain multiple purchase lines that arrive on different dates.
- receivedDate belongs to PurchaseLine rather than only to the purchase header.
- Each PurchaseLine creates one Lot.
- The Lot preserves the PurchaseLine received date as its received-date snapshot.
- Each line may be received and stored independently from the other lines in the same purchase.
- Different lines from the same purchase may be assigned to different humidors, drawers, or shelves.
- Receiving and storing one line does not affect the en-route state of other lines.
- A purchase's overall operational state is derived from its lines:
  - En Route: no lines have been received.
  - Partially Received: some but not all lines have received dates.
  - Received: all lines have received dates.
  - Fully Stored: all lots have positive location balances.
- These operational states are inferred and are not manually maintained.
- The UI should eventually allow a received date to be applied to all lines when the entire order arrives together.
- The Receive and Store workflow records each accepted quantity, date, and exact location atomically; it creates or updates the line's single Lot, exact balance, and immutable purchase-receipt event.
- Every receipt request requires an idempotency key. An exact retry returns the original event without another mutation; conflicting reuse is rejected.
- Receipt events are authoritative for received quantity. Purchase and line received-quantity/date fields are derived caches and are updated in the same transaction.
- This design supports split shipments without requiring a separate shipment model in Version 1.

Reason:
Line-level receiving supports split shipments while preserving the principle that operational state should be derived from facts already recorded.

---

## Collection Views and Location Search

Decision:
Collection is one dataset with multiple views, not separate collections.

- The default view is By Cigar: Manufacturer -> Series -> Vitola.
- A By Humidor view allows the user to open a humidor and see its contents, organized by drawer or shelf when applicable.
- A future By Age view may be added.
- Global collection search should locate a cigar and show every humidor and drawer or shelf where it is stored.
- Exact positions within a drawer or shelf will not be tracked.
- Cigar Details will provide the "baseball card" experience, including current quantity, lots, locations, purchase history, first and last purchase, average cost, MSRP, age, vendor history, and consumption history as data becomes available.
- Users may move a selected quantity from one humidor/drawer/shelf to another.
- A move creates an inventory event and preserves location history.
- Vendor-based browsing belongs in Reports rather than the primary Collection toolbar.

Reason:
The Collection screen should support the main ways a collector thinks about owned cigars while avoiding manually maintained location detail that will become stale.

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

## Desktop and Mobile Workflow Strategy

Decision:
HumidorHQ is one responsive web application used on both computers and iPhones.

- A separate mobile application is not required.
- The application will eventually support installation on the iPhone Home Screen as a Progressive Web App.
- Desktop and mobile use the same API, database, business rules, and historical records.

Desktop-primary workflows:

- Entering current and historical purchases.
- Managing purchases with multiple lines.
- Reviewing weighted cost allocations.
- Catalog maintenance and duplicate merging.
- Vendor administration.
- Reports, analytics, and other detailed administrative tasks.

iPhone-primary workflows:

- Receiving and storing a purchase line.
- Searching for a cigar and locating its humidor, drawer, or shelf.
- Moving selected quantities between locations.
- Recording cigars as smoked, gifted/shared, or damaged.
- Browsing Collection and Humidor contents.
- Opening Cigar Details.

Interface principles:

- Purchase entry may use desktop-friendly tables and multi-column forms, but it must remain usable on a phone.
- Collection, Search, Receive and Store, Move, and Consumption workflows should be designed mobile-first.
- Mobile actions should use large touch targets, minimal typing, and short full-screen or near-full-screen workflows.
- Essential actions must not depend on mouse hover.
- Desktop may use persistent sidebar navigation.
- Mobile may eventually use compact navigation or bottom navigation.
- Responsive presentation may use tables on desktop and cards or compact layouts on mobile.
- Device-specific presentation must not create separate or inconsistent data workflows.

Reason:
This strategy reflects actual expected usage: purchases will primarily be entered on a computer, while receiving, moving, searching, and consuming cigars will primarily occur on an iPhone near the physical humidors.

---

## Catalog Attribute Suggestions

Decision:
Catalog creation fields should increasingly suggest existing values as the Catalog grows.

- Suggestions should reduce duplicate spellings and improve filtering and reporting.
- Most fields should use editable autocomplete rather than strict dropdowns.
- The user may select an existing value or enter a legitimate new value.

Field behavior:

- Manufacturer:
  - Autocomplete from existing manufacturers.
  - Use normalized matching so punctuation and capitalization differences do not create duplicate identities.

- Series:
  - Suggest existing series values.
  - Filter suggestions by the selected manufacturer when possible.

- Vitola:
  - Suggest existing vitolas.
  - Filter suggestions by selected manufacturer and series when possible.
  - Allow entry of a new vitola.

- Shape:
  - Suggest standardized values such as Robusto, Toro, Churchill, Gordo, Perfecto, Torpedo, Lancero, and similar shapes.
  - Allow new values when needed.

- Wrapper:
  - Autocomplete from wrapper values already used in the Catalog.
  - Preserve canonical display capitalization and punctuation.

- Strength:
  - Use a controlled selection such as Mild, Mild-Medium, Medium, Medium-Full, and Full.

- Length and Ring Gauge:
  - Remain numeric inputs.
  - May offer common-value suggestions but must not restrict unusual sizes.

- Binder, Filler, and Country:
  - May use editable autocomplete from existing Catalog values when those fields are exposed.

Principle:
Reuse known values whenever possible without preventing entry of legitimate new cigar attributes.

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

### Smoking Journal Version 1

Decision:
Smoking Journal entries are optional one-to-one details attached only to SMOKED InventoryEvent rows.

- InventoryEvent remains authoritative for Date Smoked, quantity, Lot, source location, cost and MSRP snapshots, inventory reduction, and recorded timestamp.
- SmokingJournalEntry stores only rating, optional journal notes, createdAt, and updatedAt.
- Rating uses a required 1-10 whole-number scale once a Journal entry exists.
- Journal notes are separate from InventoryEvent removal notes.
- Deleting Journal details deletes only SmokingJournalEntry and does not restore inventory.
- Version 1 does not include pairing, images, photos, uploads, or image storage.

Reason:
The Journal adds optional experiential notes without duplicating or weakening the inventory event ledger.

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

