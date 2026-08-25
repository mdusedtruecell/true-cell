/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      api: path.resolve(__dirname, 'src/api'),
      assets: path.resolve(__dirname, 'src/assets'),
      components: path.resolve(__dirname, 'src/components'),
      hooks: path.resolve(__dirname, 'src/hooks'),
      pages: path.resolve(__dirname, 'src/pages'),
      routes: path.resolve(__dirname, 'src/routes'),
      store: path.resolve(__dirname, 'src/store'),
      types: path.resolve(__dirname, 'src/types'),
      utils: path.resolve(__dirname, 'src/utils'),
    },
  },
  server: {
    proxy: {
      '/api/sheet-history': {
        target: 'https://script.google.com',
        changeOrigin: true,
        secure: true,
        followRedirects: true,
        rewrite: (requestPath) =>
          requestPath.replace(
            /^\/api\/sheet-history/,
            '/macros/s/AKfycbw89yajiSI_8Y_jBBWS_GeUSUHKuf_bO7O6Tk4KbrRfn8KwzJ9g_QPR0WUeY536qohLxg/exec'
          ),
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/setupTests.js',
  },
});