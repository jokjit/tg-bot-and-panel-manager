import { resolve as resolvePath } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  resolve: {
    alias: {
      '@tg-bot/deploy-utils': resolvePath(import.meta.dirname, '../shared/deploy-utils.cjs'),
      '@tg-bot/deployment-core': resolvePath(import.meta.dirname, '../shared/deployment-core.cjs'),
    },
  },
  optimizeDeps: {
    include: [
      '@tg-bot/deploy-utils',
      '@tg-bot/deployment-core',
    ],
  },
  server: {
    host: true,
    port: 5176,
  },
  build: {
    target: 'es2022',
  },
});
