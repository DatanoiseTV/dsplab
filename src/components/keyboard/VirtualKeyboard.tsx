import { useState, useCallback, useRef, useEffect } from 'react';
import { Slider } from '../controls/Slider';
import './VirtualKeyboard.css';

interface VirtualKeyboardProps {
  onNoteOn: (note: number, velocity: number) => void;
  onNoteOff: (note: number) => void;
  onCC: (cc: number, value: number) => void;
  ccLabels?: Record<number, string>;
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// Ableton-style PC keyboard mapping
// White keys: A S D F G H J K L  => C D E F G A B C D
// Black keys: W E   T Y U   O P  => C# D#  F# G# A#  C# D#
// The layout mirrors a piano: black keys sit between white keys

// Semitone offsets from base note
const WHITE_SEMITONES = [0, 2, 4, 5, 7, 9, 11, 12, 14]; // C D E F G A B C D
const BLACK_SEMITONES = [1, 3, -1, 6, 8, 10, -1, 13, 15]; // C# D# gap F# G# A# gap C# D#

// Key labels for display
const WHITE_KEYS = ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'];
const BLACK_KEYS = ['W', 'E', '', 'T', 'Y', 'U', '', 'O', 'P'];

// Keyboard event key → semitone offset
const KEY_MAP: Record<string, number> = {
  a: 0, w: 1, s: 2, e: 3, d: 4,
  f: 5, t: 6, g: 7, y: 8, h: 9, u: 10, j: 11,
  k: 12, o: 13, l: 14, p: 15,
};

function midiToNoteName(midi: number): string {
  const note = NOTE_NAMES[midi % 12];
  const octave = Math.floor(midi / 12) - 2;
  return `${note}${octave}`;
}

export function VirtualKeyboard({ onNoteOn, onNoteOff, onCC }: VirtualKeyboardProps) {
  const [baseOctave, setBaseOctave] = useState(3);
  const [velocity, setVelocity] = useState(100);
  const [sustain, setSustain] = useState(false);
  const [pitchBend, setPitchBend] = useState(8192);
  const [modWheel, setModWheel] = useState(0);
  const [pressedNotes, setPressedNotes] = useState<Set<number>>(new Set());
  const pressedKeysRef = useRef<Set<string>>(new Set());
  const sustainedNotesRef = useRef<Set<number>>(new Set());

  const baseMidi = (baseOctave + 2) * 12;

  const noteOn = useCallback(
    (note: number, vel: number) => {
      setPressedNotes((prev) => new Set(prev).add(note));
      onNoteOn(note, vel);
    },
    [onNoteOn],
  );

  const noteOff = useCallback(
    (note: number) => {
      if (sustain) {
        sustainedNotesRef.current.add(note);
        return;
      }
      setPressedNotes((prev) => {
        const next = new Set(prev);
        next.delete(note);
        return next;
      });
      onNoteOff(note);
    },
    [onNoteOff, sustain],
  );

  const toggleSustain = useCallback(() => {
    setSustain((prev) => {
      if (prev) {
        sustainedNotesRef.current.forEach((note) => {
          onNoteOff(note);
          setPressedNotes((p) => {
            const next = new Set(p);
            next.delete(note);
            return next;
          });
        });
        sustainedNotesRef.current.clear();
      }
      return !prev;
    });
  }, [onNoteOff]);

  // Keyboard events
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const key = e.key.toLowerCase();

      // Z = octave down, X = octave up
      if (key === 'z') {
        setBaseOctave((o) => Math.max(0, o - 1));
        return;
      }
      if (key === 'x') {
        setBaseOctave((o) => Math.min(7, o + 1));
        return;
      }
      // C = velocity down, V = velocity up
      if (key === 'c') {
        setVelocity((v) => Math.max(1, v - 20));
        return;
      }
      if (key === 'v') {
        setVelocity((v) => Math.min(127, v + 20));
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        toggleSustain();
        return;
      }

      const semitone = KEY_MAP[key];
      if (semitone !== undefined && !pressedKeysRef.current.has(key)) {
        pressedKeysRef.current.add(key);
        noteOn(baseMidi + semitone, velocity);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      const semitone = KEY_MAP[key];
      if (semitone !== undefined && pressedKeysRef.current.has(key)) {
        pressedKeysRef.current.delete(key);
        noteOff(baseMidi + semitone);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [baseMidi, noteOn, noteOff, velocity, toggleSustain]);

  const handlePitchBend = useCallback(
    (value: number) => {
      setPitchBend(value);
      onCC(128, value);
    },
    [onCC],
  );

  const handleModWheel = useCallback(
    (value: number) => {
      setModWheel(value);
      onCC(1, Math.round(value));
    },
    [onCC],
  );

  const handleKeycapDown = useCallback(
    (midi: number) => noteOn(midi, velocity),
    [noteOn, velocity],
  );

  const handleKeycapUp = useCallback(
    (midi: number) => noteOff(midi),
    [noteOff],
  );

  const renderKeycap = (label: string, semitone: number, type: 'white' | 'black') => {
    if (semitone === -1) {
      // Gap spacer (between E-F and B-C where there's no black key)
      return <div key={`spacer-${label}`} className="vk-keycap vk-keycap--spacer" />;
    }

    const midi = baseMidi + semitone;
    const isPressed = pressedNotes.has(midi);
    const noteName = midiToNoteName(midi);

    return (
      <div
        key={label}
        className={`vk-keycap vk-keycap--${type}${isPressed ? ' pressed' : ''}`}
        data-midi={midi}
        onPointerDown={(e) => {
          e.preventDefault();
          handleKeycapDown(midi);
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
        }}
        onPointerUp={() => handleKeycapUp(midi)}
        onPointerLeave={() => {
          if (pressedNotes.has(midi)) handleKeycapUp(midi);
        }}
      >
        <span className="vk-keycap__letter">{label}</span>
        <span className="vk-keycap__note">{noteName}</span>
      </div>
    );
  };

  return (
    <div className="vk-container">
      <div className="vk-header">
        <div className="vk-octave-selector">
          <button
            className="vk-octave-btn"
            onClick={() => setBaseOctave((o) => Math.max(0, o - 1))}
            title="Octave Down (Z)"
          >
            &minus;
          </button>
          <span className="vk-octave-label">C{baseOctave}</span>
          <button
            className="vk-octave-btn"
            onClick={() => setBaseOctave((o) => Math.min(7, o + 1))}
            title="Octave Up (X)"
          >
            +
          </button>
        </div>

        <div className="vk-vel-group">
          <span className="vk-vel-label">VEL</span>
          <Slider
            value={velocity}
            min={1}
            max={127}
            orientation="horizontal"
            onChange={setVelocity}
            width={60}
            height={12}
          />
          <span className="vk-vel-value">{velocity}</span>
        </div>

        <button
          className={`vk-sustain-btn${sustain ? ' active' : ''}`}
          onClick={toggleSustain}
        >
          SUSTAIN
          <span className="vk-sustain-hint">Space</span>
        </button>

        <div className="vk-shortcuts">
          <span className="vk-shortcut-hint">Z/X oct</span>
          <span className="vk-shortcut-hint">C/V vel</span>
        </div>

        <div className="vk-wheels-compact">
          <div className="vk-wheel-compact">
            <span className="vk-wheel-compact__label">PB</span>
            <Slider
              value={pitchBend}
              min={0}
              max={16383}
              orientation="horizontal"
              springReturn={true}
              onChange={handlePitchBend}
              width={40}
              height={12}
            />
          </div>
          <div className="vk-wheel-compact">
            <span className="vk-wheel-compact__label">MOD</span>
            <Slider
              value={modWheel}
              min={0}
              max={127}
              orientation="horizontal"
              fillFromBottom={true}
              onChange={handleModWheel}
              width={40}
              height={12}
            />
          </div>
        </div>
      </div>

      <div className="vk-rows">
        {/* Black keys row: W E _ T Y U _ O P (offset to align with piano gaps) */}
        <div className="vk-row vk-row--black">
          {BLACK_KEYS.map((label, i) =>
            renderKeycap(label || `gap${i}`, BLACK_SEMITONES[i], 'black')
          )}
        </div>
        {/* White keys row: A S D F G H J K L */}
        <div className="vk-row vk-row--white">
          {WHITE_KEYS.map((label, i) =>
            renderKeycap(label, WHITE_SEMITONES[i], 'white')
          )}
        </div>
      </div>
    </div>
  );
}
