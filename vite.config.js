import { defineConfig, configDefaults } from 'vitest/config'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    // Backend có bộ test riêng (chạy trong thư mục backend/ với deps riêng).
    // Loại backend khỏi vitest gốc để job frontend không cố resolve deps của backend.
    exclude: [...configDefaults.exclude, 'backend/**'],
  },
})
