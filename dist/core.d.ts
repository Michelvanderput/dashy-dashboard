/**
 * Dashy core: pure simulation, no DOM, no timers.
 * Feed it time (ms) via step(now) and get back geometry to draw.
 * Coordinate system: 300 x 300 viewBox, body 220 x 220 (40..260), pivot at bottom centre (150, 260).
 */
export type Status = 'idle' | 'received' | 'working' | 'thinking' | 'waiting' | 'blocked' | 'done';
export type Mood = 'happy' | 'sad' | 'angry' | 'strict' | 'dancing' | 'sleepy';
export type DashyState = Status | Mood;
export type Shape = 'square' | 'circle';
export interface DashyOptions {
    /** Seed for the (deterministic) randomness: blink timing, glances. */
    seed?: number;
    /** Eye height multiplier. Default 55/66 = golden ratio with 34 wide eyes (34 x 55). Use 1 for 34 x 66. */
    eyeScale?: number;
}
export interface EyeGeometry {
    x: number;
    y: number;
    tilt: number;
    ew: number;
    eh: number;
    /** fraction covered from the top by the upper lid (0..1) */
    cov: number;
    /** upper lid rotation in degrees (positive on the left eye = angry slant) */
    lidA: number;
    /** fraction covered from the bottom by the curved lower lid (happy arcs) */
    low: number;
    /** current blink amount 0..1 */
    blink: number;
}
export interface Geometry {
    cur: DashyState;
    /** corner radius of the body: 22 = rounded square, 110 = circle */
    rx: number;
    body: {
        tx: number;
        ty: number;
        rot: number;
        sx: number;
        sy: number;
    };
    face: {
        tx: number;
        ty: number;
        rot: number;
        sx: number;
        sy: number;
    };
    eyes: EyeGeometry[];
}
export interface Dashy {
    states: Record<string, {
        n: string;
    }>;
    getState(): DashyState;
    setState(k: DashyState, now: number): void;
    setShape(s: Shape): void;
    setEyeScale(k: number): void;
    poke(now: number): void;
    /** nx, ny in -1..1 relative to the centre of the avatar */
    pointer(nx: number, ny: number, now: number): void;
    step(now: number): Geometry;
}
export declare function createDashy(options?: DashyOptions): Dashy;
