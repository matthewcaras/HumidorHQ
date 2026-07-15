-- CreateTable
CREATE TABLE "CatalogCigar" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "manufacturer" TEXT NOT NULL,
    "manufacturerKey" TEXT NOT NULL,
    "series" TEXT NOT NULL,
    "seriesKey" TEXT NOT NULL,
    "vitola" TEXT NOT NULL,
    "vitolaKey" TEXT NOT NULL,
    "shape" TEXT,
    "length" DECIMAL,
    "ringGauge" INTEGER,
    "wrapper" TEXT,
    "binder" TEXT,
    "filler" TEXT,
    "country" TEXT,
    "strength" TEXT,
    "msrp" DECIMAL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "CatalogCigar_isActive_manufacturerKey_seriesKey_vitolaKey_idx" ON "CatalogCigar"("isActive", "manufacturerKey", "seriesKey", "vitolaKey");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogCigar_manufacturerKey_seriesKey_vitolaKey_wrapper_key" ON "CatalogCigar"("manufacturerKey", "seriesKey", "vitolaKey", "wrapper");
