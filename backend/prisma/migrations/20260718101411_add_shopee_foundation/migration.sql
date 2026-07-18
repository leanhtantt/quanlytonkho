-- CreateTable
CREATE TABLE "ShopeeShop" (
    "id" INTEGER NOT NULL,
    "shopName" TEXT,
    "region" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "authExpiresAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopeeShop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopeeItemMap" (
    "id" TEXT NOT NULL,
    "shopId" INTEGER NOT NULL,
    "productId" TEXT NOT NULL,
    "itemId" BIGINT NOT NULL,
    "modelId" BIGINT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShopeeItemMap_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ShopeeItemMap_productId_idx" ON "ShopeeItemMap"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "ShopeeItemMap_shopId_itemId_modelId_key" ON "ShopeeItemMap"("shopId", "itemId", "modelId");
