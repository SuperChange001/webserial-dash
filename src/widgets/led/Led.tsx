import { useLatest } from '@/app/hooks';
import type { WidgetConfigOf } from '../schemas';
import type { WidgetProps } from '../types';

const OPS: Record<string, (a: number, b: number) => boolean> = {
  '>': (a, b) => a > b,
  '>=': (a, b) => a >= b,
  '<': (a, b) => a < b,
  '<=': (a, b) => a <= b,
  '==': (a, b) => a === b,
  '!=': (a, b) => a !== b,
};

export function LedWidget({ config, ctx }: WidgetProps<WidgetConfigOf<'led'>>) {
  const latest = useLatest(ctx.session, config.signal);
  const on = latest ? OPS[config.when.op]!(latest.v, config.when.value) : false;
  const label = on ? (config.onLabel ?? 'ON') : (config.offLabel ?? 'OFF');
  return (
    <div className="w-led" data-signal={config.signal} data-state={latest ? (on ? 'on' : 'off') : 'unknown'}>
      <span
        className="w-led__dot"
        style={{ background: on ? config.onColor : config.offColor, boxShadow: on ? `0 0 14px ${config.onColor}` : 'none' }}
      />
      <span className="w-led__label" data-testid={`led-${config.signal}`}>{latest ? label : '—'}</span>
    </div>
  );
}
