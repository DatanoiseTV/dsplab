import React, { useEffect, useRef, useState, useCallback } from 'react';
import './Waterfall3D.css';

interface Waterfall3DProps {
  getSpectrumData: () => Uint8Array;
  sampleRate: number;
  onClose: () => void;
}

const MIN_FREQ = 20;
const MAX_FREQ = 20000;
const LOG_MIN = Math.log10(MIN_FREQ);
const LOG_RANGE = Math.log10(MAX_FREQ) - LOG_MIN;

const MAX_ROWS = 100;
const DB_RANGE = 96;
const DB_MIN = -96;
const CAPTURE_EVERY = 3;
const BIN_OPTIONS = [64, 128, 256, 512];

/* ── Inferno colormap ──────────────────────────────────────────────── */

const CM: [number, number, number][] = [
  [0,0,4],[22,11,57],[66,10,104],[120,28,109],
  [165,54,84],[208,90,47],[237,141,23],[251,201,50],[252,255,164],
];
const CS = [0,.15,.30,.45,.55,.70,.82,.92,1];

function infernoRGB(t: number): [number, number, number] {
  const n = Math.max(0, Math.min(1, t));
  let i = 0;
  while (i < CS.length - 2 && n > CS[i + 1]) i++;
  const f = (n - CS[i]) / (CS[i + 1] - CS[i]);
  const a = CM[i], b = CM[i + 1];
  return [a[0]+(b[0]-a[0])*f, a[1]+(b[1]-a[1])*f, a[2]+(b[2]-a[2])*f];
}

/* ── WebGL shaders ─────────────────────────────────────────────────── */

const VERT = `#version 300 es
precision highp float;
uniform mat4 uMVP;
in vec3 aPos;
in vec3 aColor;
out vec3 vColor;
out float vZ;
void main() {
  gl_Position = uMVP * vec4(aPos, 1.0);
  vColor = aColor;
  vZ = aPos.z;
}`;

const FRAG = `#version 300 es
precision highp float;
in vec3 vColor;
in float vZ;
out vec4 fragColor;
void main() {
  float fade = smoothstep(-0.5, 0.5, vZ) * 0.6 + 0.4;
  fragColor = vec4(vColor * fade, 0.85);
}`;

const LINE_VERT = `#version 300 es
precision highp float;
uniform mat4 uMVP;
in vec3 aPos;
uniform vec4 uColor;
out vec4 vColor;
void main() {
  gl_Position = uMVP * vec4(aPos, 1.0);
  vColor = uColor;
}`;

const LINE_FRAG = `#version 300 es
precision highp float;
in vec4 vColor;
out vec4 fragColor;
void main() { fragColor = vColor; }`;

/* ── Matrix math (minimal) ─────────────────────────────────────────── */

type Mat4 = Float32Array;

function mat4Identity(): Mat4 {
  const m = new Float32Array(16);
  m[0]=m[5]=m[10]=m[15]=1;
  return m;
}

function mat4Perspective(fov: number, aspect: number, near: number, far: number): Mat4 {
  const m = new Float32Array(16);
  const f = 1 / Math.tan(fov / 2);
  m[0] = f / aspect; m[5] = f;
  m[10] = (far + near) / (near - far);
  m[11] = -1;
  m[14] = (2 * far * near) / (near - far);
  return m;
}

function mat4Mul(a: Mat4, b: Mat4): Mat4 {
  const o = new Float32Array(16);
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 4; j++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[i + k * 4] * b[k + j * 4];
      o[i + j * 4] = s;
    }
  return o;
}

function mat4RotX(a: number): Mat4 {
  const m = mat4Identity();
  const c = Math.cos(a), s = Math.sin(a);
  m[5]=c; m[6]=s; m[9]=-s; m[10]=c;
  return m;
}

function mat4RotY(a: number): Mat4 {
  const m = mat4Identity();
  const c = Math.cos(a), s = Math.sin(a);
  m[0]=c; m[2]=-s; m[8]=s; m[10]=c;
  return m;
}

function mat4Translate(x: number, y: number, z: number): Mat4 {
  const m = mat4Identity();
  m[12]=x; m[13]=y; m[14]=z;
  return m;
}

function mat4Scale(x: number, y: number, z: number): Mat4 {
  const m = mat4Identity();
  m[0]=x; m[5]=y; m[10]=z;
  return m;
}

/* ── GL helpers ────────────────────────────────────────────────────── */

function compileShader(gl: WebGL2RenderingContext, src: string, type: number): WebGLShader {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
    console.error('Shader:', gl.getShaderInfoLog(s));
  return s;
}

