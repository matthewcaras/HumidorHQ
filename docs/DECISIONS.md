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

## Design Philosophy

Decision:
HumidorHQ follows these principles:

- Enter facts once.
- Never type the same thing twice.
- Preserve complete history.
- Let the software calculate everything possible.
- Reduce friction.

Additional decisions should be documented here whenever they affect the long-term architecture or user experience.
