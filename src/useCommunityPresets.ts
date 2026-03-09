import { useState, useEffect, useCallback } from 'react';

const REPO = 'DatanoiseTV/dsplab-projects';
const TREE_URL = `/api/github/repos/${REPO}/git/trees/main?recursive=1`;
const CACHE_TTL = 60_000;

export interface CommunityPreset {
  name: string;    // display name (filename without .vult, underscores -> spaces)
  path: string;    // full path in repo e.g. "DatanoiseTV/ladder_filter.vult"
  author: string;  // top-level folder name
}

export interface AuthorGroup {
  author: string;
  presets: CommunityPreset[];
}

interface CacheEntry {
  groups: AuthorGroup[];
  ts: number;
}

// Module-level cache so all hook instances share the same data without refetching
let moduleCache: CacheEntry | null = null;
let inflight: Promise<AuthorGroup[]> | null = null;

async function fetchGroups(): Promise<AuthorGroup[]> {
  if (moduleCache && Date.now() - moduleCache.ts < CACHE_TTL) {
    return moduleCache.groups;
  }
  if (inflight) return inflight;

  inflight = (async () => {
    const res = await fetch(TREE_URL);
    if (!res.ok) throw new Error(`GitHub API ${res.status}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    const vultFiles = (data.tree || []).filter(
      (e: { type: string; path: string }) => e.type === 'blob' && e.path.endsWith('.vult')
    );

    const map = new Map<string, CommunityPreset[]>();
    for (const entry of vultFiles) {
      const parts: string[] = entry.path.split('/');
      const author = parts.length >= 2 ? parts[0] : 'community';
      const filename: string = parts[parts.length - 1];
      const name = filename.replace(/\.vult$/, '').replace(/[_-]/g, ' ');
      if (!map.has(author)) map.set(author, []);
      map.get(author)!.push({ name, path: entry.path, author });
    }

    const groups: AuthorGroup[] = Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([author, presets]) => ({ author, presets }));

    moduleCache = { groups, ts: Date.now() };
    inflight = null;
    return groups;
  })();

  return inflight;
}

export async function loadPresetCode(path: string): Promise<string> {
  const res = await fetch(`/api/github/repos/${REPO}/contents/${path}`);
  if (!res.ok) throw new Error(`GitHub API ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return atob(data.content.replace(/\n/g, ''));
}

export function useCommunityPresets() {
  const [groups, setGroups] = useState<AuthorGroup[]>(moduleCache?.groups ?? []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetched, setLastFetched] = useState<Date | null>(
    moduleCache ? new Date(moduleCache.ts) : null
  );

  const refresh = useCallback(async () => {
    // Bust the module cache so next fetch is fresh
    moduleCache = null;
    setLoading(true);
    setError(null);
    try {
      const g = await fetchGroups();
      setGroups(g);
      setLastFetched(new Date());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load community presets');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Only fetch if cache is stale or empty
    if (moduleCache && Date.now() - moduleCache.ts < CACHE_TTL) {
      setGroups(moduleCache.groups);
      setLastFetched(new Date(moduleCache.ts));
      return;
    }
    setLoading(true);
    fetchGroups()
      .then(g => {
        setGroups(g);
        setLastFetched(new Date());
      })
      .catch(e => setError(e instanceof Error ? e.message : 'Failed'))
      .finally(() => setLoading(false));
  }, []);

  return { groups, loading, error, lastFetched, refresh };
}
