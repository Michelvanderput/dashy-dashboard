import { type RefObject } from 'react';
import type { DashyState } from '../../core';
/**
 * Makes the `host` element Dashy's body: it stays still, his eyes are drawn on it and all the life is in his face (core.ts).
 * Returns `look` to make him glance towards something.
 */
export declare function useDashyBody(host: RefObject<HTMLElement | null>, state: DashyState, reducedMotion?: boolean): {
    look: (nx: number, ny: number) => void | undefined;
};
