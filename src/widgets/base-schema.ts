import { z } from 'zod';

/** Fields shared by every widget. Extend this in src/widgets/<type>/schema.ts. */
export const widgetBase = z.object({
  id: z.string().optional().describe('Optional stable id (used as React key and in tests).'),
  title: z.string().optional().describe('Header text. Defaults to the signal label.'),
  w: z.number().int().min(1).max(24).default(4).describe('Width in grid columns (12-column grid by default).'),
  h: z.number().int().min(1).max(24).default(2).describe('Height in grid rows (one row ≈ 90 px).'),
  x: z.number().int().min(0).optional().describe('Optional fixed column (0-based). Omit for auto flow.'),
  y: z.number().int().min(0).optional().describe('Optional fixed row (0-based).'),
});

export const thresholdSchema = z
  .array(z.object({ value: z.number(), color: z.string().describe('CSS color') }))
  .describe('Colour steps: the step with the highest value <= current value wins.');

export type Threshold = z.infer<typeof thresholdSchema>[number];

export function thresholdColor(value: number, thresholds: readonly Threshold[] | undefined, fallback: string): string {
  if (!thresholds?.length) return fallback;
  let color = fallback;
  for (const t of [...thresholds].sort((a, b) => a.value - b.value)) if (value >= t.value) color = t.color;
  return color;
}
