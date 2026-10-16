import { faceMotion, layout, type FaceMotionOptions } from './render';
import { smallGeometry, SMALL_MAX_PX, type Variant } from './small';
import { createDashy, type Dashy, type DashyOptions, type DashyState, type Geometry, type Shape } from './core';

export interface MountOptions extends DashyOptions {
  shape?: Shape;
  initialState?: DashyState;
  /** Dutch/English labels for screen readers. Default: Dutch. */
  labels?: Partial<Record<DashyState, string>>;
  /** Force reduced motion. Default: follow the system setting. */
  reducedMotion?: boolean;
  /** 'small' = simpler drawing for 24 to 32 px. 'auto' (default) picks it from the rendered size. */
  variant?: Variant;
  /**
   * Body mode: `container` itself is Dashy's body (a block of any shape). It stays exactly where it is: only the eyes are drawn,
   * as an overlay filling the block, and all the life is in the face (it moves, tilts and squashes inside the block, the eyes look
   * around and blink). The eyes are guaranteed to stay inside the block.
   */
  body?: FaceMotionOptions;
}
export interface DashyHandle {
  dashy: Dashy;
  setState(s: DashyState): void;
  getState(): DashyState;
  setShape(s: Shape): void;
  poke(): void;
  /** Look towards (nx, ny) in -1..1 relative to the centre, like a pointer would. */
  look(nx: number, ny: number): void;
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

  const bodyMode = !!opts.body;
  const maskDefs = (['L', 'R'] as const).map(s => `<mask id="${id}m${s}" maskUnits="userSpaceOnUse" x="-120" y="-120" width="240" height="240"><rect fill="#fff"/><rect fill="#000"/><ellipse fill="#000"/></mask>`).join('');
  const eyeRects = (['L', 'R'] as const).map(s => `<g class="eye${s}"><rect x="-80" y="-100" width="160" height="200" fill="#101214" mask="url(#${id}m${s})"/></g>`).join('');
  container.insertAdjacentHTML('beforeend', bodyMode ? `
<svg viewBox="0 0 300 300" role="img" style="position:absolute;inset:0;display:block;width:100%;height:100%;overflow:visible;pointer-events:none;shape-rendering:geometricPrecision">
  <title></title>
  <defs>${maskDefs}</defs>
  <g class="face">${eyeRects}</g>
</svg>` : `
<svg viewBox="0 0 300 300" role="img" style="display:block;width:100%;height:100%;overflow:visible;shape-rendering:geometricPrecision;touch-action:manipulation">
  <title></title>
  <defs>
    <clipPath id="${id}c"><rect x="40" y="40" width="220" height="220" rx="22"/></clipPath>
    ${maskDefs}
  </defs>
  <g class="body">
    <rect class="outline" x="40.5" y="40.5" width="219" height="219" rx="22" fill="#fff" stroke="#c9c9c4" stroke-width="1"/>
    <g clip-path="url(#${id}c)"><g class="face">${eyeRects}</g></g>
  </g>
</svg>`);
  const svg = container.querySelector<SVGSVGElement>('svg:last-of-type')!;
  const q = <T extends Element>(sel: string) => svg.querySelector<T>(sel)!;
  const face = q<SVGGElement>('.face');
  const body = bodyMode ? null : q<SVGGElement>('.body'), outline = bodyMode ? null : q<SVGRectElement>('.outline');
  const clip = bodyMode ? null : svg.querySelector<SVGRectElement>(`#${id}c rect`)!;
  const title = q<SVGTitleElement>('title');
  const eyes = (['L', 'R'] as const).map(s => {
    const m = svg.querySelector(`#${id}m${s}`)!;
    const [pill, lid] = Array.from(m.querySelectorAll('rect')) as SVGRectElement[];
    return { g: q<SVGGElement>(`.eye${s}`), pill, lid, low: m.querySelector('ellipse')! };
  });

  let small = opts.variant === 'small';
  const set = (el: Element, attrs: Record<string, string>) => { for (const k in attrs) el.setAttribute(k, attrs[k]); };
  // body mode: size of the card in px, and px per core unit (the body is 220 units wide in core.ts)
  let W = 0, H = 0, u = 1;
  function measure() {
    W = container.offsetWidth; H = container.offsetHeight;
    if (!W || !H) { W = H = 220; u = 1; } else u = Math.min(W, H) / 220;
    svg.setAttribute('viewBox', `${f(150 - W / (2 * u))} ${f(150 - H / (2 * u))} ${f(W / u)} ${f(H / u)}`);
  }
  function draw(G0: Geometry) {
    const L = layout(small && !bodyMode ? smallGeometry(G0) : G0, small && !bodyMode);
    if (!bodyMode) {
      outline!.setAttribute('stroke-width', L.outlineWidth); outline!.setAttribute('rx', L.outlineRx); clip!.setAttribute('rx', L.clipRx);
      body!.setAttribute('transform', L.body);
    }
    if (bodyMode) { const m = faceMotion(G0, W, H, opts.body); face.setAttribute('transform', `translate(${f(m.tx)} ${f(m.ty)}) rotate(${f(m.rot)}) scale(${f(m.sx)} ${f(m.sy)})`); }
    else face.setAttribute('transform', L.face);
    L.eyes.forEach((e, i) => {
      const E = eyes[i];
      E.g.setAttribute('transform', e.group); set(E.pill, e.pill); set(E.lid, e.lid); set(E.low, e.low);
    });
  }

  const pickVariant = () => { if (bodyMode) return; if (opts.variant === 'auto' || opts.variant === undefined) small = svg.getBoundingClientRect().width > 0 && svg.getBoundingClientRect().width <= SMALL_MAX_PX; };
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
  // body mode: a tap on the body (not on a button or link on top of it) is a poke
  const pokeTarget: HTMLElement | SVGSVGElement = bodyMode ? container : svg;
  const onTap = () => onDown();
  window.addEventListener('pointermove', onMove, { passive: true });
  pokeTarget.addEventListener('pointerdown', onTap);
  const mq = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  mq?.addEventListener('change', applyMotionPreference);
  const ro = typeof ResizeObserver === 'function' && (bodyMode || (opts.variant ?? 'auto') === 'auto') ? new ResizeObserver(() => { if (bodyMode) measure(); else pickVariant(); if (reduced()) settleAndDraw(); }) : null;
  ro?.observe(bodyMode ? container : svg); pickVariant(); if (bodyMode) measure();
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
    look(nx, ny) { if (!reduced()) dashy.pointer(nx, ny, now()); },
    destroy() {
      destroyed = true; cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onVisibility); io?.disconnect(); ro?.disconnect();
      window.removeEventListener('pointermove', onMove); mq?.removeEventListener('change', applyMotionPreference);
      pokeTarget.removeEventListener('pointerdown', onTap);
      svg.remove();
    },
  };
}
