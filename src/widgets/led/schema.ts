import { z } from 'zod';
import { widgetBase } from '../base-schema';

export const ledSchema = widgetBase.extend({
  type: z.literal('led'),
  signal: z.string(),
  when: z
    .object({ op: z.enum(['>', '>=', '<', '<=', '==', '!=']).default('>'), value: z.number().default(0) })
    .default({ op: '>', value: 0 })
    .describe('Condition for the ON state, e.g. {"op": ">", "value": 0.5}.'),
  onColor: z.string().default('#22c55e'),
  offColor: z.string().default('#334155'),
  onLabel: z.string().optional(),
  offLabel: z.string().optional(),
  w: widgetBase.shape.w.default(2),
  h: widgetBase.shape.h.default(1),
});
