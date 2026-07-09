# Kế hoạch Migration: localStorage → Local PostgreSQL → Google Cloud

> **Ngày**: 2026-07-09  
> **Mục tiêu**: Chuyển toàn bộ dữ liệu từ localStorage sang PostgreSQL local, test với data thật, sau đó deploy lên Google Cloud  
> **Trạng thái**: 📋 Chờ duyệt

---

## Tổng quan lộ trình

```
  HIỆN TẠI                    GIAI ĐOẠN 1                   GIAI ĐOẠN 2
┌──────────┐              ┌──────────────────┐          ┌──────────────────┐
│ Frontend │              │    Frontend      │          │    Frontend      │
│ React    │              │    React         │          │    React         │
│    │     │              │      │           │          │      │           │
│    ▼     │              │      ▼           │          │      ▼           │
│ local    │  ────────►   │  API calls       │  ──────► │  API calls       │
│ Storage  │              │  (localhost:3000) │          │  (Cloud Run URL) │
│          │              │      │           │          │      │           │
└──────────┘              │      ▼           │          │      ▼           │
                          │  Express API     │          │  Cloud Run       │
                          │      │           │          │      │           │
                          │      ▼           │          │      ▼           │
                          │  PostgreSQL      │          │  Cloud SQL /     │
                          │  (local)         │          │  Supabase        │
                          └──────────────────┘          └──────────────────┘

                          ← BẠN ĐANG Ở ĐÂY →
```

---

## Giai đoạn 1: Local PostgreSQL + Backend API (ưu tiên làm ngay)

### Bước 1.1 — Cài PostgreSQL local

> [!NOTE]
> Bạn đang dùng Prisma Postgres (cloud proxy). Có 2 lựa chọn:
> - **Giữ Prisma Postgres**: Không cần cài gì thêm, đã hoạt động
> - **Cài PostgreSQL thật**: Download từ https://www.postgresql.org/download/windows/

Nếu cài PostgreSQL thật, đổi `backend/.env`:
```diff
- DATABASE_URL="prisma+postgres://accelerate.prisma-data.net/?api_key=..."
+ DATABASE_URL="postgresql://postgres:your_password@localhost:5432/bap_inventory"
```

### Bước 1.2 — Sửa lỗi schema trước khi migrate

Sửa file `backend/prisma/schema.prisma`:

```diff
  // ===== 1. Đổi Float → Decimal cho tất cả trường tiền =====

  model PurchaseItem {
-   totalCost          Float
-   totalWeight        Float
+   totalCost          Decimal  @db.Decimal(15, 2)
+   totalWeight        Decimal  @db.Decimal(10, 3)
  }

  model InventoryBatch {
-   unitCost           Float
+   unitCost           Decimal  @db.Decimal(15, 2)
  }

  model StockTransaction {
-   unitCost           Float
+   unitCost           Decimal  @db.Decimal(15, 2)
  }

  model Order {
-   expectedRevenue    Float
-   actualRevenue      Float?
+   expectedRevenue    Decimal  @db.Decimal(15, 2)
+   actualRevenue      Decimal? @db.Decimal(15, 2)
  }

  model OrderItem {
-   sellingPrice       Float
+   sellingPrice       Decimal  @db.Decimal(15, 2)
  }

  model Reconciliation {
-   expectedAmount     Float
-   actualAmount       Float
+   expectedAmount     Decimal  @db.Decimal(15, 2)
+   actualAmount       Decimal  @db.Decimal(15, 2)
  }

  model LedgerEntry {
-   amount             Float
+   amount             Decimal  @db.Decimal(15, 2)
  }
```

### Bước 1.3 — Chạy migration

```bash
cd backend
npx prisma migrate dev --name init
```

Lệnh này tạo tất cả bảng trong PostgreSQL từ schema.

### Bước 1.4 — Sửa bug financeService (transaction không atomic)

File `backend/src/services/financeService.ts` — `deductStockFIFO()` chạy transaction riêng bên trong transaction của `recordLoss()`. Cần refactor `deductStockFIFO` nhận `tx` từ bên ngoài:

```diff
  // inventoryService.ts
- export async function deductStockFIFO(productId, qty, referenceType, referenceId) {
-   return await prisma.$transaction(async (tx) => {
+ export async function deductStockFIFO(
+   productId: string, qty: number, referenceType: string, referenceId: string,
+   tx?: any  // optional: dùng transaction bên ngoài nếu có
+ ) {
+   const run = async (client: any) => {
      // ... logic FIFO giữ nguyên, thay tất cả `tx` → `client` ...
-   });
- }
+   };
+   return tx ? run(tx) : prisma.$transaction(run);
+ }
```

```diff
  // financeService.ts — giờ truyền tx vào
  return await prisma.$transaction(async (tx) => {
    const loss = await tx.loss.create({ ... });
-   const fifoResult = await deductStockFIFO(productId, qty, 'LOSS', loss.id);
+   const fifoResult = await deductStockFIFO(productId, qty, 'LOSS', loss.id, tx);
    await tx.ledgerEntry.create({ ... });
  });
```

