import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BasicsCheck, CalmPanel, TaskBoard } from '../../src/react';
import { startFocus, focusView } from '../../src/focus';
import type { DashTask } from '../../src/tasks';

afterEach(cleanup);
const NOW = 1_800_000_000_000, MIN = 60_000;
const task = (o: Partial<DashTask> = {}): DashTask => ({ id: 'a1', title: 'Bel de bank', category: 'thuis', due: null, when: '', note: 'Over de lening', step: 'Zoek het nummer op', state: 'now', ...o });

describe('<TaskBoard /> first step and working session', () => {
  it('shows the first step as its own line, above the note', () => {
    render(<TaskBoard now={NOW} tasks={[task()]} />);
    expect(screen.getByText('Eerste stap')).toBeTruthy(); expect(screen.getByText('Zoek het nummer op')).toBeTruthy(); expect(screen.getByText('Over de lening')).toBeTruthy();
  });
  it('offers "Doe 10 min" next to Klaar, and starts a session', () => {
    const start = vi.fn();
    render(<TaskBoard now={NOW} tasks={[task()]} onComplete={() => {}} onFocusStart={start} />);
    expect(screen.getByRole('button', { name: /Klaar/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Doe 10 min' })); expect(start).toHaveBeenCalledWith(10);
  });
  it('a running session shows the time and a calm promise, and stop and extend work when it is over', () => {
    const stop = vi.fn(), extend = vi.fn(), done = vi.fn();
    const f = startFocus(NOW, 10, 'a1');
    const { rerender } = render(<TaskBoard now={NOW} tasks={[task()]} focus={focusView(f, NOW + 4 * MIN)} onFocusStop={stop} onFocusExtend={extend} onComplete={done} />);
    expect(screen.getByRole('img', { name: '6:00' })).toBeTruthy(); expect(screen.getByText(/Alleen dit stukje/)).toBeTruthy(); expect(screen.queryByRole('button', { name: 'Nog 10 min' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Stop' })); expect(stop).toHaveBeenCalled();
    rerender(<TaskBoard now={NOW} tasks={[task()]} focus={focusView(f, NOW + 10 * MIN)} onFocusStop={stop} onFocusExtend={extend} onComplete={done} />);
    expect(screen.getByText(/De tijd is om/)).toBeTruthy(); expect(screen.queryByText(/te laat/i)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Nog 10 min' })); expect(extend).toHaveBeenCalledWith(10);
  });
  it('after 90 minutes it suggests a drink or a bite, in words', () => {
    render(<TaskBoard now={NOW} tasks={[task()]} focus={focusView(startFocus(NOW, 120), NOW + 95 * MIN)} />);
    expect(screen.getByText(/Je zit al 95 min door. Even drinken of eten\?/)).toBeTruthy();
  });
  it('on a look-only screen the session is shown but has no buttons', () => {
    render(<TaskBoard now={NOW} tasks={[task()]} focus={focusView(startFocus(NOW, 10), NOW)} />);
    expect(screen.getByRole('img', { name: '10:00' })).toBeTruthy(); expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('<BasicsCheck />', () => {
  it('ticks and unticks with words, and is only shown on a look-only screen', () => {
    const toggle = vi.fn();
    const { rerender } = render(<BasicsCheck items={['eten', 'drinken']} done={['eten']} onToggle={toggle} />);
    expect(screen.getByRole('button', { name: 'eten' }).getAttribute('aria-pressed')).toBe('true'); expect(screen.getByRole('button', { name: 'drinken' }).getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(screen.getByRole('button', { name: 'drinken' })); expect(toggle).toHaveBeenCalledWith('drinken');
    rerender(<BasicsCheck items={['eten']} done={[]} />);
    expect((screen.getByRole('button', { name: 'eten' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('<CalmPanel />', () => {
  const plan = { lines: ['Een kwartier lopen', 'Een glas water'], evening: 'gitaar spelen' };
  it('shows the quiet quarter of an hour, your own plan, and closes with "Ik ben er doorheen"', () => {
    const close = vi.fn(), restart = vi.fn();
    render(<CalmPanel plan={plan} onSavePlan={() => {}} waveStart={NOW} onRestartWave={restart} onClose={close} now={NOW + 2 * MIN} />);
    expect(screen.getByRole('dialog', { name: 'Even lastig' })).toBeTruthy(); expect(screen.getByText('13:00')).toBeTruthy();
    expect(screen.getAllByRole('listitem').map(l => l.textContent)).toEqual(plan.lines); expect(screen.getByText(/Een golf komt op en zakt weer/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Nog een kwartier' })); expect(restart).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Ik ben er doorheen' })); expect(close).toHaveBeenCalled();
  });
  it('Escape closes it, and it stays inside a dialog that is announced', () => {
    const close = vi.fn();
    render(<CalmPanel plan={plan} onSavePlan={() => {}} waveStart={NOW} onRestartWave={() => {}} onClose={close} now={NOW} />);
    fireEvent.keyDown(window, { key: 'Escape' }); expect(close).toHaveBeenCalled(); expect(screen.getByRole('dialog').getAttribute('aria-modal')).toBe('true');
  });
  it('with no plan yet it asks you to write one first, and saves it (staying on this device)', () => {
    const save = vi.fn();
    render(<CalmPanel plan={{ lines: [], evening: '' }} onSavePlan={save} waveStart={NOW} onRestartWave={() => {}} onClose={() => {}} now={NOW} />);
    expect(screen.getByText(/Dit blijft op dit apparaat/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/Als het lastig wordt/), { target: { value: 'Buiten lopen\n\nWater drinken' } });
    fireEvent.change(screen.getByLabelText(/Mijn ene ding voor vanavond/), { target: { value: 'Gitaar spelen' } });
    fireEvent.click(screen.getByRole('button', { name: 'Opslaan' }));
    expect(save).toHaveBeenCalledWith({ lines: ['Buiten lopen', 'Water drinken'], evening: 'Gitaar spelen' });
    expect(screen.getByRole('heading', { name: 'Even lastig' })).toBeTruthy();
  });
  it('when the quarter is over it says so kindly and offers another one', () => {
    render(<CalmPanel plan={plan} onSavePlan={() => {}} waveStart={NOW} onRestartWave={() => {}} onClose={() => {}} now={NOW + 16 * MIN} />);
    expect(screen.getByText(/Nog een kwartier mag altijd/)).toBeTruthy();
  });
});
