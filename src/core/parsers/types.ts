import type { z } from 'zod';
import type { Sample } from '../types';

/** Turns one frame into zero or more samples. Must be pure apart from internal state. */
export interface Parser {
  parse(frame: Uint8Array, t: number): Sample[];
  reset?(): void;
}

/**
 * A parser plugin: its config schema (becomes part of dashboard.schema.json) and a factory.
 * Register new parsers in ./registry.ts.
 */
export interface ParserDefinition<S extends z.ZodObject = z.ZodObject> {
  type: string;
  description: string;
  schema: S;
  create(config: z.infer<S>): Parser;
}

/** Shared option: apply `signals.<name>.scale/offset` later; parsers emit raw numbers. */
export function toNumber(raw: string): number | undefined {
  const s = raw.trim();
  if (s === '') return undefined;
  if (s === 'true') return 1;
  if (s === 'false') return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}
