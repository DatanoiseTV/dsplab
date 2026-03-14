import React, { useEffect, useRef, useState } from 'react';
import VUMeter from './VUMeter';
import './StatsView.css';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface StatsData {
  rms: number;
  peak: number;
  crest: number;
  dc: number;
  snr: number;
  thd: number;
  f0: number;
}

interface DSPStats {
  left: StatsData;
  right: StatsData;
  sampleRate: number;
}

interface StatsViewProps {
  getDSPStats: () => DSPStats | null;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Convert dB value to 0-1 linear level, clamped. */
function dbToLevel(db: number): number {
  if (!isFinite(db) || db <= -100) return 0;
  const level = Math.pow(10, db / 20);
  return Math.max(0, Math.min(1, level));
}

function formatDb(val: number): string {
  if (!isFinite(val) || val <= -100) return '-inf';
  return val.toFixed(1);
}

function formatPercent(val: number): string {
  if (!isFinite(val)) return '--';
  return val.toFixed(2);
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

const StatsView: React.FC<StatsViewProps> = ({ getDSPStats }) => {
  const [stats, setStats] = useState<DSPStats | null>(null);
  const intervalRef = useRef<number>(0);

  useEffect(() => {
    const update = () => setStats(getDSPStats());
    update();
    intervalRef.current = window.setInterval(update, 100);
    return () => window.clearInterval(intervalRef.current);
  }, [getDSPStats]);

  const left = stats?.left;
  const right = stats?.right;

  // Derive VU meter levels from RMS dB values
  const leftLevel = left ? dbToLevel(left.rms) : 0;
  const rightLevel = right ? dbToLevel(right.rms) : 0;
  const leftPeak = left ? dbToLevel(left.peak) : 0;
  const rightPeak = right ? dbToLevel(right.peak) : 0;

  // Use left channel for stats display (primary)
  const displayStats = left;

  const rows: Array<{ label: string; value: string; good?: boolean }> = displayStats
    ? [
        { label: 'RMS', value: `${formatDb(displayStats.rms)} dB` },
        { label: 'Peak', value: `${formatDb(displayStats.peak)} dB` },
        {
          label: 'THD',
          value: `${formatPercent(displayStats.thd)}%`,
          good: isFinite(displayStats.thd) && displayStats.thd < 1,
        },
        { label: 'SNR', value: `${formatDb(displayStats.snr)} dB` },
      ]
    : [
        { label: 'RMS', value: '--' },
        { label: 'Peak', value: '--' },
        { label: 'THD', value: '--' },
        { label: 'SNR', value: '--' },
      ];

  return (
    <div className="stats-view">
      <div className="stats-view__header">
        <span className="stats-view__title">STATS</span>
      </div>
      <div className="stats-view__body">
        <div className="stats-view__meters">
          <VUMeter level={leftLevel} peak={leftPeak} label="L" />
          <VUMeter level={rightLevel} peak={rightPeak} label="R" />
        </div>
        <div className="stats-view__table">
          {rows.map((row) => (
            <div className="stats-view__row" key={row.label}>
              <span className="stats-view__label">{row.label}</span>
              <span
                className={`stats-view__value${row.good ? ' stats-view__value--good' : ''}`}
              >
                {row.value}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export { StatsView };
export type { StatsViewProps, StatsData, DSPStats };
export default StatsView;
