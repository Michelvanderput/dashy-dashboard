import { type FaceMotionOptions } from './render';
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
     * Body mode: `container` itself is Dashy's body (a block of any shape). It stays exactly where it is: only the eyes are drawn,
     * as an overlay filling the block, and all the life is in the face (it moves, tilts and squashes inside the block, the eyes look
     * around and blink). The eyes are guaranteed to stay inside the block.
     */
    body?: FaceMotionOptions;
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
