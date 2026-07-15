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

## Quy trinh Git (BAT BUOC)

Main co GitHub Ruleset bat buoc PR + 2 CI check xanh moi merge duoc.
KHONG duoc merge local vao main roi push -- se bi reject.

Gom nhieu thay doi nho lien quan vao 1 nhanh/1 PR de giam so lan mo PR.
Khong mo PR rieng cho tung commit nho.

Quy trinh mac dinh:

1. Tao nhanh moi tu `main` (`git checkout -b feat/ten-nhanh main`)
2. Sua code
3. Verify: `npm run build` + `npm run lint` (+ backend neu dung)
4. Commit (conventional commits)
5. Push nhanh len GitHub
6. Mo PR vao `main`
7. Cho CI xanh (2 checks)
8. Merge PR tren GitHub

## Quy trinh xu ly loi

- Cung 1 loi sau 2 lan khong sua duoc: mo chrome dev tool (chrome-devtools-mcp) de kiem tra log va sua.
- Neu fix loi hoac sua code ma can restart lai dev server (web hoac api) thi phai nhac user.