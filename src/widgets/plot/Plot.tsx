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
    const opts: uPlot.Options = {
      width: size.width,
      height: Math.max(80, size.height),
      ms: 1,
      pxAlign: 0,
      cursor: { drag: { x: false, y: false } },
      legend: { show: config.legend },
      scales: {
        x: { time: true },
        y: { auto: config.yMin === undefined && config.yMax === undefined, range: config.yMin !== undefined || config.yMax !== undefined ? (_u, min, max) => [config.yMin ?? min, config.yMax ?? max] : undefined },
      },
      axes: [
        { stroke: '#94a3b8', grid: { stroke: '#1e293b' }, ticks: { stroke: '#1e293b' } },
        { stroke: '#94a3b8', grid: { stroke: '#1e293b' }, ticks: { stroke: '#1e293b' }, size: 56 },
      ],
      series: [
        { label: 't' },
        ...config.signals.map((s) => ({
          label: ctx.label(s) + (ctx.meta(s)?.unit ? ` (${ctx.meta(s)!.unit})` : ''),
          stroke: ctx.color(s),
          width: 1.5,
          spanGaps: true,
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
      const since = now - windowSec * 1000;
      const tables = config.signals.map((s) => {
        const { t, v } = store().series(s, since);
        return [Array.from(t), Array.from(v)] as uPlot.AlignedData;
      });
      const joined = tables.length === 1 ? tables[0]! : uPlot.join(tables);
      u.setData(joined, false);
      u.setScale('x', { min: since, max: now });
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
