import { z } from 'zod';
import { parserSchema } from '@/core/parsers/registry';
import { widgetSchema } from '@/widgets/schemas';

/**
 * Dashboard configuration schema — the single source of truth.
 * `pnpm gen:schema` exports it to schema/dashboard.schema.json for editor completion.
 * Every field has a .describe() so agents and humans see the intent in the JSON Schema.
 */

export const framingSchema = z
  .discriminatedUnion('mode', [
    z.object({
      mode: z.literal('delimiter'),
      delimiter: z.string().min(1).default('\\n').describe('Frame terminator, escapes allowed ("\\n", "\\r\\n", "\\x00").'),
      maxLength: z.number().int().positive().default(4096).describe('Drop buffered bytes beyond this if no delimiter arrives.'),
    }),
    z.object({
      mode: z.literal('startEnd'),
      start: z.string().min(1).describe('Start marker, escapes allowed.'),
      end: z.string().min(1).describe('End marker, escapes allowed.'),
      maxLength: z.number().int().positive().default(4096),
      includeMarkers: z.boolean().default(false).describe('Pass the markers to the parser (needed for binary parsers with header bytes).'),
    }),
    z.object({
      mode: z.literal('length'),
      length: z.number().int().positive().describe('Fixed frame size in bytes.'),
    }),
  ])
  .describe('How the byte stream is cut into frames before parsing.');

export const simulatedSignalSchema = z.object({
  name: z.string(),
  waveform: z.enum(['sine', 'square', 'triangle', 'sawtooth', 'noise', 'counter', 'constant']).default('sine'),
  min: z.number().default(0),
  max: z.number().default(100),
  periodMs: z.number().nonnegative().default(5000),
  decimals: z.number().int().min(0).max(10).default(2),
});

export const simulateSchema = z
  .object({
    intervalMs: z.number().positive().default(100).describe('Milliseconds between generated lines.'),
    format: z.enum(['csv', 'kv', 'json', 'teleplot']).default('csv').describe('Text format of generated lines; should match source.parser.'),
    lineEnding: z.string().default('\\n'),
    signals: z.array(simulatedSignalSchema).default([]),
    lines: z.array(z.string()).optional().describe('If set, these lines are replayed in a loop instead of generating signals.'),
    echo: z.boolean().default(true).describe('Echo bytes sent to the simulated device back as "echo: …" lines.'),
  })
  .describe('Fake device used by Demo mode and tests so the dashboard works without hardware.');

export const sourceSchema = z
  .object({
    baudRate: z.number().int().positive().default(115200),
    dataBits: z.union([z.literal(7), z.literal(8)]).default(8),
    stopBits: z.union([z.literal(1), z.literal(2)]).default(1),
    parity: z.enum(['none', 'even', 'odd']).default('none'),
    flowControl: z.enum(['none', 'hardware']).default('none'),
    bufferSize: z.number().int().positive().default(65536).describe('Browser receive buffer in bytes.'),
    filters: z
      .array(z.object({ usbVendorId: z.number().int(), usbProductId: z.number().int().optional() }))
      .default([])
      .describe('Optional USB VID/PID filters for the port chooser.'),
    framing: framingSchema.default({ mode: 'delimiter', delimiter: '\\n', maxLength: 4096 }),
    parser: parserSchema.default({ type: 'csv', separator: ',', fields: [], header: true }),
    simulate: simulateSchema.optional(),
  })
  .describe('Serial settings plus how to turn bytes into signals.');

export const signalMetaSchema = z
  .object({
    label: z.string().optional().describe('Display name.'),
    unit: z.string().optional(),
    scale: z.number().default(1).describe('value = raw * scale + offset'),
    offset: z.number().default(0),
    decimals: z.number().int().min(0).max(10).optional().describe('Decimals when displaying.'),
    color: z.string().optional().describe('CSS color used by plots and tiles.'),
  })
  .describe('Optional presentation metadata per signal name. Signals not listed here still work.');

export const dashboardSchema = z
  .object({
    $schema: z.string().optional(),
    id: z.string().regex(/^[a-z0-9-]+$/).describe('URL-safe identifier, e.g. "my-sensor".'),
    name: z.string().min(1),
    description: z.string().optional(),
    source: sourceSchema.prefault({}),
    signals: z.record(z.string(), signalMetaSchema).default({}),
    widgets: z.array(widgetSchema).default([]),
    options: z
      .object({
        bufferSamples: z.number().int().positive().default(20_000).describe('Samples kept per signal in memory.'),
        timeWindowSec: z.number().positive().default(30).describe('Default plot window.'),
        columns: z.number().int().min(1).max(24).default(12).describe('Grid columns on wide screens.'),
      })
      .prefault({}),
  })
  .describe('A WebSerial Dash dashboard.');

export type Dashboard = z.infer<typeof dashboardSchema>;
export type DashboardInput = z.input<typeof dashboardSchema>;
export type SourceConfig = Dashboard['source'];
export type SignalMeta = z.infer<typeof signalMetaSchema>;
export type FramingConfig = z.infer<typeof framingSchema>;

export function parseDashboard(input: unknown): Dashboard {
  return dashboardSchema.parse(input);
}

export function safeParseDashboard(input: unknown) {
  return dashboardSchema.safeParse(input);
}

/** Human readable issues for the UI / CLI. */
export function formatIssues(error: z.ZodError): string[] {
  return error.issues.map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`);
}
