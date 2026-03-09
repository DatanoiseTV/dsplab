import React, { useState } from 'react';
import { RefreshCw, ChevronRight, ChevronDown, User, FileCode, Download, AlertCircle } from 'lucide-react';
import { useCommunityPresets, loadPresetCode } from './useCommunityPresets';

interface Props {
  onLoad: (code: string, name: string) => void;
}

const CommunityPresets: React.FC<Props> = ({ onLoad }) => {
  const { groups, loading, error, lastFetched, refresh } = useCommunityPresets();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loadingFile, setLoadingFile] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const toggleAuthor = (author: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(author)) next.delete(author);
      else next.add(author);
      return next;
    });
  };

  const handleLoad = async (path: string, name: string) => {
    setLoadingFile(path);
    setLoadError(null);
    try {
      const code = await loadPresetCode(path);
      onLoad(code, name);
    } catch (e: unknown) {
      setLoadError('Failed to load: ' + (e instanceof Error ? e.message : ''));
    } finally {
      setLoadingFile(null);
    }
  };

  const formatTime = (d: Date) => {
    const diff = Math.floor((Date.now() - d.getTime()) / 1000);
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return d.toLocaleTimeString();
  };

  const displayError = loadError || error;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 14px', borderBottom: '1px solid #222', flexShrink: 0
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <span style={{ color: '#ffcc00', fontSize: '11px', fontWeight: 'bold', letterSpacing: '1px', textTransform: 'uppercase' }}>
            Community Presets
          </span>
          {lastFetched && (
            <span style={{ color: '#444', fontSize: '10px' }}>Updated {formatTime(lastFetched)}</span>
          )}
        </div>
        <button
          onClick={refresh}
          disabled={loading}
          title="Refresh"
          style={{
            background: 'none', border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
            color: '#555', padding: '4px', display: 'flex', alignItems: 'center'
          }}
        >
          <RefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
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
            <span>{displayError}</span>
          </div>
        )}

        {loading && groups.length === 0 && (
          <div style={{ padding: '20px 14px', color: '#444', fontSize: '12px', textAlign: 'center' }}>
            Loading...
          </div>
        )}

        {!loading && !displayError && groups.length === 0 && (
          <div style={{ padding: '20px 14px', color: '#444', fontSize: '12px', textAlign: 'center' }}>
            No presets found.
          </div>
        )}

        {groups.map(group => (
          <div key={group.author}>
            {/* Author row */}
            <div
              onClick={() => toggleAuthor(group.author)}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                padding: '7px 14px', cursor: 'pointer',
                color: expanded.has(group.author) ? '#e0e0e0' : '#888',
                userSelect: 'none',
                background: expanded.has(group.author) ? '#161616' : 'transparent',
              }}
            >
              {expanded.has(group.author)
                ? <ChevronDown size={12} color="#555" />
                : <ChevronRight size={12} color="#555" />
              }
              <User size={12} color="#ffcc00" />
              <span style={{ fontSize: '12px', fontWeight: 'bold', flex: 1 }}>{group.author}</span>
              <span style={{ fontSize: '10px', color: '#444' }}>{group.presets.length}</span>
            </div>

            {/* Preset rows */}
            {expanded.has(group.author) && group.presets.map(preset => {
              const isLoading = loadingFile === preset.path;
              return (
                <div
                  key={preset.path}
                  onClick={() => !isLoading && handleLoad(preset.path, preset.name)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '8px',
                    padding: '6px 14px 6px 32px',
                    cursor: isLoading ? 'wait' : 'pointer',
                    color: isLoading ? '#555' : '#aaa',
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#1a1a1a')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  {isLoading
                    ? <RefreshCw size={12} color="#555" style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }} />
                    : <FileCode size={12} color="#555" style={{ flexShrink: 0 }} />
                  }
                  <span style={{
                    fontSize: '12px', flex: 1, overflow: 'hidden',
                    textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    textTransform: 'capitalize'
                  }}>{preset.name}</span>
                  <Download size={11} color="#333" style={{ flexShrink: 0 }} />
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
};

export default CommunityPresets;
