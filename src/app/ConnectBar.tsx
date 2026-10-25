import { useState } from 'react';
import type { Dashboard } from '@/config/schema';
import { SerialTransport, SimulatedTransport, type PortLike } from '@/core/transport';
import { unescapeString } from '@/core/bytes';
import { useSessionChanged } from './hooks';
import type { Session } from './session';

const BAUDS = [9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600, 1500000, 2000000];

export function hasWebSerial(): boolean {
  return typeof navigator !== 'undefined' && 'serial' in navigator;
}

export function ConnectBar({ session, dashboard, onBaudChange }: { session: Session; dashboard: Dashboard; onBaudChange: (b: number) => void }) {
  useSessionChanged(session);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const baud = dashboard.source.baudRate;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setErr(null);
    try {
      await fn();
    } catch (e) {
      const msg = (e as Error).message;
      if (!/No port selected/i.test(msg)) setErr(msg);
    } finally {
      setBusy(false);
    }
  };

  const connectSerial = () =>
    run(async () => {
      const filters = dashboard.source.filters;
      const port = (await navigator.serial.requestPort(filters.length ? { filters } : {})) as unknown as PortLike;
      await session.connect(new SerialTransport(port));
    });

  const connectDemo = () =>
    run(async () => {
      const spec = dashboard.source.simulate ?? {
        intervalMs: 200,
        format: 'csv' as const,
        lineEnding: '\\n',
        echo: true,
        signals: [{ name: 'demo', waveform: 'sine' as const, min: 0, max: 100, periodMs: 5000, decimals: 1 }],
      };
      await session.connect(new SimulatedTransport({ ...spec, lineEnding: unescapeString(spec.lineEnding) }));
    });

  const status = session.status;
  const connected = status === 'open';
  return (
    <div className="connectbar">
      <span className={`pill pill--${status}`} data-testid="status">{status === 'open' ? `connected · ${session.transport?.label ?? ''}` : status}</span>
      <label className="field">
        <span>Baud</span>
        <select value={baud} disabled={connected || busy} onChange={(e) => onBaudChange(Number(e.target.value))}>
          {(BAUDS.includes(baud) ? BAUDS : [...BAUDS, baud].sort((a, b) => a - b)).map((b) => (
            <option key={b} value={b}>{b}</option>
          ))}
        </select>
      </label>
      {!connected ? (
        <>
          <button className="btn btn--primary" onClick={connectSerial} disabled={busy || !hasWebSerial()} title={hasWebSerial() ? 'Pick a serial port' : 'Web Serial not available in this browser'} data-testid="connect">
            Connect
          </button>
          <button className="btn" onClick={connectDemo} disabled={busy} data-testid="demo">Demo</button>
        </>
      ) : (
        <>
          <button className="btn btn--danger" onClick={() => run(() => session.disconnect())} disabled={busy} data-testid="disconnect">Disconnect</button>
          {session.transport?.kind === 'serial' && (
            <>
              <label className="check" title="Data Terminal Ready"><input type="checkbox" checked={!!session.signals.dataTerminalReady} onChange={(e) => session.setSignals({ dataTerminalReady: e.target.checked })} />DTR</label>
              <label className="check" title="Request To Send"><input type="checkbox" checked={!!session.signals.requestToSend} onChange={(e) => session.setSignals({ requestToSend: e.target.checked })} />RTS</label>
              <button className="btn btn--small" onClick={() => run(() => session.resetDevice())} title="Pulse DTR/RTS like the Arduino IDE">Reset board</button>
            </>
          )}
        </>
      )}
      {session.error && status === 'error' && <span className="error small">{session.error.message}</span>}
      {err && <span className="error small">{err}</span>}
    </div>
  );
}
