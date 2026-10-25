import type { Dashboard, SignalMeta } from '@/config/schema';
import type { WidgetContext } from '@/widgets/types';
import type { Session } from './session';

/** Brand-neutral categorical palette; signals without meta.color cycle through it. */
export const PALETTE = ['#38bdf8', '#f97316', '#a3e635', '#e879f9', '#facc15', '#2dd4bf', '#fb7185', '#c084fc', '#4ade80', '#f59e0b'];

export function createWidgetContext(session: Session, dashboard: Dashboard): WidgetContext {
  const colorCache = new Map<string, string>();
  const meta = (s: string): SignalMeta | undefined => dashboard.signals[s];
  return {
    session,
    dashboard,
    meta,
    label: (s) => meta(s)?.label ?? s,
    color: (s) => {
      const m = meta(s)?.color;
      if (m) return m;
      let c = colorCache.get(s);
      if (!c) {
        c = PALETTE[colorCache.size % PALETTE.length]!;
        colorCache.set(s, c);
      }
      return c;
    },
    format: (s, value, opts) => {
      const m = meta(s);
      const decimals = opts?.decimals ?? m?.decimals;
      const unit = opts?.unit ?? m?.unit ?? '';
      // Undeclared signals: show what the device sent, capped at 3 decimals.
      const text = decimals === undefined ? String(Math.round(value * 1000) / 1000) : value.toFixed(decimals);
      return `${text}${unit ? ` ${unit}` : ''}`;
    },
  };
}
