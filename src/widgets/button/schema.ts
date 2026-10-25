import { z } from 'zod';
import { widgetBase } from '../base-schema';

export const localActions = ['clearData', 'resetDevice', 'recordStart', 'recordStop'] as const;

export const buttonActionSchema = z
  .object({
    label: z.string(),
    send: z.string().optional().describe('Text to transmit to the device; escapes like "\\n" or "\\x02" are interpreted.'),
    local: z
      .enum(localActions)
      .optional()
      .describe('Action handled by the dashboard itself: clearData (empty plots, stats, min/max), resetDevice (DTR/RTS pulse), recordStart/recordStop (in-memory recording).'),
    color: z.string().optional().describe('CSS background colour.'),
    confirm: z.string().optional().describe('If set, ask this question before running the action.'),
  })
  .refine((a) => a.send !== undefined || a.local !== undefined, { message: 'each action needs "send" or "local"' });

export const buttonSchema = widgetBase.extend({
  type: z.literal('button'),
  actions: z.array(buttonActionSchema).min(1).describe('Buttons; each sends text, runs a local action, or both (local first).'),
  lineEnding: z.enum(['\\n', '\\r\\n', '\\r', '']).default('\\n').describe('Appended to every "send".'),
  w: widgetBase.shape.w.default(3),
  h: widgetBase.shape.h.default(1),
});
