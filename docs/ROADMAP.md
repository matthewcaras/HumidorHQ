# HumidorHQ Roadmap

HumidorHQ is being built around cigar collecting workflows: Catalog, Purchases, Lots, Humidors, Collection, and Consumption. The roadmap prioritizes a reliable data model first, then import and reporting features once there is enough meaningful history to analyze.

## Current Status

### Foundation - Completed

- React, TypeScript, and Vite frontend is in place.
- Express API is in place.
- Prisma and SQLite are configured.
- Initial navigation and page structure exists for the core workflows.
- Project documentation has started.

### Humidors - In Progress

- Create, edit, list, and archive humidors.
- Track capacity and shelf configuration.
- Prepare humidor data for future lot placement, movement history, and occupancy calculations.

## Next Work

### Catalog - Next

- Model cigars as reusable catalog records.
- Capture manufacturer, series, vitola, size, wrapper, strength, country, MSRP, and notes.
- Search existing catalog records before creating new cigars.
- Keep catalog records separate from owned inventory.

### Purchases and Lots - After Catalog

- Record purchases from vendors with purchase date, quantity, MSRP, actual cost, and notes.
- Create lots from purchases.
- Track lot-level cost basis, age, location, and remaining quantity.
- Preserve complete history through transactions instead of direct inventory edits.

### Core Collection and Consumption

- Calculate collection inventory from lots and transactions.
- Track smoked cigars, gifted or shared cigars, and damaged cigars.
- Support movement between humidors while keeping location history.

### Import Wizard - After Core Data Model

- Import invoices, PDFs, or structured purchase files.
- Match imported cigars against the catalog before creating new records.
- Review and correct matches before saving purchases and lots.

### Dashboard and Reports - After Meaningful Data Exists

- Show cigars on hand, cost basis, MSRP value, savings, and average age.
- Report spending, savings, inventory by humidor, aging, and consumption history.
- Use calculated values from stored facts and transactions.
