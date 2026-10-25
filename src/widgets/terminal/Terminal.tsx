import { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { useSessionChanged } from '@/app/hooks';
import type { WidgetConfigOf } from '../schemas';
import type { WidgetProps } from '../types';

const ENDINGS: Record<string, string> = { '\\n': '\n', '\\r\\n': '\r\n', '\\r': '\r', '': '' };

/** Raw byte terminal (xterm.js) plus a line-oriented input box with history. */
export function TerminalWidget({ config, ctx }: WidgetProps<WidgetConfigOf<'terminal'>>) {
  useSessionChanged(ctx.session);
  const hostRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const [input, setInput] = useState('');
  const [ending, setEnding] = useState(config.lineEnding);
  const history = useRef<string[]>([]);
  const histIdx = useRef(-1);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const term = new Terminal({
      convertEol: config.convertEol,
      fontSize: config.fontSize,
      scrollback: config.scrollback,
      cursorBlink: false,
      disableStdin: false,
      theme: { background: '#020617', foreground: '#e2e8f0' },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host);
    fit.fit();
    termRef.current = term;
    const ro = new ResizeObserver(() => {
      try {
        fit.fit();
      } catch {
        /* host hidden */
      }
    });
    ro.observe(host);
    // Catch up on bytes that arrived before this (lazy-loaded) widget mounted.
    for (const chunk of ctx.session.recentRx()) term.write(chunk);
    const offRaw = ctx.session.raw.on((e) => {
      if (e.dir === 'rx') term.write(e.bytes);
    });
    const offKeys = term.onData((data) => {
      if (config.localEcho) term.write(data);
      ctx.session.sendBytes(new TextEncoder().encode(data)).catch(() => undefined);
    });
    return () => {
      offRaw();
      offKeys.dispose();
      ro.disconnect();
      term.dispose();
      termRef.current = null;
    };
  }, [ctx.session, config.convertEol, config.fontSize, config.scrollback, config.localEcho]);

  const submit = () => {
    const text = input;
    ctx.session.sendBytes(new TextEncoder().encode(text + (ENDINGS[ending] ?? '\n'))).catch(() => undefined);
    if (text) {
      history.current.unshift(text);
      history.current = history.current.slice(0, 50);
    }
    histIdx.current = -1;
    setInput('');
  };

  return (
    <div className="w-terminal">
      <div ref={hostRef} className="w-terminal__xterm" />
      <div className="w-terminal__input">
        <input
          value={input}
          placeholder={ctx.session.connected ? 'Type a line and press Enter' : 'Not connected'}
          disabled={!ctx.session.connected}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
            else if (e.key === 'ArrowUp') {
              histIdx.current = Math.min(histIdx.current + 1, history.current.length - 1);
              setInput(history.current[histIdx.current] ?? '');
            } else if (e.key === 'ArrowDown') {
              histIdx.current = Math.max(histIdx.current - 1, -1);
              setInput(histIdx.current < 0 ? '' : (history.current[histIdx.current] ?? ''));
            }
          }}
        />
        <select value={ending} onChange={(e) => setEnding(e.target.value as typeof ending)} title="Line ending">
          <option value="\n">LF</option>
          <option value="\r\n">CRLF</option>
          <option value="\r">CR</option>
          <option value="">None</option>
        </select>
        <button className="btn btn--small" disabled={!ctx.session.connected} onClick={submit}>Send</button>
        <button className="btn btn--small" onClick={() => termRef.current?.clear()}>Clear</button>
      </div>
    </div>
  );
}
