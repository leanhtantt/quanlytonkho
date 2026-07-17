# Kế hoạch chuẩn bị scale: dữ liệu lớn hơn, nhiều nhân viên hơn

Ngày: 2026-07-17
Trạng thái: **Đề xuất — chưa triển khai**

Bối cảnh: rà soát backend sau câu hỏi về N+1 query. Kết luận tổng quan: **kiến trúc hiện tại đúng hướng, không cần làm lại**. Các API đọc đã dùng eager loading (`include`) nên không dính N+1; nghiệp vụ trừ kho chạy trong transaction có khóa dòng nên nhiều người dùng đồng thời không làm sai tồn kho. Tài liệu này liệt kê những điểm **sẽ** thành vấn đề khi dữ liệu tích lũy 1–2 năm hoặc khi thêm nhân viên, xếp theo thứ tự nên làm.

Nguyên tắc xếp ưu tiên (kế thừa `2026-07-13-additional-recommendations.md`): bảo vệ dữ liệu trước → sửa thứ rẻ mà lợi lâu dài → thứ tốn công làm sau, chia đợt nhỏ để dễ review.

---

## Hiện trạng đã tốt (không đụng vào)

- `GET /orders`, `/purchases`, `/losses`, `/ads`, `/inventory-adjustments` đều `include` quan hệ — đúng bài eager loading, không có N+1 (`backend/src/routes.ts`).
- `GET /inventory` gộp 2 query rồi ghép trong RAM — mô hình chuẩn (`routes.ts:717`).
- Trừ kho FIFO dùng `SELECT ... FOR UPDATE` trong transaction (`backend/src/services/inventoryService.ts:17`) — 2 nhân viên cùng bán 1 sản phẩm không trừ trùng lô.
- Phân quyền default-deny theo resource + Activity Log — sẵn sàng cho nhiều nhân viên về mặt kiểm soát.

---

## Đợt S1 — Thêm index database (nửa ngày, rủi ro thấp, lợi lớn nhất)

**Vấn đề:** Postgres KHÔNG tự tạo index cho cột khóa ngoại. `schema.prisma` hiện chỉ có index ở `ProductSkuAlias`, `AdAdvanceReimbursement`, `ActivityLog`. Mọi bảng nghiệp vụ chính đều thiếu:

| Bảng | Index cần thêm | Query đang bị quét cả bảng |
|---|---|---|
| `InventoryBatch` | `@@index([productId, qtyRemaining])` | FIFO `WHERE productId = ? AND qtyRemaining > 0` (`inventoryService.ts:17`) — chạy **mỗi lần lưu đơn**, lại nằm trong `FOR UPDATE` nên quét chậm = giữ khóa lâu = nhân viên khác phải chờ |
| `StockTransaction` | `@@index([referenceType, referenceId])`, `@@index([batchId])`, `@@index([productId])` | Hoàn kho khi sửa/xóa đơn (`orderService.ts:86`), xóa phiếu nhập, kiểm tra sản phẩm mồ côi |
| `OrderItem` | `@@index([orderId])`, `@@index([productId])` | `include: { orderItems }` và cleanup sản phẩm |
| `PurchaseItem` | `@@index([purchaseOrderId])`, `@@index([productId])` | `include: { purchaseItems }`, cleanup |
| `Loss` | `@@index([productId])` | `include: { product }`, cleanup |
| `LedgerEntry` | `@@index([referenceType, referenceId])` | Xóa ledger khi sửa/xóa đơn |
| `Order` | `@@index([orderedAt])` | Chuẩn bị cho lọc theo thời gian ở Đợt S4 |
| `TreasuryTransaction` | `@@index([date])` | Chuẩn bị cho lọc theo thời gian |

**Việc làm:** sửa `schema.prisma`, chạy `prisma migrate dev` tạo migration, kiểm tra `npm run build` + test. Không đổi dòng code nào ngoài schema.

**Vì sao ưu tiên nhất:** index là thứ duy nhất trong tài liệu này mà thiếu nó thì *cả* các đợt sau lẫn code hiện tại đều chậm dần theo dữ liệu; thêm sớm gần như miễn phí, thêm muộn vẫn phải thêm.

---

## Đợt S2 — Tra SKU bằng query đích danh, bỏ load cả bảng Product (1 ngày)

