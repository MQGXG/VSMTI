import { useState, useEffect } from "react";
import { X, Sliders, Keyboard, Cpu, Info, Server, Layers, Sun, Moon, Monitor } from "lucide-react";
import type { Provider } from "./types";
import { ProviderConfigPanel } from "./ProviderConfigPanel";
import { ModelManager } from "./ModelManager";
import { useTheme } from "@/contexts/ThemeContext";

interface Props {
  open: boolean;
  onClose: () => void;
}

const ENCRYPTED_PREFIX = "enc:";

async function encryptApiKey(key: string): Promise<string> {
  if (!key) return "";
  try {
    const encrypted = await window.electronAPI.encryptApiKey(key);
    return ENCRYPTED_PREFIX + encrypted;
  } catch {
    return key; // 加密失败则回退到明文
  }
}

async function decryptApiKey(key: string): Promise<string> {
  if (!key) return "";
  if (key.startsWith(ENCRYPTED_PREFIX)) {
    try {
      const encrypted = key.slice(ENCRYPTED_PREFIX.length);
      return await window.electronAPI.decryptApiKey(encrypted);
    } catch {
      return key; // 解密失败则返回原值
    }
  }
  return key; // 明文直接返回
}

async function encryptProviders(list: Provider[]): Promise<Provider[]> {
  const encrypted = await Promise.all(
    list.map(async (p) => ({
      ...p,
      apiKey: await encryptApiKey(p.apiKey),
    }))
  );
  return encrypted;
}

async function decryptProviders(list: Provider[]): Promise<Provider[]> {
  const decrypted = await Promise.all(
    list.map(async (p) => ({
      ...p,
      apiKey: await decryptApiKey(p.apiKey),
    }))
  );
  return decrypted;
}

const defaultProviders: Provider[] = [
  {
    id: "openai",
    name: "OpenAI",
    displayName: "OpenAI",
    apiKey: "",
    baseUrl: "https://api.openai.com/v1",
    enabled: true,
    website: "https://openai.com",
    apiFormat: "openai",
    headers: {},
    options: {},
    models: [
      { id: "gpt-4o", name: "GPT-4o", enabled: true },
      { id: "gpt-4o-mini", name: "GPT-4o Mini", enabled: true },
      { id: "gpt-4-turbo", name: "GPT-4 Turbo", enabled: true },
    ],
  },
  {
    id: "claude",
    name: "Claude",
    displayName: "Anthropic Claude",
    apiKey: "",
    baseUrl: "https://api.anthropic.com",
    enabled: false,
    website: "https://anthropic.com",
    apiFormat: "anthropic",
    headers: {},
    options: {},
    models: [
      { id: "claude-sonnet-4-20250514", name: "Claude Sonnet 4", enabled: true },
      { id: "claude-haiku-20241022", name: "Claude Haiku", enabled: true },
    ],
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    displayName: "DeepSeek",
    apiKey: "",
    baseUrl: "https://api.deepseek.com",
    enabled: false,
    website: "https://deepseek.com",
    apiFormat: "openai",
    headers: {},
    options: {},
    models: [
      { id: "deepseek-chat", name: "DeepSeek V3", enabled: true },
      { id: "deepseek-reasoner", name: "DeepSeek R1", enabled: true },
    ],
  },
  {
    id: "ollama",
    name: "Ollama",
    displayName: "Ollama (本地)",
    apiKey: "",
    baseUrl: "http://localhost:11434",
    enabled: false,
    website: "https://ollama.com",
    apiFormat: "openai",
    headers: {},
    options: {},
    models: [
      { id: "llama3.1", name: "Llama 3.1", enabled: true },
      { id: "qwen2.5", name: "Qwen 2.5", enabled: true },
    ],
  },
];

function migrateProviders(data: any[]): Provider[] {
  return data.map((p) => ({
    ...p,
    displayName: p.displayName || p.name,
    apiFormat: p.apiFormat || "openai",
    headers: p.headers || {},
    options: p.options || {},
    models: p.models?.map((m: any) => ({
      id: m.id,
      name: m.name,
      enabled: m.enabled !== false,
    })) || [],
  }));
}

