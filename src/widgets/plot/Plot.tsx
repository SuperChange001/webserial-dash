import { useEffect, useRef } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import { useElementSize } from '@/app/hooks';
import type { WidgetConfigOf } from '../schemas';
import type { WidgetProps } from '../types';

/** Streaming line chart on uPlot. Data is rebuilt from the store once per animation frame. */
export function PlotWidget({ config, ctx }: WidgetProps<WidgetConfigOf<'plot'>>) {
  const [hostRef, size] = useElementSize<HTMLDivElement>();
  const plotRef = useRef<uPlot | null>(null);
  const windowSec = config.timeWindowSec ?? ctx.dashboard.options.timeWindowSec;

  useEffect(() => {
    const host = hostRef.current;
    if (!host || size.width === 0) return;
    const indexMode = config.xAxis === 'index';
    const showPoints = config.points ?? indexMode;
    const opts: uPlot.Options = {
      width: size.width,
      height: Math.max(80, size.height),
      ms: 1,
      pxAlign: 0,
      cursor: { drag: { x: false, y: false } },
      legend: { show: config.legend },
      scales: {
        x: indexMode ? { time: false, range: (_u, min, max) => [Math.min(0.5, min), Math.max(max + 0.5, 5.5)] } : { time: true },
        // Keep auto-ranging on and pin only the bounds that are configured (yMin alone is common).
        y: {
          auto: true,
          range: (_u, min, max) => {
            const lo = config.yMin ?? min;
            const hi = config.yMax ?? max;
            return lo === hi ? [lo - 1, hi + 1] : [lo, hi];
          },
        },
      },
      axes: [
        {
          stroke: '#94a3b8',
          grid: { stroke: '#1e293b' },
          ticks: { stroke: '#1e293b' },
          ...(indexMode ? { incrs: [1, 2, 5, 10, 20, 50], values: (_u: uPlot, v: number[]) => v.map((x) => `#${x}`) } : {}),
        },
        { stroke: '#94a3b8', grid: { stroke: '#1e293b' }, ticks: { stroke: '#1e293b' }, size: 56 },
      ],
      series: [
        { label: 't' },
        ...config.signals.map((s) => ({
          label: ctx.label(s) + (ctx.meta(s)?.unit ? ` (${ctx.meta(s)!.unit})` : ''),
          stroke: ctx.color(s),
          width: 1.5,
          spanGaps: true,
          points: { show: showPoints, size: 6, fill: ctx.color(s) },
          value: (_u: uPlot, v: number | null) => (v == null ? '—' : ctx.format(s, v)),
        })),
      ],
    };
    const u = new uPlot(opts, [[], ...config.signals.map(() => [])], host);
    plotRef.current = u;
    let raf = 0;
    const store = () => ctx.session.store;
    const render = () => {
      const now = Date.now();
      if (indexMode) {
        // Align series at their newest sample; x = 1..n.
        const cols = config.signals.map((sig) => Array.from(store().series(sig).v).slice(-config.maxPoints));
        const n = Math.max(1, ...cols.map((c) => c.length));
        const x = Array.from({ length: n }, (_, i) => i + 1);
        const ys = cols.map((c) => [...Array<null>(n - c.length).fill(null), ...c]);
        u.setData([x, ...ys] as uPlot.AlignedData, true);
      } else {
        const since = now - windowSec * 1000;
        const tables = config.signals.map((sig) => {
          const { t, v } = store().series(sig, since);
          return [Array.from(t), Array.from(v)] as uPlot.AlignedData;
        });
        const joined = tables.length === 1 ? tables[0]! : uPlot.join(tables);
        u.setData(joined, false);
        u.setScale('x', { min: since, max: now });
      }
      raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(raf);
      u.destroy();
      plotRef.current = null;
    };
    // size handled separately to avoid recreating the chart on every resize
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, ctx, windowSec, size.width === 0]);

  useEffect(() => {
    plotRef.current?.setSize({ width: size.width, height: Math.max(80, size.height) });
  }, [size]);

  return <div ref={hostRef} className="w-plot" data-signals={config.signals.join(',')} />;
}
