import React, { useEffect, useRef, useState, useCallback } from 'react';
import './Waterfall3D.css';

interface Waterfall3DProps {
  getSpectrumData: () => Uint8Array;
  sampleRate: number;
  onClose: () => void;
}

/* ── Constants ─────────────────────────────────────────────────────── */

const MIN_FREQ = 20;
const MAX_FREQ = 20000;
const LOG_MIN = Math.log10(MIN_FREQ);
const LOG_MAX = Math.log10(MAX_FREQ);
const LOG_RANGE = LOG_MAX - LOG_MIN;

const MAX_ROWS = 120;        // history depth
const SAMPLE_INTERVAL = 3;   // capture every N frames (~20fps)
const DB_RANGE = 96;
const DB_MIN = -96;

/* Inferno-style color map */
const CMAP: [number, number, number][] = [
  [0, 0, 4], [22, 11, 57], [66, 10, 104], [120, 28, 109],
  [165, 54, 84], [208, 90, 47], [237, 141, 23], [251, 201, 50], [252, 255, 164],
];
const CMAP_STOPS = [0, 0.15, 0.30, 0.45, 0.55, 0.70, 0.82, 0.92, 1.0];

function dbToRgb(dB: number): [number, number, number] {
  const norm = Math.max(0, Math.min(1, (dB - DB_MIN) / DB_RANGE));
  let i = 0;
  while (i < CMAP_STOPS.length - 2 && norm > CMAP_STOPS[i + 1]) i++;
  const t = (norm - CMAP_STOPS[i]) / (CMAP_STOPS[i + 1] - CMAP_STOPS[i]);
  const a = CMAP[i], b = CMAP[i + 1];
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

function freqToNorm(freq: number): number {
  return (Math.log10(freq / MIN_FREQ)) / LOG_RANGE;
}

function formatFreq(freq: number): string {
  if (freq >= 1000) return `${(freq / 1000).toFixed(freq >= 10000 ? 0 : 1)}k`;
  return `${Math.round(freq)}`;
}

/* ── 3D projection ─────────────────────────────────────────────────── */

interface Camera {
  rotX: number;   // pitch (radians)
  rotY: number;   // yaw (radians)
  zoom: number;
}

function project(
  x3: number, y3: number, z3: number,
  cam: Camera, w: number, h: number,
): [number, number] {
  // Rotate around Y axis (yaw)
  const cosY = Math.cos(cam.rotY), sinY = Math.sin(cam.rotY);
  let rx = x3 * cosY - z3 * sinY;
  let rz = x3 * sinY + z3 * cosY;
  let ry = y3;

  // Rotate around X axis (pitch)
  const cosX = Math.cos(cam.rotX), sinX = Math.sin(cam.rotX);
  const ry2 = ry * cosX - rz * sinX;
  const rz2 = ry * sinX + rz * cosX;
  ry = ry2;
  rz = rz2;

  // Perspective
  const d = 3.5 * cam.zoom;
  const scale = d / (d + rz + 1.5);

  const sx = w / 2 + rx * w * 0.38 * scale;
  const sy = h / 2 - ry * h * 0.35 * scale;
  return [sx, sy];
}

/* ── Component ─────────────────────────────────────────────────────── */

const GRID_FREQS = [50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];

const Waterfall3D: React.FC<Waterfall3DProps> = ({ getSpectrumData, sampleRate, onClose }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dimRef = useRef({ width: 900, height: 600, dpr: 1 });
  const historyRef = useRef<Float32Array[]>([]);
  const frameCountRef = useRef(0);
  const rafRef = useRef(0);

  const [camera, setCamera] = useState<Camera>({ rotX: 0.55, rotY: -0.45, zoom: 1.0 });
  const [heightScale, setHeightScale] = useState(0.6);
  const draggingRef = useRef(false);
  const lastMouseRef = useRef({ x: 0, y: 0 });

  // Downsample spectrum to fixed number of frequency bins for rendering
  const RENDER_BINS = 200;

  const downsampleSpectrum = useCallback((data: Uint8Array): Float32Array => {
    const binCount = data.length;
    const fftSize = binCount * 2;
    const out = new Float32Array(RENDER_BINS);

    for (let i = 0; i < RENDER_BINS; i++) {
      const norm = i / (RENDER_BINS - 1);
      const freq = Math.pow(10, LOG_MIN + norm * LOG_RANGE);
      const bin = (freq / sampleRate) * fftSize;
      const binLo = Math.floor(bin);
      const binHi = Math.min(binLo + 1, binCount - 1);
      if (binLo < 0 || binHi >= binCount) { out[i] = DB_MIN; continue; }
      const frac = bin - binLo;
      const val = data[binLo] * (1 - frac) + data[binHi] * frac;
      out[i] = (val / 255) * DB_RANGE + DB_MIN;
    }
    return out;
  }, [sampleRate]);

  /* Resize observer */
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver((entries) => {
      const e = entries[0];
      if (!e) return;
      const dpr = window.devicePixelRatio || 1;
      const w = Math.floor(e.contentRect.width);
      const h = Math.floor(e.contentRect.height);
      if (w > 0 && h > 0) {
        dimRef.current = { width: w, height: h, dpr };
        const c = canvasRef.current;
        if (c) { c.width = w * dpr; c.height = h * dpr; }
      }
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  /* Mouse controls */
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    draggingRef.current = true;
    lastMouseRef.current = { x: e.clientX, y: e.clientY };
  }, []);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!draggingRef.current) return;
    const dx = e.clientX - lastMouseRef.current.x;
    const dy = e.clientY - lastMouseRef.current.y;
    lastMouseRef.current = { x: e.clientX, y: e.clientY };
    setCamera(c => ({
      ...c,
      rotY: c.rotY + dx * 0.005,
      rotX: Math.max(0.1, Math.min(1.4, c.rotX + dy * 0.005)),
    }));
  }, []);

  const onMouseUp = useCallback(() => { draggingRef.current = false; }, []);

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setCamera(c => ({ ...c, zoom: Math.max(0.3, Math.min(3, c.zoom - e.deltaY * 0.002)) }));
  }, []);

  /* Render loop */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const render = () => {
      const { width: w, height: h, dpr } = dimRef.current;
      const cam = camera;

      // Capture spectrum
      frameCountRef.current++;
      if (frameCountRef.current % SAMPLE_INTERVAL === 0) {
        const raw = getSpectrumData();
        if (raw.length > 0) {
          historyRef.current.push(downsampleSpectrum(raw));
          if (historyRef.current.length > MAX_ROWS) historyRef.current.shift();
        }
      }

      const history = historyRef.current;

      ctx.save();
      ctx.scale(dpr, dpr);

      // Background
      ctx.fillStyle = '#08080a';
      ctx.fillRect(0, 0, w, h);

      const rows = history.length;
      if (rows < 2) {
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.font = '13px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('Collecting spectrum data...', w / 2, h / 2);
        ctx.restore();
        rafRef.current = requestAnimationFrame(render);
        return;
      }

      // ── Draw grid floor ──
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.lineWidth = 1;

      // Frequency grid lines (along Z)
      for (const freq of GRID_FREQS) {
        const xn = freqToNorm(freq) - 0.5;
        const [x1, y1] = project(xn, 0, -0.5, cam, w, h);
        const [x2, y2] = project(xn, 0, 0.5, cam, w, h);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }

      // Time grid lines (along X)
      for (let t = 0; t <= 4; t++) {
        const zn = (t / 4) - 0.5;
        const [x1, y1] = project(-0.5, 0, zn, cam, w, h);
        const [x2, y2] = project(0.5, 0, zn, cam, w, h);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }

      // ── Frequency labels on front edge ──
      ctx.font = '9px monospace';
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      for (const freq of GRID_FREQS) {
        const xn = freqToNorm(freq) - 0.5;
        const [sx, sy] = project(xn, 0, 0.52, cam, w, h);
        ctx.fillText(formatFreq(freq), sx, sy + 2);
      }

      // ── Draw spectrum rows (back to front for painter's algorithm) ──
      for (let row = 0; row < rows; row++) {
        const data = history[row];
        const zNorm = ((row / Math.max(1, rows - 1))) - 0.5; // -0.5 (back) to +0.5 (front)
        const alpha = 0.3 + 0.7 * (row / rows); // fade older rows

        ctx.beginPath();
        let started = false;

        // Start from floor
        const [floorX, floorY] = project(-0.5, 0, zNorm, cam, w, h);
        ctx.moveTo(floorX, floorY);

        for (let i = 0; i < RENDER_BINS; i++) {
          const xNorm = (i / (RENDER_BINS - 1)) - 0.5;
          const dB = data[i];
          const yNorm = Math.max(0, (dB - DB_MIN) / DB_RANGE) * heightScale;
          const [sx, sy] = project(xNorm, yNorm, zNorm, cam, w, h);

          if (!started) { ctx.lineTo(sx, sy); started = true; }
          else ctx.lineTo(sx, sy);
        }

        // Close to floor
        const [endFloorX, endFloorY] = project(0.5, 0, zNorm, cam, w, h);
        ctx.lineTo(endFloorX, endFloorY);
        ctx.closePath();

        // Fill with color based on row position
        const [r, g, b] = dbToRgb(DB_MIN + (row / rows) * DB_RANGE * 0.4);
        ctx.fillStyle = `rgba(${r},${g},${b},${alpha * 0.15})`;
        ctx.fill();

        // Stroke
        ctx.strokeStyle = `rgba(78,205,196,${alpha * 0.6})`;
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // ── Axis labels ──
      ctx.font = '10px monospace';
      ctx.fillStyle = 'rgba(255,255,255,0.4)';

      // Frequency axis label
      const [fLabelX, fLabelY] = project(0, 0, 0.6, cam, w, h);
      ctx.textAlign = 'center';
      ctx.fillText('Frequency (Hz)', fLabelX, fLabelY + 14);

      // dB axis
      ctx.textAlign = 'right';
      for (let dB = -72; dB <= 0; dB += 24) {
        const yNorm = Math.max(0, (dB - DB_MIN) / DB_RANGE) * heightScale;
        const [sx, sy] = project(-0.52, yNorm, -0.5, cam, w, h);
        ctx.fillText(`${dB}`, sx - 4, sy + 3);

        // Tick line
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        const [sx2, sy2] = project(-0.5, yNorm, -0.5, cam, w, h);
        ctx.lineTo(sx2, sy2);
        ctx.stroke();
      }

      // dBFS label
      const [dbLX, dbLY] = project(-0.58, heightScale * 0.5, -0.5, cam, w, h);
      ctx.textAlign = 'center';
      ctx.fillText('dBFS', dbLX, dbLY);

      ctx.restore();
      rafRef.current = requestAnimationFrame(render);
    };

    rafRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafRef.current);
  }, [getSpectrumData, camera, heightScale, downsampleSpectrum]);

  return (
    <div className="waterfall3d-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="waterfall3d-modal">
        <div className="waterfall3d-header">
          <span className="waterfall3d-title">3D Spectrum Waterfall</span>
          <div className="waterfall3d-controls">
            <label className="waterfall3d-label">
              Height
              <input
                type="range" min="0.1" max="1.5" step="0.05"
                value={heightScale}
                onChange={e => setHeightScale(parseFloat(e.target.value))}
              />
            </label>
            <button className="waterfall3d-btn" onClick={() => setCamera({ rotX: 0.55, rotY: -0.45, zoom: 1.0 })}>Reset View</button>
            <button className="waterfall3d-btn" onClick={() => { historyRef.current = []; }}>Clear</button>
          </div>
          <button className="waterfall3d-close" onClick={onClose}>&times;</button>
        </div>
        <div
          className="waterfall3d-body"
          ref={containerRef}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
          onWheel={onWheel}
        >
          <canvas ref={canvasRef} className="waterfall3d-canvas" />
          <div className="waterfall3d-hint">Drag to rotate &middot; Scroll to zoom</div>
        </div>
      </div>
    </div>
  );
};

export default Waterfall3D;
