import { useEffect, useMemo, useRef, useState } from 'react';
import {
  builtinDashboards,
  exportDashboardJson,
  importDashboardJson,
  lastDashboardId,
  loadUserDashboards,
  rememberLastDashboard,
  saveUserDashboards,
} from '@/config/dashboards';
import type { Dashboard } from '@/config/schema';
import { SimulatedTransport } from '@/core/transport';
import { unescapeString } from '@/core/bytes';
import { saveBlob } from '@/core/logger';
import { ConnectBar, hasWebSerial } from './ConnectBar';
import { DashboardGrid } from './DashboardGrid';
import { Session } from './session';
import { StatusBar } from './StatusBar';
import { createWidgetContext } from './widget-context';

function pickInitial(all: Dashboard[]): Dashboard {
  const params = new URLSearchParams(location.search);
  const wanted = params.get('dashboard') ?? lastDashboardId();
  return all.find((d) => d.id === wanted) ?? all[0]!;
}

export function App() {
  const [userDashboards, setUserDashboards] = useState<Dashboard[]>(() => loadUserDashboards());
  const all = useMemo(() => [...builtinDashboards, ...userDashboards], [userDashboards]);
  const [dashboard, setDashboard] = useState<Dashboard>(() => pickInitial(all));
  const [session] = useState(() => new Session(dashboard));
  const [importError, setImportError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (session.dashboard !== dashboard) session.setDashboard(dashboard);
    rememberLastDashboard(dashboard.id);
  }, [dashboard, session]);

  // ?demo auto-starts the simulated device (used by the GitHub Pages link and e2e tests).
  useEffect(() => {
    if (!new URLSearchParams(location.search).has('demo') || session.transport) return;
    const spec = dashboard.source.simulate;
    if (spec) void session.connect(new SimulatedTransport({ ...spec, lineEnding: unescapeString(spec.lineEnding) })).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ctx = useMemo(() => createWidgetContext(session, dashboard), [session, dashboard]);

  const select = (id: string) => {
    const d = all.find((x) => x.id === id);
    if (d) setDashboard(d);
  };

  const onImportFile = async (file: File) => {
    try {
      const d = importDashboardJson(await file.text());
      const next = [...userDashboards.filter((x) => x.id !== d.id), d];
      setUserDashboards(next);
      saveUserDashboards(next);
      setDashboard(d);
      setImportError(null);
    } catch (e) {
      setImportError((e as Error).message);
    }
  };

  const removeUser = () => {
    const next = userDashboards.filter((x) => x.id !== dashboard.id);
    setUserDashboards(next);
    saveUserDashboards(next);
    setDashboard(builtinDashboards[0]!);
  };

  const isUser = userDashboards.some((d) => d.id === dashboard.id);
  const onBaudChange = (baudRate: number) => setDashboard({ ...dashboard, source: { ...dashboard.source, baudRate } });

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" width={24} height={24} />
          <span>WebSerial Dash</span>
        </div>
        <label className="field">
          <span>Dashboard</span>
          <select value={dashboard.id} onChange={(e) => select(e.target.value)} data-testid="dashboard-select">
            <optgroup label="Built-in">
              {builtinDashboards.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </optgroup>
            {userDashboards.length > 0 && (
              <optgroup label="Imported">
                {userDashboards.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </optgroup>
            )}
          </select>
        </label>
        <button className="btn btn--small" onClick={() => fileInput.current?.click()}>Import JSON</button>
        <input ref={fileInput} type="file" accept="application/json,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void onImportFile(f); e.target.value = ''; }} />
        <button className="btn btn--small" onClick={() => saveBlob(new Blob([exportDashboardJson(dashboard)], { type: 'application/json' }), `${dashboard.id}.json`)}>Export JSON</button>
        {isUser && <button className="btn btn--small btn--danger" onClick={removeUser}>Remove</button>}
        <span className="spacer" />
        <ConnectBar session={session} dashboard={dashboard} onBaudChange={onBaudChange} />
      </header>
      {!hasWebSerial() && (
        <div className="banner">
          This browser has no Web Serial API. Use Chrome/Edge on desktop, or Chrome 148+ on Android. Demo mode still works.
        </div>
      )}
      {importError && <div className="banner banner--error"><pre>{importError}</pre><button className="btn btn--small" onClick={() => setImportError(null)}>Dismiss</button></div>}
      {dashboard.description && <p className="description">{dashboard.description}</p>}
      <main>
        <DashboardGrid key={dashboard.id} dashboard={dashboard} ctx={ctx} />
      </main>
      <StatusBar session={session} />
    </div>
  );
}
