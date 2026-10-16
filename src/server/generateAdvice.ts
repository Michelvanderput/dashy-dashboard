import type { AnthropicLanguageModelOptions } from '@ai-sdk/anthropic';
import { generateText, Output, type LanguageModel } from 'ai';
import { adviceSchema } from './adviceSchema';

/** Turns a model into the `generate` function the handler needs. Returns the schema-validated object. */
export function createGenerate(model: LanguageModel) {
  return async (system: string, user: string): Promise<unknown> => {
    const { output } = await generateText({
      model,
      system,
      prompt: user,
      output: Output.object({ schema: adviceSchema, name: 'dashy_advice', description: 'Dashy state and one short line' }),
      maxOutputTokens: 2000, // room for adaptive thinking as well as the reply
      maxRetries: 1,
      timeout: { totalMs: 20_000 },
      providerOptions: { anthropic: { effort: 'low' } satisfies AnthropicLanguageModelOptions },
    });
    return output;
  };
}
