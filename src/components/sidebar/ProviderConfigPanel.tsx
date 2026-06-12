import { useState } from "react";
import { Plus, Trash2, Globe, Key, Server, Download, Save, X } from "lucide-react";
import type { Provider, ProviderFormData } from "./types";

interface Props {
  providers: Provider[];
  onChange: (list: Provider[]) => void;
}

const EMPTY_FORM: ProviderFormData = {
  id: "",
  name: "",
  displayName: "",
  apiKey: "",
  baseUrl: "",
  website: "",
  apiFormat: "openai",
  headers: [],
  options: [],
  models: [],
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
      data.options
        .filter((o) => o.key)
        .map((o) => {
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
    id: p.id,
    name: p.name,
    displayName: p.displayName || p.name,
    apiKey: p.apiKey,
    baseUrl: p.baseUrl,
    website: p.website || "",
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
    if (editingProvider) {
      setEditingProvider({ ...editingProvider, ...patch });
    }
  };

  const addHeader = () => {
    if (!editingProvider) return;
    setEditingProvider({
      ...editingProvider,
      headers: [...editingProvider.headers, { key: "", value: "" }],
    });
  };

  const updateHeader = (index: number, field: "key" | "value", value: string) => {
    if (!editingProvider) return;
    const newHeaders = [...editingProvider.headers];
    newHeaders[index] = { ...newHeaders[index], [field]: value };
    setEditingProvider({ ...editingProvider, headers: newHeaders });
  };

  const removeHeader = (index: number) => {
    if (!editingProvider) return;
    setEditingProvider({
      ...editingProvider,
      headers: editingProvider.headers.filter((_, i) => i !== index),
    });
  };

  const addOption = () => {
    if (!editingProvider) return;
    setEditingProvider({
      ...editingProvider,
      options: [...editingProvider.options, { key: "", value: "" }],
    });
  };

  const updateOption = (index: number, field: "key" | "value", value: string) => {
    if (!editingProvider) return;
    const newOptions = [...editingProvider.options];
    newOptions[index] = { ...newOptions[index], [field]: value };
    setEditingProvider({ ...editingProvider, options: newOptions });
  };

  const removeOption = (index: number) => {
    if (!editingProvider) return;
    setEditingProvider({
      ...editingProvider,
      options: editingProvider.options.filter((_, i) => i !== index),
    });
  };

  const addModel = () => {
    if (!editingProvider) return;
    setEditingProvider({
      ...editingProvider,
      models: [...editingProvider.models, { id: "", name: "" }],
    });
  };

  const updateModel = (index: number, field: "id" | "name", value: string) => {
    if (!editingProvider) return;
    const newModels = [...editingProvider.models];
    newModels[index] = { ...newModels[index], [field]: value };
    setEditingProvider({ ...editingProvider, models: newModels });
  };

  const removeModel = (index: number) => {
    if (!editingProvider) return;
    setEditingProvider({
      ...editingProvider,
      models: editingProvider.models.filter((_, i) => i !== index),
    });
  };

  const getProviderJson = () => {
    if (!editingProvider) return "";
    return JSON.stringify(
      createProviderFromForm(editingProvider),
      null,
      2
    );
  };

  const fetchModels = async () => {
    if (!editingProvider?.baseUrl) {
      setFetchError("请先配置 Base URL");
      return;
    }

    setFetchingModels(true);
    setFetchError("");

    try {
      const status = await window.electronAPI.getPythonStatus();
      if (status.status !== "running") {
        throw new Error("Python 后端未启动");
      }

      const response = await fetch(`${status.url}/api/models/fetch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseUrl: editingProvider.baseUrl,
          apiKey: editingProvider.apiKey,
          headers: Object.fromEntries(
            editingProvider.headers.filter((h) => h.key).map((h) => [h.key, h.value])
          ),
          provider: editingProvider.apiFormat,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || "获取模型列表失败");
      }

      const data = await response.json();
      
      if (data.success && data.models) {
        // 合并新获取的模型与现有模型（保留现有模型的启用状态）
        const existingModels = new Map(
          editingProvider.models.map((m) => [m.id, m.name])
        );
        
        const newModels = data.models.map((m: { id: string; name: string }) => ({
          id: m.id,
          name: existingModels.get(m.id) || m.name || m.id,
        }));

        setEditingProvider({
          ...editingProvider,
          models: newModels,
        });
      }
    } catch (err: any) {
      setFetchError(err.message || "获取模型列表失败");
    } finally {
      setFetchingModels(false);
    }
  };

  if (editingProvider) {
    return (
      <div className="max-w-3xl space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-medium text-neutral-200">
            {isAdding ? "添加自定义提供商" : `编辑提供商: ${editingProvider.name}`}
          </h3>
          <button
            onClick={() => setEditingProvider(null)}
            className="p-1.5 rounded-lg hover:bg-neutral-800 transition-colors"
          >
            <X className="w-4 h-4 text-neutral-500" />
          </button>
        </div>

        <div className="space-y-6">
          {/* 基本信息 */}
          <div className="space-y-4">
            <div className="text-sm font-medium text-neutral-300">基本信息</div>
            
            <div className="space-y-2">
              <label className="text-xs text-neutral-500">供应商标识 *</label>
              <input
                value={editingProvider.id}
                onChange={(e) => updateForm({ id: e.target.value })}
                placeholder="my-provider（唯一标识，只能使用小写字母、数字和连字符）"
                disabled={!isAdding}
                className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-neutral-200 outline-none focus:border-emerald-500/40 transition-colors disabled:opacity-50"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs text-neutral-500">供应商名称 *</label>
                <input
                  value={editingProvider.name}
                  onChange={(e) => updateForm({ name: e.target.value })}
                  placeholder="例如：Claude 官方"
                  className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-neutral-200 outline-none focus:border-emerald-500/40 transition-colors"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs text-neutral-500">显示名称</label>
                <input
                  value={editingProvider.displayName}
                  onChange={(e) => updateForm({ displayName: e.target.value })}
                  placeholder="例如：公司专用账号"
                  className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-neutral-200 outline-none focus:border-emerald-500/40 transition-colors"
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
                  className="w-full bg-neutral-900 border border-neutral-800 rounded-lg pl-10 pr-3 py-2 text-sm text-neutral-200 outline-none focus:border-emerald-500/40 transition-colors"
                />
              </div>
            </div>
          </div>

          <div className="border-t border-neutral-800"></div>

          {/* API 配置 */}
          <div className="space-y-4">
            <div className="text-sm font-medium text-neutral-300">API 配置</div>

            <div className="space-y-2">
              <label className="text-xs text-neutral-500">接口格式</label>
              <select
                value={editingProvider.apiFormat}
                onChange={(e) => updateForm({ apiFormat: e.target.value as any })}
                className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-neutral-200 outline-none focus:border-emerald-500/40 transition-colors"
              >
                <option value="openai">OpenAI Compatible</option>
                <option value="anthropic">Anthropic</option>
                <option value="custom">自定义</option>
              </select>
              <p className="text-xs text-neutral-600">选择 AI 服务的 API 接口格式</p>
            </div>

            <div className="space-y-2">
              <label className="text-xs text-neutral-500">API Key</label>
              <div className="relative">
                <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-600" />
                <input
                  type="password"
                  value={editingProvider.apiKey}
                  onChange={(e) => updateForm({ apiKey: e.target.value })}
                  placeholder="可选。如果你通过请求头管理认证，可留空。"
                  className="w-full bg-neutral-900 border border-neutral-800 rounded-lg pl-10 pr-3 py-2 text-sm text-neutral-200 outline-none focus:border-emerald-500/40 transition-colors"
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
                  className="w-full bg-neutral-900 border border-neutral-800 rounded-lg pl-10 pr-3 py-2 text-sm text-neutral-200 outline-none focus:border-emerald-500/40 transition-colors"
                />
              </div>
              <p className="text-xs text-neutral-600">自定义 API 端点地址</p>
            </div>
          </div>

          <div className="border-t border-neutral-800"></div>

          {/* 请求头 */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium text-neutral-300">请求头（可选）</div>
              <button
                onClick={addHeader}
                className="flex items-center gap-1 px-2 py-1 rounded text-xs text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 transition-colors"
              >
                <Plus className="w-3 h-3" /> 添加请求头
              </button>
            </div>

            {editingProvider.headers.length === 0 && (
              <p className="text-xs text-neutral-600">添加自定义请求头用于认证或其他用途</p>
            )}

            {editingProvider.headers.map((header, index) => (
              <div key={index} className="flex items-center gap-2">
                <input
                  value={header.key}
                  onChange={(e) => updateHeader(index, "key", e.target.value)}
                  placeholder="Header-Name"
                  className="flex-1 bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-1.5 text-sm text-neutral-200 outline-none focus:border-emerald-500/40 transition-colors"
                />
                <input
                  value={header.value}
                  onChange={(e) => updateHeader(index, "value", e.target.value)}
                  placeholder="value"
                  className="flex-1 bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-1.5 text-sm text-neutral-200 outline-none focus:border-emerald-500/40 transition-colors"
                />
                <button
                  onClick={() => removeHeader(index)}
                  className="p-1.5 rounded hover:bg-red-600/20 text-neutral-500 hover:text-red-400 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>

          <div className="border-t border-neutral-800"></div>

          {/* 额外选项 */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium text-neutral-300">额外选项</div>
              <button
                onClick={addOption}
                className="flex items-center gap-1 px-2 py-1 rounded text-xs text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 transition-colors"
              >
                <Plus className="w-3 h-3" /> 添加
              </button>
            </div>
            <p className="text-xs text-neutral-600">配置额外的 SDK 选项，如 timeout、setCacheKey 等。值会自动解析类型（数字、布尔值等）。</p>

            {editingProvider.options.map((option, index) => (
              <div key={index} className="flex items-center gap-2">
                <input
                  value={option.key}
                  onChange={(e) => updateOption(index, "key", e.target.value)}
                  placeholder="键名"
                  className="flex-1 bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-1.5 text-sm text-neutral-200 outline-none focus:border-emerald-500/40 transition-colors"
                />
                <input
                  value={option.value}
                  onChange={(e) => updateOption(index, "value", e.target.value)}
                  placeholder="值"
                  className="flex-1 bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-1.5 text-sm text-neutral-200 outline-none focus:border-emerald-500/40 transition-colors"
                />
                <button
                  onClick={() => removeOption(index)}
                  className="p-1.5 rounded hover:bg-red-600/20 text-neutral-500 hover:text-red-400 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>

          <div className="border-t border-neutral-800"></div>

          {/* 模型配置 */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium text-neutral-300">模型配置</div>
              <div className="flex items-center gap-2">
                <button
                  onClick={fetchModels}
                  disabled={fetchingModels}
                  className="flex items-center gap-1 px-2 py-1 rounded text-xs text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 transition-colors disabled:opacity-50"
                >
                  <Download className={`w-3 h-3 ${fetchingModels ? "animate-bounce" : ""}`} /> 
                  {fetchingModels ? "获取中..." : "获取模型列表"}
                </button>
                <button
                  onClick={addModel}
                  className="flex items-center gap-1 px-2 py-1 rounded text-xs text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 transition-colors"
                >
                  <Plus className="w-3 h-3" /> 添加模型
                </button>
              </div>
            </div>
            <p className="text-xs text-neutral-600">配置可用的模型及其显示名称</p>

            {fetchError && (
              <div className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400">
                {fetchError}
              </div>
            )}

            {editingProvider.models.length === 0 && (
              <div className="text-xs text-neutral-500 py-4 text-center border border-dashed border-neutral-800 rounded-lg">
                暂无模型配置
              </div>
            )}

            {editingProvider.models.map((model, index) => (
              <div key={index} className="flex items-center gap-2">
                <input
                  value={model.id}
                  onChange={(e) => updateModel(index, "id", e.target.value)}
                  placeholder="model-id"
                  className="flex-1 bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-1.5 text-sm text-neutral-200 outline-none focus:border-emerald-500/40 transition-colors"
                />
                <input
                  value={model.name}
                  onChange={(e) => updateModel(index, "name", e.target.value)}
                  placeholder="显示名称"
                  className="flex-1 bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-1.5 text-sm text-neutral-200 outline-none focus:border-emerald-500/40 transition-colors"
                />
                <button
                  onClick={() => removeModel(index)}
                  className="p-1.5 rounded hover:bg-red-600/20 text-neutral-500 hover:text-red-400 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>

          <div className="border-t border-neutral-800"></div>

          {/* 配置 JSON 预览 */}
          <div className="space-y-2">
            <div className="text-sm font-medium text-gray-700 dark:text-neutral-300">配置 JSON</div>
            <pre className="bg-gray-50 dark:bg-neutral-950 border border-gray-200 dark:border-neutral-800 rounded-lg p-4 text-xs text-gray-600 dark:text-neutral-400 overflow-auto max-h-60">
              {getProviderJson()}
            </pre>
          </div>

          {/* 操作按钮 */}
          <div className="flex items-center justify-end gap-3 pt-4">
            <button
              onClick={() => setEditingProvider(null)}
              className="px-4 py-2 rounded-lg text-sm text-gray-500 dark:text-neutral-400 hover:text-gray-700 dark:hover:text-neutral-200 hover:bg-gray-100 dark:hover:bg-neutral-800 transition-colors"
            >
              取消
            </button>
            <button
              onClick={saveProvider}
              disabled={!editingProvider.name || !editingProvider.baseUrl}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm bg-emerald-600 hover:bg-emerald-500 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Save className="w-4 h-4" />
              {isAdding ? "添加" : "保存"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium text-gray-900 dark:text-neutral-200">提供商</h3>
        <button
          onClick={startAdd}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-gray-100 dark:bg-neutral-800 hover:bg-gray-200 dark:hover:bg-neutral-700 text-gray-700 dark:text-neutral-300 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> 添加提供商
        </button>
      </div>

      <div className="space-y-4">
        {providers.map((provider) => (
          <div
            key={provider.id}
            className="rounded-xl bg-gray-50 dark:bg-neutral-900/50 border border-gray-200 dark:border-neutral-800 overflow-hidden"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900">
              <div className="flex items-center gap-3">
              <div className="text-sm font-medium text-gray-900 dark:text-neutral-200">{provider.displayName || provider.name}</div>
              <div className="text-xs text-gray-500 dark:text-neutral-500">{provider.models.length} 个模型</div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => startEdit(provider)}
                className="px-2 py-1 rounded text-xs text-gray-500 dark:text-neutral-400 hover:text-gray-700 dark:hover:text-neutral-200 hover:bg-gray-100 dark:hover:bg-neutral-800 transition-colors"
              >
                  编辑
                </button>
                {!["openai", "claude", "deepseek", "ollama"].includes(provider.id) && (
                  <button
                    onClick={() => deleteProvider(provider.id)}
                    className="p-1 rounded hover:bg-red-600/20 text-neutral-500 hover:text-red-400 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
                <div
                  onClick={() => toggleProvider(provider.id)}
                  className={`w-9 h-5 rounded-full relative cursor-pointer transition-colors ${
                    provider.enabled ? "bg-emerald-600" : "bg-neutral-700"
                  }`}
                >
                  <div
                    className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                      provider.enabled ? "translate-x-4" : "translate-x-0.5"
                    }`}
                  />
                </div>
              </div>
            </div>

            {provider.enabled && (
              <div className="p-3 grid grid-cols-2 gap-2">
                {provider.models.slice(0, 4).map((model) => (
                  <div
                    key={model.id}
                    className="px-3 py-2 rounded-lg bg-gray-100 dark:bg-neutral-800/50 text-xs text-gray-700 dark:text-neutral-300"
                  >
                    {model.name}
                  </div>
                ))}
                {provider.models.length > 4 && (
                  <div className="px-3 py-2 rounded-lg bg-gray-100 dark:bg-neutral-800/50 text-xs text-gray-500 dark:text-neutral-500">
                    +{provider.models.length - 4} 更多
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        {providers.length === 0 && (
          <div className="text-center py-12 text-gray-500 dark:text-neutral-500 text-sm">
            暂无提供商，点击上方按钮添加
          </div>
        )}
      </div>
    </div>
  );
}
