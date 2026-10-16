import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { HoursPanel } from '../../src/react';
import { zonedToEpoch } from '../../src/server/time';

afterEach(cleanup);
const at = (d: string, t: string) => { const [y, m, da] = d.split('-').map(Number), [h, mi] = t.split(':').map(Number); return zonedToEpoch(y, m, da, h, mi)!; };
const FRI = '2026-10-16';
const hours = { day: FRI, totalMin: 390, unbookedMin: 390, perProject: [{ project: 'Klant A', minutes: 240, unbookedMin: 240 }, { project: 'Klant B', minutes: 120, unbookedMin: 120 }, { project: null, minutes: 30, unbookedMin: 30 }], olderUnbookedMin: 0 };

describe('<HoursPanel />', () => {
  it('during the day it only says how much you logged, quietly', () => {
    render(<HoursPanel hours={hours} now={at(FRI, '11:00')} />);
    expect(screen.getByText('6 u 30 min')).toBeTruthy(); expect(screen.queryByText('Tijd om je uren te boeken')).toBeNull();
  });
  it('from 16:45 it lists what to book per project, and the total', () => {
    render(<HoursPanel hours={hours} now={at(FRI, '16:50')} />);
    expect(screen.getByRole('status').textContent).toContain('Tijd om je uren te boeken');
    expect(screen.getByText('Klant A')).toBeTruthy(); expect(screen.getByText('4 u')).toBeTruthy(); expect(screen.getByText('Klant B')).toBeTruthy(); expect(screen.getByText('2 u')).toBeTruthy(); expect(screen.getByText('Zonder project')).toBeTruthy(); expect(screen.getByText('30 min')).toBeTruthy();
    expect(screen.getByText('Samen 6 u 30 min')).toBeTruthy();
  });
  it('only what is not booked yet is listed; once everything is booked the reminder goes away', () => {
    const partly = { ...hours, unbookedMin: 120, perProject: [{ project: 'Klant A', minutes: 240, unbookedMin: 0 }, { project: 'Klant B', minutes: 120, unbookedMin: 120 }] };
    const { rerender } = render(<HoursPanel hours={partly} now={at(FRI, '17:10')} />);
    expect(screen.queryByText('Klant A')).toBeNull(); expect(screen.getByText('Klant B')).toBeTruthy(); expect(screen.queryByText(/^Samen/)).toBeNull();
    rerender(<HoursPanel hours={{ ...partly, unbookedMin: 0, perProject: partly.perProject.map(p => ({ ...p, unbookedMin: 0 })) }} now={at(FRI, '17:10')} />);
    expect(screen.queryByText('Tijd om je uren te boeken')).toBeNull(); expect(screen.getByText('Uren vandaag:')).toBeTruthy();
  });
  it('earlier unbooked hours get one calm line, nothing at all when there are no hours', () => {
    const { container, rerender } = render(<HoursPanel hours={{ ...hours, totalMin: 0, unbookedMin: 0, perProject: [], olderUnbookedMin: 195 }} now={at(FRI, '11:00')} />);
    expect(screen.getByText('Nog te boeken van eerder: 3 u 15 min')).toBeTruthy();
    rerender(<HoursPanel hours={{ ...hours, totalMin: 0, unbookedMin: 0, perProject: [], olderUnbookedMin: 0 }} now={at(FRI, '11:00')} />);
    expect(container.innerHTML).toBe('');
  });
  it('compact: the projects on one line, for a phone on its side', () => {
    render(<HoursPanel hours={hours} now={at(FRI, '16:50')} compact />);
    expect(screen.getByText('Tijd om te boeken: 6 u 30 min')).toBeTruthy(); expect(screen.getByText('Klant A 4 u · Klant B 2 u · Zonder project 30 min')).toBeTruthy(); expect(screen.queryByText('Samen 6 u 30 min')).toBeNull();
  });
  it('no booking reminder on a day off', () => {
    render(<HoursPanel hours={hours} now={at('2026-10-17', '16:50')} />);
    expect(screen.queryByText('Tijd om je uren te boeken')).toBeNull();
  });
});
