import { useState } from "react";
import { Plus, Trash2, Globe, Key, Server, Download, Save, X } from "lucide-react";
import type { Provider, ProviderFormData } from "./types";
import { Switch } from "../components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";

interface Props {
  providers: Provider[];
  onChange: (list: Provider[]) => void;
}

const EMPTY_FORM: ProviderFormData = {
  id: "", name: "", displayName: "", apiKey: "", baseUrl: "",
  website: "", apiFormat: "openai", headers: [], options: [], models: [],
};

function createProviderFromForm(data: ProviderFormData): Provider {
  return {
    id: data.id || "custom-" + Date.now(),
    name: data.name || data.displayName,
    displayName: data.displayName || data.name,
    apiKey: data.apiKey,
    baseUrl: data.baseUrl || "https://api.example.com/v1",
    enabled: true,
    website: data.website,
    apiFormat: data.apiFormat,
    headers: Object.fromEntries(data.headers.filter((h) => h.key).map((h) => [h.key, h.value])),
    options: Object.fromEntries(
      data.options.filter((o) => o.key).map((o) => {
        const val = o.value;
        if (val === "true") return [o.key, true];
        if (val === "false") return [o.key, false];
        const num = Number(val);
        if (!isNaN(num) && val !== "") return [o.key, num];
        return [o.key, val];
      })
    ),
    models: data.models.map((m) => ({ id: m.id, name: m.name, enabled: true })),
  };
}

function providerToFormData(p: Provider): ProviderFormData {
  return {
    id: p.id, name: p.name, displayName: p.displayName || p.name,
    apiKey: p.apiKey, baseUrl: p.baseUrl, website: p.website || "",
    apiFormat: p.apiFormat || "openai",
    headers: Object.entries(p.headers || {}).map(([key, value]) => ({ key, value })),
    options: Object.entries(p.options || {}).map(([key, value]) => ({ key, value: String(value) })),
    models: p.models.map((m) => ({ id: m.id, name: m.name })),
  };
}

