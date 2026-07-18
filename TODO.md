<!--
Filename: TODO.md
Revision: 1.6.0
Description: Future development backlog for HumidorHQ.
Modified Date: 2026-07-18 9:30 AM ET
-->

# TODO

Future development items for HumidorHQ.

## Future Development

1. Add a dedicated inventory correction and reversal workflow.
   - Keep received purchase lines immutable until corrections can create explicit adjustment history.
   - Correct receipt quantity, cigar, date, and storage relationships without deleting Lots, balances, InventoryEvents, or Smoking Journal entries.
   - Add archive/restore workflows for linked Catalog, Vendor, Humidor, and section records instead of physical deletion.

2. Continue functional stabilization after transaction-safe persistence.
   - Complete archive/restore and remaining report/history workflow parity.

3. Expand smoked-cigar journal visibility.
   - Surface prior ratings/comments when viewing catalog cigars, lots, and smoking journal history.
