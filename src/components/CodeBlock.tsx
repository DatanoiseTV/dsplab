import { useState, useMemo } from 'react';
import { Copy, Check, Zap } from 'lucide-react';
import Prism from 'prismjs';

interface CodeBlockProps {
  code: string;
  language?: string;
  onApply?: (code: string) => void;
}

export const CodeBlock: React.FC<CodeBlockProps> = ({ code, language, onApply }) => {
  const [copied, setCopied] = useState(false);
  const [applied, setApplied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleApply = () => {
    if (onApply) {
      onApply(code);
      setApplied(true);
      setTimeout(() => setApplied(false), 2000);
    }
  };

  const highlighted = useMemo(() => {
    const lang = language || 'vult';
    const prismLang = Prism.languages[lang] || Prism.languages.clike;
    return Prism.highlight(code, prismLang, lang);
  }, [code, language]);

  return (
    <div style={{ position: 'relative', margin: '8px 0', borderRadius: '8px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)', background: '#111' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 8px', background: 'rgba(255,255,255,0.05)', fontSize: '10px', color: '#888' }}>
        <span style={{ fontFamily: 'monospace', textTransform: 'uppercase' }}>{language || 'vult'}</span>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={handleCopy} style={{ background: 'transparent', border: 'none', color: copied ? '#00ff00' : '#888', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px' }}>
            {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? 'COPIED' : 'COPY'}
          </button>
          {onApply && (
            <button onClick={handleApply} style={{ background: 'transparent', border: 'none', color: applied ? '#00ff00' : 'var(--accent-primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px', fontWeight: 'bold' }}>
              {applied ? <Check size={12} /> : <Zap size={12} />} {applied ? 'APPLIED' : 'APPLY'}
            </button>
          )}
        </div>
      </div>
      <pre style={{ margin: 0, padding: '12px', fontSize: '11px', overflowX: 'auto', background: 'transparent' }}>
        <code dangerouslySetInnerHTML={{ __html: highlighted }} />
      </pre>
    </div>
  );
};
