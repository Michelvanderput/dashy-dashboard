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
    /** 'auto' (default) uses the small drawing at 32 px and below. */
    variant?: 'full' | 'small' | 'auto';
    /** Force reduced motion. Default: follow the system setting. */
    reducedMotion?: boolean;
    /** Look, custom expressions and sequences (see definition.ts). Read when Dashy mounts. */
    definition?: unknown;
    /** Name of a sequence from the definition to play; changing it plays the new one, undefined stops. */
    sequence?: string;
    /** Body, eye and outline colours. */
    colors?: MountOptions['colors'];
    /** Ambient life and head turn, both default on. */
    ambient?: boolean | number;
    perspective?: boolean | number;
    /** Seed for blink timing and glances. Read when Dashy mounts. */
    seed?: number;
    className?: string;
    style?: CSSProperties;
}
/** Dashy as a React component. All motion comes from core.ts; this only mounts it and passes props through. */
export declare function Dashy({ state, shape, size, labels, announce, variant, reducedMotion, seed, definition, sequence, colors, ambient, perspective, className, style }: DashyProps): import("react").JSX.Element;
