import { useEditorCursor } from '../../contexts/EditorCursorContext';
import './StatusBar.css';

export interface StatusBarProps {
  status: 'ready' | 'compiling' | 'error';
  cpuPercent: number;
  latencyMs: number;
  vultVersion: string;
  underruns?: number;
  dspMemoryKB?: number;
}

const statusLabels: Record<StatusBarProps['status'], string> = {
  ready: 'Ready',
  compiling: 'Compiling...',
  error: 'Error',
};

export function StatusBar({ status, cpuPercent, latencyMs, vultVersion, underruns = 0, dspMemoryKB = 0 }: StatusBarProps) {
  const { cursor } = useEditorCursor();

  const cpuClass = cpuPercent > 80 ? 'status-bar__metric--danger' :
                   cpuPercent > 50 ? 'status-bar__metric--warn' : '';

  return (
    <div className="status-bar">
      <div className="status-bar__status">
        <span className={`status-bar__dot status-bar__dot--${status}`} />
        <span className="status-bar__label">{statusLabels[status]}</span>
      </div>
      <div className="divider" style={{ height: 12 }} />
      <span className={`status-bar__metric ${cpuClass}`}>DSP {cpuPercent.toFixed(1)}%</span>
      <span className="status-bar__metric">Latency {latencyMs.toFixed(1)}ms</span>
      <span className="status-bar__metric">Mem {dspMemoryKB.toFixed(0)}KB</span>
      {underruns > 0 && (
        <span className="status-bar__metric status-bar__metric--danger">XRun {underruns}</span>
      )}
      <div className="status-bar__spacer" />
      <span className="status-bar__cursor">Ln {cursor.line}, Col {cursor.column}</span>
      <div className="divider" style={{ height: 12 }} />
      <span className="status-bar__version">Vult {vultVersion}</span>
    </div>
  );
}
