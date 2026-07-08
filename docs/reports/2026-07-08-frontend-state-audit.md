# Audit frontend va state hien tai

Ngay: 2026-07-08  
Pham vi: `src/`, `docs/`, `package.json`, `README.md`

## Ket luan nhanh

App dang phu hop vai tro MVP/demo nghiep vu, nhung chua an toan de dung nhu he thong ban hang that vi toan bo state nam trong React memory, logic ke toan tap trung trong `StoreContext.jsx`, chua co test tu dong cho FIFO va chua co audit trail.

## Findings uu tien

P0 - Du lieu khong ben vung

- `products`, `purchases`, `orders`, `losses` chi nam trong `useState`. Reload trang se mat du lieu.
- Chua co backup/export/import du lieu noi bo cho toan bo state.
- De xuat: toi thieu dung local persistence tam thoi; huong dung la backend + PostgreSQL.

P0 - FIFO chua co co che transaction

- `deductFifo` dang tinh trong client, khong co lock va khong co audit record bat bien.
- Khi co backend, logic nay phai nam o server/database transaction.

P1 - `StoreContext.jsx` gom qua nhieu trach nhiem

- Vua giu state, vua tinh inventory, enrich order/loss, vua xu ly FIFO.
- De xuat tach `inventoryService`, `fifoService`, `pricingService` thanh pure functions de test.

P1 - Import Excel con mong manh

- Mapping cot dua vao keyword tieng Viet bi anh huong encoding va ten cot moi san.
- De xuat co buoc preview mapping, danh sach dong loi, va chi commit khi user xac nhan.

P1 - Return/hoan hang can mo hinh ro hon

- Item `isReturned` dang lam giam doanh thu va khong tru kho, nhung chua phan biet hoan toan bo, hoan mot phan, da tru kho roi moi hoan.
- De xuat co `return_status`, `returned_qty`, va giao dich nhap lai kho neu hang ve that.

P2 - Dashboard dang dung du lieu demo

- `Dashboard.jsx` dung data hardcode va tien USD, chua phan anh state that.
- De xuat lay metrics tu `inventory`, `orders`, `losses`.

P2 - Encoding/hien thi tieng Viet can chuan hoa

- Nhieu output terminal bi mojibake. File nen duoc luu UTF-8 va editor/terminal can doc dung encoding.

## De xuat toi uu gan han

1. Viet unit test cho phan bo chi phi va FIFO truoc khi sua nghiep vu.
2. Tach logic tinh toan kho ra file domain rieng, khong phu thuoc React.
3. Them persistence tam thoi neu van chay MVP local.
4. Chuyen Dashboard sang so lieu that.
5. Dinh nghia data model chuan cho order return va reconciliation.

## Verification

- Da doc cac file chinh: `StoreContext.jsx`, `Purchases.jsx`, `Orders.jsx`, `Products.jsx`, `Losses.jsx`, `Dashboard.jsx`.
- Agy da hoan thanh mot report kien truc muc tieu nhung ghi vao scratch; Codex da tong hop lai vao report dung trong repo.
- Chua sua source code app trong vong audit nay.

