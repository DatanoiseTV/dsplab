import { useState, useCallback } from 'react';

export type SidebarPanelId = 'inputs' | 'presets' | 'settings';
export type BottomTabId = 'analysis' | 'sequencer';

const BOTTOM_TAB_STORAGE_KEY = 'dsplab-bottom-tab';

function loadBottomTab(): BottomTabId {
  try {
    const stored = localStorage.getItem(BOTTOM_TAB_STORAGE_KEY);
    if (stored && ['analysis', 'sequencer'].includes(stored)) {
      return stored as BottomTabId;
    }
  } catch { /* ignore */ }
  return 'analysis';
}

interface PanelManagerOptions {
  onToggleAI?: () => void;
  onToggleKeyboard?: () => void;
}

export function usePanelManager(options: PanelManagerOptions = {}) {
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
    const sidebarPanels: SidebarPanelId[] = ['inputs', 'presets', 'settings'];

    if (id === 'code') {
      setActiveSidebarPanel(null);
      return;
    }

    if (id === 'ai') {
      options.onToggleAI?.();
      return;
    }

    if (id === 'keyboard') {
      options.onToggleKeyboard?.();
      return;
    }

    if (id === 'sequencer') {
      setBottomTab('sequencer');
      return;
    }

    if (sidebarPanels.includes(id as SidebarPanelId)) {
      toggleSidebarPanel(id as SidebarPanelId);
      return;
    }
  }, [toggleSidebarPanel, setBottomTab, options]);

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
