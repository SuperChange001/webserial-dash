import { z } from 'zod';
import { binaryParser } from './binary';
import { csvParser } from './csv';
import { jsonParser } from './json';
import { kvParser } from './kv';
import { regexParser } from './regex';
import { teleplotParser } from './teleplot';
import type { ParserDefinition } from './types';

/**
 * All parser plugins. To add one: create src/core/parsers/<type>/index.ts exporting a
 * ParserDefinition (run `pnpm new:parser <type>`), import it here, append to this list.
 */
export const parserDefinitions = [csvParser, kvParser, jsonParser, teleplotParser, regexParser, binaryParser] as const;

export const parserSchema = z.discriminatedUnion('type', [
  csvParser.schema,
  kvParser.schema,
  jsonParser.schema,
  teleplotParser.schema,
  regexParser.schema,
  binaryParser.schema,
]);

export type ParserConfig = z.infer<typeof parserSchema>;
/** What users write in JSON (defaults optional). */
export type ParserConfigInput = z.input<typeof parserSchema>;

const byType = new Map<string, ParserDefinition>(parserDefinitions.map((d) => [d.type, d as unknown as ParserDefinition]));

export function getParserDefinition(type: string): ParserDefinition | undefined {
  return byType.get(type);
}
