# Deploy — Runbook

Trạng thái: **đã deploy production lần đầu ngày 2026-07-15.** Tài liệu này mô tả quy trình thật đang dùng (không phải đề xuất).

## Hạ tầng

| Thành phần | Dịch vụ | Ghi chú |
|---|---|---|
| Frontend | Firebase Hosting (`tanle-dev-lynstore`) | https://tanle-dev-lynstore.web.app |
| Backend | Cloud Run (`bap-backend-api`, `asia-southeast1`) | scale-to-zero (không cấu hình min-instances → cold start vài giây sau khi rảnh) |
| Database | **Neon** (Postgres serverless, region `us-east-1`) | thay cho Postgres local/Docker chỉ dùng ở dev |
| Auth | Firebase Auth + custom claim `admin` | không đổi |

## Trigger deploy

`.github/workflows/deploy.yml` chỉ chạy khi **kích hoạt thủ công** (`workflow_dispatch`), không tự động theo mỗi lần push `main`. Lý do: điều kiện `if:` cũ dựa vào `github.event.commits.*.modified` không tin cậy với squash-merge qua API (đã bị skip toàn bộ trước đó) — bỏ luôn, đồng thời khớp đúng quy trình "test tổng thể xong mới deploy một lần".

Cách chạy: GitHub → Actions → "Build and Deploy" → **Run workflow**, hoặc `gh workflow run "Build and Deploy" --ref main`.

## ⚠️ Job `deploy-backend` chạy tự động OK — `deploy-frontend` hiện KHÔNG tự chạy được qua CI

Service account trong `FIREBASE_SERVICE_ACCOUNT_TANLE_DEV` (`firebase-adminsdk-fbsvc@tanle-dev.iam.gserviceaccount.com`) thiếu quyền `firebasehosting.sites.update` → job `deploy-frontend` lỗi 403. **Chưa sửa** (2 lựa chọn từng đưa ra: cấp thêm role `Firebase Hosting Admin` cho chính SA này, hoặc tạo SA riêng — cần chủ dự án xác nhận, IAM permission tôi không tự cấp khi chưa được nêu rõ).

**Cách deploy frontend hiện tại (thủ công, đã dùng cho lần đầu):**

```powershell
# 1. Lấy URL Cloud Run mới nhất (nếu backend vừa deploy lại)
gcloud run services describe bap-backend-api --project=tanle-dev --region=asia-southeast1 --format="value(status.url)"

# 2. Đảm bảo .env.production có đúng URL đó (VITE_API_URL="https://...")

# 3. Build sạch + deploy
Remove-Item -Recurse -Force dist -ErrorAction SilentlyContinue
npm run build
firebase deploy --only hosting:lynstore --project tanle-dev
```

Cần đăng nhập `firebase login` bằng tài khoản có quyền trên project `tanle-dev` (chủ dự án đã đăng nhập sẵn khi deploy lần đầu).

## Database — Neon

- Connection string nằm trong GitHub Secret `DATABASE_URL` (Neon Console → Connection Details để xem/đổi lại khi cần).
- **Không bật Neon Data API / Neon Auth** — app đã có tầng Express/Prisma xử lý quyền + audit log riêng; bật Data API sẽ cho phép ghi thẳng bảng bỏ qua toàn bộ kiểm tra quyền.
- Restore data: dùng `backend/scripts/restore.ts` như hướng dẫn trong `README.md`, trỏ `RESTORE_DATABASE_URL` vào Neon.
- Migrate: `DATABASE_URL=<neon-url> npx prisma migrate deploy` (chạy từ `backend/`).

## GitHub Secrets cần có (đã set đủ)

`DATABASE_URL`, `FIREBASE_SERVICE_ACCOUNT_TANLE_DEV`, `WIF_PROVIDER`, `WIF_SERVICE_ACCOUNT`.

## GCP resources đã dựng cho CI (2026-07-15)

- Artifact Registry repo `bap-repo` (`asia-southeast1`) — `deploy.yml` push image vào đây.
- Service account `github-actions-deployer@tanle-dev.iam.gserviceaccount.com` — role `run.admin`, `artifactregistry.writer`, `iam.serviceAccountUser`.
- Workload Identity Pool `github-pool` + Provider `github-provider` — giới hạn chỉ repo `leanhtantt/quanlytonkho` được impersonate service account trên (không dùng JSON key cho Cloud Run, chỉ Firebase Hosting còn dùng key).
