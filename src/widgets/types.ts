import type { ComponentType } from 'react';
import type { Session } from '@/app/session';
import type { Dashboard, SignalMeta } from '@/config/schema';
import type { WidgetConfig, WidgetType, WidgetConfigOf } from './schemas';

/** Everything a widget may need. Widgets read the store directly; no prop drilling. */
export interface WidgetContext {
  session: Session;
  dashboard: Dashboard;
  meta(signal: string): SignalMeta | undefined;
  /** Display label for a signal (meta.label or the raw name). */
  label(signal: string): string;
  /** Format a value with the signal's decimals and unit. */
  format(signal: string, value: number, opts?: { decimals?: number; unit?: string }): string;
  /** Colour for a signal (meta.color or a stable palette pick). */
  color(signal: string): string;
}

export interface WidgetProps<C extends WidgetConfig = WidgetConfig> {
  config: C;
  ctx: WidgetContext;
}

export interface WidgetDefinition<T extends WidgetType = WidgetType> {
  type: T;
  description: string;
  component: ComponentType<WidgetProps<WidgetConfigOf<T>>>;
}
