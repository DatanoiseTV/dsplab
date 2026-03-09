import { useState } from 'react';
import {
  RefreshCw, ChevronRight, ChevronDown, User, FileCode,
  AlertCircle, PlusSquare, Puzzle, Tag, Zap, BookOpen
} from 'lucide-react';
import { useCommunityPresets, loadRepoFile } from './useCommunityPresets';
import type { CommunityModule, CommunityPreset, VultMeta } from './useCommunityPresets';

type Tab = 'presets' | 'modules';

interface Props {
  onLoad: (code: string, name: string) => void;
  onInsert: (code: string) => void;
}

// ── Complexity pill ───────────────────────────────────────────────────────────

const COMPLEXITY_COLORS: Record<string, string> = {
  beginner:     '#22863a',
  intermediate: '#b08800',
  advanced:     '#cb2431',
};

function ComplexityBadge({ level }: { level?: string }) {
  if (!level) return null;
  return (
    <span style={{
      fontSize: '9px', fontWeight: 'bold', letterSpacing: '0.4px',
      textTransform: 'uppercase', padding: '1px 5px', borderRadius: '3px',
      background: COMPLEXITY_COLORS[level] ?? '#444',
      color: '#fff', flexShrink: 0,
    }}>{level}</span>
  );
}

// ── Role badge ────────────────────────────────────────────────────────────────

const ROLE_STYLE: Record<string, { bg: string; label: string }> = {
  instrument: { bg: '#1f4e79', label: 'Instrument' },
  effect:     { bg: '#2d4a1e', label: 'Effect'     },
  utility:    { bg: '#3a3020', label: 'Utility'    },
};

function RoleBadge({ role }: { role?: string }) {
  if (!role) return null;
  const s = ROLE_STYLE[role] ?? { bg: '#333', label: role };
  return (
    <span style={{
      fontSize: '9px', fontWeight: 'bold', letterSpacing: '0.5px',
      textTransform: 'uppercase', padding: '2px 6px', borderRadius: '3px',
      background: s.bg, color: '#cce4ff', flexShrink: 0,
      border: `1px solid ${s.bg}cc`,
    }}>{s.label}</span>
  );
}

// ── Category badge ────────────────────────────────────────────────────────────

const CATEGORY_COLORS: Record<string, string> = {
  synthesizer: '#1f6feb', drum:       '#8957e5', filter:    '#0075ca',
  effect:      '#0e6245', modulator:  '#9e6a03', utility:   '#444d56',
  oscillator:  '#1f6feb', envelope:   '#8957e5', math:      '#444d56',
};

function CategoryBadge({ category }: { category?: string }) {
  if (!category) return null;
  return (
    <span style={{
      fontSize: '9px', fontWeight: 'bold', letterSpacing: '0.4px',
      textTransform: 'uppercase', padding: '1px 5px', borderRadius: '3px',
      background: CATEGORY_COLORS[category] ?? '#333',
      color: '#fff', flexShrink: 0,
    }}>{category}</span>
  );
}

// ── Role section divider ──────────────────────────────────────────────────────

const ROLE_ORDER: Array<'instrument' | 'effect' | 'utility'> = ['instrument', 'effect', 'utility'];

function RoleDivider({ role }: { role: string }) {
  const s = ROLE_STYLE[role] ?? { bg: '#333', label: role };
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '8px',
      padding: '5px 14px 3px 28px', marginTop: '4px',
    }}>
      <span style={{
        fontSize: '9px', fontWeight: 'bold', letterSpacing: '1px',
        textTransform: 'uppercase', color: '#555',
      }}>{s.label}s</span>
      <div style={{ flex: 1, height: '1px', background: '#21262d' }} />
    </div>
  );
}

// ── Tag list ──────────────────────────────────────────────────────────────────

function TagList({ tags }: { tags?: string[] }) {
  if (!tags || tags.length === 0) return null;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px', marginTop: '4px' }}>
      {tags.slice(0, 6).map(t => (
        <span key={t} style={{
          fontSize: '9px', padding: '1px 5px', borderRadius: '3px',
          background: '#21262d', color: '#8b949e', border: '1px solid #30363d',
        }}>{t}</span>
      ))}
    </div>
  );
}

// ── Meta info block (description + knobs) ────────────────────────────────────

