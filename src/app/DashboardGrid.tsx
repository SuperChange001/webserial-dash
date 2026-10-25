import { Suspense, useMemo } from 'react';
import type { Dashboard } from '@/config/schema';
import { getWidgetDefinition } from '@/widgets/registry';
import { widgetSchema, type WidgetConfig } from '@/widgets/schemas';
import type { z } from 'zod';
import type { WidgetContext } from '@/widgets/types';
import { useTick } from './hooks';

/**
 * When a dashboard has no widgets, build one from whatever the device sends:
 * a value tile and a small plot per signal (own y-axis, so different ranges stay readable),
 * a stats table and the raw terminal. The tick counter is listed in the table only. New signals appear as soon as they arrive.
 */
export function autoWidgets(names: string[], timestampField?: string): WidgetConfig[] {
  // Written as JSON-style input; defaults are filled in by the schema below.
  const widgets: z.input<typeof widgetSchema>[] = [];
  const data = names.filter((n) => n !== timestampField).slice(0, 12);
  if (data.length === 0) {
    widgets.push({ type: 'log', title: 'Waiting for data: every line received is shown here', w: 12, h: 3 });
  } else {
    // One column per signal: value tile on top, its own plot below (own y-axis).
    const perRow = Math.min(data.length, 4);
    const w = Math.floor(12 / perRow);
    data.forEach((n, i) => {
      const x = (i % perRow) * w;
      const y = Math.floor(i / perRow) * 3;
      widgets.push({ type: 'value', signal: n, x, y, w, h: 1 });
      widgets.push({ type: 'plot', signals: [n], title: `${n} over time`, legend: false, x, y: y + 1, w, h: 2 });
    });
    const below = Math.ceil(data.length / perRow) * 3;
    widgets.push({ type: 'table', title: 'All signals', x: 0, y: below, w: 12, h: 2 });
  }
  widgets.push({ type: 'terminal', w: 12, h: 4 });
  return widgets.map((w) => widgetSchema.parse(w));
}

/**
 * When every widget has a fixed position, render them top-to-bottom, left-to-right so the
 * single-column phone layout keeps the same reading order. Desktop placement is unaffected.
 */
function inReadingOrder(widgets: WidgetConfig[]): WidgetConfig[] {
  if (!widgets.every((w) => w.y !== undefined)) return widgets;
  return [...widgets].sort((a, b) => a.y! - b.y! || (a.x ?? 0) - (b.x ?? 0));
}

export function DashboardGrid({ dashboard, ctx }: { dashboard: Dashboard; ctx: WidgetContext }) {
  const auto = dashboard.widgets.length === 0;
  useTick(auto ? 1 : 0.01);
  const names = ctx.session.store.names();
  const key = names.join('|');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const widgets = useMemo(() => inReadingOrder(auto ? autoWidgets(names, dashboard.source.timestamp?.field) : dashboard.widgets), [auto, dashboard, key]);
  return (
    <div className="grid" style={{ ['--cols' as string]: dashboard.options.columns }}>
      {widgets.map((w, i) => {
        const def = getWidgetDefinition(w.type);
        const Component = def.component as React.ComponentType<{ config: WidgetConfig; ctx: WidgetContext }>;
        const title = w.title ?? ('signal' in w ? ctx.label(w.signal) : def.type);
        const style = {
          gridColumn: w.x !== undefined ? `${w.x + 1} / span ${w.w}` : `span ${w.w}`,
          gridRow: w.y !== undefined ? `${w.y + 1} / span ${w.h}` : `span ${w.h}`,
          // read by the phone layout, which ignores x/y and stacks widgets in reading order
          '--h': w.h,
        } as React.CSSProperties;
        return (
          <section key={w.id ?? `${w.type}-${i}`} className={`widget widget--${w.type}`} style={style} data-widget={w.type} data-widget-id={w.id ?? ''}>
            <header className="widget__title">{title}</header>
            <div className="widget__body">
              <Suspense fallback={<div className="muted small" style={{ padding: 10 }}>Loading…</div>}>
                <Component config={w} ctx={ctx} />
              </Suspense>
            </div>
          </section>
        );
      })}
    </div>
  );
}
