import 'dotenv/config';
import { prisma } from '../src/prismaClient';
import { ShopeeClient } from '../src/services/shopeeClient';

/**
 * Kiểm chứng client SP1 bằng shop sandbox; token được lưu vào ShopeeShop.
 * Chạy: npx tsx scripts/shopeeClientShopInfo.ts <shop_id> <access_token> <refresh_token>
 *
 * Script luôn đánh dấu access token là sắp hết hạn để buộc client refresh,
 * sau đó gọi v2.shop.get_shop_info bằng token đã được lưu mới.
 */
const [shopIdArg, accessToken, refreshToken] = process.argv.slice(2);
let shopId: bigint;

try {
  shopId = BigInt(shopIdArg);
} catch {
  console.error('Cách dùng: npx tsx scripts/shopeeClientShopInfo.ts <shop_id> <access_token> <refresh_token>');
  process.exit(1);
}

if (shopId <= 0n || !accessToken || !refreshToken) {
  console.error('Cách dùng: npx tsx scripts/shopeeClientShopInfo.ts <shop_id> <access_token> <refresh_token>');
  process.exit(1);
}

async function main() {
  await prisma.shopeeShop.upsert({
    where: { id: shopId },
    update: {
      accessToken,
      refreshToken,
      expiresAt: new Date(0),
      isActive: true,
    },
    create: {
      id: shopId,
      region: process.env.SHOPEE_ENV === 'live' ? 'VN' : 'SG',
      accessToken,
      refreshToken,
      expiresAt: new Date(0),
    },
  });

  const result = await new ShopeeClient().getShopInfo<Record<string, unknown>>(shopId);
  console.log('get_shop_info thành công:', {
    shopId,
    requestId: result.request_id ?? null,
    shopName: result.shop_name ?? null,
  });
}

main()
  .catch((error) => {
    console.error('Kiểm chứng Shopee client thất bại:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
