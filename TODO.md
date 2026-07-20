<!--
Filename: TODO.md
Revision: 1.8.5
Description: Future development backlog for HumidorHQ.
Modified Date: 2026-07-20 09:00 ET
-->

# TODO

Future development items for HumidorHQ.

## Future Development

1. Complete advanced inventory correction coverage.
   - Add a dedicated Catalog-cigar relationship correction after all effective receipts for the affected Lot have been safely reversed.
   - Evaluate partial-event corrections only if a real workflow requires them; current correction intentionally reverses the complete immutable event before replacement.
   - Add a guarded found-inventory workflow only if physical counting reveals cigars with no existing positive Lot/location balance; current count reconciliation intentionally requires established provenance.

2. Define an off-server backup retention schedule after production backup/restore verification.
