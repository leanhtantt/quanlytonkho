import "dotenv/config";
import crypto from "node:crypto";

/**
 * Test kết nối Shopee Open API (sandbox) bằng Test Partner ID/Key.
 * Cần trong backend/.env:
 *   SHOPEE_TEST_PARTNER_ID=1238615
 *   SHOPEE_TEST_PARTNER_KEY=<partner key thật, không commit>
 * Tùy chọn (nếu đã biết shop_id Shopee của bạn):
 *   SHOPEE_TEST_SHOP_ID=<shop id>
 *
 * Chạy: npx tsx scripts/shopeeTestCall.ts
 */

// Host Sandbox v2 — lấy từ Request URL trong API Test Tool trên Console
const SANDBOX_HOSTS = [
  "https://openplatform.sandbox.test-stable.shopee.sg",
];

const partnerId = process.env.SHOPEE_TEST_PARTNER_ID?.trim().replace(/^["']|["']$/g, "");
const partnerKey = process.env.SHOPEE_TEST_PARTNER_KEY?.trim().replace(/^["']|["']$/g, "");
const shopId = process.env.SHOPEE_TEST_SHOP_ID?.trim();

if (!partnerId || !partnerKey) {
  console.error(
    "Thiếu SHOPEE_TEST_PARTNER_ID hoặc SHOPEE_TEST_PARTNER_KEY trong backend/.env",
  );
  process.exit(1);
}

console.log("Debug (không lộ giá trị thật):");
console.log("  partner_id =", partnerId, `(length ${partnerId.length})`);
console.log("  partner_key length =", partnerKey.length);

function sign(basePath: string, timestamp: number, extra = ""): string {
  const baseString = `${partnerId}${basePath}${timestamp}${extra}`;
  return crypto
    .createHmac("sha256", partnerKey as string)
    .update(baseString)
    .digest("hex");
}

function generateAuthUrls() {
  const path = "/api/v2/shop/auth_partner";
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = sign(path, timestamp);

  console.log("\n== Link ủy quyền (thử lần lượt từng link, link nào ra trang đăng nhập Shopee là host đúng) ==");
  for (const host of SANDBOX_HOSTS) {
    const url = new URL(host + path);
    url.searchParams.set("partner_id", partnerId as string);
    url.searchParams.set("timestamp", String(timestamp));
    url.searchParams.set("sign", signature);
    // Domain phải khớp với "Test Redirect URL Domain" đã khai báo trên Console
    url.searchParams.set("redirect", "https://tanle-dev-lynstore.web.app/shopee/callback");
    console.log(`\n[${host}]`);
    console.log(url.toString());
  }
  console.log("\nLưu ý: link chỉ có hiệu lực ~5 phút, hết hạn thì chạy lại script.");
}

async function getShopInfo() {
  if (!shopId) {
    console.log(
      "\n(Bỏ qua get_shop_info_by_shop_id — chưa có SHOPEE_TEST_SHOP_ID trong .env)",
    );
    return;
  }

  const path = "/api/v2/public/get_shop_info_by_shop_id";

  for (const host of SANDBOX_HOSTS) {
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = sign(path, timestamp);

    const url = new URL(host + path);
    url.searchParams.set("partner_id", partnerId as string);
    url.searchParams.set("timestamp", String(timestamp));
    url.searchParams.set("sign", signature);
    url.searchParams.set("shop_id", shopId);

    console.log(`\n== Gọi thử v2.public.get_shop_info_by_shop_id trên ${host} ==`);
    const res = await fetch(url.toString());
    const data = await res.json();
    console.log("HTTP status:", res.status);
    console.log("Response:", JSON.stringify(data, null, 2));
  }
}

async function main() {
  generateAuthUrls();
  await getShopInfo();
}

main().catch((err) => {
  console.error("Lỗi khi gọi Shopee API:", err);
  process.exit(1);
});
