/**
 * Scaffold a widget: src/widgets/<type>/{schema.ts,<Name>.tsx} and print the two registry lines.
 * Usage: pnpm new:widget <type>   (type = lowercase identifier, e.g. "sparkline")
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';

const type = process.argv[2];
if (!type || !/^[a-z][a-z0-9]*$/.test(type)) {
  console.error('usage: pnpm new:widget <type>   (lowercase letters/digits)');
  process.exit(1);
}
const Name = type[0]!.toUpperCase() + type.slice(1);
const dir = `src/widgets/${type}`;
if (existsSync(dir)) {
  console.error(`${dir} already exists`);
  process.exit(1);
}
mkdirSync(dir, { recursive: true });
writeFileSync(
  `${dir}/schema.ts`,
  `import { z } from 'zod';
import { widgetBase } from '../base-schema';

export const ${type}Schema = widgetBase.extend({
  type: z.literal('${type}'),
  signal: z.string().describe('Signal to display.'),
  // add options here; give every field a .describe()
  w: widgetBase.shape.w.default(3),
  h: widgetBase.shape.h.default(2),
});
`,
);
writeFileSync(
  `${dir}/${Name}.tsx`,
  `import { useLatest } from '@/app/hooks';
import type { WidgetConfigOf } from '../schemas';
import type { WidgetProps } from '../types';

export function ${Name}Widget({ config, ctx }: WidgetProps<WidgetConfigOf<'${type}'>>) {
  const latest = useLatest(ctx.session, config.signal);
  return (
    <div className="w-${type}" data-signal={config.signal}>
      {latest ? ctx.format(config.signal, latest.v) : '—'}
    </div>
  );
}
`,
);
console.log(`created ${dir}/schema.ts and ${dir}/${Name}.tsx

Now register it (two places):
  src/widgets/schemas.ts   → import { ${type}Schema } from './${type}/schema';  add to widgetSchemas and the widgetSchema union
  src/widgets/registry.tsx → import { ${Name}Widget } from './${type}/${Name}';  add  ${type}: { type: '${type}', description: '…', component: ${Name}Widget }
Then: pnpm gen:schema && pnpm check, and document it in docs/CONFIG.md.`);
