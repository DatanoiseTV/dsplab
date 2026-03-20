import { useState, useCallback, useRef, useEffect } from 'react';
import { Slider } from '../controls/Slider';
import './VirtualKeyboard.css';

interface VirtualKeyboardProps {
  onNoteOn: (note: number, velocity: number) => void;
  onNoteOff: (note: number) => void;
  onCC: (cc: number, value: number) => void;
  ccLabels?: Record<number, string>;
}

// MIDI note indices within an octave
const WHITE_NOTE_INDICES = [0, 2, 4, 5, 7, 9, 11]; // C D E F G A B
const BLACK_NOTE_INDICES = [1, 3, -1, 6, 8, 10]; // C# D# (gap) F# G# A#

// Keyboard mapping — two rows, two octaves
// Upper row: sharps/flats mapped to A-row and number-row keys
const UPPER_KEYS = [
  { key: 'a', label: 'A', type: 'white' as const, noteIndex: 0 }, // C
  { key: 's', label: 'S', type: 'black' as const, noteIndex: 1 }, // C#
  { key: 'd', label: 'D', type: 'black' as const, noteIndex: 3 }, // D#
  { key: 'f', label: 'F', type: 'white' as const, noteIndex: 4 }, // E  (gap - no black between E-F)
  { key: 'g', label: 'G', type: 'black' as const, noteIndex: 6 }, // F#
  { key: 'h', label: 'H', type: 'black' as const, noteIndex: 8 }, // G#
  { key: 'j', label: 'J', type: 'black' as const, noteIndex: 10 }, // A#
  { key: 'k', label: 'K', type: 'white' as const, noteIndex: 11 }, // B  (gap - no black between B-C)
  { key: 'l', label: 'L', type: 'black' as const, noteIndex: 13 }, // C#  (next octave)
  { key: ';', label: ':', type: 'black' as const, noteIndex: 15 }, // D#  (next octave)
  { key: "'", label: "'", type: 'white' as const, noteIndex: 16 }, // E   (next octave)
];

// Lower row: natural notes
const LOWER_KEYS = [
  { key: 'z', label: 'Z', type: 'white' as const, noteIndex: 0 },  // C
  { key: 'x', label: 'X', type: 'white' as const, noteIndex: 2 },  // D
  { key: 'c', label: 'C', type: 'white' as const, noteIndex: 4 },  // E
  { key: 'v', label: 'V', type: 'white' as const, noteIndex: 5 },  // F
  { key: 'b', label: 'B', type: 'white' as const, noteIndex: 7 },  // G
  { key: 'n', label: 'N', type: 'white' as const, noteIndex: 9 },  // A
  { key: 'm', label: 'M', type: 'white' as const, noteIndex: 11 }, // B
  { key: ',', label: ',', type: 'white' as const, noteIndex: 12 },  // C (next octave)
  { key: '.', label: '.', type: 'white' as const, noteIndex: 14 },  // D (next octave)
  { key: '/', label: '/', type: 'white' as const, noteIndex: 16 },  // E (next octave)
];

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

function midiToNoteName(midi: number): string {
  const note = NOTE_NAMES[midi % 12];
  const octave = Math.floor(midi / 12) - 2;
  return `${note}${octave}`;
}

function octaveName(midiNote: number): string {
  const octave = Math.floor(midiNote / 12) - 2;
  return `C${octave}`;
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
  const rangeLabel = `${octaveName(baseMidi)}\u2013${octaveName(baseMidi + 24)}`;

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

  // Build key-to-MIDI map
  const buildKeyMap = useCallback((): Map<string, number> => {
    const map = new Map<string, number>();
    for (const k of UPPER_KEYS) {
      map.set(k.key, baseMidi + k.noteIndex);
    }
    for (const k of LOWER_KEYS) {
      map.set(k.key, baseMidi + k.noteIndex);
    }
    return map;
  }, [baseMidi]);

  useEffect(() => {
    const keyMap = buildKeyMap();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.code === 'Space') {
        e.preventDefault();
        toggleSustain();
        return;
      }
      const key = e.key.toLowerCase();
      const midi = keyMap.get(key);
      if (midi !== undefined && !pressedKeysRef.current.has(key)) {
        pressedKeysRef.current.add(key);
        noteOn(midi, velocity);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      const midi = keyMap.get(key);
      if (midi !== undefined && pressedKeysRef.current.has(key)) {
        pressedKeysRef.current.delete(key);
        noteOff(midi);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [buildKeyMap, noteOn, noteOff, velocity, toggleSustain]);

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
    (midi: number) => {
      noteOn(midi, velocity);
    },
    [noteOn, velocity],
  );

  const handleKeycapUp = useCallback(
    (midi: number) => {
      noteOff(midi);
    },
    [noteOff],
  );

  const renderKeycap = (
    keyDef: { key: string; label: string; type: 'white' | 'black'; noteIndex: number },
    showNote: boolean,
  ) => {
    const midi = baseMidi + keyDef.noteIndex;
    const isPressed = pressedNotes.has(midi);
    const noteName = midiToNoteName(midi);
    const isC = midi % 12 === 0;

    return (
      <div
        key={keyDef.key}
        className={`vk-keycap vk-keycap--${keyDef.type}${isPressed ? ' pressed' : ''}`}
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
        <span className="vk-keycap__letter">{keyDef.label}</span>
        {showNote && (isC || keyDef.type === 'black') && (
          <span className="vk-keycap__note">{noteName}</span>
        )}
        {showNote && !isC && keyDef.type === 'white' && keyDef.noteIndex === 0 && (
          <span className="vk-keycap__note">{noteName}</span>
        )}
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
          >
            &minus;
          </button>
          <span className="vk-octave-label">{rangeLabel}</span>
          <button
            className="vk-octave-btn"
            onClick={() => setBaseOctave((o) => Math.min(7, o + 1))}
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
        {/* Upper row: sharps + some naturals (A S D F G H J K L ; ') */}
        <div className="vk-row vk-row--upper">
          {UPPER_KEYS.map((k) => renderKeycap(k, true))}
        </div>
        {/* Lower row: naturals (Z X C V B N M , . /) */}
        <div className="vk-row vk-row--lower">
          {LOWER_KEYS.map((k) => renderKeycap(k, true))}
        </div>
      </div>
    </div>
  );
}
