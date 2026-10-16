import { type RefObject } from 'react';
import { type Candidate, type FocusState } from '../../dashboard/attention';
import { type BlockId, type Orientation } from '../../dashboard/layout';
/** A clock that ticks (default every second) and stops while the window is hidden. */
export declare function useNow(ms?: number, clock?: () => number): number;
/** Portrait or landscape, from the size of the element itself. */
export declare function useOrientation(ref: RefObject<HTMLElement | null>): Orientation;
/** The block in focus: what needs attention, unless the person chose one. Re-evaluated every tick. */
export declare function useFocus(candidate: Candidate | null, now: number): {
    focus: FocusState;
    pinned: "clock" | "dashy" | "music" | "now" | "plan" | null;
    /** Tap on a block: grow it for 10 minutes; tap again to let go. */
    toggle: (b: BlockId) => void;
    release: () => void;
};
/**
 * Keeps the screen awake while the page is visible (a phone on the charger should not go dark). Does nothing where the
 * Screen Wake Lock API does not exist, and never throws: the browser may refuse (low battery, power saver).
 */
export declare function useWakeLock(enabled: boolean): void;
