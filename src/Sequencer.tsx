import React, { useState, useEffect, useRef } from 'react';
import { Play, Square, Timer, Music, Zap, FastForward, Layers } from 'lucide-react';

export interface Step {
  active: boolean;
  note: number;
  accent: boolean;
  slide: boolean;
}

interface SequencerProps {
  steps: Step[];
  setSteps: React.Dispatch<React.SetStateAction<Step[]>>;
  bpm: number;
  setBpm: (bpm: number) => void;
  isPlaying: boolean;
  setIsPlaying: (playing: boolean) => void;
  onNoteOn: (note: number, velocity: number) => void;
  onNoteOff: (note: number) => void;
  length: number;
  setLength: (len: number) => void;
}

const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

const NoteInput: React.FC<{ value: number, onChange: (val: number) => void }> = ({ value, onChange }) => {
  const [isDragging, setIsDragging] = useState(false);
  const startY = useRef(0);
  const startValue = useRef(0);

  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    startY.current = e.clientY;
    startValue.current = value;
    document.body.style.cursor = 'ns-resize';
  };

  useEffect(() => {
    if (!isDragging) return;
    const handleMove = (e: MouseEvent) => {
      const delta = Math.floor((startY.current - e.clientY) / 5);
      const next = Math.max(0, Math.min(127, startValue.current + delta));
      if (next !== value) onChange(next);
    };
    const handleUp = () => {
      setIsDragging(false);
      document.body.style.cursor = 'default';
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [isDragging, value, onChange]);

  const noteName = NOTES[value % 12];
  const octave = Math.floor(value / 12) - 1;

  return (
    <div 
      onMouseDown={onMouseDown}
      className={`note-selector-drag ${isDragging ? 'dragging' : ''}`}
      style={{
        width: '36px', height: '20px', background: '#000', border: '1px solid #444',
        borderRadius: '3px', color: '#00ff00', fontSize: '9px', fontWeight: 'bold',
        display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'ns-resize',
        userSelect: 'none', transition: 'border-color 0.2s'
      }}
    >
      {noteName}{octave}
    </div>
  );
};

const Sequencer: React.FC<SequencerProps> = ({ 
  steps, setSteps, bpm, setBpm, isPlaying, setIsPlaying, onNoteOn, onNoteOff, length, setLength 
}) => {
  const [currentStep, setCurrentStep] = useState(-1);
  const lastNoteRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);

  const updateStep = (idx: number, patch: Partial<Step>) => {
    setSteps(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], ...patch };
      return next;
    });
  };

  const tick = () => {
    setCurrentStep(prev => {
      const next = (prev + 1) % length;
      const step = steps[next];
      const prevStep = steps[prev >= 0 ? prev : length - 1];

      if (step.active) {
        const velocity = step.accent ? 127 : 100;
        if (lastNoteRef.current !== null && (!prevStep || !prevStep.slide)) {
          onNoteOff(lastNoteRef.current);
        }
        onNoteOn(step.note, velocity);
        lastNoteRef.current = step.note;
      } else {
        if (lastNoteRef.current !== null) {
          onNoteOff(lastNoteRef.current);
          lastNoteRef.current = null;
        }
      }
      return next;
    });
  };

  useEffect(() => {
    if (isPlaying) {
      const interval = (60 / bpm) * 1000 / 4;
      timerRef.current = window.setInterval(tick, interval);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      if (lastNoteRef.current !== null) {
        onNoteOff(lastNoteRef.current);
        lastNoteRef.current = null;
      }
      setCurrentStep(-1);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isPlaying, bpm, steps, length]);

  return (
    <div className="sequencer-container">
      <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '8px' }}>
        <div className="section-title" style={{ margin: 0 }}><Music size={12} /> TB-STYLE SEQUENCER</div>
        
        <button 
          onClick={() => setIsPlaying(!isPlaying)}
          style={{ 
            background: isPlaying ? '#ff4444' : '#00ff00', 
            border: 'none', borderRadius: '4px', padding: '4px 12px', 
            color: '#000', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: '6px'
          }}
        >
          {isPlaying ? <Square size={10} fill="currentColor" /> : <Play size={10} fill="currentColor" />}
          {isPlaying ? 'STOP' : 'RUN'}
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Timer size={12} color="#666" />
          <input type="number" value={bpm} onChange={(e) => setBpm(parseInt(e.target.value))} className="bpm-input" />
          <span style={{ fontSize: '8px', color: '#666' }}>BPM</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Layers size={12} color="#666" />
          <input 
            type="number" min="1" max="16" value={length} 
            onChange={(e) => setLength(Math.max(1, Math.min(16, parseInt(e.target.value))))} 
            className="bpm-input" 
          />
          <span style={{ fontSize: '8px', color: '#666' }}>LEN</span>
        </div>
      </div>

      <div className="step-grid">
        {steps.slice(0, length).map((step, i) => (
          <div key={i} className={`step-column ${i === currentStep ? 'current' : ''}`}>
            <div 
              onClick={() => updateStep(i, { active: !step.active })}
              className={`step-led gate ${step.active ? 'active' : ''}`}
            />
            <div 
              onClick={() => updateStep(i, { accent: !step.accent })}
              className={`step-led accent ${step.accent ? 'active' : ''}`}
            >
              <Zap size={8} color={step.accent ? "#000" : "#444"} />
            </div>
            <div 
              onClick={() => updateStep(i, { slide: !step.slide })}
              className={`step-led slide ${step.slide ? 'active' : ''}`}
            >
              <FastForward size={8} color={step.slide ? "#000" : "#444"} />
            </div>
            <NoteInput value={step.note} onChange={(val) => updateStep(i, { note: val })} />
            <div className="step-number">{i + 1}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Sequencer;
