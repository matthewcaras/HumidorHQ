-- CreateTable
CREATE TABLE "SmokingJournalEntry" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "inventoryEventId" INTEGER NOT NULL,
    "rating" INTEGER NOT NULL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CHECK ("rating" BETWEEN 1 AND 10),
    CONSTRAINT "SmokingJournalEntry_inventoryEventId_fkey" FOREIGN KEY ("inventoryEventId") REFERENCES "InventoryEvent" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "SmokingJournalEntry_inventoryEventId_key" ON "SmokingJournalEntry"("inventoryEventId");

-- CreateIndex
CREATE INDEX "SmokingJournalEntry_rating_idx" ON "SmokingJournalEntry"("rating");

-- CreateIndex
CREATE INDEX "SmokingJournalEntry_updatedAt_idx" ON "SmokingJournalEntry"("updatedAt");
