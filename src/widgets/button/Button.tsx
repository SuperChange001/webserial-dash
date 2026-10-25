import { useState } from 'react';
import { useSessionChanged } from '@/app/hooks';
import type { Session } from '@/app/session';
import type { WidgetConfigOf } from '../schemas';
import type { WidgetProps } from '../types';

type Action = WidgetConfigOf<'button'>['actions'][number];

async function runLocal(session: Session, local: NonNullable<Action['local']>) {
  switch (local) {
    case 'clearData':
      session.clearData();
      break;
    case 'resetDevice':
      await session.resetDevice();
      break;
    case 'recordStart':
      session.logger.start();
      session.changed.emit();
      break;
    case 'recordStop':
      session.logger.stop();
      session.changed.emit();
      break;
  }
}

export function ButtonWidget({ config, ctx }: WidgetProps<WidgetConfigOf<'button'>>) {
  useSessionChanged(ctx.session);
  const [err, setErr] = useState<string | null>(null);
  const run = async (a: Action) => {
    if (a.confirm && !window.confirm(a.confirm)) return;
    if (a.local) await runLocal(ctx.session, a.local);
    if (a.send !== undefined) await ctx.session.send(a.send, config.lineEnding);
  };
  return (
    <div className="w-buttons">
      {config.actions.map((a, i) => (
        <button
          key={i}
          className="btn"
          style={a.color ? { background: a.color } : undefined}
          // local-only actions (e.g. Clear data) work while disconnected
          disabled={a.send !== undefined && !ctx.session.connected}
          onClick={() => run(a).then(() => setErr(null), (e: Error) => setErr(e.message))}
        >
          {a.label}
        </button>
      ))}
      {err && <div className="error small">{err}</div>}
    </div>
  );
}
