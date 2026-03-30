import React, { useEffect, useRef, useState, useCallback } from 'react';
import './Waterfall3D.css';

interface Waterfall3DProps {
  getSpectrumData: () => Uint8Array;
  sampleRate: number;
  onClose: () => void;
}

const MIN_FREQ = 20, MAX_FREQ = 20000;
const LOG_MIN = Math.log10(MIN_FREQ);
const LOG_RANGE = Math.log10(MAX_FREQ) - LOG_MIN;
const MAX_ROWS = 100;
const DB_RANGE = 96, DB_MIN = -96;
const CAPTURE_EVERY = 3;
const BIN_OPTIONS = [64, 128, 256, 512];

const GRID_FREQS = [50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
function formatFreq(f: number): string {
  return f >= 1000 ? `${(f/1000).toFixed(f>=10000?0:1)}k` : `${Math.round(f)}`;
}

/* ── Shaders ───────────────────────────────────────────────────────── */

// Mesh shader: reads height from a data texture, computes inferno color in fragment shader
const MESH_VERT = `#version 300 es
precision highp float;
uniform mat4 uMVP;
uniform sampler2D uData;   // R channel = normalized amplitude (0..1)
uniform int uRows;         // current row count
uniform int uWriteRow;     // ring buffer write position
uniform int uBins;
uniform float uHeightScale;

// Grid vertex: x=bin index (0..bins-1), y=0, z=row index (0..MAX_ROWS-1)
in vec2 aGrid; // (binIdx, rowIdx)

out float vAmp;
out float vDepth;

void main() {
  int binIdx = int(aGrid.x);
  int rowIdx = int(aGrid.y);

  // Map row to ring buffer position
  int texRow = (uWriteRow - uRows + rowIdx + ${MAX_ROWS}) % ${MAX_ROWS};

  // Read amplitude from data texture
  float amp = texelFetch(uData, ivec2(binIdx, texRow), 0).r;

  // 3D position: x = freq (-0.5..0.5), y = amplitude, z = time (-0.5..0.5)
  float x = float(binIdx) / float(uBins - 1) - 0.5;
  float y = amp * uHeightScale;
  float z = float(rowIdx) / float(${MAX_ROWS} - 1) - 0.5;

  gl_Position = uMVP * vec4(x, y, z, 1.0);
  vAmp = amp;
  vDepth = float(rowIdx) / float(${MAX_ROWS} - 1);
}`;

const MESH_FRAG = `#version 300 es
precision highp float;
in float vAmp;
in float vDepth;
out vec4 fragColor;

// Inferno colormap in shader
vec3 inferno(float t) {
  // Simplified 5-stop inferno
  vec3 c0 = vec3(0.0, 0.0, 0.016);
  vec3 c1 = vec3(0.26, 0.04, 0.41);
  vec3 c2 = vec3(0.65, 0.21, 0.33);
  vec3 c3 = vec3(0.93, 0.55, 0.09);
  vec3 c4 = vec3(0.99, 1.0, 0.64);
  float s = clamp(t, 0.0, 1.0);
  if (s < 0.25) return mix(c0, c1, s * 4.0);
  if (s < 0.50) return mix(c1, c2, (s - 0.25) * 4.0);
  if (s < 0.75) return mix(c2, c3, (s - 0.50) * 4.0);
  return mix(c3, c4, (s - 0.75) * 4.0);
}

void main() {
  vec3 col = inferno(vAmp);
  float fade = 0.3 + 0.7 * vDepth; // older rows dimmer
  fragColor = vec4(col * fade, 0.88);
}`;

const LINE_VERT = `#version 300 es
precision highp float;
uniform mat4 uMVP;
in vec3 aPos;
void main() { gl_Position = uMVP * vec4(aPos, 1.0); }`;

const LINE_FRAG = `#version 300 es
precision highp float;
uniform vec4 uColor;
out vec4 fragColor;
void main() { fragColor = uColor; }`;

/* ── Minimal matrix math ───────────────────────────────────────────── */
type M4 = Float32Array;
const m4I = (): M4 => { const m = new Float32Array(16); m[0]=m[5]=m[10]=m[15]=1; return m; };
const m4P = (fov:number,a:number,n:number,f:number): M4 => {
  const m=new Float32Array(16),t=1/Math.tan(fov/2);
  m[0]=t/a;m[5]=t;m[10]=(f+n)/(n-f);m[11]=-1;m[14]=2*f*n/(n-f);return m;
};
const m4M = (a:M4,b:M4): M4 => {
  const o=new Float32Array(16);
  for(let i=0;i<4;i++)for(let j=0;j<4;j++){let s=0;for(let k=0;k<4;k++)s+=a[i+k*4]*b[k+j*4];o[i+j*4]=s;}return o;
};
const m4RX = (a:number):M4 => {const m=m4I(),c=Math.cos(a),s=Math.sin(a);m[5]=c;m[6]=s;m[9]=-s;m[10]=c;return m;};
const m4RY = (a:number):M4 => {const m=m4I(),c=Math.cos(a),s=Math.sin(a);m[0]=c;m[2]=-s;m[8]=s;m[10]=c;return m;};
const m4T = (x:number,y:number,z:number):M4 => {const m=m4I();m[12]=x;m[13]=y;m[14]=z;return m;};
const m4S = (x:number,y:number,z:number):M4 => {const m=m4I();m[0]=x;m[5]=y;m[10]=z;return m;};
const m4Apply = (m:M4,x:number,y:number,z:number):[number,number,number,number] =>
  [m[0]*x+m[4]*y+m[8]*z+m[12],m[1]*x+m[5]*y+m[9]*z+m[13],m[2]*x+m[6]*y+m[10]*z+m[14],m[3]*x+m[7]*y+m[11]*z+m[15]];

/* ── GL helpers ────────────────────────────────────────────────────── */
function mkShader(gl:WebGL2RenderingContext,src:string,t:number){const s=gl.createShader(t)!;gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))console.error(gl.getShaderInfoLog(s));return s;}
function mkProg(gl:WebGL2RenderingContext,vs:string,fs:string){const p=gl.createProgram()!;gl.attachShader(p,mkShader(gl,vs,gl.VERTEX_SHADER));gl.attachShader(p,mkShader(gl,fs,gl.FRAGMENT_SHADER));gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))console.error(gl.getProgramInfoLog(p));return p;}

