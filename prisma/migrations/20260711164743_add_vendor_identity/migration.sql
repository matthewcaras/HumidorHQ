/*
  Warnings:

  - Added the required column `nameKey` to the `Vendor` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Vendor" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "website" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Vendor" ("createdAt", "id", "name", "notes", "updatedAt", "website") SELECT "createdAt", "id", "name", "notes", "updatedAt", "website" FROM "Vendor";
DROP TABLE "Vendor";
ALTER TABLE "new_Vendor" RENAME TO "Vendor";
CREATE UNIQUE INDEX "Vendor_nameKey_key" ON "Vendor"("nameKey");
CREATE INDEX "Vendor_isActive_nameKey_idx" ON "Vendor"("isActive", "nameKey");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
