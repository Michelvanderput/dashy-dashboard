/** Kiosk mode (a phone or tablet on the charger, just to look at): helpers. Pure. */
/** `?kiosk=1` (or `?kiosk`) turns it on. */
export declare function isKiosk(search: string): boolean;
/**
 * A small shift of the whole screen, different every few minutes, so a static picture does not burn into an OLED screen over weeks.
 * Deterministic in the time (no randomness), at most `max` px in each direction, and the same for everyone within the same period.
 */
export declare function burnInOffset(now: number, max?: number, periodMs?: number): {
    x: number;
    y: number;
};
