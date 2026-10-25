import { z } from 'zod';
import { decodeText } from '../../bytes';
import type { Sample } from '../../types';
import type { ParserDefinition } from '../types';

export const jsonSchema = z.object({
  type: z.literal('json'),
  path: z
    .string()
    .optional()
    .describe('Optional dotted path to the object holding the values, e.g. "data" for {"data":{...}}.'),
  timeKey: z.string().optional().describe('Key holding a device timestamp in ms; used as sample time when present.'),
});

export type JsonConfig = z.infer<typeof jsonSchema>;

function flatten(value: unknown, prefix: string, t: number, out: Sample[]): void {
  if (typeof value === 'number') {
    if (Number.isFinite(value)) out.push({ name: prefix, value, t });
  } else if (typeof value === 'boolean') {
    out.push({ name: prefix, value: value ? 1 : 0, t });
  } else if (typeof value === 'string') {
    const n = Number(value);
    if (value.trim() !== '' && Number.isFinite(n)) out.push({ name: prefix, value: n, t });
  } else if (Array.isArray(value)) {
    value.forEach((v, i) => flatten(v, prefix ? `${prefix}.${i}` : String(i), t, out));
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) flatten(v, prefix ? `${prefix}.${k}` : k, t, out);
  }
}

export const jsonParser: ParserDefinition<typeof jsonSchema> = {
  type: 'json',
  description: 'One JSON object per frame. Nested keys are flattened with dots ("imu.ax").',
  schema: jsonSchema,
  create(config) {
    return {
      parse(frame, t) {
        const text = decodeText(frame).trim();
        if (!text.startsWith('{') && !text.startsWith('[')) return [];
        let obj: unknown;
        try {
          obj = JSON.parse(text);
        } catch {
          return [];
        }
        if (config.path) {
          for (const key of config.path.split('.')) {
            obj = obj && typeof obj === 'object' ? (obj as Record<string, unknown>)[key] : undefined;
          }
        }
        let time = t;
        if (config.timeKey && obj && typeof obj === 'object') {
          const ts = (obj as Record<string, unknown>)[config.timeKey];
          if (typeof ts === 'number' && Number.isFinite(ts)) time = ts;
        }
        const out: Sample[] = [];
        flatten(obj, '', time, out);
        return config.timeKey ? out.filter((s) => s.name !== config.timeKey) : out;
      },
    };
  },
};
