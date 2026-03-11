import { useCallback } from 'react';
import type { SourceType } from '../AudioEngine';

export interface ParsedCC {
  cc: number;
  label: string;
}

export interface ParsedInput {
  name: string;
  type: SourceType;
  freq: number;
  value: number;
  oscType: 'sine' | 'sawtooth' | 'square' | 'triangle';
  lfoRate: number;
  lfoDepth: number;
  lfoShape: 'sine' | 'triangle' | 'square' | 'sawtooth';
}

export const useCodeParser = () => {
  const parseVultCCs = useCallback((vultCode: string): Record<number, string> => {
    const ccMap: Record<number, string> = {};
    
    const ifRegex = /(?:if|else\s+if)\s*\(\s*(?:c|control|cc)\s*==\s*(\d+)\s*\)\s*\{?\s*(?:val|var)?\s*([a-zA-Z_]\w*)\s*=[^;]+;?\s*\}?\s*(?:\/\/+(.*))?/g;
    let match;
    ifRegex.lastIndex = 0;
    while ((match = ifRegex.exec(vultCode)) !== null) {
      const cc = parseInt(match[1]);
      const varName = match[2];
      const comment = match[3]?.trim();
      if (varName && !['if', 'else', 'val', 'mem', 'real', 'int', 'bool', 'return'].includes(varName)) {
        ccMap[cc] = comment || varName.toUpperCase().replace(/_CC$/, '');
      }
    }

    const matchRegex = /(\d+)\s*->\s*\{?\s*(?:val|var)?\s*([a-zA-Z_]\w*)\s*=[^;]+;?\s*\}?\s*(?:\/\/+(.*))?/g;
    matchRegex.lastIndex = 0;
    while ((match = matchRegex.exec(vultCode)) !== null) {
      const cc = parseInt(match[1]);
      const varName = match[2];
      const comment = match[3]?.trim();
      if (varName && !['if', 'else', 'val', 'mem', 'real', 'int', 'bool', 'return'].includes(varName)) {
        ccMap[cc] = comment || varName.toUpperCase().replace(/_CC$/, '');
      }
    }

    if (Object.keys(ccMap).length === 0) {
      return { 30: 'SAW/SQR', 31: 'SINE LVL', 32: 'PWM AMT', 35: 'LFO RATE' };
    }
    return ccMap;
  }, []);

  const parseVultInputs = useCallback((vultCode: string): ParsedInput[] => {
    const match = vultCode.match(/(?:fun|and)\s+process\s*\(([^)]*)\)/);
    if (!match) return [];
    const params = match[1].split(',').map(arg => {
      const parts = arg.trim().split(/\s*:\s*/);
      return parts[0].trim();
    }).filter(n => n.length > 0);

    return params.map((name, i) => ({
      name,
      type: (i === 0) ? 'oscillator' : 'cv' as SourceType,
      freq: 440,
      value: 0.5,
      oscType: 'sine' as const,
      lfoRate: 1.0,
      lfoDepth: 1.0,
      lfoShape: 'sine' as const
    }));
  }, []);

  return { parseVultCCs, parseVultInputs };
};
