ALTER TABLE "ShopeeShop"
ADD COLUMN "lastOrderSyncAt" TIMESTAMP(3);

CREATE TABLE "ShopeeOrderSyncIssue" (
    "id" TEXT NOT NULL,
    "shopId" BIGINT NOT NULL,
    "orderSn" TEXT NOT NULL,
    "orderStatus" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "unmappedItems" JSONB NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "ShopeeOrderSyncIssue_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ShopeeOrderSyncIssue_shopId_orderSn_key"
ON "ShopeeOrderSyncIssue"("shopId", "orderSn");

CREATE INDEX "ShopeeOrderSyncIssue_shopId_resolvedAt_idx"
ON "ShopeeOrderSyncIssue"("shopId", "resolvedAt");
