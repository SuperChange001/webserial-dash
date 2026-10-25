/**
 * Scaffold a parser plugin: src/core/parsers/<type>/index.ts + a test file.
 * Usage: pnpm new:parser <type>
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';

const type = process.argv[2];
if (!type || !/^[a-z][a-z0-9]*$/.test(type)) {
  console.error('usage: pnpm new:parser <type>');
  process.exit(1);
}
const dir = `src/core/parsers/${type}`;
if (existsSync(dir)) {
  console.error(`${dir} already exists`);
  process.exit(1);
}
mkdirSync(dir, { recursive: true });
writeFileSync(
  `${dir}/index.ts`,
  `import { z } from 'zod';
import { decodeText } from '../../bytes';
import type { Sample } from '../../types';
import { toNumber, type ParserDefinition } from '../types';

export const ${type}Schema = z.object({
  type: z.literal('${type}'),
  // options, each with .describe()
});

export const ${type}Parser: ParserDefinition<typeof ${type}Schema> = {
  type: '${type}',
  description: 'TODO: one line shown in docs and the JSON schema.',
  schema: ${type}Schema,
  create(_config) {
    return {
      parse(frame, t) {
        const line = decodeText(frame).trim();
        const out: Sample[] = [];
        const value = toNumber(line);
        if (value !== undefined) out.push({ name: '${type}', value, t });
        return out;
      },
    };
  },
};
`,
);
writeFileSync(
  `${dir}/${type}.test.ts`,
  `import { describe, expect, it } from 'vitest';
import { encodeText } from '../../bytes';
import { ${type}Parser } from './index';

describe('${type} parser', () => {
  it('parses a frame', () => {
    const p = ${type}Parser.create(${type}Parser.schema.parse({ type: '${type}' }));
    expect(p.parse(encodeText('42'), 1)).toEqual([{ name: '${type}', value: 42, t: 1 }]);
  });
});
`,
);
console.log(`created ${dir}/index.ts and ${dir}/${type}.test.ts

Now register it in src/core/parsers/registry.ts (import, add to parserDefinitions and parserSchema),
run pnpm gen:schema && pnpm check, and document it in docs/PROTOCOLS.md.`);
