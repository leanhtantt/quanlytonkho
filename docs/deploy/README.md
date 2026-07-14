# Deploy Preview — Hướng dẫn cài đặt

## Mục đích

Workflow `preview-workflow.yml` tạo **Firebase Hosting preview channel** cho mỗi Pull Request. Khi mở PR, GitHub Actions sẽ:

1. Build frontend (`npm ci && npm run build`)
2. Deploy lên preview channel `pr-<số PR>` (tự hết hạn sau 7 ngày)
3. Comment URL preview trực tiếp vào PR để xem bằng mắt trước khi merge

## Cài đặt (chủ dự án làm 1 lần)

### 1. Copy workflow vào đúng vị trí

```bash
cp docs/deploy/preview-workflow.yml .github/workflows/preview.yml
```

### 2. Kiểm tra GitHub Secret

Workflow cần secret `FIREBASE_SERVICE_ACCOUNT_TANLE_DEV` — secret này **đã có sẵn** trong repo (được dùng bởi `deploy.yml` hiện tại). Không cần thêm secret mới.

### 3. Commit và push

```bash
git add .github/workflows/preview.yml
git commit -m "ci: thêm workflow preview deploy cho PR"
git push
```

Từ đây, mỗi PR mới sẽ tự có URL preview.

## Chi tiết kỹ thuật

- **Action**: `FirebaseExtended/action-hosting-deploy@v0` (cùng action với deploy production)
- **Project**: `tanle-dev`, target `lynstore` (hosting site `tanle-dev-lynstore`)
- **Channel**: `pr-<number>` — mỗi PR có URL riêng, ví dụ `https://tanle-dev-lynstore--pr-16-xxxxx.web.app`
- **Hết hạn**: 7 ngày sau lần deploy cuối (tự dọn dẹp)
- **Comment**: Action tự comment URL preview vào PR (dùng `GITHUB_TOKEN`)

## Tại sao file workflow nằm ở `docs/deploy/` thay vì `.github/workflows/`?

Để tránh rủi ro CI kích hoạt không đúng lúc khi workflow chưa được review, file được đặt tại `docs/deploy/` như đề xuất. Chủ dự án copy thủ công vào `.github/workflows/` khi sẵn sàng.
