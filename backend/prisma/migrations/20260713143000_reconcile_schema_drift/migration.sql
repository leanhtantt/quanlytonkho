-- Reconcile columns that exist in the live database and Prisma schema but were
-- missing from migration history. IF NOT EXISTS keeps deployment safe for the
-- current database while allowing a blank database to be restored from backup.

ALTER TABLE "Order"
  ADD COLUMN IF NOT EXISTS "marketingFee" DECIMAL(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "packagingFee" DECIMAL(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "platformFee" DECIMAL(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "returnFee" DECIMAL(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "settlementDate" TIMESTAMP(3);

ALTER TABLE "OrderItem"
  ADD COLUMN IF NOT EXISTS "isReturned" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Product"
  ADD COLUMN IF NOT EXISTS "imageId" TEXT;

ALTER TABLE "PurchaseOrder"
  ADD COLUMN IF NOT EXISTS "domesticShipping" DECIMAL(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "intlShipping" DECIMAL(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "purchaseFee" DECIMAL(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "totalCompensation" DECIMAL(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "totalDiscount" DECIMAL(15,2) NOT NULL DEFAULT 0;
