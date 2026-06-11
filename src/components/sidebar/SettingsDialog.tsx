import { useState, useEffect } from "react";
import { X, Save } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
}

const providerDefaults: Record<string, { model: string; url: string }> = {
  openai: { model: "gpt-4o", url: "https://api.openai.com/v1" },
  claude: { model: "claude-sonnet-4-20250514", url: "https://api.anthropic.com" },
  local: { model: "qwen2.5", url: "http://localhost:11434" },
  custom: { model: "", url: "" },
};

function loadSetting<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const val = localStorage.getItem(key);
    return val ? JSON.parse(val) : fallback;
  } catch {
    return fallback;
  }
}

function saveSetting(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function SettingsDialog({ open, onClose }: Props) {
  const [provider, setProvider] = useState(() => loadSetting("provider", "openai"));
  const [modelName, setModelName] = useState(() => loadSetting("modelName", "gpt-4o"));
  const [apiKey, setApiKey] = useState(() => loadSetting("apiKey", ""));
  const [apiUrl, setApiUrl] = useState(() => loadSetting("apiUrl", "https://api.openai.com/v1"));
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (provider !== "custom") {
      const def = providerDefaults[provider];
      if (def) {
        setModelName(def.model);
        setApiUrl(def.url);
      }
    }
  }, [provider]);

  if (!open) return null;

  const handleProviderChange = (val: string) => {
    setProvider(val);
    if (val !== "custom") {
      const def = providerDefaults[val];
      setModelName(def.model);
      setApiUrl(def.url);
    }
  };

  const handleSave = () => {
    saveSetting("provider", provider);
    saveSetting("modelName", modelName);
    saveSetting("apiKey", apiKey);
    saveSetting("apiUrl", apiUrl);
    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      onClose();
    }, 800);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-lg mx-4 shadow-2xl animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800">
          <h2 className="text-sm font-medium text-neutral-200">设置</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-neutral-800 transition-colors">
            <X className="w-4 h-4 text-neutral-500" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div>
            <label className="block text-xs font-medium text-neutral-400 mb-2">模型提供商</label>
            <select
              value={provider}
              onChange={(e) => handleProviderChange(e.target.value)}
              className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-neutral-200 outline-none focus:border-emerald-500/40 transition-colors"
            >
              <option value="openai">OpenAI</option>
              <option value="claude">Claude (Anthropic)</option>
              <option value="local">本地模型 (Ollama)</option>
              <option value="custom">自定义</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-400 mb-2">
              模型名称
              <span className="text-neutral-600 font-normal ml-1">
                {provider === "custom" ? "(任意兼容 OpenAI 的模型)" : ""}
              </span>
            </label>
            <input
              type="text"
              value={modelName}
              onChange={(e) => setModelName(e.target.value)}
              placeholder={provider === "custom" ? "例如: qwen2.5:7b" : providerDefaults[provider]?.model}
              className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-neutral-200 outline-none focus:border-emerald-500/40 transition-colors placeholder-neutral-600"
            />
          </div>

          {(provider === "openai" || provider === "claude" || provider === "custom") && (
            <div>
              <label className="block text-xs font-medium text-neutral-400 mb-2">API Key</label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={provider === "openai" ? "sk-..." : provider === "claude" ? "sk-ant-..." : "输入 API Key"}
                className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-neutral-200 outline-none focus:border-emerald-500/40 transition-colors placeholder-neutral-600"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-neutral-400 mb-2">API 地址</label>
            <input
              type="text"
              value={apiUrl}
              onChange={(e) => setApiUrl(e.target.value)}
              placeholder={providerDefaults[provider]?.url || "https://"}
              className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-neutral-200 outline-none focus:border-emerald-500/40 transition-colors placeholder-neutral-600"
            />
          </div>

          <div className="text-xs text-neutral-600 bg-neutral-800/50 rounded-lg p-3 leading-relaxed">
            API Key 仅保存在本地存储，不会上传到服务器。
            自定义模式支持任意兼容 OpenAI API 的服务（如 vLLM、GLM、DeepSeek 等）。
          </div>
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-neutral-800">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
          >
            {saved ? <>已保存 ✓</> : <><Save className="w-3.5 h-3.5" /> 保存</>}
          </button>
        </div>
      </div>
    </div>
  );
}

export function getSettings() {
  return {
    provider: loadSetting("provider", "openai"),
    modelName: loadSetting("modelName", "gpt-4o"),
    apiKey: loadSetting("apiKey", ""),
    apiUrl: loadSetting("apiUrl", "https://api.openai.com/v1"),
  };
}
