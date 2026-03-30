import React, { useEffect, useRef, useCallback, useState } from 'react';
import { Pill } from '../controls/Pill';
import { ToggleGroup } from '../controls/ToggleGroup';
import './ScopeView.css';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type ScopeMode = 'yt' | 'xy';

interface ScopeViewProps {
  getScopeData: () => { l: Float32Array; r: Float32Array };
  getProbedData?: (name: string) => number[] | null;
  probes?: string[];
  triggerMode?: 'auto' | 'free';
  onTriggerModeChange?: (mode: 'auto' | 'free') => void;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const BG_COLOR = '#0a0a0a';
const GRID_MAJOR = 'rgba(255,255,255,0.06)';
const GRID_MINOR = 'rgba(255,255,255,0.03)';
const GRID_CENTER = 'rgba(255,255,255,0.08)';
const TRIGGER_COLOR = 'rgba(255,80,80,0.4)';

const CH1_COLOR = '#ff6b35';
const CH2_COLOR = '#4ecdc4';
const PROBE_COLOR = '#c678dd';
const XY_COLOR = '#4ecdc4';

const MAJOR_COLS = 10;
const MAJOR_ROWS = 8;
const SUBDIVISIONS = 4;

const TIME_SCALES = [
  { label: '0.1ms', samples: 128 },
  { label: '0.5ms', samples: 512 },
  { label: '1ms', samples: 1024 },
  { label: '2ms', samples: 2048 },
  { label: '5ms', samples: 4096 },
  { label: '10ms', samples: 8192 },
];

/* ------------------------------------------------------------------ */
/*  Graticule offscreen canvas                                         */
/* ------------------------------------------------------------------ */

function drawGraticule(
  canvas: OffscreenCanvas | HTMLCanvasElement,
  w: number,
  h: number,
  dpr: number,
) {
  const ctx = canvas.getContext('2d') as
    | OffscreenCanvasRenderingContext2D
    | CanvasRenderingContext2D;
  if (!ctx) return;

  ctx.clearRect(0, 0, w * dpr, h * dpr);
  ctx.save();
  ctx.scale(dpr, dpr);

  // Minor grid
  ctx.strokeStyle = GRID_MINOR;
  ctx.lineWidth = 1;
  const subCols = MAJOR_COLS * SUBDIVISIONS;
  const subRows = MAJOR_ROWS * SUBDIVISIONS;
  ctx.beginPath();
  for (let i = 1; i < subCols; i++) {
    if (i % SUBDIVISIONS === 0) continue;
    const x = Math.round((w / subCols) * i) + 0.5;
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
  }
  for (let i = 1; i < subRows; i++) {
    if (i % SUBDIVISIONS === 0) continue;
    const y = Math.round((h / subRows) * i) + 0.5;
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
  }
  ctx.stroke();

  // Major grid
  ctx.strokeStyle = GRID_MAJOR;
  ctx.beginPath();
  for (let i = 1; i < MAJOR_COLS; i++) {
    const x = Math.round((w / MAJOR_COLS) * i) + 0.5;
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
  }
  for (let i = 1; i < MAJOR_ROWS; i++) {
    const y = Math.round((h / MAJOR_ROWS) * i) + 0.5;
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
  }
  ctx.stroke();

  // Center crosshair
  ctx.strokeStyle = GRID_CENTER;
  ctx.beginPath();
  const cx = Math.round(w / 2) + 0.5;
  const cy = Math.round(h / 2) + 0.5;
  ctx.moveTo(cx, 0);
  ctx.lineTo(cx, h);
  ctx.moveTo(0, cy);
  ctx.lineTo(w, cy);
  ctx.stroke();

  ctx.restore();
}

/* ------------------------------------------------------------------ */
/*  Scale labels                                                       */
/* ------------------------------------------------------------------ */

const LABEL_COLOR = 'rgba(255,255,255,0.35)';
const LABEL_FONT = '9px monospace';

function drawScaleLabels(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  mode: ScopeMode,
  gainLinear: number,
  timeScaleMs: number,
) {
  ctx.save();
  ctx.font = LABEL_FONT;
  ctx.textBaseline = 'middle';

  // Voltage per division: the display maps +-1.0 to the full amplitude range
  // With gain applied, 1 division = 1/gain * (1 / (MAJOR_ROWS/2))
  const voltsPerDiv = 1.0 / gainLinear / (MAJOR_ROWS / 2);

  // ── Y-axis labels (left edge) ──
  ctx.textAlign = 'left';
  ctx.fillStyle = LABEL_COLOR;
  const centerY = h / 2;
  const divH = h / MAJOR_ROWS;

  for (let i = 0; i <= MAJOR_ROWS; i++) {
    const y = i * divH;
    const divsFromCenter = (MAJOR_ROWS / 2) - i;
    const voltage = divsFromCenter * voltsPerDiv;

    // Format label
    let label: string;
    if (Math.abs(voltage) < 0.001) label = '0';
    else if (Math.abs(voltage) >= 1) label = voltage.toFixed(1);
    else label = voltage.toFixed(2);

    // Only draw at major divisions, skip if too close to edge
    if (y < 8 || y > h - 8) continue;
    ctx.fillText(label, 3, y);
  }

  if (mode === 'yt') {
    // ── X-axis labels (bottom edge) — time ──
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    const divW = w / MAJOR_COLS;
    const msPerDiv = timeScaleMs / MAJOR_COLS;

    for (let i = 0; i <= MAJOR_COLS; i++) {
      const x = i * divW;
      const timeMs = i * msPerDiv;

      let label: string;
      if (timeMs < 1) label = `${(timeMs * 1000).toFixed(0)}us`;
      else if (timeMs >= 10) label = `${timeMs.toFixed(0)}ms`;
      else label = `${timeMs.toFixed(1)}ms`;

      if (x < 20 || x > w - 20) continue;
      ctx.fillText(label, x, h - 2);
    }
  } else {
    // ── X/Y mode: X-axis also shows voltage ──
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    const divW = w / MAJOR_COLS;

    for (let i = 0; i <= MAJOR_COLS; i++) {
      const x = i * divW;
      const divsFromCenter = i - (MAJOR_COLS / 2);
      const voltage = divsFromCenter * voltsPerDiv;

      let label: string;
      if (Math.abs(voltage) < 0.001) label = '0';
      else if (Math.abs(voltage) >= 1) label = voltage.toFixed(1);
      else label = voltage.toFixed(2);

      if (x < 20 || x > w - 20) continue;
      ctx.fillText(label, x, h - 2);
    }
  }

  ctx.restore();
}

/* ------------------------------------------------------------------ */
/*  Trace drawing helpers                                              */
/* ------------------------------------------------------------------ */

function drawTrace(
  ctx: CanvasRenderingContext2D,
  data: Float32Array | number[],
  color: string,
  w: number,
  centerY: number,
  amplitude: number,
  dashed?: boolean,
) {
  if (!data || data.length === 0) return;

  const len = data.length;
  const step = w / len;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.shadowBlur = 3;
  ctx.shadowColor = color + '80';

  if (dashed) {
    ctx.setLineDash([5, 5]);
    ctx.shadowBlur = 0;
  }

  ctx.beginPath();
  for (let i = 0; i < len; i++) {
    const x = i * step;
    const y = centerY - (data[i] as number) * amplitude;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.restore();
}

function drawXY(
  ctx: CanvasRenderingContext2D,
  dataL: Float32Array,
  dataR: Float32Array,
  w: number,
  h: number,
  gain = 1,
) {
  if (!dataL || !dataR || dataL.length === 0) return;

  const len = Math.min(dataL.length, dataR.length);
  const cx = w / 2;
  const cy = h / 2;
  const scale = Math.min(w, h) * 0.42 * gain;

  ctx.save();
  ctx.strokeStyle = XY_COLOR;
  ctx.lineWidth = 1.2;
  ctx.globalAlpha = 0.8;
  ctx.shadowBlur = 4;
  ctx.shadowColor = XY_COLOR + '80';

  ctx.beginPath();
  for (let i = 0; i < len; i++) {
    const x = cx + dataL[i] * scale;
    const y = cy - dataR[i] * scale;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // Draw dot at current position
  const lastX = cx + dataL[len - 1] * scale;
  const lastY = cy - dataR[len - 1] * scale;
  ctx.fillStyle = XY_COLOR;
  ctx.globalAlpha = 1;
  ctx.beginPath();
  ctx.arc(lastX, lastY, 2, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

/* ------------------------------------------------------------------ */
/*  Trigger helpers                                                    */
/* ------------------------------------------------------------------ */

function findTriggerPoint(data: Float32Array, threshold: number): number {
  const searchRange = data.length >>> 1;
  for (let i = 1; i < searchRange; i++) {
    if (data[i - 1] <= threshold && data[i] > threshold) {
      return i;
    }
  }
  return 0;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

const ScopeView: React.FC<ScopeViewProps> = ({
  getScopeData,
  getProbedData,
  probes = [],
  triggerMode: triggerModeProp,
  onTriggerModeChange,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const graticuleRef = useRef<HTMLCanvasElement | null>(null);
  const dimRef = useRef({ width: 800, height: 200, dpr: 1 });
  const rafRef = useRef<number>(0);

  const [internalTrigger, setInternalTrigger] = useState<'auto' | 'free'>(
    triggerModeProp ?? 'auto',
  );
  const [scopeMode, setScopeMode] = useState<ScopeMode>('yt');
  const [timeScaleIdx, setTimeScaleIdx] = useState(2); // default 1ms
  const [gainDb, setGainDb] = useState(0); // vertical gain in dB
  const [afterglow, setAfterglow] = useState(false);
  const gainLinear = Math.pow(10, gainDb / 20);
  const afterglowAlpha = 0.15; // how much of the previous frame to keep

  const triggerMode = triggerModeProp ?? internalTrigger;
  const handleTriggerChange = useCallback(
    (mode: 'auto' | 'free') => {
      if (onTriggerModeChange) onTriggerModeChange(mode);
      else setInternalTrigger(mode);
    },
    [onTriggerModeChange],
  );

  const threshold = 0.0;

  /* ---- Rebuild graticule on resize ---- */
  const rebuildGraticule = useCallback((w: number, h: number, dpr: number) => {
    let offscreen = graticuleRef.current;
    if (!offscreen) {
      offscreen = document.createElement('canvas');
      graticuleRef.current = offscreen;
    }
    offscreen.width = w * dpr;
    offscreen.height = h * dpr;
    drawGraticule(offscreen, w, h, dpr);
  }, []);

  /* ---- ResizeObserver ---- */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const dpr = window.devicePixelRatio || 1;
      const w = Math.floor(entry.contentRect.width);
      const h = Math.floor(entry.contentRect.height);
      if (w > 0 && h > 0) {
        dimRef.current = { width: w, height: h, dpr };
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        rebuildGraticule(w, h, dpr);
      }
    });

    observer.observe(canvas);
    return () => observer.disconnect();
  }, [rebuildGraticule]);

  /* ---- RAF render loop ---- */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const render = () => {
      const { width: w, height: h, dpr } = dimRef.current;
      const data = getScopeData();
      const samplesToShow = TIME_SCALES[timeScaleIdx].samples;

      ctx.save();
      ctx.scale(dpr, dpr);

      // 1. Background — afterglow fades instead of clearing
      if (afterglow) {
        ctx.fillStyle = `rgba(10, 10, 10, ${1 - afterglowAlpha})`;
        ctx.fillRect(0, 0, w, h);
      } else {
        ctx.fillStyle = BG_COLOR;
        ctx.fillRect(0, 0, w, h);
      }

      // 2. Graticule (cached)
      if (graticuleRef.current) {
        ctx.globalAlpha = afterglow ? 0.4 : 1;
        ctx.drawImage(graticuleRef.current, 0, 0, w, h);
        ctx.globalAlpha = 1;
      }

      // 3. Scale labels
      // Total time window in ms: samples / sampleRate * 1000
      const sampleRate = 48000; // approximate; could be passed as prop
      const totalTimeMs = (samplesToShow / sampleRate) * 1000;
      drawScaleLabels(ctx, w, h, scopeMode, gainLinear, totalTimeMs);

      if (data) {
        if (scopeMode === 'xy') {
          // X/Y (Lissajous) mode
          const len = Math.min(data.l.length, data.r.length, samplesToShow);
          // Apply gain to XY by scaling data
          const scaledL = data.l.subarray(0, len);
          const scaledR = data.r.subarray(0, len);
          // gainLinear applied inside drawXY via scale parameter
          drawXY(ctx, scaledL, scaledR, w, h, gainLinear);
        } else {
          // Y/T (waveform) mode
          let startIdx = 0;
          const displayLen = Math.min(samplesToShow, data.l.length >>> 1);

          if (triggerMode === 'auto') {
            startIdx = findTriggerPoint(data.l, threshold);
          }

          const displayL = data.l.subarray(startIdx, startIdx + displayLen);
          const displayR = data.r.subarray(startIdx, startIdx + displayLen);

          const hasStereo = data.r && data.r.length > 0;
          const halfH = h / 2;

          if (hasStereo) {
            const quarterH = h / 4;
            drawTrace(ctx, displayL, CH1_COLOR, w, quarterH, quarterH * 0.85 * gainLinear);
            drawTrace(ctx, displayR, CH2_COLOR, w, h * 0.75, quarterH * 0.85 * gainLinear);
          } else {
            drawTrace(ctx, displayL, CH1_COLOR, w, halfH, halfH * 0.85 * gainLinear);
          }

          // Trigger level indicator
          if (triggerMode === 'auto') {
            const trigY = hasStereo
              ? h / 4 - threshold * (h / 4) * 0.85
              : halfH - threshold * halfH * 0.85;
            ctx.save();
            ctx.strokeStyle = TRIGGER_COLOR;
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 4]);
            ctx.beginPath();
            ctx.moveTo(0, trigY);
            ctx.lineTo(w, trigY);
            ctx.stroke();
            ctx.restore();
          }

          // Probed data
          if (probes.length > 0 && getProbedData) {
            const probedData = getProbedData(probes[0]);
            if (probedData && probedData.length > 0) {
              drawTrace(ctx, probedData, PROBE_COLOR, w, halfH, halfH * 0.85 * gainLinear, true);
            }
          }
        }
      }

      ctx.restore();
      rafRef.current = requestAnimationFrame(render);
    };

    rafRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafRef.current);
  }, [getScopeData, getProbedData, probes, triggerMode, threshold, scopeMode, timeScaleIdx, gainLinear, afterglow, afterglowAlpha]);

  return (
    <div className="scope-view">
      <div className="scope-view__header">
        <span className="scope-view__title">SCOPE</span>

        <ToggleGroup<ScopeMode>
          options={[
            { value: 'yt', label: 'Y/T' },
            { value: 'xy', label: 'X/Y' },
          ]}
          value={scopeMode}
          onChange={setScopeMode}
        />

        <div className="scope-view__separator" />

        {scopeMode === 'yt' && (
          <>
            <Pill color={CH1_COLOR}>CH1</Pill>
            <Pill color={CH2_COLOR}>CH2</Pill>

            <div className="scope-view__separator" />

            <ToggleGroup<'auto' | 'free'>
              options={[
                { value: 'auto', label: 'AUTO' },
                { value: 'free', label: 'FREE' },
              ]}
              value={triggerMode}
              onChange={handleTriggerChange}
            />
          </>
        )}
      </div>

      <div className="scope-view__canvas-container">
        <canvas ref={canvasRef} className="scope-view__canvas" />
      </div>

      <div className="scope-view__footer">
        <span className="scope-view__ctrl-label">T</span>
        <button className="scope-view__time-btn" onClick={() => setTimeScaleIdx(i => Math.max(0, i - 1))} disabled={timeScaleIdx === 0}>-</button>
        <span className="scope-view__readout">{TIME_SCALES[timeScaleIdx].label}/div</span>
        <button className="scope-view__time-btn" onClick={() => setTimeScaleIdx(i => Math.min(TIME_SCALES.length - 1, i + 1))} disabled={timeScaleIdx === TIME_SCALES.length - 1}>+</button>

        <div className="scope-view__separator" />

        <span className="scope-view__ctrl-label">Gain</span>
        <button className="scope-view__time-btn" onClick={() => setGainDb(g => Math.max(-20, g - 6))} disabled={gainDb <= -20}>-</button>
        <span className="scope-view__readout">{gainDb > 0 ? '+' : ''}{gainDb}dB</span>
        <button className="scope-view__time-btn" onClick={() => setGainDb(g => Math.min(40, g + 6))} disabled={gainDb >= 40}>+</button>

        <div className="scope-view__separator" />

        <button
          className={`scope-view__time-btn ${afterglow ? 'scope-view__time-btn--active' : ''}`}
          onClick={() => setAfterglow(a => !a)}
          title="Phosphor persistence (afterglow)"
          style={afterglow ? { color: '#4ecdc4', borderColor: '#4ecdc4' } : undefined}
        >P</button>
      </div>
    </div>
  );
};

export default ScopeView;
