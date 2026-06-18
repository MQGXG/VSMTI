import { useState, useEffect, useMemo } from "react";
import { X, Sliders, Keyboard, Cpu, Info, Server, Layers, Sun, Moon, Monitor, FileText, Terminal, Search } from "lucide-react";
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
  const encrypted = await Promise.all(
    list.map(async (p) => ({ ...p, apiKey: await encryptApiKey(p.apiKey) }))
  );
  return encrypted;
}

async function decryptProviders(list: Provider[]): Promise<Provider[]> {
  const decrypted = await Promise.all(
    list.map(async (p) => ({ ...p, apiKey: await decryptApiKey(p.apiKey) }))
  );
  return decrypted;
}

const defaultProviders: Provider[] = [
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

async function loadProviders(): Promise<Provider[]> {
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

async function saveProviders(list: Provider[]) {
  const encrypted = await encryptProviders(list);
  localStorage.setItem("providers_v2", JSON.stringify(encrypted));

  // 同步保存到 JSON 配置文件
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

function ThemeSelector() {
  const { theme, resolvedTheme, setTheme } = useTheme();

  const options = [
    { value: "light" as const, label: "浅色", icon: Sun },
    { value: "dark" as const, label: "暗色", icon: Moon },
    { value: "system" as const, label: "跟随系统", icon: Monitor },
  ];

  return (
    <div className="p-4 rounded-xl" style={{ background: 'var(--surface-secondary)', border: '1px solid var(--border)' }}>
      <div className="text-sm mb-3" style={{ color: 'var(--text-primary)' }}>外观</div>
      <div className="flex gap-2">
        {options.map((option) => {
          const Icon = option.icon;
          const isActive = theme === option.value;
          return (
            <button
              key={option.value}
              onClick={() => setTheme(option.value)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-all duration-200"
              style={{
                border: isActive ? '1px solid rgba(0, 217, 192, 0.3)' : '1px solid var(--border)',
                background: isActive ? 'rgba(0, 217, 192, 0.1)' : 'transparent',
                color: isActive ? 'var(--accent-start)' : 'var(--text-secondary)',
              }}
            >
              <Icon className="w-4 h-4" />
              {option.label}
            </button>
          );
        })}
      </div>
      <p className="text-xs mt-2" style={{ color: 'var(--text-tertiary)' }}>
        当前: {resolvedTheme === "dark" ? "暗色模式" : "浅色模式"} ({theme === "system" ? "跟随系统" : "手动设置"})
      </p>
    </div>
  );
}

function loadSettings(): Record<string, any> {
  try { return JSON.parse(localStorage.getItem("settings") || "{}") }
  catch { return {} }
}

function saveSettings(s: Record<string, any>) {
  localStorage.setItem("settings", JSON.stringify(s))
}

/** 配置文件/环境变量来源指示器 */
function ConfigSourceIndicator() {
  const [info, setInfo] = useState<{ apiKeyFrom: string; show: boolean }>({ apiKeyFrom: "none", show: false });

  useEffect(() => {
    (async () => {
      try {
        const cfg = await window.electronAPI.config.get();
        if (cfg.apiKeyFrom !== "none") setInfo({ apiKeyFrom: cfg.apiKeyFrom, show: true });
      } catch { /* ignore */ }
    })();
  }, []);

  if (!info.show) return null;

  return (
    <div className="p-3 rounded-xl flex items-center gap-2" style={{ background: 'rgba(0, 217, 192, 0.05)', border: '1px solid rgba(0, 217, 192, 0.1)' }}>
      {info.apiKeyFrom === "env" ? <Terminal className="w-4 h-4" style={{ color: '#00D9C0' }} /> : <FileText className="w-4 h-4" style={{ color: '#00D9C0' }} />}
      <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
        API Key 来自 <span className="font-medium" style={{ color: 'var(--accent-start)' }}>{info.apiKeyFrom === "env" ? "环境变量" : "配置文件"}</span>
        ，无需在界面中填写
      </div>
    </div>
  );
}

export function SettingsDialog({ open, onClose }: Props) {
  const [tab, setTab] = useState<"general" | "shortcuts" | "providers" | "models" | "about">("providers");
  const [providers, setProviders] = useState<Provider[]>(defaultProviders);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<Record<string, any>>(loadSettings);
  const [searchQuery, setSearchQuery] = useState("");

  const updateSettings = (patch: Record<string, any>) => {
    const next = { ...settings, ...patch }
    setSettings(next)
    saveSettings(next)
  }

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
    <div className="fixed inset-0 z-50 flex" style={{ background: 'var(--surface)' }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-48 lg:w-56 flex flex-col" style={{ background: 'var(--surface-secondary)', borderRight: '1px solid var(--border)' }}>
        <div className="px-4 py-5 space-y-3" style={{ borderBottom: '1px solid var(--border)' }}>
          <h2 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>设置</h2>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5"               style={{ color: 'var(--text-secondary)' }} />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索设置..."
              className="w-full pl-8 pr-2 py-1.5 rounded-lg text-xs outline-none transition-all duration-200"
              style={{ background: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--text-primary)' }}
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2">
                <X className="w-3 h-3 transition-colors hover:text-neutral-300" style={{ color: 'var(--text-secondary)' }} />
              </button>
            )}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto py-2 space-y-1 custom-scrollbar">
          {tabs.map((t) => {
            const show = !searchQuery || t.label.includes(searchQuery) ||
              (t.id === "general" && "通用设置 外观 权限 终端 时间线 进度条 界面".includes(searchQuery)) ||
              (t.id === "shortcuts" && "快捷键 唤出 新建 会话 发送".includes(searchQuery)) ||
              (t.id === "providers" && "提供商 OpenAI Claude DeepSeek Ollama API Key".includes(searchQuery)) ||
              (t.id === "models" && "模型 启用 禁用 搜索".includes(searchQuery)) ||
              (t.id === "about" && "关于 版本 技术栈".includes(searchQuery));
            if (!show) return null;
            return (
              <button key={t.id} onClick={() => { setTab(t.id); setSearchQuery(""); }}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm transition-all duration-200 rounded-lg mx-2"
                style={{
                  background: tab === t.id ? 'rgba(0, 217, 192, 0.1)' : 'transparent',
                  color: tab === t.id ? 'var(--accent-start)' : 'var(--text-secondary)',
                }}>
                <t.icon className="w-4 h-4" /> {t.label}
              </button>
            );
          })}
          {searchQuery && tabs.every(t => !(!searchQuery || t.label.includes(searchQuery) ||
            (t.id === "general" && "通用设置 外观 权限 终端 时间线 进度条 界面".includes(searchQuery)) ||
            (t.id === "shortcuts" && "快捷键 唤出 新建 会话 发送".includes(searchQuery)) ||
            (t.id === "providers" && "提供商 OpenAI Claude DeepSeek Ollama API Key".includes(searchQuery)) ||
            (t.id === "models" && "模型 启用 禁用 搜索".includes(searchQuery)) ||
            (t.id === "about" && "关于 版本 技术栈".includes(searchQuery)))) && (
            <div className="px-6 py-4 text-xs text-center" style={{ color: 'var(--text-secondary)' }}>未找到匹配设置</div>
          )}
        </div>
        <div className="p-3" style={{ borderTop: '1px solid var(--border)' }}>
          <div className="text-[10px] text-center" style={{ color: 'var(--text-tertiary)' }}>修改即时保存</div>
        </div>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden min-h-0">
        <div className="flex items-center justify-end px-4 py-3 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
          <button onClick={onClose} className="p-1.5 rounded-lg transition-colors hover:bg-neutral-700/50">
            <X className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 sm:p-8 min-h-0 custom-scrollbar">
          {tab === "general" && (
            <div className="max-w-2xl space-y-6">
              <h3 className="text-lg font-medium" style={{ color: 'var(--text-primary)' }}>通用设置</h3>
              <ThemeSelector />

              {/* 权限 */}
              <div className="p-4 rounded-xl" style={{ background: 'var(--surface-secondary)', border: '1px solid var(--border)' }}>
                <div className="text-sm mb-3" style={{ color: 'var(--text-primary)' }}>权限</div>
                <label className="flex items-center justify-between cursor-pointer">
                  <div>
                    <div className="text-sm" style={{ color: 'var(--text-primary)' }}>自动接受权限</div>
                    <div className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>允许 Agent 自动执行操作，不再弹出确认对话框</div>
                  </div>
                  <input type="checkbox" checked={settings.autoAcceptPermissions}
                    onChange={(e) => updateSettings({ autoAcceptPermissions: e.target.checked })}
                    className="w-4 h-4 rounded" style={{ accentColor: 'var(--accent-start)' }} />
                </label>
              </div>

              {/* 终端 */}
              <div className="p-4 rounded-xl" style={{ background: 'var(--surface-secondary)', border: '1px solid var(--border)' }}>
                <div className="text-sm mb-3" style={{ color: 'var(--text-primary)' }}>终端</div>
                <label className="text-xs mb-1 block" style={{ color: 'var(--text-secondary)' }}>默认 Shell</label>
                <select value={settings.terminalShell}
                  onChange={(e) => updateSettings({ terminalShell: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none transition-all duration-200"
                  style={{ background: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--text-primary)' }}>
                  <option value="default">Auto (Default)</option>
                  <option value="powershell">PowerShell</option>
                  <option value="cmd">CMD</option>
                  <option value="bash">Bash (WSL)</option>
                </select>
              </div>

              {/* 时间线 */}
              <div className="p-4 rounded-xl" style={{ background: 'var(--surface-secondary)', border: '1px solid var(--border)' }}>
                <div className="text-sm mb-3" style={{ color: 'var(--text-primary)' }}>时间线</div>
                <div className="space-y-3">
                  {[
                    { key: "showReasoning" as const, label: "显示推理摘要", desc: "在时间线中显示模型推理摘要" },
                    { key: "expandShellTools" as const, label: "展开 Shell 工具", desc: "默认在时间线中展开 shell 工具部分" },
                    { key: "expandEditTools" as const, label: "展开编辑工具", desc: "默认在时间线中展开 edit、write 和 patch 工具部分" },
                  ].map((item) => (
                    <label key={item.key} className="flex items-center justify-between cursor-pointer">
                      <div>
                        <div className="text-sm" style={{ color: 'var(--text-primary)' }}>{item.label}</div>
                        <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>{item.desc}</div>
                      </div>
                      <input type="checkbox" checked={(settings as any)[item.key]}
                        onChange={(e) => updateSettings({ [item.key]: e.target.checked })}
                        className="w-4 h-4 rounded" style={{ accentColor: 'var(--accent-start)' }} />
                    </label>
                  ))}
                </div>
              </div>

              {/* 进度条 */}
              <div className="p-4 rounded-xl" style={{ background: 'var(--surface-secondary)', border: '1px solid var(--border)' }}>
                <label className="flex items-center justify-between cursor-pointer">
                  <div>
                    <div className="text-sm" style={{ color: 'var(--text-primary)' }}>显示会话进度条</div>
                    <div className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>当智能体正在工作时，在会话顶部显示动画进度条</div>
                  </div>
                  <input type="checkbox" checked={settings.showProgressBar}
                    onChange={(e) => updateSettings({ showProgressBar: e.target.checked })}
                    className="w-4 h-4 rounded" style={{ accentColor: 'var(--accent-start)' }} />
                </label>
              </div>

              {/* 界面 */}
              <div className="p-4 rounded-xl" style={{ background: 'var(--surface-secondary)', border: '1px solid var(--border)' }}>
                <label className="flex items-center justify-between cursor-pointer">
                  <div>
                    <div className="text-sm" style={{ color: 'var(--text-primary)' }}>新版界面布局</div>
                    <div className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>启用重新设计的布局、主页、编辑器和会话界面</div>
                  </div>
                  <input type="checkbox" checked={settings.newLayout}
                    onChange={(e) => updateSettings({ newLayout: e.target.checked })}
                    className="w-4 h-4 rounded" style={{ accentColor: 'var(--accent-start)' }} />
                </label>
              </div>
            </div>
          )}
          {tab === "shortcuts" && (
            <div className="max-w-2xl space-y-6">
              <h3 className="text-lg font-medium" style={{ color: 'var(--text-primary)' }}>快捷键</h3>
              <div className="space-y-2">
                {[
                  { name: "全局唤出", key: "Ctrl + Shift + A" },
                  { name: "新建会话", key: "Ctrl + N" },
                  { name: "关闭窗口", key: "Ctrl + W" },
                  { name: "发送消息", key: "Enter" },
                  { name: "换行", key: "Shift + Enter" },
                ].map((item) => (
                  <div key={item.name} className="flex items-center justify-between p-4 rounded-xl" style={{ background: 'var(--surface-secondary)', border: '1px solid var(--border)' }}>
                    <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{item.name}</span>
                    <span className="text-xs font-mono px-2 py-1 rounded" style={{ color: 'var(--text-secondary)', background: 'var(--input-bg)', border: '1px solid var(--input-border)' }}>{item.key}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {tab === "providers" && (
            <div className="max-w-2xl space-y-4">
              <ConfigSourceIndicator />
              <ProviderConfigPanel providers={providers} onChange={handleProvidersChange} />
            </div>
          )}
          {tab === "models" && (
            <ModelManager providers={providers} onChange={handleProvidersChange} />
          )}
          {tab === "about" && (
            <div className="max-w-2xl space-y-6">
              <h3 className="text-lg font-medium" style={{ color: 'var(--text-primary)' }}>关于 Mira</h3>
              <div className="p-6 rounded-xl space-y-4" style={{ background: 'var(--surface-secondary)', border: '1px solid var(--border)' }}>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: 'rgba(0, 217, 192, 0.1)' }}>
                    <Cpu className="w-6 h-6" style={{ color: 'var(--accent-start)' }} />
                  </div>
                  <div>
                    <div className="text-lg font-medium" style={{ color: 'var(--text-primary)' }}>Mira</div>
                    <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>版本 1.0.0</div>
                  </div>
                </div>
                <div className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>全能 AI 助手桌面应用，支持多模型切换、工具调用、文件分析。</div>
                <div className="text-xs space-y-1" style={{ color: 'var(--text-tertiary)' }}>
                  <div>Electron 31 · React 18 · TypeScript 5</div>
                  <div>OpenAI SDK · Anthropic SDK · SQLite</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** 读取通用设置（供其他组件使用） */
export function getSettings(): Record<string, any> {
  return loadSettings()
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
      // 如果 localStorage 有 API Key 则直接返回
      if (p.apiKey) {
        return { apiKey: p.apiKey, apiUrl: p.baseUrl, headers: p.headers, options: p.options };
      }
      // 无 Key → 尝试从文件/环境变量配置获取
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
