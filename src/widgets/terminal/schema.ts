import { z } from 'zod';
import { widgetBase } from '../base-schema';

export const terminalSchema = widgetBase.extend({
  type: z.literal('terminal'),
  localEcho: z.boolean().default(false).describe('Echo typed characters locally.'),
  lineEnding: z.enum(['\\n', '\\r\\n', '\\r', '']).default('\\n').describe('Appended to lines sent from the input box.'),
  convertEol: z.boolean().default(true).describe('Treat a bare "\\n" as a newline (most firmware logs).'),
  fontSize: z.number().int().min(8).max(32).default(13),
  scrollback: z.number().int().positive().default(5000),
  w: widgetBase.shape.w.default(12),
  h: widgetBase.shape.h.default(4),
});
