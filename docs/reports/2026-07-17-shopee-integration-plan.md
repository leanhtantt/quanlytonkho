# Kế hoạch tích hợp Shopee Open API

Ngày: 2026-07-17
Trạng thái: **Đề xuất — chưa triển khai**

Bối cảnh: đã đăng ký thành công tài khoản dev trên Shopee Open Platform, tạo app **TapHoaCha** (loại Seller In House System, Test Partner ID `1238615`), và **đã xác minh toàn bộ luồng sandbox**: sinh link ủy quyền → authorize shop test (SG, shop_id `227758409`) → đổi code lấy access_token/refresh_token → gọi `v2.shop.get_shop_info` thành công. Ba script thử nghiệm nằm ở `backend/scripts/shopee*.ts`.

Mục tiêu: app quản lý kho làm trung gian đồng bộ 2 chiều với shop Shopee — đơn hàng Shopee tự đổ về (trừ kho FIFO như đơn nhập tay), tồn kho từ app đẩy ngược lên Shopee. Giảm thao tác tay, giảm hủy đơn do lệch tồn.

---

## Kiến thức đã xác minh trong sandbox (đắt giá, tránh dò lại)

- **Host sandbox v2**: `https://openplatform.sandbox.test-stable.shopee.sg` — KHÔNG phải `partner.test-stable.shopeemobile.com` như đa số tài liệu/SDK cũ ghi (gọi nhầm host → `error_sign` gây hiểu lầm là sai key). Host production sau Go-Live: `https://partner.shopeemobile.com`.
- **Ký request** HMAC-SHA256, key = Partner Key, base string:
  - API public (auth_partner, token/get): `partner_id + path + timestamp`
  - API shop-level: `partner_id + path + timestamp + access_token + shop_id`
- **Token**: access_token sống ~4 giờ (`expire_in ~14400s`), refresh_token dùng để xin token mới qua `/api/v2/auth/access_token/get`. Ủy quyền shop có hạn ~1 năm (`expire_time`).
- **Sandbox không tạo được test account Vietnam** (lỗi liên tục) — dùng test account **Singapore** được, cơ chế API giống hệt; shop VN thật chỉ authorize sau Go-Live.
- Test Redirect URL Domain của app khai báo: `tanle-dev-lynstore.web.app`.
- Quyền app được cấp khi authorize: Product, Order, Payment, Marketing, Custom service.

## Phụ thuộc vào plan scale (`2026-07-17-scaling-plan.md`)

Cần xong **trước** khi code Shopee: S1 (index — webhook/sync sẽ tăng tần suất ghi FIFO), K1 (config qua env — mẫu cho env Shopee), K2 (`BusinessError` — service Shopee phân biệt lỗi nghiệp vụ với lỗi hệ thống/mạng). S2 nên xong (đồng bộ đơn tra SKU liên tục). S3 nên xong trước khi **bật** đồng bộ tự động (đơn Shopee làm bảng orders phình nhanh); S4 độc lập.

---

## Đợt SP1 — Nền móng: schema + client + refresh token (2–3 ngày)

1. **Schema Prisma** — bảng mới:

```prisma
model ShopeeShop {
  id           Int      @id                  // shop_id Shopee
  shopName     String?
  region       String                        // "VN" (test: "SG")
  accessToken  String                        // cân nhắc mã hóa (xem Rủi ro)
  refreshToken String
  expiresAt    DateTime                      // hạn access_token
  authExpiresAt DateTime?                    // hạn ủy quyền (~1 năm)
  isActive     Boolean  @default(true)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
}

model ShopeeItemMap {
  id          String  @id @default(uuid())
  shopId      Int
  productId   String                         // Product.id nội bộ
  itemId      BigInt                         // item_id Shopee
  modelId     BigInt?                        // phân loại (variation), null nếu không có
  createdAt   DateTime @default(now())

  @@unique([shopId, itemId, modelId])
  @@index([productId])
}
```

