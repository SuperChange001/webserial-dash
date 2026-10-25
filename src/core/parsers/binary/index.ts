import { z } from 'zod';
import type { Sample } from '../../types';
import type { ParserDefinition } from '../types';

/** Python-struct-like format: optional '<' (little, default) or '>' (big), then type chars. */
const TYPE_SIZES: Record<string, number> = { b: 1, B: 1, h: 2, H: 2, i: 4, I: 4, q: 8, Q: 8, f: 4, d: 8, x: 1 };

export const binarySchema = z.object({
  type: z.literal('binary'),
  format: z
    .string()
    .regex(/^[<>]?[bBhHiIqQfdx]+$/, 'format must be like "<HhfB"')
    .describe('struct-style layout: < little-endian (default), > big-endian; b/B int8, h/H int16, i/I int32, q/Q int64, f float32, d float64, x pad byte.'),
  fields: z.array(z.string()).describe('Signal name per non-pad field, in order.'),
  offset: z.number().int().min(0).default(0).describe('Bytes to skip at the start of each frame (e.g. a header).'),
});

export type BinaryConfig = z.infer<typeof binarySchema>;

export function structSize(format: string): number {
  return [...format.replace(/^[<>]/, '')].reduce((n, c) => n + (TYPE_SIZES[c] ?? 0), 0);
}

export const binaryParser: ParserDefinition<typeof binarySchema> = {
  type: 'binary',
  description: 'Fixed binary records described by a struct format string, e.g. "<Hhf" with fields ["seq","temp","v"].',
  schema: binarySchema,
  create(config) {
    const little = !config.format.startsWith('>');
    const codes = [...config.format.replace(/^[<>]/, '')];
    const needed = config.offset + structSize(config.format);
    return {
      parse(frame, t) {
        if (frame.byteLength < needed) return [];
        const dv = new DataView(frame.buffer, frame.byteOffset + config.offset, frame.byteLength - config.offset);
        const out: Sample[] = [];
        let pos = 0;
        let fi = 0;
        for (const c of codes) {
          let value: number | undefined;
          switch (c) {
            case 'b': value = dv.getInt8(pos); break;
            case 'B': value = dv.getUint8(pos); break;
            case 'h': value = dv.getInt16(pos, little); break;
            case 'H': value = dv.getUint16(pos, little); break;
            case 'i': value = dv.getInt32(pos, little); break;
            case 'I': value = dv.getUint32(pos, little); break;
            case 'q': value = Number(dv.getBigInt64(pos, little)); break;
            case 'Q': value = Number(dv.getBigUint64(pos, little)); break;
            case 'f': value = dv.getFloat32(pos, little); break;
            case 'd': value = dv.getFloat64(pos, little); break;
            case 'x': break;
          }
          pos += TYPE_SIZES[c]!;
          if (value === undefined) continue;
          const name = config.fields[fi] ?? `f${fi}`;
          fi++;
          if (name !== '') out.push({ name, value, t });
        }
        return out;
      },
    };
  },
};
