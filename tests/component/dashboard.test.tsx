import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Dashboard, type DashboardProps } from '../../src/react';
import { RULES } from '../../src/driver';
import type { PlanItem } from '../../src/dashboard/plan';
import type { NowPlaying } from '../../src/spotify/model';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const MIN = 60_000, T0 = Date.parse('2026-10-16T12:00:00+02:00');
const res = (rule: (typeof RULES)[number]['rule']) => ({ rule, state: RULES.find(r => r.rule === rule)!.state });
const items: PlanItem[] = [
  { id: 'overleg', kind: 'event', title: 'Overleg met Sanne', at: T0 + 95 * MIN, endsAt: T0 + 125 * MIN },
  { id: 'offerte', kind: 'task', title: 'Offerte sturen', at: T0 + 4 * 60 * MIN, note: 'Klant wacht' },
  { id: 'boodschappen', kind: 'task', title: 'Boodschappen', at: null },
];
const track: NowPlaying = { id: 't', title: 'Midnight Roses', artists: ['The Placeholders'], album: 'A', coverUrl: null, trackUrl: null, durationMs: 200_000, progressMs: 0, playing: true, fetchedAt: T0 };
const base = (o: Partial<DashboardProps> = {}): DashboardProps => ({ now: T0, items, resolution: res('idle'), music: { nowPlaying: null, status: 'connected' }, ...o });
const root = (c: HTMLElement) => c.querySelector('.db') as HTMLElement;
const block = (c: HTMLElement, id: string) => c.querySelector(`[data-block="${id}"]`) as HTMLElement;
const dashyLabel = (c: HTMLElement) => block(c, 'dashy').querySelector('svg[role="img"] title')!.textContent;