2. **Env** (backend, theo chuẩn K1): `SHOPEE_PARTNER_ID`, `SHOPEE_PARTNER_KEY`, `SHOPEE_ENV` (`sandbox` | `live` → chọn host), `SHOPEE_REDIRECT_URL`.
3. **`services/shopeeClient.ts`**: hàm `sign()` (2 dạng base string), `request()` tự đính partner_id/timestamp/sign/access_token/shop_id, tự **refresh token khi còn <30 phút** (lưu token mới vào DB ngay — refresh_token bị xoay vòng mỗi lần dùng), retry 1 lần khi lỗi mạng, map lỗi Shopee (`error` != "") thành `BusinessError`.
4. Nâng cấp script thử nghiệm hiện có thành mỏng dựa trên client mới (giữ làm công cụ chẩn đoán).

Kiểm chứng: script gọi get_shop_info qua client mới; để access_token quá hạn rồi gọi lại → tự refresh thành công.

## Đợt SP2 — Luồng ủy quyền qua UI (1–2 ngày)

1. `GET /api/shopee/auth-url` (quyền `settings: update`): trả link authorize (host theo `SHOPEE_ENV`).
2. Route callback nhận `code` + `shop_id`: Shopee redirect trình duyệt về `https://tanle-dev-lynstore.web.app/shopee/callback` → frontend page mới đọc query param, gọi `POST /api/shopee/connect` (kèm Firebase token như mọi API) → backend đổi code lấy token, upsert `ShopeeShop`. **Không** mở endpoint public không auth.
3. Trang Cài Đặt thêm khối "Kết nối Shopee": nút Kết nối (mở auth-url), trạng thái shop đã kết nối (tên, hạn ủy quyền), nút Ngắt kết nối (set `isActive=false`).

Kiểm chứng: connect shop test sandbox từ UI, thấy trạng thái; token lưu DB đúng.

## Đợt SP3 — Ánh xạ sản phẩm (2 ngày)

1. `GET /api/shopee/items`: gọi `v2.product.get_item_list` + `get_model_list`, trả danh sách item Shopee kèm SKU của sàn.
2. Tự động khớp: `item_sku`/`model_sku` bên Shopee so với `Product.sku` + `ProductSkuAlias` (tận dụng chuẩn hóa sẵn có) → đề xuất mapping, người dùng duyệt từng dòng trên UI (trang con trong Tồn Kho hoặc Cài Đặt), lưu `ShopeeItemMap`.
3. Sản phẩm không khớp được: cho chọn tay từ dropdown.

Kiểm chứng: shop test tạo vài item (qua Seller Center sandbox), mapping hiện đúng, lưu được.

## Đợt SP4 — Đồng bộ đơn hàng Shopee → app (3–4 ngày, lõi nghiệp vụ)

1. `POST /api/shopee/sync-orders` (chạy tay bằng nút trước, cron sau): `v2.order.get_order_list` (lọc `update_time` từ mốc sync cuối, lưu mốc trong `ShopeeShop`) → `get_order_detail` theo batch 50 đơn.
2. Map sang `Order` nội bộ qua service tạo đơn **hiện có** (đi qua FIFO + ledger + activity log như đơn tay): `channel = "Shopee"`, `externalCode = order_sn` (unique sẵn — idempotent, sync lại không tạo trùng), item map qua `ShopeeItemMap`, giá lấy từ đơn Shopee.
3. Trạng thái: chỉ ghi đơn từ `READY_TO_SHIP` trở đi (đơn `UNPAID`/`CANCELLED` bỏ qua); đơn bị hủy sau khi đã ghi → tạo giao dịch đảo (theo nguyên tắc sổ sách repo, không xóa).
4. Đơn có item chưa mapping → đưa vào danh sách "đơn chờ xử lý" hiển thị trên UI, không ghi lệch.

Kiểm chứng (quan trọng nhất plan): tạo đơn trên shop test sandbox → sync → tồn kho trừ đúng lô FIFO, ledger đúng, activity log ghi; sync lần 2 không nhân đôi; test tiền/FIFO hiện có vẫn xanh.

## Đợt SP5 — Đẩy tồn kho app → Shopee (2 ngày)

