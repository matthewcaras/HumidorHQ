<!--
Filename: DATA_MODEL.md
Revision: 1.0.0
Description: Project documentation and implementation notes.
Modified Date: 2026-07-15 00:13 ET
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

Catalog records do not store quantity, purchase price, humidor location, or consumption history.

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
- Quantity
- Unit price
- Line subtotal
- MSRP per cigar

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
- Damaged

Events should drive calculated inventory instead of manually maintaining totals.

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

