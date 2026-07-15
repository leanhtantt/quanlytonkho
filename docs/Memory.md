# Memory & History Log

File nay ghi lai quyet dinh, bai hoc va moc phat trien quan trong cua du an.

---

## 2026-07-13 -> 2026-07-15 - Lo trinh 10 dot (backend that + phan quyen + UI + audit)

Chuyen tu MVP (mock/localStorage) sang san pham that, chay theo lo trinh 10 dot.
Quy trinh: Codex code -> review doi chieu tai lieu -> merge vao `main` (branch protection, CI xanh).
Tai lieu chuan: `docs/reports/2026-07-13-*.md`.

Cac dot da hoan tat:
- **Dot 1-2**: Backup DB (JSON co checksum + pg_dump) + khoa `wipe.ts` + CI build/lint/test tren PR; test tien/FIFO.
- **Dot 3**: UI foundation - token CSS, font Plus Jakarta Sans (self-host), icon Tabler (bo lucide),
  bo component chuan `src/components/ui/`, toast `sonner`, ConfirmDialog (bo alert/confirm). Mau chu dao teal `#0f766e`.
- **Dot 4-5**: Phan quyen backend default-deny (`requirePermission`, `/api/me`, admin qua Firebase custom claim,
  khong API nang admin, chi disable khong xoa user) + API quan ly user admin-only + frontend guard + trang `Users.jsx` (ma tran quyen).
- **Dot 6**: Anh san pham -> Firebase Storage (`storage.rules`, bucket `tanle-dev.firebasestorage.app`).
- **Dot 7**: Activity Log - Prisma extension + AsyncLocalStorage tu dong ghi CRUD, `GET /api/activity`, trang `Activity.jsx`.
- **Dot 8**: UI redesign toan bo 9 trang (xoa ~328 inline style, dung component chuan, loading/toast moi mutation),
  design system v2 = `docs/ui_rules.md`. Sidebar them Nguoi dung + Lich su hoat dong.
- **Dot 9**: Sentry FE/BE (tat khi khong co DSN, loc PII) + workflow deploy preview de xuat (`docs/deploy/`).
- **Dot 10**: Refetch da user (on-focus + nut Lam moi); C1 Dashboard da dung data that; C2 sua/xoa loss da co san
  (backend `replaceLoss`/`deleteLoss` + `reverseLossEffects`), chot dung cach hien tai (Activity Log da ghi dau vet).

Bug bat duoc khi QA (2026-07-15): `StoreContext` goi API luc mount truoc khi Firebase cap token -> 401,
data khong hien. Da sua: tai data theo `onAuthStateChanged` (chi fetch khi co token).

Quyet dinh chot: teal `#0f766e`; brand "Phu kien Decor"; font Plus Jakarta Sans; toast sonner; icon Tabler;
chi light-mode; 1 admin duy nhat qua custom claim; khong xoa user/lich su.

Con lai: test tong the local roi deploy MOT LAN (chu du an tu lam). Luu y khi deploy: reconcile migration,
`deploy.yml` co `if:` bi loi (job deploy skip), workflow files can push thu cong, `set-admin` can service account key `tanle-dev`.

---

## 2026-07-09 - Firebase Hosting + Auth + CI/CD

### Firebase Hosting
- Tao Firebase Hosting site `tanle-dev-lynstore` trong project `tanle-dev`.
- URL live: https://tanle-dev-lynstore.web.app
- Config: `firebase.json` (SPA rewrite, serve tu `dist/`), `.firebaserc` (target `lynstore`).
- Deploy thanh cong 15 files tu `npm run build`.

### Firebase Web App
- Tao web app `lynstore` — App ID: `1:1010177787437:web:c2a6994effe0cdb8de9aa4`.
- Firebase SDK config luu tai `src/lib/firebase.js`.

### Firebase Authentication (Email/Password)
- Bat Email/Password sign-in qua Identity Toolkit REST API.
- Them authorized domains: `tanle-dev-lynstore.web.app`, `tanle-dev-lynstore.firebaseapp.com`.
- Frontend: `src/lib/AuthContext.jsx` wrap React Context voi login, register, logout, getToken.
- Trang Login: `src/pages/Login.jsx` — form dang nhap/dang ky, hien loi tieng Viet.
- Login gate trong `App.jsx`: chua auth → hien Login; da auth → hien app + sidebar co email va nut Dang xuat.

### API Client
- Tao `src/lib/api.js`: moi request tu dong dinh kem `Authorization: Bearer <token>`.
- Dung env var `VITE_API_URL` de tro ve Cloud Run backend (fallback localhost:3000).

