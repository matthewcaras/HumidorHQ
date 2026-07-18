<!--
Filename: TODO.md
Revision: 1.7.0
Description: Future development backlog for HumidorHQ.
Modified Date: 2026-07-18 10:00 AM ET
-->

# TODO

Future development items for HumidorHQ.

## Future Development

1. Add a dedicated inventory correction and reversal workflow.
   - Keep received purchase lines immutable until corrections can create explicit adjustment history.
   - Correct receipt quantity, cigar, date, and storage relationships without deleting Lots, balances, InventoryEvents, or Smoking Journal entries.

2. Continue functional stabilization after transaction-safe persistence.
   - Complete remaining report/history workflow parity.

3. Expand smoked-cigar journal visibility.
   - Surface prior ratings/comments when viewing catalog cigars, lots, and smoking journal history.
