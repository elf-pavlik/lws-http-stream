import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';

const isVercel = Boolean(process.env.VERCEL);
const devPort = Number(process.env.PORT ?? 5173);

const proxy = {
  '/notifications': {
    target: 'http://127.0.0.1:8787',
    changeOrigin: false,
  },
  '/health': {
    target: 'http://127.0.0.1:8787',
    changeOrigin: false,
  },
  '/contexts': {
    target: 'http://127.0.0.1:8787',
    changeOrigin: false,
  },
} as const;

export default defineConfig({
  plugins: [solid()],
  server: {
    port: devPort,
    strictPort: true,
    proxy: isVercel ? undefined : proxy,
  },
  preview: {
    port: 4173,
    proxy,
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
});
