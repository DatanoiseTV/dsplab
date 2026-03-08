import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Keyboard, MousePointer2, ChevronLeft, ChevronRight, Volume2, Volume1 } from 'lucide-react';

interface KnobProps {
  value: number;
  min: number;
  max: number;
  label: string;
  onChange: (val: number) => void;
  size?: number;
}

const Knob: React.FC<KnobProps> = ({ value, min, max, label, onChange, size = 32 }) => {
  const [isDragging, setIsMouseDown] = useState(false);
  const startY = useRef(0);
  const startValue = useRef(0);

  const onMouseDown = (e: React.MouseEvent | React.TouchEvent) => {
    setIsMouseDown(true);
    startY.current = 'touches' in e ? e.touches[0].clientY : e.clientY;
    startValue.current = value;
    document.body.style.cursor = 'ns-resize';
  };

  useEffect(() => {
    const onMouseMove = (e: MouseEvent | TouchEvent) => {
      if (!isDragging) return;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
      const deltaY = startY.current - clientY;
      const range = max - min;
      const step = range / 200; // sensitivity
      let newValue = startValue.current + deltaY * step;
      newValue = Math.max(min, Math.min(max, newValue));
      onChange(Math.round(newValue));
    };

    const onMouseUp = () => {
      setIsMouseDown(false);
      document.body.style.cursor = 'default';
    };

    if (isDragging) {
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
      window.addEventListener('touchmove', onMouseMove, { passive: false });
      window.addEventListener('touchend', onMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('touchmove', onMouseMove);
      window.removeEventListener('touchend', onMouseUp);
    };
  }, [isDragging, max, min, onChange]);

  // SVG angle calculation
  const angle = ((value - min) / (max - min)) * 270 - 135;

  return (
    <div className="knob-unit" style={{ width: size, userSelect: 'none' }}>
      <div className="knob-label" style={{ fontSize: '7px', color: '#666', marginBottom: '2px', textAlign: 'center' }}>{label}</div>
      <div 
        onMouseDown={onMouseDown} 
        onTouchStart={onMouseDown}
        style={{ 
          width: size, height: size, 
          position: 'relative', 
          cursor: 'ns-resize' 
        }}
      >
        <svg width={size} height={size} viewBox="0 0 40 40">
          {/* Knob Outer ring */}
          <circle cx="20" cy="20" r="18" fill="#1a1a1a" stroke="#333" strokeWidth="1" />
          {/* Knob Inner track */}
          <path 
            d="M 10 32 A 16 16 0 1 1 30 32" 
            fill="none" stroke="#111" strokeWidth="2" strokeLinecap="round" 
          />
          {/* Value Track */}
          <path 
            d="M 10 32 A 16 16 0 1 1 30 32" 
            fill="none" stroke="#ffcc00" strokeWidth="2" strokeLinecap="round" 
            strokeDasharray={`${((value - min) / (max - min)) * 75} 100`}
            style={{ transition: 'stroke-dasharray 0.1s' }}
          />
          {/* Knob Cap */}
          <g transform={`rotate(${angle} 20 20)`}>
            <circle cx="20" cy="20" r="14" fill="#2d2d2d" style={{ filter: 'drop-shadow(0 2px 2px rgba(0,0,0,0.5))' }} />
            <rect x="19" y="8" width="2" height="8" rx="1" fill="#ffcc00" />
          </g>
        </svg>
      </div>
      <div className="knob-value" style={{ fontSize: '8px', color: '#ffcc00', marginTop: '2px', textAlign: 'center' }}>{value}</div>
    </div>
  );
};

interface VirtualMIDIProps {
  onCC: (cc: number, value: number) => void;
  onNoteOn: (note: number, velocity: number) => void;
  onNoteOff: (note: number) => void;
}

const KNOB_CCS = [30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41];

const KEY_LABELS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const KEY_TYPES = ['white', 'black', 'white', 'black', 'white', 'white', 'black', 'white', 'black', 'white', 'black', 'white'];
const KEYBOARD_MAPPING = ['a', 'w', 's', 'e', 'd', 'f', 't', 'g', 'y', 'h', 'u', 'j', 'k', 'o', 'l', 'p', ';', "'"];

const WHITE_KEY_WIDTH = 22;
const BLACK_KEY_WIDTH = 14;

const VirtualMIDI: React.FC<VirtualMIDIProps> = ({ onCC, onNoteOn, onNoteOff }) => {
  const [activeNotes, setActiveNotes] = useState<Set<number>>(new Set());
  const [mouseActiveNotes, setMouseActiveNotes] = useState<Set<number>>(new Set());
  const [kbEnabled, setKbEnabled] = useState(false);
  const [isMouseDown, setIsMouseDown] = useState(false);
  const [octave, setOctave] = useState(3);
  const [velocity, setVelocity] = useState(100);
  const [ccValues, setCcValues] = useState<Record<number, number>>(
    KNOB_CCS.reduce((acc, cc) => ({ ...acc, [cc]: 64 }), {})
  );
  
  const containerRef = useRef<HTMLDivElement>(null);
  const [numKeys, setNumKeys] = useState(25);

  const baseNote = octave * 12 + 12;

  // Adaptive keyboard width logic
  useEffect(() => {
    if (!containerRef.current) return;
    const updateSize = () => {
      if (containerRef.current) {
        // Subtract horizontal padding (20px total)
        const width = containerRef.current.offsetWidth - 20;
        const maxWhiteKeys = Math.floor(width / WHITE_KEY_WIDTH);
        let estimatedTotalKeys = Math.floor((maxWhiteKeys / 7) * 12);
        setNumKeys(Math.max(12, Math.min(estimatedTotalKeys, 127 - baseNote)));
      }
    };

    const observer = new ResizeObserver(updateSize);
    observer.observe(containerRef.current);
    updateSize();
    return () => observer.disconnect();
  }, [baseNote]);

  const generatedKeys = Array.from({ length: numKeys }).map((_, i) => {
    const chromaticIdx = i % 12;
    return {
      offset: i,
      label: KEY_LABELS[chromaticIdx],
      type: KEY_TYPES[chromaticIdx],
      kbChar: KEYBOARD_MAPPING[i] || ''
    };
  });

  const handleNoteOn = useCallback((note: number, isMouse = false) => {
    if (isMouse) {
      setMouseActiveNotes(prev => {
        if (prev.has(note)) return prev;
        const next = new Set(prev);
        next.add(note);
        onNoteOn(note, velocity);
        return next;
      });
    } else {
      setActiveNotes(prev => {
        if (prev.has(note)) return prev;
        const next = new Set(prev);
        next.add(note);
        onNoteOn(note, velocity);
        return next;
      });
    }
  }, [onNoteOn, velocity]);

  const handleNoteOff = useCallback((note: number, isMouse = false) => {
    if (isMouse) {
      setMouseActiveNotes(prev => {
        if (!prev.has(note)) return prev;
        const next = new Set(prev);
        next.delete(note);
        onNoteOff(note);
        return next;
      });
    } else {
      setActiveNotes(prev => {
        if (!prev.has(note)) return prev;
        const next = new Set(prev);
        next.delete(note);
        onNoteOff(note);
        return next;
      });
    }
  }, [onNoteOff]);

  const handleAllMouseNotesOff = useCallback(() => {
    mouseActiveNotes.forEach(note => onNoteOff(note));
    setMouseActiveNotes(new Set());
  }, [mouseActiveNotes, onNoteOff]);

  const handleCCChange = (cc: number, val: number) => {
    setCcValues(prev => ({ ...prev, [cc]: val }));
    onCC(cc, val);
  };

  useEffect(() => {
    const onGlobalMouseUp = () => {
      setIsMouseDown(false);
      handleAllMouseNotesOff();
    };
    window.addEventListener('mouseup', onGlobalMouseUp);
    return () => window.removeEventListener('mouseup', onGlobalMouseUp);
  }, [handleAllMouseNotesOff]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const key = e.key.toLowerCase();
      if (key === 'z') { setOctave(o => Math.max(0, o - 1)); return; }
      if (key === 'x') { setOctave(o => Math.min(8, o + 1)); return; }
      if (key === 'c') { setVelocity(v => Math.max(1, v - 20)); return; }
      if (key === 'v') { setVelocity(v => Math.min(127, v + 20)); return; }
      if (!kbEnabled || e.repeat) return;
      
      const mapIdx = KEYBOARD_MAPPING.indexOf(key);
      if (mapIdx !== -1 && mapIdx < numKeys) handleNoteOn(baseNote + mapIdx);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (!kbEnabled) return;
      const mapIdx = KEYBOARD_MAPPING.indexOf(e.key.toLowerCase());
      if (mapIdx !== -1 && mapIdx < numKeys) handleNoteOff(baseNote + mapIdx);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [kbEnabled, baseNote, handleNoteOn, handleNoteOff, numKeys]);

  const onKeyMouseDown = (note: number) => {
    setIsMouseDown(true);
    handleNoteOn(note, true);
  };

  const onKeyMouseEnter = (note: number) => {
    if (isMouseDown) {
      handleAllMouseNotesOff();
      handleNoteOn(note, true);
    }
  };

  return (
    <div className="virtual-midi-panel">
      <div className="midi-controls-row">
        <div className="midi-group">
          <span className="mini-label">OCTAVE</span>
          <div className="stepper">
            <ChevronLeft size={10} style={{ cursor: 'pointer' }} onClick={() => setOctave(o => Math.max(0, o - 1))} />
            <span className="stepper-value">{octave - 2}</span>
            <ChevronRight size={10} style={{ cursor: 'pointer' }} onClick={() => setOctave(o => Math.min(8, o + 1))} />
          </div>
        </div>
        <div className="midi-group">
          <span className="mini-label">VELOCITY</span>
          <div className="stepper">
            <Volume1 size={10} style={{ cursor: 'pointer' }} onClick={() => setVelocity(v => Math.max(1, v - 20))} />
            <span className="stepper-value">{velocity}</span>
            <Volume2 size={10} style={{ cursor: 'pointer' }} onClick={() => setVelocity(v => Math.min(127, v + 20))} />
          </div>
        </div>
        <div className="spacer" />
        <button className={`kb-toggle ${kbEnabled ? 'active' : ''}`} onClick={() => setKbEnabled(!kbEnabled)}>
          {kbEnabled ? <Keyboard size={10} /> : <MousePointer2 size={10} />}
          {kbEnabled ? 'KB ON' : 'MOUSE'}
        </button>
      </div>

      <div className="knobs-row">
        {KNOB_CCS.map(cc => (
          <Knob 
            key={cc} 
            label={`CC ${cc}`} 
            value={ccValues[cc]} 
            min={0} 
            max={127} 
            onChange={(val) => handleCCChange(cc, val)} 
          />
        ))}
      </div>

      <div className="keyboard-container" ref={containerRef}>
        <div className="keyboard-inner">
          {generatedKeys.map((k, i) => {
            const note = baseNote + k.offset;
            const isActive = activeNotes.has(note) || mouseActiveNotes.has(note);
            const whiteKeysCount = generatedKeys.filter((x, idx) => x.type === 'white' && idx < i).length;
            
            if (k.type === 'white') {
              return (
                <div key={k.offset} className={`key white ${isActive ? 'active' : ''}`}
                  onMouseDown={() => onKeyMouseDown(note)}
                  onMouseEnter={() => onKeyMouseEnter(note)}
                  onMouseLeave={() => isMouseDown && handleNoteOff(note, true)}
                  onTouchStart={(e) => { e.preventDefault(); handleNoteOn(note, true); }}
                  onTouchEnd={(e) => { e.preventDefault(); handleNoteOff(note, true); }}>
                  <div className="key-label">{k.kbChar.toUpperCase()}</div>
                  <div className="note-name">{k.label}</div>
                </div>
              );
            } else {
              return (
                <div key={k.offset} className={`key black ${isActive ? 'active' : ''}`}
                  style={{ left: `${whiteKeysCount * WHITE_KEY_WIDTH - (BLACK_KEY_WIDTH / 2)}px`, position: 'absolute' }}
                  onMouseDown={() => onKeyMouseDown(note)}
                  onMouseEnter={() => onKeyMouseEnter(note)}
                  onMouseLeave={() => isMouseDown && handleNoteOff(note, true)}
                  onTouchStart={(e) => { e.preventDefault(); handleNoteOn(note, true); }}
                  onTouchEnd={(e) => { e.preventDefault(); handleNoteOff(note, true); }}>
                  <div className="key-label">{k.kbChar.toUpperCase()}</div>
                </div>
              );
            }
          })}
        </div>
      </div>
    </div>
  );
};

export default VirtualMIDI;
