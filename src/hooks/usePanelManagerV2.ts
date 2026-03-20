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
