# UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign DSPLab's layout from a right-panel model to a VS Code-inspired layout with left sidebar, tabbed bottom panel, warm desaturated colors, and better accessibility.

**Architecture:** Refactor the existing React component tree — AppShell orchestrates ActivityBar, Sidebar (left), Editor, and BottomPanel (tabbed). State management splits into sidebar vs bottom-tab concerns via a rewritten `usePanelManager` hook. A new React context pipes cursor position from EditorPane to StatusBar.

**Tech Stack:** React 18, TypeScript, CSS (no CSS-in-JS), Monaco Editor, Lucide icons

**Spec:** `docs/superpowers/specs/2026-03-20-ui-redesign-design.md`

**Strategy:** Tasks 1-5 create new files and update tokens — these don't break anything. Task 6 is one atomic swap that rewires App.tsx, AppShell, ActivityBar, StatusBar, EditorPane, and deletes old components. This avoids 8 broken intermediate commits.

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/styles/tokens.css` | Modify | Color palette, spacing, layout dimension tokens |
| `src/hooks/usePanelManager.ts` | Rewrite | Split into sidebar + bottom tab states, remove undocking |
| `src/contexts/EditorCursorContext.tsx` | Create | React context for cursor line/col |
| `src/components/layout/Sidebar.tsx` | Create | Left sidebar (replaces RightPanel) |
| `src/components/layout/Sidebar.css` | Create | Sidebar styles |
| `src/components/layout/BottomPanel.tsx` | Create | Tabbed bottom panel (replaces BottomDock) |
| `src/components/layout/BottomPanel.css` | Create | Bottom panel styles |
| `src/components/layout/AppShell.tsx` | Modify | New layout order, sidebar slot, bottom panel slot |
| `src/components/layout/AppShell.css` | Modify | Sidebar + bottom panel flex layout |
| `src/components/layout/ActivityBar.tsx` | Modify | Split routing (sidebar vs bottom tab), tooltips, colors |
| `src/components/layout/ActivityBar.css` | Modify | Updated colors, active state |
| `src/components/layout/StatusBar.tsx` | Modify | Add cursor position display |
| `src/components/layout/StatusBar.css` | Modify | Cursor position styles |
| `src/components/layout/TopBar.tsx` | Modify | Grouping, export button border |
| `src/components/layout/TopBar.css` | Modify | Separator/grouping styles |
| `src/components/editor/EditorPane.tsx` | Modify | Remove cursor pos display, write to context |
| `src/components/editor/EditorPane.css` | Modify | Tab active state style (top border) |
| `src/App.tsx` | Modify | Wire new panel manager, new layout slots, keyboard shortcuts |
| `src/components/layout/RightPanel.tsx` | Delete | Replaced by Sidebar |
| `src/components/layout/RightPanel.css` | Delete | Replaced by Sidebar.css |
| `src/components/layout/BottomDock.tsx` | Delete | Replaced by BottomPanel |
| `src/components/layout/BottomDock.css` | Delete | Replaced by BottomPanel.css |

---

### Task 1: Update Color Tokens

**Files:**
- Modify: `src/styles/tokens.css`

This is safe — only changes CSS custom property values.

- [ ] **Step 1: Update all token values**

Replace the `:root` block in `src/styles/tokens.css` with:

```css
:root {
  /* Backgrounds */
  --bg-base: #0a0a0a;
  --bg-surface: #141414;
  --bg-elevated: #1a1a1a;
  --bg-control: #242424;

  /* Accent Colors */
  --accent-primary: #d4754a;
  --accent-secondary: #5ab5ad;
  --accent-tertiary: #b07acc;
  --accent-warning: #d4b86a;
  --accent-success: #8fbf6e;

  /* Text */
  --text-primary: #eeeeee;
  --text-secondary: #bbbbbb;
  --text-tertiary: #888888;
  --text-muted: #777777;
  --text-faint: #4a4a4a;

  /* Borders */
  --border-subtle: #1e1e1e;
  --border-default: #282828;
  --border-strong: #333333;

  /* Typography */
  --font-ui: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --font-mono: 'Fira Code', 'SF Mono', 'Cascadia Code', 'JetBrains Mono', monospace;
  --font-size-heading: 13px;
  --font-size-body: 12px;
  --font-size-secondary: 11px;
  --font-size-label: 10px;
  --font-size-tiny: 9px;
  --font-size-code: 13px;

  /* Spacing */
  --space-unit: 4px;
  --space-xs: 4px;
  --space-sm: 8px;
  --space-md: 12px;
  --space-lg: 16px;
  --space-xl: 24px;
  --panel-gap: 2px;
  --panel-padding: 12px;
  --panel-padding-compact: 8px;

  /* Radii */
  --radius-panel: 6px;
  --radius-control: 4px;
  --radius-pill: 12px;

  /* Transitions */
  --transition-fast: 150ms ease-out;

  /* Layout dimensions */
  --topbar-height: 38px;
  --activity-bar-width: 42px;
  --status-bar-height: 22px;
  --bottom-dock-default-height: 180px;
  --right-panel-width: 240px;

  /* Channel colors (aliases) */
  --channel-1: var(--accent-primary);
  --channel-2: var(--accent-secondary);
  --channel-3: var(--accent-tertiary);
  --channel-4: var(--accent-success);
}
```

- [ ] **Step 2: Verify app loads**

Open `http://localhost:5174/` — confirm colors changed (warmer orange, slightly lighter surfaces), no console errors.

