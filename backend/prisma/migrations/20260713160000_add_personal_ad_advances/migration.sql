ALTER TABLE "MonthlyAdExpense"
ADD COLUMN "advancedBy" TEXT;

CREATE TABLE "AdAdvanceReimbursement" (
    "id" TEXT NOT NULL,
    "adExpenseId" TEXT NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "source" TEXT NOT NULL,
    "account" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "treasuryTransactionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdAdvanceReimbursement_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AdAdvanceReimbursement_treasuryTransactionId_key"
ON "AdAdvanceReimbursement"("treasuryTransactionId");

CREATE INDEX "AdAdvanceReimbursement_adExpenseId_idx"
ON "AdAdvanceReimbursement"("adExpenseId");

ALTER TABLE "AdAdvanceReimbursement"
ADD CONSTRAINT "AdAdvanceReimbursement_adExpenseId_fkey"
FOREIGN KEY ("adExpenseId") REFERENCES "MonthlyAdExpense"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
