-- CreateTable
-- PurchaseLine validation constraints enforce positive line identity/counts and nonnegative money values.
CREATE TABLE "PurchaseLine" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "purchaseOrderId" INTEGER NOT NULL,
    "catalogCigarId" INTEGER NOT NULL,
    "lineNumber" INTEGER NOT NULL CHECK ("lineNumber" > 0),
    "quantity" INTEGER NOT NULL CHECK ("quantity" > 0),
    "unitPrice" DECIMAL NOT NULL CHECK ("unitPrice" >= 0),
    "lineSubtotal" DECIMAL NOT NULL CHECK ("lineSubtotal" >= 0),
    "msrpPerCigar" DECIMAL CHECK ("msrpPerCigar" IS NULL OR "msrpPerCigar" >= 0),
    "receivedDate" DATETIME,
    "allocatedShipping" DECIMAL NOT NULL DEFAULT 0 CHECK ("allocatedShipping" >= 0),
    "allocatedExciseTax" DECIMAL NOT NULL DEFAULT 0 CHECK ("allocatedExciseTax" >= 0),
    "allocatedSalesTax" DECIMAL NOT NULL DEFAULT 0 CHECK ("allocatedSalesTax" >= 0),
    "allocatedDiscount" DECIMAL NOT NULL DEFAULT 0 CHECK ("allocatedDiscount" >= 0),
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PurchaseLine_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PurchaseLine_catalogCigarId_fkey" FOREIGN KEY ("catalogCigarId") REFERENCES "CatalogCigar" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
-- Lot validation constraints keep transitional quantity and cost values nonnegative.
CREATE TABLE "new_Lot" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "vitolaId" INTEGER,
    "storageLocationId" INTEGER,
    "purchaseOrderId" INTEGER,
    "purchaseLineId" INTEGER,
    "catalogCigarId" INTEGER,
    "quantityPurchased" INTEGER NOT NULL CHECK ("quantityPurchased" >= 0),
    "quantityRemaining" INTEGER NOT NULL CHECK ("quantityRemaining" >= 0),
    "originalQuantity" INTEGER CHECK ("originalQuantity" IS NULL OR "originalQuantity" > 0),
    "currentQuantity" INTEGER CHECK ("currentQuantity" IS NULL OR "currentQuantity" >= 0),
    "msrpPerCigar" DECIMAL CHECK ("msrpPerCigar" IS NULL OR "msrpPerCigar" >= 0),
    "actualCostPerCigar" DECIMAL CHECK ("actualCostPerCigar" IS NULL OR "actualCostPerCigar" >= 0),
    "allocatedCostPerCigar" DECIMAL CHECK ("allocatedCostPerCigar" IS NULL OR "allocatedCostPerCigar" >= 0),
    "purchaseDate" DATETIME,
    "vendorIdSnapshot" INTEGER,
    "vendorNameSnapshot" TEXT,
    "purchaseDateSnapshot" DATETIME,
    "receivedDateSnapshot" DATETIME,
    "costPerCigarSnapshot" DECIMAL CHECK ("costPerCigarSnapshot" IS NULL OR "costPerCigarSnapshot" >= 0),
    "msrpPerCigarSnapshot" DECIMAL CHECK ("msrpPerCigarSnapshot" IS NULL OR "msrpPerCigarSnapshot" >= 0),
    "sourceSnapshot" TEXT,
    "boxCode" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Lot_vitolaId_fkey" FOREIGN KEY ("vitolaId") REFERENCES "Vitola" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Lot_storageLocationId_fkey" FOREIGN KEY ("storageLocationId") REFERENCES "StorageLocation" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Lot_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Lot_purchaseLineId_fkey" FOREIGN KEY ("purchaseLineId") REFERENCES "PurchaseLine" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Lot_catalogCigarId_fkey" FOREIGN KEY ("catalogCigarId") REFERENCES "CatalogCigar" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Lot" ("actualCostPerCigar", "allocatedCostPerCigar", "boxCode", "createdAt", "id", "msrpPerCigar", "notes", "purchaseDate", "purchaseOrderId", "quantityPurchased", "quantityRemaining", "storageLocationId", "updatedAt", "vitolaId") SELECT "actualCostPerCigar", "allocatedCostPerCigar", "boxCode", "createdAt", "id", "msrpPerCigar", "notes", "purchaseDate", "purchaseOrderId", "quantityPurchased", "quantityRemaining", "storageLocationId", "updatedAt", "vitolaId" FROM "Lot";
DROP TABLE "Lot";
ALTER TABLE "new_Lot" RENAME TO "Lot";
CREATE UNIQUE INDEX "Lot_purchaseLineId_key" ON "Lot"("purchaseLineId");
CREATE INDEX "Lot_catalogCigarId_idx" ON "Lot"("catalogCigarId");
CREATE INDEX "Lot_purchaseDateSnapshot_idx" ON "Lot"("purchaseDateSnapshot");
CREATE INDEX "Lot_receivedDateSnapshot_idx" ON "Lot"("receivedDateSnapshot");
CREATE INDEX "Lot_vendorIdSnapshot_idx" ON "Lot"("vendorIdSnapshot");
-- PurchaseOrder validation constraints keep purchase-level monetary values nonnegative.
CREATE TABLE "new_PurchaseOrder" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "vendorId" INTEGER,
    "orderDate" DATETIME NOT NULL,
    "orderNumber" TEXT,
    "purchaseDate" DATETIME,
    "invoiceNumber" TEXT,
    "shipping" DECIMAL NOT NULL DEFAULT 0 CHECK ("shipping" >= 0),
    "tax" DECIMAL NOT NULL DEFAULT 0 CHECK ("tax" >= 0),
    "exciseTax" DECIMAL NOT NULL DEFAULT 0 CHECK ("exciseTax" >= 0),
    "salesTax" DECIMAL NOT NULL DEFAULT 0 CHECK ("salesTax" >= 0),
    "discount" DECIMAL NOT NULL DEFAULT 0 CHECK ("discount" >= 0),
    "totalPaid" DECIMAL CHECK ("totalPaid" IS NULL OR "totalPaid" >= 0),
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PurchaseOrder_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_PurchaseOrder" ("createdAt", "discount", "id", "notes", "orderDate", "orderNumber", "shipping", "tax", "updatedAt", "vendorId") SELECT "createdAt", "discount", "id", "notes", "orderDate", "orderNumber", "shipping", "tax", "updatedAt", "vendorId" FROM "PurchaseOrder";
DROP TABLE "PurchaseOrder";
ALTER TABLE "new_PurchaseOrder" RENAME TO "PurchaseOrder";
CREATE INDEX "PurchaseOrder_vendorId_purchaseDate_idx" ON "PurchaseOrder"("vendorId", "purchaseDate");
CREATE INDEX "PurchaseOrder_purchaseDate_idx" ON "PurchaseOrder"("purchaseDate");
CREATE UNIQUE INDEX "PurchaseOrder_vendorId_invoiceNumber_key" ON "PurchaseOrder"("vendorId", "invoiceNumber");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "PurchaseLine_purchaseOrderId_idx" ON "PurchaseLine"("purchaseOrderId");

-- CreateIndex
CREATE INDEX "PurchaseLine_catalogCigarId_idx" ON "PurchaseLine"("catalogCigarId");

-- CreateIndex
CREATE INDEX "PurchaseLine_receivedDate_idx" ON "PurchaseLine"("receivedDate");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseLine_purchaseOrderId_lineNumber_key" ON "PurchaseLine"("purchaseOrderId", "lineNumber");
