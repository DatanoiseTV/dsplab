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
