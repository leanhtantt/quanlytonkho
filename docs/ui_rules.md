# Design system v2 — BAP Sales & Inventory Manager

Tài liệu này là chuẩn bắt buộc cho mọi thay đổi UI sau này. Ưu tiên giao diện quản trị light mode rõ ràng, thao tác nhanh, đủ tương phản và giữ nguyên nghiệp vụ của ứng dụng.

## 1. Định hướng thẩm mỹ

Phong cách: **Premium WordPress admin, hiện đại, light mode**.

- Dùng lưới 8pt: khoảng cách là bội của 8px, ngoại lệ nhỏ nhất là 4px; luôn ưu tiên khoảng trắng đủ để nội dung dễ quét.
- Phân tầng bằng elevation nhẹ: card dùng nền surface, viền nhẹ hoặc shadow nhẹ; không phối viền đậm với shadow đậm trong cùng một khối.
- Bo góc nhất quán: card/modal `--radius-lg` (12px), control `--radius-md` (8px), badge/pill `--radius-full`.
- Neutrals chiếm phần lớn giao diện. Primary chỉ dùng cho hành động chính, trạng thái active, link và focus; màu trạng thái chỉ dùng cho badge, số liệu và hành động có ngữ nghĩa.
- Mỗi section chỉ nên có tối đa ba màu nổi bật. Không thêm gradient, glassmorphism, dark mode hay animation lặp lại nếu không có nhu cầu nghiệp vụ.
- Motion chỉ phục vụ phản hồi: hover/focus khoảng 150ms, xuất hiện khoảng 200ms; chỉ animate `opacity` và `transform`.
- Bảng rộng phải cuộn ngang trong container; body không được cuộn ngang.

## 2. Typography

- Font bắt buộc: self-host `@fontsource-variable/plus-jakarta-sans`, token `--font-family: 'Plus Jakarta Sans Variable', system-ui, -apple-system, 'Segoe UI', sans-serif`.
- Không dùng font CDN hay font không có subset tiếng Việt chuẩn. Kiểm tra rõ các chuỗi có dấu như “ĐƠN HÀNG”, “Nhập hàng”, “Sổ Quỹ”, “Hao Hụt”.
- Số tiền, số lượng và tỷ lệ trong bảng dùng `.num`: canh phải và `font-variant-numeric: tabular-nums`.

| Cấp | Class | Quy ước |
| --- | --- | --- |
| Display | `.text-display` | 1.75–2rem, weight 800; chỉ cho số KPI lớn |
| H1 | `.h1`, `.page-title` | 1.5rem, weight 800; đúng một tiêu đề trang trong `PageHeader` |
| H2 | `.h2` | 1.125rem, weight 700; section lớn |
| H3 | `.h3` | 1rem, weight 700; card, modal, panel |
| H4 | `.h4` | 0.8125rem, uppercase, muted; nhãn nhóm nhỏ |
| Body | mặc định | 0.9375rem; nội dung, cell bảng, input |
| Small | `.text-small` | 0.8125rem; label và meta |
| Caption | `.text-caption` | 0.75rem; ghi chú, timestamp |

Dùng heading semantic theo đúng cấp; không dùng heading chỉ để làm chữ to. Form label dùng `.text-small`, weight 600 và màu `--color-text-muted`. Bảng, form và sidebar không dùng cỡ chữ lớn hơn 1rem.

## 3. Màu sắc và contrast

`src/styles/tokens.css` là nguồn chuẩn của token. Light mode duy nhất, primary teal của thương hiệu **Phụ kiện Decor**.

- Nền app: `--color-bg-base`; card/form/bảng: `--color-bg-surface`; vùng phụ/header bảng: `--color-bg-subtle`; hover/selected: `--color-bg-hover` hoặc `--color-bg-selected`.
- Text chính dùng `--color-text-base`; text phụ/label dùng `--color-text-muted`; caption/placeholder dùng `--color-text-soft`.
- Primary: `--color-primary`, `--color-primary-hover`, `--color-primary-active`, `--color-primary-light`, `--color-on-primary`, `--color-focus`.
- Thu/lãi dùng `--color-success`; chi/lỗ dùng `--color-danger`; chờ xử lý dùng `--color-warning`; thông tin trung tính dùng `--color-info`.
- Dùng cặp nền `-light` với text màu đậm cùng ngữ nghĩa. Không đặt text nhạt trên nền nhạt hoặc text trắng trên nền trắng.
- Text thường phải đạt WCAG AA 4.5:1; text lớn/icon trạng thái tối thiểu 3:1. Không giảm độ rõ của text chính bằng opacity.
- Cấm hard-code màu trong JSX/component. CSS chỉ dùng token, không thêm hex/rgb mới ngoài `tokens.css`.