### CI/CD (deploy.yml)
- Tach thanh 2 jobs doc lap:
  - `deploy-frontend`: npm ci → build → firebase deploy (dung `FIREBASE_SERVICE_ACCOUNT_TANLE_DEV` secret).
  - `deploy-backend`: Docker build → push Artifact Registry → deploy Cloud Run (dung WIF).
- Project ID trong workflow da doi sang `tanle-dev`.
- Cac gia tri nhay cam (WIF provider, service account, DATABASE_URL) chuyen sang GitHub Secrets.

### CSS
- Them style cho login page (gradient background, card centered, animation).
- Them sidebar footer (email user, nut Dang xuat mau do).

### Ghi chu
- GitHub Secrets chua duoc thiet lap — can tao service account + key va add vao repo Settings > Secrets.
- Cloud Run backend chua deploy lan dau — can tao Artifact Registry repo `bap-repo` va chay workflow.
- Frontend hien van dung localStorage cho data (StoreContext); chua chuyen sang goi API that.
- Cai dat `firebase` npm package (v11+) tang bundle size ~100KB gzipped.

---

## 2026-07-08 - Profit Analytics Feature

- Bo sung trang `Profit` de phan tich loi nhuan hang thang, nhap chi phi quang cao.
- Logic gop nhom duoc tach ra module thuan `src/domain/profitAnalytics.js` co the import tu Node, dam bao TDD.
- Tinh doanh thu dong tien (cash-month) bang cach shift thoi gian +15 ngay.
- Them bieu do BarChart su dung `recharts`.

## 2026-07-08 - Architecture review va init boi canh repo

- Quyet dinh huong toi uu: modular monolith + PostgreSQL, chua tach microservices som.
- Tao `AGENTS.md` de ghi lenh kiem chung, rang buoc nghiep vu va tai lieu can doc.
- Cap nhat `README.md` thanh ban ro rang, de chay va de tiep tuc phat trien.
- Tao 2 report:
  - `docs/reports/2026-07-08-target-sales-architecture.md`
  - `docs/reports/2026-07-08-frontend-state-audit.md`
- Ghi nhan rui ro lon nhat: state dang nam trong React memory, FIFO chua co transaction/audit trail, Dashboard dang dung du lieu demo.

## 2026-07-08 - Local mock persistence va refactor FIFO

- Chua gan database that; giai do hien tai uu tien mock data de test nghiep vu.
- Them `src/lib/useLocalStorage.js` de luu `products`, `purchases`, `orders`, `losses` vao `localStorage`.
- Tach logic FIFO, derived inventory va gia ban tham khao sang `src/domain/inventory.js`.
- `StoreContext.jsx` chi con giu raw state/actions va goi domain function de tinh du lieu phai sinh.

## 2026-07-08 - Backend skeleton

- Init backend Express + TypeScript + Prisma.
- Thiet ke Prisma schema 10 models: Product, PurchaseOrder, PurchaseItem, InventoryBatch, StockTransaction, Order, OrderItem, Loss, Reconciliation, LedgerEntry.
- Tao 3 service: procurementService (nhap hang), inventoryService (FIFO deduction), financeService (ledger).
- Tao authMiddleware.ts voi firebase-admin de verify JWT token.
- API routes: GET/POST /api/products, POST /api/purchases, POST /api/orders — tat ca boc qua requireAuth.
- Tao Dockerfile multi-stage build.
- Tao GitHub Actions workflow deploy.yml cho Cloud Run (Workload Identity Federation).

---

## Cac giai do truoc

### Giai do 1: Khoi tao va thiet ke giao dien MVP

- Khoi tao project React bang Vite.
- Tao layout co sidebar va cac trang Dashboard, Products, Orders.
- Dung CSS tu viet cho design system light/dark.

### Giai do 2: Bo sung luong nghiep vu shop order

- Tao trang `Purchases` cho nhap hang va phan bo chi phi.
- Tao trang `Losses` cho hao hut.
- Dung `StoreContext` de lien ket luong Nhap hang -> Kho -> Xuat ban.

### Giai do 3: Chuyen sang ke toan FIFO

- Luu ton kho theo lo hang/batch.
- Tru lo cu nhat khi ban hang hoac ghi hao hut.
- Trang `Products` co the xem chi tiet cac lo con ton.

### Giai do 4: Toi uu form nhap hang

- Bo ty gia trong form, nhap truc tiep VND.
- Dung tong tien mua va tong can nang de phan bo chi phi.
- Bo sung giam gia va boi thuong phan bo theo ty trong gia tri.

### Giai do 5: So quy va Cai dat

- Trang `Treasury`: quan ly thu chi, chia loi nhuan theo doi tac.
- Trang `Settings`: cai dat kenh ban, doi tac, chi phi dong goi mac dinh.