### Bước 1.5 — Bổ sung CRUD endpoints còn thiếu

Hiện tại backend chỉ có 5 endpoints. Cần thêm cho frontend hoạt động đầy đủ:

```
  Có rồi ✅                          Cần thêm ❌
┌─────────────────────────┐    ┌─────────────────────────────────────┐
│ GET  /health            │    │ GET    /api/purchases               │
│ GET  /api/products      │    │ GET    /api/purchases/:id           │
│ POST /api/products      │    │ PUT    /api/purchases/:id           │
│ POST /api/purchases     │    │                                     │
│ POST /api/orders        │    │ GET    /api/orders                  │
│                         │    │ PUT    /api/orders/:id              │
│                         │    │                                     │
│                         │    │ PUT    /api/products/:id            │
│                         │    │                                     │
│                         │    │ GET    /api/losses                  │
│                         │    │ POST   /api/losses                  │
│                         │    │                                     │
│                         │    │ GET    /api/inventory               │
│                         │    │ (derived: batches + stock tổng hợp) │
│                         │    │                                     │
│                         │    │ GET    /api/dashboard/stats         │
│                         │    │ GET    /api/profit/analytics        │
│                         │    │                                     │
│                         │    │ GET    /api/settings                │
│                         │    │ PUT    /api/settings                │
│                         │    │ (partners, accounts, packaging...)  │
│                         │    │                                     │
│                         │    │ GET    /api/treasury/transactions   │
│                         │    │ POST   /api/treasury/transactions   │
│                         │    │ PUT    /api/treasury/transactions/:id│
│                         │    │ DELETE /api/treasury/transactions/:id│
└─────────────────────────┘    └─────────────────────────────────────┘
```

> [!IMPORTANT]
> Endpoint `/api/inventory` không map trực tiếp 1 model — nó cần query InventoryBatch + StockTransaction + Product rồi tổng hợp thành dữ liệu tồn kho giống `buildDerivedStore()` ở frontend. FIFO logic đã có ở backend (`inventoryService.ts`), chỉ cần thêm endpoint GET để đọc.

### Bước 1.6 — Thêm Settings model (chưa có trong schema)

Frontend có dữ liệu settings (partners, accounts, packagingCost, returnFee) nhưng backend chưa có model. Thêm vào schema:

```prisma
model AppSettings {
  id                 String   @id @default("default")
  partners           Json     // [{ name, share }]
  accounts           Json     // ["Hà", "Luyến", ...]
  packagingCost      Decimal  @db.Decimal(15, 2) @default(1000)
  returnFee          Decimal  @db.Decimal(15, 2) @default(20000)
  updatedAt          DateTime @updatedAt
}
```

Tương tự cho Treasury (hiện là `transactions` trong localStorage, chưa có model):

```prisma
model TreasuryTransaction {
  id          String   @id @default(uuid())
  date        DateTime
  type        String   // "capital_in", "capital_out", "expense", "revenue"
  account     String
  amount      Decimal  @db.Decimal(15, 2)
  description String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

model MonthlyAdExpense {
  id          String   @id @default(uuid())
  month       String   // "2026-07"
  channel     String
  amount      Decimal  @db.Decimal(15, 2)
  createdAt   DateTime @default(now())
}
```

### Bước 1.7 — Chuyển Frontend từ localStorage → API

Đây là thay đổi lớn nhất. Chiến lược: **thay StoreContext từ localStorage sang API calls**.

**Trước** (hiện tại):
```jsx
// StoreContext.jsx
const [products, setProducts] = useLocalStorage('bap-store.products.v1', []);
```

**Sau** (target):
```jsx
// StoreContext.jsx
const [products, setProducts] = useState([]);
const [loading, setLoading] = useState(true);

useEffect(() => {
  api.getProducts().then(data => {
    setProducts(data);
    setLoading(false);
  });
}, []);

const addProduct = async (product) => {
  const created = await api.createProduct(product);
  setProducts(prev => [...prev, created]);
};
```

**Mapping localStorage → API calls:**

| localStorage key | API GET (đọc) | API POST/PUT (ghi) |
|---|---|---|
| `products.v1` | `GET /api/products` | `POST /api/products`, `PUT /api/products/:id` |
| `purchases.v1` | `GET /api/purchases` | `POST /api/purchases`, `PUT /api/purchases/:id` |
| `orders.v1` | `GET /api/orders` | `POST /api/orders`, `PUT /api/orders/:id` |
| `losses.v1` | `GET /api/losses` | `POST /api/losses` |
| `transactions.v1` | `GET /api/treasury/transactions` | `POST/PUT/DELETE /api/treasury/transactions` |
| `monthlyAds.v1` | `GET /api/ads` | `POST/PUT /api/ads` |
| `accounts.v1` | `GET /api/settings` | `PUT /api/settings` |
| `partners.v1` | `GET /api/settings` | `PUT /api/settings` |
| `packagingCost.v1` | `GET /api/settings` | `PUT /api/settings` |
| `returnFee.v1` | `GET /api/settings` | `PUT /api/settings` |