- [ ] **Step 3: Commit**

```bash
git add src/styles/tokens.css
git commit -m "style: update color palette — warm desaturated, better contrast"
```

---

### Task 2: Create EditorCursorContext

**Files:**
- Create: `src/contexts/EditorCursorContext.tsx`

New file, no breakage.

- [ ] **Step 1: Create the file**

```typescript
import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

interface CursorPosition {
  line: number;
  column: number;
}

interface EditorCursorContextValue {
  cursor: CursorPosition;
  setCursor: (pos: CursorPosition) => void;
}

const EditorCursorContext = createContext<EditorCursorContextValue>({
  cursor: { line: 1, column: 1 },
  setCursor: () => {},
});

export function EditorCursorProvider({ children }: { children: ReactNode }) {
  const [cursor, setCursorState] = useState<CursorPosition>({ line: 1, column: 1 });

  const setCursor = useCallback((pos: CursorPosition) => {
    setCursorState(pos);
  }, []);

  return (
    <EditorCursorContext.Provider value={{ cursor, setCursor }}>
      {children}
    </EditorCursorContext.Provider>
  );
}

export function useEditorCursor() {
  return useContext(EditorCursorContext);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/contexts/EditorCursorContext.tsx
git commit -m "feat: add EditorCursorContext for cursor position sharing"
```

---

### Task 3: Create Sidebar Component

**Files:**
- Create: `src/components/layout/Sidebar.tsx`
- Create: `src/components/layout/Sidebar.css`

New files, no breakage.

- [ ] **Step 1: Create Sidebar.css**

```css
.sidebar {
  width: var(--right-panel-width);
  background: var(--bg-surface);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  flex-shrink: 0;
  border-right: 1px solid var(--border-subtle);
}

.sidebar--hidden {
  width: 0;
  overflow: hidden;
  pointer-events: none;
  border-right: none;
}

.sidebar__header {
  padding: 10px 14px;
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.sidebar__title {
  font-size: var(--font-size-body);
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  flex: 1;
}

.sidebar__close {
  color: var(--text-muted);
  cursor: pointer;
  font-size: 14px;
  padding: 2px;
  border-radius: var(--radius-control);
  transition: color var(--transition-fast);
  background: none;
  border: none;
  line-height: 1;
}

.sidebar__close:hover {
  color: var(--text-primary);
}

.sidebar__body {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}

@media (max-width: 768px) {
  .sidebar {
    position: fixed;
    inset: 0;
    width: 100%;
    z-index: 100;
    border-right: none;
  }
  .sidebar--hidden {
    display: none;
  }
}
```

- [ ] **Step 2: Create Sidebar.tsx**

