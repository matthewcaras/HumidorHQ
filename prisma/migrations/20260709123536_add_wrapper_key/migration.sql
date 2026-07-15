/*
  Warnings:

  - A unique constraint covering the columns `[manufacturerKey,seriesKey,vitolaKey,wrapperKey]` on the table `CatalogCigar` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "CatalogCigar_manufacturerKey_seriesKey_vitolaKey_wrapper_key";

-- DropIndex
DROP INDEX "CatalogCigar_isActive_manufacturerKey_seriesKey_vitolaKey_idx";

-- AlterTable
ALTER TABLE "CatalogCigar" ADD COLUMN "wrapperKey" TEXT;

-- CreateIndex
CREATE INDEX "CatalogCigar_isActive_manufacturerKey_seriesKey_vitolaKey_wrapperKey_idx" ON "CatalogCigar"("isActive", "manufacturerKey", "seriesKey", "vitolaKey", "wrapperKey");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogCigar_manufacturerKey_seriesKey_vitolaKey_wrapperKey_key" ON "CatalogCigar"("manufacturerKey", "seriesKey", "vitolaKey", "wrapperKey");
