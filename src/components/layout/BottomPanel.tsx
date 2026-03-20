import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import './BottomPanel.css';

export type BottomTabId = 'scope' | 'spectrum' | 'stats' | 'sequencer' | 'keyboard';

const STORAGE_KEY = 'dsplab-dock-height';
const MIN_HEIGHT = 80;
const DEFAULT_HEIGHT = 180;

function getMaxHeight(): number {
  return Math.floor(window.innerHeight * 0.5);
}

function loadHeight(): number {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = Number(stored);
      if (!Number.isNaN(parsed) && parsed >= MIN_HEIGHT) {
        return Math.min(parsed, getMaxHeight());
      }
    }
  } catch { /* ignore */ }
  return DEFAULT_HEIGHT;
}

function saveHeight(h: number): void {
  try { localStorage.setItem(STORAGE_KEY, String(h)); } catch { /* ignore */ }
}

interface Tab {
  id: BottomTabId;
  label: string;
}

const TABS: Tab[] = [
  { id: 'scope', label: 'Scope' },
  { id: 'spectrum', label: 'Spectrum' },
  { id: 'stats', label: 'Stats' },
  { id: 'sequencer', label: 'Sequencer' },
  { id: 'keyboard', label: 'Keyboard' },
];

interface BottomPanelProps {
  activeTab: BottomTabId;
  onTabChange: (tab: BottomTabId) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  tabControls?: ReactNode;
  children: ReactNode;
}

export function BottomPanel({
  activeTab,
  onTabChange,
  collapsed,
  onToggleCollapse,
  tabControls,
  children,
}: BottomPanelProps) {
  const [height, setHeight] = useState(loadHeight);
  const [dragging, setDragging] = useState(false);
  const startY = useRef(0);
  const startHeight = useRef(0);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (collapsed) return;
      e.preventDefault();
      startY.current = e.clientY;
      startHeight.current = height;
      setDragging(true);
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [height, collapsed],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging) return;
      const delta = startY.current - e.clientY;
      const next = Math.max(MIN_HEIGHT, Math.min(getMaxHeight(), startHeight.current + delta));
      setHeight(next);
    },
    [dragging],
  );

  const onPointerUp = useCallback(() => {
    if (!dragging) return;
    setDragging(false);
    setHeight((h) => { saveHeight(h); return h; });
  }, [dragging]);

  useEffect(() => {
    const onResize = () => setHeight((h) => Math.min(h, getMaxHeight()));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return (
    <div
      className={`bottom-panel${collapsed ? ' bottom-panel--collapsed' : ''}`}
      style={{ height: collapsed ? undefined : height }}
    >
      <div
        className={`bottom-panel__handle${dragging ? ' bottom-panel__handle--dragging' : ''}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      />
      <div className="bottom-panel__tabs">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={`bottom-panel__tab${activeTab === tab.id ? ' bottom-panel__tab--active' : ''}`}
            onClick={() => onTabChange(tab.id)}
          >
            {tab.label}
          </button>
        ))}
        <div className="bottom-panel__tab-controls">
          {tabControls}
        </div>
      </div>
      {!collapsed && (
        <div className="bottom-panel__content">
          {children}
        </div>
      )}
    </div>
  );
}
