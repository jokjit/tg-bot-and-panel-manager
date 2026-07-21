import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: {
    proxy: {
      '/admin/api': 'http://127.0.0.1:8787',
      '/admin/login': 'http://127.0.0.1:8787',
      '/admin/logout': 'http://127.0.0.1:8787',
      '/media': 'http://127.0.0.1:8787',
    },
  },
  build: {
    chunkSizeWarningLimit: 900,
  },
})
