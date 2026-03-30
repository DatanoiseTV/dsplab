import { useCallback, useState } from 'react';
import type { InputSource, SourceType } from '../../AudioEngine';
import { Knob } from '../controls/Knob';
import { ToggleGroup } from '../controls/ToggleGroup';
import { Zap, Play, ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react';
import './InputsPanel.css';

interface InputsPanelProps {
  inputs: InputSource[];
  onInputChange: (index: number, changes: Partial<InputSource>) => void;
  onTrigger?: (index: number) => void;
  onSampleUpload?: (index: number, file: File) => void;
  onAddInput?: () => void;
  onRemoveInput?: (index: number) => void;
  audioDevices?: MediaDeviceInfo[];
}

const SOURCE_OPTIONS: { value: SourceType; label: string; desc: string }[] = [
  { value: 'cv', label: 'DC', desc: 'DC offset (0–1)' },
  { value: 'oscillator', label: 'Osc', desc: 'Signal oscillator' },
  { value: 'lfo', label: 'LFO', desc: 'Low-frequency oscillator' },
  { value: 'sweep', label: 'Sweep', desc: 'Frequency sweep' },
  { value: 'live', label: 'Audio', desc: 'Live audio input' },
  { value: 'sample', label: 'Sample', desc: 'Audio file' },
  { value: 'impulse', label: 'Pulse', desc: 'Single-sample trigger' },
  { value: 'step', label: 'Step', desc: 'Step/gate input' },
  { value: 'test_noise', label: 'Noise', desc: 'White noise' },
  { value: 'silence', label: 'Off', desc: 'No signal' },
];

const WAVE_OPTIONS: { value: string; label: string }[] = [
  { value: 'sine', label: 'SIN' },
  { value: 'sawtooth', label: 'SAW' },
  { value: 'square', label: 'SQR' },
  { value: 'triangle', label: 'TRI' },
];

function InputStrip({
  input,
  index,
  onChange,
  onTrigger,
  onSampleUpload,
  onRemove,
  audioDevices,
}: {
  input: InputSource;
  index: number;
  onChange: (changes: Partial<InputSource>) => void;
  onTrigger?: () => void;
  onSampleUpload?: (file: File) => void;
  onRemove?: () => void;
  audioDevices?: MediaDeviceInfo[];
}) {
  const [expanded, setExpanded] = useState(true);

  const handleSourceChange = useCallback(
    (value: string) => onChange({ type: value as SourceType }),
    [onChange],
  );

  const sourceLabel = SOURCE_OPTIONS.find(o => o.value === input.type)?.desc || input.type;

  return (
    <div className={`inputs-strip ${expanded ? 'inputs-strip--expanded' : ''}`}>
      <div className="inputs-strip__header" onClick={() => setExpanded(e => !e)}>
        <div className="inputs-strip__header-left">
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          <span className="inputs-strip__index">{index + 1}</span>
          <span className="inputs-strip__name">{input.name}</span>
          <span className="inputs-strip__type-badge">{input.type}</span>
        </div>
        <div className="inputs-strip__header-right" onClick={e => e.stopPropagation()}>
          {(input.type === 'impulse' || input.type === 'step') && onTrigger && (
            <button className="inputs-strip__trigger" onClick={onTrigger} title="Fire trigger">
              <Zap size={10} />
            </button>
          )}
          {onRemove && (
            <button className="inputs-strip__remove" onClick={onRemove} title="Remove input">
              <Trash2 size={10} />
            </button>
          )}
        </div>
      </div>

      {expanded && (
        <div className="inputs-strip__body">
          <div className="inputs-strip__source">
            <ToggleGroup
              options={SOURCE_OPTIONS.map(o => ({ value: o.value, label: o.label }))}
              value={input.type}
              onChange={handleSourceChange}
            />
            <span className="inputs-strip__source-desc">{sourceLabel}</span>
          </div>

          <div className="inputs-strip__controls">
            {input.type === 'oscillator' && (
              <>
                <ToggleGroup
                  options={WAVE_OPTIONS}
                  value={input.oscType}
                  onChange={v => onChange({ oscType: v as InputSource['oscType'] })}
                />
                <div className="inputs-strip__knobs">
                  <Knob label="FREQ" value={input.freq} min={20} max={20000} onChange={val => onChange({ freq: val })} color="var(--accent-cyan)" />
                  <Knob label="AMP" value={input.value} min={0} max={1} defaultValue={1} onChange={val => onChange({ value: val })} color="var(--accent-secondary)" />
                </div>
              </>
            )}

            {input.type === 'lfo' && (
              <>
                <ToggleGroup
                  options={WAVE_OPTIONS}
                  value={input.lfoShape || 'sine'}
                  onChange={v => onChange({ lfoShape: v as InputSource['lfoShape'] })}
                />
                <div className="inputs-strip__knobs">
                  <Knob label="RATE" value={input.lfoRate || 1} min={0.01} max={100} onChange={val => onChange({ lfoRate: val })} />
                  <Knob label="DEPTH" value={input.lfoDepth || 1} min={0} max={1} defaultValue={1} onChange={val => onChange({ lfoDepth: val })} color="var(--accent-danger, #f14c4c)" />
                </div>
              </>
            )}

            {input.type === 'sweep' && (
              <div className="inputs-strip__knobs">
                <Knob label="START" value={input.freq} min={20} max={20000} onChange={val => onChange({ freq: val })} color="var(--accent-cyan)" />
                <Knob label="RATE" value={input.lfoRate || 1} min={0.1} max={10} onChange={val => onChange({ lfoRate: val })} />
              </div>
            )}

            {input.type === 'cv' && (
              <div className="inputs-strip__knobs">
                <Knob label="VALUE" value={input.value} min={-1} max={1} defaultValue={0} onChange={val => onChange({ value: val })} />
              </div>
            )}

            {input.type === 'live' && (
              <select
                className="inputs-strip__select"
                value={input.deviceId || 'default'}
                onChange={e => onChange({ deviceId: e.target.value })}
              >
                <option value="default">Default Mic</option>
                {audioDevices?.map(d => (
                  <option key={d.deviceId} value={d.deviceId}>{d.label || 'Input'}</option>
                ))}
              </select>
            )}

            {input.type === 'sample' && (
              <div className="inputs-strip__sample">
                <button
                  className="inputs-strip__file-btn"
                  onClick={() => {
                    const inp = document.createElement('input');
                    inp.type = 'file';
                    inp.accept = 'audio/*';
                    inp.onchange = e => {
                      const file = (e.target as HTMLInputElement).files?.[0];
                      if (file) onSampleUpload?.(file);
                    };
                    inp.click();
                  }}
                >
                  LOAD FILE
                </button>
                {onTrigger && (
                  <button className="inputs-strip__play-btn" onClick={onTrigger} title="Play sample">
                    <Play size={10} />
                  </button>
                )}
                <label className="inputs-strip__loop-label">
                  <input type="checkbox" checked={input.isLooping ?? false} onChange={e => onChange({ isLooping: e.target.checked })} />
                  Loop
                </label>
              </div>
            )}

            {(input.type === 'impulse' || input.type === 'step') && (
              <div className="inputs-strip__info-text">
                {input.type === 'impulse' ? 'Single-sample trigger. Use zap or MIDI.' : 'Gate signal. Click to toggle.'}
                {onTrigger && (
                  <button className="inputs-strip__inline-trigger" onClick={onTrigger}>
                    <Zap size={10} /> Fire
                  </button>
                )}
              </div>
            )}

            {input.type === 'test_noise' && (
              <div className="inputs-strip__info-text inputs-strip__info-text--active">
                White noise (-20dBFS)
              </div>
            )}

            {input.type === 'silence' && (
              <div className="inputs-strip__info-text">
                Input disabled — no signal
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function InputsPanel({
  inputs,
  onInputChange,
  onTrigger,
  onSampleUpload,
  onAddInput,
  onRemoveInput,
  audioDevices,
}: InputsPanelProps) {
  return (
    <div className="inputs-panel">
      <div className="inputs-panel__header">
        <span className="inputs-panel__count">{inputs.length} input{inputs.length !== 1 ? 's' : ''}</span>
        {onAddInput && (
          <button className="inputs-panel__add" onClick={onAddInput} title="Add manual input">
            <Plus size={12} /> Add
          </button>
        )}
      </div>
      {inputs.length === 0 && (
        <div className="inputs-panel__empty">
          No inputs detected.<br />
          Write a Vult <code>process()</code> function with parameters to auto-detect inputs,
          or click <strong>Add</strong> to create one manually.
        </div>
      )}
      {inputs.map((input, i) => (
        <InputStrip
          key={`${input.name}-${i}`}
          input={input}
          index={i}
          onChange={changes => onInputChange(i, changes)}
          onTrigger={onTrigger ? () => onTrigger(i) : undefined}
          onSampleUpload={onSampleUpload ? file => onSampleUpload(i, file) : undefined}
          onRemove={onRemoveInput ? () => onRemoveInput(i) : undefined}
          audioDevices={audioDevices}
        />
      ))}
    </div>
  );
}

export default InputsPanel;
