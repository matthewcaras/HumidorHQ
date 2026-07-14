# PHP/JSON Conversion Change Log

## Entry Template
- Date:
- Upstream ref:
- Changed upstream files:
- Reviewed PHP files:
- Parity gaps:

## Initial Entry
- Date: 2026-07-13
- Upstream ref: `upstream/main@f065979`
- Changed upstream files: initial baseline before Smoking Journal merge
- Reviewed PHP files: none yet
- Parity gaps: full conversion pending

## Upstream Smoking Journal Update
- Date: 2026-07-14
- Upstream ref: `upstream/main@37df9a0`
- Changed upstream files: `docs/DATA_MODEL.md`, `docs/DECISIONS.md`, `prisma/migrations/20260713232934_add_smoking_journal/migration.sql`, `prisma/schema.prisma`, `server/index.ts`, `server/services/smokingJournalService.ts`, `src/App.css`, `src/components/collection/CollectionDetailsPanels.tsx`, `src/components/collection/RemoveLotPanel.tsx`, `src/components/journal/SmokingJournalPanel.tsx`, `src/pages/Collection.tsx`, `src/pages/Humidors.tsx`, `src/services/api.ts`
- Reviewed PHP files: none yet; PHP/JSON implementation still pending
- Parity gaps: add `data/smoking-journal-entries.json`, add `api/lib/services/SmokingJournalService.php`, add routes for `GET|PUT|DELETE /api/inventory-events/:inventoryEventId/smoking-journal`, update export tooling for `SmokingJournalEntry`, and verify remove-smoked flow still returns the event context needed by the journal panel
