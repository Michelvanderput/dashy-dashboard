import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['tests/component/**/*.test.tsx'], environment: 'jsdom' } });
