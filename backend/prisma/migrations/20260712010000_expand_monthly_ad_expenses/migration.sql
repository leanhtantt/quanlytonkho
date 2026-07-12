ALTER TABLE "MonthlyAdExpense"
ADD COLUMN "source" TEXT NOT NULL DEFAULT 'SELF_FUNDED',
ADD COLUMN "account" TEXT,
ADD COLUMN "spentAt" TIMESTAMP(3),
ADD COLUMN "note" TEXT,
ADD COLUMN "treasuryTransactionId" TEXT;

CREATE UNIQUE INDEX "MonthlyAdExpense_treasuryTransactionId_key"
ON "MonthlyAdExpense"("treasuryTransactionId");
