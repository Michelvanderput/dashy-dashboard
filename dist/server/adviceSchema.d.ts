import { z } from 'zod';
/** The schema handed to the model (AI SDK Output.object). Strict: exactly these two keys. */
export declare const adviceSchema: z.ZodObject<{
    state: z.ZodEnum<{
        angry: "angry";
        dancing: "dancing";
        happy: "happy";
        idle: "idle";
        sad: "sad";
        sleepy: "sleepy";
        strict: "strict";
        thinking: "thinking";
        waiting: "waiting";
        working: "working";
    }>;
    line: z.ZodString;
}, z.core.$strict>;
