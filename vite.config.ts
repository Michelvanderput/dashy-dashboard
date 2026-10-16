import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The app lives in app/. Vitest has its own config (vitest.config.ts) and does not use this one.
export default defineConfig({ root: 'app', envDir: '..', plugins: [react()], build: { outDir: '../dist-app', emptyOutDir: true }, server: { host: '127.0.0.1' } });
