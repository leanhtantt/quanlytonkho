import "dotenv/config";
import crypto from "node:crypto";

/**
 * Gọi API shop-level v2.shop.get_shop_info (sandbox).
 * Chạy: npx tsx scripts/shopeeShopInfo.ts <access_token> <shop_id>
 */

const HOST = "https://openplatform.sandbox.test-stable.shopee.sg";

const partnerId = process.env.SHOPEE_TEST_PARTNER_ID?.trim();
const partnerKey = process.env.SHOPEE_TEST_PARTNER_KEY?.trim();

const [accessToken, shopIdArg] = process.argv.slice(2);

if (!partnerId || !partnerKey || !accessToken || !shopIdArg) {
  console.error("Cách dùng: npx tsx scripts/shopeeShopInfo.ts <access_token> <shop_id>");
  process.exit(1);
}

async function main() {
  const path = "/api/v2/shop/get_shop_info";
  const timestamp = Math.floor(Date.now() / 1000);
  // Shop API: base string = partner_id + path + timestamp + access_token + shop_id
  const baseString = `${partnerId}${path}${timestamp}${accessToken}${shopIdArg}`;
  const sign = crypto
    .createHmac("sha256", partnerKey as string)
    .update(baseString)
    .digest("hex");

  const url =
    `${HOST}${path}?partner_id=${partnerId}&timestamp=${timestamp}&sign=${sign}` +
    `&access_token=${accessToken}&shop_id=${shopIdArg}`;

  const res = await fetch(url);
  const data = await res.json();
  console.log("HTTP status:", res.status);
  console.log("Response:", JSON.stringify(data, null, 2));
}

main().catch((err) => {
  console.error("Lỗi:", err);
  process.exit(1);
});
