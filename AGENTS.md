# Huong dan lam viec trong repo

## Muc tieu du an

Day la ung dung quan ly ban hang va ton kho cho shop phu kien cuoi BAP. Uu tien dung nghiep vu thuc te: nhap hang quoc te, phan bo chi phi, FIFO, ban hang da kenh, hao hut va doi soat doanh thu.

## Lenh kiem chung

```powershell
npm run build
npm run lint
```

Khi thay doi UI co tac dong nguoi dung, chay app that bang `npm run dev` va kiem tra man hinh lien quan.

## Rang buoc khi sua code

- Khong sua logic ke toan/FIFO neu chua doc `docs/business_rules.md`.
- Khong xoa lich su/tai lieu hien co neu khong duoc yeu cau.
- Khong commit secrets, `.env`, file xuat Excel cua shop, hoac du lieu nhay cam.
- Neu them backend, di theo modular monolith truoc; khong tach microservices som.
- Neu them luu tru du lieu that, can co audit trail cho tien/hang va test cho FIFO.

## Tai lieu quan trong

- `README.md`: cach chay va kien truc tong quan.
- `docs/business_rules.md`: quy tac nghiep vu.
- `docs/Memory.md`: nhat ky quyet dinh va bai hoc.
- `docs/reports/`: audit va de xuat kien truc.

