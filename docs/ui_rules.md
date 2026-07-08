# Quy luật UI tối giản cho BAP Sales & Inventory Manager

Tài liệu này là nguồn tham chiếu khi thiết kế hoặc sửa giao diện. Mục tiêu là UI rõ ràng, dễ đọc, thao tác nhanh và luôn đủ tương phản.

## 1. Nguyên tắc nền tảng

- Ưu tiên tối giản: ít lớp nền, ít hiệu ứng, không trang trí gây nhiễu.
- Không dùng màu trực tiếp trong component nếu đã có token CSS trong `src/index.css`.
- Không đặt chữ trắng trên nền trắng, chữ nhạt trên nền nhạt, hoặc màu trạng thái trên nền không cùng cặp.
- Mỗi màu nền phải đi với màu chữ tương ứng:
  - `--color-bg-surface` dùng với `--color-text-base`.
  - `--color-primary` dùng với `--color-on-primary`.
  - `--color-success-light` dùng với `--color-success`.
  - `--color-warning-light` dùng với `--color-warning`.
  - `--color-danger-light` dùng với `--color-danger`.

## 2. Màu sắc

- Nền app: `--color-bg-base`.
- Khối nội dung/card/form: `--color-bg-surface`.
- Vùng phụ, vùng nhập item, header bảng: `--color-bg-subtle`.
- Dòng đang chọn hoặc hover: `--color-bg-hover` hoặc `--color-bg-selected`.
- Màu chính cho hành động quan trọng: `--color-primary`.
- Màu phụ cho thông tin biểu đồ hoặc trạng thái trung tính: `--color-accent`, `--color-info`.

Không thêm gradient, glassmorphism hoặc nền quá tối nếu chưa có lý do nghiệp vụ rõ ràng.

## 3. Chữ

- Font chính: Inter.
- Heading trong trang dùng `.page-title`.
- Label form dùng chữ đậm vừa, màu `--color-text-muted`.
- Không dùng chữ quá lớn trong bảng, form và sidebar; các màn này là công cụ vận hành, cần scan nhanh.

## 4. Component

- Nút chính dùng `.btn.btn-primary`.
- Nút phụ dùng `.btn.btn-outline`.
- Form field dùng style global của `input`, `select`, `textarea`; chỉ override khi thật cần.
- Bảng phải bọc trong `.table-container` hoặc `.table-responsive`.
- Badge trạng thái dùng các class có sẵn: `.badge-success`, `.badge-warning`, `.badge-danger`, `.badge-info`.

## 5. Tương phản và accessibility

- Mọi nút, input, link phải có focus state nhìn thấy được.
- Text thường cần đạt WCAG AA: tối thiểu 4.5:1.
- Text lớn hoặc icon trạng thái cần tối thiểu 3:1.
- Không dùng opacity thấp cho chữ chính. Nếu cần giảm nhấn mạnh, dùng `--color-text-muted`.

## 6. Layout

- Sidebar cố định trên desktop, chuyển thành thanh điều hướng ngang trên màn nhỏ.
- Page wrapper giữ nội dung tối đa 1360px để bảng rộng vẫn đọc được.
- Card chỉ dùng để gom nhóm nội dung thật sự; không lồng card trong card.
- Bảng rộng phải cho cuộn ngang thay vì ép chữ vỡ layout.

## 7. Kiểm tra trước khi báo xong

- Chạy `npm run build`.
- Chạy `npm run lint`.
- Nếu sửa UI nhìn thấy được, chạy `npm run dev` và kiểm tra ít nhất Dashboard, Nhập hàng, Xuất bán, Tồn kho, Lợi nhuận.
- Rà nhanh các màu hard-code trong `src/`; nếu thêm màu mới phải có lý do và nên chuyển thành token.