function PresetMetaBlock({ meta }: { meta: VultMeta }) {
  return (
    <div style={{ padding: '8px 12px 10px 32px', background: '#0d1117', borderBottom: '1px solid #21262d' }}>
      {meta.description && (
        <p style={{ margin: '0 0 6px', fontSize: '11px', color: '#8b949e', lineHeight: '1.5' }}>
          {meta.description}
        </p>
      )}
      {meta.knobs && Object.keys(meta.knobs).length > 0 && (
        <div style={{ marginTop: '6px' }}>
          <div style={{ fontSize: '9px', color: '#555', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>Knobs</div>
          {Object.entries(meta.knobs).map(([cc, k]) => (
            <div key={cc} style={{ display: 'flex', gap: '6px', fontSize: '10px', marginBottom: '2px' }}>
              <span style={{ color: '#ffcc00', fontFamily: 'monospace', minWidth: '20px' }}>CC{cc}</span>
              <span style={{ color: '#e6edf3', fontWeight: 'bold' }}>{k.name}</span>
              {k.description && <span style={{ color: '#8b949e' }}>— {k.description}</span>}
            </div>
          ))}
        </div>
      )}
      <TagList tags={meta.tags} />
    </div>
  );
}

function ModuleMetaBlock({ meta, code }: { meta: VultMeta; code: string }) {
  return (
    <div style={{ background: '#0d1117', border: '1px solid #1e2a3a', borderRadius: '4px', overflow: 'hidden', margin: '0 10px 8px 32px' }}>
      {meta.description && (
        <p style={{ margin: '8px 12px 6px', fontSize: '11px', color: '#8b949e', lineHeight: '1.5' }}>
          {meta.description}
        </p>
      )}
      {meta.functions && meta.functions.length > 0 && (
        <div style={{ padding: '0 12px 8px' }}>
          <div style={{ fontSize: '9px', color: '#555', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>Functions</div>
          {meta.functions.map(fn => (
            <div key={fn.name} style={{ marginBottom: '6px' }}>
              <code style={{ fontSize: '10px', color: '#7ec8ff', display: 'block', marginBottom: '2px' }}>{fn.signature}</code>
              {fn.description && <span style={{ fontSize: '10px', color: '#8b949e' }}>{fn.description}</span>}
            </div>
          ))}
        </div>
      )}
      <pre style={{
        margin: 0, padding: '10px 12px', fontSize: '11px', fontFamily: "'Fira Code', monospace",
        color: '#cdd9e5', overflowX: 'auto', maxHeight: '180px', overflowY: 'auto',
        lineHeight: '1.5', borderTop: '1px solid #1e2a3a', background: '#010409',
      }}>{code}</pre>
      <TagList tags={meta.tags} />
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

const CommunityPresets = ({ onLoad, onInsert }: Props) => {
  const { groups, moduleGroups, loading, error, lastFetched, refresh } = useCommunityPresets();
  const [tab, setTab] = useState<Tab>('presets');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [expandedMeta, setExpandedMeta] = useState<Set<string>>(new Set());
  const [loadingFile, setLoadingFile] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ module: CommunityModule; code: string } | null>(null);
  const [previewLoading, setPreviewLoading] = useState<string | null>(null);

  const toggleAuthor = (key: string) =>
    setExpanded(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });

  const toggleMeta = (path: string) =>
    setExpandedMeta(prev => { const n = new Set(prev); n.has(path) ? n.delete(path) : n.add(path); return n; });

  const handleLoadPreset = async (path: string, name: string) => {
    setLoadingFile(path);
    setLoadError(null);
    try {
      const code = await loadRepoFile(path);
      onLoad(code, name);
    } catch (e: unknown) {
      setLoadError('Failed to load: ' + (e instanceof Error ? e.message : ''));
    } finally {
      setLoadingFile(null);
    }
  };

  const handlePreviewModule = async (mod: CommunityModule) => {
    if (preview?.module.path === mod.path) { setPreview(null); return; }
    setPreviewLoading(mod.path);
    try {
      const code = await loadRepoFile(mod.path);
      setPreview({ module: mod, code });
    } catch (e: unknown) {
      setLoadError('Failed to load module: ' + (e instanceof Error ? e.message : ''));
    } finally {
      setPreviewLoading(null);
    }
  };

  const handleInsert = () => {
    if (!preview) return;
    onInsert(preview.code);
    setPreview(null);
  };

  const formatTime = (d: Date) => {
    const diff = Math.floor((Date.now() - d.getTime()) / 1000);
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return d.toLocaleTimeString();
  };

  const displayError = loadError || error;

  const tabStyle = (t: Tab) => ({
    flex: 1, padding: '6px 0', fontSize: '10px', fontWeight: 'bold' as const,
    letterSpacing: '0.8px', textTransform: 'uppercase' as const, cursor: 'pointer',
    background: 'none', border: 'none',
    borderBottom: tab === t ? '2px solid #ffcc00' : '2px solid transparent',
    color: tab === t ? '#ffcc00' : '#555', transition: 'color 0.15s',
  });

  // ── Preset row ──────────────────────────────────────────────────────────────

  const renderPreset = (preset: CommunityPreset) => {
    const isLoading = loadingFile === preset.path;
    const metaOpen  = expandedMeta.has(preset.path);
    const hasMeta   = preset.meta !== null;

    return (
      <div key={preset.path}>
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '6px 12px 6px 28px',
            cursor: isLoading ? 'wait' : 'pointer',
            color: '#aaa', borderLeft: '2px solid transparent',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = '#161b22')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          {/* Meta toggle */}
          {hasMeta ? (
            <span onClick={() => toggleMeta(preset.path)} style={{ flexShrink: 0, cursor: 'pointer', color: '#555', display: 'flex' }}>
              {metaOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
            </span>
          ) : (
            <span style={{ width: 11, flexShrink: 0 }} />
          )}

          {isLoading
            ? <RefreshCw size={12} color="#555" style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }} />
            : <FileCode size={12} color="#555" style={{ flexShrink: 0 }} />
          }

          {/* Name + badges */}
          <span
            onClick={() => !isLoading && handleLoadPreset(preset.path, preset.name)}
            style={{ fontSize: '12px', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >{preset.name}</span>

          {preset.meta && <CategoryBadge category={preset.meta.category} />}
          {preset.meta && <ComplexityBadge level={preset.meta.complexity} />}
          {preset.meta?.role && <RoleBadge role={preset.meta.role} />}

          <BookOpen
            size={11} color="#333"
            style={{ flexShrink: 0, cursor: 'pointer' }}
            onClick={() => !isLoading && handleLoadPreset(preset.path, preset.name)}
          />
        </div>

        {metaOpen && preset.meta && <PresetMetaBlock meta={preset.meta} />}
      </div>
    );
  };

  // ── Module row ──────────────────────────────────────────────────────────────

  const renderModule = (mod: CommunityModule) => {
    const isSelected = preview?.module.path === mod.path;
    const isLoading  = previewLoading === mod.path;

    return (
      <div key={mod.path}>
        <div
          onClick={() => !isLoading && handlePreviewModule(mod)}
          style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '6px 12px 6px 32px', cursor: isLoading ? 'wait' : 'pointer',
            background: isSelected ? '#1a1f2e' : 'transparent',
            color: isSelected ? '#7ec8ff' : '#aaa',
            borderLeft: isSelected ? '2px solid #7ec8ff' : '2px solid transparent',
          }}
          onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = '#161b22'; }}
          onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
        >
          {isLoading
            ? <RefreshCw size={12} color="#555" style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }} />
            : <Puzzle size={12} color={isSelected ? '#7ec8ff' : '#555'} style={{ flexShrink: 0 }} />
          }
          <span style={{ fontSize: '12px', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {mod.name}
          </span>
          {mod.meta && <CategoryBadge category={mod.meta.category} />}
          {mod.meta && <ComplexityBadge level={mod.meta.complexity} />}
          {isSelected && <ChevronDown size={11} color="#7ec8ff" />}
        </div>

        {isSelected && preview && (
          <div style={{ margin: '0 10px 8px 32px' }}>
            {preview.module.meta
              ? <ModuleMetaBlock meta={preview.module.meta} code={preview.code} />
              : (
                <div style={{ background: '#0d1117', border: '1px solid #1e2a3a', borderRadius: '4px', overflow: 'hidden' }}>
                  <pre style={{
                    margin: 0, padding: '10px 12px', fontSize: '11px', fontFamily: "'Fira Code', monospace",
                    color: '#cdd9e5', overflowX: 'auto', maxHeight: '200px', overflowY: 'auto', lineHeight: '1.5',
                  }}>{preview.code}</pre>
                </div>
              )
            }
            <div style={{ padding: '6px 0 2px', display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={handleInsert} style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                background: '#7ec8ff', color: '#000', border: 'none', borderRadius: '3px',
                padding: '5px 10px', fontSize: '10px', fontWeight: 'bold',
                letterSpacing: '0.5px', textTransform: 'uppercase', cursor: 'pointer',
              }}>
                <PlusSquare size={12} /> Insert at cursor
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px 0', flexShrink: 0 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <span style={{ color: '#ffcc00', fontSize: '11px', fontWeight: 'bold', letterSpacing: '1px', textTransform: 'uppercase' }}>Community</span>
          {lastFetched && <span style={{ color: '#444', fontSize: '10px' }}>Updated {formatTime(lastFetched)}</span>}
        </div>
        <button onClick={refresh} disabled={loading} title="Refresh" style={{
          background: 'none', border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
          color: '#555', padding: '4px', display: 'flex', alignItems: 'center',
        }}>
          <RefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid #21262d', flexShrink: 0, marginTop: '8px' }}>
        <button style={tabStyle('presets')} onClick={() => setTab('presets')}>Presets</button>
        <button style={tabStyle('modules')} onClick={() => setTab('modules')}>Modules</button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
        {displayError && (
          <div style={{
            display: 'flex', alignItems: 'flex-start', gap: '8px',
            margin: '10px 12px', padding: '10px', borderRadius: '4px',
            background: '#2a1515', border: '1px solid #5a2020', color: '#ff6666', fontSize: '12px',
          }}>
            <AlertCircle size={14} style={{ flexShrink: 0, marginTop: '1px' }} />
            <span style={{ flex: 1, wordBreak: 'break-word' }}>{displayError}</span>
            <span style={{ cursor: 'pointer' }} onClick={() => setLoadError(null)}>×</span>
          </div>
        )}

        {loading && groups.length === 0 && moduleGroups.length === 0 && (
          <div style={{ padding: '20px 14px', color: '#444', fontSize: '12px', textAlign: 'center' }}>Loading...</div>
        )}

        {/* ── PRESETS ── */}
        {tab === 'presets' && groups.map(group => {
          // Split presets by role; preserve ROLE_ORDER for consistent display
          const byRole = new Map<string, CommunityPreset[]>();
          for (const p of group.presets) {
            const r = p.meta?.role ?? 'effect';
            if (!byRole.has(r)) byRole.set(r, []);
            byRole.get(r)!.push(p);
          }
          const rolesPresent = ROLE_ORDER.filter(r => byRole.has(r));
          const showDividers = rolesPresent.length > 1;

          return (
            <div key={group.author}>
              <div onClick={() => toggleAuthor('p:' + group.author)} style={{
                display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 14px',
                cursor: 'pointer', userSelect: 'none',
                color: expanded.has('p:' + group.author) ? '#e6edf3' : '#8b949e',
                background: expanded.has('p:' + group.author) ? '#161b22' : 'transparent',
              }}>
                {expanded.has('p:' + group.author) ? <ChevronDown size={12} color="#555" /> : <ChevronRight size={12} color="#555" />}
                <User size={12} color="#ffcc00" />
                <span style={{ fontSize: '12px', fontWeight: 'bold', flex: 1 }}>{group.author}</span>
                <span style={{ fontSize: '10px', color: '#444' }}>{group.presets.length}</span>
              </div>
              {expanded.has('p:' + group.author) && (
                <>
                  {rolesPresent.map(role => (
                    <div key={role}>
                      {showDividers && <RoleDivider role={role} />}
                      {(byRole.get(role) ?? []).map(renderPreset)}
                    </div>
                  ))}
                </>
              )}
            </div>
          );
        })}

        {tab === 'presets' && !loading && groups.length === 0 && (
          <div style={{ padding: '20px 14px', color: '#444', fontSize: '12px', textAlign: 'center' }}>No presets found.</div>
        )}

        {/* ── MODULES ── */}
        {tab === 'modules' && (
          <>
            <div style={{ padding: '8px 14px 4px', color: '#555', fontSize: '10px', display: 'flex', alignItems: 'center', gap: '5px' }}>
              <Tag size={10} /> Click a module to preview, then insert at cursor.
            </div>

            {moduleGroups.map(group => (
              <div key={group.author}>
                <div onClick={() => toggleAuthor('m:' + group.author)} style={{
                  display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 14px',
                  cursor: 'pointer', userSelect: 'none',
                  color: expanded.has('m:' + group.author) ? '#e6edf3' : '#8b949e',
                  background: expanded.has('m:' + group.author) ? '#161b22' : 'transparent',
                }}>
                  {expanded.has('m:' + group.author) ? <ChevronDown size={12} color="#555" /> : <ChevronRight size={12} color="#555" />}
                  <User size={12} color="#7ec8ff" />
                  <span style={{ fontSize: '12px', fontWeight: 'bold', flex: 1 }}>{group.author}</span>
                  <span style={{ fontSize: '10px', color: '#444' }}>{group.modules.length}</span>
                </div>
                {expanded.has('m:' + group.author) && group.modules.map(renderModule)}
              </div>
            ))}

            {!loading && moduleGroups.length === 0 && (
              <div style={{ padding: '20px 14px', color: '#444', fontSize: '12px', textAlign: 'center' }}>No modules found.</div>
            )}
          </>
        )}

        {/* Unused imports referenced to prevent tree-shaking warnings */}
        <span style={{ display: 'none' }}><Zap size={1} /></span>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
};

export default CommunityPresets;
