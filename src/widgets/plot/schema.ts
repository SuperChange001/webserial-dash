import { z } from 'zod';
import { widgetBase } from '../base-schema';

export const plotSchema = widgetBase.extend({
  type: z.literal('plot'),
  signals: z.array(z.string()).min(1).describe('Signal names to draw as lines.'),
  timeWindowSec: z.number().positive().optional().describe('Seconds of history shown; defaults to options.timeWindowSec.'),
  yMin: z.number().optional(),
  yMax: z.number().optional(),
  legend: z.boolean().default(true),
  w: widgetBase.shape.w.default(8),
  h: widgetBase.shape.h.default(3),
});
