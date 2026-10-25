import { z } from 'zod';
import { widgetBase } from '../base-schema';

export const plotSchema = widgetBase.extend({
  type: z.literal('plot'),
  signals: z.array(z.string()).min(1).describe('Signal names to draw as lines.'),
  timeWindowSec: z.number().positive().optional().describe('Seconds of history shown; defaults to options.timeWindowSec.'),
  yMin: z.number().optional(),
  yMax: z.number().optional(),
  legend: z.boolean().default(true),
  xAxis: z
    .enum(['time', 'index'])
    .default('time')
    .describe('"time": scrolling time window. "index": one x step per sample (#1, #2, …), for occasional events like test results.'),
  maxPoints: z.number().int().positive().default(50).describe('With xAxis "index": how many most recent samples to show.'),
  points: z.boolean().optional().describe('Draw a dot per sample. Defaults to true for xAxis "index".'),
  w: widgetBase.shape.w.default(8),
  h: widgetBase.shape.h.default(3),
});
