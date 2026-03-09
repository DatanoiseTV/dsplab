import { useState } from 'react';
import { RefreshCw, ChevronRight, ChevronDown, User, FileCode, Download, AlertCircle, PlusSquare, Puzzle } from 'lucide-react';
import { useCommunityPresets, loadRepoFile } from './useCommunityPresets';
import type { CommunityModule } from './useCommunityPresets';

type Tab = 'presets' | 'modules';

interface Props {
  onLoad: (code: string, name: string) => void;
  onInsert: (code: string) => void;
}

const CommunityPresets = ({ onLoad, onInsert }: Props) => {
  const { groups, moduleGroups, loading, error, lastFetched, refresh } = useCommunityPresets();
  const [tab, setTab] = useState<Tab>('presets');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loadingFile, setLoadingFile] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Preview state for modules
  const [preview, setPreview] = useState<{ module: CommunityModule; code: string } | null>(null);
  const [previewLoading, setPreviewLoading] = useState<string | null>(null);

  const toggleAuthor = (key: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

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
    color: tab === t ? '#ffcc00' : '#555',
    transition: 'color 0.15s',
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 14px 0', flexShrink: 0
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <span style={{ color: '#ffcc00', fontSize: '11px', fontWeight: 'bold', letterSpacing: '1px', textTransform: 'uppercase' }}>
            Community
          </span>
          {lastFetched && (
            <span style={{ color: '#444', fontSize: '10px' }}>Updated {formatTime(lastFetched)}</span>
          )}
        </div>
        <button onClick={refresh} disabled={loading} title="Refresh" style={{
          background: 'none', border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
          color: '#555', padding: '4px', display: 'flex', alignItems: 'center'
        }}>
          <RefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid #222', flexShrink: 0, marginTop: '8px' }}>
        <button style={tabStyle('presets')} onClick={() => setTab('presets')}>
          Presets
        </button>
        <button style={tabStyle('modules')} onClick={() => setTab('modules')}>
          Modules
        </button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 0' }}>
        {displayError && (
          <div style={{
            display: 'flex', alignItems: 'flex-start', gap: '8px',
            margin: '10px 12px', padding: '10px', borderRadius: '4px',
            background: '#2a1515', border: '1px solid #5a2020', color: '#ff6666', fontSize: '12px'
          }}>
            <AlertCircle size={14} style={{ flexShrink: 0, marginTop: '1px' }} />
            <span style={{ flex: 1, wordBreak: 'break-word' }}>{displayError}</span>
            <span style={{ cursor: 'pointer', color: '#ff6666' }} onClick={() => setLoadError(null)}>×</span>
          </div>
        )}

        {loading && (groups.length === 0 && moduleGroups.length === 0) && (
          <div style={{ padding: '20px 14px', color: '#444', fontSize: '12px', textAlign: 'center' }}>Loading...</div>
        )}

        {/* ---- PRESETS TAB ---- */}
        {tab === 'presets' && groups.map(group => (
          <div key={group.author}>
            <div onClick={() => toggleAuthor('p:' + group.author)} style={{
              display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 14px',
              cursor: 'pointer', userSelect: 'none',
              color: expanded.has('p:' + group.author) ? '#e0e0e0' : '#888',
              background: expanded.has('p:' + group.author) ? '#161616' : 'transparent',
            }}>
              {expanded.has('p:' + group.author) ? <ChevronDown size={12} color="#555" /> : <ChevronRight size={12} color="#555" />}
              <User size={12} color="#ffcc00" />
              <span style={{ fontSize: '12px', fontWeight: 'bold', flex: 1 }}>{group.author}</span>
              <span style={{ fontSize: '10px', color: '#444' }}>{group.presets.length}</span>
            </div>
            {expanded.has('p:' + group.author) && group.presets.map(preset => {
              const isLoading = loadingFile === preset.path;
              return (
                <div key={preset.path} onClick={() => !isLoading && handleLoadPreset(preset.path, preset.name)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '8px',
                    padding: '6px 14px 6px 32px', cursor: isLoading ? 'wait' : 'pointer', color: '#aaa',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#1a1a1a')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  {isLoading
                    ? <RefreshCw size={12} color="#555" style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }} />
                    : <FileCode size={12} color="#555" style={{ flexShrink: 0 }} />
                  }
                  <span style={{ fontSize: '12px', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textTransform: 'capitalize' }}>{preset.name}</span>
                  <Download size={11} color="#333" style={{ flexShrink: 0 }} />
                </div>
              );
            })}
          </div>
        ))}

        {tab === 'presets' && !loading && groups.length === 0 && (
          <div style={{ padding: '20px 14px', color: '#444', fontSize: '12px', textAlign: 'center' }}>No presets found.</div>
        )}

        {/* ---- MODULES TAB ---- */}
        {tab === 'modules' && (
          <>
            <div style={{ padding: '8px 14px 4px', color: '#555', fontSize: '10px' }}>
              Click a module to preview, then insert at cursor position in the editor.
            </div>

            {moduleGroups.map(group => (
              <div key={group.author}>
                <div onClick={() => toggleAuthor('m:' + group.author)} style={{
                  display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 14px',
                  cursor: 'pointer', userSelect: 'none',
                  color: expanded.has('m:' + group.author) ? '#e0e0e0' : '#888',
                  background: expanded.has('m:' + group.author) ? '#161616' : 'transparent',
                }}>
                  {expanded.has('m:' + group.author) ? <ChevronDown size={12} color="#555" /> : <ChevronRight size={12} color="#555" />}
                  <User size={12} color="#7ec8ff" />
                  <span style={{ fontSize: '12px', fontWeight: 'bold', flex: 1 }}>{group.author}</span>
                  <span style={{ fontSize: '10px', color: '#444' }}>{group.modules.length}</span>
                </div>

                {expanded.has('m:' + group.author) && group.modules.map(mod => {
                  const isSelected = preview?.module.path === mod.path;
                  const isLoading = previewLoading === mod.path;
                  return (
                    <div key={mod.path}>
                      <div
                        onClick={() => !isLoading && handlePreviewModule(mod)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '8px',
                          padding: '6px 14px 6px 32px', cursor: isLoading ? 'wait' : 'pointer',
                          background: isSelected ? '#1a1f2e' : 'transparent',
                          color: isSelected ? '#7ec8ff' : '#aaa',
                          borderLeft: isSelected ? '2px solid #7ec8ff' : '2px solid transparent',
                        }}
                        onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = '#1a1a1a'; }}
                        onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
                      >
                        {isLoading
                          ? <RefreshCw size={12} color="#555" style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }} />
                          : <Puzzle size={12} color={isSelected ? '#7ec8ff' : '#555'} style={{ flexShrink: 0 }} />
                        }
                        <span style={{ fontSize: '12px', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textTransform: 'capitalize' }}>{mod.name}</span>
                        {isSelected && <ChevronDown size={11} color="#7ec8ff" />}
                      </div>

                      {/* Inline code preview + insert button */}
                      {isSelected && preview && (
                        <div style={{ margin: '0 10px 8px 32px', background: '#0d1117', border: '1px solid #1e2a3a', borderRadius: '4px', overflow: 'hidden' }}>
                          <pre style={{
                            margin: 0, padding: '10px 12px', fontSize: '11px', fontFamily: "'Fira Code', monospace",
                            color: '#cdd9e5', overflowX: 'auto', maxHeight: '200px', overflowY: 'auto',
                            lineHeight: '1.5',
                          }}>{preview.code}</pre>
                          <div style={{ padding: '6px 10px', borderTop: '1px solid #1e2a3a', display: 'flex', justifyContent: 'flex-end' }}>
                            <button onClick={handleInsert} style={{
                              display: 'flex', alignItems: 'center', gap: '6px',
                              background: '#7ec8ff', color: '#000', border: 'none', borderRadius: '3px',
                              padding: '5px 10px', fontSize: '10px', fontWeight: 'bold',
                              letterSpacing: '0.5px', textTransform: 'uppercase', cursor: 'pointer',
                            }}>
                              <PlusSquare size={12} />
                              Insert at cursor
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}

            {!loading && moduleGroups.length === 0 && (
              <div style={{ padding: '20px 14px', color: '#444', fontSize: '12px', textAlign: 'center' }}>No modules found.</div>
            )}
          </>
        )}
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
};

export default CommunityPresets;
