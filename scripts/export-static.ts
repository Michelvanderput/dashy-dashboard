/**
 * Generates the static exports from core.ts: SVG and PNG per state for app icon, favicon and documentation.
 *   npm run export            (needs Chromium; set CHROMIUM_PATH if it is not at /opt/pw-browsers/chromium)
 * SVGs come from src/static.ts (pure). PNGs are those SVGs rendered by Chromium, nothing is redrawn by hand.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium, type Page } from 'playwright';
import { createDashy } from '../src/core';
import { ALL_STATES, renderSvg, settledGeometry, stillGeometry } from '../src/static';

const OUT = 'exports';
/** App icon background (full bleed; iOS and macOS apply their own corner mask). Change here to give Dashy a colour. */
export const ICON_BACKGROUND = '#101214';
const dir = (...p: string[]) => { const d = [OUT, ...p].join('/'); mkdirSync(d, { recursive: true }); return d; };
const names = createDashy().states;

async function png(page: Page, svg: string, px: number, file: string) {
  await page.setViewportSize({ width: px, height: px });
  const sized = svg.replace('<svg ', `<svg width="${px}" height="${px}" `);
  await page.setContent(`<!doctype html><body style="margin:0;background:transparent">${sized}</body>`);
  writeFileSync(file, await page.screenshot({ clip: { x: 0, y: 0, width: px, height: px }, omitBackground: true }));
}

/** Minimal .ico that embeds PNGs (supported by every browser since IE9). */
function ico(images: { px: number; data: Buffer }[]): Buffer {
  const head = Buffer.alloc(6); head.writeUInt16LE(1, 2); head.writeUInt16LE(images.length, 4);
  let offset = 6 + 16 * images.length;
  const entries = images.map(({ px, data }) => {
    const e = Buffer.alloc(16);
    e.writeUInt8(px >= 256 ? 0 : px, 0); e.writeUInt8(px >= 256 ? 0 : px, 1); e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6);
    e.writeUInt32LE(data.length, 8); e.writeUInt32LE(offset, 12); offset += data.length; return e;
  });
  return Buffer.concat([head, ...entries, ...images.map(i => i.data)]);
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ deviceScaleFactor: 1 });

for (const state of ALL_STATES) {
  const G = settledGeometry(state);
  const title = `Dashy: ${names[state].n}`;
  const full = renderSvg(G, { title }), small = renderSvg(G, { title, variant: 'small', margin: 10 });
  const icon = renderSvg(stillGeometry(G), { title, background: ICON_BACKGROUND, margin: 0 });
  writeFileSync(`${dir('svg')}/${state}.svg`, full);
  writeFileSync(`${dir('svg', 'small')}/${state}.svg`, small);
  for (const px of [512, 128]) await png(page, full, px, `${dir('png')}/${state}-${px}.png`);
  await png(page, icon, 1024, `${dir('app-icon')}/${state}-1024.png`);
  for (const px of [32, 16]) await png(page, small, px, `${dir('favicon')}/${state}-${px}.png`);
}

// Favicon set and iPhone icon: the calm state.
const idle = settledGeometry('idle');
writeFileSync(`${dir('favicon')}/favicon.svg`, renderSvg(idle, { variant: 'small', margin: 10 }));
const icoImages: { px: number; data: Buffer }[] = [];
for (const px of [16, 32, 48]) {
  const file = `${dir('favicon')}/favicon-${px}.png`;
  await png(page, renderSvg(idle, { variant: 'small', margin: 10 }), px, file);
  icoImages.push({ px, data: (await import('node:fs')).readFileSync(file) });
}
writeFileSync(`${dir('favicon')}/favicon.ico`, ico(icoImages));
await png(page, renderSvg(stillGeometry(idle), { background: ICON_BACKGROUND, margin: 0 }), 180, `${dir('app-icon')}/apple-touch-icon.png`);

// Documentation sheet: every state, full drawing on top, the small variant at its real 32 px below.
const cell = (state: (typeof ALL_STATES)[number], i: number) => {
  const G = settledGeometry(state);
  const big = renderSvg(G, { idPrefix: `b${i}`, title: names[state].n }).replace('<svg ', '<svg width="120" height="120" ');
  const sm = renderSvg(G, { idPrefix: `s${i}`, variant: 'small', margin: 10, title: names[state].n }).replace('<svg ', '<svg width="32" height="32" ');
  return `<div class="c">${big}<b>${names[state].n}</b><code>${state}</code>${sm}</div>`;
};
await page.setViewportSize({ width: 1180, height: 700 });
await page.setContent(`<!doctype html><style>body{margin:0;padding:24px;background:#f4f4f1;font:13px system-ui,sans-serif;color:#101214}
.g{display:grid;grid-template-columns:repeat(7,150px);gap:20px 16px}.c{display:flex;flex-direction:column;align-items:center;gap:6px}code{color:#666;font-size:11px}</style>
<div class="g">${ALL_STATES.map(cell).join('')}</div>`);
const sheet = await page.locator('.g').boundingBox();
writeFileSync(`${dir('docs')}/states.png`, await page.screenshot({ clip: { x: 0, y: 0, width: 1180, height: Math.ceil(sheet!.y + sheet!.height + 24) } }));

await browser.close();
console.log(`Exports written to ${OUT}/`);
