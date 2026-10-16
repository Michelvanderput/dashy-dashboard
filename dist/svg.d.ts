import { type Dashy, type DashyOptions, type DashyState, type Shape } from './core';
export interface MountOptions extends DashyOptions {
    shape?: Shape;
    initialState?: DashyState;
    /** Dutch/English labels for screen readers. Default: Dutch. */
    labels?: Partial<Record<DashyState, string>>;
    /** Force reduced motion. Default: follow the system setting. */
    reducedMotion?: boolean;
}
export interface DashyHandle {
    dashy: Dashy;
    setState(s: DashyState): void;
    getState(): DashyState;
    setShape(s: Shape): void;
    poke(): void;
    destroy(): void;
}
export declare const DEFAULT_LABELS: Record<DashyState, string>;
export declare function mountDashy(container: HTMLElement, opts?: MountOptions): DashyHandle;
