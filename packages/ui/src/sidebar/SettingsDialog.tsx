import { useState, useEffect } from "react";
import { X, Sliders, Keyboard, Cpu, Info, Server, Layers, Search } from "lucide-react";
import type { Provider } from "./types";
import { ProviderConfigPanel } from "./ProviderConfigPanel";
import { ModelManager } from "./ModelManager";
import { ThemeSelector } from "./ThemeSelector";
import { ConfigSourceIndicator } from "./ConfigSourceIndicator";
import { defaultProviders, loadProviders, saveProviders, loadSettings, saveSettings } from "./provider-data";

interface Props {
  open: boolean;
  onClose: () => void;
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
    <div className="fixed inset-0 z-50 flex" style={{ background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', animation: 'fadeIn 200ms ease' }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full h-full flex" style={{ background: 'var(--bg)', maxWidth: '100vw', animation: 'slideIn 250ms cubic-bezier(0.16, 1, 0.3, 1)' }}>
      <div className="w-56 flex flex-col shrink-0" style={{ background: 'var(--bg-secondary)', borderRight: '1px solid var(--border)' }}>
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

      <div className="flex-1 flex flex-col overflow-hidden min-h-0" style={{ background: 'var(--bg)' }}>
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
              <div className="p-4 rounded-xl" style={{ background: 'var(--surface-secondary)', border: '1px solid var(--border)' }}>
                <label className="flex items-center justify-between cursor-pointer">
                  <div>
                    <div className="text-sm" style={{ color: 'var(--text-primary)' }}>增强模式（Max Mode）</div>
                    <div className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>并行生成多个候选方案，选最优执行。提升复杂任务质量，但消耗更多 token</div>
                  </div>
                  <input type="checkbox" checked={settings.maxMode}
                    onChange={(e) => updateSettings({ maxMode: e.target.checked })}
                    className="w-4 h-4 rounded" style={{ accentColor: 'var(--accent-start)' }} />
                </label>
              </div>
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
    </div>
  );
}

export function getSettings(): Record<string, any> {
  return loadSettings()
}

export async function getActiveProvider() {
  const { getActiveProvider } = await import("./provider-data");
  return getActiveProvider();
}

export async function getProviderById(providerId: string) {
  const { getProviderById } = await import("./provider-data");
  return getProviderById(providerId);
}
