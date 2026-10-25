import { useState } from 'react';
import { useSessionChanged } from '@/app/hooks';
import type { WidgetConfigOf } from '../schemas';
import type { WidgetProps } from '../types';

export function ButtonWidget({ config, ctx }: WidgetProps<WidgetConfigOf<'button'>>) {
  useSessionChanged(ctx.session);
  const [err, setErr] = useState<string | null>(null);
  const disabled = !ctx.session.connected;
  return (
    <div className="w-buttons">
      {config.actions.map((a, i) => (
        <button
          key={i}
          className="btn"
          style={a.color ? { background: a.color } : undefined}
          disabled={disabled}
          onClick={() => ctx.session.send(a.send, config.lineEnding).then(() => setErr(null), (e: Error) => setErr(e.message))}
        >
          {a.label}
        </button>
      ))}
      {err && <div className="error small">{err}</div>}
    </div>
  );
}
