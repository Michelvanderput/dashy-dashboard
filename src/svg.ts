import { createDashy, type Dashy, type DashyOptions, type DashyState, type Geometry, type Shape } from './core';

export interface MountOptions extends DashyOptions {
  shape?: Shape;
  initialState?: DashyState;
  /** Dutch/English labels for screen readers. Default: Dutch. */
  labels?: Partial<Record<DashyState, string>>;
  /** Force reduced motion. Default: follow the system setting. */
  reducedMotion?: boolean;
}
export interface DashyHandle {
  dashy: Dashy;
  setState(s: DashyState): void;
  getState(): DashyState;
  setShape(s: Shape): void;
  poke(): void;
  destroy(): void;
}

const NS = 'http://www.w3.org/2000/svg';
export const DEFAULT_LABELS: Record<DashyState, string> = {
  idle: 'Dashy wacht rustig', received: 'Dashy heeft een taak gekregen', working: 'Dashy is aan het werk',
  thinking: 'Dashy denkt na', waiting: 'Dashy wacht op jou', blocked: 'Dashy zit vast en heeft hulp nodig',
  done: 'Dashy is klaar', happy: 'Dashy is blij', sad: 'Dashy is sip', angry: 'Dashy is boos',
  strict: 'Dashy is streng', dancing: 'Dashy danst', sleepy: 'Dashy is slaperig',
};
let uid = 0;
const f = (v: number) => v.toFixed(2);

