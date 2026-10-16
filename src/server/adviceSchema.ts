import { z } from 'zod';
import { ALLOWED_STATES, MAX_LINE } from '../advice';

/** The schema handed to the model (AI SDK Output.object). Strict: exactly these two keys. */
export const adviceSchema = z.object({
  state: z.enum(ALLOWED_STATES),
  line: z.string().min(1).max(MAX_LINE),
}).strict();
