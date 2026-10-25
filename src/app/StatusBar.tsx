import { useEffect, useRef, useState } from 'react';
import { saveBlob, timestampForFilename } from '@/core/logger';
import { useSessionChanged, useTick } from './hooks';
import type { Session } from './session';

function fmtBytes(n: number): string {
  if (n < 1024) return `${Math.round(n)} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

export function StatusBar({ session }: { session: Session }) {
  useSessionChanged(session);
  useTick(2);
  const [rate, setRate] = useState({ bps: 0, fps: 0 });
  const last = useRef({ t: 0, rx: 0, frames: 0 });
  useEffect(() => {
    last.current = { t: Date.now(), rx: session.counters.rxBytes, frames: session.counters.frames };
    const id = setInterval(() => {
      const now = Date.now();
      const dt = (now - last.current.t) / 1000;
      const c = session.counters;
      setRate({ bps: (c.rxBytes - last.current.rx) / dt, fps: (c.frames - last.current.frames) / dt });
      last.current = { t: now, rx: c.rxBytes, frames: c.frames };
    }, 1000);
    return () => clearInterval(id);
  }, [session]);

  const log = session.logger;
  const stamp = () => `${session.dashboard.id}-${timestampForFilename()}`;
  return (
    <footer className="statusbar">
      <span data-testid="rx-bytes">RX {fmtBytes(session.counters.rxBytes)}</span>
      <span>{fmtBytes(Math.max(0, rate.bps))}/s</span>
      <span>{rate.fps.toFixed(0)} frames/s</span>
      <span data-testid="signal-count">{session.store.names().length} signals</span>
      <span className="spacer" />
      <span className={log.recording ? 'rec rec--on' : 'rec'}>{log.recording ? '● REC' : '○ idle'} {log.sampleCount.toLocaleString()} samples</span>
      {!log.recording ? (
        <button className="btn btn--small" onClick={() => { log.start(); session.changed.emit(); }} data-testid="rec-start">Record</button>
      ) : (
        <button className="btn btn--small" onClick={() => { log.stop(); session.changed.emit(); }} data-testid="rec-stop">Stop</button>
      )}
      <button className="btn btn--small" disabled={log.sampleCount === 0} onClick={() => saveBlob(new Blob([log.toCsv()], { type: 'text/csv' }), `${stamp()}.csv`)}>Export CSV</button>
      <button className="btn btn--small" disabled={log.rawByteCount === 0} onClick={() => saveBlob(new Blob([log.rawToBytes('rx') as BlobPart], { type: 'application/octet-stream' }), `${stamp()}.raw.txt`)}>Export raw</button>
      <button className="btn btn--small" onClick={() => session.clearData()}>Clear</button>
    </footer>
  );
}
