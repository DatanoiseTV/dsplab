import { useState, useEffect, useCallback } from 'react';

const REPO = 'DatanoiseTV/dsplab-projects';
const TREE_URL = `/api/github/repos/${REPO}/git/trees/main?recursive=1`;
const CACHE_TTL = 60_000;

export interface CommunityPreset {
  name: string;    // display name (filename without .vult, underscores/dashes -> spaces)
  path: string;    // full path in repo e.g. "DatanoiseTV/ladder_filter.vult"
  author: string;  // top-level folder name
}

export interface CommunityModule {
  name: string;    // display name
  path: string;    // full path e.g. "modules/DatanoiseTV/adsr.vult"
  author: string;  // second-level folder inside modules/
}

export interface AuthorGroup {
  author: string;
  presets: CommunityPreset[];
}

export interface ModuleAuthorGroup {
  author: string;
  modules: CommunityModule[];
}

interface CacheEntry {
  groups: AuthorGroup[];
  moduleGroups: ModuleAuthorGroup[];
  ts: number;
}

let moduleCache: CacheEntry | null = null;
let inflight: Promise<CacheEntry> | null = null;

async function fetchAll(): Promise<CacheEntry> {
  if (moduleCache && Date.now() - moduleCache.ts < CACHE_TTL) return moduleCache;
  if (inflight) return inflight;

  inflight = (async () => {
    const res = await fetch(TREE_URL);
    if (!res.ok) throw new Error(`GitHub API ${res.status}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    const tree: { type: string; path: string }[] = data.tree || [];
    const vultFiles = tree.filter(e => e.type === 'blob' && e.path.endsWith('.vult'));

    // --- presets: top-level <author>/<name>.vult (not under modules/)
    const presetMap = new Map<string, CommunityPreset[]>();
    // --- modules: modules/<author>/<name>.vult
    const modMap = new Map<string, CommunityModule[]>();

    for (const entry of vultFiles) {
      const parts = entry.path.split('/');
      if (parts[0] === 'modules') {
        // modules/<author>/<name>.vult — need at least 3 parts
        if (parts.length < 3) continue;
        const author = parts[1];
        const filename = parts[parts.length - 1];
        const name = filename.replace(/\.vult$/, '').replace(/[_-]/g, ' ');
        if (!modMap.has(author)) modMap.set(author, []);
        modMap.get(author)!.push({ name, path: entry.path, author });
      } else {
        // top-level preset: <author>/<name>.vult
        const author = parts.length >= 2 ? parts[0] : 'community';
        const filename = parts[parts.length - 1];
        const name = filename.replace(/\.vult$/, '').replace(/[_-]/g, ' ');
        if (!presetMap.has(author)) presetMap.set(author, []);
        presetMap.get(author)!.push({ name, path: entry.path, author });
      }
    }

    const groups: AuthorGroup[] = Array.from(presetMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([author, presets]) => ({ author, presets }));

    const moduleGroups: ModuleAuthorGroup[] = Array.from(modMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([author, modules]) => ({ author, modules }));

    const entry: CacheEntry = { groups, moduleGroups, ts: Date.now() };
    moduleCache = entry;
    inflight = null;
    return entry;
  })();

  return inflight;
}

export async function loadRepoFile(path: string): Promise<string> {
  const res = await fetch(`/api/github/repos/${REPO}/contents/${path}`);
  if (!res.ok) throw new Error(`GitHub API ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return atob(data.content.replace(/\n/g, ''));
}

// Keep backwards-compat alias
export const loadPresetCode = loadRepoFile;

export function useCommunityPresets() {
  const [groups, setGroups] = useState<AuthorGroup[]>(moduleCache?.groups ?? []);
  const [moduleGroups, setModuleGroups] = useState<ModuleAuthorGroup[]>(moduleCache?.moduleGroups ?? []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetched, setLastFetched] = useState<Date | null>(
    moduleCache ? new Date(moduleCache.ts) : null
  );

  const refresh = useCallback(async () => {
    moduleCache = null;
    inflight = null;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchAll();
      setGroups(result.groups);
      setModuleGroups(result.moduleGroups);
      setLastFetched(new Date());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load community presets');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (moduleCache && Date.now() - moduleCache.ts < CACHE_TTL) {
      setGroups(moduleCache.groups);
      setModuleGroups(moduleCache.moduleGroups);
      setLastFetched(new Date(moduleCache.ts));
      return;
    }
    setLoading(true);
    fetchAll()
      .then(result => {
        setGroups(result.groups);
        setModuleGroups(result.moduleGroups);
        setLastFetched(new Date());
      })
      .catch(e => setError(e instanceof Error ? e.message : 'Failed'))
      .finally(() => setLoading(false));
  }, []);

  return { groups, moduleGroups, loading, error, lastFetched, refresh };
}
