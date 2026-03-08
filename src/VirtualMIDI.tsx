import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Keyboard, MousePointer2, ChevronLeft, ChevronRight, Volume2, Volume1 } from 'lucide-react';

interface VirtualMIDIProps {
  onCC: (cc: number, value: number) => void;
  onNoteOn: (note: number, velocity: number) => void;
  onNoteOff: (note: number) => void;
}

const KNOB_CCS = [30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41];

const KEY_LABELS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const KEY_TYPES = ['white', 'black', 'white', 'black', 'white', 'white', 'black', 'white', 'black', 'white', 'black', 'white'];
const KEYBOARD_MAPPING = ['a', 'w', 's', 'e', 'd', 'f', 't', 'g', 'y', 'h', 'u', 'j', 'k', 'o', 'l', 'p', ';', "'"];

const VirtualMIDI: React.FC<VirtualMIDIProps> = ({ onCC, onNoteOn, onNoteOff }) => {
  const [activeNotes, setActiveNotes] = useState<Set<number>>(new Set());
  const [kbEnabled, setKbEnabled] = useState(false);
  const [octave, setOctave] = useState(3);
  const [velocity, setVelocity] = useState(100);
  const [ccValues, setCcValues] = useState<Record<number, number>>(
    KNOB_CCS.reduce((acc, cc) => ({ ...acc, [cc]: 64 }), {})
  );
  
  const containerRef = useRef<HTMLDivElement>(null);
  const [numKeys, setNumKeys] = useState(25); // Default

  const baseNote = octave * 12 + 12;

  // Adaptive keyboard width logic
  useEffect(() => {
    if (!containerRef.current) return;
    const updateSize = () => {
      if (containerRef.current) {
        const width = containerRef.current.offsetWidth;
        // White keys are 30px wide. We calculate how many fit.
        // We want to fill the width but stay musically consistent (multiples of 12 preferred, or just as many as fit)
        const whiteKeyWidth = 30;
        const maxWhiteKeys = Math.floor(width / whiteKeyWidth);
        
        // Convert white keys back to total keys (including black)
        // Roughly 7 white keys per 12 keys
        let estimatedTotalKeys = Math.floor((maxWhiteKeys / 7) * 12);
        
        // Clamp to reasonable range
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

  const handleNoteOn = useCallback((note: number) => {
    setActiveNotes(prev => {
      if (prev.has(note)) return prev;
      const next = new Set(prev);
      next.add(note);
      onNoteOn(note, velocity);
      return next;
    });
  }, [onNoteOn, velocity]);

  const handleNoteOff = useCallback((note: number) => {
    setActiveNotes(prev => {
      if (!prev.has(note)) return prev;
      const next = new Set(prev);
      next.delete(note);
      onNoteOff(note);
      return next;
    });
  }, [onNoteOff]);

  const handleCCChange = (cc: number, val: number) => {
    setCcValues(prev => ({ ...prev, [cc]: val }));
    onCC(cc, val);
  };

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
          <div key={cc} className="knob-unit">
            <div className="knob-label">{cc}</div>
            <input type="range" min="0" max="127" value={ccValues[cc]} onChange={(e) => handleCCChange(cc, parseInt(e.target.value))} />
            <div className="knob-value">{ccValues[cc]}</div>
          </div>
        ))}
      </div>

      <div className="keyboard-container" ref={containerRef}>
        <div className="keyboard-inner">
          {generatedKeys.map((k, i) => {
            const note = baseNote + k.offset;
            const isActive = activeNotes.has(note);
            const whiteKeysCount = generatedKeys.filter((x, idx) => x.type === 'white' && idx < i).length;
            
            if (k.type === 'white') {
              return (
                <div key={k.offset} className={`key white ${isActive ? 'active' : ''}`}
                  onMouseDown={() => handleNoteOn(note)} onMouseUp={() => handleNoteOff(note)}
                  onMouseLeave={() => isActive && handleNoteOff(note)}
                  onTouchStart={(e) => { e.preventDefault(); handleNoteOn(note); }}
                  onTouchEnd={(e) => { e.preventDefault(); handleNoteOff(note); }}>
                  <div className="key-label">{k.kbChar.toUpperCase()}</div>
                  <div className="note-name">{k.label}</div>
                </div>
              );
            } else {
              return (
                <div key={k.offset} className={`key black ${isActive ? 'active' : ''}`}
                  style={{ left: `${whiteKeysCount * 30 - 10}px` }}
                  onMouseDown={() => handleNoteOn(note)} onMouseUp={() => handleNoteOff(note)}
                  onMouseLeave={() => isActive && handleNoteOff(note)}
                  onTouchStart={(e) => { e.preventDefault(); handleNoteOn(note); }}
                  onTouchEnd={(e) => { e.preventDefault(); handleNoteOff(note); }}>
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
