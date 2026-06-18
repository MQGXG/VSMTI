import { useState, useRef, useEffect } from "react";
import { Cpu, ChevronDown, Shield, Zap, Brain, Sparkles, Search } from "lucide-react";
import type { AgentMode } from "./types";

interface StoredProvider {
  id: string;
  name: string;
  displayName: string;
  enabled: boolean;
  models: { id: string; name: string; enabled: boolean }[];
}

function loadProviders(): StoredProvider[] {
  if (typeof window === "undefined") return [];
  try {
    const data = localStorage.getItem("providers_v2");
    if (data) {
      const parsed = JSON.parse(data);
      return parsed.map((p: any) => ({
        id: p.id,
        name: p.name,
        displayName: p.displayName || p.name,
        enabled: p.enabled,
        models: p.models?.map((m: any) => ({
          id: m.id,
          name: m.name,
          enabled: m.enabled !== false,
        })) || [],
      }));
    }
    const oldData = localStorage.getItem("providers");
    if (oldData) {
      const parsed = JSON.parse(oldData);
      return parsed.map((p: any) => ({
        ...p,
        displayName: p.name,
        models: p.models?.map((m: any) => ({
          id: m.id,
          name: m.name,
          enabled: true,
        })) || [],
      }));
    }
    return [];
  } catch { return []; }
}

function getEnabledModels(): ModelOption[] {
  const providers = loadProviders();
  const options: ModelOption[] = [];
  for (const p of providers) {
    if (!p.enabled) continue;
    for (const m of p.models) {
      if (!m.enabled) continue;
      options.push({
        label: `${p.displayName || p.name} · ${m.name}`,
        value: m.id,
        provider: p.id.startsWith("custom-") ? "custom" : p.id,
      });
    }
  }
  return options.length > 0 ? options : [DEFAULT_MODEL];
}

export interface ModelOption {
  label: string;
  value: string;
  provider: string;
}

const DEFAULT_MODEL: ModelOption = {
  label: "OpenAI · GPT-4o",
  value: "gpt-4o",
  provider: "openai",
};

const MODE_OPTIONS: { value: AgentMode; label: string; icon: typeof Brain; desc: string }[] = [
  { value: "assistant", label: "助手", icon: Brain, desc: "日常问答" },
  { value: "plan", label: "规划", icon: Search, desc: "代码分析" },
  { value: "expert", label: "专家", icon: Zap, desc: "深度分析" },
  { value: "action", label: "执行", icon: Cpu, desc: "自动任务" },
  { value: "safe", label: "安全", icon: Shield, desc: "只读模式" },
];

export function loadModelChoice(): ModelOption {
  if (typeof window === "undefined") return DEFAULT_MODEL;
  try {
    const saved = localStorage.getItem("chat_model");
    if (saved) {
      const parsed: ModelOption = JSON.parse(saved);
      const available = getEnabledModels();
      const stillAvailable = available.find(m => m.value === parsed.value);
      if (stillAvailable) return stillAvailable;
    }
  } catch { /* ignore */ }
  return getEnabledModels()[0] || DEFAULT_MODEL;
}

export function loadModeChoice(): AgentMode {
  if (typeof window === "undefined") return "assistant";
  try {
    return (localStorage.getItem("chat_mode") as AgentMode) || "assistant";
  } catch { return "assistant"; }
}

export function saveModelChoice(model: ModelOption): void {
  localStorage.setItem("chat_model", JSON.stringify(model));
}

interface Props {
  selectedModel: ModelOption;
  onModelChange: (model: ModelOption) => void;
  agentMode: AgentMode;
  onModeChange: (mode: AgentMode) => void;
}

export function ModelSelector({ selectedModel, onModelChange, agentMode, onModeChange }: Props) {
  const [modelOpen, setModelOpen] = useState(false);
  const modelRef = useRef<HTMLDivElement>(null);

  const availableModels = getEnabledModels();

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (modelRef.current && !modelRef.current.contains(e.target as Node)) {
        setModelOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div className="flex items-center justify-between mt-3">
      <div className="flex items-center gap-3">
        {/* 模型选择器 */}
        <div className="relative" ref={modelRef}>
          <button
            onClick={() => setModelOpen(!modelOpen)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs transition-all duration-200 hover:bg-neutral-700/50"
            style={{ color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>{selectedModel.label}</span>
            <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${modelOpen ? "rotate-180" : ""}`} />
          </button>

          {modelOpen && (
            <div className="absolute bottom-full left-0 mb-2 w-64 rounded-xl overflow-hidden shadow-glass-lg animate-scale-in z-50"
              style={{ background: 'var(--surface-elevated)', border: '1px solid var(--border)' }}>
              <div className="px-3 py-2 text-[10px] font-medium" style={{ color: 'var(--text-tertiary)', borderBottom: '1px solid var(--border)' }}>
                选择模型
              </div>
              <div className="max-h-60 overflow-y-auto custom-scrollbar">
                {availableModels.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => {
                      onModelChange(opt);
                      saveModelChoice(opt);
                      setModelOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2.5 text-xs transition-all duration-200 ${
                      selectedModel.value === opt.value
                        ? "bg-primary-500/10 text-primary-400"
                        : "text-neutral-300 hover:bg-neutral-800/50"
                    }`}
                  >
                    <div className="font-medium">{opt.label}</div>
                    <div className="text-[10px] mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                      {opt.provider === "openai" ? "OpenAI" : opt.provider === "claude" ? "Anthropic" : opt.provider === "ollama" ? "本地" : "自定义"}
                    </div>
                  </button>
                ))}
                {availableModels.length === 0 && (
                  <div className="px-3 py-4 text-xs text-center" style={{ color: 'var(--text-secondary)' }}>
                    请在设置中启用模型
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* API 类型标识 */}
        <span className="text-[10px] hidden sm:inline" style={{ color: 'var(--text-tertiary)' }}>
          {selectedModel.provider === "custom" ? "自定义 API" : selectedModel.provider === "ollama" ? "本地运行" : "云端 API"}
        </span>
      </div>

      {/* Agent 模式选择器 */}
      <div className="flex items-center gap-1 rounded-xl p-1" style={{ background: 'var(--surface-secondary)', border: '1px solid var(--border)' }}>
        {MODE_OPTIONS.map((m) => {
          const Icon = m.icon;
          const active = agentMode === m.value;
          return (
            <button
              key={m.value}
              onClick={() => {
                onModeChange(m.value);
                localStorage.setItem("chat_mode", m.value);
              }}
              title={`${m.label} — ${m.desc}`}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-medium transition-all duration-200 ${
                active
                  ? "text-primary-400"
                  : "text-neutral-500 hover:text-neutral-300 hover:bg-neutral-700/50"
              }`}
              style={active ? { background: 'rgba(0, 217, 192, 0.1)', border: '1px solid rgba(0, 217, 192, 0.2)' } : {}}
            >
              <Icon className="w-3 h-3" />
              <span className="hidden sm:inline">{m.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
