import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// The app lives in app/. Vitest has its own config (vitest.config.ts) and does not use this one.
export default defineConfig({ root: 'app', envDir: '..', plugins: [react()], build: { outDir: '../dist-app', emptyOutDir: true, rollupOptions: { input: { main: fileURLToPath(new URL('./app/index.html', import.meta.url)), buddy: fileURLToPath(new URL('./app/buddy.html', import.meta.url)) } } }, server: { host: '127.0.0.1' } });
