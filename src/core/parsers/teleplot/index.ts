import { z } from 'zod';
import { decodeText } from '../../bytes';
import type { Sample } from '../../types';
import { toNumber, type ParserDefinition } from '../types';

export const teleplotSchema = z.object({
  type: z.literal('teleplot'),
  requirePrefix: z.boolean().default(true).describe('Only accept lines starting with ">" (Teleplot serial convention).'),
});

export type TeleplotConfig = z.infer<typeof teleplotSchema>;

/**
 * Teleplot line protocol: `>name:value`, `>name:ts:value`, `>name:v1;v2;v3`, `>name:value§unit|flags`.
 * See https://github.com/nesnes/teleplot#data-format
 */
export const teleplotParser: ParserDefinition<typeof teleplotSchema> = {
  type: 'teleplot',
  description: 'Teleplot protocol: ">temp:23.5" or ">temp:1700000000000:23.5§°C".',
  schema: teleplotSchema,
  create(config) {
    return {
      parse(frame, t) {
        let line = decodeText(frame).trim();
        if (line.startsWith('>')) line = line.slice(1);
        else if (config.requirePrefix) return [];
        const bar = line.indexOf('|');
        if (bar >= 0) line = line.slice(0, bar); // drop flags
        const colon = line.indexOf(':');
        if (colon <= 0) return [];
        const name = line.slice(0, colon).trim();
        const body = line.slice(colon + 1);
        const out: Sample[] = [];
        for (const chunk of body.split(';')) {
          const noUnit = chunk.split('§')[0]!;
          const parts = noUnit.split(':');
          let time = t;
          let valueStr = parts[0] ?? '';
          if (parts.length >= 2) {
            const ts = toNumber(parts[0]!);
            if (ts !== undefined) time = ts;
            valueStr = parts[1]!;
          }
          const value = toNumber(valueStr);
          if (value !== undefined) out.push({ name, value, t: time });
        }
        return out;
      },
    };
  },
};
