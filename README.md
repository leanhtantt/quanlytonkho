# BAP Sales & Inventory Manager

Ung dung web quan ly ban hang va ton kho cho shop phu kien decor "Phu kien Decor".

🔗 **Live**: [https://tanle-dev-lynstore.web.app](https://tanle-dev-lynstore.web.app)

> Trang thai: lo trinh phat trien 10 dot da hoan tat, **da deploy production lan dau ngay 2026-07-15**. Xem `docs/deploy/README.md` de biet cach deploy lai.

## Stack ky thuat

| Thanh phan | Cong nghe |
|-----------|-----------|
| Frontend | React 19 + Vite, react-router-dom, recharts |
| UI | Font Plus Jakarta Sans (self-host), icon `@tabler/icons-react`, toast `sonner`, CSS token thuan (light-mode) |
| Backend | Express 5 + TypeScript, Prisma ORM |
| Database | **Neon** (Postgres serverless) o production; Postgres local/Docker o dev |
| Auth | Firebase Auth (Email/Password) + phan quyen backend (default-deny) |
| Monitoring | Sentry (FE `@sentry/react`, BE `@sentry/node`) — bat khi co DSN |
| Hosting | Firebase Hosting (site: `tanle-dev-lynstore`) |
| Backend Deploy | Google Cloud Run (Docker, Artifact Registry, WIF) |
| Project | GCP/Firebase project: `tanle-dev` |

## Chay du an

```powershell
# Frontend
npm install
npm run dev          # http://localhost:5173

# Backend
cd backend
npm install
npx prisma generate
npm run dev          # http://localhost:3000
```

Kiem tra:

```powershell
npm run build
npm run lint
npm test             # test FE (Vitest)

cd backend
npm run typecheck
npm test             # test BE (Vitest)
```

## Cau truc du an

```text
.
├── index.html                     Entry point HTML
├── vite.config.js                 Vite config (loai backend khoi vitest FE)
├── firebase.json                  Firebase Hosting config (SPA rewrite, dist/)
├── storage.rules                  Rules cho Firebase Storage (anh san pham)
│
├── src/                           === FRONTEND ===
│   ├── main.jsx                   Entry: Sentry ErrorBoundary > AuthProvider > StoreProvider > App
│   ├── App.jsx                    Layout, routing, login gate, sidebar loc theo quyen
│   │
│   ├── lib/
│   │   ├── firebase.js            Firebase SDK config
│   │   ├── AuthContext.jsx        Context: login/logout/getToken, profile + quyen (can())
│   │   ├── api.js                 API client tu dong gan Bearer token
│   │   └── sentry.js              Khoi tao Sentry FE (chi khi co VITE_SENTRY_DSN + PROD)
│   │
│   ├── domain/                    --- Logic nghiep vu thuan (khong phu thuoc React) ---
│   │   ├── inventory.js           FIFO, gia ban tham khao, derived inventory
│   │   ├── profitAnalytics.js     Gop nhom loi nhuan, dong tien, chi phi quang cao
│   │   ├── dashboardAnalytics.js  Tong hop so lieu Dashboard theo ngay
│   │   ├── imageStorage.js        Upload/xoa anh san pham qua Firebase Storage
│   │   └── productSku.js          Doi chieu SKU/alias san pham
│   │
│   ├── store/
│   │   ├── StoreContext.jsx       Raw state + API actions; tai data theo onAuthStateChanged, refetch on focus
│   │   └── appStoreContext.js     createContext export
│   │
│   ├── pages/
│   │   ├── Login.jsx              Dang nhap (da bo dang ky tu do)
│   │   ├── Dashboard.jsx          Tong quan doanh thu, don hang, ton kho (data that)
│   │   ├── Purchases.jsx          Nhap hang, phan bo phi, tao batch FIFO
│   │   ├── Products.jsx           Ton kho va chi tiet lo con lai
│   │   ├── Orders.jsx             Don hang, import Excel, doi soat doanh thu
│   │   ├── Losses.jsx             Dieu chinh kho / hao hut (sua bang giao dich dao)
│   │   ├── Profit.jsx             Phan tich loi nhuan, bieu do dong tien
│   │   ├── Treasury.jsx           So quy, thu chi, chia loi nhuan
│   │   ├── Settings.jsx           Cai dat kenh ban, doi tac, chi phi
│   │   ├── Users.jsx              Quan ly nguoi dung + ma tran quyen (admin-only)
│   │   └── Activity.jsx           Lich su hoat dong (activity log, admin-only)
│   │
│   ├── components/ui/             Bo component chuan: Button, Modal, ConfirmDialog,
│   │                             Toast, Skeleton, EmptyState, StatCard, PageHeader,
│   │                             Badge, FormField, SearchInput, Spinner
│   └── styles/                    tokens.css, base.css, components.css, layout.css
│
├── backend/                       === BACKEND ===
│   ├── Dockerfile                 Multi-stage build
│   ├── prisma/
│   │   ├── schema.prisma          Database schema (18 models)
│   │   └── migrations/            Prisma migrations
│   ├── scripts/                   backup.ts, restore.ts, backup-dump.ps1, setAdminClaim.ts, wipe.ts...
│   └── src/
│       ├── index.ts               Express server + Sentry init
│       ├── routes.ts              Dinh nghia route + requirePermission theo tab
│       ├── routes/                users.ts (admin), activity.ts
│       ├── audit/                 Activity log (Prisma extension + AsyncLocalStorage)
│       ├── middlewares/
│       │   └── authMiddleware.ts   Verify JWT + default-deny + requirePermission
│       └── services/              procurement, inventory, finance, ...
│
├── docs/                          === TAI LIEU ===
│   ├── business_rules.md          Quy tac nghiep vu (FIFO, phan bo phi...)
│   ├── ui_rules.md                Design system v2 (Premium Light)
│   ├── Memory.md                  Nhat ky phat trien va quyet dinh
│   ├── deploy/                    Runbook deploy that (hien tai da deploy production)
│   └── reports/                   Cac plan da duyet (phan quyen, UI, de xuat bo sung)
│
└── AGENTS.md                      Rang buoc cho AI agents lam viec trong repo
```

## Database schema (Prisma) — 18 models

Nghiep vu kho/ban hang: `Product`, `ProductSkuAlias`, `PurchaseOrder`, `PurchaseItem`,
`InventoryBatch`, `StockTransaction`, `Order`, `OrderItem`, `Loss`, `InventoryAdjustment`,
`Reconciliation`.

Tien te/so quy: `LedgerEntry` (append-only), `TreasuryTransaction`, `MonthlyAdExpense`,
`AdAdvanceReimbursement`, `AppSettings`.

Phan quyen & audit: `User` (role + ma tran quyen), `ActivityLog` (append-only).

## Phan quyen (default-deny)

- Backend la noi cuong che quyen; frontend chi an/hien UI theo `can(resource, action)`.
- Tai khoan dang nhap Firebase nhung KHONG co record `User` (do admin tao) -> 403.
- **Admin duy nhat** duoc set qua Firebase custom claim (`{ admin: true }`) bang script
  `npm run set-admin -- <email>`; khong co API nao nang/tao admin.
- Quyen luu dang ma tran `resource x action` (view/create/update/delete) trong bang `User`,
  co hieu luc ngay o request ke tiep. `GET /api/me` tra ve quyen cho frontend.
- Khong xoa user, chi vo hieu hoa (`isActive: false` + revoke refresh token).

## Luong Authentication

```text
Browser -> Firebase Auth (Email/Password) -> JWT ID Token
   -> API request + Authorization: Bearer <token>
   -> authMiddleware: verifyIdToken -> (admin claim? full quyen : tra bang User)
   -> requirePermission(resource, action) -> Route handler (Prisma)
```

## Activity Log

- Moi thao tac CRUD nghiep vu duoc ghi tu dong qua Prisma extension + `AsyncLocalStorage`
  (khong sua tung service), kem `before`/`after`, nguoi thuc hien, IP.
- Them su kien dang nhap va thao tac quan ly user.
- `GET /api/activity` (quyen `activity`, mac dinh admin) + trang `Activity.jsx` co loc/phan trang.

## Backup / Restore

- `npm run db:backup` -> ban JSON co checksum (`backend/backups/`), restore an toan bang
  `npm run db:restore` (doi DB dich rong + xac nhan; xem huong dan trong scripts).
- `npm run db:backup:dump` -> ban pg_dump custom format (`.dump`) de phuc hoi nguyen trang.
- Chi tiet 2 dinh dang va khi nao dung cai nao: xem `docs/Memory.md`.

## Deploy

Xem `docs/deploy/README.md` de biet chi tiet (trigger, cach deploy backend/frontend, luu y ve IAM). Tom tat:
- Deploy chi chay khi **kich hoat thu cong** (`workflow_dispatch`), khong tu dong theo push.
- Backend: `gh workflow run "Build and Deploy" --ref main` (deploy len Cloud Run qua WIF).
- Frontend: hien phai deploy thu cong qua Firebase CLI (`npm run build && firebase deploy --only hosting:lynstore --project tanle-dev`) do IAM cua service account CI chua du quyen Hosting.

## Monitoring (Sentry)

- Tu dong tat khi khong co DSN (app chay binh thuong).
- Cau hinh `VITE_SENTRY_DSN` (FE) / `SENTRY_DSN` (BE) khi muon bat; PII bi loc o backend.

## Nguyen tac ky thuat

- Giao dich tien/hang phai co audit trail append-only; sua sai bang giao dich dao, khong xoa lich su.
- FIFO xu ly trong database transaction, uu tien lock tren batch cu nhat.
- Logic nghiep vu thuan nam trong `src/domain/`; mutation trong store `throw` de component xu ly loading/toast.
- Import Excel phai co buoc mapping/canh bao loi ro rang.
- Khong tach microservices som; giu modular monolith.
- UI: chi dung token CSS (cam hard-code mau), icon Tabler, component chuan trong `src/components/ui/`.

## Tai lieu lien quan

- [docs/business_rules.md](docs/business_rules.md) — Quy tac nghiep vu chi tiet
- [docs/ui_rules.md](docs/ui_rules.md) — Design system v2
- [docs/Memory.md](docs/Memory.md) — Nhat ky phat trien
- [docs/reports/](docs/reports/) — Cac plan da duyet va bao cao
- [AGENTS.md](AGENTS.md) — Rang buoc cho AI agents
```
