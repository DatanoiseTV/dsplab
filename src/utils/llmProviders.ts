export interface ProviderPreset {
  id: string;
  name: string;
  endpoint: string;
  defaultModel: string;
}

export const PROVIDER_PRESETS: ProviderPreset[] = [
  { id: 'gemini', name: 'Google Gemini', endpoint: 'https://generativelanguage.googleapis.com', defaultModel: 'gemini-2.0-flash' },
  { id: 'openai', name: 'OpenAI', endpoint: 'https://api.openai.com', defaultModel: 'gpt-4o' },
  { id: 'anthropic', name: 'Anthropic', endpoint: 'https://api.anthropic.com', defaultModel: 'claude-3-7-sonnet-20250219' },
  { id: 'deepseek', name: 'DeepSeek', endpoint: 'https://api.deepseek.com', defaultModel: 'deepseek-chat' },
  { id: 'openrouter', name: 'OpenRouter', endpoint: 'https://openrouter.ai/api', defaultModel: 'anthropic/claude-3-7-sonnet' },
  { id: 'lmstudio', name: 'LM Studio', endpoint: 'http://127.0.0.1:1234', defaultModel: 'model-identifier' },
  { id: 'local', name: 'Local (Ollama)', endpoint: 'http://localhost:11434', defaultModel: 'llama3' }
];

export const resolveBaseUrl = (baseUrl: string, provId: string): string => {
  if (!baseUrl) return "";
  let url = baseUrl.trim().replace(/\/$/, '');
  
  if (provId === 'anthropic') {
    if (url.includes('/v1/messages')) return url;
    return `${url.replace(/\/v1$/, '')}/v1/messages`;
  }
  if (provId === 'gemini') return url;

  if (url.includes('api.openai.com') || url.includes('api.deepseek.com') || url.includes('openrouter.ai')) {
    return url;
  }
  
  url = url.replace(/\/chat\/completions$/, '');
  url = url.replace(/\/v1$/, '');
  url = url.replace(/\/$/, '');
  
  return `${url}/v1`;
};

export const resolveFullUrl = (baseUrl: string, provId: string): string => {
  const base = resolveBaseUrl(baseUrl, provId);
  if (provId === 'anthropic') return base;
  if (provId === 'gemini') return base;
  return `${base}/chat/completions`;
};
