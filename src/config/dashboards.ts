import { formatIssues, safeParseDashboard, type Dashboard } from './schema';

/** Built-in dashboards: every JSON file in /dashboards, validated at startup. */
const modules = import.meta.glob('../../dashboards/*.json', { eager: true, import: 'default' }) as Record<string, unknown>;

export const builtinDashboards: Dashboard[] = Object.entries(modules)
  .map(([path, raw]) => {
    const r = safeParseDashboard(raw);
    if (!r.success) {
      console.error(`Invalid dashboard ${path}:\n${formatIssues(r.error).join('\n')}`);
      return null;
    }
    return r.data;
  })
  .filter((d): d is Dashboard => d !== null)
  .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));

const USER_KEY = 'wsd.userDashboards';
const LAST_KEY = 'wsd.lastDashboard';

export function loadUserDashboards(): Dashboard[] {
  try {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as unknown[];
    return list.map((d) => safeParseDashboard(d)).flatMap((r) => (r.success ? [r.data] : []));
  } catch {
    return [];
  }
}

export function saveUserDashboards(list: Dashboard[]): void {
  localStorage.setItem(USER_KEY, JSON.stringify(list));
}

export function rememberLastDashboard(id: string): void {
  localStorage.setItem(LAST_KEY, id);
}

export function lastDashboardId(): string | null {
  return localStorage.getItem(LAST_KEY);
}

/** Import JSON text (file or paste); throws with readable issues when invalid. */
export function importDashboardJson(text: string): Dashboard {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    throw new Error(`Not valid JSON: ${(e as Error).message}`);
  }
  const r = safeParseDashboard(raw);
  if (!r.success) throw new Error(formatIssues(r.error).join('\n'));
  return r.data;
}

/** Pretty JSON for export; the $schema path assumes the file is saved into dashboards/. */
export function exportDashboardJson(d: Dashboard): string {
  return JSON.stringify({ $schema: '../schema/dashboard.schema.json', ...d }, null, 2) + '\n';
}
