-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_InventoryEvent" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "lotId" INTEGER NOT NULL,
    "eventType" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL CHECK ("quantity" > 0),
    "eventDate" DATETIME NOT NULL,
    "notes" TEXT,
    "fromStorageSubLocationId" INTEGER,
    "toStorageSubLocationId" INTEGER,
    "costPerCigarAtEvent" DECIMAL CHECK ("costPerCigarAtEvent" IS NULL OR "costPerCigarAtEvent" >= 0),
    "msrpPerCigarAtEvent" DECIMAL CHECK ("msrpPerCigarAtEvent" IS NULL OR "msrpPerCigarAtEvent" >= 0),
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- Event validation constraints
    CHECK (
        "fromStorageSubLocationId" IS NULL
        OR "toStorageSubLocationId" IS NULL
        OR "fromStorageSubLocationId" <> "toStorageSubLocationId"
    ),
    CONSTRAINT "InventoryEvent_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "Lot" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "InventoryEvent_fromStorageSubLocationId_fkey" FOREIGN KEY ("fromStorageSubLocationId") REFERENCES "StorageSubLocation" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "InventoryEvent_toStorageSubLocationId_fkey" FOREIGN KEY ("toStorageSubLocationId") REFERENCES "StorageSubLocation" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_InventoryEvent" ("costPerCigarAtEvent", "createdAt", "eventDate", "eventType", "id", "lotId", "msrpPerCigarAtEvent", "notes", "quantity") SELECT "costPerCigarAtEvent", "createdAt", "eventDate", "eventType", "id", "lotId", "msrpPerCigarAtEvent", "notes", "quantity" FROM "InventoryEvent";
DROP TABLE "InventoryEvent";
ALTER TABLE "new_InventoryEvent" RENAME TO "InventoryEvent";
-- One initial placement per lot
CREATE UNIQUE INDEX "InventoryEvent_one_initial_placement_per_lot"
ON "InventoryEvent"("lotId")
WHERE "eventType" = 'INITIAL_PLACEMENT';
CREATE INDEX "InventoryEvent_fromStorageSubLocationId_idx" ON "InventoryEvent"("fromStorageSubLocationId");
CREATE INDEX "InventoryEvent_toStorageSubLocationId_idx" ON "InventoryEvent"("toStorageSubLocationId");
CREATE INDEX "InventoryEvent_eventType_eventDate_idx" ON "InventoryEvent"("eventType", "eventDate");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
