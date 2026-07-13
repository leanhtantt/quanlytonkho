ALTER TABLE "TreasuryTransaction"
ALTER COLUMN "account" DROP NOT NULL,
ADD COLUMN "fromAccount" TEXT,
ADD COLUMN "toAccount" TEXT,
ADD COLUMN "category" TEXT,
ADD COLUMN "person" TEXT,
ADD COLUMN "shop" TEXT,
ADD COLUMN "note" TEXT;