describe('<Dashboard />', () => {
  it('shows five labelled blocks and starts calm: nothing grown, nothing announced', () => {
    const { container } = render(<Dashboard {...base()} />);
    for (const t of ['Dashy', 'Nu', 'Planning', 'Muziek', 'Vandaag']) expect(screen.getByRole('heading', { name: t })).toBeTruthy();
    expect(container.querySelectorAll('section.db-block')).toHaveLength(5);
    expect(root(container).dataset.focus).toBe('none');
    expect(container.querySelector('[role="status"].db-sr')!.textContent).toBe('');
    expect(container.querySelectorAll('[data-attn="true"]')).toHaveLength(0);
    expect(root(container).style.getPropertyValue('--cols')).toBe('1.2fr 1fr 1.2fr');
  });

  it('every block has a labelled toggle that is keyboard reachable', () => {
    render(<Dashboard {...base()} />);
    const toggles = screen.getAllByRole('button', { name: /^Vergroot / });
    expect(toggles).toHaveLength(5);
    for (const t of toggles) { expect(t.getAttribute('aria-pressed')).toBe('false'); expect(t.tabIndex).toBeGreaterThanOrEqual(0); }
  });

  it.each([
    ['deadlineNear', 'dashy', 'Dashy vergroot: Deadline binnen 15 minuten'],
    ['deadlineSoon', 'plan', 'Planning vergroot: Deadline binnen een uur'],
    ['blocked', 'dashy', 'Dashy vergroot: Dashy zit vast'],
    ['waiting', 'dashy', 'Dashy vergroot: Dashy wacht op jou'],
  ] as const)('%s grows the %s block, marks it, and announces why', (rule, id, text) => {
    const { container } = render(<Dashboard {...base({ resolution: res(rule) })} />);
    expect(root(container).dataset.focus).toBe(id);
    expect(block(container, id).dataset.attn).toBe('true'); expect(block(container, id).dataset.focus).toBe('true');
    expect(container.querySelector('[role="status"].db-sr')!.textContent).toBe(text);
    expect(root(container).style.getPropertyValue('--cols')).not.toBe('1.2fr 1fr 1.2fr'); // the tracks really changed
    expect(screen.getByRole('button', { name: new RegExp(`^Verklein`) })).toBeTruthy();
  });

  it('an appointment within 10 minutes grows "Straks"; further away it stays calm', () => {
    const soon = [{ ...items[0], at: T0 + 8 * MIN }, ...items.slice(1)];
    expect(root(render(<Dashboard {...base({ items: soon })} />).container).dataset.focus).toBe('now');
    cleanup();
    expect(root(render(<Dashboard {...base()} />).container).dataset.focus).toBe('none');
  });

  it('music: Dashy dances while the driver is calm; a deadline keeps him strict; the music block grows for a short moment only', () => {
    const { container, rerender } = render(<Dashboard {...base({ music: { nowPlaying: track, status: 'connected' } })} />);
    expect(dashyLabel(container)).toBe('Dashy danst'); expect(root(container).dataset.focus).toBe('music');
    rerender(<Dashboard {...base({ now: T0 + 9000, music: { nowPlaying: track, status: 'connected' } })} />);
    expect(root(container).dataset.focus).toBe('none'); expect(dashyLabel(container)).toBe('Dashy danst');
    rerender(<Dashboard {...base({ now: T0 + 9000, resolution: res('deadlineSoon'), music: { nowPlaying: track, status: 'connected' } })} />);
    expect(dashyLabel(container)).toBe('Dashy is streng');
  });

  it('a finished task shows a short celebration that ends by itself, and a calmer state takes over', () => {
    const { container, rerender } = render(<Dashboard {...base({ resolution: res('done') })} />);
    expect(root(container).dataset.focus).toBe('dashy'); expect(dashyLabel(container)).toBe('Dashy is klaar');
    rerender(<Dashboard {...base({ now: T0 + 4500, resolution: res('idle') })} />);
    expect(root(container).dataset.focus).toBe('none');
  });

  it('you can grow any block yourself; it wins over what needs attention, and a second tap or Escape lets go', () => {
    const { container } = render(<Dashboard {...base({ resolution: res('deadlineNear') })} />);
    expect(root(container).dataset.focus).toBe('dashy');
    fireEvent.click(screen.getByRole('button', { name: 'Vergroot Vandaag' }));
    expect(root(container).dataset.focus).toBe('clock');
    expect(block(container, 'clock').dataset.attn).toBe('false'); // chosen by you: no alarm ring
    expect(screen.getByRole('button', { name: 'Verklein Vandaag' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Verklein Vandaag' }));
    expect(root(container).dataset.focus).toBe('dashy');
    fireEvent.click(screen.getByRole('button', { name: 'Vergroot Planning' })); expect(root(container).dataset.focus).toBe('plan');
    fireEvent.keyDown(root(container), { key: 'Escape' }); expect(root(container).dataset.focus).toBe('dashy');
  });

  it('a pin lasts ten minutes, then the screen returns to what needs attention', () => {
    const { container, rerender } = render(<Dashboard {...base()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Vergroot Muziek' })); expect(root(container).dataset.focus).toBe('music');
    rerender(<Dashboard {...base({ now: T0 + 9 * MIN })} />); expect(root(container).dataset.focus).toBe('music');
    rerender(<Dashboard {...base({ now: T0 + 10 * MIN + 1 })} />); expect(root(container).dataset.focus).toBe('none');
  });

  it('planning: tasks are checkboxes with names, events are not, finishing calls back', () => {
    const onToggleDone = vi.fn();
    const { container } = render(<Dashboard {...base({ onToggleDone })} />);
    const list = within(container.querySelector('ul.db-plan') as HTMLElement);
    const box = list.getByRole('checkbox', { name: 'Offerte sturen: markeer als klaar' });
    expect(box.getAttribute('aria-checked')).toBe('false'); fireEvent.click(box); expect(onToggleDone).toHaveBeenCalledWith('offerte', true);
    expect(list.getAllByRole('checkbox')).toHaveLength(2); // the appointment is not a checkbox
    expect(list.getByText('(afspraak)')).toBeTruthy();
  });

  it('a done task is marked as such and can be reopened', () => {
    const onToggleDone = vi.fn();
    render(<Dashboard {...base({ items: [{ ...items[1], done: true }], onToggleDone })} />);
    const box = screen.getByRole('checkbox', { name: 'Offerte sturen: markeer als niet klaar' });
    expect(box.getAttribute('aria-checked')).toBe('true'); fireEvent.click(box); expect(onToggleDone).toHaveBeenCalledWith('offerte', false);
  });

  it('urgent deadlines are marked on the row (colour is never the only signal: the time and weight change too)', () => {
    const { container } = render(<Dashboard {...base({ items: [{ ...items[1], at: T0 + 10 * MIN }] })} />);
    const row = container.querySelector('.db-item[data-kind="task"]') as HTMLElement;
    expect(row.dataset.urgency).toBe('near'); expect(row.querySelector('.db-time')!.textContent).toMatch(/\d\d:\d\d/);
  });

  it("Claude's own line replaces the default line; the default never blames", () => {
    const { container, rerender } = render(<Dashboard {...base({ resolution: res('quiet') })} />);
    expect(container.querySelector('.db-line')!.textContent).toMatch(/Begin klein/);
    rerender(<Dashboard {...base({ resolution: res('quiet'), line: 'Zullen we met één mailtje beginnen?' })} />);
    expect(container.querySelector('.db-line')!.textContent).toBe('Zullen we met één mailtje beginnen?');
  });

  it('portrait screens get their own arrangement, with the same rule for growing', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 390, height: 844, top: 0, left: 0, right: 390, bottom: 844, x: 0, y: 0, toJSON() {} });
    const { container } = render(<Dashboard {...base({ resolution: res('deadlineSoon') })} />);
    expect(root(container).dataset.orientation).toBe('portrait');
    expect(root(container).style.getPropertyValue('--areas')).toBe('"dashy dashy" "now clock" "plan plan" "music music"');
    expect(root(container).style.getPropertyValue('--rows')).toBe('1.2fr 0.8fr 3.9fr 0.9fr');
  });

  it('reduced motion switches every transition off, and the grid itself is the only thing that animates otherwise', () => {
    const { container } = render(<Dashboard {...base()} />);
    const css = container.querySelector('style')!.textContent!;
    expect(css).toMatch(/\.db\{[^}]*transition:grid-template-columns \.8s[^}]*grid-template-rows \.8s/);
    expect(css).toMatch(/@media \(prefers-reduced-motion:reduce\)\{\.db,\.db-block[^}]*\{transition:none\}/);
    expect(css).not.toMatch(/@keyframes/);
  });

  it('the toggles stay out of the way of attention: a change of focus never moves keyboard focus', () => {
    const { container, rerender } = render(<Dashboard {...base()} />);
    const btn = screen.getByRole('button', { name: 'Vergroot Planning' }); btn.focus(); expect(document.activeElement).toBe(btn);
    rerender(<Dashboard {...base({ resolution: res('deadlineNear') })} />);
    expect(root(container).dataset.focus).toBe('dashy'); expect(document.activeElement).toBe(btn);
  });
});

describe('Dashy IS the block: it stands still, his face lives', () => {
  const face = (c: HTMLElement) => c.querySelector('.db-face') as HTMLElement;
  const wait = (ms: number) => act(async () => { await new Promise(r => setTimeout(r, ms)); });

  it('the white block carries his eyes, and screen readers get his state as a label', () => {
    const { container } = render(<Dashboard {...base()} />);
    expect(face(container).querySelector('svg[role="img"] title')!.textContent).toBe('Dashy wacht rustig');
    expect(face(container).querySelector('svg')!.getAttribute('style')).toMatch(/pointer-events:none/);
    expect(face(container).querySelectorAll('mask')).toHaveLength(2);
    expect(block(container, 'dashy').className).toContain('db-bodyblock');
  });

  it('the block itself never moves: no transform on the block or on his face host, however long he lives', async () => {
    const { container } = render(<Dashboard {...base({ resolution: res('done'), music: { nowPlaying: track, status: 'connected' } })} />);
    await wait(300);
    for (const el of [block(container, 'dashy'), face(container)]) { expect(el.style.transform).toBe(''); expect(el.style.getPropertyValue('--dbx')).toBe(''); }
  });

  it('his face moves inside the block: the face group gets a transform that changes with his mood', async () => {
    const { container } = render(<Dashboard {...base({ resolution: res('done') })} />);
    await wait(60);
    const g = face(container).querySelector('g.face')!;
    const first = g.getAttribute('transform'); expect(first).toMatch(/^translate\(.+\) rotate\(.+\) scale\(.+\)$/);
    await wait(250); expect(g.getAttribute('transform')).not.toBe(first);
  });

  it('reduced motion: the face is placed once and does not move', async () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false, onchange: null }));
    const { container } = render(<Dashboard {...base({ resolution: res('done') })} />);
    const g = face(container).querySelector('g.face')!; const first = g.getAttribute('transform'); expect(first).not.toBeNull();
    await wait(250); expect(g.getAttribute('transform')).toBe(first);
    vi.unstubAllGlobals();
  });

  it('a tap on him startles him (four taps make him angry); a tap on a button does not', () => {
    const { container } = render(<Dashboard {...base()} />);
    const toggle = screen.getByRole('button', { name: 'Vergroot Dashy' });
    for (let i = 0; i < 6; i++) fireEvent.pointerDown(toggle);
    expect(dashyLabel(container)).toBe('Dashy wacht rustig');
    for (let i = 0; i < 4; i++) fireEvent.pointerDown(face(container));
    expect(dashyLabel(container)).toBe('Dashy is boos');
  });

  it('he is a block like the others: same grid area logic, grows when he needs attention, white with dark text', () => {
    const { container } = render(<Dashboard {...base({ resolution: res('deadlineNear') })} />);
    expect(block(container, 'dashy').dataset.focus).toBe('true');
    const css = container.querySelector('style')!.textContent!;
    expect(css).toMatch(/\.db-bodyblock[^{]*\{[^}]*background:#fff/);
    expect(css).not.toMatch(/\.db-bodycard|\.db-floor/);
  });

  it('unmounting gives the host back (no drawing left, no running loop)', () => {
    const { container, unmount } = render(<Dashboard {...base()} />);
    const f = face(container); unmount(); expect(f.querySelector('svg')).toBeNull();
  });
});