```typescript
import './Sidebar.css';

interface SidebarProps {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

export function Sidebar({ visible, title, onClose, children }: SidebarProps) {
  return (
    <div className={`sidebar${visible ? '' : ' sidebar--hidden'}`}>
      <div className="sidebar__header">
        <span className="sidebar__title">{title}</span>
        <button className="sidebar__close" onClick={onClose} title="Close">
          &times;
        </button>
      </div>
      <div className="sidebar__body">{children}</div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/Sidebar.tsx src/components/layout/Sidebar.css
git commit -m "feat: add Sidebar component (VS Code-style left panel)"
```

---

### Task 4: Create BottomPanel Component

**Files:**
- Create: `src/components/layout/BottomPanel.tsx`
- Create: `src/components/layout/BottomPanel.css`

New files, no breakage. Note: this file imports `BottomTabId` from usePanelManager — but the old usePanelManager doesn't export that type yet. We'll use a local type definition to avoid coupling, then switch when Task 6 lands.

- [ ] **Step 1: Create BottomPanel.css**

```css
.bottom-panel {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  position: relative;
  overflow: hidden;
  background: var(--bg-surface);
  border-radius: var(--radius-panel);
}

.bottom-panel--collapsed {
  height: 30px !important;
}

.bottom-panel__handle {
  position: absolute;
  top: -3px;
  left: 0;
  right: 0;
  height: 6px;
  cursor: ns-resize;
  z-index: 1;
}

.bottom-panel__handle:hover,
.bottom-panel__handle--dragging {
  background: var(--accent-secondary);
  opacity: 0.3;
  border-radius: 2px;
}

.bottom-panel__tabs {
  height: 30px;
  display: flex;
  align-items: center;
  padding: 0 8px;
  gap: 0;
  flex-shrink: 0;
  border-bottom: 1px solid var(--border-subtle);
}

.bottom-panel__tab {
  padding: 6px 14px;
  font-size: var(--font-size-label);
  font-weight: 500;
  color: var(--text-muted);
  cursor: pointer;
  border: none;
  background: none;
  border-bottom: 2px solid transparent;
  transition: color var(--transition-fast);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-family: var(--font-ui);
}

.bottom-panel__tab:hover {
  color: var(--text-secondary);
}

.bottom-panel__tab--active {
  color: var(--text-primary);
  border-bottom-color: var(--accent-secondary);
}

.bottom-panel__tab-controls {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
}

.bottom-panel__content {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
}

.bottom-panel__content > * {
  flex: 1;
  min-width: 0;
}

@media (max-width: 768px) {
  .bottom-panel {
    max-height: 50vh;
  }
}
```

- [ ] **Step 2: Create BottomPanel.tsx**

```typescript
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
```

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/BottomPanel.tsx src/components/layout/BottomPanel.css
git commit -m "feat: add BottomPanel component with tabs (replaces BottomDock)"
```

---

### Task 5: Create New usePanelManager

**Files:**
- Create: `src/hooks/usePanelManagerV2.ts` (temporary name to avoid breaking existing code)

New file, no breakage. Will be renamed in Task 6.

- [ ] **Step 1: Create the new hook**

```typescript
import { useState, useCallback } from 'react';

export type SidebarPanelId = 'inputs' | 'presets' | 'ai' | 'settings';
export type BottomTabId = 'scope' | 'spectrum' | 'stats' | 'sequencer' | 'keyboard';

const BOTTOM_TAB_STORAGE_KEY = 'dsplab-bottom-tab';

function loadBottomTab(): BottomTabId {
  try {
    const stored = localStorage.getItem(BOTTOM_TAB_STORAGE_KEY);
    if (stored && ['scope', 'spectrum', 'stats', 'sequencer', 'keyboard'].includes(stored)) {
      return stored as BottomTabId;
    }
  } catch { /* ignore */ }
  return 'scope';
}

