import { getParserDefinition, type ParserConfigInput } from './registry';
import type { Parser } from './types';

export * from './types';
export * from './registry';

export function createParser(config: ParserConfigInput): Parser {
  const def = getParserDefinition(config.type);
  if (!def) throw new Error(`Unknown parser type: ${(config as { type: string }).type}`);
  return def.create(def.schema.parse(config));
}
