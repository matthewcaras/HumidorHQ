-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_StorageLocation" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "capacity" INTEGER,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_StorageLocation" ("capacity", "createdAt", "id", "name", "notes", "updatedAt") SELECT "capacity", "createdAt", "id", "name", "notes", "updatedAt" FROM "StorageLocation";
DROP TABLE "StorageLocation";
ALTER TABLE "new_StorageLocation" RENAME TO "StorageLocation";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
