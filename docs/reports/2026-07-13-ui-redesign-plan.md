# Plan: Refactor toàn bộ giao diện (UI Redesign — Premium Light)

Ngày: 2026-07-13
Trạng thái: **Đã triển khai xong 2026-07-15** (Đợt 3 + Đợt 8 của lộ trình — PR #5, #6, #7, #12–#16). Design system v2 đã chốt tại `docs/ui_rules.md`; các quyết định chốt ở mục 12.

Plan này gồm 2 phần: (A) bộ quy tắc design system mới — sau khi duyệt sẽ trở thành `docs/ui_rules.md` v2; (B) kế hoạch triển khai theo phase.

---

## 1. Hiện trạng (đã khảo sát)

| Hạng mục | Hiện tại | Đánh giá |
|---|---|---|
| Token CSS | `src/index.css` (611 dòng) đã có hệ token màu/spacing/radius khá bài bản | ✅ Giữ kiến trúc token, nâng cấp giá trị |
| Style thực tế ở pages | **328 chỗ `style={{...}}` inline** rải khắp 9 trang (Orders 82, Purchases 60, Treasury 44…) | ❌ Nguồn gốc chính của sự lộn xộn — token có nhưng page không dùng |
| Font | Inter (Google Fonts CDN) | Đổi theo yêu cầu |
| Icons | `lucide-react` (SVG, hậu duệ của Feather) | Đã là SVG, sẽ chuẩn hóa |
| Feedback | **18 chỗ `alert()`/`window.confirm()`**, không có toast, không có loading state trên nút, không skeleton | ❌ Đúng vấn đề "bấm rồi không biết chạy chưa" |
| Heading | Chỉ có `.page-title`, không có hệ H1–H4 | ❌ Cần quy định |
| Component tái sử dụng | Gần như không có (chỉ `ProductImage`) — mỗi trang tự viết modal, form, nút | ❌ Cần bộ component chung |

---

# PHẦN A — BỘ QUY TẮC DESIGN SYSTEM

## 2. Định hướng thẩm mỹ: "Premium WordPress admin, hiện đại, light mode"

Nghĩa là cụ thể (làm chuẩn cho mọi quyết định style):

1. **Nhiều khoảng trắng** — lưới 8pt (mọi khoảng cách là bội của 8px, tối thiểu 4px); nội dung thở được, không nhồi.
2. **Phân tầng bằng elevation nhẹ** — 3 mức shadow (xem token), card nổi mềm trên nền xám ấm rất nhạt, KHÔNG viền đậm + shadow đậm cùng lúc.
3. **Bo góc hào phóng, nhất quán** — card/modal 12px, control (nút, input) 8px, badge/pill full. Không trộn nhiều radius trong 1 khối.
4. **Màu kỷ luật** — 1 màu primary, neutrals chiếm ≥90% giao diện; màu trạng thái chỉ xuất hiện ở badge/số liệu/nút danger. Tối đa 3 màu nhìn thấy trong 1 section.
5. **Chuyển động tinh tế, có mục đích** — hover/focus 150ms, xuất hiện 200ms; chỉ animate `opacity`/`transform`; không animation trang trí lặp vô hạn.
6. **Chi tiết hoàn thiện** = cảm giác premium: empty state có icon + hướng dẫn, skeleton khi tải, số tiền canh phải + tabular, hover row có nền, focus ring rõ, tooltip cho icon-only button.
7. **Light mode duy nhất** — giữ `color-scheme: light`, không làm dark mode ở đợt này.
8. Giữ nguyên tắc cũ vẫn đúng: token-only (không hard-code màu), tương phản WCAG AA, bảng rộng cuộn ngang.

## 3. Typography

### 3.1. Font

- **Google Sans / Product Sans là font độc quyền của Google, không có license để nhúng** → dùng font thay thế gần nhất có trên Google Fonts VÀ hỗ trợ tiếng Việt đầy đủ.
- **Chốt: [Plus Jakarta Sans](https://fonts.google.com/specimen/Plus+Jakarta+Sans)** — geometric sans cùng khí chất Google Sans (đầu tròn, hình học, hiện đại), có subset `vietnamese` chính thức, variable font, SIL OFL.
  - Đã loại: Poppins/DM Sans (không có subset tiếng Việt chuẩn — dấu tiếng Việt sẽ rơi về font fallback, chữ loang lổ), Inter (giữ nguyên thì không "đổi mới" như yêu cầu).
  - Phương án dự phòng nếu xem demo không ưng: **Be Vietnam Pro** (thiết kế gốc cho tiếng Việt, cùng chất geometric).
- Cách nhúng: **self-host qua npm `@fontsource-variable/plus-jakarta-sans`** thay vì CDN Google Fonts (nhanh hơn, không phụ thuộc mạng ngoài, không FOUT nặng). Weights dùng: 400 / 500 / 600 / 700 / 800.
- Token: `--font-family: 'Plus Jakarta Sans Variable', system-ui, -apple-system, 'Segoe UI', sans-serif;`
- **Số liệu tiền/số lượng trong bảng**: `font-variant-numeric: tabular-nums` (class `.num`), canh phải, để cột số thẳng hàng.

### 3.2. Thang chữ + quy định khi nào dùng H mấy

| Cấp | Class | Size / Weight / Line-height | Dùng khi nào | Ví dụ trong app |
|---|---|---|---|---|
| Display | `.text-display` | 1.75–2rem / 800 / 1.15 | CHỈ cho con số KPI lớn | Số tiền trên StatCard Dashboard |
| **H1** | `.h1` (= `.page-title`) | 1.5rem / 800 / 1.2 | **Tiêu đề trang — đúng 1 cái mỗi trang**, đặt trong PageHeader | "Xuất Bán", "Sổ Quỹ" |
| **H2** | `.h2` | 1.125rem / 700 / 1.3 | Section lớn bên trong trang (nhóm nhiều card/bảng) | "Danh sách đơn", "Thống kê tháng" |
| **H3** | `.h3` | 1rem / 700 / 1.4 | Tiêu đề của 1 card, 1 modal, 1 panel | Tiêu đề modal "Thêm đơn hàng" |
| **H4** | `.h4` | 0.8125rem / 700 / 1.4, UPPERCASE, letter-spacing 0.05em, màu muted | Nhãn nhóm nhỏ trong form/bảng/sidebar | "THÔNG TIN PHÍ", header cột bảng |
| Body | (mặc định) | 0.9375rem / 400–500 / 1.5 | Nội dung, cell bảng, input | |
| Small | `.text-small` | 0.8125rem / 400–600 | Chú thích, meta, label form | |
| Caption | `.text-caption` | 0.75rem / 500 / màu soft | Ghi chú phụ, timestamp | |

Quy tắc bắt buộc:
- Dùng đúng thẻ semantic (`<h1>`–`<h4>`) đi kèm class; **không nhảy cấp** (H1 → H3 mà không có H2 giữa chúng khi cùng nhánh nội dung).
- Không dùng heading để "làm chữ to" — cần chữ to không phải tiêu đề thì dùng `.text-display`/`.num`.
- Label form: `.text-small` weight 600 màu `--color-text-muted` (giữ như hiện tại).
- Trong bảng/form/sidebar không dùng chữ > 1rem (màn công cụ, cần scan nhanh).

## 4. Màu sắc

Light mode. **Primary = teal `#0f766e`** (CẬP NHẬT 2026-07-13: sau khi thử indigo, chủ shop quyết định giữ tông teal làm nhận diện; brand: "Phụ kiện Decor"). Neutrals giữ tông lạnh nhẹ. **Code trong `src/styles/tokens.css` là nguồn chuẩn — nếu lệch, lấy theo code.**

```css
/* Neutrals — nền & chữ (tông lạnh nhẹ) */
--color-bg-base:      #f6f7fb;  /* nền app */
--color-bg-surface:   #ffffff;  /* card, form, bảng */
--color-bg-subtle:    #f0f2f8;  /* header bảng, vùng phụ */
--color-bg-hover:     #e9ecf5;
--color-bg-selected:  #f0fdfa;  /* = primary-light (teal nhạt) */

--color-text-base:    #191d27;  /* chữ chính */
--color-text-muted:   #5a6172;  /* chữ phụ, label */
--color-text-soft:    #8b91a3;  /* placeholder, caption */

/* Primary — teal (nhận diện shop, đạt AA trên nền trắng) */
--color-primary:        #0f766e;
--color-primary-hover:  #115e59;
--color-primary-active: #134e4a;
--color-primary-light:  #ccfbf1;
--color-on-primary:     #ffffff;
--color-focus:          #0f766e;

/* Trạng thái (giữ, đủ tương phản AA trên nền -light tương ứng) */
success #047857 / warning #a16207 / danger #b42318 / info #1d4ed8 (+ biến -light như cũ)

/* Elevation 3 mức */
--shadow-sm: 0 1px 2px rgba(20,24,40,.05);                          /* card tĩnh */
--shadow-md: 0 4px 12px rgba(20,24,40,.08);                         /* hover, dropdown */
--shadow-lg: 0 12px 32px rgba(20,24,40,.14);                        /* modal, toast */

/* Radius */
--radius-sm: 6px; --radius-md: 8px; --radius-lg: 12px; --radius-full: 9999px;

/* Chart palette (recharts) — 6 màu cố định, dùng theo thứ tự */
--chart-1: #0f766e; --chart-2: #0e7490; --chart-3: #a16207;
--chart-4: #b42318; --chart-5: #0ea5e9; --chart-6: #64748b;
```

Lưu ý migration màu: teal cũ (`#0f766e`) không còn là primary nhưng được giữ làm `--chart-2`; mọi chỗ đang trỏ token primary sẽ tự đổi theo, còn chỗ nào hard-code teal thì bị dọn sạch ở Phase U3 (nằm trong 328 inline style).

Quy tắc dùng màu:
1. **Cấm hard-code màu trong JSX/component** — chỉ dùng token. (Đây là quy tắc đã có nhưng bị vi phạm 328 lần; đợt refactor này dọn sạch và lint giữ cửa về sau.)
2. Mỗi nền đi đúng cặp chữ: `-light` đi với màu đậm cùng họ (như ui_rules cũ).
3. Ngữ nghĩa tiền tệ thống nhất toàn app: **thu/lãi = success, chi/lỗ = danger, chờ xử lý = warning, trung tính = info**. Không dùng đỏ/xanh cho việc khác trong cùng màn hình có số tiền.
4. Primary chỉ cho: hành động chính (1 nút primary/màn hình là lý tưởng), trạng thái active của nav, link, focus ring.
5. Biểu đồ dùng đúng `--chart-1..6` theo thứ tự; không tự chế màu trong page.

## 5. Buttons & Interaction Feedback (chống "bấm rồi không biết chạy chưa")

### 5.1. Component `<Button>` chuẩn (bắt buộc dùng, cấm viết `<button>` trần trong page)

Variants:

| Variant | Dùng cho | Style |
|---|---|---|
| `primary` | Hành động chính của màn hình/form (Lưu, Tạo đơn) | Nền primary, chữ trắng |
| `secondary` | Hành động phụ (Hủy, Xuất Excel) | Nền surface, viền border, chữ base |
| `ghost` | Hành động nhẹ trong bảng/toolbar (icon-only, filter) | Không nền, hover mới có nền subtle |
| `danger` | Xóa/hành động phá hủy — chỉ trong ConfirmDialog hoặc sau xác nhận | Nền danger, chữ trắng |
| `danger-ghost` | Nút xóa mở ConfirmDialog (icon thùng rác trong row) | Chữ danger, hover nền danger-light |

Sizes: `sm` 32px (trong row bảng), `md` 40px (mặc định), `lg` 44px (form chính/mobile). Icon-only bắt buộc có `aria-label` + tooltip.

### 5.2. Bảng trạng thái bắt buộc cho mọi button

| State | Quy định |
|---|---|
| Default | Theo variant |
| Hover | Đổi nền 1 nấc (`-hover`), transition 150ms; ghost hiện nền |
| Active (đang nhấn) | Nền `-active`, `transform: translateY(0.5px)` — cảm giác nhấn thật |
| Focus-visible | Ring 3px `color-mix(primary 35%)` — giữ như hiện tại, mọi variant |
| **Disabled** | `opacity .55` + `cursor: not-allowed` + KHÔNG hover effect. Nếu disable **vì thiếu quyền** (liên quan plan phân quyền): ẩn hẳn nút thay vì disable. Nếu disable vì form chưa hợp lệ: giữ nút hiển thị + helper text nói lý do gần đó |
| **Loading** | Spinner thay icon + chữ đổi sang dạng đang làm ("Đang lưu..."), **giữ nguyên width** (không giật layout), `disabled` + `aria-busy="true"`, chặn double-click/double-submit |

### 5.3. Quy tắc phản hồi theo thời lượng hành động

| Thời lượng dự kiến | Cơ chế bắt buộc |
|---|---|
| Tức thì (< 300ms, thao tác local) | Không cần loading; đổi state UI ngay |
| Gọi API 0.3–3s (create/update/delete) | Nút chuyển **loading state** (5.2) trong lúc chờ → xong: **toast success** ("Đã lưu đơn XYZ") → lỗi: **toast error** kèm message server, nút trở lại bình thường, dữ liệu form GIỮ NGUYÊN để sửa gửi lại |
| Tải dữ liệu khi vào trang | **Skeleton** đúng hình dạng nội dung (bảng → skeleton rows; stat card → skeleton block), KHÔNG spinner toàn màn trắng như hiện tại |
| Tác vụ dài/bulk (import Excel) | Nút loading + toast persistent "Đang nhập 120 dòng..." → cập nhật kết quả khi xong (kể cả số dòng lỗi) |

Quy tắc bổ sung:
- **Xóa `alert()`/`window.confirm()` toàn bộ (18 chỗ)**. Thay bằng: toast (thông báo) và `<ConfirmDialog>` (xác nhận).
- **ConfirmDialog** bắt buộc cho mọi hành động phá hủy: nêu đích danh đối tượng ("Xóa đơn *DH-102*? Tồn kho sẽ được hoàn lại."), nút xác nhận variant `danger`, nút Hủy là secondary và được focus mặc định.
- Toast: góc phải-dưới, success tự tắt 3s, error tự tắt 6s + có nút đóng, tối đa 3 toast xếp chồng.
- Thư viện toast: **đã chốt dùng [sonner](https://sonner.emilkowal.ski/)** (nhẹ ~5KB, MIT, chuẩn React) — queue, stacking, pause-on-hover, animation có sẵn; tự viết đủ mức đó tốn công không đáng.
- Mọi mutation trong `StoreContext` hiện đang nuốt lỗi bằng `console.error`/`alert` không đồng nhất → chuẩn hóa: mutation **throw** để component xử lý loading/toast, không nuốt lỗi trong store.

## 6. Icons

- Hiện tại app đã dùng `lucide-react` — chính là SVG, hậu duệ trực tiếp của **Feather** trong danh sách anh đưa, nên yêu cầu "icon SVG toàn web" thực chất đã đạt một nửa.
- **Chốt: chuyển sang [Tabler Icons](https://tabler.io/icons) (`@tabler/icons-react`)** — đứng đầu danh sách anh đưa và phù hợp nhất vì: ~6.000 icon (gấp ~4 lần Feather) thiên về web-app/dashboard đúng loại app này, style outline 2px bo tròn hợp hướng premium, MIT, tree-shakable. Migration chỉ là map ~35 icon đang dùng sang tên tương đương (`Package`→`IconPackage`, `Trash2`→`IconTrash`…), làm trong Phase 1 rồi gỡ `lucide-react` khỏi dependencies.
- Đã loại: Heroicons (~300 icon, dễ thiếu), Bootstrap Icons (app không dùng Bootstrap), Octicons (đặc thù GitHub).
- Quy tắc dùng icon:
  - Chỉ import từ `@tabler/icons-react`, không nhúng SVG tay, không dùng 2 bộ icon song song (sau migration cấm import lucide).
  - Size: 20px trong nút/nav/bảng, 24px cho logo/stat card, 40–48px cho empty state. `stroke-width` giữ mặc định 2, thống nhất toàn app.
  - Màu luôn `currentColor` (icon ăn theo màu chữ của khối chứa nó), không set màu riêng cho icon.
  - Icon-only button bắt buộc `aria-label`.

## 7. Component chuẩn (xây 1 lần, mọi trang dùng chung)

Tạo `src/components/ui/`: `Button`, `Spinner`, `ConfirmDialog`, `Modal` (1 modal chuẩn thay vì mỗi trang tự chế), `Toast` (wrapper sonner), `Skeleton`, `EmptyState` (icon + mô tả + CTA), `StatCard` (KPI Dashboard), `PageHeader` (H1 + actions — pattern lặp ở mọi trang), `Badge` (giữ class, thêm component), `SearchInput`, `FormField` (label + input + error text).

CSS tách lớp cho dễ bảo trì (vẫn thuần CSS, không thêm Tailwind/CSS-in-JS — giữ stack hiện tại):

```
src/styles/tokens.css      — toàn bộ :root tokens
src/styles/base.css        — reset, typography, form elements
src/styles/components.css  — btn, card, table, badge, modal, toast, skeleton...
src/styles/layout.css      — sidebar, page-wrapper, responsive
```

---

# PHẦN B — KẾ HOẠCH TRIỂN KHAI

## 8. Phases

| Phase | Nội dung | Phụ thuộc | Khối lượng |
|---|---|---|---|
| **U0 — Foundation** | Font Plus Jakarta Sans (self-host), tokens v2, tách 4 file CSS, cài `@tabler/icons-react` + `sonner`, gỡ import font CDN | — | Nhỏ |
| **U1 — Core components** | Bộ `src/components/ui/` (mục 7) + migrate icon lucide→tabler toàn app + xóa 18 `alert/confirm` thay bằng Toast/ConfirmDialog + chuẩn hóa error trong `StoreContext` | U0 | Trung bình |
| **U2 — Layout & khung** | Sidebar redesign (premium: logo, nav pill, footer user), PageHeader áp dụng mọi trang, skeleton thay màn "Đang tải dữ liệu...", trang Login restyle | U1 | Trung bình |
| **U3 — Migrate từng trang** (xóa 328 inline style, dùng component chuẩn + loading/toast cho mọi mutation) | Thứ tự: Dashboard → Products → Losses → Settings → Profit → Treasury → Purchases → **Orders cuối cùng** (to nhất, 763 dòng + 82 inline style, làm cuối khi component đã trưởng thành) | U1, U2 | **Lớn nhất** — chia được thành nhiều đợt giao việc, mỗi đợt 2–3 trang |
| **U4 — Polish & QA** | Empty states toàn app, style recharts theo `--chart-*`, tabular-nums cột số, rà contrast AA, rà responsive 3 breakpoint, cập nhật `docs/ui_rules.md` = Phần A của plan này | U3 | Nhỏ |

Gợi ý đợt giao việc: U0+U1 một đợt → U2 một đợt → U3 chia 3 đợt (Dashboard+Products+Losses / Settings+Profit+Treasury / Purchases+Orders) → U4 một đợt.

## 9. Phối hợp với plan phân quyền (2026-07-13-permissions-and-activity-log-plan.md)

- 2 trang mới **Users** và **Activity** phải xây thẳng bằng component chuẩn của plan này (không viết theo kiểu cũ rồi refactor lại) → nên chạy U0+U1 **trước hoặc song song** Phase 3 của plan phân quyền.
- Quy tắc nút theo quyền (mục 5.2): thiếu quyền → **ẩn** nút; đang gửi → loading; form chưa hợp lệ → disabled + lý do.

## 10. Checklist nghiệm thu mỗi phase

- `npm run build` + `npm run lint` sạch.
- `npm run dev`: đi qua Dashboard, Nhập Hàng, Xuất Bán, Tồn Kho, Lợi Nhuận, Sổ Quỹ ở 3 độ rộng: 1366px / 900px / 375px.
- Grep `style={{` trong các trang đã migrate = 0 (trừ giá trị động thật sự như width % của progress bar).
- Grep `alert(`/`window.confirm` = 0 sau U1.
- Grep import `lucide-react` = 0 sau U1.
- Mọi mutation: bấm nút → thấy loading → thấy toast (thử cả case rút mạng để thấy toast error).
- Chữ tiếng Việt có dấu hiển thị đúng bằng Plus Jakarta Sans (không rơi về fallback) — kiểm tra "ĐƠN HÀNG, Nhập hàng, Sổ Quỹ, Hao Hụt".
- Tab keyboard đi qua được form chính, focus ring nhìn thấy ở mọi control.

## 11. Rủi ro & lưu ý

- **Orders.jsx (763 dòng)** là trang nghiệp vụ nặng nhất — migrate style phải giữ nguyên logic FIFO/đối soát, không sửa hành vi; cần test kỹ tạo/sửa/xóa đơn sau khi restyle.
- Đổi font làm thay đổi metrics chữ → bảng/nút có thể lệch vài px; U0 phải rà nhanh mọi trang ngay sau khi đổi font.
- `sonner` và `@fontsource-variable/plus-jakarta-sans` cần verify tương thích React 19 + Vite 8 lúc cài (rủi ro thấp).
- Không gộp refactor UI với thay đổi nghiệp vụ trong cùng 1 commit/đợt — diff sẽ không review nổi.

## 12. Quyết định đã chốt (duyệt ngày 2026-07-13)

1. ~~Đổi tông primary sang indigo~~ → **CẬP NHẬT: giữ primary teal `#0f766e`** (chủ shop thử indigo rồi quyết định giữ teal). Brand hiển thị: "Phụ kiện Decor". Palette teal đầy đủ ở mục 4.
2. **Toast dùng thư viện `sonner`** — không tự viết.
3. **Font chốt: Plus Jakarta Sans** (self-host qua `@fontsource-variable/plus-jakarta-sans`), không cần demo so sánh.
