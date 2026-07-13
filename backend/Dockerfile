FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies
RUN npm ci

# Generate prisma client
RUN npx prisma generate

# Copy source code
COPY . .

# Build typescript
RUN npm run build

# Production image
FROM node:20-alpine

WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
# prisma.config.ts cung cấp địa chỉ DATABASE_URL cho lệnh migrate lúc khởi động.
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts

EXPOSE 3000
# npm tự chạy "prestart" (prisma migrate deploy) trước "start".
# Migrate lỗi -> container không khởi động -> Cloud Run giữ bản cũ đang chạy.
CMD ["npm", "start"]