1. `v2.product.update_stock` cho item đã mapping, gọi khi: nhập hàng xong, ghi hao hụt, sửa/xóa đơn làm đổi tồn — gom debounce (ví dụ 30s) tránh spam rate limit.
2. Nút "Đẩy toàn bộ tồn kho" chạy tay để đối chiếu định kỳ.
3. Ghi log push (thành công/thất bại) vào Activity Log.

Kiểm chứng: đổi tồn trong app → số trên shop test đổi theo; rút mạng giữa chừng → có báo lỗi, không silent.

## Đợt SP6 — Go-Live + shop thật (0.5 ngày thao tác + chờ duyệt)

1. Console: bấm Go-Live app (Shopee xét duyệt — có sandbox đã chạy thật làm bằng chứng), lấy **Live Partner ID/Key**.
2. Set env production trên Cloud Run: `SHOPEE_ENV=live` + key live (qua Secret Manager/env Cloud Run, không commit).
3. Authorize shop VN thật từ UI (SP2), chạy lại SP3 mapping với sản phẩm thật, sync đơn thật ở chế độ "xem trước" (dry-run in ra sẽ ghi gì) trước khi bật ghi thật.

## Sau này (ghi nhận, chưa làm)

- **Webhook (Push Mechanism)** thay polling: cần endpoint public + verify chữ ký push; Cloud Run scale-to-zero nhận push ổn nhưng cần bỏ qua auth Firebase cho riêng route đó — làm khi tần suất đơn đủ lớn để polling 15 phút là chậm.
- Cron tự động: Cloud Scheduler gọi `sync-orders` mỗi 15 phút (hạ tầng đã có sẵn pattern từ backup).
- Đồng bộ giá bán, đơn Lazada/TikTok Shop tái dùng cùng khung `channel` + `externalCode`.

---

## Rủi ro & quyết định cần chốt

| Vấn đề | Phương án đề xuất |
|---|---|
| Token shop thật nằm trong DB dạng plain | Neon đã mã hóa at-rest; chấp nhận ở quy mô 1 shop, ghi chú lại. Nếu muốn hơn: mã hóa AES bằng key trong env trước khi lưu (thêm ~nửa ngày) |
| Rate limit Shopee (App List đang hiện "-") | Client đếm request + backoff khi gặp lỗi rate limit; polling 15 phút với 1 shop còn rất xa giới hạn |
| `externalCode` unique toàn hệ thống (K6 plan scale) | `order_sn` Shopee đủ độc nhất — không chặn; giữ ghi chú K6 nếu sau thêm kênh mã trùng |
| Sandbox SG vs production VN | Khác tiền tệ/logistics nhưng cấu trúc API giống; điểm cần test lại trên shop thật: escrow/payment (đối soát doanh thu) |
| Refresh token xoay vòng, mất là phải authorize lại | Lưu token mới **trong cùng transaction** với lần dùng; Sentry cảnh báo khi refresh thất bại |

## Thứ tự thực hiện đề xuất

| Đợt | Nội dung | Công sức | Phụ thuộc |
|---|---|---|---|
| — | Plan scale: S1, S2, K1, K2 | ~3 ngày | — |
| SP1 | Schema + ShopeeClient + refresh | 2–3 ngày | K1, K2 |
| SP2 | Ủy quyền qua UI | 1–2 ngày | SP1 |
| SP3 | Mapping sản phẩm | 2 ngày | SP2 |
| SP4 | Sync đơn hàng (lõi) | 3–4 ngày | SP3, S1, S2 |
| SP5 | Đẩy tồn kho | 2 ngày | SP3 |
| — | Plan scale: S3 (trước khi bật sync tự động) | 2–3 ngày | — |
| SP6 | Go-Live + shop thật | 0.5 ngày + chờ duyệt | SP1–SP5 chạy ổn sandbox |

Mốc kiểm chứng chung: `npm run build` + `npm run lint` + `npm run test` mỗi đợt; SP4/SP5 phải chạy demo đầy đủ trên shop test sandbox trước khi sang đợt kế.