export function usePanelManagerV2() {
  const [activeSidebarPanel, setActiveSidebarPanel] = useState<SidebarPanelId | null>(null);
  const [activeBottomTab, setActiveBottomTab] = useState<BottomTabId>(loadBottomTab);
  const [bottomPanelCollapsed, setBottomPanelCollapsed] = useState(false);

  const toggleSidebarPanel = useCallback((panel: SidebarPanelId) => {
    setActiveSidebarPanel(prev => prev === panel ? null : panel);
  }, []);

  const closeSidebar = useCallback(() => {
    setActiveSidebarPanel(null);
  }, []);

  const setBottomTab = useCallback((tab: BottomTabId) => {
    setActiveBottomTab(tab);
    setBottomPanelCollapsed(false);
    try { localStorage.setItem(BOTTOM_TAB_STORAGE_KEY, tab); } catch { /* ignore */ }
  }, []);

  const toggleBottomPanel = useCallback(() => {
    setBottomPanelCollapsed(prev => !prev);
  }, []);

  const handleActivityBarClick = useCallback((id: string) => {
    const sidebarPanels: SidebarPanelId[] = ['inputs', 'presets', 'ai', 'settings'];
    const bottomTabs: Record<string, BottomTabId> = {
      sequencer: 'sequencer',
      keyboard: 'keyboard',
    };

    if (id === 'code') {
      setActiveSidebarPanel(null);
      return;
    }

    if (sidebarPanels.includes(id as SidebarPanelId)) {
      toggleSidebarPanel(id as SidebarPanelId);
      return;
    }

    if (bottomTabs[id]) {
      setBottomTab(bottomTabs[id]);
      return;
    }
  }, [toggleSidebarPanel, setBottomTab]);

  return {
    activeSidebarPanel,
    activeBottomTab,
    bottomPanelCollapsed,
    toggleSidebarPanel,
    closeSidebar,
    setBottomTab,
    toggleBottomPanel,
    handleActivityBarClick,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/usePanelManagerV2.ts
git commit -m "feat: add usePanelManagerV2 — split sidebar/bottom-tab state"
```

---

### Task 6: Atomic Layout Swap

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/layout/AppShell.tsx`
- Modify: `src/components/layout/AppShell.css`
- Modify: `src/components/layout/ActivityBar.tsx`
- Modify: `src/components/layout/ActivityBar.css`
- Modify: `src/components/layout/StatusBar.tsx`
- Modify: `src/components/layout/StatusBar.css`
- Modify: `src/components/editor/EditorPane.tsx`
- Modify: `src/components/editor/EditorPane.css`
- Rename: `src/hooks/usePanelManagerV2.ts` → `src/hooks/usePanelManager.ts`
- Delete: `src/components/layout/RightPanel.tsx`
- Delete: `src/components/layout/RightPanel.css`
- Delete: `src/components/layout/BottomDock.tsx`
- Delete: `src/components/layout/BottomDock.css`

This is one atomic commit that swaps all consumers to the new components. Every file changes together so the app stays compilable.

- [ ] **Step 1: Replace usePanelManager**

```bash
rm src/hooks/usePanelManager.ts
mv src/hooks/usePanelManagerV2.ts src/hooks/usePanelManager.ts
```

Then update the export name in the file: rename `usePanelManagerV2` to `usePanelManager`.

- [ ] **Step 2: Rewrite AppShell.tsx**

Full replacement:

```typescript
import React from 'react';
import { TopBar } from './TopBar';
import { ActivityBar } from './ActivityBar';
import { StatusBar } from './StatusBar';
import type { SidebarPanelId, BottomTabId } from '../../hooks/usePanelManager';
import './AppShell.css';

export interface AppShellProps {
  projectName: string;
  isPlaying: boolean;
  onPlay: () => void;
  onStop: () => void;
  vultVersion: 'v0' | 'v1';
  onVultVersionChange: (v: 'v0' | 'v1') => void;
  sampleRate: number;
  bufferSize: number;
  onExport: () => void;
  onCommandPalette: () => void;
  activeSidebarPanel: SidebarPanelId | null;
  activeBottomTab: BottomTabId;
  onIconClick: (id: string) => void;
  status: 'ready' | 'compiling' | 'error';
  cpuPercent: number;
  latencyMs: number;
  vultVersion_display?: string;
  sidebar?: React.ReactNode;
  bottomPanel?: React.ReactNode;
  children: React.ReactNode;
}

export function AppShell({
  projectName, isPlaying, onPlay, onStop,
  vultVersion, onVultVersionChange,
  sampleRate, bufferSize, onExport, onCommandPalette,
  activeSidebarPanel, activeBottomTab, onIconClick,
  status, cpuPercent, latencyMs, vultVersion_display = '0.4.15',
  sidebar, bottomPanel, children,
}: AppShellProps) {
  return (
    <div className="app-shell">
      <TopBar
        projectName={projectName}
        isPlaying={isPlaying}
        onPlay={onPlay}
        onStop={onStop}
        vultVersion={vultVersion}
        onVultVersionChange={onVultVersionChange}
        sampleRate={sampleRate}
        bufferSize={bufferSize}
        onExport={onExport}
        onCommandPalette={onCommandPalette}
      />
      <div className="app-shell__body">
        <ActivityBar
          activeSidebarPanel={activeSidebarPanel}
          activeBottomTab={activeBottomTab}
          onIconClick={onIconClick}
        />
        {sidebar}
        <div className="app-shell__main">
          {children}
        </div>
      </div>
      {bottomPanel}
      <StatusBar
        status={status}
        cpuPercent={cpuPercent}
        latencyMs={latencyMs}
        vultVersion={vultVersion_display}
      />
    </div>
  );
}
```

- [ ] **Step 3: Rewrite AppShell.css**

```css
.app-shell {
  display: flex;
  flex-direction: column;
  height: 100vh;
  gap: var(--panel-gap);
  padding: var(--panel-gap);
  background: var(--bg-base);
}

.app-shell__body {
  flex: 1;
  display: flex;
  gap: var(--panel-gap);
  min-height: 0;
}

.app-shell__main {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: var(--panel-gap);
  min-width: 0;
  min-height: 0;
}

@media (max-width: 768px) {
  .app-shell__body {
    flex-direction: column;
  }
}
```

Note: The layout works because:
- `app-shell` is a vertical flex column: TopBar → body → bottomPanel → StatusBar
- `app-shell__body` is a horizontal flex row: ActivityBar → Sidebar (optional) → main
- `app-shell__main` contains only the EditorPane (BottomDock is no longer a child)
- `bottomPanel` is a direct child of `app-shell`, sitting between body and status bar

- [ ] **Step 4: Rewrite ActivityBar.tsx**

```typescript
import React from 'react';
import { Code2, Disc3, Grid3x3, Music, List, Sparkles, Settings } from 'lucide-react';
import type { SidebarPanelId, BottomTabId } from '../../hooks/usePanelManager';
import './ActivityBar.css';

export interface ActivityBarProps {
  activeSidebarPanel: SidebarPanelId | null;
  activeBottomTab: BottomTabId;
  onIconClick: (id: string) => void;
}

const topIcons = [
  { id: 'code', icon: Code2, label: 'Code Editor' },
  { id: 'inputs', icon: Disc3, label: 'Inputs' },
  { id: 'sequencer', icon: Grid3x3, label: 'Sequencer' },
  { id: 'keyboard', icon: Music, label: 'Keyboard' },
  { id: 'presets', icon: List, label: 'Presets' },
];

const bottomIcons = [
  { id: 'ai', icon: Sparkles, label: 'AI Assistant', dot: true },
  { id: 'settings', icon: Settings, label: 'Settings' },
];

export function ActivityBar({ activeSidebarPanel, activeBottomTab, onIconClick }: ActivityBarProps) {
  const isActive = (id: string) => {
    if (id === 'code') return activeSidebarPanel === null;
    if (id === 'sequencer') return activeBottomTab === 'sequencer';
    if (id === 'keyboard') return activeBottomTab === 'keyboard';
    return activeSidebarPanel === id;
  };

  const renderIcon = (item: { id: string; icon: React.ComponentType<{ size?: number }>; label: string; dot?: boolean }) => {
    const Icon = item.icon;
    const active = isActive(item.id);

    return (
      <button
        key={item.id}
        className={`activity-bar__icon${active ? ' activity-bar__icon--active' : ''}`}
        onClick={() => onIconClick(item.id)}
        title={item.label}
      >
        <Icon size={16} />
        {item.dot && <span className="activity-bar__dot" />}
      </button>
    );
  };

  return (
    <div className="activity-bar">
      {topIcons.map(renderIcon)}
      <div className="activity-bar__spacer" />
      {bottomIcons.map(renderIcon)}
    </div>
  );
}
```

- [ ] **Step 5: Update ActivityBar.css**

Replace the icon rules:

```css
.activity-bar__icon {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: #666;
  cursor: pointer;
  transition: all var(--transition-fast);
  padding: 0;
}

.activity-bar__icon:hover {
  color: var(--text-secondary);
  background: var(--bg-elevated);
}

.activity-bar__icon--active {
  background: var(--bg-elevated);
  color: var(--text-primary);
  border-left: 2px solid var(--accent-secondary);
}
```

- [ ] **Step 6: Update StatusBar.tsx**

```typescript
import { useEditorCursor } from '../../contexts/EditorCursorContext';
import './StatusBar.css';

export interface StatusBarProps {
  status: 'ready' | 'compiling' | 'error';
  cpuPercent: number;
  latencyMs: number;
  vultVersion: string;
}

const statusLabels: Record<StatusBarProps['status'], string> = {
  ready: 'Ready',
  compiling: 'Compiling...',
  error: 'Error',
};

export function StatusBar({ status, cpuPercent, latencyMs, vultVersion }: StatusBarProps) {
  const { cursor } = useEditorCursor();

  return (
    <div className="status-bar">
      <div className="status-bar__status">
        <span className={`status-bar__dot status-bar__dot--${status}`} />
        <span className="status-bar__label">{statusLabels[status]}</span>
      </div>
      <div className="divider" style={{ height: 12 }} />
      <span className="status-bar__metric">CPU {cpuPercent.toFixed(1)}%</span>
      <span className="status-bar__metric">Latency {latencyMs.toFixed(1)}ms</span>
      <div className="status-bar__spacer" />
      <span className="status-bar__cursor">Ln {cursor.line}, Col {cursor.column}</span>
      <div className="divider" style={{ height: 12 }} />
      <span className="status-bar__version">Vult {vultVersion}</span>
    </div>
  );
}
```

- [ ] **Step 7: Add cursor style to StatusBar.css**

Append to the file:

```css
.status-bar__cursor {
  font-family: var(--font-mono);
  font-size: var(--font-size-tiny);
  color: var(--text-muted);
  user-select: none;
}
```

- [ ] **Step 8: Update EditorPane.tsx**

Changes:
1. Add import: `import { useEditorCursor } from '../../contexts/EditorCursorContext';`
2. Inside the component body, add: `const { setCursor } = useEditorCursor();`
3. Remove `cursorLine` and `cursorCol` state variables.
4. In `handleStateUpdate`, replace the `setCursorLine`/`setCursorCol` calls with:
   ```typescript
   setCursor({ line: state.cursorPosition.lineNumber ?? 1, column: state.cursorPosition.column ?? 1 });
   ```
5. Remove the `<span className="editor-pane__cursor-pos">` from the JSX return.

- [ ] **Step 9: Update EditorPane.css**

Change the active tab style from bottom border to top border:

```css
.editor-pane__tab--active {
  background: var(--bg-surface);
  color: var(--text-secondary);
  border-top: 2px solid var(--accent-secondary);
  border-bottom: none;
}
```

Remove the `.editor-pane__cursor-pos` rule.

- [ ] **Step 10: Rewrite App.tsx wiring**

Key changes to `src/App.tsx`:

1. **Update imports:**
   ```typescript
   // Remove:
   import { BottomDock } from './components/layout/BottomDock';
   import { RightPanel } from './components/layout/RightPanel';
   import type { PanelId } from './hooks/usePanelManager';

   // Add:
   import { Sidebar } from './components/layout/Sidebar';
   import { BottomPanel } from './components/layout/BottomPanel';
   import type { BottomTabId } from './components/layout/BottomPanel';
   import { EditorCursorProvider } from './contexts/EditorCursorContext';
   import type { SidebarPanelId } from './hooks/usePanelManager';
   ```

2. **Update panelManager call:**
   ```typescript
   const panelManager = usePanelManager();
   ```

3. **Add sidebar titles map** (near the existing `panelTitles`):
   ```typescript
   const sidebarTitles: Record<SidebarPanelId, string> = {
     inputs: 'Inputs',
     presets: 'Presets',
     ai: 'AI Assistant',
     settings: 'Settings',
   };
   ```

4. **Update keyboard shortcuts** — `Cmd+1` toggles inputs sidebar, `Cmd+2` sets bottom tab to sequencer, `Cmd+3` sets bottom tab to keyboard, `Cmd+4` toggles presets sidebar, `Cmd+5` toggles AI sidebar.

5. **Update command palette commands** — replace `panelManager.togglePanel(x)` with the appropriate `toggleSidebarPanel`/`setBottomTab` calls.

6. **Wrap return JSX in `<EditorCursorProvider>`.**

7. **Replace AppShell props:**
   - Remove `activePanel`, `onPanelToggle`, `rightPanel`
   - Add `activeSidebarPanel`, `activeBottomTab`, `onIconClick`, `sidebar`, `bottomPanel`

8. **Build sidebar JSX** — render `Sidebar` with panel content for `inputs`, `presets`, `ai`, `settings`. Keep all existing prop wiring for `InputsPanel`, `PresetBrowser`, `AIPanel` unchanged. Add empty placeholder for settings:
   ```tsx
   {panelManager.activeSidebarPanel === 'settings' && (
     <div style={{ padding: 16, color: 'var(--text-muted)', fontSize: 12 }}>
       Settings panel coming soon.
     </div>
   )}
   ```

9. **Build bottomPanel JSX** — render `BottomPanel` with tab content. Keep existing prop wiring for `ScopeView`, `SpectrumView`, `StatsView`, `StepSequencer`, `VirtualKeyboard` unchanged.

10. **Remove BottomDock from children** — the editor area (`app-shell__main`) now contains only `EditorPane` (and diff mode buttons). `BottomPanel` is passed as a prop.

- [ ] **Step 11: Delete old files**

```bash
rm src/components/layout/RightPanel.tsx src/components/layout/RightPanel.css
rm src/components/layout/BottomDock.tsx src/components/layout/BottomDock.css
```

- [ ] **Step 12: Verify app compiles and loads**

Run: Open `http://localhost:5174/`
Expected: New layout renders — sidebar opens left, bottom panel has tabs with Scope active by default, warm desaturated colors, cursor position in status bar.

- [ ] **Step 13: Commit**

```bash
git add -A
git commit -m "feat: atomic layout swap — VS Code-inspired sidebar + tabbed bottom panel"
```

---

### Task 7: TopBar Polish

**Files:**
- Modify: `src/components/layout/TopBar.tsx`
- Modify: `src/components/layout/TopBar.css`

- [ ] **Step 1: Add visual dividers between control groups**

In TopBar.tsx, add `<div className="divider" style={{ height: 14 }} />` between: breadcrumb and transport, transport and version toggle, version toggle and pills, pills and export button.

- [ ] **Step 2: Style the Export button with a border**

Add to TopBar.css:

```css
.topbar__export-btn {
  padding: 3px 10px;
  font-size: var(--font-size-secondary);
  font-family: var(--font-ui);
  color: var(--text-secondary);
  background: none;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-control);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.topbar__export-btn:hover {
  color: var(--text-primary);
  border-color: var(--text-muted);
}
```

Update the export button element in TopBar.tsx to use this class.

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/TopBar.tsx src/components/layout/TopBar.css
git commit -m "style: improve top bar grouping and export button visibility"
```

---

### Task 8: Visual Verification

- [ ] **Step 1: Open the app and test all views**

1. Default view — editor full width, bottom panel shows Scope tab
2. Click each bottom panel tab — Scope, Spectrum, Stats, Sequencer, Keyboard
3. Click Inputs icon — sidebar opens left with inputs panel
4. Click Presets icon — sidebar switches to presets
5. Click AI icon — sidebar shows AI panel
6. Click Code icon — sidebar closes
7. Click Settings icon — sidebar shows "coming soon" placeholder
8. Keyboard shortcuts: Cmd+1 (inputs), Cmd+2 (sequencer tab), Cmd+3 (keyboard tab)
9. Status bar shows "Ln X, Col Y" that updates when clicking in editor
10. Colors are warm desaturated (no neon orange)
11. Text is readable (muted text is #777, not #555)

- [ ] **Step 2: Fix any visual issues found**

- [ ] **Step 3: Commit fixes if any**

```bash
git add -A
git commit -m "polish: visual verification fixes"
```
