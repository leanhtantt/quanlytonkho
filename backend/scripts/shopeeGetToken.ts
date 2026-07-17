import "dotenv/config";
import crypto from "node:crypto";

/**
 * Đổi authorization code lấy access_token + refresh_token (sandbox).
 * Chạy: npx tsx scripts/shopeeGetToken.ts <code> <shop_id>
 */

const HOST = "https://openplatform.sandbox.test-stable.shopee.sg";

const partnerId = process.env.SHOPEE_TEST_PARTNER_ID?.trim();
const partnerKey = process.env.SHOPEE_TEST_PARTNER_KEY?.trim();

const [code, shopIdArg] = process.argv.slice(2);

if (!partnerId || !partnerKey) {
  console.error("Thiếu SHOPEE_TEST_PARTNER_ID / SHOPEE_TEST_PARTNER_KEY trong .env");
  process.exit(1);
}
if (!code || !shopIdArg) {
  console.error("Cách dùng: npx tsx scripts/shopeeGetToken.ts <code> <shop_id>");
  process.exit(1);
}

async function main() {
  const path = "/api/v2/auth/token/get";
  const timestamp = Math.floor(Date.now() / 1000);
  const baseString = `${partnerId}${path}${timestamp}`;
  const sign = crypto
    .createHmac("sha256", partnerKey as string)
    .update(baseString)
    .digest("hex");

  const url = `${HOST}${path}?partner_id=${partnerId}&timestamp=${timestamp}&sign=${sign}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      code,
      shop_id: Number(shopIdArg),
      partner_id: Number(partnerId),
    }),
  });

  const data = await res.json();
  console.log("HTTP status:", res.status);
  console.log("Response:", JSON.stringify(data, null, 2));

  if (data.access_token) {
    console.log("\n=> THÀNH CÔNG! Lưu access_token và refresh_token lại.");
    console.log("   access_token hết hạn sau", data.expire_in, "giây (~4 giờ).");
    console.log("   Dùng refresh_token để lấy token mới khi hết hạn.");
  }
}

main().catch((err) => {
  console.error("Lỗi:", err);
  process.exit(1);
});
