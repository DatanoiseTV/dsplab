import React from 'react';
import { Code2, Disc3, Grid3x3, Piano, List, Sparkles, Settings } from 'lucide-react';
import type { SidebarPanelId, BottomTabId } from '../../hooks/usePanelManager';
import './ActivityBar.css';

export interface ActivityBarProps {
  activeSidebarPanel: SidebarPanelId | null;
  activeBottomTab: BottomTabId;
  showAI: boolean;
  keyboardDocked: boolean;
  onIconClick: (id: string) => void;
}

const topIcons = [
  { id: 'code', icon: Code2, label: 'Code Editor' },
  { id: 'inputs', icon: Disc3, label: 'Inputs' },
  { id: 'sequencer', icon: Grid3x3, label: 'Sequencer' },
  { id: 'keyboard', icon: Piano, label: 'Keyboard (Dock)' },
  { id: 'presets', icon: List, label: 'Presets' },
];

const bottomIcons = [
  { id: 'ai', icon: Sparkles, label: 'AI Assistant' },
  { id: 'settings', icon: Settings, label: 'Settings' },
];

export function ActivityBar({ activeSidebarPanel, activeBottomTab, showAI, keyboardDocked, onIconClick }: ActivityBarProps) {
  const isActive = (id: string) => {
    if (id === 'code') return activeSidebarPanel === null && !showAI;
    if (id === 'sequencer') return activeBottomTab === 'sequencer';
    if (id === 'keyboard') return keyboardDocked;
    if (id === 'ai') return showAI;
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
