import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Clock, TaskBoard, WeatherView } from '../../src/react';
import { zonedToEpoch } from '../../src/server/time';
import type { DashTask } from '../../src/tasks';

afterEach(() => { cleanup(); localStorage.clear(); });
const at = (h: number, m: number) => zonedToEpoch(2026, 10, 16, h, m)!;
const task = (o: Partial<DashTask>): DashTask => ({ id: 'a1', title: 'Bel de bank', category: 'thuis', due: null, when: '', note: '', state: 'now', ...o });

describe('<TaskBoard />', () => {
  it('shows the task for now big, with its note, and the next ones under "Daarna"', () => {
    render(<TaskBoard now={at(10, 0)} tasks={[task({ note: 'Vraag naar de sleutel' }), task({ id: 'b2', title: 'Pak dozen in', state: 'later', due: at(15, 0), when: 'vandaag 15:00' })]} />);
    expect(screen.getByRole('heading', { name: 'Bel de bank' })).toBeTruthy();
    expect(screen.getByText('Vraag naar de sleutel')).toBeTruthy();
    expect(screen.getByText('Daarna')).toBeTruthy(); expect(screen.getByText('Pak dozen in')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Klaar/ })).toBeNull(); // a look-only screen has no button
  });
  it('says "(bijna)" in words when the time is near, and "nog open" (not late) when it has passed', () => {
    const { rerender } = render(<TaskBoard now={at(10, 0)} tasks={[task({ due: at(10, 20), when: 'vandaag 10:20' })]} />);
    expect(screen.getByText(/over 20 min \(bijna\)/)).toBeTruthy();
    rerender(<TaskBoard now={at(11, 0)} tasks={[task({ due: at(10, 20), when: 'vandaag 10:20' })]} />);
    expect(screen.getByText('nog open')).toBeTruthy(); expect(screen.queryByText(/te laat|achter/i)).toBeNull();
  });
  it('Klaar checks the task off; undo is offered after', () => {
    const onComplete = vi.fn(), onUndo = vi.fn();
    render(<TaskBoard now={at(10, 0)} tasks={[task({})]} onComplete={onComplete} onUndo={onUndo} justDone={{ id: 'z', title: 'Iets' }} />);
    fireEvent.click(screen.getByRole('button', { name: /Klaar/ })); expect(onComplete).toHaveBeenCalledWith('a1');
    fireEvent.click(screen.getByRole('button', { name: 'Ongedaan maken' })); expect(onUndo).toHaveBeenCalled();
  });
  it('with nothing to do now it rests, and in free time says work tasks wait', () => {
    render(<TaskBoard now={at(20, 0)} mode="free" waiting={2} doneToday={3} tasks={[task({ state: 'later', due: at(21, 0), when: 'vandaag 21:00' })]} />);
    expect(screen.getByText('Niets nu. Rust maar.')).toBeTruthy(); expect(screen.getByText('Straks')).toBeTruthy();
    expect(screen.getByText(/2 werktaken wachten/)).toBeTruthy(); expect(screen.getByText(/3 vandaag klaar/)).toBeTruthy();
  });
  it('shows at most three after the first and says how many more', () => {
    const many = [task({}), ...[1, 2, 3, 4, 5].map(i => task({ id: `x${i}`, title: `Taak ${i}`, state: 'later' }))];
    render(<TaskBoard now={at(10, 0)} tasks={many} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(3); expect(screen.getByText('en nog 2')).toBeTruthy();
  });
});

describe('<Clock />', () => {
  it('shows the Dutch time, the date with a capital and the week', () => {
    render(<Clock now={at(9, 5)} />);
    expect(screen.getByText('09:05')).toBeTruthy(); expect(screen.getByText(/Vrijdag 16 oktober/)).toBeTruthy(); expect(screen.getByText(/week 42/)).toBeTruthy();
  });
});

describe('<WeatherView />', () => {
  const body = { current: { temperature_2m: 12.4, weather_code: 61, is_day: 1 }, daily: { temperature_2m_max: [14], temperature_2m_min: [8], precipitation_probability_max: [70] } };
  beforeEach(() => { vi.useRealTimers(); });
  it('fetches, shows it and keeps it for the next visit', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify(body)));
    render(<WeatherView fetch={f as unknown as typeof fetch} />);
    await waitFor(() => expect(screen.getByText(/12°/)).toBeTruthy());
    expect(localStorage.getItem('dashy.weather')).toContain('Maastricht');
  });
  it('a failing request shows nothing and does not throw', async () => {
    const f = vi.fn(async () => { throw new Error('offline'); });
    const { container } = render(<WeatherView fetch={f as unknown as typeof fetch} />);
    await waitFor(() => expect(f).toHaveBeenCalled());
    expect(container.textContent).toBe('');
  });
  it('an answer older than six hours is hidden rather than shown wrong', () => {
    localStorage.setItem('dashy.weather', JSON.stringify({ place: 'Maastricht', weather: { tempC: 20, code: 0, isDay: true, highC: 21, lowC: 10, rainChance: 0, label: 'Zonnig', icon: 'sun', fetchedAt: Date.now() - 7 * 3600_000 } }));
    const f = vi.fn(async () => new Response('{}', { status: 500 }));
    const { container } = render(<WeatherView fetch={f as unknown as typeof fetch} />);
    expect(container.textContent).toBe('');
  });
});
