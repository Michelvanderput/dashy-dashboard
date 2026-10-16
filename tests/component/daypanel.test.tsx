import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { DayPanel } from '../../src/react';
import { zonedToEpoch } from '../../src/server/time';

afterEach(cleanup);
const at = (d: string, t: string) => { const [y, m, da] = d.split('-').map(Number), [h, mi] = t.split(':').map(Number); return zonedToEpoch(y, m, da, h, mi)!; };
const FRI = '2026-10-16', SAT = '2026-10-17';

describe('<DayPanel />', () => {
  it('shows the next appointment with its countdown and the day bar with what is left', () => {
    render(<DayPanel now={at(FRI, '10:00')} appointment={{ title: 'Standup', at: at(FRI, '10:25'), endsAt: at(FRI, '10:55') }} />);
    expect(screen.getByText('Volgende afspraak')).toBeTruthy(); expect(screen.getByText('Standup')).toBeTruthy();
    expect(screen.getByText('over 25 min · 10:25')).toBeTruthy();
    const bar = screen.getByRole('progressbar', { name: 'Werkdag' });
    expect(bar.getAttribute('aria-valuenow')).toBe('18'); // 1.5 of 8.5 hours
    expect(bar.getAttribute('aria-valuetext')).toBe('Nog 7 u tot 17:00'); expect(screen.getByText('Nog 7 u tot 17:00')).toBeTruthy();
  });
  it('under ten minutes it says so in words too, not only with a colour', () => {
    render(<DayPanel now={at(FRI, '10:00')} appointment={{ title: 'Standup', at: at(FRI, '10:05') }} />);
    expect(screen.getByText(/over 5 min · 10:05 \(bijna\)/)).toBeTruthy();
  });
  it('during an appointment it says "Nu" and how long it lasts', () => {
    render(<DayPanel now={at(FRI, '10:30')} appointment={{ title: 'Standup', at: at(FRI, '10:25'), endsAt: at(FRI, '10:55') }} />);
    expect(screen.getByText('Nu')).toBeTruthy(); expect(screen.getByText('nog 25 min')).toBeTruthy(); expect(screen.queryByText('Volgende afspraak')).toBeNull();
  });
  it('before and after the working day it says so calmly', () => {
    const { rerender } = render(<DayPanel now={at(FRI, '07:30')} appointment={null} />);
    expect(screen.getByText('Werkdag begint om 08:30')).toBeTruthy();
    rerender(<DayPanel now={at(FRI, '18:00')} appointment={null} />);
    expect(screen.getByText('Werkdag voorbij')).toBeTruthy(); expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('100');
  });
  it('uses the configured working day', () => {
    render(<DayPanel now={at(FRI, '12:00')} workday={{ start: '09:00', end: '13:00', days: [1, 2, 3, 4, 5] }} appointment={null} />);
    expect(screen.getByText('Nog 1 u tot 13:00')).toBeTruthy(); expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('75');
  });
  it('a day off shows nothing at all, or only an appointment without a bar', () => {
    const { container, rerender } = render(<DayPanel now={at(SAT, '10:00')} appointment={null} />);
    expect(container.innerHTML).toBe('');
    rerender(<DayPanel now={at(SAT, '10:00')} appointment={{ title: 'Pokémonbeurs', at: at(SAT, '12:00') }} />);
    expect(screen.getByText('Pokémonbeurs')).toBeTruthy(); expect(screen.queryByRole('progressbar')).toBeNull();
  });
  it('an appointment on another day is named by day, and a finished one is gone', () => {
    const { rerender } = render(<DayPanel now={at(FRI, '10:00')} appointment={{ title: 'Oma', at: at(SAT, '09:00') }} />);
    expect(screen.getByText('morgen 09:00')).toBeTruthy();
    rerender(<DayPanel now={at(FRI, '12:00')} appointment={{ title: 'Oud', at: at(FRI, '10:25'), endsAt: at(FRI, '10:55') }} />);
    expect(screen.queryByText('Oud')).toBeNull();
  });
});
