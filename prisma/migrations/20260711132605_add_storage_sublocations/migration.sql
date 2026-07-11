-- CreateTable
CREATE TABLE "StorageSubLocation" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "storageLocationId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "capacity" INTEGER,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "StorageSubLocation_storageLocationId_fkey" FOREIGN KEY ("storageLocationId") REFERENCES "StorageLocation" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LotLocationBalance" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "lotId" INTEGER NOT NULL,
    "storageSubLocationId" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL CHECK ("quantity" >= 0),
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LotLocationBalance_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "Lot" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "LotLocationBalance_storageSubLocationId_fkey" FOREIGN KEY ("storageSubLocationId") REFERENCES "StorageSubLocation" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_StorageLocation" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "capacity" INTEGER,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "hasShelves" BOOLEAN NOT NULL DEFAULT false,
    "shelfCount" INTEGER,
    "organizationType" TEXT NOT NULL DEFAULT 'GENERAL',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_StorageLocation" ("capacity", "createdAt", "displayOrder", "hasShelves", "id", "isActive", "name", "notes", "shelfCount", "updatedAt") SELECT "capacity", "createdAt", "displayOrder", "hasShelves", "id", "isActive", "name", "notes", "shelfCount", "updatedAt" FROM "StorageLocation";
DROP TABLE "StorageLocation";
ALTER TABLE "new_StorageLocation" RENAME TO "StorageLocation";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- Backfill one General sub-location for each existing storage location.
INSERT INTO "StorageSubLocation" ("storageLocationId", "name", "kind", "capacity", "displayOrder", "isActive", "createdAt", "updatedAt")
SELECT "id", 'General', 'GENERAL', NULL, 0, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "StorageLocation";

-- Backfill current lot balances from existing lot storage assignments.
INSERT INTO "LotLocationBalance" ("lotId", "storageSubLocationId", "quantity", "createdAt", "updatedAt")
SELECT "Lot"."id", "StorageSubLocation"."id", "Lot"."quantityRemaining", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Lot"
INNER JOIN "StorageSubLocation" ON "StorageSubLocation"."storageLocationId" = "Lot"."storageLocationId"
WHERE "Lot"."storageLocationId" IS NOT NULL
  AND "Lot"."quantityRemaining" > 0
  AND "StorageSubLocation"."name" = 'General'
  AND "StorageSubLocation"."kind" = 'GENERAL';

-- CreateIndex
CREATE INDEX "StorageSubLocation_storageLocationId_isActive_displayOrder_idx" ON "StorageSubLocation"("storageLocationId", "isActive", "displayOrder");

-- CreateIndex
CREATE UNIQUE INDEX "StorageSubLocation_storageLocationId_name_key" ON "StorageSubLocation"("storageLocationId", "name");

-- CreateIndex
CREATE INDEX "LotLocationBalance_lotId_idx" ON "LotLocationBalance"("lotId");

-- CreateIndex
CREATE INDEX "LotLocationBalance_storageSubLocationId_idx" ON "LotLocationBalance"("storageSubLocationId");

-- CreateIndex
CREATE UNIQUE INDEX "LotLocationBalance_lotId_storageSubLocationId_key" ON "LotLocationBalance"("lotId", "storageSubLocationId");
