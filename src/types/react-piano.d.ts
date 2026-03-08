declare module 'react-piano' {
  import { Component } from 'react';

  export interface PianoProps {
    noteRange: { first: number; last: number };
    width: number;
    playNote: (midiNumber: number) => void;
    stopNote: (midiNumber: number) => void;
    disabled?: boolean;
    keyboardShortcuts?: any[];
    onPlayNoteInput?: (midiNumber: number) => void;
    onStopNoteInput?: (midiNumber: number) => void;
    renderNoteLabel?: (props: { midiNumber: number }) => JSX.Element;
    className?: string;
  }

  export class Piano extends Component<PianoProps> {}

  export const KeyboardShortcuts: {
    create: (config: { firstNote: number; lastNote: number; keyboardConfig: any[] }) => any[];
    HOME_ROW: any[];
    QWERTY_ROW: any[];
  };

  export const MidiNumbers: {
    fromNote: (note: string) => number;
    getAttributes: (midiNumber: number) => any;
  };
}
