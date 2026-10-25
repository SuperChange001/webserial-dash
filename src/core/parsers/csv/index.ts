import { z } from 'zod';
import { decodeText } from '../../bytes';
import type { Sample } from '../../types';
import { toNumber, type ParserDefinition } from '../types';

export const csvSchema = z.object({
  type: z.literal('csv'),
  separator: z.string().min(1).default(',').describe('Field separator. Use " " for whitespace separated values.'),
  fields: z
    .array(z.string())
    .default([])
    .describe('Signal name per column. Missing names become col0, col1, … Use "" to skip a column.'),
  header: z
    .boolean()
    .default(true)
    .describe('If true, a line whose fields are not all numeric is treated as a header naming the columns (e.g. "temp,hum" or "# temp hum").'),
});

export type CsvConfig = z.infer<typeof csvSchema>;

export const csvParser: ParserDefinition<typeof csvSchema> = {
  type: 'csv',
  description: 'Delimited numeric columns, e.g. "23.5,41,1013". Optional header line names the columns.',
  schema: csvSchema,
  create(config) {
    let names = [...config.fields];
    const split = (line: string) =>
      config.separator === ' ' ? line.trim().split(/\s+/) : line.split(config.separator);
    return {
      parse(frame, t) {
        const line = decodeText(frame).trim();
        if (!line) return [];
        const cells = split(line.replace(/^#\s*/, ''));
        const values = cells.map(toNumber);
        if (values.some((v) => v === undefined)) {
          if (config.header && line.startsWith('#')) names = cells;
          else if (config.header && values.every((v) => v === undefined) && config.fields.length === 0) names = cells;
          return [];
        }
        const out: Sample[] = [];
        values.forEach((v, i) => {
          const name = names[i] ?? `col${i}`;
          if (name !== '') out.push({ name, value: v!, t });
        });
        return out;
      },
      reset() {
        names = [...config.fields];
      },
    };
  },
};
