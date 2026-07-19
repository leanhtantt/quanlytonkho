# Memory & History Log

File nay ghi lai quyet dinh, bai hoc va moc phat trien quan trong cua du an.

---

## 2026-07-17 -> 2026-07-18 - Lo trinh 12 dot (scale + tich hop Shopee)

Tai lieu chuan: `docs/reports/2026-07-17-scaling-plan.md` (S1-S4, K1-K6) va
`docs/reports/2026-07-17-shopee-integration-plan.md` (SP1-SP6).
Quy trinh giu nguyen: Codex code -> Claude review -> merge main, moi dot 1 PR, CI xanh.

**Tien do (cap nhat 2026-07-19): xong 6/12 dot.**

- [x] Dot 1 - S1 index database (#33)
- [x] Dot 2 - S2 resolver SKU dich danh (#34)
- [x] Dot 3 - K1+K6 env Firebase + don rac + orderBy (#35)
- [x] Dot 4 - K2+K3 BusinessError + frontend khong nuot loi (#36)
- [x] Dot 5 - SP1 nen mong Shopee: schema + ShopeeClient + refresh co khoa (#37)
- [x] Dot 6 - SP2 uy quyen Shopee qua UI (#38)
- [ ] Dot 7 - SP3 mapping san pham (dang cho: kiem chung SP2 tu UI voi shop sandbox truoc)
- [ ] Dot 8 - SP4 sync don hang (loi nghiep vu, review ky nhat)
- [ ] Dot 9 - SP5 day ton kho len Shopee
- [ ] Dot 10 - S3 phan trang backend (truoc khi bat sync tu dong)
- [ ] Dot 11 - S4 frontend tai theo ky (ban thiet ke truoc khi giao)
- [ ] Dot 12 - SP6 Go-Live (thao tac tay tren Console + env Cloud Run)

No ky thuat ghi nhan (chua lam, khong quen):
- ~~Them AbortSignal.timeout cho fetch trong ShopeeClient~~ — DA LAM (hotfix sau su co treo
  "Dang xac nhan ket noi" khi kiem chung SP2: fetch khong timeout nen loi mang treo vo han).
- Sentry canh bao khi refresh token Shopee that bai.
- Nang cap 3 script sandbox cu thanh wrapper mong tren ShopeeClient.
- Regenerate Test Partner Key da lo trong chat (sandbox, rui ro thap).

Bai hoc 2026-07-18: PR merge kieu squash xong thi nhanh cu PHAI bo, Codex dung tiep
nhanh do se khong commit/push duoc va lich su lan lon (su co SP2 -> phai cherry-pick
sang nhanh sach de mo #38). Truoc moi dot: `git checkout main && git pull &&
git checkout -b codex/<ten-dot-moi>`.

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

---

## 2026-07-15 - Deploy production lan dau + fix CI

**Database chuyen sang Neon** (Postgres serverless, thay the ke hoach dung Cloud SQL). Ly do: `deploy.yml`
chi can 1 `DATABASE_URL` bat ky, khong co san VPC Connector/Cloud SQL Auth Proxy; Neon co free tier that
va tu ngu khi ranh, phu hop quy mo 1 shop. Da tung xem xet Supabase (rui ro: free tier tu pause sau 7 ngay
khong hoat dong, phai vao dashboard resume thu cong — bo qua vi app dung hang ngay nen it xay ra, nhung
Neon van an toan hon cho ca "khong ai dung 1 tuan"). Khong bat Neon Data API / Neon Auth — app da co
tang Express/Prisma rieng xu ly quyen + audit, bat Data API se bo qua het kiem tra quyen.

**Restore data that vao Neon**: dung `backend/scripts/restore.ts` (backup JSON co checksum), 8345 dong /
18 bang, verify khop voi DB local. Luu y: `restore.ts` insert tung dong tuan tu trong 1 transaction —
voi Neon o xa (us-east-1) co the mat 20-40 phut cho vai nghin dong do do tre mang, khong co tien do quan
sat duoc giua chung (chi thay ket qua khi commit xong).

**Fix bug CI nghiem trong**: dieu kien `if: contains(toJSON(github.event.commits.*.modified), ...)` trong
`deploy.yml` KHONG hoat dong voi squash-merge qua API (moi merge trong repo deu squash) — ca 2 job deploy
bi skip o TAT CA ~15 lan push gan nhat, chua tung deploy tu dong thanh cong du workflow "chay" moi lan.
Sua: bo trigger `push`, chuyen sang `workflow_dispatch` (kich hoat thu cong), bo dieu kien `if:` khong
dang tin — khop dung trietly "test xong moi deploy 1 lan". Phat hien them: Artifact Registry repo dung
sai ten (`cloud-run-source-deploy` co san, workflow can `bap-repo` chua ton tai) — da tao bo sung.

**Setup GCP cho CI** (WIF cho Cloud Run, khong dung JSON key): tao Service Account
`github-actions-deployer@tanle-dev.iam.gserviceaccount.com` (role run.admin, artifactregistry.writer,
iam.serviceAccountUser) + Workload Identity Pool/Provider gioi han chi repo `leanhtantt/quanlytonkho`.
4 GitHub Secrets can co: `DATABASE_URL`, `FIREBASE_SERVICE_ACCOUNT_TANLE_DEV`, `WIF_PROVIDER`,
`WIF_SERVICE_ACCOUNT` — da set du.

**Ket qua**: `deploy-backend` chay qua CI thanh cong (health check xac nhan `api:true, db:true`).
`deploy-frontend` qua CI **loi 403** — service account trong `FIREBASE_SERVICE_ACCOUNT_TANLE_DEV` la
`firebase-adminsdk-fbsvc@tanle-dev.iam.gserviceaccount.com` (SA cua Admin SDK, dung cho backend runtime)
thieu quyen `firebasehosting.sites.update`. **Chua sua IAM nay** (can chu du an xac nhan cap role
`Firebase Hosting Admin` cho SA hien co, hoac tao SA rieng — 2 phuong an da neu, chua chot). Thay vao do
deploy frontend thu cong qua Firebase CLI (`firebase deploy --only hosting:lynstore --project tanle-dev`,
da dang nhap san bang tai khoan chu du an) — hoat dong tot, dung cho lan deploy dau tien nay.

Sau khi backend len Cloud Run, cap nhat `.env.production` (`VITE_API_URL`) tro dung URL Cloud Run, build
sach (xoa `dist/` truoc — tich luy nhieu bundle cu qua nhieu lan build trong session), deploy Hosting.
Verify end-to-end tren production that: dang nhap admin, moi API call goi dung Cloud Run (khong con
localhost), console sach, du lieu that hien dung.

Xem chi tiet + huong dan deploy lai: `docs/deploy/README.md`.

**Con treo**: dong mat khau Neon (da lo trong 1 doan chat, chu du an chon giu nguyen roi tu xoa doan chat
do thay vi doi mat khau); IAM cho `deploy-frontend` qua CI; cold start Cloud Run vai giay sau khi ranh
(chua can `min-instances`, quy mo nho).

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
