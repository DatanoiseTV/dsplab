import { useState, useEffect, useCallback } from 'react';
import { apiUrl } from './utils/apiBase';

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
  name: string;
  path: string;
  author: string;
  meta: VultMeta | null;
}

export interface CommunityModule {
  name: string;
  path: string;
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

// Cache TTL matches the server-side poll interval (5 min)
const CACHE_TTL = 5 * 60 * 1000;

let moduleCache: CacheEntry | null = null;
let inflight: Promise<CacheEntry> | null = null;

// ── Helpers ───────────────────────────────────────────────────────────────────

function fallbackName(filePath: string): string {
  const filename = filePath.split('/').pop() ?? filePath;
  return filename.replace(/\.vult$/, '').replace(/[_-]/g, ' ');
}

// Fetch a single file from the local repo mirror — no rate limits, no auth needed
export async function loadRepoFile(filePath: string): Promise<string> {
  const res = await fetch(apiUrl(`/api/repo/file?path=${encodeURIComponent(filePath)}`));
  if (!res.ok) throw new Error(`repo file ${res.status}: ${filePath}`);
  return res.text();
}

export const loadPresetCode = loadRepoFile;

// ── Tree + meta fetch ─────────────────────────────────────────────────────────

async function fetchAll(): Promise<CacheEntry> {
  if (moduleCache && Date.now() - moduleCache.ts < CACHE_TTL) return moduleCache;
  if (inflight) return inflight;

  inflight = (async () => {
    // 1. Get the file tree from local mirror
    const treeRes = await fetch(apiUrl('/api/repo/tree'));
    if (!treeRes.ok) throw new Error(`repo tree ${treeRes.status}`);
    const treeData = await treeRes.json();

    const tree: { path: string; type: string }[] = treeData.tree ?? [];

    // Collect sets for quick lookup
    const metaPathSet = new Set(
      tree.filter(e => e.path.endsWith('.vult.meta')).map(e => e.path)
    );
    const vultFiles = tree.filter(
      e => e.path.endsWith('.vult') && !e.path.endsWith('.meta')
    );

    // 2. Fetch all meta files from local mirror in parallel — no rate limits
    const metaFetches = new Map<string, Promise<VultMeta | null>>();
    for (const entry of vultFiles) {
      const metaPath = entry.path + '.meta';
      if (metaPathSet.has(metaPath)) {
        metaFetches.set(entry.path, (async () => {
          try {
            const text = await loadRepoFile(metaPath);
            return JSON.parse(text) as VultMeta;
          } catch {
            return null;
          }
        })());
      }
    }

    // 3. Resolve everything concurrently
    const resolved = await Promise.all(
      vultFiles.map(async entry => ({
        path: entry.path,
        meta: metaFetches.has(entry.path) ? await metaFetches.get(entry.path)! : null,
      }))
    );

    // 4. Group into presets and modules
    const presetMap = new Map<string, CommunityPreset[]>();
    const modMap    = new Map<string, CommunityModule[]>();

    for (const { path: p, meta } of resolved) {
      const parts       = p.split('/');
      const displayName = meta?.name ?? fallbackName(p);

      if (parts[0] === 'modules') {
        if (parts.length < 3) continue;
        const author = parts[1];
        if (!modMap.has(author)) modMap.set(author, []);
        modMap.get(author)!.push({ name: displayName, path: p, author, meta });
      } else {
        const author = parts.length >= 2 ? parts[0] : 'community';
        if (!presetMap.has(author)) presetMap.set(author, []);
        presetMap.get(author)!.push({ name: displayName, path: p, author, meta });
      }
    }

    const groups: AuthorGroup[] = Array.from(presetMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([author, presets]) => ({
        author,
        presets: presets.sort((a, b) => a.name.localeCompare(b.name)),
      }));

    const moduleGroups: ModuleAuthorGroup[] = Array.from(modMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([author, modules]) => ({
        author,
        modules: modules.sort((a, b) => a.name.localeCompare(b.name)),
      }));

    const entry: CacheEntry = { groups, moduleGroups, ts: Date.now() };
    moduleCache = entry;
    inflight    = null;
    return entry;
  })();

  return inflight;
}

// ── Public trigger for manual refresh ────────────────────────────────────────

export async function triggerRepoRefresh(): Promise<void> {
  moduleCache = null;
  inflight    = null;
  await fetch(apiUrl('/api/repo/refresh'));
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useCommunityPresets() {
  const [groups,       setGroups]       = useState<AuthorGroup[]>(moduleCache?.groups ?? []);
  const [moduleGroups, setModuleGroups] = useState<ModuleAuthorGroup[]>(moduleCache?.moduleGroups ?? []);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState<string | null>(null);
  const [lastFetched,  setLastFetched]  = useState<Date | null>(
    moduleCache ? new Date(moduleCache.ts) : null
  );

  const load = useCallback(async (bust = false) => {
    if (bust) { moduleCache = null; inflight = null; }
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

  const refresh = useCallback(async () => {
    // Ask server to re-download from GitHub, then reload our cache
    await fetch(apiUrl('/api/repo/refresh'));
    await load(true);
  }, [load]);

  useEffect(() => {
    if (moduleCache && Date.now() - moduleCache.ts < CACHE_TTL) {
      setGroups(moduleCache.groups);
      setModuleGroups(moduleCache.moduleGroups);
      setLastFetched(new Date(moduleCache.ts));
      return;
    }
    load();
  }, [load]);

  return { groups, moduleGroups, loading, error, lastFetched, refresh };
}
