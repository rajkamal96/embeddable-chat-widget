import { z } from 'zod';

export const ChatRequestSchema = z.object({
  message: z.string().trim().min(2, 'Please write a little more.').max(500, 'Please keep it under 500 characters.'),
  // The client sends earlier turns so follow-ups work. Only the visitor's own turns are used:
  // assistant turns come from the browser, so they are never trusted or forwarded to the model.
  history: z
    .array(z.object({ role: z.enum(['user', 'assistant']), text: z.string().max(1000) }))
    .max(8)
    .optional(),
});

/** What the model must return (also enforced by Gemini's responseSchema). */
export const ModelOutputSchema = z.object({
  answer: z.string().max(1500),
  sourceIds: z.array(z.string()).max(12),
  canAnswer: z.boolean(),
});

export const MODEL_OUTPUT_JSON_SCHEMA = {
  type: 'OBJECT',
  properties: {
    answer: { type: 'STRING' },
    sourceIds: { type: 'ARRAY', items: { type: 'STRING' } },
    canAnswer: { type: 'BOOLEAN' },
  },
  required: ['answer', 'sourceIds', 'canAnswer'],
} as const;

export type ModelOutput = z.infer<typeof ModelOutputSchema>;
