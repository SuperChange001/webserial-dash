import { z } from 'zod';
import { thresholdSchema, widgetBase } from '../base-schema';

export const valueSchema = widgetBase.extend({
  type: z.literal('value'),
  signal: z.string().describe('Signal to display.'),
  decimals: z.number().int().min(0).max(10).optional(),
  unit: z.string().optional().describe('Overrides signals.<name>.unit'),
  thresholds: thresholdSchema.optional(),
  w: widgetBase.shape.w.default(2),
  h: widgetBase.shape.h.default(1),
});
