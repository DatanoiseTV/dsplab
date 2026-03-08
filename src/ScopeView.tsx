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
  const [gain, setGain] = useState(1.0);
  const [zoom, setZoom] = useState(1.0); // 1.0 = show half the buffer, > 1.0 = show less (zoom in)

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrame: number;

    const render = () => {
      // High DPI scaling
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
      }

      const scopeData = getScopeData();
      const spectrumData = getSpectrumData();
      
      ctx.save();
      ctx.scale(dpr, dpr);
      const width = rect.width;
      const height = rect.height;
      const halfHeight = height / 2;

      ctx.fillStyle = '#050a05';
      ctx.fillRect(0, 0, width, height);

      // Grid
      ctx.strokeStyle = 'rgba(0, 255, 0, 0.1)';
      ctx.lineWidth = 0.5;
      for (let i = 0; i < width; i += 40) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, height); ctx.stroke(); }
      for (let i = 0; i < height; i += 40) { ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(width, i); ctx.stroke(); }

      // Improved Spectrum
      // We'll use a logarithmic-ish spacing for the spectrum
      const barCount = 128;
      const barWidth = width / barCount;
      const gradient = ctx.createLinearGradient(0, height, 0, 0);
      gradient.addColorStop(0, 'rgba(0, 50, 255, 0.0)');
      gradient.addColorStop(0.5, 'rgba(0, 150, 255, 0.2)');
      gradient.addColorStop(1, 'rgba(0, 255, 255, 0.4)');
      
      ctx.fillStyle = gradient;
      for (let i = 0; i < barCount; i++) {
        // Map linear index to logarithmic frequency
        // approx log scale: freq = min * (max/min)^(i/count)
        const sampleIdx = Math.floor(Math.pow(spectrumData.length, i / barCount));
        const val = spectrumData[sampleIdx];
        const barHeight = (val / 255) * height * 0.8;
        ctx.fillRect(i * barWidth, height - barHeight, barWidth - 1, barHeight);
      }

      // Find Trigger Point
      let startIdx = 0;
      if (triggerMode === 'AUTO') {
        const searchRange = scopeData.length / 2;
        for (let i = 1; i < searchRange; i++) {
          if (scopeData[i-1] <= threshold && scopeData[i] > threshold) {
            startIdx = i;
            break;
          }
        }
      }

      // Zoom logic: determine how many samples to show
      const samplesToShow = Math.floor((scopeData.length / 2) / zoom);
      const displayData = scopeData.subarray(startIdx, startIdx + samplesToShow);

      // Main Output Trace (Trace A)
      ctx.shadowBlur = 10;
      ctx.shadowColor = '#00ff00';
      ctx.strokeStyle = '#00ff00';
      ctx.lineWidth = 2;
      ctx.beginPath();
      let sliceWidth = width / displayData.length;
      let x = 0;
      for (let i = 0; i < displayData.length; i++) {
        const y = (displayData[i] * gain * halfHeight * 0.9) + halfHeight;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        x += sliceWidth;
      }
      ctx.stroke();

      // Probed Trace (Trace B)
      if (probes.length > 0 && getProbedData) {
        const probedData = getProbedData(probes[0]);
        if (probedData && probedData.length > 0) {
          ctx.shadowBlur = 5;
          ctx.shadowColor = '#ffcc00';
          ctx.strokeStyle = '#ffcc00';
          ctx.lineWidth = 1.5;
          ctx.setLineDash([5, 5]);
          ctx.beginPath();
          x = 0;
          sliceWidth = width / probedData.length;
          for (let i = 0; i < probedData.length; i++) {
            const y = (probedData[i] * gain * halfHeight * 0.9) + halfHeight;
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            x += sliceWidth;
          }
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }

      ctx.restore();
      animationFrame = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animationFrame);
  }, [getScopeData, getSpectrumData, getProbedData, probes, triggerMode, threshold, gain, zoom]);

  return (
    <div style={{ position: 'relative', height: '200px', width: '100%', border: '1px solid #333', background: '#000', borderRadius: '8px', overflow: 'hidden' }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
      
      {/* Scope Controls */}
      <div style={{ 
        position: 'absolute', 
        top: '8px', 
        right: '8px', 
        display: 'flex', 
        flexDirection: 'column',
        gap: '6px', 
        background: 'rgba(0,0,0,0.8)', 
        padding: '6px 10px', 
        borderRadius: '4px',
        border: '1px solid #333',
        zIndex: 10
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '8px', color: '#666', fontWeight: 'bold' }}>SYNC</span>
          <select 
            value={triggerMode} 
            onChange={(e) => setTriggerMode(e.target.value as TriggerMode)}
            style={{ background: '#111', border: '1px solid #444', color: '#00ff00', fontSize: '9px', width: '50px' }}
          >
            <option value="NONE">NONE</option>
            <option value="AUTO">AUTO</option>
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '8px', color: '#666', fontWeight: 'bold' }}>GAIN</span>
          <input 
            type="range" min="0.1" max="5" step="0.1" value={gain} 
            onChange={(e) => setGain(parseFloat(e.target.value))}
            style={{ width: '50px', height: '8px' }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '8px', color: '#666', fontWeight: 'bold' }}>ZOOM</span>
          <input 
            type="range" min="1" max="10" step="0.1" value={zoom} 
            onChange={(e) => setZoom(parseFloat(e.target.value))}
            style={{ width: '50px', height: '8px' }}
          />
        </div>

        {triggerMode === 'AUTO' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '8px', color: '#666', fontWeight: 'bold' }}>THR</span>
            <input 
              type="range" min="-1" max="1" step="0.1" value={threshold} 
              onChange={(e) => setThreshold(parseFloat(e.target.value))}
              style={{ width: '50px', height: '8px' }}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default ScopeView;
