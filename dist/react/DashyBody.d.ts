import { type CSSProperties } from 'react';
import type { DashyState } from '../core';
export interface DashyBodyProps {
    state?: DashyState;
    /** Force reduced motion. Default: follow the system setting. */
    reducedMotion?: boolean;
    className?: string;
    /** The block fills its container by default; give it a size here or on the parent. */
    style?: CSSProperties;
}
/**
 * Dashy in his own block: the white block IS his body and it stands still, like any other block. All the life is in his face:
 * the eyes look around and blink and take his mood, and the face moves, tilts and squashes inside the block (never outside it).
 * A tap on the block startles him. Screen readers get his state as an image label.
 */
export declare function DashyBody({ state, reducedMotion, className, style }: DashyBodyProps): import("react").JSX.Element;
