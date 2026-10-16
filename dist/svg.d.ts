import { type FaceMotionOptions } from './render';
import { type Variant } from './small';
import { type Colors } from './definition';
import { type StaticOptions } from './static';
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
    /** Body, eye and outline colours. Default: white body, near-black eyes. */
    colors?: Partial<Colors>;
    /** A Dashy definition (look, custom expressions, sequences). Validated on mount; an invalid one throws with the first problem. */
    definition?: unknown;
    /** Ambient life: micro-saccades and slow drift. Default true. Not shown with reduced motion. */
    ambient?: boolean | number;
    /** Head turn: a little 3D when he looks sideways. Default true. */
    perspective?: boolean | number;
    /** Called when a `once` sequence has played its last step (he then holds that expression until `stop()`). */
    onSequenceEnd?: (key: string) => void;
}
export interface SnapshotOptions extends Omit<StaticOptions, 'variant'> {
    format?: 'svg' | 'png';
    /** PNG size in px. Default 512. */
    size?: number;
    /** Hold the body still and keep the expression (what app icons need). Default false: the exact frame on screen. */
    still?: boolean;
}
export interface DashyHandle {
    dashy: Dashy;
    setState(s: DashyState): void;
    getState(): DashyState;
    setShape(s: Shape): void;
    poke(): void;
    /** Look towards (nx, ny) in -1..1 relative to the centre, like a pointer would. */
    look(nx: number, ny: number): void;
    /** Play a named sequence from the definition. Returns false when there is no such sequence. */
    play(key: string): boolean;
    /** Stop a running sequence and go back to the state that was set. */
    stop(): void;
    /** Show one named expression (custom, from the definition) or built-in state, and keep it. Returns false when unknown. */
    express(key: string): boolean;
    setColors(c: Partial<Colors>): void;
    /** A still of what is on screen right now. SVG as text, PNG as a Blob. */
    snapshot(o?: SnapshotOptions): Promise<string | Blob>;
    destroy(): void;
}
export declare const DEFAULT_LABELS: Record<DashyState, string>;
export declare function mountDashy(container: HTMLElement, opts?: MountOptions): DashyHandle;
