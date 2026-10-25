import { useLatest } from '@/app/hooks';
import { thresholdColor } from '../base-schema';
import type { WidgetConfigOf } from '../schemas';
import type { WidgetProps } from '../types';

const R = 44;
const CIRC = Math.PI * R; // half circle

export function GaugeWidget({ config, ctx }: WidgetProps<WidgetConfigOf<'gauge'>>) {
  const latest = useLatest(ctx.session, config.signal);
  const v = latest?.v;
  const toFrac = (x: number) => Math.min(1, Math.max(0, (x - config.min) / (config.max - config.min || 1)));
  const frac = v === undefined ? 0 : toFrac(v);
  const unit = config.unit ?? ctx.meta(config.signal)?.unit ?? '';
  const stats = config.showMinMax ? ctx.session.store.getStats(config.signal) : undefined;
  /** Point on the arc (centre 50,50, radius 44) for a 0..1 fraction, pushed outward by `r`. */
  const arcPoint = (f: number, r: number) => {
    const a = Math.PI * (1 - f);
    return { x: 50 + r * Math.cos(a), y: 50 - r * Math.sin(a) };
  };
  const marker = (x: number, color: string, key: string) => {
    const p1 = arcPoint(toFrac(x), 37);
    const p2 = arcPoint(toFrac(x), 51);
    return <line key={key} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={color} strokeWidth="1.6" strokeLinecap="round" />;
  };
  const color = v === undefined ? 'var(--muted)' : thresholdColor(v, config.thresholds, ctx.color(config.signal));
  const sorted = [...(config.thresholds ?? [])].sort((a, b) => a.value - b.value);
  return (
    <div className="w-gauge" data-signal={config.signal}>
      <svg viewBox="0 -3 100 61" className="w-gauge__svg">
        <path d="M6 50 A44 44 0 0 1 94 50" fill="none" stroke="var(--track)" strokeWidth="10" strokeLinecap="round" />
        {sorted.map((t, i) => {
          const start = Math.min(1, Math.max(0, (t.value - config.min) / (config.max - config.min || 1)));
          const end = i + 1 < sorted.length ? Math.min(1, Math.max(0, (sorted[i + 1]!.value - config.min) / (config.max - config.min || 1))) : 1;
          return (
            <path
              key={i}
              d="M6 50 A44 44 0 0 1 94 50"
              fill="none"
              stroke={t.color}
              strokeOpacity={0.35}
              strokeWidth="10"
              strokeDasharray={`${(end - start) * CIRC} ${CIRC}`}
              strokeDashoffset={-start * CIRC}
            />
          );
        })}
        <path
          d="M6 50 A44 44 0 0 1 94 50"
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${frac * CIRC} ${CIRC}`}
          style={{ transition: 'stroke-dasharray 120ms linear' }}
        />
        <text x="50" y="46" textAnchor="middle" className="w-gauge__value" fill="var(--fg)" data-testid={`gauge-${config.signal}`}>
          {v === undefined ? '—' : ctx.format(config.signal, v, { decimals: config.decimals, unit: '' })}
          {v !== undefined && unit && <tspan fontSize="6" fill="var(--muted)">{` ${unit}`}</tspan>}
        </text>
        {stats && marker(stats.min, '#38bdf8', 'min')}
        {stats && marker(stats.max, '#f97316', 'max')}
        <text x="6" y="57.5" fontSize="5" fill="var(--muted)" textAnchor="middle">{config.min}</text>
        <text x="94" y="57.5" fontSize="5" fill="var(--muted)" textAnchor="middle">{config.max}</text>
      </svg>
      {config.showMinMax && (
        <div className="w-gauge__minmax small" data-testid={`gauge-minmax-${config.signal}`}>
          <span style={{ color: '#38bdf8' }}>min {stats ? ctx.format(config.signal, stats.min, { decimals: config.decimals, unit: config.unit }) : '—'}</span>
          <span style={{ color: '#f97316' }}>max {stats ? ctx.format(config.signal, stats.max, { decimals: config.decimals, unit: config.unit }) : '—'}</span>
        </div>
      )}
    </div>
  );
}