**Vấn đề:** mỗi lần tạo/sửa đơn hàng, phiếu nhập, hao hụt, điều chỉnh kho, backend gọi `prisma.product.findMany({ include: { skuAliases: true } })` — kéo **toàn bộ** bảng Product + alias về RAM chỉ để tìm vài SKU (`routes.ts:479, 501, 624, 646, 704, 769, 809, 827`). Vài trăm sản phẩm thì vô hại; vài nghìn sản phẩm × nhiều nhân viên cùng thao tác = mỗi request đều trả giá.

**Việc làm:**
1. Viết helper `resolveProductsByCodes(codes: string[])` — chuẩn hóa mã (trim + uppercase như `normalizeSkuCode`) rồi query một lần:
   `WHERE sku IN (...) OR id IN (...)` trên `Product` + `WHERE sku IN (...)` trên `ProductSkuAlias` (include product).
2. Thay 8 chỗ gọi `findMany` toàn bảng bằng helper, giữ nguyên `findProductByCode` logic so khớp (case-insensitive, alias).
3. Lưu ý: `sku` trong DB đã luôn được ghi dạng uppercase (qua `normalizeSkuCode` khi tạo) nên `IN` khớp trực tiếp được; nếu còn nghi ngờ data cũ, dùng `mode: 'insensitive'`.

**Kiểm chứng:** test tạo đơn với SKU thường/alias/UUID, SKU không tồn tại phải báo lỗi như cũ. Không đổi hành vi, chỉ đổi cách lấy dữ liệu.

---

## Đợt S3 — Phân trang + lọc thời gian phía backend (2–3 ngày, giữ tương thích ngược)

**Vấn đề:** `GET /orders`, `/purchases`, `/treasury/transactions`, `/losses` trả toàn bộ lịch sử từ ngày đầu. Đây là quả bom hẹn giờ chính: sau 1–2 năm bán hàng, mỗi lần mở app tải chục nghìn record kèm items. (`GET /orders` hiện cũng **không có `orderBy`** — thứ tự trả về phụ thuộc Postgres, nên tiện thể chốt luôn `orderedAt desc`.)

**Việc làm (backend trước, không phá frontend cũ):**
1. Thêm query param tùy chọn cho các route danh sách: `?from=&to=&page=&limit=` (Prisma `skip`/`take` + `where: { orderedAt: { gte, lte } }`).
2. **Không truyền param → trả toàn bộ như cũ** (frontend hiện tại không vỡ). Có param → trả `{ items, total, page, limit }`.
3. Route ưu tiên theo tốc độ phình: `orders` → `treasury/transactions` → `purchases` → `losses`.

**Kiểm chứng:** gọi không param ra kết quả y hệt cũ (so sánh JSON); gọi có param ra đúng trang, đúng khoảng ngày.

---

## Đợt S4 — Frontend tải theo kỳ thay vì tải hết (3–5 ngày, tốn công nhất)

**Vấn đề:** `StoreContext.refresh()` tải 8 API cùng lúc, toàn bộ dữ liệu, mỗi lần focus lại tab (`src/store/StoreContext.jsx:52`). `buildDerivedStore` tính lại tồn kho/lãi lỗ trên **toàn bộ** orders + purchases mỗi lần state đổi — trình duyệt sẽ đuối trước cả server.

**Hướng làm (bàn kỹ trước khi code — đây là thay đổi kiến trúc frontend duy nhất trong plan):**
1. Mặc định tải theo kỳ đang xem (ví dụ 3 tháng gần nhất) qua param mới ở S3; nút/bộ lọc "xem cũ hơn" mới tải thêm.
2. Tồn kho hiện hành lấy từ `GET /inventory` (backend đã tính từ batch, không phụ thuộc tải hết orders) thay vì tự cộng lại từ lịch sử ở client — cần rà `buildDerivedStore` xem màn hình nào còn phụ thuộc số liệu suy ra từ toàn bộ lịch sử (ví dụ báo cáo lãi theo tháng) rồi chuyển các con số đó thành API tổng hợp riêng.
3. Làm từng trang một, trang Orders trước.

Đợt này phụ thuộc S3, và là lý do nên làm S3 sớm: càng để lâu, càng nhiều màn hình mới dựa vào giả định "store có tất cả".

---

## Các phát hiện khác khi rà code (nhỏ hơn, sửa lúc nào cũng được)

### K1. Cấu hình Firebase hardcode trong code

