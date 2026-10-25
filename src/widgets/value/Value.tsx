import { useLatest } from '@/app/hooks';
import { thresholdColor } from '../base-schema';
import type { WidgetConfigOf } from '../schemas';
import type { WidgetProps } from '../types';

export function ValueWidget({ config, ctx }: WidgetProps<WidgetConfigOf<'value'>>) {
  const latest = useLatest(ctx.session, config.signal);
  const color = latest ? thresholdColor(latest.v, config.thresholds, ctx.color(config.signal)) : 'var(--muted)';
  return (
    <div className="w-value" data-signal={config.signal}>
      <div className="w-value__number" style={{ color }} data-testid={`value-${config.signal}`}>
        {latest ? ctx.format(config.signal, latest.v, { decimals: config.decimals, unit: config.unit }) : '—'}
      </div>
    </div>
  );
}