/* ── Component ─────────────────────────────────────────────────────── */

const Waterfall3D: React.FC<Waterfall3DProps> = ({ getSpectrumData, sampleRate, onClose }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef(0);
  const frameRef = useRef(0);

  const [heightScale, setHeightScale] = useState(0.7);
  const heightScaleRef = useRef(0.7);
  heightScaleRef.current = heightScale;
  const [bins, setBins] = useState(160);
  const camRef = useRef({ rotX: 0.6, rotY: -0.5, zoom: 1.2 });
  const draggingRef = useRef(false);
  const lastMouseRef = useRef({ x: 0, y: 0 });

  // Ring buffer state (shared via refs for perf)
  const writeRowRef = useRef(0);
  const rowCountRef = useRef(0);
  const texDataRef = useRef<Float32Array | null>(null);

  const downsample = useCallback((data: Uint8Array, numBins: number): Float32Array => {
    const bc = data.length, fft = bc * 2;
    const out = new Float32Array(numBins);
    for (let i = 0; i < numBins; i++) {
      const freq = Math.pow(10, LOG_MIN + (i / (numBins - 1)) * LOG_RANGE);
      const bin = (freq / sampleRate) * fft;
      const lo = Math.floor(bin), hi = Math.min(lo + 1, bc - 1);
      if (lo < 0 || hi >= bc) continue;
      const val = data[lo] * (1 - (bin - lo)) + data[hi] * (bin - lo);
      out[i] = val / 255;
    }
    return out;
  }, [sampleRate]);

  // Stable refs for render loop (avoids effect re-runs)
  const getSpectrumRef = useRef(getSpectrumData);
  getSpectrumRef.current = getSpectrumData;
  const downsampleRef = useRef(downsample);
  downsampleRef.current = downsample;

  /* Mouse */
  const onMouseDown = useCallback((e: React.MouseEvent) => { draggingRef.current = true; lastMouseRef.current = { x: e.clientX, y: e.clientY }; }, []);
  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!draggingRef.current) return;
    const c = camRef.current;
    c.rotY += (e.clientX - lastMouseRef.current.x) * 0.005;
    c.rotX = Math.max(0.05, Math.min(1.5, c.rotX + (e.clientY - lastMouseRef.current.y) * 0.005));
    lastMouseRef.current = { x: e.clientX, y: e.clientY };
  }, []);
  const onMouseUp = useCallback(() => { draggingRef.current = false; }, []);

  // Native wheel listener (passive: false) so we can preventDefault
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      camRef.current.zoom = Math.max(0.4, Math.min(3, camRef.current.zoom - e.deltaY * 0.002));
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, []);

  /* WebGL */
  useEffect(() => {
    const canvas = canvasRef.current, overlay = overlayRef.current;
    if (!canvas || !overlay) return;
    const gl = canvas.getContext('webgl2', { antialias: true, alpha: false });
    if (!gl) return;

    const meshProg = mkProg(gl, MESH_VERT, MESH_FRAG);
    const lineProg = mkProg(gl, LINE_VERT, LINE_FRAG);

    // Mesh uniforms/attrs
    const uMVP_m = gl.getUniformLocation(meshProg, 'uMVP');
    const uData = gl.getUniformLocation(meshProg, 'uData');
    const uRows = gl.getUniformLocation(meshProg, 'uRows');
    const uWriteRow = gl.getUniformLocation(meshProg, 'uWriteRow');
    const uBins = gl.getUniformLocation(meshProg, 'uBins');
    const uHS = gl.getUniformLocation(meshProg, 'uHeightScale');
    const aGrid = gl.getAttribLocation(meshProg, 'aGrid');

    // Line uniforms/attrs
    const uMVP_l = gl.getUniformLocation(lineProg, 'uMVP');
    const uColor = gl.getUniformLocation(lineProg, 'uColor');
    const aPos = gl.getAttribLocation(lineProg, 'aPos');

    // ── Build static grid mesh (triangle strip indices as triangles) ──
    // Each quad: (bin, row) → (bin+1, row) → (bin, row+1) → (bin+1, row+1)
    const gridVerts: number[] = [];
    for (let r = 0; r < MAX_ROWS - 1; r++) {
      for (let b = 0; b < bins - 1; b++) {
        gridVerts.push(b, r, b+1, r, b, r+1);
        gridVerts.push(b+1, r, b+1, r+1, b, r+1);
      }
    }
    const meshData = new Float32Array(gridVerts);
    const meshVAO = gl.createVertexArray()!;
    const meshVBO = gl.createBuffer()!;
    gl.bindVertexArray(meshVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, meshVBO);
    gl.bufferData(gl.ARRAY_BUFFER, meshData, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(aGrid);
    gl.vertexAttribPointer(aGrid, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    const meshVertCount = gridVerts.length / 2;

    // ── Build grid lines ──
    const lineVerts: number[] = [];
    for (const f of GRID_FREQS) {
      const x = ((Math.log10(f) - LOG_MIN) / LOG_RANGE) - 0.5;
      lineVerts.push(x, 0, -0.5, x, 0, 0.5);
    }
    for (let t = 0; t <= 4; t++) { const z = t/4-0.5; lineVerts.push(-0.5,0,z, 0.5,0,z); }
    for (let dB = -72; dB <= 0; dB += 24) { const y = (dB-DB_MIN)/DB_RANGE; lineVerts.push(-0.5,y,-0.5, -0.5,y,0.5); }
    const lineData = new Float32Array(lineVerts);
    const lineVAO = gl.createVertexArray()!;
    const lineVBO = gl.createBuffer()!;
    gl.bindVertexArray(lineVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, lineVBO);
    gl.bufferData(gl.ARRAY_BUFFER, lineData, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    const lineVertCount = lineVerts.length / 3;

    // ── Data texture (bins × MAX_ROWS, R32F) ──
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const texBuf = new Float32Array(bins * MAX_ROWS);
    texDataRef.current = texBuf;
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, bins, MAX_ROWS, 0, gl.RED, gl.FLOAT, texBuf);

    writeRowRef.current = 0;
    rowCountRef.current = 0;

    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    const octx = overlay.getContext('2d');

    const render = () => {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== w*dpr || canvas.height !== h*dpr) {
        canvas.width = w*dpr; canvas.height = h*dpr;
        overlay.width = w*dpr; overlay.height = h*dpr;
      }
      gl.viewport(0, 0, canvas.width, canvas.height);

      // Capture new row
      frameRef.current++;
      if (frameRef.current % CAPTURE_EVERY === 0) {
        const raw = getSpectrumRef.current();
        if (raw.length > 0 && texDataRef.current) {
          const row = downsampleRef.current(raw, bins);
          const wr = writeRowRef.current;
          // Write into ring buffer
          texDataRef.current.set(row, wr * bins);
          // Upload just this one row to the texture (fast!)
          gl.bindTexture(gl.TEXTURE_2D, tex);
          gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, wr, bins, 1, gl.RED, gl.FLOAT, row);
          writeRowRef.current = (wr + 1) % MAX_ROWS;
          rowCountRef.current = Math.min(rowCountRef.current + 1, MAX_ROWS);
        }
      }

      const cam = camRef.current;
      const hs = heightScaleRef.current;

      // MVP
      const proj = m4P(0.8, w/h, 0.1, 20);
      const view = m4M(m4T(0, -0.1, -2.5/cam.zoom), m4M(m4RX(cam.rotX), m4RY(cam.rotY)));
      const model = m4S(1, hs, 1);
      const mvp = m4M(proj, m4M(view, model));

      gl.clearColor(0.031, 0.031, 0.039, 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      // Grid lines
      gl.useProgram(lineProg);
      gl.uniformMatrix4fv(uMVP_l, false, mvp);
      gl.uniform4f(uColor!, 1, 1, 1, 0.08);
      gl.bindVertexArray(lineVAO);
      gl.drawArrays(gl.LINES, 0, lineVertCount);

      // Mesh
      if (rowCountRef.current >= 2) {
        gl.useProgram(meshProg);
        gl.uniformMatrix4fv(uMVP_m, false, mvp);
        gl.uniform1i(uData, 0);
        gl.uniform1i(uRows, rowCountRef.current);
        gl.uniform1i(uWriteRow, writeRowRef.current);
        gl.uniform1i(uBins, bins);
        gl.uniform1f(uHS, hs);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.bindVertexArray(meshVAO);
        gl.drawArrays(gl.TRIANGLES, 0, meshVertCount);
      }

      gl.bindVertexArray(null);

      // 2D labels
      if (octx) {
        octx.clearRect(0, 0, overlay.width, overlay.height);
        octx.scale(dpr, dpr);
        octx.font = '9px monospace';
        octx.fillStyle = 'rgba(255,255,255,0.35)';
        octx.textAlign = 'center';
        for (const f of GRID_FREQS) {
          const x3 = ((Math.log10(f)-LOG_MIN)/LOG_RANGE)-0.5;
          const c = m4Apply(mvp, x3, 0, 0.55);
          if (c[3]>0) octx.fillText(formatFreq(f), (c[0]/c[3]*0.5+0.5)*w, (1-(c[1]/c[3]*0.5+0.5))*h+10);
        }
        octx.textAlign = 'right';
        for (let dB=-72;dB<=0;dB+=24) {
          const y3=((dB-DB_MIN)/DB_RANGE)*hs;
          const c=m4Apply(mvp,-0.55,y3,-0.5);
          if(c[3]>0) octx.fillText(`${dB}`, (c[0]/c[3]*0.5+0.5)*w-4, (1-(c[1]/c[3]*0.5+0.5))*h+3);
        }
        octx.textAlign='center'; octx.fillStyle='rgba(255,255,255,0.25)'; octx.font='10px monospace';
        const fc=m4Apply(mvp,0,0,0.65); if(fc[3]>0) octx.fillText('Frequency (Hz)',(fc[0]/fc[3]*0.5+0.5)*w,(1-(fc[1]/fc[3]*0.5+0.5))*h+22);
        const dc=m4Apply(mvp,-0.6,hs*0.5,-0.5); if(dc[3]>0) octx.fillText('dBFS',(dc[0]/dc[3]*0.5+0.5)*w-8,(1-(dc[1]/dc[3]*0.5+0.5))*h);
        octx.setTransform(1,0,0,1,0,0);
      }

      rafRef.current = requestAnimationFrame(render);
    };

    rafRef.current = requestAnimationFrame(render);
    return () => { cancelAnimationFrame(rafRef.current); gl.deleteProgram(meshProg); gl.deleteProgram(lineProg); gl.deleteTexture(tex); };
  // Only rebuild GL context when bins changes (new mesh + texture size needed)
  // heightScale and camera are read from refs inside the render loop
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bins]);

  return (
    <div className="waterfall3d-overlay" onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div className="waterfall3d-modal">
        <div className="waterfall3d-header">
          <span className="waterfall3d-title">3D Spectrum Waterfall</span>
          <div className="waterfall3d-controls">
            <label className="waterfall3d-label">Height
              <input type="range" min="0.2" max="2" step="0.05" value={heightScale} onChange={e=>setHeightScale(parseFloat(e.target.value))} />
            </label>
            <label className="waterfall3d-label">Bins
              <select className="waterfall3d-select" value={bins} onChange={e=>{setBins(Number(e.target.value));writeRowRef.current=0;rowCountRef.current=0;texDataRef.current=null;}}>
                {BIN_OPTIONS.map(b=><option key={b} value={b}>{b}</option>)}
              </select>
            </label>
            <button className="waterfall3d-btn" onClick={()=>{camRef.current={rotX:0.6,rotY:-0.5,zoom:1.2};}}>Reset</button>
            <button className="waterfall3d-btn" onClick={()=>{writeRowRef.current=0;rowCountRef.current=0;if(texDataRef.current)texDataRef.current.fill(0);}}>Clear</button>
          </div>
          <button className="waterfall3d-close" onClick={onClose}>&times;</button>
        </div>
        <div className="waterfall3d-body" ref={containerRef}
          onMouseDown={onMouseDown} onMouseMove={onMouseMove}
          onMouseUp={onMouseUp} onMouseLeave={onMouseUp}>
          <canvas ref={canvasRef} className="waterfall3d-canvas" />
          <canvas ref={overlayRef} className="waterfall3d-canvas waterfall3d-overlay-canvas" />
          <div className="waterfall3d-hint">Drag to rotate · Scroll to zoom</div>
        </div>
      </div>
    </div>
  );
};

export default Waterfall3D;
