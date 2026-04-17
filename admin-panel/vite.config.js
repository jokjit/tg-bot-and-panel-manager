import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  build: {
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('naive-ui')) return 'naive-ui';
          if (id.includes('vue') || id.includes('@vue')) return 'vue-vendor';
          if (id.includes('lodash')) return 'utils-vendor';
          return 'vendor';
        },
      },
    },
  },
})
