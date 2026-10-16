import { type CSSProperties } from 'react';
import type { DashyState, Shape } from '../core';
import { type MountOptions } from '../svg';
export interface DashyProps {
    state?: DashyState;
    shape?: Shape;
    /** Pixels (number) or any CSS length. The avatar is square. Default 96. */
    size?: number | string;
    /** Screen reader texts per state. Read when Dashy mounts. Default: Dutch. */
    labels?: MountOptions['labels'];
    /** Also announce state changes to screen readers (polite). Default false: the label is on the image itself. */
    announce?: boolean;
    /** Force reduced motion. Default: follow the system setting. */
    reducedMotion?: boolean;
    /** Seed for blink timing and glances. Read when Dashy mounts. */
    seed?: number;
    className?: string;
    style?: CSSProperties;
}
/** Dashy as a React component. All motion comes from core.ts; this only mounts it and passes props through. */
export declare function Dashy({ state, shape, size, labels, announce, reducedMotion, seed, className, style }: DashyProps): import("react").JSX.Element;