export function ProviderConfigPanel({ providers, onChange }: Props) {
  const [editingProvider, setEditingProvider] = useState<ProviderFormData | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [fetchError, setFetchError] = useState("");

  const startAdd = () => {
    setIsAdding(true);
    setEditingProvider({ ...EMPTY_FORM });
  };

  const startEdit = (p: Provider) => {
    setIsAdding(false);
    setEditingProvider(providerToFormData(p));
  };

  const saveProvider = () => {
    if (!editingProvider?.name || !editingProvider?.baseUrl) return;
    const newProvider = createProviderFromForm(editingProvider);
    if (isAdding) {
      onChange([...providers, newProvider]);
    } else {
      onChange(providers.map((p) => (p.id === newProvider.id ? newProvider : p)));
    }
    setEditingProvider(null);
  };

  const deleteProvider = (id: string) => {
    onChange(providers.filter((p) => p.id !== id));
  };

  const toggleProvider = (id: string) => {
    onChange(providers.map((p) => (p.id === id ? { ...p, enabled: !p.enabled } : p)));
  };

  const updateForm = (patch: Partial<ProviderFormData>) => {
    if (editingProvider) setEditingProvider({ ...editingProvider, ...patch });
  };

  const addHeader = () => {
    if (!editingProvider) return;
    setEditingProvider({ ...editingProvider, headers: [...editingProvider.headers, { key: "", value: "" }] });
  };

  const updateHeader = (index: number, field: "key" | "value", value: string) => {
    if (!editingProvider) return;
    const newHeaders = [...editingProvider.headers];
    newHeaders[index] = { ...newHeaders[index], [field]: value };
    setEditingProvider({ ...editingProvider, headers: newHeaders });
  };

  const removeHeader = (index: number) => {
    if (!editingProvider) return;
    setEditingProvider({ ...editingProvider, headers: editingProvider.headers.filter((_, i) => i !== index) });
  };

  const addOption = () => {
    if (!editingProvider) return;
    setEditingProvider({ ...editingProvider, options: [...editingProvider.options, { key: "", value: "" }] });
  };

  const updateOption = (index: number, field: "key" | "value", value: string) => {
    if (!editingProvider) return;
    const newOptions = [...editingProvider.options];
    newOptions[index] = { ...newOptions[index], [field]: value };
    setEditingProvider({ ...editingProvider, options: newOptions });
  };

  const removeOption = (index: number) => {
    if (!editingProvider) return;
    setEditingProvider({ ...editingProvider, options: editingProvider.options.filter((_, i) => i !== index) });
  };

  const addModel = () => {
    if (!editingProvider) return;
    setEditingProvider({ ...editingProvider, models: [...editingProvider.models, { id: "", name: "" }] });
  };

  const updateModel = (index: number, field: "id" | "name", value: string) => {
    if (!editingProvider) return;
    const newModels = [...editingProvider.models];
    newModels[index] = { ...newModels[index], [field]: value };
    setEditingProvider({ ...editingProvider, models: newModels });
  };

  const removeModel = (index: number) => {
    if (!editingProvider) return;
    setEditingProvider({ ...editingProvider, models: editingProvider.models.filter((_, i) => i !== index) });
  };

  const fetchModels = async () => {
    setFetchError("自动获取模型列表功能暂不可用，请手动添加模型");
    setTimeout(() => setFetchError(""), 3000);
  };

  const inputStyle = {
    background: 'var(--input-bg)',
    border: '1px solid var(--input-border)',
    color: 'var(--text-primary)',
  };

  if (editingProvider) {
    return (
      <div className="max-w-3xl space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-medium" style={{ color: 'var(--text-primary)' }}>
            {isAdding ? "添加自定义提供商" : `编辑提供商: ${editingProvider.name}`}
          </h3>
          <button onClick={() => setEditingProvider(null)} className="p-1.5 rounded-lg transition-colors hover:bg-neutral-700/50">
            <X className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
          </button>
        </div>

        <div className="space-y-6">
          <div className="space-y-4">
            <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>基本信息</div>
            <div className="space-y-2">
              <label className="text-xs" style={{ color: 'var(--text-secondary)' }}>供应商标识 *</label>
              <input
                value={editingProvider.id}
                onChange={(e) => updateForm({ id: e.target.value })}
                placeholder="my-provider（唯一标识）"
                disabled={!isAdding}
                className="w-full rounded-lg px-3 py-2 text-sm outline-none transition-all duration-200 disabled:opacity-50"
                style={inputStyle}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs" style={{ color: 'var(--text-secondary)' }}>供应商名称 *</label>
                <input
                  value={editingProvider.name}
                  onChange={(e) => updateForm({ name: e.target.value })}
                  placeholder="例如：Claude 官方"
                  className="w-full rounded-lg px-3 py-2 text-sm outline-none transition-all duration-200"
                  style={inputStyle}
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs" style={{ color: 'var(--text-secondary)' }}>显示名称</label>
                <input
                  value={editingProvider.displayName}
                  onChange={(e) => updateForm({ displayName: e.target.value })}
                  placeholder="例如：公司专用账号"
                  className="w-full rounded-lg px-3 py-2 text-sm outline-none transition-all duration-200"
                  style={inputStyle}
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-xs" style={{ color: 'var(--text-secondary)' }}>官网链接</label>
              <div className="relative">
                <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
                <input
                  value={editingProvider.website}
                  onChange={(e) => updateForm({ website: e.target.value })}
                  placeholder="https://example.com（可选）"
                  className="w-full rounded-lg pl-10 pr-3 py-2 text-sm outline-none transition-all duration-200"
                  style={inputStyle}
                />
              </div>
            </div>
          </div>

          <div style={{ borderTop: '1px solid var(--border)' }} />

          <div className="space-y-4">
            <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>API 配置</div>
            <div className="space-y-2">
              <label className="text-xs text-secondary">接口格式</label>
              <Select value={editingProvider.apiFormat}
                onValueChange={(v) => updateForm({ apiFormat: v as any })}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="openai">OpenAI Compatible</SelectItem>
                  <SelectItem value="anthropic">Anthropic</SelectItem>
                  <SelectItem value="custom">自定义</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-xs" style={{ color: 'var(--text-secondary)' }}>API Key</label>
              <div className="relative">
                <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
                <input
                  type="password"
                  value={editingProvider.apiKey}
                  onChange={(e) => updateForm({ apiKey: e.target.value })}
                  placeholder="可选"
                  className="w-full rounded-lg pl-10 pr-3 py-2 text-sm outline-none transition-all duration-200"
                  style={inputStyle}
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-xs" style={{ color: 'var(--text-secondary)' }}>Base URL *</label>
              <div className="relative">
                <Server className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
                <input
                  value={editingProvider.baseUrl}
                  onChange={(e) => updateForm({ baseUrl: e.target.value })}
                  placeholder="https://api.example.com/v1"
                  className="w-full rounded-lg pl-10 pr-3 py-2 text-sm outline-none transition-all duration-200"
                  style={inputStyle}
                />
              </div>
            </div>
          </div>

          <div style={{ borderTop: '1px solid var(--border)' }} />

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>请求头（可选）</div>
              <button onClick={addHeader} className="flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors hover:bg-neutral-700/50" style={{ color: 'var(--text-secondary)' }}>
                <Plus className="w-3 h-3" /> 添加请求头
              </button>
            </div>
            {editingProvider.headers.map((header, index) => (
              <div key={index} className="flex items-center gap-2">
                <input value={header.key} onChange={(e) => updateHeader(index, "key", e.target.value)} placeholder="Header-Name"
                  className="flex-1 rounded-lg px-3 py-1.5 text-sm outline-none transition-all duration-200" style={inputStyle} />
                <input value={header.value} onChange={(e) => updateHeader(index, "value", e.target.value)} placeholder="value"
                  className="flex-1 rounded-lg px-3 py-1.5 text-sm outline-none transition-all duration-200" style={inputStyle} />
                <button onClick={() => removeHeader(index)} className="p-1.5 rounded-lg transition-colors hover:bg-error/10 hover:text-error" style={{ color: 'var(--text-secondary)' }}>
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>

          <div style={{ borderTop: '1px solid var(--border)' }} />

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>额外选项</div>
              <button onClick={addOption} className="flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors hover:bg-neutral-700/50" style={{ color: 'var(--text-secondary)' }}>
                <Plus className="w-3 h-3" /> 添加
              </button>
            </div>
            {editingProvider.options.map((option, index) => (
              <div key={index} className="flex items-center gap-2">
                <input value={option.key} onChange={(e) => updateOption(index, "key", e.target.value)} placeholder="键名"
                  className="flex-1 rounded-lg px-3 py-1.5 text-sm outline-none transition-all duration-200" style={inputStyle} />
                <input value={option.value} onChange={(e) => updateOption(index, "value", e.target.value)} placeholder="值"
                  className="flex-1 rounded-lg px-3 py-1.5 text-sm outline-none transition-all duration-200" style={inputStyle} />
                <button onClick={() => removeOption(index)} className="p-1.5 rounded-lg transition-colors hover:bg-error/10 hover:text-error" style={{ color: 'var(--text-secondary)' }}>
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>

          <div style={{ borderTop: '1px solid var(--border)' }} />

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>模型配置</div>
              <div className="flex items-center gap-2">
                <button onClick={fetchModels} disabled={fetchingModels}
                  className="flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors hover:bg-neutral-700/50 disabled:opacity-50" style={{ color: 'var(--text-secondary)' }}>
                  <Download className={`w-3 h-3 ${fetchingModels ? "animate-bounce" : ""}`} />
                  {fetchingModels ? "获取中..." : "获取模型列表"}
                </button>
                <button onClick={addModel} className="flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors hover:bg-neutral-700/50" style={{ color: 'var(--text-secondary)' }}>
                  <Plus className="w-3 h-3" /> 添加模型
                </button>
              </div>
            </div>
            {fetchError && (
              <div className="px-3 py-2 rounded-lg text-xs" style={{ background: 'rgba(255, 71, 87, 0.1)', border: '1px solid rgba(255, 71, 87, 0.2)', color: '#FF4757' }}>{fetchError}</div>
            )}
            {editingProvider.models.map((model, index) => (
              <div key={index} className="flex items-center gap-2">
                <input value={model.id} onChange={(e) => updateModel(index, "id", e.target.value)} placeholder="model-id"
                  className="flex-1 rounded-lg px-3 py-1.5 text-sm outline-none transition-all duration-200" style={inputStyle} />
                <input value={model.name} onChange={(e) => updateModel(index, "name", e.target.value)} placeholder="显示名称"
                  className="flex-1 rounded-lg px-3 py-1.5 text-sm outline-none transition-all duration-200" style={inputStyle} />
                <button onClick={() => removeModel(index)} className="p-1.5 rounded-lg transition-colors hover:bg-error/10 hover:text-error" style={{ color: 'var(--text-secondary)' }}>
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-end gap-3 pt-4">
            <button onClick={() => setEditingProvider(null)} className="px-4 py-2 rounded-lg text-sm transition-colors hover:bg-neutral-700/50" style={{ color: 'var(--text-secondary)' }}>取消</button>
            <button onClick={saveProvider} disabled={!editingProvider.name || !editingProvider.baseUrl}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm btn-primary disabled:opacity-50 disabled:cursor-not-allowed">
              <Save className="w-4 h-4" /> {isAdding ? "添加" : "保存"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium" style={{ color: 'var(--text-primary)' }}>提供商</h3>
        <button onClick={startAdd} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-colors hover:bg-neutral-700/50" style={{ color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
          <Plus className="w-3.5 h-3.5" /> 添加提供商
        </button>
      </div>

      <div className="space-y-4">
        {providers.map((provider) => (
          <div key={provider.id} className="rounded-xl overflow-hidden" style={{ background: 'var(--surface-elevated)', border: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
              <div className="flex items-center gap-3">
                <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{provider.displayName || provider.name}</div>
                <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>{provider.models.length} 个模型</div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => startEdit(provider)} className="px-2 py-1 rounded text-xs transition-colors hover:bg-neutral-700/50" style={{ color: 'var(--text-secondary)' }}>编辑</button>
                {!["openai", "claude", "deepseek", "ollama"].includes(provider.id) && (
                  <button onClick={() => deleteProvider(provider.id)} className="p-1 rounded-lg transition-colors hover:bg-error/10 hover:text-error" style={{ color: 'var(--text-secondary)' }}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
                <Switch checked={provider.enabled}
                  onCheckedChange={() => toggleProvider(provider.id)} />
              </div>
            </div>
            {provider.enabled && (
              <div className="p-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                {provider.models.slice(0, 4).map((model) => (
                  <div key={model.id} className="px-3 py-2 rounded-lg text-xs" style={{ background: 'var(--input-bg)', color: 'var(--text-primary)' }}>{model.name}</div>
                ))}
                {provider.models.length > 4 && (
                  <div className="px-3 py-2 rounded-lg text-xs" style={{ background: 'var(--input-bg)', color: 'var(--text-secondary)' }}>+{provider.models.length - 4} 更多</div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
