import { z } from 'zod';
import { decodeText } from '../../bytes';
import type { Sample } from '../../types';
import { toNumber, type ParserDefinition } from '../types';

export const regexSchema = z.object({
  type: z.literal('regex'),
  pattern: z
    .string()
    .min(1)
    .describe('JavaScript regex with named groups; each numeric group becomes a signal, e.g. "T=(?<temp>[-\\\\d.]+)".'),
  flags: z.string().default('').describe('Regex flags. Add "g" to collect every match in the frame.'),
});

export type RegexConfig = z.infer<typeof regexSchema>;

export const regexParser: ParserDefinition<typeof regexSchema> = {
  type: 'regex',
  description: 'Extract signals from free-form log lines with named capture groups.',
  schema: regexSchema,
  create(config) {
    const re = new RegExp(config.pattern, config.flags);
    return {
      parse(frame, t) {
        const line = decodeText(frame);
        const out: Sample[] = [];
        const collect = (m: RegExpExecArray | RegExpMatchArray | null) => {
          if (!m?.groups) return;
          for (const [name, raw] of Object.entries(m.groups)) {
            if (raw === undefined) continue;
            const value = toNumber(raw);
            if (value !== undefined) out.push({ name, value, t });
          }
        };
        if (re.global) {
          for (const m of line.matchAll(re)) collect(m);
        } else {
          collect(re.exec(line));
        }
        return out;
      },
    };
  },
};
