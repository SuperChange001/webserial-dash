import { useLatest } from '@/app/hooks';
import { thresholdColor } from '../base-schema';
import type { WidgetConfigOf } from '../schemas';
import type { WidgetProps } from '../types';

const R = 44;
const CIRC = Math.PI * R; // half circle

export function GaugeWidget({ config, ctx }: WidgetProps<WidgetConfigOf<'gauge'>>) {
  const latest = useLatest(ctx.session, config.signal);
  const v = latest?.v;
  const frac = v === undefined ? 0 : Math.min(1, Math.max(0, (v - config.min) / (config.max - config.min || 1)));
  const color = v === undefined ? 'var(--muted)' : thresholdColor(v, config.thresholds, ctx.color(config.signal));
  const sorted = [...(config.thresholds ?? [])].sort((a, b) => a.value - b.value);
  return (
    <div className="w-gauge" data-signal={config.signal}>
      <svg viewBox="0 0 100 58" className="w-gauge__svg">
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
          {v === undefined ? '—' : ctx.format(config.signal, v, { decimals: config.decimals, unit: config.unit })}
        </text>
        <text x="6" y="57" fontSize="6" fill="var(--muted)">{config.min}</text>
        <text x="94" y="57" fontSize="6" fill="var(--muted)" textAnchor="end">{config.max}</text>
      </svg>
    </div>
  );
}