`projectId: 'tanle-dev'` và bucket `tanle-dev.firebasestorage.app` viết cứng ở `routes.ts:18,862,869,876` và `authMiddleware.ts:9`. Đổi môi trường (staging, đổi project) là phải sửa code. Nên chuyển thành biến môi trường (`FIREBASE_PROJECT_ID`, `FIREBASE_STORAGE_BUCKET`) với fallback giá trị hiện tại.

### K2. Xử lý lỗi trả thẳng `error.message` cho client

Hầu hết route bọc `catch (error) { res.status(400).json({ error: error.message }) }`. Hai hệ quả: (1) lỗi hệ thống thật (DB rớt, bug Prisma) cũng trả 400 kèm thông điệp nội bộ — vừa sai mã lỗi vừa lộ chi tiết kỹ thuật; (2) Sentry khó phân biệt lỗi nghiệp vụ với lỗi hệ thống. Hướng sửa: tạo lớp `BusinessError` cho lỗi nghiệp vụ (ném có chủ đích, trả 400 + message tiếng Việt như hiện nay), còn lại rơi vào error handler chung trả 500 + message chung chung, log chi tiết server-side.

### K3. Frontend nuốt lỗi tải dữ liệu

`refresh()` dùng `.catch(() => [])` cho từng API (`StoreContext.jsx:53-60`) — API chết thì màn hình hiển thị **danh sách rỗng như thật**, người dùng có thể tưởng mất dữ liệu (đã có `HealthStatus` nhưng không gắn với từng lần tải). Nên: lỗi thì giữ data cũ + toast báo "tải lại thất bại", không set rỗng.

### K4. Quyền bị thu hồi có hiệu lực trễ tối đa 60 giây

Cache quyền user TTL 60s (`authMiddleware.ts:35`) và `clearUserAuthorizationCache` chỉ xóa cache của **instance đang chạy** — Cloud Run chạy nhiều instance thì instance khác vẫn giữ cache đến hết TTL. Với đội vài người, chấp nhận được; chỉ cần biết rằng "khóa tài khoản nhân viên" có độ trễ ≤ 1 phút. Không cần sửa, ghi nhận để không bất ngờ.

### K5. Tiền tính bằng float ở tầng JS

Nhiều chỗ `Number(decimal)` rồi cộng trừ trong JS (COGS, expectedRevenue, phân bổ chi phí). Với VND (số nguyên, không có xu) sai số float thực tế chưa gây lệch, và test tiền/FIFO đang có giúp giữ an toàn. Ghi nhận: nếu sau này có đơn vị lẻ (ngoại tệ, chiết khấu %), phải quy về đồng nguyên trước khi cộng.

### K6. Vệ sinh nhỏ

- `purchase_16.json` ở root repo là file rỗng 0 byte — xóa được.
- `GET /orders` chưa có `orderBy` (gộp vào S3).
- `externalCode` của Order là unique **toàn hệ thống**: hai shop khác nhau không thể có cùng mã đơn. Hiện các sàn sinh mã đủ khác nhau nên chưa sao; nếu sau này thêm kênh có mã trùng nhau (ví dụ đơn tay đánh số 1, 2, 3…), cần đổi thành unique theo `(channel, externalCode)`.

---

## Thứ tự thực hiện đề xuất

| Đợt | Nội dung | Công sức | Phụ thuộc |
|---|---|---|---|
| S1 | Index database | ~0.5 ngày | — |
| S2 | Tra SKU đích danh | ~1 ngày | — |
| K1+K6 | Env config + dọn file rác | ~0.5 ngày | — |
| K2+K3 | Chuẩn hóa lỗi backend + frontend không nuốt lỗi | ~1 ngày | — |
| S3 | Phân trang backend (tương thích ngược) | 2–3 ngày | S1 |
| S4 | Frontend tải theo kỳ | 3–5 ngày | S3, bàn thiết kế trước |

S1, S2, K1, K2, K3, K6 độc lập nhau — làm lẻ từng PR nhỏ được. S4 là đợt duy nhất cần bàn phương án trước khi code vì đụng kiến trúc store của frontend.

Mốc kiểm chứng chung cho mọi đợt: `npm run build`, `npm run lint`, `npm run test` (giữ nguyên bộ test tiền/FIFO), và với thay đổi hành vi API thì so sánh response trước/sau trên data thật.
