# Đề xuất bổ sung ngoài 2 plan Phân quyền & UI

Ngày: 2026-07-13
Trạng thái: **Chờ duyệt** — danh sách đề xuất, anh chọn cái nào thì giao việc cái đó.

Bối cảnh: app vận hành shop thật (tiền thật, sổ sách thật), chủ app không làm tech và phát triển bằng AI. Vì vậy các đề xuất xếp ưu tiên theo nguyên tắc: **bảo vệ dữ liệu trước → lưới an toàn khi vibe code → tiện nghi sau**.

---

## Nhóm A — Bảo vệ dữ liệu (ưu tiên cao nhất)

### A1. ⚠️ Ảnh sản phẩm đang lưu trong trình duyệt — sẽ mất và không đồng bộ

Phát hiện khi rà code: `src/domain/imageDb.js` lưu ảnh sản phẩm vào **IndexedDB của trình duyệt trên đúng máy đang dùng**, backend chỉ giữ `imageId`. Hệ quả:

- Đổi máy / đổi trình duyệt / xóa dữ liệu duyệt web → **mất toàn bộ ảnh sản phẩm**, không khôi phục được.
- Người khác đăng nhập trên máy khác → không thấy bất kỳ ảnh nào. Khi plan phân quyền xong (nhiều user), đây thành bug hiển nhiên ngay ngày đầu.

Đề xuất: chuyển ảnh lên **Firebase Storage** (đã có sẵn trong project `tanle-dev`, bucket `tanle-dev.firebasestorage.app`):
- Upload qua backend (backend đã có firebase-admin) để kiểm soát quyền theo plan phân quyền; lưu URL vào `Product.imageId`.
- Script migration một lần: đọc ảnh từ IndexedDB trên máy đang có ảnh → đẩy lên Storage (làm 1 trang tạm "Đồng bộ ảnh" bấm 1 nút, chạy trên đúng máy chứa ảnh).
- Nên làm **trước hoặc cùng đợt** với Phase 3 plan phân quyền.

### A2. ⚠️ Backup database — hiện chưa có gì chắc chắn

Toàn bộ sổ sách (đơn, nhập hàng, sổ quỹ, ledger) nằm trong 1 database Postgres. Chưa thấy cơ chế backup nào trong repo. Với shop thật: **mất DB = mất sổ sách**, và lỗi kiểu "AI sửa nhầm script wipe" (repo có sẵn `backend/scripts/wipe.ts`!) là rủi ro thật với vibe coding.

Đề xuất:
- Kiểm tra nơi host Postgres (Cloud SQL?) → bật **automated backup + point-in-time recovery**.
- Thêm script `backend/scripts/backup.ts` export toàn bộ data ra file JSON/SQL, chạy định kỳ (Cloud Scheduler hoặc chạy tay mỗi tuần), lưu về Google Drive/Storage.
- **Thử restore 1 lần** — backup chưa từng restore thử coi như chưa có backup.
- Thêm xác nhận 2 lớp cho `wipe.ts` (gõ tên project mới cho chạy) hoặc xóa hẳn khỏi repo.

### A3. Push main = deploy thẳng production

`deploy.yml` deploy ngay khi push `main`, không có môi trường thử. Với người không đọc được code, rất dễ đẩy bản lỗi vào app đang dùng thật mà không biết trước.

Đề xuất quy trình (không tốn tiền thêm):
- Mọi thay đổi làm trên branch + mở PR (các session AI vốn đã làm vậy).
- Thêm workflow deploy **Firebase Hosting preview channel** cho mỗi PR → có URL riêng để anh bấm thử bằng mắt trước khi merge.
- Chỉ merge vào `main` sau khi xem preview ổn. Bật branch protection cho `main` (bắt buộc PR + CI xanh — xem B1).

## Nhóm B — Lưới an toàn khi vibe code

### B1. CI kiểm tra tự động trên mọi PR

Hiện GitHub Actions chỉ **deploy**, không **kiểm tra**. Đề xuất thêm workflow chạy trên mọi PR: `npm run build` + `npm run lint` (frontend) và `tsc --noEmit` (backend), fail thì không merge được. Đây là người gác cổng thay cho kinh nghiệm tech — AI viết sai kiểu gì thì cổng này chặn được lớp lỗi thô nhất.

