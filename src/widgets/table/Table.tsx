import { useTick } from '@/app/hooks';
import type { WidgetConfigOf } from '../schemas';
import type { WidgetProps } from '../types';

export function TableWidget({ config, ctx }: WidgetProps<WidgetConfigOf<'table'>>) {
  useTick(5);
  const store = ctx.session.store;
  const names = config.signals.length ? config.signals : store.names();
  return (
    <div className="w-table">
      <table>
        <thead>
          <tr>
            <th>Signal</th>
            <th>Value</th>
            {config.stats && (
              <>
                <th>Min</th>
                <th>Max</th>
                <th>Mean</th>
                <th>N</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {names.length === 0 && (
            <tr>
              <td colSpan={6} className="muted">
                No data yet
              </td>
            </tr>
          )}
          {names.map((n) => {
            const st = store.getStats(n);
            return (
              <tr key={n} data-signal={n}>
                <td>
                  <span className="swatch" style={{ background: ctx.color(n) }} />
                  {ctx.label(n)}
                </td>
                <td className="num" data-testid={`table-${n}`}>{st ? ctx.format(n, st.last) : '—'}</td>
                {config.stats && (
                  <>
                    <td className="num">{st ? ctx.format(n, st.min) : ''}</td>
                    <td className="num">{st ? ctx.format(n, st.max) : ''}</td>
                    <td className="num">{st ? ctx.format(n, st.mean) : ''}</td>
                    <td className="num">{st?.count ?? ''}</td>
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
