# Quy trinh va quy tac kinh doanh

Tai lieu nay ghi lai cac quy tac tinh toan va luong nghiep vu cho he thong quan ly ban hang cua shop phu kien cuoi BAP.

## 1. Phan bo chi phi khi nhap hang

Khi nhap mot lo hang, gia von cua tung san pham duoc tinh tu:

- Tong tien mua cua dong san pham, don vi VND.
- Tong can nang cua dong san pham, don vi kg.
- Giam gia tong don, phan bo theo ty trong gia tri.
- Tien boi thuong, phan bo theo ty trong gia tri va tru vao gia von.
- Phi mua hang, phan bo theo ty trong gia tri.
- Phi van chuyen noi dia, phan bo theo ty trong can nang.
- Cuoc van chuyen ve Viet Nam, phan bo theo ty trong can nang.

Trang dat hang da tinh san ty gia, nen ung dung khong nhan ty gia rieng trong form hien tai.

Cong thuc gia von don vi:

```text
Gia von don vi =
(
  Tong tien mua
  - Giam gia phan bo
  - Boi thuong phan bo
  + Phi mua hang phan bo
  + Phi van chuyen noi dia phan bo
  + Cuoc van chuyen ve Viet Nam phan bo
) / So luong
```

## 2. Tinh gia von ton kho theo FIFO

He thong dung FIFO: nhap truoc, xuat truoc.

Vi du:

- Lo 1 nhap 100 san pham A, gia von 10.000 VND/san pham.
- Lo 2 nhap 50 san pham A, gia von 12.000 VND/san pham.
- Khi ban 120 san pham A, he thong tru 100 san pham tu lo 1 va 20 san pham tu lo 2.
- Ton con lai la 30 san pham o lo 2, gia von 12.000 VND/san pham.

Quy tac nay giup loi nhuan tung don bam dung gia von thuc te cua lo hang.

## 3. Ghi nhan hao hut

Hao hut la cac truong hop mat hang, hong hang, giao thieu, sai mau hoac can dieu chinh kho sau kiem kho.

- Hao hut khong duoc dan deu vao gia von cac san pham con lai.
- Hao hut phai lap thanh phieu rieng.
- Khi ghi hao hut, he thong tru kho theo FIFO tai ngay ghi nhan.
- Gia tri thiet hai duoc tinh theo batch bi tru va tinh vao chi phi thang.

### Kiem ke du

- Hang kiem ke du phai ghi bang phieu dieu chinh tang kho, khong tao don nhap hang gia.
- Phieu tang kho tao mot batch dieu chinh rieng va tham gia FIFO theo ngay ghi nhan.
- Gia von mac dinh lay tu batch gan nhat; neu khong co lich su thi nguoi dung nhap gia von.
- Gia tri tang kho duoc ghi vao ledger voi nguon `ADJUSTMENT` de tach khoi chi phi mua hang.
- Chi duoc sua hoac xoa phieu tang kho khi batch dieu chinh chua duoc xuat dung. Neu da xuat, phai tao phieu dieu chinh nguoc de giu audit trail.

## 4. Don hang va ban da kenh

Hien tai ung dung theo doi cac kenh:

- Cha Tiktok
- Cha Shopee
- Lyn WD
- Lyn - Phu kien
- Lyn Tiktok

Trang thai xu ly:

- Dang giao / Da giao: hang duoc tru kho theo FIFO.
- Hoan hang: can phan biet hoan toan bo, hoan mot phan, va hang co nhap lai kho that hay khong.

Huong toi uu sau nay: luu `return_status`, `returned_qty`, va giao dich nhap lai kho neu hang quay ve.

## 5. Gia ban tham khao

Tai man hinh ton kho, gia ban tham khao duoc tinh theo gia von batch:

```text
Neu gia von > 10.000:
  Gia ban = (Gia von + 3.000) * 2.5 / 0.745

Neu gia von <= 10.000:
  Gia ban = (Gia von + 3.000) * 2.2 / 0.745
```

Tat ca gia ban tham khao duoc lam tron.

## 6. Quy tac khi co backend that

- FIFO phai chay trong database transaction.
- Stock transaction va ledger phai la append-only.
- Sua sai bang giao dich dao, khong xoa lich su.
- Khong cho am kho im lang; neu can, tao trang thai backorder.

## 7. Chi phi quang cao va tam ung ca nhan

- Moi khoan quang cao duoc tinh vao chi phi cua thang va lam giam loi nhuan theo shop.
- Quang cao chi truc tiep tu quy shop tao giao dich `CHI` va tru ngay tai khoan quy duoc chon.
- Quang cao do ca nhan ung truoc khong duoc tru vao tai khoan quy hien co. Khoan nay tao cong no shop phai hoan cho nguoi ung.
- Khi hoan ung tu tai khoan quy, he thong moi tao giao dich `CHI` voi hang muc `Hoan ung quang cao` va giam cong no tuong ung.
- Khi hoan ung truc tiep tu vi san, he thong giam so du vi san tam tinh va giam cong no, khong tac dong tai khoan quy.
- Hoan ung khong duoc tinh thanh chi phi quang cao lan thu hai.
- Khoan quang cao da co lich su hoan ung khong duoc xoa de giu audit trail.
