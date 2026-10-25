import { z } from 'zod';
import { thresholdSchema, widgetBase } from '../base-schema';

export const gaugeSchema = widgetBase.extend({
  type: z.literal('gauge'),
  signal: z.string(),
  min: z.number().default(0),
  max: z.number().default(100),
  decimals: z.number().int().min(0).max(10).optional(),
  unit: z.string().optional(),
  thresholds: thresholdSchema.optional(),
  w: widgetBase.shape.w.default(3),
  h: widgetBase.shape.h.default(2),
});
