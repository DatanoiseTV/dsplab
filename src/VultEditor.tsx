import { useRef, useEffect, useState, useImperativeHandle, forwardRef } from 'react';
import Editor, { DiffEditor } from '@monaco-editor/react';
import type { Monaco } from '@monaco-editor/react';

export interface VultEditorHandle {
  /**
   * Insert text at the current cursor position in the editor.
   * Inserts with a leading newline if the cursor is not at column 1,
   * and leaves the cursor after the inserted block.
   * The editor takes focus so the user can keep typing.
   */
  insertAtCursor: (text: string) => void;
}

interface VultEditorProps {
  code: string;
  onChange: (value: string | undefined) => void;
  markers?: any[];
  onStateUpdate: (callback: (state: Record<string, any>) => void) => () => void;
  diffMode?: boolean;
  originalCode?: string;
}

interface HoverData {
  word: string;
  x: number;
  y: number;
  value: any;
}

const VultEditor = forwardRef<VultEditorHandle, VultEditorProps>(({
  code, onChange, markers = [], onStateUpdate, diffMode = false, originalCode = ""
}, ref) => {
  const lastCodeRef = useRef(code);
  const monacoRef = useRef<Monaco | null>(null);
  const editorRef = useRef<any>(null);
  const [history, setHistory] = useState<Record<string, number[]>>({});
  const [hoverData, setHoverData] = useState<HoverData | null>(null);
  const currentStateRef = useRef<Record<string, any>>({});

  useImperativeHandle(ref, () => ({
    insertAtCursor(text: string) {
      const editor = editorRef.current;
      const monaco = monacoRef.current;
      if (!editor || !monaco) return;

      const model = editor.getModel();
      if (!model) return;

      const position = editor.getPosition();
      const col = position?.column ?? 1;
      const line = position?.lineNumber ?? 1;

      // Determine whether we need a leading blank line separator
      const lineContent = model.getLineContent(line);
      const needsLeadingNewline = lineContent.trim().length > 0;

      const insertText = (needsLeadingNewline ? '\n\n' : '') + text;

      editor.executeEdits('insert-module', [
        {
          range: new monaco.Range(line, col, line, col),
          text: insertText,
          forceMoveMarkers: true,
        },
      ]);

      // Place cursor at end of inserted block and reveal it
      const newModel = editor.getModel();
      const lineCount = newModel.getLineCount();
      editor.setPosition({ lineNumber: lineCount, column: 1 });
      editor.revealPositionInCenter({ lineNumber: lineCount, column: 1 });
      editor.focus();
    },
  }));

  // Unified 15Hz subscription for sparklines and hover
  useEffect(() => {
    const unsubscribe = onStateUpdate((state) => {
      currentStateRef.current = state;

      setHistory(prev => {
        const next = { ...prev };
        for (const key in state) {
          if (typeof state[key] === 'number') {
            if (!next[key]) next[key] = [];
            next[key] = [...next[key].slice(-39), state[key]];
          }
        }
        return next;
      });

      setHoverData(current => {
        if (!current) return null;
        const newValue = state[current.word];
        if (newValue === undefined) return null;
        return { ...current, value: newValue };
      });
    });
    return unsubscribe;
  }, [onStateUpdate]);

  useEffect(() => {
    if (monacoRef.current && editorRef.current && !diffMode) {
      monacoRef.current.editor.setModelMarkers(editorRef.current.getModel(), 'vult', markers);
    }
  }, [markers, diffMode]);

  const setupMonaco = (monaco: Monaco) => {
    if (monaco.languages.getLanguages().some((l: any) => l.id === 'vult')) return;

    monaco.languages.register({ id: 'vult' });
    monaco.languages.setMonarchTokensProvider('vult', {
      tokenizer: {
        root: [
          [/\/\/.*$/, 'comment'],
          [/\b(fun|mem|val|if|else|return|true|false|real|int|bool|and)\b/, 'keyword'],
          [/\b\d+(\.\d+)?\b/, 'number'],
          [/[{}()[\],;]/, 'delimiter'],
          [/[+\-*/%=<>!&|]/, 'operator'],
          [/[a-zA-Z_]\w*/, 'variable'],
        ],
      },
    });
  };

  const handleEditorDidMount = (editor: any, monaco: Monaco) => {
    monacoRef.current = monaco;
    editorRef.current = editor;
    setupMonaco(monaco);

    editor.onMouseMove((e: any) => {
      if (diffMode) return;
      if (e.target && e.target.range) {
        const word = editor.getModel().getWordAtPosition(e.target.range.getStartPosition());
        if (word) {
          const state = currentStateRef.current;
          if (state[word.word] !== undefined) {
            setHoverData({
              word: word.word,
              x: e.event.posx + 15,
              y: e.event.posy + 15,
              value: state[word.word]
            });
            return;
          }
        }
      }
      setHoverData(null);
    });

    editor.onMouseLeave(() => setHoverData(null));
  };

  const handleDiffMount = (editor: any, monaco: Monaco) => {
    monacoRef.current = monaco;
    setupMonaco(monaco);
    setTimeout(() => {
      if (editor.revealFirstDiff) editor.revealFirstDiff();
    }, 100);
  };

  const handleOnChange = (value: string | undefined) => {
    if (value !== lastCodeRef.current) {
      lastCodeRef.current = value || '';
      onChange(value);
    }
  };

  const renderSparkline = (word: string) => {
    const data = history[word];
    if (!data || data.length < 2) return null;
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = (max - min) || 1;
    const pts = data.map((v, i) => `${i * 3},${30 - ((v - min) / range) * 30}`).join(' ');

    return (
      <svg width="120" height="35" style={{ marginTop: '8px', borderTop: '1px solid #444', paddingTop: '4px' }}>
        <polyline points={pts} fill="none" stroke="#ffcc00" strokeWidth="1.5" />
      </svg>
    );
  };

  return (
    <div style={{ height: '100%', width: '100%', position: 'relative' }}>
      {diffMode ? (
        <DiffEditor
          height="100%"
          original={originalCode}
          modified={code}
          language="vult"
          theme="vs-dark"
          onMount={handleDiffMount}
          options={{
            renderSideBySide: true,
            readOnly: true,
            fontSize: 14,
            automaticLayout: true,
            fontFamily: "'Fira Code', monospace",
          }}
        />
      ) : (
        <Editor
          height="100%"
          defaultLanguage="vult"
          value={code}
          theme="vs-dark"
          onChange={handleOnChange}
          onMount={handleEditorDidMount}
          options={{
            minimap: { enabled: false },
            fontSize: 14,
            automaticLayout: true,
            fontFamily: "'Fira Code', monospace",
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            glyphMargin: true,
            hover: { enabled: false }
          }}
        />
      )}

      {/* LIVE FLOATING HOVER */}
      {hoverData && !diffMode && (
        <div style={{
          position: 'fixed',
          left: hoverData.x,
          top: hoverData.y,
          background: '#252526',
          border: '1px solid #454545',
          borderRadius: '4px',
          padding: '8px 12px',
          zIndex: 10000,
          boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
          pointerEvents: 'none',
          display: 'flex',
          flexDirection: 'column'
        }}>
          <div style={{ fontSize: '10px', color: '#888', fontWeight: 'bold', marginBottom: '2px' }}>LIVE STATE: {hoverData.word}</div>
          <div style={{ fontSize: '14px', color: '#ffcc00', fontFamily: 'monospace' }}>
            {typeof hoverData.value === 'number' ? hoverData.value.toFixed(6) : String(hoverData.value)}
          </div>
          {typeof hoverData.value === 'number' && renderSparkline(hoverData.word)}
        </div>
      )}
    </div>
  );
});

VultEditor.displayName = 'VultEditor';
export default VultEditor;
