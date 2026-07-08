# Memory & History Log

File nay ghi lai quyet dinh, bai hoc va moc phat trien quan trong cua du an.

## 2026-07-08 - Architecture review va init boi canh repo

- Nap skill `senior-architect` va giao agy `Gemini 3.1 Pro (High)` de de xuat kien truc muc tieu.
- Quyet dinh huong toi uu: modular monolith + PostgreSQL, chua tach microservices som.
- Tao `AGENTS.md` de ghi lenh kiem chung, rang buoc nghiep vu va tai lieu can doc.
- Cap nhat `README.md` thanh ban ro rang, de chay va de tiep tuc phat trien.
- Tao 2 report:
  - `docs/reports/2026-07-08-target-sales-architecture.md`
  - `docs/reports/2026-07-08-frontend-state-audit.md`
- Ghi nhan rui ro lon nhat: state dang nam trong React memory, FIFO chua co transaction/audit trail, Dashboard dang dung du lieu demo.

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