export function mountDashy(container: HTMLElement, opts: MountOptions = {}): DashyHandle {
  const id = 'dashy' + ++uid;
  const dashy = createDashy({ seed: opts.seed ?? Math.floor(Math.random() * 1e6) + 1, eyeScale: opts.eyeScale });
  const labels = { ...DEFAULT_LABELS, ...opts.labels };
  const reduced = () => opts.reducedMotion ?? (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);

  container.insertAdjacentHTML('beforeend', `
<svg viewBox="0 0 300 300" role="img" style="display:block;width:100%;height:100%;overflow:visible;shape-rendering:geometricPrecision;touch-action:manipulation">
  <title></title>
  <defs>
    <clipPath id="${id}c"><rect x="40" y="40" width="220" height="220" rx="22"/></clipPath>
    ${(['L', 'R'] as const).map(s => `<mask id="${id}m${s}" maskUnits="userSpaceOnUse" x="-120" y="-120" width="240" height="240"><rect fill="#fff"/><rect fill="#000"/><ellipse fill="#000"/></mask>`).join('')}
  </defs>
  <g class="body">
    <rect class="outline" x="40.5" y="40.5" width="219" height="219" rx="22" fill="#fff" stroke="#c9c9c4" stroke-width="1"/>
    <g clip-path="url(#${id}c)"><g class="face">
      ${(['L', 'R'] as const).map(s => `<g class="eye${s}"><rect x="-80" y="-100" width="160" height="200" fill="#101214" mask="url(#${id}m${s})"/></g>`).join('')}
    </g></g>
  </g>
</svg>`);
  const svg = container.querySelector<SVGSVGElement>('svg:last-of-type')!;
  const q = <T extends Element>(sel: string) => svg.querySelector<T>(sel)!;
  const body = q<SVGGElement>('.body'), face = q<SVGGElement>('.face'), outline = q<SVGRectElement>('.outline');
  const clip = svg.querySelector<SVGRectElement>(`#${id}c rect`)!;
  const title = q<SVGTitleElement>('title');
  const eyes = (['L', 'R'] as const).map(s => {
    const m = svg.querySelector(`#${id}m${s}`)!;
    const [pill, lid] = Array.from(m.querySelectorAll('rect')) as SVGRectElement[];
    return { g: q<SVGGElement>(`.eye${s}`), pill, lid, low: m.querySelector('ellipse')! };
  });

  function draw(G: Geometry) {
    outline.setAttribute('rx', f(Math.max(0, G.rx - 0.5))); clip.setAttribute('rx', f(G.rx));
    const b = G.body, fc = G.face;
    body.setAttribute('transform', `translate(${f(b.tx)} ${f(b.ty)}) rotate(${f(b.rot)}) scale(${f(b.sx)} ${f(b.sy)}) translate(-150 -260)`);
    face.setAttribute('transform', `translate(${f(fc.tx)} ${f(fc.ty)}) rotate(${f(fc.rot)}) scale(${f(fc.sx)} ${f(fc.sy)})`);
    G.eyes.forEach((e, i) => {
      const E = eyes[i], hw = e.ew / 2, eh = e.eh, yb = -eh / 2 + e.cov * eh;
      E.g.setAttribute('transform', `translate(${f(e.x)} ${f(e.y)}) rotate(${f(e.tilt)})`);
      E.pill.setAttribute('x', f(-hw)); E.pill.setAttribute('y', f(-eh / 2)); E.pill.setAttribute('width', f(e.ew)); E.pill.setAttribute('height', f(eh)); E.pill.setAttribute('rx', f(Math.min(hw, eh / 2)));
      E.lid.setAttribute('x', '-90'); E.lid.setAttribute('y', f(yb - 140)); E.lid.setAttribute('width', '180'); E.lid.setAttribute('height', '140');
      E.lid.setAttribute('transform', `rotate(${f(e.lidA)} 0 ${f(yb)})`);
      if (e.low > 0.001) {
        const ry = eh * 0.62, yt = eh / 2 - e.low * eh;
        E.low.setAttribute('cx', '0'); E.low.setAttribute('cy', f(yt + ry)); E.low.setAttribute('rx', f(e.ew * 0.95)); E.low.setAttribute('ry', f(ry));
      } else { E.low.setAttribute('rx', '0'); E.low.setAttribute('ry', '0'); }
    });
  }

  let raf = 0, destroyed = false, offscreen = false;
  const now = () => performance.now();
  const setTitle = () => { title.textContent = labels[dashy.getState()]; };
  // No frames while the window is hidden or the avatar is scrolled out of view.
  const paused = () => offscreen || (typeof document !== 'undefined' && document.hidden);
  function settleAndDraw() { // reduced motion: simulate ~1.5s instantly, draw one still frame
    let t = now(); let G!: Geometry;
    for (let i = 0; i < 90; i++) { t += 16.7; G = dashy.step(t); }
    draw(G);
  }
  function loop(t: number) {
    if (destroyed) return;
    const G = dashy.step(t);
    draw(G);
    if (title.textContent !== labels[G.cur]) setTitle(); // keeps the label right when core moves on by itself (received -> working, done -> idle)
    raf = requestAnimationFrame(loop);
  }
  function applyMotionPreference() {
    cancelAnimationFrame(raf); raf = 0;
    if (reduced()) { settleAndDraw(); setTitle(); } else if (!paused()) raf = requestAnimationFrame(loop);
  }

  if (opts.shape) dashy.setShape(opts.shape);
  if (opts.initialState) dashy.setState(opts.initialState, now());
  setTitle();

  const onMove = (e: PointerEvent) => {
    if (reduced()) return;
    const r = svg.getBoundingClientRect();
    dashy.pointer((e.clientX - (r.left + r.width / 2)) / (r.width / 2), (e.clientY - (r.top + r.height / 2)) / (r.height / 2), now());
  };
  const onDown = () => { if (!reduced()) { dashy.poke(now()); setTitle(); } };
  window.addEventListener('pointermove', onMove, { passive: true });
  svg.addEventListener('pointerdown', onDown);
  const mq = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  mq?.addEventListener('change', applyMotionPreference);
  const onVisibility = () => applyMotionPreference();
  document.addEventListener('visibilitychange', onVisibility);
  const io = typeof IntersectionObserver === 'function'
    ? new IntersectionObserver(entries => { offscreen = !entries[entries.length - 1].isIntersecting; applyMotionPreference(); })
    : null;
  io?.observe(svg);
  applyMotionPreference();

  return {
    dashy,
    setState(s) { dashy.setState(s, now()); setTitle(); if (reduced()) settleAndDraw(); },
    getState: () => dashy.getState(),
    setShape(s) { dashy.setShape(s); if (reduced()) settleAndDraw(); },
    poke: onDown,
    destroy() {
      destroyed = true; cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onVisibility); io?.disconnect();
      window.removeEventListener('pointermove', onMove); mq?.removeEventListener('change', applyMotionPreference);
      svg.remove();
    },
  };
}
