import { mountDashy, type DashyState, type Shape } from '../src/index';

const h = mountDashy(document.getElementById('avatar')!);
const status: [DashyState, string][] = [['idle','Idle'],['received','Taak binnen'],['working','Werken'],['thinking','Denken'],['waiting','Wachten'],['blocked','Geblokkeerd'],['done','Klaar']];
const mood: [DashyState, string][] = [['happy','Blij'],['sad','Sip'],['angry','Boos'],['strict','Streng'],['dancing','Dansen'],['sleepy','Slaperig']];
function row(id: string, items: [string, string][], on: (k: string) => void, pressed: () => string) {
  const el = document.getElementById(id)!;
  const refresh = () => el.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.k === pressed())));
  items.forEach(([k, label]) => { const b = document.createElement('button'); b.dataset.k = k; b.textContent = label; b.onclick = () => { on(k); refresh(); }; el.appendChild(b); });
  refresh(); return refresh;
}
let shape: Shape = 'square';
const r1 = row('shape', [['square','Vierkant'],['circle','Cirkel']], k => { shape = k as Shape; h.setShape(shape); }, () => shape);
const r2 = row('status', status, k => h.setState(k as DashyState), () => h.getState());
const r3 = row('mood', mood, k => h.setState(k as DashyState), () => h.getState());
setInterval(() => { r2(); r3(); }, 300); // keep buttons in sync when Dashy changes state himself
void r1;
