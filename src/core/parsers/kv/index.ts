import { z } from 'zod';
import { decodeText } from '../../bytes';
import type { Sample } from '../../types';
import { toNumber, type ParserDefinition } from '../types';

export const kvSchema = z.object({
  type: z.literal('kv'),
  pairSeparator: z
    .string()
    .default('[,;\\s]+')
    .describe('Regex separating pairs. Default splits on commas, semicolons and whitespace.'),
  kvSeparator: z.string().default('[=:]').describe('Regex separating key from value (default "=" or ":").'),
});

export type KvConfig = z.infer<typeof kvSchema>;

export const kvParser: ParserDefinition<typeof kvSchema> = {
  type: 'kv',
  description: 'Key/value pairs, e.g. "temp=23.5 hum=41" or "T:23.5,H:41".',
  schema: kvSchema,
  create(config) {
    const pairRe = new RegExp(config.pairSeparator);
    const kvRe = new RegExp(config.kvSeparator);
    return {
      parse(frame, t) {
        const line = decodeText(frame).trim();
        if (!line) return [];
        const out: Sample[] = [];
        for (const pair of line.split(pairRe)) {
          const m = kvRe.exec(pair);
          if (!m || m.index === 0) continue;
          const key = pair.slice(0, m.index).trim();
          const value = toNumber(pair.slice(m.index + m[0].length));
          if (key && value !== undefined) out.push({ name: key, value, t });
        }
        return out;
      },
    };
  },
};
