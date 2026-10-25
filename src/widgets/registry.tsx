import { lazy } from 'react';
import { ButtonWidget } from './button/Button';
import { GaugeWidget } from './gauge/Gauge';
import { LedWidget } from './led/Led';
import { LogWidget } from './log/Log';
import { TableWidget } from './table/Table';
import { ValueWidget } from './value/Value';
import type { WidgetType } from './schemas';
import type { WidgetDefinition } from './types';

// Heavy dependencies (uPlot, xterm.js) load on demand; DashboardGrid wraps widgets in <Suspense>.
const PlotWidget = lazy(() => import('./plot/Plot').then((m) => ({ default: m.PlotWidget })));
const TerminalWidget = lazy(() => import('./terminal/Terminal').then((m) => ({ default: m.TerminalWidget })));

/**
 * Widget components by type. Schemas live in ./schemas.ts (kept React-free for scripts).
 * To add a widget: `pnpm new:widget <type>` scaffolds the folder, then register in both files.
 */
export const widgetRegistry: { [T in WidgetType]: WidgetDefinition<T> } = {
  plot: { type: 'plot', description: 'Streaming line chart (uPlot)', component: PlotWidget },
  value: { type: 'value', description: 'Big number tile with thresholds', component: ValueWidget },
  gauge: { type: 'gauge', description: 'Semicircular gauge', component: GaugeWidget },
  led: { type: 'led', description: 'On/off indicator driven by a condition', component: LedWidget },
  table: { type: 'table', description: 'Latest value and stats per signal', component: TableWidget },
  terminal: { type: 'terminal', description: 'Raw serial terminal (xterm.js) with send box', component: TerminalWidget },
  log: { type: 'log', description: 'Parsed frames as text lines with filter', component: LogWidget },
  button: { type: 'button', description: 'Buttons that send commands', component: ButtonWidget },
};

export function getWidgetDefinition<T extends WidgetType>(type: T): WidgetDefinition<T> {
  return widgetRegistry[type];
}
