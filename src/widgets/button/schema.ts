import { z } from 'zod';
import { widgetBase } from '../base-schema';

export const buttonSchema = widgetBase.extend({
  type: z.literal('button'),
  actions: z
    .array(
      z.object({
        label: z.string(),
        send: z.string().describe('Text to transmit; escapes like "\\n" or "\\x02" are interpreted.'),
        color: z.string().optional(),
      }),
    )
    .min(1),
  lineEnding: z.enum(['\\n', '\\r\\n', '\\r', '']).default('\\n').describe('Appended to every action.'),
  w: widgetBase.shape.w.default(3),
  h: widgetBase.shape.h.default(1),
});
