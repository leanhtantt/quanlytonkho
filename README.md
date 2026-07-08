# BAP Sales & Inventory Manager

Ung dung web quan ly ban hang va ton kho cho shop phu kien cuoi BAP. Du an hien la MVP React/Vite chay local, mo phong luong du lieu nhap hang, ton kho FIFO, xuat ban da kenh, hao hut va doi soat doanh thu bang Excel.

## Trang thai hien tai

- Frontend: React + Vite.
- State: React Context + pure domain functions trong `src/domain/inventory.js`.
- Du lieu: mock data duoc luu vao `localStorage`, chua co backend/database that.
- Nghiep vu chinh: nhap lo hang, phan bo chi phi, tinh gia von FIFO, quan ly don ban, import Excel, ghi nhan hao hut.

## Chay du an

```powershell
npm install
npm run dev
```

Build kiem tra:

```powershell
npm run build
npm run lint
```

## Cau truc chinh

```text
src/
  App.jsx                     Layout va dieu huong
  main.jsx                    Diem khoi chay React
  index.css                   Design tokens va style global
  store/
    StoreContext.jsx          Raw state + actions, luu mock data vao localStorage
  domain/
    inventory.js              FIFO, gia ban tham khao, derived inventory
  lib/
    useLocalStorage.js        Hook luu state mock vao localStorage
  pages/
    Dashboard.jsx             Tong quan hien dang dung du lieu demo
    Purchases.jsx             Nhap hang, phan bo phi, tao batch FIFO
    Products.jsx              Ton kho va chi tiet lo con lai
    Orders.jsx                Don hang, import Excel, doi soat doanh thu
    Losses.jsx                Ghi nhan hao hut theo FIFO
    Profit.jsx                Phân tích lợi nhuận, chi phí quảng cáo và biểu đồ dòng tiền
docs/
  business_rules.md           Quy tac nghiep vu dang ap dung
  Memory.md                   Nhat ky phat trien va quyet dinh
  reports/                    Bao cao audit/kien truc
```

## Giai do hien tai: mock data truoc

Du an chua gan database that. Trong giai do mockup/test luong nghiep vu, app luu cac bang raw vao `localStorage`:

- `bap-store.products.v1`
- `bap-store.purchases.v1`
- `bap-store.orders.v1`
- `bap-store.losses.v1`
- `bap-store.monthlyAds.v1`

Khi can reset du lieu test, co the xoa cac key nay trong DevTools Application/Local Storage.

## Huong kien truc khuyen nghi sau nay

Huong toi uu la **modular monolith** voi backend va PostgreSQL, khong tach microservices som. Cac module nen tach theo ranh gioi nghiep vu:

- `Sales`: don hang, kenh ban, trang thai, doanh thu du kien/thuc nhan.
- `Inventory`: san pham, lo nhap, FIFO, ton kho, hao hut.
- `Procurement`: phieu nhap, phi mua hang, phi van chuyen, boi thuong/giam gia.
- `Finance`: doi soat, gia von hang ban, ledger, audit trail.

Chi tiet xem:

- `docs/reports/2026-07-08-target-sales-architecture.md`
- `docs/reports/2026-07-08-frontend-state-audit.md`

## Nguyen tac ky thuat

- Giao dich tien/hang phai co audit trail append-only; sua sai bang giao dich dao, khong xoa lich su.
- FIFO can duoc xu ly trong database transaction khi co backend, uu tien row-level lock tren batch cu nhat.
- Khong de `StoreContext.jsx` tiep tuc phinh to khi them tinh nang moi; logic FIFO/gia von nen nam trong `src/domain/`.
- Import Excel phai co buoc mapping/canh bao loi ro rang truoc khi ghi du lieu that.