### B2. Test tự động cho logic tiền & FIFO

`AGENTS.md` đã yêu cầu "test cho FIFO" nhưng backend chưa có test nào (`"test": "no test specified"`). Đây là chỗ nguy hiểm nhất của vibe coding: AI sửa nhầm logic tính tiền thì **app vẫn chạy, chỉ có số liệu sai âm thầm**, và người không đọc code sẽ không phát hiện cho tới khi đối chiếu sổ.

Đề xuất: viết bộ test (vitest) cho đúng 3 vùng, không cần phủ toàn bộ:
1. FIFO deduction (`inventoryService`) — xuất đúng lô cũ nhất, hoàn kho khi sửa/xóa đơn.
2. Phân bổ chi phí nhập hàng (`procurementService`) — chia phí vận chuyển/discount đúng.
3. Tính lợi nhuận (`src/domain/profitAnalytics.js` — hiện có file `test_profit_analytics.js` ở root chạy tay, nên chuyển thành test chính thức).

Gắn vào CI ở B1. Từ đó về sau, mọi lần AI đụng vào logic tiền đều có kiểm chứng tự động.

### B3. Error monitoring (Sentry, free tier)

Hiện lỗi runtime chỉ nằm trong console của người dùng — nghĩa là lỗi xảy ra mà không ai biết. Thêm Sentry (frontend + backend, gói miễn phí đủ dùng) → có email báo khi user gặp lỗi thật, kèm chi tiết để dán cho AI sửa. Với chủ app không tech, đây là "tai mắt" duy nhất nhìn vào production.

## Nhóm C — Nghiệp vụ & tiện nghi (làm sau, tùy nhu cầu)

### C1. Kiểm tra Dashboard có đang dùng số liệu demo

README ghi chú "Dashboard: hien dang dung du lieu demo". Cần verify — nếu đúng thì nối số thật (tiện làm luôn trong Phase U3 của plan UI khi migrate trang Dashboard).

### C2. Hao hụt (Losses) không sửa/xóa được

API chỉ có tạo loss, không có sửa/xóa. Ghi nhầm hao hụt là chịu. Theo nguyên tắc sổ sách của chính repo (sửa sai bằng giao dịch đảo, không xóa lịch sử) → đề xuất thêm nút "Ghi bút toán đảo" cho loss nhập nhầm, thay vì sửa/xóa trực tiếp.

### C3. Dữ liệu không tự làm mới giữa nhiều người dùng

`StoreContext` tải toàn bộ data 1 lần lúc mở app. Khi có nhiều user (sau plan phân quyền): A tạo đơn xong, B phải F5 mới thấy. Đề xuất mức rẻ: refetch khi tab được focus lại + nút "Làm mới" trên bảng; chưa cần realtime.

### C4. Ghi nhận cho tương lai (chưa làm bây giờ)

- Tải toàn bộ orders/purchases lúc mở app sẽ chậm dần khi lên vài nghìn đơn → lúc đó thêm phân trang API.
- App kho hay được dùng bằng điện thoại trong kho → sau plan UI có thể cân nhắc PWA (thêm vào màn hình chính, icon app).

---

## Thứ tự khuyến nghị (ghép với 2 plan đã duyệt)

| Bước | Việc | Vì sao đứng đây |
|---|---|---|
| 1 | **A2 backup** + **B1 CI** | Không đụng code app, làm 1 đợt nhỏ, có lưới trước khi mọi việc lớn bắt đầu |
| 2 | **B2 test tiền/FIFO** | Có trước khi các plan lớn sửa nhiều code |
| 3 | Plan UI U0+U1 → Plan phân quyền Phase 0–2 → **A1 ảnh** → Phân quyền Phase 3 + UI U2–U4 | Như 2 plan đã duyệt, chèn A1 trước khi có nhiều user |
| 4 | A3 preview deploy, B3 Sentry | Bất kỳ lúc nào, đợt nhỏ độc lập |
| 5 | Nhóm C | Tùy nhu cầu thực tế |
