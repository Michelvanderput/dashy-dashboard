// Bundles src into one IIFE and inlines it in a single self-contained demo.html
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const out = await build({ entryPoints: ['demo/main.ts'], bundle: true, format: 'iife', minify: true, write: false });
const js = out.outputFiles[0].text.replace(/<\/script>/g, '<\\/script>');
const tpl = readFileSync('demo/index.html', 'utf8');
mkdirSync('dist', { recursive: true });
writeFileSync('dist/demo.html', tpl.replace('<!--BUNDLE-->', `<script>${js}</script>`));
console.log('dist/demo.html written');
