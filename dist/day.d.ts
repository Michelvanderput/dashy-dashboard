/**
 * The day on the screen: how far through the working day you are, and how long until the next appointment.
 * Pure: pass the time in. Times are Dutch wall-clock (see server/time.ts).
 */
import type { Appointment } from './server/plan';
export { DEFAULT_WORKDAY, dayProgress, positionOnDay, type DayPhase, type DayProgress, type Workday } from './server/workday';
/** "minder dan 1 min", "25 min", "1 u", "3 u 20 min". Rounded up to the minute, so it never says 0 while there is still time. */
export declare function duration(ms: number): string;
/** An appointment within this long counts as "soon" (the countdown turns orange). */
export declare const SOON_MS: number;
export interface AppointmentView {
    phase: 'upcoming' | 'now';
    leftMs: number;
    soon: boolean;
    /** "over 25 min", "nog 40 min", "morgen 09:00" */
    text: string;
}
/** How to show an appointment right now. Null once it is over. */
export declare function appointmentView(a: Appointment, now: number, tz?: string): AppointmentView | null;
/** The reminder to book hours shows from 15 minutes before the end of the working day, and stays until midnight (never on a day off). */
export declare const BOOKING_LEAD_MS: number;
export declare function isBookingTime(now: number, w?: import('./server/workday').Workday, tz?: string): boolean;
