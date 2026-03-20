/**
 * Vult Language Features for Monaco Editor
 * Ported from https://github.com/DatanoiseTV/vult-lsp
 * Provides: symbol extraction, go-to-definition, hover, signature help, enhanced completion
 */

import type { Monaco } from '@monaco-editor/react';

// ── Symbol extraction (from LSP's extractSymbols) ──────────────────────────

export interface VultSymbol {
  name: string;
  kind: 'function' | 'variable' | 'type' | 'mem';
  line: number;
  character: number;
  endCharacter: number;
  detail: string; // e.g. "(input: real)" for functions
  fullLine: string;
}

const FUN_REGEX = /^\s*(fun|and|external)\s+([a-zA-Z_][a-zA-Z0-9_.]*)\s*\(([^)]*)\)/;
const VAL_REGEX = /^\s*(val|table)\s+([^;=]+)/;
const MEM_REGEX = /^\s*mem\s+([^;=]+)/;
const TYPE_REGEX = /^\s*type\s+([a-zA-Z_][a-zA-Z0-9_]*)/;

export function extractSymbols(text: string): VultSymbol[] {
  const symbols: VultSymbol[] = [];
  const lines = text.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    let match = FUN_REGEX.exec(line);
    if (match) {
      const fullName = match[2];
      const shortName = fullName.split('.').pop() || fullName;
      const nameStart = line.indexOf(shortName);
      symbols.push({
        name: shortName,
        kind: 'function',
        line: i,
        character: nameStart > -1 ? nameStart : 0,
        endCharacter: (nameStart > -1 ? nameStart : 0) + shortName.length,
        detail: match[3] ? `(${match[3]})` : '()',
        fullLine: line.trim(),
      });
      continue;
    }

    match = VAL_REGEX.exec(line);
    if (match) {
      const vars = match[2].split(',').map(s => s.trim().split(/\s/)[0].replace(/:.*$/, ''));
      for (const v of vars) {
        if (v && /^[a-zA-Z_]/.test(v)) {
          const nameStart = line.indexOf(v);
          symbols.push({
            name: v,
            kind: 'variable',
            line: i,
            character: nameStart > -1 ? nameStart : 0,
            endCharacter: (nameStart > -1 ? nameStart : 0) + v.length,
            detail: match[1],
            fullLine: line.trim(),
          });
        }
      }
      continue;
    }

    match = MEM_REGEX.exec(line);
    if (match) {
      const vars = match[1].split(',').map(s => s.trim().split(/\s/)[0].replace(/:.*$/, ''));
      for (const v of vars) {
        if (v && /^[a-zA-Z_]/.test(v)) {
          const nameStart = line.indexOf(v);
          symbols.push({
            name: v,
            kind: 'mem',
            line: i,
            character: nameStart > -1 ? nameStart : 0,
            endCharacter: (nameStart > -1 ? nameStart : 0) + v.length,
            detail: 'mem',
            fullLine: line.trim(),
          });
        }
      }
      continue;
    }

    match = TYPE_REGEX.exec(line);
    if (match) {
      const nameStart = line.indexOf(match[1]);
      symbols.push({
        name: match[1],
        kind: 'type',
        line: i,
        character: nameStart > -1 ? nameStart : 0,
        endCharacter: (nameStart > -1 ? nameStart : 0) + match[1].length,
        detail: 'type',
        fullLine: line.trim(),
      });
    }
  }

  return symbols;
}

// ── Helper ──────────────────────────────────────────────────────────────────

function getWordAt(line: string, pos: number): string | null {
  let start = pos;
  while (start > 0 && /[a-zA-Z0-9_]/.test(line[start - 1])) start--;
  let end = pos;
  while (end < line.length && /[a-zA-Z0-9_]/.test(line[end])) end++;
  if (start === end) return null;
  return line.substring(start, end);
}

// ── Register all providers ──────────────────────────────────────────────────

