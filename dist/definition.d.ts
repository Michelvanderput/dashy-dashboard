/**
 * Dashy definition: one portable JSON file that holds a look (shape, colours, eye proportion), custom expressions and
 * named sequences. Same file for every renderer. No dependencies: the validator is plain TypeScript.
 *
 * {
 *   "schema": "dashy/avatar-definition", "schemaVersion": 1, "name": "Dashy",
 *   "shape": "square", "colors": { "body": "#fff", "eyes": "#101214", "outline": "#c9c9c4" }, "eyeScale": 0.83,
 *   "expressions": { "smug": { "state": "idle", "look": { "cover": 0.45, "lidA": -6, "low": 0.2 } } },
 *   "sequences": { "hello": { "mode": "once", "steps": [ { "expression": "happy", "holdMs": 900, "transitionMs": 250, "ease": "snappy" } ] } }
 * }
 */
import type { DashyState, Shape } from './core';
import { type Expression, type Sequence } from './timeline';
export declare const DEFINITION_SCHEMA = "dashy/avatar-definition";
export declare const DEFINITION_MAX_BYTES = 262144;
export declare const DEFINITION_MAX_DEPTH = 16;
export declare const KEY_PATTERN: RegExp;
export interface Colors {
    body: string;
    eyes: string;
    outline: string;
}
export declare const DEFAULT_COLORS: Readonly<Colors>;
export interface DashyDefinition {
    schema: typeof DEFINITION_SCHEMA;
    schemaVersion: 1;
    name?: string;
    shape?: Shape;
    colors?: Partial<Colors>;
    eyeScale?: number;
    expressions: Record<string, Expression>;
    sequences: Record<string, Sequence>;
}
export interface DefinitionError {
    path: string;
    message: string;
}
export type DefinitionResult = {
    ok: true;
    value: Readonly<DashyDefinition>;
} | {
    ok: false;
    errors: DefinitionError[];
};
/** Validates a value that is already parsed. Never throws, never mutates; the result is deeply frozen. */
export declare function validateDefinition(input: unknown): DefinitionResult;
/** For text from outside (a file, a form): checks the size, parses, then validates. */
export declare function parseDefinition(text: string): DefinitionResult;
export declare function isBuiltInState(k: string): k is DashyState;
