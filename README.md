# BAP Sales & Inventory Manager

Ung dung web quan ly ban hang va ton kho cho shop phu kien cuoi BAP.

🔗 **Live**: [https://tanle-dev-lynstore.web.app](https://tanle-dev-lynstore.web.app)

## Stack ky thuat

| Thanh phan | Cong nghe |
|-----------|-----------|
| Frontend | React 19 + Vite 8, react-router-dom, recharts, lucide-react |
| Backend | Express 5 + TypeScript, Prisma ORM, PostgreSQL |
| Auth | Firebase Auth (Email/Password) — client SDK + firebase-admin middleware |
| Hosting | Firebase Hosting (site: `tanle-dev-lynstore`) |
| Backend Deploy | Google Cloud Run (Docker, Artifact Registry) |
| CI/CD | GitHub Actions — tu dong deploy khi push `main` |
| Project | GCP project: `tanle-dev` |

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
```

Deploy thu cong:

```powershell
npm run build
firebase deploy --only hosting:lynstore --project tanle-dev
```

## Cau truc du an

```text
.
├── index.html                     Entry point HTML
├── vite.config.js                 Vite config
├── firebase.json                  Firebase Hosting config (SPA rewrite, dist/)
├── .firebaserc                    Firebase project alias + hosting target
├── package.json                   Frontend dependencies
│
├── src/                           === FRONTEND ===
│   ├── main.jsx                   React entry: AuthProvider > StoreProvider > App
│   ├── App.jsx                    Layout, routing, login gate, sidebar
│   ├── index.css                  Design tokens va style global
│   │
│   ├── lib/                       --- Thu vien dung chung ---
│   │   ├── firebase.js            Firebase SDK config (apiKey, projectId...)
│   │   ├── AuthContext.jsx        React Context: login, register, logout, getToken
│   │   ├── api.js                 API client tu dong gan Bearer token
│   │   └── useLocalStorage.js     Hook luu state mock vao localStorage
│   │
│   ├── domain/                    --- Logic nghiep vu thuan (khong phu thuoc React) ---
│   │   ├── inventory.js           FIFO, gia ban tham khao, derived inventory
│   │   └── profitAnalytics.js     Gop nhom loi nhuan, dong tien, chi phi quang cao
│   │
│   ├── store/                     --- State management ---
│   │   ├── StoreContext.jsx       Raw state + API actions, auto-refetch on focus
│   │   └── appStoreContext.js     createContext export
│   │
│   ├── pages/                     --- Cac trang chinh ---
│   │   ├── Login.jsx              Dang nhap / dang ky Email-Password
│   │   ├── Dashboard.jsx          Tong quan doanh thu, don hang, ton kho
│   │   ├── Purchases.jsx          Nhap hang, phan bo phi, tao batch FIFO
│   │   ├── Products.jsx           Ton kho va chi tiet lo con lai
│   │   ├── Orders.jsx             Don hang, import Excel, doi soat doanh thu
│   │   ├── Losses.jsx             Ghi nhan hao hut theo FIFO
│   │   ├── Profit.jsx             Phan tich loi nhuan, bieu do dong tien
│   │   ├── Treasury.jsx           So quy, thu chi, chia loi nhuan
│   │   └── Settings.jsx           Cai dat kenh ban, doi tac, chi phi dong goi
│   │
│   ├── components/                (chua co component tach rieng)
│   └── assets/                    Hinh anh, SVG
│
├── backend/                       === BACKEND ===
│   ├── Dockerfile                 Multi-stage build, node:20-alpine
│   ├── package.json               Express, firebase-admin, Prisma, dotenv
│   ├── tsconfig.json              TypeScript config
│   ├── prisma.config.ts           Prisma config
│   │
│   ├── prisma/
│   │   └── schema.prisma          Database schema (10 models)
│   │
│   └── src/
│       ├── index.ts               Express server, API routes (/api/products, purchases, orders)
│       ├── prismaClient.ts        Prisma client singleton
│       ├── middlewares/
│       │   └── authMiddleware.ts   Firebase JWT verification middleware
│       └── services/
│           ├── procurementService.ts   Tao phieu nhap, phan bo chi phi
│           ├── inventoryService.ts     FIFO deduction logic
│           └── financeService.ts       Ledger / ke toan
│
├── .github/workflows/
│   └── deploy.yml                 CI/CD: 2 jobs — frontend→Firebase, backend→Cloud Run
│
├── docs/                          === TAI LIEU ===
│   ├── business_rules.md          Quy tac nghiep vu (FIFO, phan bo phi, gia ban...)
│   ├── Memory.md                  Nhat ky phat trien va quyet dinh
│   ├── ui_rules.md                Quy tac giao dien
│   └── reports/
│       ├── 2026-07-08-target-sales-architecture.md
│       └── 2026-07-08-frontend-state-audit.md
│
└── AGENTS.md                      Rang buoc cho AI agents lam viec trong repo
```

## Database schema (Prisma)

```text
Product ──< PurchaseItem >── PurchaseOrder
   │              │
   │              └──< InventoryBatch ──< StockTransaction
   │
   ├──< OrderItem >── Order
   ├──< Loss
   │
LedgerEntry (append-only, ke toan)
Reconciliation (doi soat kenh ban)
```

10 models: `Product`, `PurchaseOrder`, `PurchaseItem`, `InventoryBatch`, `StockTransaction`, `Order`, `OrderItem`, `Loss`, `Reconciliation`, `LedgerEntry`.

## Luong Authentication

```text
Browser → Firebase Auth (Email/Password) → JWT ID Token
   ↓
API request + Authorization: Bearer <token>
   ↓
Cloud Run → authMiddleware.ts → firebase-admin.verifyIdToken()
   ↓
Route handler (Prisma query)
```

- Chua dang nhap → hien trang Login
- Da dang nhap → hien app chinh voi sidebar
- `src/lib/api.js` tu dong dinh kem token vao moi request

## CI/CD Pipeline

```text
Push main
   ├── frontend thay doi (src/, index.html, package.json)
   │   → npm ci → npm run build → firebase deploy --only hosting:lynstore
   │
   └── backend thay doi (backend/)
       → Docker build → push Artifact Registry → deploy Cloud Run
```

GitHub Secrets can thiet:
- `FIREBASE_SERVICE_ACCOUNT_TANLE_DEV` — JSON key deploy Firebase
- `WIF_PROVIDER` — Workload Identity Federation provider
- `WIF_SERVICE_ACCOUNT` — Service account cho Cloud Run
- `DATABASE_URL` — PostgreSQL connection string

## Nguyen tac ky thuat

- Giao dich tien/hang phai co audit trail append-only; sua sai bang giao dich dao, khong xoa lich su.
- FIFO can duoc xu ly trong database transaction, uu tien row-level lock tren batch cu nhat.
- Logic nghiep vu thuan nam trong `src/domain/`, khong pha StoreContext.
- Import Excel phai co buoc mapping/canh bao loi ro rang.
- Khong tach microservices som; giu modular monolith.

## Tai lieu lien quan

- [docs/business_rules.md](docs/business_rules.md) — Quy tac nghiep vu chi tiet
- [docs/Memory.md](docs/Memory.md) — Nhat ky phat trien
- [docs/ui_rules.md](docs/ui_rules.md) — Quy tac giao dien
- [AGENTS.md](AGENTS.md) — Rang buoc cho AI agents
