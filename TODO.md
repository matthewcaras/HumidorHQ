<!--
Filename: TODO.md
Revision: 1.5.0
Description: Future development backlog for HumidorHQ.
Modified Date: 2026-07-18 1:30 AM ET
-->

# TODO

Future development items for HumidorHQ.

## Future Development

1. Add a dedicated inventory correction and reversal workflow.
   - Keep received purchase lines immutable until corrections can create explicit adjustment history.
   - Correct receipt quantity, cigar, date, and storage relationships without deleting Lots, balances, InventoryEvents, or Smoking Journal entries.
   - Add archive/restore workflows for linked Catalog, Vendor, Humidor, and section records instead of physical deletion.

2. Continue functional stabilization after transaction-safe persistence.
   - Complete discard/damage, Smoking Journal, archive/restore, and report/history workflow parity.

3. Expand smoked-cigar ratings.
   - When a cigar is marked as smoked, allow the user to rate it from 1-10.
   - Include tasting comments and buying notes for future purchase decisions.
   - Surface prior ratings/comments when viewing catalog cigars, lots, and smoking journal history.
