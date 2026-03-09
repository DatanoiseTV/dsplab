import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, ChevronRight, ChevronDown, User, FileCode, Download, AlertCircle } from 'lucide-react';

const REPO = 'DatanoiseTV/dsplab-projects';
const TREE_URL = `/api/github/repos/${REPO}/git/trees/main?recursive=1`;

interface TreeEntry {
  path: string;
  type: 'blob' | 'tree';
  sha: string;
  size?: number;
}

interface PresetFile {
  name: string;       // filename without .vult
  path: string;       // full repo path
  author: string;     // top-level folder
  sha: string;
}

interface AuthorGroup {
  author: string;
  presets: PresetFile[];
}

function groupByAuthor(entries: TreeEntry[]): AuthorGroup[] {
  const vultFiles = entries.filter(e => e.type === 'blob' && e.path.endsWith('.vult'));
  const map = new Map<string, PresetFile[]>();

  for (const entry of vultFiles) {
    const parts = entry.path.split('/');
    // Support root-level files under a single author folder or a community folder
    const author = parts.length >= 2 ? parts[0] : 'root';
    const filename = parts[parts.length - 1];
    const name = filename.replace(/\.vult$/, '').replace(/_/g, ' ').replace(/-/g, ' ');

    if (!map.has(author)) map.set(author, []);
    map.get(author)!.push({ name, path: entry.path, author, sha: entry.sha });
  }

  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([author, presets]) => ({ author, presets }));
}

interface Props {
  onLoad: (code: string, name: string) => void;
}

const CommunityPresets: React.FC<Props> = ({ onLoad }) => {
  const [groups, setGroups] = useState<AuthorGroup[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [loadingFile, setLoadingFile] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);

  const fetchTree = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(TREE_URL);
      if (!res.ok) throw new Error(`GitHub API ${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      const grouped = groupByAuthor(data.tree || []);
      setGroups(grouped);
      setLastFetched(new Date());
      // Auto-expand if only one or two authors
      if (grouped.length <= 2) {
        setExpanded(new Set(grouped.map(g => g.author)));
      }
    } catch (e: any) {
      setError(e.message || 'Failed to load community presets');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTree();
  }, [fetchTree]);

  const toggleAuthor = (author: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(author)) next.delete(author);
      else next.add(author);
      return next;
    });
  };

  const loadPreset = async (preset: PresetFile) => {
    setLoadingFile(preset.path);
    try {
      const res = await fetch(`/api/github/repos/${REPO}/contents/${preset.path}`);
      if (!res.ok) throw new Error(`GitHub API ${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      // GitHub returns base64-encoded content
      const code = atob(data.content.replace(/\n/g, ''));
      onLoad(code, preset.name);
    } catch (e: any) {
      setError('Failed to load preset: ' + (e.message || ''));
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
          onClick={fetchTree}
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
        {error && (
          <div style={{
            display: 'flex', alignItems: 'flex-start', gap: '8px',
            margin: '10px 12px', padding: '10px', borderRadius: '4px',
            background: '#2a1515', border: '1px solid #5a2020', color: '#ff6666', fontSize: '12px'
          }}>
            <AlertCircle size={14} style={{ flexShrink: 0, marginTop: '1px' }} />
            <span>{error}</span>
          </div>
        )}

        {loading && groups.length === 0 && (
          <div style={{ padding: '20px 14px', color: '#444', fontSize: '12px', textAlign: 'center' }}>
            Loading...
          </div>
        )}

        {!loading && !error && groups.length === 0 && (
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
                  onClick={() => !isLoading && loadPreset(preset)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '8px',
                    padding: '6px 14px 6px 32px',
                    cursor: isLoading ? 'wait' : 'pointer',
                    color: isLoading ? '#555' : '#aaa',
                    transition: 'background 0.1s',
                    borderLeft: '1px solid #1e1e1e',
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
