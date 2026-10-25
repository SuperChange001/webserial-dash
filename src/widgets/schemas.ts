import { z } from 'zod';
import { buttonSchema } from './button/schema';
import { gaugeSchema } from './gauge/schema';
import { ledSchema } from './led/schema';
import { logSchema } from './log/schema';
import { plotSchema } from './plot/schema';
import { tableSchema } from './table/schema';
import { terminalSchema } from './terminal/schema';
import { valueSchema } from './value/schema';

/**
 * Widget config schemas (no React imports — safe for Node scripts).
 * To add a widget: `pnpm new:widget <type>`, then add its schema here and its component
 * in ./registry.tsx.
 */
export const widgetSchemas = {
  plot: plotSchema,
  value: valueSchema,
  gauge: gaugeSchema,
  led: ledSchema,
  table: tableSchema,
  terminal: terminalSchema,
  log: logSchema,
  button: buttonSchema,
} as const;

export const widgetSchema = z.discriminatedUnion('type', [
  plotSchema,
  valueSchema,
  gaugeSchema,
  ledSchema,
  tableSchema,
  terminalSchema,
  logSchema,
  buttonSchema,
]);

export type WidgetConfig = z.infer<typeof widgetSchema>;
export type WidgetType = WidgetConfig['type'];
export type WidgetConfigOf<T extends WidgetType> = Extract<WidgetConfig, { type: T }>;
