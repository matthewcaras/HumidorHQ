<!--
Filename: DATA_MODEL.md
Revision: 1.4.0
Description: Project documentation and implementation notes.
Modified Date: 2026-07-19 18:00 ET
-->

# HumidorHQ Data Model

## Core Philosophy

HumidorHQ records what happened, not just what exists.

The user enters facts once. The application calculates derived values such as current count, cost basis, MSRP value, savings, occupancy, average age, and consumption totals.

## Catalog

Catalog records describe what a cigar is.

Catalog fields for Version 1:
- Manufacturer
- Series
- Vitola
- Shape
- Length
- Ring Gauge
- Wrapper
- Binder
- Filler
- Country
- Strength
- MSRP
- Buy Again status: `Yes`, `Maybe`, `No`, or an omitted/null value meaning `Not Evaluated`
- Optional Buy Again decision notes

Catalog records do not store quantity, purchase price, humidor location, or consumption history.
Buy Again is Catalog-level metadata so one decision follows the cigar across Lots and purchases. It can be edited from Catalog or saved together with a Smoking Journal entry. A Journal save that includes a Buy Again decision updates the Journal and Catalog inside the same runtime-data transaction.

## Purchases

A purchase represents a buying transaction from a vendor.

Purchase fields may include:
- Vendor
- Purchase date
- Received date
- Invoice number
- Shipping
- Excise tax
- Sales tax
- Discount
- Total paid

A purchase can have multiple purchase lines.

## Purchase Lines

Each purchase line references one catalog cigar.

Purchase line fields may include:
- Catalog cigar
- Ordered quantity
- Received quantity cache, reconciled to purchase-receipt events
- First, latest, and completion receipt dates
- Unit price
- Line subtotal
- MSRP per cigar

Each accepted receipt creates one immutable purchase-receipt event. A required idempotency key makes an exact request retry return the original event and prevents duplicate quantity, Lot, balance, counter, or audit changes. Multiple receipts for one line accumulate into the line's single Lot and may create or increment different exact location balances.

Shipping, excise tax, sales tax, and discounts should be allocated across purchase lines based on each line's share of the purchase subtotal.

Example:
If Line A is 75% of the subtotal and Line B is 25%, Line A receives 75% of allocated costs and Line B receives 25%.

True line cost basis =
line subtotal
+ allocated shipping
+ allocated excise tax
+ allocated sales tax
- allocated discount

True cost per cigar =
true line cost basis / quantity

## Lots

A lot represents a specific batch of cigars created from a purchase line.

Lots preserve:
- Purchase source
- Quantity purchased
- True cost per cigar
- MSRP per cigar
- Purchase date
- Received date
- Aging goal
- Current quantity, calculated from events

Lots can be split across humidors while retaining a link to the original purchase line.

## Events

Events record what happens to cigars over time.

Initial event types:
- Move
- Consumption
- Adjustment

Consumption reasons:
- Smoked
- Gifted / Shared
- Discarded

Events should drive calculated inventory instead of manually maintaining totals.

Physical count corrections use `INVENTORY_ADJUSTMENT` events. Each event stores a positive absolute `quantity`, signed `quantityChange`, `INCREASE` or `DECREASE` direction, exact balance quantity before and after the count, Humidor/section, count date, required reason, idempotency key, and immutable cost/MSRP snapshots. The balance and Lot cache change in the same serialized transaction. A stale expected balance or a count with no variance is rejected before mutation.

Corrections are append-only. A `REVERSAL` InventoryEvent references exactly one prior purchase receipt, move, smoke, gift, discard, or inventory adjustment through `reversesInventoryEventId`. The original event remains immutable. Effective receipt, removal, and adjustment calculations exclude an event after one valid reversal, while Activity History retains both records. A reversal copies the target cost/MSRP snapshots, reverses the complete target quantity, and never deletes a Lot or Smoking Journal entry. Incorrect receipts are corrected by reversing the receipt and entering replacement receipt facts through Receive and Store.

## Smoking Journal

Smoking Journal entries are optional one-to-one details for Smoked inventory events.

InventoryEvent remains authoritative for:
- Whether a cigar was smoked
- Quantity smoked
- Date Smoked
- Lot
- Source humidor or section
- Cost and MSRP snapshots
- Inventory reduction
- Recorded timestamp

SmokingJournalEntry stores only:
- Rating, as a whole number from 1 to 10
- Optional journal notes
- Created and updated timestamps

The Smoking Journal form can also update the linked Catalog cigar's Buy Again status and decision notes. Those fields remain on the Catalog record and are not duplicated in `smoking-journal-entries.json`.

Date Smoked is not duplicated in the Journal table. Journal notes are separate from InventoryEvent removal notes. Deleting Journal details does not restore inventory or delete the underlying Smoked event.

Version 1 does not include pairing, images, photos, uploads, or image storage.

## Humidors and Drawers

A humidor is a storage container.

Some humidors may have drawers. Drawers are optional.

For Version 1:
- Tupperdores may have no drawers.
- The main humidor may have four drawers.
- Lots may be assigned to a humidor and optionally a drawer.

Future reports can calculate:
- Current count by humidor
- Occupancy
- Oldest lot
- Average age
- Cost basis by humidor
- MSRP value by humidor

## Derived Values

The application should calculate:
- Cigars on hand
- Cost basis
- MSRP value
- Savings
- Average age
- Occupancy
- Oldest lot
- Consumption totals
- Cost consumed
- MSRP consumed

