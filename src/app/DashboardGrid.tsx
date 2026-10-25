import { Suspense, useMemo } from 'react';
import type { Dashboard } from '@/config/schema';
import { getWidgetDefinition } from '@/widgets/registry';
import type { WidgetConfig } from '@/widgets/schemas';
import type { WidgetContext } from '@/widgets/types';
import { useTick } from './hooks';

/** When a dashboard has no widgets, show everything the parser discovers. */
function autoWidgets(names: string[]): WidgetConfig[] {
  const widgets: WidgetConfig[] = [];
  if (names.length) {
    widgets.push({ type: 'plot', title: 'All signals', signals: names, legend: true, w: 12, h: 4 });
    widgets.push({ type: 'table', title: 'Signals', signals: [], stats: true, w: 6, h: 3 });
  }
  widgets.push({ type: 'log', title: 'Frames', maxLines: 500, timestamps: true, w: names.length ? 6 : 12, h: 3 });
  widgets.push({ type: 'terminal', localEcho: false, lineEnding: '\\n', convertEol: true, fontSize: 13, scrollback: 5000, w: 12, h: 4 });
  return widgets;
}

export function DashboardGrid({ dashboard, ctx }: { dashboard: Dashboard; ctx: WidgetContext }) {
  const auto = dashboard.widgets.length === 0;
  useTick(auto ? 1 : 0.01);
  const names = ctx.session.store.names();
  const key = names.join('|');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const widgets = useMemo(() => (auto ? autoWidgets(names) : dashboard.widgets), [auto, dashboard, key]);
  return (
    <div className="grid" style={{ ['--cols' as string]: dashboard.options.columns }}>
      {widgets.map((w, i) => {
        const def = getWidgetDefinition(w.type);
        const Component = def.component as React.ComponentType<{ config: WidgetConfig; ctx: WidgetContext }>;
        const title = w.title ?? ('signal' in w ? ctx.label(w.signal) : def.type);
        const style: React.CSSProperties = {
          gridColumn: w.x !== undefined ? `${w.x + 1} / span ${w.w}` : `span ${w.w}`,
          gridRow: w.y !== undefined ? `${w.y + 1} / span ${w.h}` : `span ${w.h}`,
        };
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
