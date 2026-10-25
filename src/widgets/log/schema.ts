import { z } from 'zod';
import { widgetBase } from '../base-schema';

export const logSchema = widgetBase.extend({
  type: z.literal('log'),
  maxLines: z.number().int().positive().default(500),
  filter: z.string().optional().describe('Regex; only matching frames are shown.'),
  timestamps: z.boolean().default(true),
  w: widgetBase.shape.w.default(6),
  h: widgetBase.shape.h.default(3),
});
