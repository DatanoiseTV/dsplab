import { useState, useEffect, useCallback } from 'react';

const REPO = 'DatanoiseTV/dsplab-projects';
const TREE_URL = `/api/github/repos/${REPO}/git/trees/main?recursive=1`;
const CACHE_TTL = 60_000;

// ── Meta schema (schema_version: 1) ──────────────────────────────────────────

export interface MetaKnob {
  name: string;
  description?: string;
  default?: number;
  unit?: 'norm' | 'hz' | 'db' | 'semitone' | 'seconds' | 'percent' | 'custom';
}

export interface MetaFunction {
  name: string;
  signature: string;
  description?: string;
}

export interface VultMeta {
  schema_version: number;
  name: string;
  description: string;
  author: string;
  version: string;
  created_at: string;
  license: string;
  category: string;
  tags: string[];
  complexity: 'beginner' | 'intermediate' | 'advanced';
  type: 'preset' | 'module';
  /** Top-level grouping for presets: instrument | effect | utility */
  role?: 'instrument' | 'effect' | 'utility';
  inputs?: { audio?: boolean; midi?: boolean; cv?: boolean };
  knobs?: Record<string, MetaKnob>;
  functions?: MetaFunction[];
  min_dsplab_version?: string;
  preview_audio?: string | null;
  thumbnail?: string | null;
  dependencies?: string[];
}

// ── Entry types ───────────────────────────────────────────────────────────────

export interface CommunityPreset {
  name: string;      // from meta.name if available, else derived from filename
  path: string;      // full repo path, e.g. "DatanoiseTV/ladder_filter.vult"
  author: string;    // top-level folder name
  meta: VultMeta | null;
}

export interface CommunityModule {
  name: string;
  path: string;      // e.g. "modules/DatanoiseTV/adsr.vult"
  author: string;
  meta: VultMeta | null;
}

export interface AuthorGroup {
  author: string;
  presets: CommunityPreset[];
}

export interface ModuleAuthorGroup {
  author: string;
  modules: CommunityModule[];
}

// ── Cache ─────────────────────────────────────────────────────────────────────

interface CacheEntry {
  groups: AuthorGroup[];
  moduleGroups: ModuleAuthorGroup[];
  ts: number;
}

let moduleCache: CacheEntry | null = null;
let inflight: Promise<CacheEntry> | null = null;

// ── File loader ───────────────────────────────────────────────────────────────

async function fetchGitHubFile(path: string): Promise<string> {
  const res = await fetch(`/api/github/repos/${REPO}/contents/${path}`);
  if (!res.ok) throw new Error(`GitHub ${res.status}: ${path}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return atob(data.content.replace(/\n/g, ''));
}

async function fetchMeta(path: string): Promise<VultMeta | null> {
  try {
    const raw = await fetchGitHubFile(path + '.meta');
    return JSON.parse(raw) as VultMeta;
  } catch {
    return null;
  }
}

function fallbackName(path: string): string {
  const filename = path.split('/').pop() ?? path;
  return filename.replace(/\.vult$/, '').replace(/[_-]/g, ' ');
}

// ── Tree fetch ────────────────────────────────────────────────────────────────

async function fetchAll(): Promise<CacheEntry> {
  if (moduleCache && Date.now() - moduleCache.ts < CACHE_TTL) return moduleCache;
  if (inflight) return inflight;

  inflight = (async () => {
    const res = await fetch(TREE_URL);
    if (!res.ok) throw new Error(`GitHub API ${res.status}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    const tree: { type: string; path: string }[] = data.tree || [];

    // Collect .vult paths and the set of .meta paths for O(1) lookup
    const metaPaths = new Set(
      tree.filter(e => e.type === 'blob' && e.path.endsWith('.vult.meta')).map(e => e.path)
    );
    const vultFiles = tree.filter(
      e => e.type === 'blob' && e.path.endsWith('.vult') && !e.path.endsWith('.meta')
    );

    // Fetch all meta files in parallel (only those that exist)
    const metaFetches = new Map<string, Promise<VultMeta | null>>();
    for (const entry of vultFiles) {
      const metaPath = entry.path + '.meta';
      if (metaPaths.has(metaPath)) {
        metaFetches.set(entry.path, fetchMeta(entry.path));
      }
    }

    const presetMap = new Map<string, CommunityPreset[]>();
    const modMap = new Map<string, CommunityModule[]>();

    // Resolve all meta in parallel
    const resolved = await Promise.all(
      vultFiles.map(async entry => {
        const meta = metaFetches.has(entry.path)
          ? await metaFetches.get(entry.path)!
          : null;
        return { path: entry.path, meta };
      })
    );

    for (const { path, meta } of resolved) {
      const parts = path.split('/');
      const displayName = meta?.name ?? fallbackName(path);

      if (parts[0] === 'modules') {
        if (parts.length < 3) continue;
        const author = parts[1];
        if (!modMap.has(author)) modMap.set(author, []);
        modMap.get(author)!.push({ name: displayName, path, author, meta });
      } else {
        const author = parts.length >= 2 ? parts[0] : 'community';
        if (!presetMap.has(author)) presetMap.set(author, []);
        presetMap.get(author)!.push({ name: displayName, path, author, meta });
      }
    }

    const groups: AuthorGroup[] = Array.from(presetMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([author, presets]) => ({ author, presets: presets.sort((a, b) => a.name.localeCompare(b.name)) }));

    const moduleGroups: ModuleAuthorGroup[] = Array.from(modMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([author, modules]) => ({ author, modules: modules.sort((a, b) => a.name.localeCompare(b.name)) }));

    const entry: CacheEntry = { groups, moduleGroups, ts: Date.now() };
    moduleCache = entry;
    inflight = null;
    return entry;
  })();

  return inflight;
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function loadRepoFile(path: string): Promise<string> {
  return fetchGitHubFile(path);
}

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
