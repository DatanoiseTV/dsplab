import React, { useEffect, useRef, useState } from 'react';

interface ScopeViewProps {
  getScopeData: () => Float32Array;
  getSpectrumData: () => Uint8Array;
  getProbedData?: (name: string) => number[] | null;
  probes?: string[];
}

type TriggerMode = 'NONE' | 'AUTO';

const ScopeView: React.FC<ScopeViewProps> = ({ getScopeData, getSpectrumData, getProbedData, probes = [] }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [triggerMode, setTriggerMode] = useState<TriggerMode>('AUTO');
  const [threshold, setThreshold] = useState(0.0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrame: number;

    const render = () => {
      const scopeData = getScopeData();
      const spectrumData = getSpectrumData();
      const width = canvas.width;
      const height = canvas.height;
      const halfHeight = height / 2;

      ctx.fillStyle = '#050a05';
      ctx.fillRect(0, 0, width, height);

      // Grid
      ctx.strokeStyle = 'rgba(0, 255, 0, 0.05)';
      ctx.lineWidth = 1;
      for (let i = 0; i < width; i += 40) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, height); ctx.stroke(); }
      for (let i = 0; i < height; i += 40) { ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(width, i); ctx.stroke(); }

      // Spectrum
      ctx.fillStyle = 'rgba(0, 100, 255, 0.1)';
      const barWidth = width / 128;
      for (let i = 0; i < 128; i++) {
        const val = spectrumData[i * Math.floor(spectrumData.length / 128)];
        const barHeight = (val / 255) * height * 0.8;
        ctx.fillRect(i * barWidth, height - barHeight, barWidth - 1, barHeight);
      }

      // Find Trigger Point
      let startIdx = 0;
      if (triggerMode === 'AUTO') {
        for (let i = 1; i < scopeData.length / 2; i++) {
          // Rising edge zero-crossing (or threshold)
          if (scopeData[i-1] <= threshold && scopeData[i] > threshold) {
            startIdx = i;
            break;
          }
        }
      }

      const displayData = scopeData.subarray(startIdx, startIdx + scopeData.length / 2);

      // Main Output Trace (Trace A)
      ctx.shadowBlur = 10;
      ctx.shadowColor = '#00ff00';
      ctx.strokeStyle = '#00ff00';
      ctx.lineWidth = 2;
      ctx.beginPath();
      let sliceWidth = width / displayData.length;
      let x = 0;
      for (let i = 0; i < displayData.length; i++) {
        const y = (displayData[i] * halfHeight * 0.9) + halfHeight;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        x += sliceWidth;
      }
      ctx.stroke();

      // Probed Trace (Trace B - if active)
      // Note: Trace B doesn't support triggering in the same way as it's roll-mode downsampled data, 
      // but we still draw it if it's there. 
      // Actually, Trace B in ScopeView was meant for audio-rate. 
      // Since we changed probes to number[], let's adjust here too.
      if (probes.length > 0 && getProbedData) {
        const probedData = getProbedData(probes[0]);
        if (probedData && probedData.length > 0) {
          ctx.shadowColor = '#ffcc00';
          ctx.strokeStyle = '#ffcc00';
          ctx.lineWidth = 1.5;
          ctx.setLineDash([5, 5]);
          ctx.beginPath();
          x = 0;
          sliceWidth = width / probedData.length;
          for (let i = 0; i < probedData.length; i++) {
            // Simple normalization for the dashed trace
            const y = (probedData[i] * halfHeight * 0.9) + halfHeight;
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            x += sliceWidth;
          }
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }

      ctx.shadowBlur = 0;
      animationFrame = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animationFrame);
  }, [getScopeData, getSpectrumData, getProbedData, probes, triggerMode, threshold]);

  return (
    <div style={{ position: 'relative', height: '200px', width: '100%', border: '1px solid #333', background: '#000', borderRadius: '8px', overflow: 'hidden' }}>
      <canvas ref={canvasRef} width={800} height={200} style={{ width: '100%', height: '100%', display: 'block' }} />
      
      {/* Scope Controls */}
      <div style={{ 
        position: 'absolute', 
        top: '10px', 
        right: '10px', 
        display: 'flex', 
        gap: '8px', 
        background: 'rgba(0,0,0,0.7)', 
        padding: '4px 8px', 
        borderRadius: '4px',
        border: '1px solid #333'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ fontSize: '8px', color: '#666' }}>SYNC</span>
          <select 
            value={triggerMode} 
            onChange={(e) => setTriggerMode(e.target.value as TriggerMode)}
            style={{ background: '#111', border: '1px solid #444', color: '#00ff00', fontSize: '9px' }}
          >
            <option value="NONE">NONE</option>
            <option value="AUTO">AUTO</option>
          </select>
        </div>
        {triggerMode === 'AUTO' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ fontSize: '8px', color: '#666' }}>THR</span>
            <input 
              type="range" min="-1" max="1" step="0.1" value={threshold} 
              onChange={(e) => setThreshold(parseFloat(e.target.value))}
              style={{ width: '40px', height: '8px' }}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default ScopeView;
