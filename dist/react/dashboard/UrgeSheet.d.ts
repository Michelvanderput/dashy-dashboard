import { type UrgeOutcome } from '../../dashboard/urge';
/**
 * "Even stoppen": full-screen calm sheet. A ten-minute pause, slow breathing and something else to do. It never asks what the
 * urge is about, never counts, never judges. Esc or "Sluiten" leaves at any time.
 */
export declare function UrgeSheet({ onClose }: {
    onClose: (outcome: UrgeOutcome) => void;
}): import("react").JSX.Element;
