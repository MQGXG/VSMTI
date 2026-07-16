import type { Framing } from "./route/types"

export interface ModelDef {
  id: string
  label?: string
  context?: number
  output?: number
  capabilities?: string[]
  cost?: { inputPer1K: number; outputPer1K: number }
}

export interface ProviderDef {
  id: string
  label: string
  protocol: "openai-chat" | "anthropic-messages" | "openai-compatible" | "gemini" | "openai-responses"
  defaultBaseUrl: string
  authType: "bearer" | "api-key" | "oauth" | "none"
  authHeader?: string
  defaultModel?: string
  models: ModelDef[]
  versionHeader?: { name: string; value: string }
  path?: string
  framing?: Framing
  website?: string
}

export const BUILTIN_PROVIDERS: ProviderDef[] = [
  {
    id: "openai", label: "OpenAI",
    protocol: "openai-chat", defaultBaseUrl: "https://api.openai.com/v1",
    authType: "bearer", defaultModel: "gpt-4o",
    website: "https://openai.com",
    models: [
      { id: "gpt-4o", label: "GPT-4o", context: 128000, capabilities: ["chat", "vision", "tool_use"] },
      { id: "gpt-4o-mini", label: "GPT-4o Mini", context: 128000, capabilities: ["chat", "tool_use"] },
      { id: "gpt-4-turbo", label: "GPT-4 Turbo", context: 128000, capabilities: ["chat", "vision", "tool_use"] },
      { id: "gpt-4", label: "GPT-4", context: 8192, capabilities: ["chat", "tool_use"] },
      { id: "gpt-3.5-turbo", label: "GPT-3.5 Turbo", context: 16385, capabilities: ["chat", "tool_use"] },
      { id: "o1", label: "o1", context: 200000, capabilities: ["chat", "tool_use", "thinking"] },
      { id: "o3-mini", label: "o3-mini", context: 200000, capabilities: ["chat", "tool_use", "thinking"] },
    ],
  },
  {
    id: "anthropic", label: "Anthropic Claude",
    protocol: "anthropic-messages", defaultBaseUrl: "https://api.anthropic.com",
    authType: "api-key", authHeader: "x-api-key", defaultModel: "claude-sonnet-4-20250514",
    versionHeader: { name: "anthropic-version", value: "2023-06-01" },
    path: "/v1/messages",
    website: "https://anthropic.com",
    models: [
      { id: "claude-sonnet-4-20250514", label: "Claude Sonnet 4", context: 200000, capabilities: ["chat", "tool_use", "vision", "thinking"] },
      { id: "claude-4-20250514", label: "Claude 4", context: 200000, capabilities: ["chat", "tool_use", "vision", "thinking"] },
      { id: "claude-opus-4-20250514", label: "Claude Opus 4", context: 200000, capabilities: ["chat", "tool_use", "vision", "thinking"] },
      { id: "claude-haiku-4-20250514", label: "Claude Haiku 4", context: 200000, capabilities: ["chat", "tool_use", "vision", "thinking"] },
      { id: "claude-3-5-sonnet-20241022", label: "Claude 3.5 Sonnet", context: 200000, capabilities: ["chat", "tool_use", "vision"] },
      { id: "claude-3-5-haiku-20241022", label: "Claude 3.5 Haiku", context: 200000, capabilities: ["chat", "tool_use", "vision"] },
    ],
  },
  {
    id: "deepseek", label: "DeepSeek",
    protocol: "openai-compatible", defaultBaseUrl: "https://api.deepseek.com",
    authType: "bearer", defaultModel: "deepseek-chat",
    website: "https://deepseek.com",
    models: [
      { id: "deepseek-chat", label: "DeepSeek V3", context: 64000, capabilities: ["chat", "tool_use"] },
      { id: "deepseek-reasoner", label: "DeepSeek R1", context: 64000, capabilities: ["chat", "tool_use", "thinking"] },
    ],
  },
  {
    id: "ollama", label: "Ollama (本地)",
    protocol: "openai-compatible", defaultBaseUrl: "http://localhost:11434/v1",
    authType: "bearer", defaultModel: "llama3",
    website: "https://ollama.com",
    models: [
      { id: "llama3.1", label: "Llama 3.1", context: 128000 },
      { id: "llama3", label: "Llama 3", context: 8192 },
      { id: "qwen2.5", label: "Qwen 2.5", context: 32768 },
      { id: "mistral", label: "Mistral", context: 32768 },
    ],
  },
  {
    id: "groq", label: "Groq",
    protocol: "openai-compatible", defaultBaseUrl: "https://api.groq.com/openai/v1",
    authType: "bearer", defaultModel: "llama3-70b-8192",
    website: "https://groq.com",
    models: [
      { id: "llama3-70b-8192", label: "Llama 3 70B", context: 8192 },
      { id: "llama3-8b-8192", label: "Llama 3 8B", context: 8192 },
      { id: "mixtral-8x7b-32768", label: "Mixtral 8x7B", context: 32768 },
      { id: "gemma2-9b-it", label: "Gemma 2 9B", context: 8192 },
    ],
  },
  {
    id: "fireworks", label: "Fireworks AI",
    protocol: "openai-compatible", defaultBaseUrl: "https://api.fireworks.ai/inference/v1",
    authType: "bearer", defaultModel: "accounts/fireworks/models/llama-v3p1-405b-instruct",
    website: "https://fireworks.ai",
    models: [
      { id: "accounts/fireworks/models/llama-v3p1-405b-instruct", label: "Llama 3.1 405B", context: 8192 },
      { id: "accounts/fireworks/models/llama-v3p1-70b-instruct", label: "Llama 3.1 70B", context: 8192 },
      { id: "accounts/fireworks/models/mixtral-8x22b-instruct", label: "Mixtral 8x22B", context: 65536 },
    ],
  },
  {
    id: "together", label: "Together AI",
    protocol: "openai-compatible", defaultBaseUrl: "https://api.together.xyz/v1",
    authType: "bearer", defaultModel: "mistralai/Mixtral-8x7B-Instruct-v0.1",
    website: "https://together.ai",
    models: [
      { id: "mistralai/Mixtral-8x7B-Instruct-v0.1", label: "Mixtral 8x7B", context: 32768 },
      { id: "mistralai/Mixtral-8x22B-Instruct-v0.1", label: "Mixtral 8x22B", context: 65536 },
    ],
  },
  {
    id: "cerebras", label: "Cerebras",
    protocol: "openai-compatible", defaultBaseUrl: "https://api.cerebras.ai/v1",
    authType: "bearer", defaultModel: "llama3.1-70b",
    website: "https://cerebras.ai",
    models: [
      { id: "llama3.1-70b", label: "Llama 3.1 70B", context: 8192 },
    ],
  },
  {
    id: "perplexity", label: "Perplexity",
    protocol: "openai-compatible", defaultBaseUrl: "https://api.perplexity.ai",
    authType: "bearer", defaultModel: "llama-3.1-sonar-huge-128k-online",
    website: "https://perplexity.ai",
    models: [
      { id: "llama-3.1-sonar-huge-128k-online", label: "Sonar Huge", context: 128000 },
      { id: "llama-3.1-sonar-large-128k-online", label: "Sonar Large", context: 128000 },
      { id: "llama-3.1-sonar-small-128k-online", label: "Sonar Small", context: 128000 },
    ],
  },
  {
    id: "gemini", label: "Google Gemini",
    protocol: "gemini", defaultBaseUrl: "https://generativelanguage.googleapis.com",
    authType: "api-key", authHeader: "x-goog-api-key", defaultModel: "gemini-2.0-flash",
    path: "/v1beta/models",
    website: "https://ai.google.dev",
    models: [
      { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash", context: 1048576, capabilities: ["chat", "vision", "tool_use"] },
      { id: "gemini-2.0-flash-lite", label: "Gemini 2.0 Flash Lite", context: 1048576, capabilities: ["chat", "tool_use"] },
      { id: "gemini-1.5-pro", label: "Gemini 1.5 Pro", context: 2097152, capabilities: ["chat", "vision", "tool_use"] },
      { id: "gemini-1.5-flash", label: "Gemini 1.5 Flash", context: 1048576, capabilities: ["chat", "vision", "tool_use"] },
      { id: "gemini-2.5-pro-preview-03-25", label: "Gemini 2.5 Pro (preview)", context: 1048576, capabilities: ["chat", "vision", "tool_use", "thinking"] },
    ],
  },
  {
    id: "vertex", label: "Vertex AI",
    protocol: "gemini", defaultBaseUrl: "https://us-central1-aiplatform.googleapis.com",
    authType: "bearer", defaultModel: "gemini-2.0-flash",
    path: "/v1/projects",
    website: "https://cloud.google.com/vertex-ai",
    models: [
      { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash", context: 1048576, capabilities: ["chat", "vision", "tool_use"] },
      { id: "gemini-1.5-pro", label: "Gemini 1.5 Pro", context: 2097152, capabilities: ["chat", "vision", "tool_use"] },
      { id: "gemini-1.5-flash", label: "Gemini 1.5 Flash", context: 1048576, capabilities: ["chat", "vision", "tool_use"] },
    ],
  },
  {
    id: "custom", label: "自定义",
    protocol: "openai-compatible", defaultBaseUrl: "",
    authType: "bearer",
    website: "",
    models: [],
  },
]
