import React, { useEffect, useRef, useState } from 'react';
interface ScopeViewProps {
  getScopeData: () => { l: Float32Array; r: Float32Array };
  getProbedData?: (name: string) => number[] | null;
  probes?: string[];
}

type TriggerMode = 'NONE' | 'AUTO';
type ScopeMode = 'L/R' | 'X/Y';

const ScopeView: React.FC<ScopeViewProps> = ({ getScopeData, getProbedData, probes = [] }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [triggerMode, setTriggerMode] = useState<TriggerMode>('AUTO');
  const [scopeMode, setScopeMode] = useState<ScopeMode>('L/R');
  const [threshold, setThreshold] = useState<number>(0.0);
  const [gain, setGain] = useState<number>(1.0);
  const [zoom, setZoom] = useState<number>(1.0);
  
  const dimensionsRef = useRef({ width: 800, height: 200, dpr: 1 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        const dpr = window.devicePixelRatio || 1;
        const width = Math.floor(entry.contentRect.width);
        const height = Math.floor(entry.contentRect.height);
        
        if (width > 0 && height > 0) {
          dimensionsRef.current = { width, height, dpr };
          canvas.width = width * dpr;
          canvas.height = height * dpr;
        }
      }
    });
    
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrame: number;

    const render = () => {
      const { width, height, dpr } = dimensionsRef.current;
      const scopeData = getScopeData();
      
      ctx.save();
      ctx.scale(dpr, dpr);
      const halfHeight = height / 2;

      ctx.fillStyle = '#050a05';
      ctx.fillRect(0, 0, width, height);

      // Find Trigger Point (using Left channel as origin)
      let startIdx = 0;
      if (triggerMode === 'AUTO') {
        const searchRange = scopeData.l.length / 2;
        for (let i = 1; i < searchRange; i++) {
          if (scopeData.l[i-1] <= threshold && scopeData.l[i] > threshold) {
            startIdx = i;
            break;
          }
        }
      }

      const samplesToShow = Math.floor((scopeData.l.length / 2) / zoom);
      const displayDataL = scopeData.l.subarray(startIdx, startIdx + samplesToShow);
      const displayDataR = scopeData.r.subarray(startIdx, startIdx + samplesToShow);

      let isStereo = scopeMode === 'L/R' && scopeData.r && scopeData.r.length > 0;
      // Grid
      ctx.strokeStyle = 'rgba(0, 255, 0, 0.15)';
      ctx.lineWidth = 1;
      
      // Vertical grid lines (Time)
      for (let i = 0; i <= 10; i++) {
        const x = (width / 10) * i;
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
      }

      // Horizontal Grid lines and Labels
      ctx.fillStyle = 'rgba(0, 255, 0, 0.7)';
      ctx.font = '10px monospace';
      const drawHGrid = (centerY: number, ampY: number) => {
        const vals = [1.0, 0.5, 0, -0.5, -1.0];
        vals.forEach((v) => {
          const y = centerY - (v * ampY);
          const logicalVal = v / gain;
          ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
          // Dont draw overlapping text for 0 in stereo mode if its crowded, but the logic is fine
          ctx.fillText(logicalVal.toFixed(2), 5, y - 4);
        });
      };

      if (scopeMode === 'X/Y') {
        const centerY = height / 2;
        const ampY = halfHeight * 0.9;
        drawHGrid(centerY, ampY);
        
        ctx.strokeStyle = '#00ff00';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let i = 0; i < displayDataL.length; i++) {
          // X = Left, Y = Right (Lissajous)
          const xx = (displayDataL[i] * gain * halfHeight * 0.9) + (width / 2);
          const yy = (-displayDataR[i] * gain * halfHeight * 0.9) + halfHeight; // invert Y conventionally
          if (i === 0) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy);
        }
        ctx.stroke();
      } else {
        // L/R Mode
        let sliceWidth = width / displayDataL.length;

        if (isStereo) {
          drawHGrid(height / 4, (height / 4) * 0.9);
          drawHGrid(height * 0.75, (height / 4) * 0.9);

          const quarterHeight = height / 4;

          // Left Trace (Top)
          ctx.strokeStyle = '#00ff00';
          ctx.lineWidth = 2;
          ctx.beginPath();
          let x = 0;
          for (let i = 0; i < displayDataL.length; i++) {
            const y = (-displayDataL[i] * gain * quarterHeight * 0.9) + quarterHeight;
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            x += sliceWidth;
          }
          ctx.stroke();

          // Right Trace (Bottom)
          ctx.strokeStyle = '#00ff00';
          ctx.lineWidth = 2;
          ctx.beginPath();
          x = 0;
          for (let i = 0; i < displayDataR.length; i++) {
            const y = (-displayDataR[i] * gain * quarterHeight * 0.9) + (height * 0.75);
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            x += sliceWidth;
          }
          ctx.stroke();
        } else {
          drawHGrid(height / 2, halfHeight * 0.9);

          // Mono Trace (Full Height)
          ctx.strokeStyle = '#00ff00';
          ctx.lineWidth = 2;
          ctx.beginPath();
          let x = 0;
          for (let i = 0; i < displayDataL.length; i++) {
            const y = (-displayDataL[i] * gain * halfHeight * 0.9) + halfHeight;
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            x += sliceWidth;
          }
          ctx.stroke();
        }

        // Probed Trace
        if (probes.length > 0 && getProbedData) {
          const probedData = getProbedData(probes[0]);
          if (probedData && probedData.length > 0) {
            ctx.strokeStyle = '#ffcc00';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            let x = 0;
            sliceWidth = width / probedData.length;
            for (let i = 0; i < probedData.length; i++) {
              const y = (-probedData[i] * gain * halfHeight * 0.9) + halfHeight;
              if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
              x += sliceWidth;
            }
            ctx.stroke();
            ctx.setLineDash([]);
          }
        }
      }

      ctx.restore();
      animationFrame = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animationFrame);
  }, [getScopeData, getProbedData, probes, triggerMode, scopeMode, threshold, gain, zoom]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', border: '1px solid #333', background: '#000', borderRadius: '8px', overflow: 'hidden' }}>
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', minHeight: 0 }}>
        <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
      </div>
      
      <div style={{ 
        display: 'flex', alignItems: 'center', height: '42px', borderTop: '1px solid #222',
        gap: '12px', background: '#080808', padding: '0 12px', width: '100%'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '8px', color: '#666', fontWeight: 'bold' }}>SYNC</span>
          <select value={triggerMode} onChange={(e) => setTriggerMode(e.target.value as TriggerMode)} style={{ background: '#111', border: '1px solid #333', color: '#00ff00', fontSize: '9px', fontWeight: 'bold', borderRadius: '3px', padding: '1px 4px' }}>
            <option value="NONE">NONE</option>
            <option value="AUTO">AUTO</option>
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '8px', color: '#666', fontWeight: 'bold' }}>MODE</span>
          <select value={scopeMode} onChange={(e) => setScopeMode(e.target.value as ScopeMode)} style={{ background: '#111', border: '1px solid #333', color: '#00ff00', fontSize: '9px', fontWeight: 'bold', borderRadius: '3px', padding: '1px 4px' }}>
            <option value="L/R">L/R</option>
            <option value="X/Y">X/Y</option>
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '8px', color: '#666', fontWeight: 'bold' }}>GAIN</span>
          <select value={gain} onChange={(e) => setGain(parseFloat(e.target.value))} style={{ background: '#111', border: '1px solid #333', color: '#00ff00', fontSize: '9px', fontWeight: 'bold', borderRadius: '3px', padding: '1px 4px' }}>
            <option value={0.5}>0.5</option>
            <option value={1}>1.0</option>
            <option value={2}>2.0</option>
            <option value={5}>5.0</option>
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '8px', color: '#666', fontWeight: 'bold' }}>TIME</span>
          <select value={zoom} onChange={(e) => setZoom(parseFloat(e.target.value))} style={{ background: '#111', border: '1px solid #333', color: '#00ff00', fontSize: '9px', fontWeight: 'bold', borderRadius: '3px', padding: '1px 4px' }}>
            <option value={0.5}>x0.5</option>
            <option value={1}>x1</option>
            <option value={2}>x2</option>
            <option value={5}>x5</option>
          </select>
        </div>
        {triggerMode === 'AUTO' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '8px', color: '#666', fontWeight: 'bold' }}>THR</span>
            <select value={threshold} onChange={(e) => setThreshold(parseFloat(e.target.value))} style={{ background: '#111', border: '1px solid #333', color: '#00ff00', fontSize: '9px', fontWeight: 'bold', borderRadius: '3px', padding: '1px 4px' }}>
              <option value={0.0}>0.0</option>
              <option value={0.2}>0.2</option>
              <option value={0.5}>0.5</option>
            </select>
          </div>
        )}
      </div>
    </div>
  );
};

export default ScopeView;