**FIFO derived state**: Chuyển `buildDerivedStore()` sang backend endpoint `GET /api/inventory`. Frontend không cần tính FIFO nữa — backend đã có `inventoryService.ts`.

### Bước 1.8 — Thêm input validation (backend)

Mọi endpoint cần validate input. Dùng Zod (lightweight, TypeScript-native):

```bash
cd backend && npm install zod
```

Ví dụ cho POST /api/products:
```typescript
import { z } from 'zod';

const createProductSchema = z.object({
  sku: z.string().min(1),
  name: z.string().min(1),
  status: z.string().optional().default('active'),
});

app.post('/api/products', requireAuth, async (req, res) => {
  const parsed = createProductSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const product = await prisma.product.create({ data: parsed.data });
  res.json(product);
});
```

### Bước 1.9 — CORS giới hạn origin

```diff
  // backend/src/index.ts
- app.use(cors());
+ app.use(cors({ origin: ['http://localhost:5173', 'https://tanle-dev-lynstore.web.app'] }));
```

### Bước 1.10 — Chạy và test local

```bash
# Terminal 1: Backend
cd backend
npm run dev
# → http://localhost:3000

# Terminal 2: Frontend
npm run dev
# → http://localhost:5173
```

Nhập dữ liệu thật qua giao diện. Dữ liệu lưu vào PostgreSQL, không mất khi refresh.

---

## Giai đoạn 2: Deploy lên Google Cloud (khi đã ổn định)

### Bước 2.1 — Tạo Database production

Chọn 1 trong các option:

| Option | Chi phí | Phù hợp |
|--------|---------|---------|
| **Supabase Free** | $0/tháng (500MB) | MVP, team nhỏ |
| **Neon Free** | $0/tháng (512MB) | MVP, serverless |
| **Cloud SQL (PostgreSQL)** | ~$7-15/tháng | Production, cần GCP ecosystem |

### Bước 2.2 — Tạo Artifact Registry

```bash
gcloud artifacts repositories create bap-repo \
  --repository-format=docker \
  --location=asia-southeast1 \
  --project=tanle-dev
```

### Bước 2.3 — Cấu hình GitHub Secrets

| Secret | Giá trị |
|--------|---------|
| `FIREBASE_SERVICE_ACCOUNT_TANLE_DEV` | JSON key từ Firebase Console |
| `WIF_PROVIDER` | Workload Identity Federation provider |
| `WIF_SERVICE_ACCOUNT` | GCP service account email |
| `DATABASE_URL` | Connection string của DB production |

### Bước 2.4 — Deploy

```bash
git add . && git commit -m "feat: connect frontend to backend API"
git push origin main
# → GitHub Actions tự deploy frontend + backend
```

### Bước 2.5 — Cập nhật Frontend env

Tạo file `.env.production` ở root:
```
VITE_API_URL=https://bap-backend-api-xxxxx.asia-southeast1.run.app
```

Hoặc set trong GitHub Actions workflow.

---

## Checklist tổng hợp

### Giai đoạn 1 — Local (làm ngay)

- [ ] **1.1** PostgreSQL local hoạt động (hoặc giữ Prisma Postgres)
- [ ] **1.2** Sửa `Float → Decimal` trong schema.prisma
- [ ] **1.3** Chạy `prisma migrate dev --name init`
- [ ] **1.4** Sửa bug financeService (truyền `tx` vào deductStockFIFO)
- [ ] **1.5** Thêm CRUD endpoints còn thiếu (purchases, orders, losses, inventory, dashboard, settings, treasury)
- [ ] **1.6** Thêm models: AppSettings, TreasuryTransaction, MonthlyAdExpense
- [ ] **1.7** Chuyển StoreContext từ localStorage → API calls
- [ ] **1.8** Thêm Zod validation cho tất cả endpoints
- [ ] **1.9** CORS giới hạn origin
- [ ] **1.10** Test local với dữ liệu thật
- [ ] **1.11** `npm run build` + `npm run lint` pass

### Giai đoạn 2 — Deploy (khi ổn định)

- [ ] **2.1** Tạo database production
- [ ] **2.2** Tạo Artifact Registry `bap-repo`
- [ ] **2.3** Set GitHub Secrets (4 secrets)
- [ ] **2.4** Push to main → auto deploy
- [ ] **2.5** Set `VITE_API_URL` cho production
- [ ] **2.6** Verify live site hoạt động

---

> [!WARNING]
> **Trước khi bắt đầu Giai đoạn 1**: Backup dữ liệu localStorage hiện tại bằng cách export từ trình duyệt (DevTools → Application → Local Storage → copy). Dữ liệu này có thể dùng để seed vào PostgreSQL sau.

> [!TIP]
> **Thứ tự làm việc khuyến nghị**: 1.1 → 1.2 → 1.3 → 1.6 → 1.4 → 1.5 → 1.8 → 1.9 → 1.7 → 1.10 → 1.11. Lý do: hoàn thiện backend trước, rồi mới chuyển frontend sang — tránh frontend gọi API chưa có.
