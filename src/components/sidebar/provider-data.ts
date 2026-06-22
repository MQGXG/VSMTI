import type { Provider } from "./types";

const ENCRYPTED_PREFIX = "enc:";

async function encryptApiKey(key: string): Promise<string> {
  if (!key) return "";
  try {
    const encrypted = await window.electronAPI.encryptApiKey(key);
    return ENCRYPTED_PREFIX + encrypted;
  } catch {
    return key;
  }
}

async function decryptApiKey(key: string): Promise<string> {
  if (!key) return "";
  if (key.startsWith(ENCRYPTED_PREFIX)) {
    try {
      const encrypted = key.slice(ENCRYPTED_PREFIX.length);
      return await window.electronAPI.decryptApiKey(encrypted);
    } catch {
      return key;
    }
  }
  return key;
}

async function encryptProviders(list: Provider[]): Promise<Provider[]> {
  return Promise.all(
    list.map(async (p) => ({ ...p, apiKey: await encryptApiKey(p.apiKey) }))
  );
}

async function decryptProviders(list: Provider[]): Promise<Provider[]> {
  return Promise.all(
    list.map(async (p) => ({ ...p, apiKey: await decryptApiKey(p.apiKey) }))
  );
}

function migrateProviders(data: any[]): Provider[] {
  return data.map((p) => ({
    ...p,
    displayName: p.displayName || p.name,
    apiFormat: p.apiFormat || "openai",
    headers: p.headers || {},
    options: p.options || {},
    models: p.models?.map((m: any) => ({
      id: m.id, name: m.name, enabled: m.enabled !== false,
    })) || [],
  }));
}

export const defaultProviders: Provider[] = [
  {
    id: "openai", name: "OpenAI", displayName: "OpenAI",
    apiKey: "", baseUrl: "https://api.openai.com/v1", enabled: true,
    website: "https://openai.com", apiFormat: "openai", headers: {}, options: {},
    models: [
      { id: "gpt-4o", name: "GPT-4o", enabled: true },
      { id: "gpt-4o-mini", name: "GPT-4o Mini", enabled: true },
      { id: "gpt-4-turbo", name: "GPT-4 Turbo", enabled: true },
    ],
  },
  {
    id: "claude", name: "Claude", displayName: "Anthropic Claude",
    apiKey: "", baseUrl: "https://api.anthropic.com", enabled: false,
    website: "https://anthropic.com", apiFormat: "anthropic", headers: {}, options: {},
    models: [
      { id: "claude-sonnet-4-20250514", name: "Claude Sonnet 4", enabled: true },
      { id: "claude-haiku-20241022", name: "Claude Haiku", enabled: true },
    ],
  },
  {
    id: "deepseek", name: "DeepSeek", displayName: "DeepSeek",
    apiKey: "", baseUrl: "https://api.deepseek.com", enabled: false,
    website: "https://deepseek.com", apiFormat: "openai", headers: {}, options: {},
    models: [
      { id: "deepseek-chat", name: "DeepSeek V3", enabled: true },
      { id: "deepseek-reasoner", name: "DeepSeek R1", enabled: true },
    ],
  },
  {
    id: "ollama", name: "Ollama", displayName: "Ollama (本地)",
    apiKey: "", baseUrl: "http://localhost:11434", enabled: false,
    website: "https://ollama.com", apiFormat: "openai", headers: {}, options: {},
    models: [
      { id: "llama3.1", name: "Llama 3.1", enabled: true },
      { id: "qwen2.5", name: "Qwen 2.5", enabled: true },
    ],
  },
];

export async function loadProviders(): Promise<Provider[]> {
  if (typeof window === "undefined") return defaultProviders;
  try {
    const data = localStorage.getItem("providers_v2");
    if (data) {
      const parsed = migrateProviders(JSON.parse(data));
      return await decryptProviders(parsed);
    }
    const oldData = localStorage.getItem("providers");
    if (oldData) {
      const migrated = migrateProviders(JSON.parse(oldData));
      const encrypted = await encryptProviders(migrated);
      localStorage.setItem("providers_v2", JSON.stringify(encrypted));
      return migrated;
    }
    return defaultProviders;
  } catch { return defaultProviders; }
}

export async function saveProviders(list: Provider[]) {
  const encrypted = await encryptProviders(list);
  localStorage.setItem("providers_v2", JSON.stringify(encrypted));

  try {
    const active = list.find((p) => p.enabled && p.models.some((m) => m.enabled));
    const defaultModel = active?.models.find((m) => m.enabled);
    if (active && defaultModel) {
      await window.electronAPI.config.save({
        provider: active.id.startsWith("custom-") ? "custom" : active.id,
        model: defaultModel.id,
        apiKey: active.apiKey || "",
        apiUrl: active.baseUrl || "",
      });
    }
  } catch { /* JSON 文件保存失败不影响主流程 */ }
}

export function loadSettings(): Record<string, any> {
  try { return JSON.parse(localStorage.getItem("settings") || "{}") }
  catch { return {} }
}

export function saveSettings(s: Record<string, any>) {
  localStorage.setItem("settings", JSON.stringify(s))
}

export async function getActiveProvider(): Promise<{ provider: string; model: string; apiKey: string; apiUrl: string } | null> {
  const list = await loadProviders();
  for (const p of list) {
    if (p.enabled) {
      const def = p.models.find((m) => m.enabled);
      if (def) return { provider: p.id.startsWith("custom-") ? "custom" : p.id, model: def.id, apiKey: p.apiKey, apiUrl: p.baseUrl };
    }
  }
  return null;
}

export async function getProviderById(providerId: string): Promise<{ apiKey: string; apiUrl: string; headers: Record<string, string>; options: Record<string, any> } | null> {
  const list = await loadProviders();
  for (const p of list) {
    const pid = p.id.startsWith("custom-") ? "custom" : p.id;
    if (pid === providerId && p.enabled) {
      if (p.apiKey) {
        return { apiKey: p.apiKey, apiUrl: p.baseUrl, headers: p.headers, options: p.options };
      }
      try {
        const fileConfig = await window.electronAPI.config.get();
        if (fileConfig.apiKeyFrom !== "none") {
          return { apiKey: "", apiUrl: p.baseUrl || fileConfig.apiUrl, headers: p.headers, options: p.options };
        }
      } catch { /* ignore */ }
      return { apiKey: "", apiUrl: p.baseUrl, headers: p.headers, options: p.options };
    }
  }
  return null;
}
