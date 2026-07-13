CREATE TABLE "ProductSkuAlias" (
    "sku" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductSkuAlias_pkey" PRIMARY KEY ("sku")
);

CREATE INDEX "ProductSkuAlias_productId_idx" ON "ProductSkuAlias"("productId");

ALTER TABLE "ProductSkuAlias" ADD CONSTRAINT "ProductSkuAlias_productId_fkey"
FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OrderItem" ADD COLUMN "skuAtOrder" TEXT;

UPDATE "OrderItem" AS oi
SET "skuAtOrder" = p."sku"
FROM "Product" AS p
WHERE p."id" = oi."productId";

-- Fallback: dòng đơn cũ trỏ tới sản phẩm không còn tồn tại sẽ để trống sau bước trên.
-- Lấp bằng chính productId để bước SET NOT NULL không bao giờ gãy khi deploy.
UPDATE "OrderItem"
SET "skuAtOrder" = "productId"
WHERE "skuAtOrder" IS NULL;

ALTER TABLE "OrderItem" ALTER COLUMN "skuAtOrder" SET NOT NULL;