function createProgram(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const p = gl.createProgram()!;
  gl.attachShader(p, compileShader(gl, vs, gl.VERTEX_SHADER));
  gl.attachShader(p, compileShader(gl, fs, gl.FRAGMENT_SHADER));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS))
    console.error('Program:', gl.getProgramInfoLog(p));
  return p;
}

/* ── Frequency labels for overlay ──────────────────────────────────── */

const GRID_FREQS = [50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];

function formatFreq(f: number): string {
  return f >= 1000 ? `${(f/1000).toFixed(f>=10000?0:1)}k` : `${Math.round(f)}`;
}

/* ── Component ─────────────────────────────────────────────────────── */

const Waterfall3D: React.FC<Waterfall3DProps> = ({ getSpectrumData, sampleRate, onClose }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const glRef = useRef<WebGL2RenderingContext | null>(null);
  const historyRef = useRef<Float32Array[]>([]);
  const frameRef = useRef(0);
  const rafRef = useRef(0);

  const [heightScale, setHeightScale] = useState(0.7);
  const [bins, setBins] = useState(160);
  const camRef = useRef({ rotX: 0.6, rotY: -0.5, zoom: 1.2 });
  const draggingRef = useRef(false);
  const lastMouseRef = useRef({ x: 0, y: 0 });

  const downsample = useCallback((data: Uint8Array): Float32Array => {
    const bc = data.length, fft = bc * 2;
    const out = new Float32Array(bins);
    for (let i = 0; i < bins; i++) {
      const freq = Math.pow(10, LOG_MIN + (i / (bins - 1)) * LOG_RANGE);
      const bin = (freq / sampleRate) * fft;
      const lo = Math.floor(bin), hi = Math.min(lo + 1, bc - 1);
      if (lo < 0 || hi >= bc) { out[i] = 0; continue; }
      const val = data[lo] * (1 - (bin - lo)) + data[hi] * (bin - lo);
      out[i] = val / 255;
    }
    return out;
  }, [sampleRate, bins]);

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
    const c = camRef.current;
    c.rotY += dx * 0.005;
    c.rotX = Math.max(0.05, Math.min(1.5, c.rotX + dy * 0.005));
  }, []);
  const onMouseUp = useCallback(() => { draggingRef.current = false; }, []);
  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    camRef.current.zoom = Math.max(0.4, Math.min(3, camRef.current.zoom - e.deltaY * 0.002));
  }, []);

  /* WebGL init + render loop */
  useEffect(() => {
    const canvas = canvasRef.current;
    const overlay = overlayRef.current;
    if (!canvas || !overlay) return;

    const gl = canvas.getContext('webgl2', { antialias: true, alpha: false });
    if (!gl) { console.error('WebGL2 not supported'); return; }
    glRef.current = gl;

    const meshProg = createProgram(gl, VERT, FRAG);
    const lineProg = createProgram(gl, LINE_VERT, LINE_FRAG);

    const meshMVP = gl.getUniformLocation(meshProg, 'uMVP');
    const meshPosAttr = gl.getAttribLocation(meshProg, 'aPos');
    const meshColAttr = gl.getAttribLocation(meshProg, 'aColor');

    const lineMVP = gl.getUniformLocation(lineProg, 'uMVP');
    const linePosAttr = gl.getAttribLocation(lineProg, 'aPos');
    const lineColorU = gl.getUniformLocation(lineProg, 'uColor');

    // Mesh buffer (dynamic, updated each frame)
    const meshVAO = gl.createVertexArray()!;
    const meshVBO = gl.createBuffer()!;
    gl.bindVertexArray(meshVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, meshVBO);
    gl.enableVertexAttribArray(meshPosAttr);
    gl.vertexAttribPointer(meshPosAttr, 3, gl.FLOAT, false, 24, 0);
    gl.enableVertexAttribArray(meshColAttr);
    gl.vertexAttribPointer(meshColAttr, 3, gl.FLOAT, false, 24, 12);
    gl.bindVertexArray(null);

    // Line buffer (for grid)
    const lineVAO = gl.createVertexArray()!;
    const lineVBO = gl.createBuffer()!;
    gl.bindVertexArray(lineVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, lineVBO);
    gl.enableVertexAttribArray(linePosAttr);
    gl.vertexAttribPointer(linePosAttr, 3, gl.FLOAT, false, 12, 0);
    gl.bindVertexArray(null);

    // Build grid lines (static)
    const gridVerts: number[] = [];
    // Frequency lines (along Z)
    for (const f of GRID_FREQS) {
      const x = ((Math.log10(f) - LOG_MIN) / LOG_RANGE) - 0.5;
      gridVerts.push(x, 0, -0.5, x, 0, 0.5);
    }
    // Time lines (along X)
    for (let t = 0; t <= 4; t++) {
      const z = t / 4 - 0.5;
      gridVerts.push(-0.5, 0, z, 0.5, 0, z);
    }
    // Vertical axis lines
    for (let dB = -72; dB <= 0; dB += 24) {
      const y = ((dB - DB_MIN) / DB_RANGE);
      gridVerts.push(-0.5, y, -0.5, -0.5, y, 0.5);
    }
    const gridData = new Float32Array(gridVerts);
    gl.bindBuffer(gl.ARRAY_BUFFER, lineVBO);
    gl.bufferData(gl.ARRAY_BUFFER, gridData, gl.STATIC_DRAW);
    const gridVertCount = gridVerts.length / 3;

    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    const octx = overlay.getContext('2d');

    const render = () => {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr; canvas.height = h * dpr;
        overlay.width = w * dpr; overlay.height = h * dpr;
      }
      gl.viewport(0, 0, canvas.width, canvas.height);

      // Capture
      frameRef.current++;
      if (frameRef.current % CAPTURE_EVERY === 0) {
        const raw = getSpectrumData();
        if (raw.length > 0) {
          historyRef.current.push(downsample(raw));
          if (historyRef.current.length > MAX_ROWS) historyRef.current.shift();
        }
      }

      const history = historyRef.current;
      const rows = history.length;
      const cam = camRef.current;
      const hScale = heightScale;

      // MVP matrix
      const proj = mat4Perspective(0.8, w / h, 0.1, 20);
      const view = mat4Mul(
        mat4Translate(0, -0.1, -2.5 / cam.zoom),
        mat4Mul(mat4RotX(cam.rotX), mat4RotY(cam.rotY))
      );
      const model = mat4Scale(1, hScale, 1);
      const mvp = mat4Mul(proj, mat4Mul(view, model));

      // Clear
      gl.clearColor(0.031, 0.031, 0.039, 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      // Draw grid
      gl.useProgram(lineProg);
      gl.uniformMatrix4fv(lineMVP, false, mvp);
      gl.uniform4f(lineColorU!, 1, 1, 1, 0.08);
      gl.bindVertexArray(lineVAO);
      gl.drawArrays(gl.LINES, 0, gridVertCount);

      // Build mesh from history
      if (rows >= 2) {
        const verts: number[] = [];
        for (let r = 0; r < rows - 1; r++) {
          const z0 = (r / (MAX_ROWS - 1)) - 0.5;
          const z1 = ((r + 1) / (MAX_ROWS - 1)) - 0.5;
          const d0 = history[r];
          const d1 = history[r + 1];

          for (let i = 0; i < bins - 1; i++) {
            const x0 = (i / (bins - 1)) - 0.5;
            const x1 = ((i + 1) / (bins - 1)) - 0.5;

            const y00 = d0[i], y01 = d0[i + 1];
            const y10 = d1[i], y11 = d1[i + 1];

            const [r00, g00, b00] = infernoRGB(y00);
            const [r01, g01, b01] = infernoRGB(y01);
            const [r10, g10, b10] = infernoRGB(y10);
            const [r11, g11, b11] = infernoRGB(y11);

            // Scale to 0..1 for color, use as height
            // Triangle 1
            verts.push(x0, y00, z0, r00/255, g00/255, b00/255);
            verts.push(x1, y01, z0, r01/255, g01/255, b01/255);
            verts.push(x0, y10, z1, r10/255, g10/255, b10/255);
            // Triangle 2
            verts.push(x1, y01, z0, r01/255, g01/255, b01/255);
            verts.push(x1, y11, z1, r11/255, g11/255, b11/255);
            verts.push(x0, y10, z1, r10/255, g10/255, b10/255);
          }
        }

        const meshData = new Float32Array(verts);
        gl.bindVertexArray(meshVAO);
        gl.bindBuffer(gl.ARRAY_BUFFER, meshVBO);
        gl.bufferData(gl.ARRAY_BUFFER, meshData, gl.DYNAMIC_DRAW);
        gl.useProgram(meshProg);
        gl.uniformMatrix4fv(meshMVP, false, mvp);
        gl.drawArrays(gl.TRIANGLES, 0, verts.length / 6);
      }

      gl.bindVertexArray(null);

      // 2D overlay for labels
      if (octx) {
        octx.clearRect(0, 0, overlay.width, overlay.height);
        octx.scale(dpr, dpr);
        octx.font = '9px monospace';
        octx.fillStyle = 'rgba(255,255,255,0.35)';
        octx.textAlign = 'center';

        // Project label positions through the same MVP
        for (const f of GRID_FREQS) {
          const x3 = ((Math.log10(f) - LOG_MIN) / LOG_RANGE) - 0.5;
          const z3 = 0.55;
          const clip = applyMVP(mvp, x3, 0, z3);
          if (clip[3] > 0) {
            const sx = (clip[0] / clip[3] * 0.5 + 0.5) * w;
            const sy = (1 - (clip[1] / clip[3] * 0.5 + 0.5)) * h;
            octx.fillText(formatFreq(f), sx, sy + 10);
          }
        }

        // dBFS labels on left edge
        octx.textAlign = 'right';
        for (let dB = -72; dB <= 0; dB += 24) {
          const y3 = ((dB - DB_MIN) / DB_RANGE) * hScale;
          const clip = applyMVP(mvp, -0.55, y3, -0.5);
          if (clip[3] > 0) {
            const sx = (clip[0] / clip[3] * 0.5 + 0.5) * w;
            const sy = (1 - (clip[1] / clip[3] * 0.5 + 0.5)) * h;
            octx.fillText(`${dB}`, sx - 4, sy + 3);
          }
        }

        // Axis titles
        octx.textAlign = 'center';
        octx.fillStyle = 'rgba(255,255,255,0.25)';
        octx.font = '10px monospace';
        const fClip = applyMVP(mvp, 0, 0, 0.65);
        if (fClip[3] > 0) {
          const sx = (fClip[0] / fClip[3] * 0.5 + 0.5) * w;
          const sy = (1 - (fClip[1] / fClip[3] * 0.5 + 0.5)) * h;
          octx.fillText('Frequency (Hz)', sx, sy + 22);
        }

        const dClip = applyMVP(mvp, -0.6, hScale * 0.5, -0.5);
        if (dClip[3] > 0) {
          const sx = (dClip[0] / dClip[3] * 0.5 + 0.5) * w;
          const sy = (1 - (dClip[1] / dClip[3] * 0.5 + 0.5)) * h;
          octx.fillText('dBFS', sx - 8, sy);
        }

        octx.setTransform(1, 0, 0, 1, 0, 0);
      }

      rafRef.current = requestAnimationFrame(render);
    };

    rafRef.current = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(rafRef.current);
      gl.deleteProgram(meshProg);
      gl.deleteProgram(lineProg);
    };
  }, [getSpectrumData, downsample, heightScale, bins]);

  return (
    <div className="waterfall3d-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="waterfall3d-modal">
        <div className="waterfall3d-header">
          <span className="waterfall3d-title">3D Spectrum Waterfall</span>
          <div className="waterfall3d-controls">
            <label className="waterfall3d-label">
              Height
              <input type="range" min="0.2" max="2" step="0.05" value={heightScale}
                onChange={e => setHeightScale(parseFloat(e.target.value))} />
            </label>
            <label className="waterfall3d-label">
              Bins
              <select className="waterfall3d-select" value={bins} onChange={e => { setBins(Number(e.target.value)); historyRef.current = []; }}>
                {BIN_OPTIONS.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </label>
            <button className="waterfall3d-btn" onClick={() => { camRef.current = { rotX: 0.6, rotY: -0.5, zoom: 1.2 }; }}>Reset</button>
            <button className="waterfall3d-btn" onClick={() => { historyRef.current = []; }}>Clear</button>
          </div>
          <button className="waterfall3d-close" onClick={onClose}>&times;</button>
        </div>
        <div className="waterfall3d-body" ref={containerRef}
          onMouseDown={onMouseDown} onMouseMove={onMouseMove}
          onMouseUp={onMouseUp} onMouseLeave={onMouseUp} onWheel={onWheel}>
          <canvas ref={canvasRef} className="waterfall3d-canvas" />
          <canvas ref={overlayRef} className="waterfall3d-canvas waterfall3d-overlay-canvas" />
          <div className="waterfall3d-hint">Drag to rotate · Scroll to zoom</div>
        </div>
      </div>
    </div>
  );
};

/* MVP * vec4 → clip coords */
function applyMVP(m: Mat4, x: number, y: number, z: number): [number, number, number, number] {
  return [
    m[0]*x + m[4]*y + m[8]*z + m[12],
    m[1]*x + m[5]*y + m[9]*z + m[13],
    m[2]*x + m[6]*y + m[10]*z + m[14],
    m[3]*x + m[7]*y + m[11]*z + m[15],
  ];
}

export default Waterfall3D;
