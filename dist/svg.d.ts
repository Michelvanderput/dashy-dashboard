import { type Variant } from './small';
import { type Dashy, type DashyOptions, type DashyState, type Shape } from './core';
export interface MountOptions extends DashyOptions {
    shape?: Shape;
    initialState?: DashyState;
    /** Dutch/English labels for screen readers. Default: Dutch. */
    labels?: Partial<Record<DashyState, string>>;
    /** Force reduced motion. Default: follow the system setting. */
    reducedMotion?: boolean;
    /** 'small' = simpler drawing for 24 to 32 px. 'auto' (default) picks it from the rendered size. */
    variant?: Variant;
    /**
     * Body mode: `container` itself is Dashy's body (a card). Only the eyes are drawn (an overlay filling the card); the body
     * movement from core.ts (hop, squash, tilt, shake) is applied to the card's transform, and its corner radius follows the body.
     * `vars` receives --dbx and --dby (px): how far the body moved, so text on it can ride along.
     */
    body?: {
        vars?: HTMLElement; /** px, or a function that is read whenever the size changes */
        room?: number | (() => number);
        gain?: number;
        squashGain?: number;
    };
}
export interface DashyHandle {
    dashy: Dashy;
    setState(s: DashyState): void;
    getState(): DashyState;
    setShape(s: Shape): void;
    poke(): void;
    /** Look towards (nx, ny) in -1..1 relative to the centre, like a pointer would. */
    look(nx: number, ny: number): void;
    destroy(): void;
}
export declare const DEFAULT_LABELS: Record<DashyState, string>;
export declare function mountDashy(container: HTMLElement, opts?: MountOptions): DashyHandle;
