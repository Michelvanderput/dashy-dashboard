import type { Geometry } from './core';

const f = (v: number) => v.toFixed(2);

export interface EyeLayout {
  group: string;
  pill: { x: string; y: string; width: string; height: string; rx: string };
  lid: { x: string; y: string; width: string; height: string; transform: string };
  low: { cx: string; cy: string; rx: string; ry: string };
}
export interface Layout {
  outlineWidth: string; outlineRx: string; clipRx: string;
  body: string; face: string; eyes: EyeLayout[];
}

/** Geometry -> the exact SVG attribute values. Shared by the live DOM drawing (svg.ts) and the static export (static.ts). */
export function layout(G: Geometry, small = false): Layout {
  const b = G.body, fc = G.face;
  return {
    outlineWidth: small ? '8' : '1',
    outlineRx: f(Math.max(0, G.rx - 0.5)),
    clipRx: f(G.rx),
    body: `translate(${f(b.tx)} ${f(b.ty)}) rotate(${f(b.rot)}) scale(${f(b.sx)} ${f(b.sy)}) translate(-150 -260)`,
    face: `translate(${f(fc.tx)} ${f(fc.ty)}) rotate(${f(fc.rot)}) scale(${f(fc.sx)} ${f(fc.sy)})`,
    eyes: G.eyes.map(e => {
      const hw = e.ew / 2, eh = e.eh, yb = -eh / 2 + e.cov * eh;
      const ry = eh * 0.62, yt = eh / 2 - e.low * eh;
      const lower = e.low > 0.001;
      return {
        group: `translate(${f(e.x)} ${f(e.y)}) rotate(${f(e.tilt)})`,
        pill: { x: f(-hw), y: f(-eh / 2), width: f(e.ew), height: f(eh), rx: f(Math.min(hw, eh / 2)) },
        lid: { x: '-90', y: f(yb - 140), width: '180', height: '140', transform: `rotate(${f(e.lidA)} 0 ${f(yb)})` },
        low: lower ? { cx: '0', cy: f(yt + ry), rx: f(e.ew * 0.95), ry: f(ry) } : { cx: '0', cy: '0', rx: '0', ry: '0' },
      };
    }),
  };
}
