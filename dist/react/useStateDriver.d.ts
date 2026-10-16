import { type DriverConfig, type DriverEvent, type Resolution } from '../driver';
/**
 * Connects the pure driver to React: keeps the driver state, and sets exactly one timeout for the next
 * moment the answer can change by itself (deadline thresholds, done/received windows, one quiet hour).
 */
export declare function useStateDriver(config?: Partial<DriverConfig>, clock?: () => number): Resolution & {
    dispatch: (e: DriverEvent) => void;
};
