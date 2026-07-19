<!--
Filename: TODO.md
Revision: 1.8.2
Description: Future development backlog for HumidorHQ.
Modified Date: 2026-07-19 16:00 ET
-->

# TODO

Future development items for HumidorHQ.

## Future Development

1. Complete advanced inventory correction coverage.
   - Add a dedicated Catalog-cigar relationship correction after all effective receipts for the affected Lot have been safely reversed.
   - Evaluate partial-event corrections only if a real workflow requires them; current correction intentionally reverses the complete immutable event before replacement.

2. Continue functional stabilization after transaction-safe persistence.
   - Complete remaining report/history workflow parity beyond Vendor/manufacturer purchase history.

3. Expand smoked-cigar journal visibility.
   - Surface prior ratings/comments when viewing catalog cigars, lots, and smoking journal history.

4. Define an off-server backup retention schedule after production backup/restore verification.