export function registerVultLanguageFeatures(monaco: Monaco) {
  // ── Go to Definition ───────────────────────────────────────────────────
  monaco.languages.registerDefinitionProvider('vult', {
    provideDefinition(model, position) {
      const line = model.getLineContent(position.lineNumber);
      const word = getWordAt(line, position.column - 1);
      if (!word) return null;

      const symbols = extractSymbols(model.getValue());
      const symbol = symbols.find(s => s.name === word);
      if (!symbol) return null;

      return {
        uri: model.uri,
        range: new monaco.Range(
          symbol.line + 1, symbol.character + 1,
          symbol.line + 1, symbol.endCharacter + 1
        ),
      };
    },
  });

  // ── Enhanced Hover (function signatures from user code) ────────────────
  monaco.languages.registerHoverProvider('vult', {
    provideHover(model, position) {
      const line = model.getLineContent(position.lineNumber);
      const wordInfo = model.getWordAtPosition(position);
      if (!wordInfo) return null;

      const word = wordInfo.word;
      const symbols = extractSymbols(model.getValue());
      const symbol = symbols.find(s => s.name === word);
      if (!symbol) return null;

      let signature = '';
      if (symbol.kind === 'function') {
        signature = `fun ${symbol.name}${symbol.detail}`;
      } else if (symbol.kind === 'variable') {
        signature = `${symbol.detail} ${symbol.name}`;
      } else if (symbol.kind === 'mem') {
        signature = `mem ${symbol.name}`;
      } else if (symbol.kind === 'type') {
        signature = `type ${symbol.name}`;
      }

      return {
        range: new monaco.Range(
          position.lineNumber, wordInfo.startColumn,
          position.lineNumber, wordInfo.endColumn
        ),
        contents: [
          { value: '```vult\n' + signature + '\n```' },
        ],
      };
    },
  });

  // ── Signature Help ─────────────────────────────────────────────────────
  monaco.languages.registerSignatureHelpProvider('vult', {
    signatureHelpTriggerCharacters: ['(', ','],
    provideSignatureHelp(model, position) {
      const line = model.getLineContent(position.lineNumber).substring(0, position.column - 1);
      const match = /([a-zA-Z_][a-zA-Z0-9_]*)\s*\([^)]*$/.exec(line);
      if (!match) return null;

      const funcName = match[1];
      const symbols = extractSymbols(model.getValue());
      const symbol = symbols.find(s => s.name === funcName && s.kind === 'function');
      if (!symbol || !symbol.detail) return null;

      const argsStr = symbol.detail.replace(/[()]/g, '');
      const args = argsStr.split(',').map(a => a.trim()).filter(a => a.length > 0);
      const commas = (line.match(/,/g) || []).length;

      return {
        value: {
          signatures: [{
            label: `${funcName}(${argsStr})`,
            parameters: args.map(arg => ({ label: arg })),
          }],
          activeSignature: 0,
          activeParameter: Math.min(commas, Math.max(0, args.length - 1)),
        },
        dispose() {},
      };
    },
  });

  // ── Document Symbols (outline) ─────────────────────────────────────────
  monaco.languages.registerDocumentSymbolProvider('vult', {
    provideDocumentSymbols(model) {
      const symbols = extractSymbols(model.getValue());
      return symbols.map(sym => ({
        name: sym.name,
        detail: sym.detail,
        kind: sym.kind === 'function' ? monaco.languages.SymbolKind.Function :
              sym.kind === 'type' ? monaco.languages.SymbolKind.Class :
              monaco.languages.SymbolKind.Variable,
        range: new monaco.Range(sym.line + 1, 1, sym.line + 1, sym.fullLine.length + 1),
        selectionRange: new monaco.Range(sym.line + 1, sym.character + 1, sym.line + 1, sym.endCharacter + 1),
        tags: [],
      }));
    },
  });

  // ── Enhanced Completion (add user-defined symbols) ─────────────────────
  monaco.languages.registerCompletionItemProvider('vult', {
    provideCompletionItems(model, position) {
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };

      const symbols = extractSymbols(model.getValue());
      const suggestions: any[] = [];
      const seen = new Set<string>();

      for (const sym of symbols) {
        if (seen.has(sym.name)) continue;
        seen.add(sym.name);

        if (sym.kind === 'function') {
          const argsStr = sym.detail.replace(/[()]/g, '');
          const args = argsStr.split(',').map((a, i) => `\${${i + 1}:${a.trim()}}`).join(', ');
          suggestions.push({
            label: sym.name,
            kind: monaco.languages.CompletionItemKind.Function,
            detail: `fun ${sym.name}${sym.detail}`,
            insertText: `${sym.name}(${args})`,
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            range,
          });
        } else {
          suggestions.push({
            label: sym.name,
            kind: sym.kind === 'type'
              ? monaco.languages.CompletionItemKind.Class
              : monaco.languages.CompletionItemKind.Variable,
            detail: `${sym.detail} ${sym.name}`,
            insertText: sym.name,
            range,
          });
        }
      }

      return { suggestions };
    },
  });
}
