import { z } from 'zod';
import { thresholdSchema, widgetBase } from '../base-schema';

export const gaugeSchema = widgetBase.extend({
  type: z.literal('gauge'),
  signal: z.string(),
  min: z.number().default(0).describe('Left end of the arc.'),
  max: z.number().default(100).describe('Right end of the arc.'),
  decimals: z.number().int().min(0).max(10).optional(),
  unit: z.string().optional(),
  thresholds: thresholdSchema.optional(),
  showMinMax: z
    .boolean()
    .default(false)
    .describe('Mark the lowest and highest value seen since connect/Clear on the arc and print them below.'),
  w: widgetBase.shape.w.default(3),
  h: widgetBase.shape.h.default(2),
});
