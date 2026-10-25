import { useEffect, useRef, useState } from 'react';
import type { FrameEvent } from '@/app/session';
import type { WidgetConfigOf } from '../schemas';
import type { WidgetProps } from '../types';

interface Line {
  id: number;
  t: number;
  text: string;
}

export function LogWidget({ config, ctx }: WidgetProps<WidgetConfigOf<'log'>>) {
  const [lines, setLines] = useState<Line[]>([]);
  const [paused, setPaused] = useState(false);
  const pending = useRef<Line[]>([]);
  const nextId = useRef(0);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const re = config.filter ? new RegExp(config.filter) : null;
    const off = ctx.session.frame.on((f: FrameEvent) => {
      if (re && !re.test(f.text)) return;
      pending.current.push({ id: nextId.current++, t: f.t, text: f.text });
    });
    const timer = setInterval(() => {
      if (paused || pending.current.length === 0) return;
      const add = pending.current;
      pending.current = [];
      setLines((prev) => {
        const next = prev.concat(add);
        return next.length > config.maxLines ? next.slice(next.length - config.maxLines) : next;
      });
    }, 100);
    return () => {
      off();
      clearInterval(timer);
    };
  }, [ctx.session, config.filter, config.maxLines, paused]);

  useEffect(() => {
    if (!paused) bottom.current?.scrollIntoView({ block: 'end' });
  }, [lines, paused]);

  return (
    <div className="w-log">
      <div className="w-log__bar">
        <button className="btn btn--small" onClick={() => setPaused((p) => !p)}>{paused ? 'Resume' : 'Pause'}</button>
        <button className="btn btn--small" onClick={() => setLines([])}>Clear</button>
        <span className="muted small">{lines.length} lines</span>
      </div>
      <div className="w-log__lines">
        {lines.map((l) => (
          <div key={l.id} className="w-log__line">
            {config.timestamps && <span className="w-log__ts">{new Date(l.t).toLocaleTimeString(undefined, { hour12: false })}.{String(l.t % 1000).padStart(3, '0')}</span>}
            <span>{l.text}</span>
          </div>
        ))}
        <div ref={bottom} />
      </div>
    </div>
  );
}