describe('a phone on the charger, and a real day', () => {
  it('keeps the screen awake while visible, asks again when it comes back, lets go on unmount, and copes without the API', async () => {
    const release = vi.fn(async () => {}), request = vi.fn(async () => ({ release }));
    vi.stubGlobal('navigator', { ...navigator, wakeLock: { request } });
    const { unmount } = render(<Dashboard {...base()} keepAwake />);
    await act(async () => { await Promise.resolve(); });
    expect(request).toHaveBeenCalledTimes(1); expect(request).toHaveBeenCalledWith('screen');
    Object.defineProperty(document, 'hidden', { value: true, configurable: true }); act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    Object.defineProperty(document, 'hidden', { value: false, configurable: true }); await act(async () => { document.dispatchEvent(new Event('visibilitychange')); await Promise.resolve(); });
    expect(request).toHaveBeenCalledTimes(2);
    unmount(); expect(release).toHaveBeenCalled();
    cleanup(); request.mockClear();
    render(<Dashboard {...base()} />); expect(request).not.toHaveBeenCalled(); // off by default
    cleanup(); vi.stubGlobal('navigator', { ...navigator, wakeLock: { request: async () => { throw new Error('low battery'); } } });
    expect(() => render(<Dashboard {...base()} keepAwake />)).not.toThrow();
    cleanup(); vi.stubGlobal('navigator', { ...navigator, wakeLock: undefined });
    expect(() => render(<Dashboard {...base()} keepAwake />)).not.toThrow();
    vi.unstubAllGlobals();
  });

  it('night: dark and dimmed', () => {
    const { container } = render(<Dashboard {...base()} night />);
    expect(root(container).dataset.night).toBe('true'); expect(root(container).dataset.theme).toBe('dark');
    expect(container.querySelector('style')!.textContent).toMatch(/\.db\[data-night="true"\]\{filter:brightness\(\.62\)\}/);
    cleanup(); const day = render(<Dashboard {...base()} />); expect(root(day.container).dataset.theme).toBeUndefined();
  });

  it('an empty planning says what the caller wants (so real mode never pretends)', () => {
    render(<Dashboard {...base({ items: [] })} emptyText="Taken verschijnen hier zodra ze gekoppeld zijn." />);
    expect(screen.getByText('Taken verschijnen hier zodra ze gekoppeld zijn.')).toBeTruthy();
  });

  it('Dashy talks about the task he is angry about, even when another one comes next', () => {
    const items2: PlanItem[] = [{ id: 'a', kind: 'task', title: 'Offerte sturen', at: T0 - 10 * MIN }, { id: 'b', kind: 'task', title: 'Rapport nakijken', at: T0 + 109 * MIN }];
    const { container } = render(<Dashboard {...base({ items: items2, resolution: res('deadlineNear') })} />);
    expect(container.querySelector('.db-line')!.textContent).toBe('Offerte sturen was voor 13:50. Eén klein stukje nu is genoeg.'.replace('13:50', new Intl.DateTimeFormat('nl-NL', { hour: '2-digit', minute: '2-digit', hour12: false }).format(T0 - 10 * MIN)));
    expect(container.querySelector('.db-now')!.textContent).toContain('Offerte sturen'); // Straks agrees
  });

  it('a task that stayed open long past its deadline is named neutrally, never in alarm colours', () => {
    const items2: PlanItem[] = [{ id: 'a', kind: 'task', title: 'Bellen', at: T0 - 3 * 60 * MIN }];
    const { container } = render(<Dashboard {...base({ items: items2, resolution: res('quiet') })} />);
    expect(container.querySelector('.db-item')!.getAttribute('data-urgency')).toBe('late');
    expect(container.querySelector('.db-time')!.textContent).toBe('nog open');
    expect(container.querySelector('.db-now')!.textContent).toContain('Nog open');
    expect(container.querySelector('.db-line')!.textContent).toBe('Bellen staat nog open. Zullen we een nieuw moment kiezen?');
  });

  it('...also when something else is coming up: the open task is not forgotten', () => {
    const items2: PlanItem[] = [{ id: 'a', kind: 'task', title: 'Bellen', at: T0 - 3 * 60 * MIN }, { id: 'b', kind: 'task', title: 'Rapport', at: T0 + 100 * MIN }];
    const { container } = render(<Dashboard {...base({ items: items2, resolution: res('quiet') })} />);
    expect(container.querySelector('.db-line')!.textContent).toBe('Bellen staat nog open. Zullen we een nieuw moment kiezen?');
    expect(container.querySelector('.db-now')!.textContent).toContain('Rapport'); // Straks still shows what comes next
  });

  it('"Nu" is one thing: the title, why, and a Klaar button that checks it off', () => {
    const onToggleDone = vi.fn();
    const items2: PlanItem[] = [{ id: 'a', kind: 'task', title: 'Offerte sturen', at: T0 + 30 * MIN }, { id: 'b', kind: 'event', title: 'Overleg', at: T0 + 90 * MIN, endsAt: T0 + 120 * MIN }];
    const { container } = render(<Dashboard {...base({ items: items2, onToggleDone })} />);
    const now = container.querySelector('.db-now') as HTMLElement;
    expect(now.querySelector('.db-what')!.textContent).toBe('Offerte sturen');
    expect(now.querySelector('.db-when')!.textContent).toMatch(/^Deadline om .* · over 30 min$/);
    expect(now.querySelector('.db-after')!.textContent).toMatch(/^Straks: .* · Overleg$/);
    fireEvent.click(within(now).getByRole('button', { name: 'Offerte sturen: markeer als klaar' }));
    expect(onToggleDone).toHaveBeenCalledWith('a', true);
  });

  it('"Nu" follows the chosen task (focusTaskId), without a Klaar button when nothing can be checked off', () => {
    const items2: PlanItem[] = [{ id: 'a', kind: 'task', title: 'Offerte sturen', at: T0 + 5 * 60 * MIN }, { id: 'b', kind: 'task', title: 'Opruimen', at: null }];
    const { container } = render(<Dashboard {...base({ items: items2, focusTaskId: 'b' })} />);
    expect(container.querySelector('.db-now .db-what')!.textContent).toBe('Opruimen');
    expect(container.querySelector('.db-now .db-done')).toBeNull();
    expect(container.querySelector('.db-line')!.textContent).toBe('Nu: Opruimen.');
  });

  it('"Nu" says honestly when there is nothing: nothing to do, or everything done', () => {
    const a = render(<Dashboard {...base({ items: [] })} />);
    expect(a.container.querySelector('.db-now')!.textContent).toContain('Niets te doen.'); cleanup();
    const b = render(<Dashboard {...base({ items: [{ id: 'a', kind: 'task', title: 'X', at: null, done: true }] })} />);
    expect(b.container.querySelector('.db-now')!.textContent).toContain('Alles gedaan.');
  });
});