async function loadProviders(): Promise<Provider[]> {
  if (typeof window === "undefined") return defaultProviders;
  try {
    const data = localStorage.getItem("providers_v2");
    if (data) {
      const parsed = migrateProviders(JSON.parse(data));
      return await decryptProviders(parsed);
    }
    
    // 尝试读取旧版本数据并迁移
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

async function saveProviders(list: Provider[]) {
  const encrypted = await encryptProviders(list);
  localStorage.setItem("providers_v2", JSON.stringify(encrypted));
}

function ThemeSelector() {
  const { theme, resolvedTheme, setTheme } = useTheme();

  const options = [
    { value: "light" as const, label: "浅色", icon: Sun },
    { value: "dark" as const, label: "暗色", icon: Moon },
    { value: "system" as const, label: "跟随系统", icon: Monitor },
  ];

  return (
    <div className="p-4 rounded-xl bg-gray-50 dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800">
      <div className="text-sm text-gray-900 dark:text-neutral-200 mb-3">外观</div>
      <div className="flex gap-2">
        {options.map((option) => {
          const Icon = option.icon;
          const isActive = theme === option.value;
          return (
            <button
              key={option.value}
              onClick={() => setTheme(option.value)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors ${
                isActive
                  ? "bg-emerald-50 dark:bg-emerald-600/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20"
                  : "bg-white dark:bg-neutral-800 text-gray-600 dark:text-neutral-400 border border-gray-200 dark:border-neutral-700 hover:bg-gray-50 dark:hover:bg-neutral-700"
              }`}
            >
              <Icon className="w-4 h-4" />
              {option.label}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-gray-400 dark:text-neutral-600 mt-2">
        当前: {resolvedTheme === "dark" ? "暗色模式" : "浅色模式"} ({theme === "system" ? "跟随系统" : "手动设置"})
      </p>
    </div>
  );
}

export function SettingsDialog({ open, onClose }: Props) {
  const [tab, setTab] = useState<"general" | "shortcuts" | "providers" | "models" | "about">("providers");
  const [providers, setProviders] = useState<Provider[]>(defaultProviders);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (open) {
      loadProviders().then((data) => {
        setProviders(data);
        setLoading(false);
      });
    }
  }, [open]);

  if (!open) return null;

  const handleProvidersChange = async (list: Provider[]) => {
    setProviders(list);
    await saveProviders(list);
  };

  const tabs = [
    { id: "general" as const, label: "通用", icon: Sliders },
    { id: "shortcuts" as const, label: "快捷键", icon: Keyboard },
    { id: "providers" as const, label: "提供商", icon: Server },
    { id: "models" as const, label: "模型", icon: Layers },
    { id: "about" as const, label: "关于", icon: Info },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-gray-50 dark:bg-[#0a0a0a] flex" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-56 border-r border-gray-200 dark:border-neutral-800 flex flex-col bg-white dark:bg-[#0d0d0d]">
        <div className="px-4 py-5 border-b border-neutral-800">
          <h2 className="text-sm font-medium text-neutral-200">设置</h2>
        </div>
        <div className="flex-1 overflow-y-auto py-2 space-y-1">
          {tabs.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors rounded-lg mx-2 ${
                tab === t.id ? "bg-neutral-800 text-neutral-100" : "text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/50"
              }`}>
              <t.icon className="w-4 h-4" /> {t.label}
            </button>
          ))}
        </div>
        <div className="p-3 border-t border-neutral-800">
          <div className="text-[10px] text-neutral-600 text-center">修改即时保存</div>
        </div>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex items-center justify-end px-4 py-3 border-b border-gray-200 dark:border-neutral-800">
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-neutral-800 transition-colors">
            <X className="w-4 h-4 text-neutral-500" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-8">
          {tab === "general" && (
            <div className="max-w-2xl space-y-6">
              <h3 className="text-lg font-medium text-gray-900 dark:text-neutral-200">通用设置</h3>
              <ThemeSelector />
              <div className="space-y-4">
                {["开机自动启动", "关闭时最小化到托盘", "流式输出"].map((name) => (
                  <div key={name} className="flex items-center justify-between p-4 rounded-xl bg-gray-50 dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800">
                    <div>
                      <div className="text-sm text-gray-900 dark:text-neutral-200">{name}</div>
                      <div className="text-xs text-gray-500 dark:text-neutral-500 mt-1">设置说明</div>
                    </div>
                    <div className="w-11 h-6 bg-emerald-600 rounded-full relative cursor-pointer">
                      <div className="absolute right-1 top-1 w-4 h-4 bg-white rounded-full shadow" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {tab === "shortcuts" && (
            <div className="max-w-2xl space-y-6">
              <h3 className="text-lg font-medium text-gray-900 dark:text-neutral-200">快捷键</h3>
              <div className="space-y-2">
                {[
                  { name: "全局唤出", key: "Ctrl + Shift + A" },
                  { name: "新建会话", key: "Ctrl + N" },
                  { name: "关闭窗口", key: "Ctrl + W" },
                  { name: "发送消息", key: "Enter" },
                  { name: "换行", key: "Shift + Enter" },
                ].map((item) => (
                  <div key={item.name} className="flex items-center justify-between p-4 rounded-xl bg-gray-50 dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800">
                    <span className="text-sm text-gray-700 dark:text-neutral-300">{item.name}</span>
                    <span className="text-xs font-mono text-gray-500 dark:text-neutral-500 bg-gray-100 dark:bg-neutral-800 px-2 py-1 rounded">{item.key}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {tab === "providers" && (
            <ProviderConfigPanel providers={providers} onChange={handleProvidersChange} />
          )}
          {tab === "models" && (
            <ModelManager providers={providers} onChange={handleProvidersChange} />
          )}
          {tab === "about" && (
            <div className="max-w-2xl space-y-6">
              <h3 className="text-lg font-medium text-gray-900 dark:text-neutral-200">关于 OmniAgent</h3>
              <div className="p-6 rounded-xl bg-gray-50 dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-emerald-50 dark:bg-emerald-600/20 flex items-center justify-center">
                    <Cpu className="w-6 h-6 text-emerald-600 dark:text-emerald-500" />
                  </div>
                  <div>
                    <div className="text-lg font-medium text-gray-900 dark:text-neutral-200">OmniAgent</div>
                    <div className="text-xs text-gray-500 dark:text-neutral-500">版本 1.0.0</div>
                  </div>
                </div>
                <div className="text-sm text-gray-600 dark:text-neutral-400 leading-relaxed">全能 AI 助手桌面应用，支持多模型切换、工具调用、文件分析。</div>
                <div className="text-xs text-gray-400 dark:text-neutral-600 space-y-1">
                  <div>Electron 31 · React 18 · Python 3.10</div>
                  <div>OpenAI SDK · Anthropic SDK · FastAPI</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
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
      return { apiKey: p.apiKey, apiUrl: p.baseUrl, headers: p.headers, options: p.options };
    }
  }
  return null;
}
