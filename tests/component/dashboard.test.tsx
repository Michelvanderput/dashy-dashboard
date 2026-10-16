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
    for (const t of ['Dashy', 'Straks', 'Planning', 'Muziek', 'Vandaag']) expect(screen.getByRole('heading', { name: t })).toBeTruthy();
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

describe("Dashy's block is his body", () => {
  const card = (c: HTMLElement) => c.querySelector('.db-bodycard') as HTMLElement;
  const wait = (ms: number) => act(async () => { await new Promise(r => setTimeout(r, ms)); });

  it('the white card carries his eyes, and screen readers get his state as a label', () => {
    const { container } = render(<Dashboard {...base()} />);
    expect(card(container).querySelector('svg[role="img"] title')!.textContent).toBe('Dashy wacht rustig');
    expect(card(container).querySelector('svg')!.getAttribute('style')).toMatch(/pointer-events:none/); // taps reach the body, not the drawing
    expect(card(container).querySelectorAll('mask')).toHaveLength(2);
  });

  it('the card moves the way core.ts moves a body, and the text on it follows the shift', async () => {
    const { container } = render(<Dashboard {...base({ resolution: res('done') })} />);
    await wait(120);
    const c = card(container);
    expect(c.style.transform).toMatch(/translate\(.+px, .+px\) rotate\(.+deg\) scale\(.+, .+\)/);
    expect(c.style.transformOrigin).toBe('50% 100%');
    expect(c.style.borderRadius).toMatch(/px$/);
    const section = block(container, 'dashy');
    expect(section.style.getPropertyValue('--dbx')).toMatch(/px$/); expect(section.style.getPropertyValue('--dby')).toMatch(/px$/);
  });

  it('reduced motion: the card is placed once and does not move', async () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false, onchange: null }));
    const { container } = render(<Dashboard {...base({ resolution: res('done') })} />);
    const first = card(container).style.transform; expect(first).not.toBe('');
    await wait(200); expect(card(container).style.transform).toBe(first);
    vi.unstubAllGlobals();
  });

  it('a tap on his body startles him (four taps make him angry); a tap on a button or beside him does not', () => {
    const { container } = render(<Dashboard {...base()} />);
    const toggle = screen.getByRole('button', { name: 'Vergroot Dashy' });
    for (let i = 0; i < 6; i++) fireEvent.pointerDown(toggle);
    for (let i = 0; i < 6; i++) fireEvent.pointerDown(block(container, 'dashy')); // beside the body, on his open space
    expect(dashyLabel(container)).toBe('Dashy wacht rustig');
    for (let i = 0; i < 4; i++) fireEvent.pointerDown(card(container));
    expect(dashyLabel(container)).toBe('Dashy is boos');
  });

  it('a tap beside him makes his block grow (a tap on his body does not)', () => {
    const { container } = render(<Dashboard {...base()} />);
    fireEvent.click(card(container)); expect(root(container).dataset.focus).toBe('none');
    fireEvent.click(block(container, 'dashy')); expect(root(container).dataset.focus).toBe('dashy');
  });

  it('he has no card behind him: the block is open space with a floor, and his body is a square with air around it', () => {
    const { container } = render(<Dashboard {...base()} />);
    const css = container.querySelector('style')!.textContent!;
    expect(css).toMatch(/\.db-bodyblock[^{]*\{[^}]*background:none/);
    expect(css).toMatch(/\.db-bodycard\{[^}]*width:var\(--body\);height:var\(--body\)/); // a square, not a slab
    expect(block(container, 'dashy').querySelector('.db-floor')).not.toBeNull();
  });

  it('unmounting gives the card back (no leftover transform, no running loop)', () => {
    const { container, unmount } = render(<Dashboard {...base()} />);
    const c = card(container); unmount();
    expect(c.style.transform).toBe(''); expect(c.querySelector('svg')).toBeNull();
  });
});
