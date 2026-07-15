# Plan: Hệ thống phân quyền + Lịch sử hoạt động (Activity Log)

Ngày: 2026-07-13
Trạng thái: **Đã triển khai xong 2026-07-15** (Đợt 4, 5, 7 của lộ trình — PR #8, #9, #10, #11). Tài liệu giữ làm nguồn thiết kế; các quyết định chốt ở mục 6.

---

## 1. Hiện trạng (đã khảo sát code)

| Thành phần | Hiện tại | Vấn đề |
|---|---|---|
| Đăng nhập | Firebase Auth (email/password), client SDK | OK |
| Đăng ký | `Login.jsx` có nút "Đăng ký" tự do, `AuthContext.jsx` export `register` | **Bất kỳ ai cũng tự tạo được tài khoản** |
| Backend auth | `authMiddleware.ts` chỉ verify ID token | **Mọi tài khoản đăng nhập đều có FULL quyền mọi API** |
| Phân quyền | Chưa có role/permission ở bất kỳ đâu | Cần xây mới |
| Activity log | Chưa có (chỉ có `StockTransaction`/`LedgerEntry` là audit nghiệp vụ kho/tiền, không ghi "ai làm") | Cần xây |

Các tab hiện có (trong `App.jsx`): Dashboard, Nhập Hàng (purchases), Tồn Kho (products), Xuất Bán (orders), Hao Hụt (losses), Lợi Nhuận (profit), Sổ Quỹ (treasury), Cài Đặt (settings).

---

## 2. Thiết kế tổng thể

### 2.1. Nguyên tắc

1. **Backend là nơi cưỡng chế quyền (source of truth)** — frontend chỉ ẩn/hiện UI. Ẩn nút ở UI mà không chặn API thì ai biết gọi API vẫn phá được.
2. **Default deny**: tài khoản đăng nhập được Firebase nhưng KHÔNG có record trong bảng `User` (do admin tạo) → backend từ chối 403. Điều này quan trọng vì Firebase email/password không có công tắc "tắt tự đăng ký" — kể cả khi xóa nút Đăng ký trên web, ai đó vẫn có thể gọi thẳng Firebase SDK để tạo account. Default deny vô hiệu hóa hoàn toàn kẽ hở này.
3. **Admin duy nhất**: role `admin` chỉ được set qua **Firebase Custom Claim**, không có API nào của web set được. Backend không bao giờ cho phép tạo/nâng user lên admin.

### 2.2. Mô hình quyền

- **Resource** = tab/module: `dashboard`, `purchases`, `products`, `orders`, `losses`, `profit`, `treasury`, `settings`, `users` (quản lý người dùng), `activity` (lịch sử hoạt động).
- **Action**: `view`, `create`, `update`, `delete`.
- Quyền của 1 user = ma trận resource × action, lưu dạng JSON trong bảng `User`:

```json
{
  "purchases": ["view", "create", "update"],
  "orders":    ["view", "create", "update", "delete"],
  "products":  ["view"],
  "dashboard": ["view"]
}
```

- **Role** chỉ là nhãn + preset để admin gán nhanh, quyền thực tế vẫn là ma trận trên (admin gán preset rồi tick chỉnh từng ô):
  - `admin`: full quyền, bỏ qua mọi check (không lưu ma trận).
  - `manager` (preset): full các tab nghiệp vụ, không có `users`/`activity`.
  - `staff` (preset): view + create + update trên purchases/products/orders/losses, không delete, không profit/treasury/settings.
  - `viewer` (preset): chỉ view.

Ưu điểm cách này: đúng yêu cầu "admin cài đặt cho từng tài khoản được xem/xóa/sửa, truy cập tab nào" — linh hoạt tới từng ô, không bị cứng theo role.

### 2.3. Vì sao permissions lưu ở Postgres, chỉ `admin: true` là custom claim?

- Custom claim giới hạn 1000 bytes, không chứa nổi ma trận quyền.
- Claim nằm trong ID token → đổi quyền phải đợi token refresh (~1h) hoặc bắt re-login. Lưu Postgres → **đổi quyền có hiệu lực ngay** ở request kế tiếp.
- Claim `admin: true` chỉ dùng để bootstrap admin duy nhất (không phụ thuộc DB), set 1 lần bằng script.

### 2.4. Schema Prisma mới

```prisma
model User {
  id          String   @id            // Firebase UID
  email       String   @unique
  displayName String?
  role        String   @default("staff")   // "manager" | "staff" | "viewer" (admin KHÔNG nằm trong bảng này)
  permissions Json     @default("{}")      // ma trận resource -> actions
  isActive    Boolean  @default(true)
  createdBy   String?                      // uid admin tạo
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

model ActivityLog {
  id         String   @id @default(uuid())
  actorUid   String                        // ai làm
  actorEmail String
  action     String                        // "create" | "update" | "delete" | "login" | ...
  resource   String                        // "orders", "purchases", "users", ...
  targetId   String?                       // id bản ghi bị tác động
  targetLabel String?                      // tên/mã dễ đọc (VD mã đơn) để hiển thị
  before     Json?                         // dữ liệu trước (update/delete)
  after      Json?                         // dữ liệu sau (create/update)
  ipAddress  String?
  createdAt  DateTime @default(now())

  @@index([actorUid, createdAt])
  @@index([resource, createdAt])
}
```

`ActivityLog` là bảng **append-only**: không có API update/delete (kể cả admin chỉ được xem).

---

## 3. Kế hoạch triển khai theo phase

### Phase 0 — Khóa cửa (nhỏ, làm ngay được)

1. Xóa toàn bộ UI/logic đăng ký: `Login.jsx` (nút + state `isRegister`), `AuthContext.jsx` (hàm `register`, import `createUserWithEmailAndPassword`).
2. Script `backend/scripts/setAdminClaim.ts`: nhận UID/email, set custom claim `{ admin: true }` bằng firebase-admin. Chạy tay 1 lần với service account sau khi anh tạo tài khoản admin trong Firebase Console. (Lưu ý: Firebase Console **không có UI** set custom claim, bắt buộc phải qua script/Admin SDK — đây chính là bước "nâng quyền lên admin" anh mô tả.)

### Phase 1 — Backend: bảng User + middleware phân quyền

1. Migration thêm model `User` (và `ActivityLog` luôn trong cùng migration).
2. Mở rộng `authMiddleware.ts`:
   - Verify token như cũ → decoded.
   - Nếu claim `admin === true` → `req.user.isAdmin = true`, full quyền.
   - Ngược lại: tra bảng `User` theo uid (cache in-memory TTL ~60s để không query mỗi request). Không có record hoặc `isActive = false` → 403. Có → gắn `req.permissions`.
3. Middleware mới `requirePermission(resource, action)` — gắn vào từng route trong `routes.ts`. Mapping:

   | Route | Resource | Action theo method |
   |---|---|---|
   | `/api/products*` | `products` | GET=view, POST=create, PUT=update |
   | `/api/purchases*` | `purchases` | GET=view, POST=create, PUT=update, DELETE=delete |
   | `/api/orders*` | `orders` | tương tự |
   | `/api/losses*` | `losses` | GET=view, POST=create |
   | `/api/treasury/*` | `treasury` | tương tự |
   | `/api/settings` | `settings` | GET=view, PUT=update |
   | `/api/inventory` | `products` | view |

   Lưu ý về `dashboard`/`profit` (đã chốt là resource riêng): 2 tab này không có API riêng mà tổng hợp từ data các API trên ở phía client, nên quyền được cưỡng chế ở 2 lớp: (a) frontend chặn tab/route theo `dashboard: view` / `profit: view`; (b) user không có quyền `view` các resource nguồn (orders, purchases, treasury...) thì API nguồn cũng đã trả 403. Nếu sau này thêm endpoint tổng hợp riêng thì gắn `requirePermission('profit'|'dashboard', 'view')` vào đó.

4. Endpoint `GET /api/me`: trả `{ uid, email, role, isAdmin, permissions, isActive }` — frontend gọi sau khi đăng nhập.

### Phase 2 — Backend: API quản lý người dùng (admin-only)

Middleware `requireAdmin` cho nhóm `/api/users`:

- `GET /api/users` — danh sách.
- `POST /api/users` — tạo: dùng `firebase-admin.auth().createUser({ email, password })` + insert bảng `User` với role/permissions admin chọn. **Từ chối mọi payload có role admin.**
- `PUT /api/users/:uid` — sửa role/permissions/displayName/isActive. Khi `isActive → false`: đồng thời gọi `revokeRefreshTokens(uid)` để đá phiên đang đăng nhập.
- `POST /api/users/:uid/reset-password` — admin đặt mật khẩu mới qua Admin SDK.
- **Không có endpoint xóa user** (quyết định đã chốt: chỉ disable qua `PUT` với `isActive: false`, kèm `disableUser` phía Firebase để chặn cả đăng nhập). Giữ record + lịch sử vĩnh viễn.
- Chặn admin tự thao tác lên chính uid có claim admin (không cho disable admin).

Yêu cầu hạ tầng: backend (Cloud Run) cần quyền Admin SDK đầy đủ — hiện `initializeApp({ projectId })` chỉ đủ verify token; cần Application Default Credentials của service account có role `Firebase Authentication Admin` (trên Cloud Run thường đã sẵn ADC, chỉ cần cấp role).

### Phase 3 — Frontend: guard theo quyền + trang quản lý người dùng

1. `AuthContext.jsx`: sau khi có Firebase user → gọi `/api/me`; expose `profile`, `isAdmin`, helper `can(resource, action)`. Nếu `/api/me` trả 403 → màn hình "Tài khoản chưa được cấp quyền, liên hệ quản trị viên" + nút đăng xuất.
2. `App.jsx`:
   - Sidebar: lọc `menuItems` theo `can(resource, 'view')` — bao gồm cả Dashboard và Lợi Nhuận (đã chốt là quyền riêng); thêm 2 mục sidebar riêng "Người dùng" và "Lịch sử hoạt động" (đã chốt: không gộp vào Cài Đặt), hiện theo quyền `users: view` / `activity: view` (mặc định chỉ admin).
   - Route guard: vào route không đủ quyền → redirect về tab đầu tiên có quyền.
3. Từng page: bọc các nút Thêm/Sửa/Xóa bằng `can(...)` (ẩn hoặc disable). Đây là phần rải rác nhiều file nhất (Purchases, Products, Orders, Losses, Treasury, Settings) nhưng mỗi chỗ chỉ là 1 điều kiện render.
4. Trang mới `src/pages/Users.jsx` (admin-only):
   - Bảng user: email, tên, role, trạng thái, ngày tạo.
   - Form tạo user: email + mật khẩu tạm + chọn preset role.
   - **Ma trận quyền**: bảng checkbox hàng = tab, cột = Xem/Thêm/Sửa/Xóa; chọn preset role tự tick, admin chỉnh từng ô rồi lưu.
   - Nút bật/tắt tài khoản, đặt lại mật khẩu.

### Phase 4 — Activity Log

#### Kết quả khảo sát giải pháp có sẵn (đỡ phải tự code)

| Giải pháp | Loại | Đánh giá cho dự án này |
|---|---|---|
| **[@explita/prisma-audit-log](https://www.npmjs.com/package/@explita/prisma-audit-log)** | Prisma extension (npm) | ✅ **Khuyến nghị.** Tự động log create/update/delete mọi model, có `getContext` để gắn userId/IP, lọc field nhạy cảm, bỏ qua update chỉ đổi `updatedAt`. Khớp đúng stack Express + Prisma + Postgres hiện tại. Việc phải tự code chỉ còn: truyền user context qua `AsyncLocalStorage` từ middleware + trang UI hiển thị. |
| [Mẫu chính thức của Prisma: audit-log-context](https://github.com/prisma/prisma-client-extensions/tree/main/audit-log-context) | Code mẫu chính thức | ✅ **Phương án dự phòng** nếu `@explita/prisma-audit-log` không tương thích Prisma 7 (cần verify khi bắt đầu code — điểm rủi ro duy nhất). Copy template ~100–150 dòng, vẫn không phải "code lại toàn bộ". |
| [mediavine/prisma-audit-log-extension](https://github.com/mediavine/prisma-audit-log-extension) | Prisma extension | Tương tự explita, ít tài liệu hơn — phương án dự phòng 2. |
| [Bemi](https://github.com/BemiHQ/bemi-prisma) | CDC platform | ❌ Rất mạnh (đọc WAL của Postgres, không sót thay đổi nào) nhưng cần hạ tầng riêng/dịch vụ trả phí — quá cỡ cho app 1 shop. |
| GCP Cloud Audit Logs / Firebase | Hạ tầng | ❌ Chỉ log thao tác hạ tầng GCP, không log nghiệp vụ trong Postgres. |
| pgAudit / trigger thuần Postgres | DB-level | ❌ pgAudit ghi ra log file khó làm UI; trigger thuần không biết "ai làm" (Firebase uid nằm ở tầng app), phải truyền qua session var — phức tạp hơn Prisma extension mà không lợi hơn. |

#### Việc cần làm

1. Cài `@explita/prisma-audit-log`, cấu hình trên `prismaClient.ts` (exclude bảng `ActivityLog` chính nó; mask field nhạy cảm nếu có).
2. Middleware Express: đặt `{ uid, email, ip }` vào `AsyncLocalStorage` sau khi verify token → `getContext` của extension đọc từ đó. Nhờ vậy **mọi service hiện có (procurement/order/finance, kể cả trong `$transaction`) tự được log, không sửa từng service**.
3. Log thêm 2 sự kiện ngoài CRUD: đăng nhập (ghi ở lần gọi `/api/me` đầu phiên) và các thao tác quản lý user (create/disable/reset-password — ghi thủ công trong route users).
4. `GET /api/activity` (quyền `activity: view`, mặc định chỉ admin): phân trang, filter theo user / resource / action / khoảng ngày.
5. Trang `src/pages/Activity.jsx`: bảng thời gian – người thực hiện – hành động – đối tượng, bấm vào 1 dòng xem chi tiết before/after; bộ lọc + phân trang.
6. Giữ log gọn: chính sách dọn log > 12 tháng (script thủ công, chưa cần cron).

---

## 4. Thứ tự làm + khối lượng ước tính

| Phase | Nội dung | Phụ thuộc | Ước lượng |
|---|---|---|---|
| 0 | Chặn tự đăng ký + script set admin claim | — | Nhỏ (~2 file + 1 script) |
| 1 | Bảng User + ActivityLog + middleware phân quyền + `/api/me` | 0 | Trung bình |
| 2 | API quản lý user (admin) | 1 | Trung bình |
| 3 | Frontend guard + trang Users | 1, 2 | Lớn nhất (rải nhiều page) |
| 4 | Activity log (extension + API + trang Activity) | 1 | Trung bình |

Phase 0+1 nên gộp 1 đợt giao việc; 2+3 một đợt; 4 một đợt độc lập (chỉ cần Phase 1 xong).

## 5. Checklist kiểm thử khi triển khai

- Tài khoản Firebase tự tạo ngoài luồng (gọi SDK trực tiếp) → mọi API trả 403, UI hiện màn "chưa được cấp quyền".
- User bị bỏ quyền `delete` trên orders → nút xóa biến mất VÀ gọi thẳng API DELETE trả 403.
- Disable user đang đăng nhập → request kế tiếp bị 403 (sau TTL cache ≤60s).
- Không API nào tạo/nâng được admin; không disable/xóa được admin.
- Sửa 1 đơn hàng → ActivityLog có dòng update kèm before/after và đúng email người sửa.
- Admin đổi quyền user → hiệu lực ngay không cần re-login.

## 6. Quyết định đã chốt (duyệt ngày 2026-07-13)

1. **Tab "Người dùng" và "Lịch sử hoạt động" là 2 mục riêng trong Sidebar**, không gộp vào Cài Đặt. Hiện với admin (hoặc user được cấp quyền `users`/`activity` tương ứng).
2. **`dashboard` và `profit` là resource riêng, cấp quyền được** — user không có quyền `dashboard: view` / `profit: view` sẽ không thấy tab và không xem được số liệu tổng hợp.
3. **Không xóa hẳn user, chỉ disable** — không làm endpoint `DELETE /api/users/:uid`; vô hiệu hóa qua `PUT` với `isActive: false` (kèm revoke refresh token). Record và lịch sử hoạt động của user được giữ vĩnh viễn.
