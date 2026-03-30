import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

interface CursorPosition {
  line: number;
  column: number;
}

interface EditorCursorContextValue {
  cursor: CursorPosition;
  setCursor: (pos: CursorPosition) => void;
}

const EditorCursorContext = createContext<EditorCursorContextValue>({
  cursor: { line: 1, column: 1 },
  setCursor: () => {},
});

export function EditorCursorProvider({ children }: { children: ReactNode }) {
  const [cursor, setCursorState] = useState<CursorPosition>({ line: 1, column: 1 });

  const setCursor = useCallback((pos: CursorPosition) => {
    setCursorState(pos);
  }, []);

  return (
    <EditorCursorContext.Provider value={{ cursor, setCursor }}>
      {children}
    </EditorCursorContext.Provider>
  );
}

export function useEditorCursor() {
  return useContext(EditorCursorContext);
}
