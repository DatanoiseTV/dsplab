import { useState, useEffect } from 'react';
import './SettingsPanel.css';

export interface SettingsValues {
  compilerVersion: 'v0' | 'v1';
  aiProvider: string;
  aiApiKey: string;
  aiModel: string;
  autoCompile: boolean;
  autoCompileDelay: number;
}

interface SettingsPanelProps {
  compilerVersion: 'v0' | 'v1';
  onCompilerVersionChange: (v: 'v0' | 'v1') => void;
  sampleRate: number;
  bufferSize: number;
}

function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="settings-section">
      <div className="settings-section__title">{title}</div>
      {children}
    </div>
  );
}

function SettingsRow({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="settings-row">
      <div className="settings-row__label">
        {label}
        {hint && <span className="settings-row__hint">{hint}</span>}
      </div>
      <div className="settings-row__control">{children}</div>
    </div>
  );
}

export function SettingsPanel({
  compilerVersion,
  onCompilerVersionChange,
  sampleRate,
  bufferSize,
}: SettingsPanelProps) {
  const [aiProvider, setAiProvider] = useState(() => localStorage.getItem('dsplab_ai_provider') || 'none');
  const [aiApiKey, setAiApiKey] = useState(() => localStorage.getItem('dsplab_ai_apikey') || '');
  const [aiModel, setAiModel] = useState(() => localStorage.getItem('dsplab_ai_model') || '');
  const [autoCompile, setAutoCompile] = useState(() => localStorage.getItem('dsplab_autocompile') !== 'false');

  useEffect(() => {
    localStorage.setItem('dsplab_ai_provider', aiProvider);
  }, [aiProvider]);

  useEffect(() => {
    if (aiApiKey) localStorage.setItem('dsplab_ai_apikey', aiApiKey);
  }, [aiApiKey]);

  useEffect(() => {
    if (aiModel) localStorage.setItem('dsplab_ai_model', aiModel);
  }, [aiModel]);

  useEffect(() => {
    localStorage.setItem('dsplab_autocompile', autoCompile ? 'true' : 'false');
  }, [autoCompile]);

  return (
    <div className="settings-panel">
      <SettingsSection title="Audio">
        <SettingsRow label="Sample Rate">{(sampleRate / 1000).toFixed(1)} kHz</SettingsRow>
        <SettingsRow label="Buffer Size">{bufferSize} samples</SettingsRow>
        <SettingsRow label="Latency">{((bufferSize / sampleRate) * 1000).toFixed(1)} ms</SettingsRow>
      </SettingsSection>

      <SettingsSection title="Compiler">
        <SettingsRow label="Vult Version">
          <select
            className="settings-select"
            value={compilerVersion}
            onChange={e => onCompilerVersionChange(e.target.value as 'v0' | 'v1')}
          >
            <option value="v0">v0 (stable)</option>
            <option value="v1">v1 (latest)</option>
          </select>
        </SettingsRow>
        <SettingsRow label="Auto-compile" hint="Compile on code change">
          <label className="settings-toggle">
            <input type="checkbox" checked={autoCompile} onChange={e => setAutoCompile(e.target.checked)} />
            <span className="settings-toggle__track" />
          </label>
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title="AI Assistant">
        <SettingsRow label="Provider">
          <select className="settings-select" value={aiProvider} onChange={e => setAiProvider(e.target.value)}>
            <option value="none">Disabled</option>
            <option value="anthropic">Anthropic (Claude)</option>
            <option value="openai">OpenAI</option>
            <option value="gemini">Google Gemini</option>
            <option value="groq">Groq</option>
            <option value="deepseek">DeepSeek</option>
            <option value="ollama">Ollama (Local)</option>
          </select>
        </SettingsRow>
        {aiProvider !== 'none' && aiProvider !== 'ollama' && (
          <SettingsRow label="API Key">
            <input
              className="settings-input"
              type="password"
              placeholder="sk-..."
              value={aiApiKey}
              onChange={e => setAiApiKey(e.target.value)}
            />
          </SettingsRow>
        )}
        {aiProvider !== 'none' && (
          <SettingsRow label="Model" hint="Leave empty for default">
            <input
              className="settings-input"
              type="text"
              placeholder="auto"
              value={aiModel}
              onChange={e => setAiModel(e.target.value)}
            />
          </SettingsRow>
        )}
      </SettingsSection>

      <SettingsSection title="About">
        <div className="settings-about">
          <strong>DSPLab</strong> v1.0.0<br />
          DSP Workbench by syso (DatanoiseTV)<br />
          <span className="settings-about__muted">Vult Language &copy; Leonardo Laguna Ruiz</span>
        </div>
      </SettingsSection>
    </div>
  );
}
