import { type LanguageModel } from 'ai';
/** Turns a model into the `generate` function the handler needs. Returns the schema-validated object. */
export declare function createGenerate(model: LanguageModel): (system: string, user: string) => Promise<unknown>;
