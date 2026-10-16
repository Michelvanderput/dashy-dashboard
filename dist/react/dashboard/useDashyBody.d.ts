import { type RefObject } from 'react';
import type { DashyState } from '../../core';
/**
 * Makes the `card` element Dashy's body. His eyes are drawn on it, and the movement from core.ts (hop, squash, tilt, shake)
 * is applied to the card. `vars` gets --dbx/--dby so content on top can ride along with the body.
 */
export declare function useDashyBody(card: RefObject<HTMLElement | null>, vars: RefObject<HTMLElement | null>, state: DashyState, opts?: {
    room?: () => number;
    reducedMotion?: boolean;
}): {
    look: (nx: number, ny: number) => void | undefined;
    getState: () => DashyState | undefined;
};
