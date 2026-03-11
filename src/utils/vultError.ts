export interface EditorMarker {
  startLineNumber: number;
  endLineNumber: number;
  startColumn: number;
  endColumn: number;
  message: string;
  severity: number;
}

export interface CompileResult {
  success: boolean;
  error?: string;
  rawErrors?: Array<{ row?: number; column?: number; msg?: string; text?: string }>;
}

export const parseVultError = (result: CompileResult): EditorMarker[] => {
  let markers: EditorMarker[] = [];
  
  if (result.rawErrors && Array.isArray(result.rawErrors)) {
    result.rawErrors.forEach((err) => {
      if (err.row !== undefined && err.row !== null) {
        const r = parseInt(String(err.row)) + 1;
        const c = parseInt(String(err.column)) + 1;
        markers.push({ 
          startLineNumber: r, 
          endLineNumber: r, 
          startColumn: c, 
          endColumn: c + 3, 
          message: err.msg || err.text || 'Unknown error', 
          severity: 8 
        });
      }
    });
  }

  if (markers.length === 0 && result.error) {
    const errorStr = typeof result.error === 'string' ? result.error : '';
    const lineMatch = errorStr.match(/line (\d+)/i);
    const colMatch = errorStr.match(/column (\d+)/i) || errorStr.match(/characters (\d+)/i);
    if (lineMatch) {
      const line = parseInt(lineMatch[1]);
      const col = colMatch ? parseInt(colMatch[1]) : 1;
      markers.push({ 
        startLineNumber: line, 
        endLineNumber: line, 
        startColumn: col, 
        endColumn: col + 1, 
        message: errorStr.replace(/Errors in the program:\s*/, '').trim(), 
        severity: 8 
      });
    }
  }
  
  return markers;
};
