import { useEffect, useReducer, useRef, useState } from 'react';
import type { Session } from './session';

/** Re-render whenever the session's status/counters change. */
export function useSessionChanged(session: Session): number {
  const [n, bump] = useReducer((x: number) => x + 1, 0);
  useEffect(() => session.changed.on(bump), [session]);
  return n;
}

/** Re-render at most `hz` times per second while mounted (for widgets that poll the store). */
export function useTick(hz = 10): number {
  const [n, bump] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    const id = setInterval(bump, 1000 / hz);
    return () => clearInterval(id);
  }, [hz]);
  return n;
}

/** Latest value of a signal, refreshed at `hz`. */
export function useLatest(session: Session, signal: string, hz = 10): { t: number; v: number } | undefined {
  useTick(hz);
  return session.store.latest(signal);
}

/** Observe an element's size. */
export function useElementSize<T extends HTMLElement>(): [React.RefObject<T | null>, { width: number; height: number }] {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setSize((s) => (s.width === width && s.height === height ? s : { width, height }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size];
}
