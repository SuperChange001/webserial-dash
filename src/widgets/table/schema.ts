import { z } from 'zod';
import { widgetBase } from '../base-schema';

export const tableSchema = widgetBase.extend({
  type: z.literal('table'),
  signals: z.array(z.string()).default([]).describe('Rows to show. Empty = every signal seen so far.'),
  stats: z.boolean().default(true).describe('Show min/max/mean columns.'),
  w: widgetBase.shape.w.default(4),
  h: widgetBase.shape.h.default(3),
});