Biểu đồ Recharts chỉ dùng tuần tự `--chart-1` đến `--chart-6`. Grid dùng `--color-border`; axis/legend dùng `--color-text-muted`; tooltip dùng surface, border và shadow token.

## 4. Buttons và feedback

Mọi page dùng component `<Button>`; cấm `<button>` trần trong page.

| Variant | Dùng cho |
| --- | --- |
| `primary` | Hành động chính: lưu, tạo đơn |
| `secondary` | Hành động phụ: hủy, xuất dữ liệu |
| `ghost` | Hành động nhẹ trong row/toolbar, icon-only |
| `danger` | Hành động phá hủy sau xác nhận |
| `danger-ghost` | Nút mở xác nhận xóa trong row |

Kích thước: `sm` 32px trong bảng, `md` 40px mặc định, `lg` 44px cho form chính/mobile. Nút icon-only bắt buộc có `aria-label` và tooltip/title.

Mọi nút có hover, active, focus-visible ring rõ, disabled `opacity` thấp và con trỏ không cho phép. Thiếu quyền thì ẩn nút, không disable. Loading phải giữ chiều rộng, chặn double submit và đặt `aria-busy`.

- Thao tác local tức thì: phản hồi UI ngay, không cần loading.
- API create/update/delete: loading trên nút → `toast.success` nêu đối tượng khi thành công → `toast.error` kèm lỗi server khi thất bại, giữ dữ liệu form.
- Tải trang: dùng `Skeleton` đúng hình dạng nội dung, không dùng màn trắng/spinner toàn trang.
- Import/bulk: loading + toast tiến trình/kết quả.
- Hành động phá hủy dùng `ConfirmDialog`, nêu rõ đối tượng và tác động. Không dùng `alert()` hoặc `window.confirm()`.
- Toast dùng `sonner`: success tự tắt khoảng 3 giây, error khoảng 6 giây và có nút đóng.

## 5. Icons

- Chỉ import từ `@tabler/icons-react`; không dùng `lucide-react`, SVG tự nhúng hoặc nhiều bộ icon song song.
- Icon ăn theo `currentColor`, không đặt màu riêng.
- Size chuẩn: 20px trong button/nav/bảng, 24px logo/stat card, 40–48px empty state.
- Giữ stroke mặc định 2px.

## 6. Component chuẩn

Tái sử dụng các component trong `src/components/ui/`:

- `Button`, `Spinner`, `Skeleton`, `Toast`/`toastHelper`
- `ConfirmDialog`, `Modal`
- `EmptyState`: icon, mô tả, CTA khi hợp lý; mọi danh sách/bảng/chart rỗng phải dùng component này
- `StatCard`, `PageHeader`, `Badge`, `SearchInput`, `FormField`

`PageHeader` bao bọc H1 của mọi trang và nhận actions cấp trang. `Badge` chỉ thể hiện trạng thái ngắn; không dùng màu trạng thái cho nội dung không có ngữ nghĩa. `SearchInput` và `FormField` giữ label, focus state và accessibility nhất quán.

## 7. Cấu trúc CSS

Giữ CSS thuần, không Tailwind hay CSS-in-JS:

```text
src/styles/tokens.css      # toàn bộ :root tokens
src/styles/base.css        # reset, typography, form elements
src/styles/components.css  # button, card, table, badge, modal, toast, skeleton
src/styles/layout.css      # sidebar, page wrapper, responsive
```

Ưu tiên class theo ngữ cảnh trang trong `components.css`; không đưa style trực tiếp vào JSX trừ giá trị động thật sự (ví dụ width phần trăm của progress bar).

## 8. Accessibility và responsive checklist

Trước khi báo hoàn tất UI:

- Kiểm tab keyboard qua form chính; mọi control có focus ring nhìn thấy.
- Kiểm WCAG AA cho text/nền, badge và trạng thái.
- Kiểm 1366px, 900px và 375px: sidebar/header, action, form grid, card, bảng cuộn ngang trong container; không có body overflow ngang.
- Kiểm empty state, skeleton và CTA khi dữ liệu rỗng.
- Chạy `npm run build`, `npm run lint`, `npm test`.
- Grep toàn `src/pages/`: không có `style={{` (trừ dynamic thật), `alert(`, `window.confirm`, `window.prompt`, hoặc `lucide-react`.
