import { useState } from "react";
import { Plus, Trash2, Globe, Key, Server, Download, Save, X } from "lucide-react";
import type { Provider, ProviderFormData } from "./types";

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

  if (editingProvider) {
    return (
      <div className="max-w-3xl space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-medium text-neutral-200">
            {isAdding ? "添加自定义提供商" : `编辑提供商: ${editingProvider.name}`}
          </h3>
          <button onClick={() => setEditingProvider(null)} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors">
            <X className="w-4 h-4 text-neutral-500" />
          </button>
        </div>

        <div className="space-y-6">
          <div className="space-y-4">
            <div className="text-sm font-medium text-neutral-300">基本信息</div>
            <div className="space-y-2">
              <label className="text-xs text-neutral-500">供应商标识 *</label>
              <input
                value={editingProvider.id}
                onChange={(e) => updateForm({ id: e.target.value })}
                placeholder="my-provider（唯一标识）"
                disabled={!isAdding}
                className="w-full bg-white/5 border border-glass-border rounded-lg px-3 py-2 text-sm text-neutral-200 outline-none focus:border-accent-500/40 transition-colors disabled:opacity-50"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs text-neutral-500">供应商名称 *</label>
                <input
                  value={editingProvider.name}
                  onChange={(e) => updateForm({ name: e.target.value })}
                  placeholder="例如：Claude 官方"
                  className="w-full bg-white/5 border border-glass-border rounded-lg px-3 py-2 text-sm text-neutral-200 outline-none focus:border-accent-500/40 transition-colors"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs text-neutral-500">显示名称</label>
                <input
                  value={editingProvider.displayName}
                  onChange={(e) => updateForm({ displayName: e.target.value })}
                  placeholder="例如：公司专用账号"
                  className="w-full bg-white/5 border border-glass-border rounded-lg px-3 py-2 text-sm text-neutral-200 outline-none focus:border-accent-500/40 transition-colors"
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-xs text-neutral-500">官网链接</label>
              <div className="relative">
                <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-600" />
                <input
                  value={editingProvider.website}
                  onChange={(e) => updateForm({ website: e.target.value })}
                  placeholder="https://example.com（可选）"
                  className="w-full bg-white/5 border border-glass-border rounded-lg pl-10 pr-3 py-2 text-sm text-neutral-200 outline-none focus:border-accent-500/40 transition-colors"
                />
              </div>
            </div>
          </div>

          <div className="border-t border-glass-border" />

          <div className="space-y-4">
            <div className="text-sm font-medium text-neutral-300">API 配置</div>
            <div className="space-y-2">
              <label className="text-xs text-neutral-500">接口格式</label>
              <select
                value={editingProvider.apiFormat}
                onChange={(e) => updateForm({ apiFormat: e.target.value as any })}
                className="w-full bg-white/5 border border-glass-border rounded-lg px-3 py-2 text-sm text-neutral-200 outline-none focus:border-accent-500/40 transition-colors"
              >
                <option value="openai">OpenAI Compatible</option>
                <option value="anthropic">Anthropic</option>
                <option value="custom">自定义</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-xs text-neutral-500">API Key</label>
              <div className="relative">
                <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-600" />
                <input
                  type="password"
                  value={editingProvider.apiKey}
                  onChange={(e) => updateForm({ apiKey: e.target.value })}
                  placeholder="可选"
                  className="w-full bg-white/5 border border-glass-border rounded-lg pl-10 pr-3 py-2 text-sm text-neutral-200 outline-none focus:border-accent-500/40 transition-colors"
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-xs text-neutral-500">Base URL *</label>
              <div className="relative">
                <Server className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-600" />
                <input
                  value={editingProvider.baseUrl}
                  onChange={(e) => updateForm({ baseUrl: e.target.value })}
                  placeholder="https://api.example.com/v1"
                  className="w-full bg-white/5 border border-glass-border rounded-lg pl-10 pr-3 py-2 text-sm text-neutral-200 outline-none focus:border-accent-500/40 transition-colors"
                />
              </div>
            </div>
          </div>

          <div className="border-t border-glass-border" />

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium text-neutral-300">请求头（可选）</div>
              <button onClick={addHeader} className="flex items-center gap-1 px-2 py-1 rounded text-xs text-neutral-400 hover:text-neutral-200 hover:bg-white/10 transition-colors">
                <Plus className="w-3 h-3" /> 添加请求头
              </button>
            </div>
            {editingProvider.headers.map((header, index) => (
              <div key={index} className="flex items-center gap-2">
                <input value={header.key} onChange={(e) => updateHeader(index, "key", e.target.value)} placeholder="Header-Name"
                  className="flex-1 bg-white/5 border border-glass-border rounded-lg px-3 py-1.5 text-sm text-neutral-200 outline-none focus:border-accent-500/40 transition-colors" />
                <input value={header.value} onChange={(e) => updateHeader(index, "value", e.target.value)} placeholder="value"
                  className="flex-1 bg-white/5 border border-glass-border rounded-lg px-3 py-1.5 text-sm text-neutral-200 outline-none focus:border-accent-500/40 transition-colors" />
                <button onClick={() => removeHeader(index)} className="p-1.5 rounded hover:bg-red-500/20 text-neutral-500 hover:text-red-400 transition-colors">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>

          <div className="border-t border-glass-border" />

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium text-neutral-300">额外选项</div>
              <button onClick={addOption} className="flex items-center gap-1 px-2 py-1 rounded text-xs text-neutral-400 hover:text-neutral-200 hover:bg-white/10 transition-colors">
                <Plus className="w-3 h-3" /> 添加
              </button>
            </div>
            {editingProvider.options.map((option, index) => (
              <div key={index} className="flex items-center gap-2">
                <input value={option.key} onChange={(e) => updateOption(index, "key", e.target.value)} placeholder="键名"
                  className="flex-1 bg-white/5 border border-glass-border rounded-lg px-3 py-1.5 text-sm text-neutral-200 outline-none focus:border-accent-500/40 transition-colors" />
                <input value={option.value} onChange={(e) => updateOption(index, "value", e.target.value)} placeholder="值"
                  className="flex-1 bg-white/5 border border-glass-border rounded-lg px-3 py-1.5 text-sm text-neutral-200 outline-none focus:border-accent-500/40 transition-colors" />
                <button onClick={() => removeOption(index)} className="p-1.5 rounded hover:bg-red-500/20 text-neutral-500 hover:text-red-400 transition-colors">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>

          <div className="border-t border-glass-border" />

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium text-neutral-300">模型配置</div>
              <div className="flex items-center gap-2">
                <button onClick={fetchModels} disabled={fetchingModels}
                  className="flex items-center gap-1 px-2 py-1 rounded text-xs text-neutral-400 hover:text-neutral-200 hover:bg-white/10 transition-colors disabled:opacity-50">
                  <Download className={`w-3 h-3 ${fetchingModels ? "animate-bounce" : ""}`} />
                  {fetchingModels ? "获取中..." : "获取模型列表"}
                </button>
                <button onClick={addModel} className="flex items-center gap-1 px-2 py-1 rounded text-xs text-neutral-400 hover:text-neutral-200 hover:bg-white/10 transition-colors">
                  <Plus className="w-3 h-3" /> 添加模型
                </button>
              </div>
            </div>
            {fetchError && (
              <div className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400">{fetchError}</div>
            )}
            {editingProvider.models.map((model, index) => (
              <div key={index} className="flex items-center gap-2">
                <input value={model.id} onChange={(e) => updateModel(index, "id", e.target.value)} placeholder="model-id"
                  className="flex-1 bg-white/5 border border-glass-border rounded-lg px-3 py-1.5 text-sm text-neutral-200 outline-none focus:border-accent-500/40 transition-colors" />
                <input value={model.name} onChange={(e) => updateModel(index, "name", e.target.value)} placeholder="显示名称"
                  className="flex-1 bg-white/5 border border-glass-border rounded-lg px-3 py-1.5 text-sm text-neutral-200 outline-none focus:border-accent-500/40 transition-colors" />
                <button onClick={() => removeModel(index)} className="p-1.5 rounded hover:bg-red-500/20 text-neutral-500 hover:text-red-400 transition-colors">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-end gap-3 pt-4">
            <button onClick={() => setEditingProvider(null)} className="px-4 py-2 rounded-lg text-sm text-neutral-400 hover:text-neutral-200 hover:bg-white/10 transition-colors">取消</button>
            <button onClick={saveProvider} disabled={!editingProvider.name || !editingProvider.baseUrl}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm btn-gradient text-white disabled:opacity-50 disabled:cursor-not-allowed">
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
        <h3 className="text-lg font-medium text-neutral-900 dark:text-neutral-200">提供商</h3>
        <button onClick={startAdd} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs glass hover:bg-white/10 text-neutral-300 transition-colors">
          <Plus className="w-3.5 h-3.5" /> 添加提供商
        </button>
      </div>

      <div className="space-y-4">
        {providers.map((provider) => (
          <div key={provider.id} className="rounded-xl glass border border-glass-border overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-glass-border">
              <div className="flex items-center gap-3">
                <div className="text-sm font-medium text-neutral-900 dark:text-neutral-200">{provider.displayName || provider.name}</div>
                <div className="text-xs text-neutral-500">{provider.models.length} 个模型</div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => startEdit(provider)} className="px-2 py-1 rounded text-xs text-neutral-400 hover:text-neutral-200 hover:bg-white/10 transition-colors">编辑</button>
                {!["openai", "claude", "deepseek", "ollama"].includes(provider.id) && (
                  <button onClick={() => deleteProvider(provider.id)} className="p-1 rounded hover:bg-red-500/20 text-neutral-500 hover:text-red-400 transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
                <div onClick={() => toggleProvider(provider.id)}
                  className={`w-9 h-5 rounded-full relative cursor-pointer transition-colors ${provider.enabled ? "bg-accent-600" : "bg-neutral-700"}`}>
                  <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${provider.enabled ? "translate-x-4" : "translate-x-0.5"}`} />
                </div>
              </div>
            </div>
            {provider.enabled && (
              <div className="p-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                {provider.models.slice(0, 4).map((model) => (
                  <div key={model.id} className="px-3 py-2 rounded-lg bg-white/5 text-xs text-neutral-300">{model.name}</div>
                ))}
                {provider.models.length > 4 && (
                  <div className="px-3 py-2 rounded-lg bg-white/5 text-xs text-neutral-500">+{provider.models.length - 4} 更多</div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
