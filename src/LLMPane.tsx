import React, { useState, useEffect, useRef } from 'react';
import { Send, Loader2, Settings, Activity, StopCircle } from 'lucide-react';

interface LLMPaneProps {
  currentCode: string;
  onUpdateCode: (code: string) => Promise<{success: boolean, error?: string}>;
  onSetKnob: (cc: number, value: number) => void;
  onTriggerGenerator: (index: number) => void;
  onConfigureInput: (index: number, config: any) => void;
  onLoadPreset: (name: string) => void;
  getPresets: () => string[];
  getTelemetry: () => Record<string, any>;
  systemPrompt: string;
}

type MessagePart = { text?: string; thought?: string; functionCall?: any; functionResponse?: any };
type Message = { role: 'user' | 'model', parts: MessagePart[] };

const LLMPane: React.FC<LLMPaneProps> = ({ 
  currentCode, onUpdateCode, onSetKnob, onTriggerGenerator, 
  onConfigureInput, onLoadPreset, getPresets, getTelemetry, systemPrompt 
}) => {
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [displayMessages, setDisplayMessages] = useState<{ role: 'user' | 'assistant' | 'system', content: string, isStreaming?: boolean }[]>([]);
  const [apiKey, setApiKey] = useState('');
  const [modelName, setModelName] = useState('gemini-2.0-flash-lite-preview-02-05');
  const [showSettings, setShowSettings] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const codeRef = useRef(currentCode);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => { codeRef.current = currentCode; }, [currentCode]);

  useEffect(() => {
    const savedKey = localStorage.getItem('gemini_api_key');
    if (savedKey) setApiKey(savedKey);
    const savedModel = localStorage.getItem('gemini_model_name');
    if (savedModel) setModelName(savedModel);
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [displayMessages, isLoading, status]);

  const handleSaveSettings = (key: string, model: string) => {
    setApiKey(key);
    setModelName(model);
    localStorage.setItem('gemini_api_key', key);
    localStorage.setItem('gemini_model_name', model);
  };

  const addDisplayMsg = (role: 'user' | 'assistant' | 'system', content: string, isStreaming = false) => {
    setDisplayMessages(prev => {
      if (isStreaming && prev.length > 0 && prev[prev.length - 1].role === 'assistant' && prev[prev.length - 1].isStreaming) {
        const next = [...prev];
        next[next.length - 1] = { ...next[next.length - 1], content: prev[prev.length - 1].content + content };
        return next;
      }
      return [...prev, { role, content, isStreaming }];
    });
  };

  const finalizeStreamingMsg = () => {
    setDisplayMessages(prev => {
      if (prev.length > 0 && prev[prev.length - 1].isStreaming) {
        const next = [...prev];
        next[next.length - 1] = { ...next[next.length - 1], isStreaming: false };
        return next;
      }
      return prev;
    });
  };

  const callGeminiStream = async (currentMessages: Message[]) => {
    const payload = {
      contents: currentMessages,
      systemInstruction: { parts: [{ text: systemPrompt }] },
      tools: [{
        functionDeclarations: [
          {
            name: "update_code",
            description: "Replaces the entire Vult code in the editor with new code. ALWAYS provide the COMPLETE code file. Use this to implement features or make large changes.",
            parameters: {
              type: "OBJECT",
              properties: { new_code: { type: "STRING", description: "The complete, updated Vult code." } },
              required: ["new_code"]
            }
          },
          {
            name: "apply_diff",
            description: "Applies a surgical replacement in the code. Replaces 'old_string' with 'new_string'. Use significant context to avoid ambiguity. Prefer this for small fixes.",
            parameters: {
              type: "OBJECT",
              properties: {
                old_string: { type: "STRING", description: "The exact literal text to find." },
                new_string: { type: "STRING", description: "The text to replace it with." }
              },
              required: ["old_string", "new_string"]
            }
          },
          {
            name: "grep_search",
            description: "Searches for a regex pattern in the current code and returns matching lines with numbers.",
            parameters: {
              type: "OBJECT",
              properties: { pattern: { type: "STRING", description: "The regex pattern to search for." } },
              required: ["pattern"]
            }
          },
          {
            name: "get_current_code",
            description: "Retrieves the current Vult code from the editor.",
            parameters: { type: "OBJECT", properties: {} }
          },
          {
            name: "set_knob",
            description: "Sets a virtual CC knob value (30-41). Values range from 0 to 127.",
            parameters: {
              type: "OBJECT",
              properties: {
                cc: { type: "NUMBER", description: "The CC number (30-41)." },
                value: { type: "NUMBER", description: "The value (0-127)." }
              },
              required: ["cc", "value"]
            }
          },
          {
            name: "trigger_generator",
            description: "Triggers a laboratory generator (Impulse, Step, Sweep) on a specific input strip.",
            parameters: {
              type: "OBJECT",
              properties: { index: { type: "NUMBER", description: "The input strip index (0-based)." } },
              required: ["index"]
            }
          },
          {
            name: "configure_lab_input",
            description: "Configures a DSP Lab input strip type and parameters.",
            parameters: {
              type: "OBJECT",
              properties: {
                index: { type: "NUMBER", description: "The input strip index." },
                type: { type: "STRING", enum: ["oscillator", "cv", "impulse", "step", "sweep", "test_noise", "silence"], description: "The source type." },
                freq: { type: "NUMBER", description: "Frequency if oscillator." },
                oscType: { type: "STRING", enum: ["sine", "sawtooth", "square", "triangle"], description: "Oscillator shape." }
              },
              required: ["index", "type"]
            }
          },
          {
            name: "load_preset",
            description: "Loads one of the built-in Vult presets.",
            parameters: {
              type: "OBJECT",
              properties: { name: { type: "STRING", description: "The preset name." } },
              required: ["name"]
            }
          },
          {
            name: "list_presets",
            description: "Returns a list of available preset names.",
            parameters: { type: "OBJECT", properties: {} }
          },
          {
            name: "get_live_telemetry",
            description: "Retrieves the current values of all internal Vult variables (live telemetry). Use this to verify code behavior.",
            parameters: { type: "OBJECT", properties: {} }
          }
        ]
      }],
      generationConfig: { temperature: 0.1 }
    };

    abortControllerRef.current = new AbortController();
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:streamGenerateContent?alt=sse&key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: abortControllerRef.current.signal
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: { message: response.statusText } }));
      throw new Error(err.error?.message || response.statusText);
    }

    return response.body;
  };

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsLoading(false);
      setStatus("Stopped.");
      finalizeStreamingMsg();
    }
  };

  const processAgentLoop = async (initialMessages: Message[]) => {
    let currentConversation = [...initialMessages];
    
    try {
      while (true) {
        setStatus("Thinking...");
        const stream = await callGeminiStream(currentConversation);
        if (!stream) break;

        const reader = stream.getReader();
        const decoder = new TextDecoder();
        let modelParts: MessagePart[] = [];

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          const chunk = decoder.decode(value);
          const lines = chunk.split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.substring(6));
                const incomingParts = data.candidates?.[0]?.content?.parts || [];
                for (const part of incomingParts) {
                  modelParts.push(part);
                  if (part.text) {
                    setStatus("Typing...");
                    addDisplayMsg('assistant', part.text, true);
                  }
                }
              } catch (e) {}
            }
          }
        }

        finalizeStreamingMsg();
        currentConversation.push({ role: 'model', parts: modelParts });

        const functionCalls = modelParts.filter(p => !!p.functionCall).map(p => p.functionCall);

        if (functionCalls.length > 0) {
          let functionResponses: MessagePart[] = [];
          for (const fc of functionCalls) {
            const name = fc.name.includes(':') ? fc.name.split(':').pop() : fc.name;
            setStatus(`Executing ${name}...`);
            addDisplayMsg('system', `🛠️ Tool: ${name}`);
            
            let result: any = {};
            if (name === 'get_current_code') {
              result = { code: codeRef.current };
            } else if (name === 'grep_search') {
              const lines = codeRef.current.split('\n');
              try {
                const regex = new RegExp(fc.args.pattern, 'i');
                const matches = lines.map((l, i) => regex.test(l) ? `${i+1}: ${l}` : null).filter(Boolean);
                result = { matches: matches.length > 0 ? matches : ["No matches found."] };
              } catch(e: any) { result = { error: e.message }; }
            } else if (name === 'apply_diff') {
              const { old_string, new_string } = fc.args;
              if (codeRef.current.includes(old_string)) {
                const newCode = codeRef.current.replace(old_string, new_string);
                const res = await onUpdateCode(newCode);
                if (res.success) {
                  addDisplayMsg('system', `✅ Applied diff.`);
                  result = { success: true };
                } else {
                  addDisplayMsg('system', `❌ Diff failed:\n${res.error}`);
                  result = { success: false, error: res.error };
                }
              } else {
                addDisplayMsg('system', `❌ Error: 'old_string' not found.`);
                result = { success: false, error: "Pattern not found." };
              }
            } else if (name === 'update_code') {
              const res = await onUpdateCode(fc.args.new_code);
              if (res.success) {
                addDisplayMsg('system', `✅ Updated and compiled.`);
                result = { success: true };
              } else {
                addDisplayMsg('system', `❌ Failed:\n${res.error}`);
                result = { success: false, error: res.error };
              }
            } else if (name === 'set_knob') {
              onSetKnob(fc.args.cc, fc.args.value);
              result = { success: true };
            } else if (name === 'trigger_generator') {
              onTriggerGenerator(fc.args.index);
              result = { success: true };
            } else if (name === 'configure_lab_input') {
              onConfigureInput(fc.args.index, fc.args);
              result = { success: true };
            } else if (name === 'load_preset') {
              onLoadPreset(fc.args.name);
              result = { success: true };
            } else if (name === 'list_presets') {
              result = { presets: getPresets() };
            } else if (name === 'get_live_telemetry') {
              result = { telemetry: getTelemetry() };
            }

            functionResponses.push({ functionResponse: { name: fc.name, response: result } });
          }
          currentConversation.push({ role: 'user', parts: functionResponses });
        } else {
          break; // Agent finished
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        addDisplayMsg('assistant', `⚠️ Error: ${err.message}`);
      }
    } finally {
      setIsLoading(false);
      setStatus(null);
    }
    setMessages(currentConversation);
  };

  const handleSend = () => {
    if (!input.trim() || isLoading) return;
    const userInput = input;
    setInput('');
    setIsLoading(true);
    addDisplayMsg('user', userInput);
    if (!apiKey) {
      addDisplayMsg('assistant', "API key missing. Click the Settings icon.");
      setIsLoading(false);
      return;
    }
    const newUserMsg: Message = { role: 'user', parts: [{ text: userInput }] };
    processAgentLoop([...messages, newUserMsg]);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', borderLeft: '1px solid #333', background: '#1e1e1e' }}>
      <div style={{ padding: '12px', borderBottom: '1px solid #333', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#1a1a1a' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Activity size={14} color={isLoading ? "#00ff00" : "#666"} className={isLoading ? "animate-spin" : ""} />
          <span style={{ fontWeight: 'bold', fontSize: '12px', color: '#aaa', textTransform: 'uppercase', letterSpacing: '1px' }}>Vult Agent</span>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {isLoading && (
            <button onClick={handleStop} style={{ background: 'transparent', border: 'none', color: '#ff4444', cursor: 'pointer' }} title="Stop Agent">
              <StopCircle size={16} />
            </button>
          )}
          <button onClick={() => setShowSettings(!showSettings)} style={{ background: 'transparent', border: 'none', color: apiKey ? '#00ff00' : '#888', cursor: 'pointer' }}>
            <Settings size={16} />
          </button>
        </div>
      </div>
      
      {showSettings && (
        <div style={{ padding: '12px', background: '#252526', borderBottom: '1px solid #333', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ fontSize: '9px', color: '#888', fontWeight: 'bold' }}>GEMINI API KEY</div>
          <input type="password" placeholder="Key..." value={apiKey} onChange={(e) => handleSaveSettings(e.target.value, modelName)} style={{ background: '#111', border: '1px solid #444', color: '#fff', padding: '6px', borderRadius: '4px', fontSize: '11px', outline: 'none' }} />
          <div style={{ fontSize: '9px', color: '#888', fontWeight: 'bold' }}>MODEL</div>
          <input type="text" placeholder="Model ID..." value={modelName} onChange={(e) => handleSaveSettings(apiKey, e.target.value)} style={{ background: '#111', border: '1px solid #444', color: '#fff', padding: '6px', borderRadius: '4px', fontSize: '11px', outline: 'none' }} />
        </div>
      )}

      {/* Agent Progress Bar */}
      <div style={{ height: '2px', width: '100%', background: '#1a1a1a', position: 'relative', overflow: 'hidden' }}>
        {isLoading && (
          <div style={{ 
            position: 'absolute', 
            height: '100%', 
            width: '30%', 
            background: '#007acc', 
            boxShadow: '0 0 10px #007acc',
            animation: 'agent-progress 1.5s infinite linear' 
          }} />
        )}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '12px', display: 'flex', flexDirection: 'column', gap: '16px', scrollBehavior: 'smooth' }}>
        {displayMessages.map((m, i) => (
          <div key={i} style={{ 
            alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
            width: m.role === 'system' ? '100%' : 'auto',
            background: m.role === 'user' ? '#007acc' : (m.role === 'system' ? 'transparent' : '#2d2d2d'),
            borderLeft: m.role === 'system' ? '2px solid #444' : 'none',
            color: m.role === 'system' ? '#888' : '#fff',
            padding: m.role === 'system' ? '4px 12px' : '10px 14px',
            borderRadius: '12px',
            maxWidth: m.role === 'system' ? '100%' : '85%',
            fontSize: m.role === 'system' ? '11px' : '13px',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            fontFamily: m.role === 'system' ? 'monospace' : 'inherit',
            boxShadow: m.role === 'system' ? 'none' : '0 2px 8px rgba(0,0,0,0.2)'
          }}>
            {m.content}
          </div>
        ))}
        {status && (
          <div style={{ fontSize: '11px', color: '#666', fontStyle: 'italic', display: 'flex', alignItems: 'center', gap: '6px', marginLeft: '4px' }}>
            <Loader2 size={12} className="animate-spin" /> {status}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div style={{ padding: '12px', borderTop: '1px solid #333', display: 'flex', gap: '8px', background: '#1a1a1a' }}>
        <input 
          type="text" 
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder="Ask the Vult Agent..."
          disabled={isLoading}
          style={{ flex: 1, background: '#252526', border: '1px solid #444', borderRadius: '20px', padding: '8px 16px', color: '#fff', fontSize: '13px', outline: 'none' }}
        />
        <button 
          onClick={handleSend} 
          disabled={isLoading || !input.trim()} 
          style={{ background: isLoading || !input.trim() ? '#333' : '#007acc', border: 'none', borderRadius: '50%', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff', transition: 'all 0.2s' }}
        >
          <Send size={18} />
        </button>
      </div>
    </div>
  );
};

export default LLMPane;
