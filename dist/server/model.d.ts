export declare const CATEGORIES: readonly ['werk', 'sport', 'thuis', 'prive'];
export type Category = (typeof CATEGORIES)[number];
export declare const TITLE_MAX = 60, NOTE_MAX = 100, BATCH_MAX = 50;
export interface Task {
    id: string;
    title: string;
    category: Category;
    /** Epoch ms. With hasTime false it is local midnight of that day. */
    dueAt: number | null;
    hasTime: boolean;
    note: string | null;
    done: boolean;
    doneAt: number | null;
    /** Lower = earlier. Fractions and negatives are fine. */
    position: number;
    createdAt: number;
}
export declare class InputError extends Error {
}
export declare function checkTitle(v: unknown): string;
export declare function checkNote(v: unknown): string;
export declare function checkCategory(v: unknown): Category;
/**
 * due: 'YYYY-MM-DD HH:mm' (a T instead of the space is fine), 'YYYY-MM-DD' (only the day is known) or 'HH:mm' (today).
 * Dutch time. A time that does not exist (the hour skipped when the clocks go forward, 30 February) is refused with a clear message.
 */
export declare function parseDue(v: unknown, now: number, tz?: string): {
    dueAt: number;
    hasTime: boolean;
};
/** The day a task belongs to, 'YYYY-MM-DD' (Dutch time). */
export declare const dueDay: (t: Pick<Task, 'dueAt'>, tz?: string) => string | null;
export declare function relativeDay(now: number, n: number, tz?: string): string;
export declare function newId(taken?: ReadonlySet<string>): string;
