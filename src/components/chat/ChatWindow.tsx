import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Loader2, ChevronDown, CheckCircle2, XCircle, Search, Code, FileText, Image, Globe, Cpu } from "lucide-react";
import { getSettings } from "@/components/sidebar/SettingsDialog";

const MODEL_OPTIONS = [
  { label: "GPT-4o", value: "gpt-4o", provider: "openai" },
  { label: "GPT-4o-mini", value: "gpt-4o-mini", provider: "openai" },
  { label: "Claude Sonnet 4", value: "claude-sonnet-4-20250514", provider: "claude" },
  { label: "Claude Haiku", value: "claude-haiku-20241022", provider: "claude" },
  { label: "DeepSeek V3", value: "deepseek-chat", provider: "custom" },
  { label: "DeepSeek R1", value: "deepseek-reasoner", provider: "custom" },
  { label: "Ollama (本地)", value: "llama3.1", provider: "local" },
  { label: "自定义", value: "", provider: "custom" },
];

function loadModelChoice() {
  if (typeof window === "undefined") return MODEL_OPTIONS[0];
  try {
    const saved = localStorage.getItem("chat_model");
    if (saved) return JSON.parse(saved);
  } catch { /* ignore */ }
  return MODEL_OPTIONS[0];
}

interface ToolCallInfo {
  name: string;
  args: Record<string, unknown>;
  result?: string;
  status: "running" | "done" | "error";
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolCalls?: ToolCallInfo[];
}

const toolIcons: Record<string, typeof Code> = {
  web_search: Search,
  run_code: Code,
  read_file: FileText,
  write_file: FileText,
  data_analysis: Code,
  image_generate: Image,
  browse_web: Globe,
};

function ToolCall({ info }: { info: ToolCallInfo }) {
  const [expanded, setExpanded] = useState(false);
  const Icon = toolIcons[info.name] || Code;

  return (
    <div className="ml-4 mt-2 border-l-2 border-neutral-700 pl-4">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-sm text-neutral-400 hover:text-neutral-200 transition-colors"
      >
        {info.status === "running" ? (
          <Loader2 className="w-4 h-4 animate-spin text-amber-500" />
        ) : info.status === "done" ? (
          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
        ) : (
          <XCircle className="w-4 h-4 text-red-500" />
        )}
        <Icon className="w-4 h-4" />
        <span className="font-mono text-xs">{info.name}</span>
        <ChevronDown className={`w-3 h-3 transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>
      {expanded && (
        <div className="mt-2 space-y-2">
          <div className="bg-neutral-900 rounded-md p-3 text-xs">
            <div className="text-neutral-500 mb-1">参数：</div>
            <pre className="text-neutral-300 overflow-x-auto">{JSON.stringify(info.args, null, 2)}</pre>
          </div>
          {info.result && (
            <div className="bg-neutral-900 rounded-md p-3 text-xs">
              <div className="text-neutral-500 mb-1">结果：</div>
              <pre className="text-neutral-300 overflow-x-auto max-h-48 overflow-y-auto">{info.result}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface Props {
  sessionId: string;
}

export function ChatWindow({ sessionId }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState(loadModelChoice);
  const [modelOpen, setModelOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const modelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (modelRef.current && !modelRef.current.contains(e.target as Node)) {
        setModelOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const sendMessage = useCallback(async () => {
    const content = input.trim();
    if (!content || isLoading) return;
    setInput("");

    const userMsg: Message = { id: crypto.randomUUID(), role: "user", content };
    const assistantId = crypto.randomUUID();
    setMessages((prev) => [
      ...prev,
      userMsg,
      { id: assistantId, role: "assistant", content: "", toolCalls: [] },
    ]);
    setIsLoading(true);

    try {
      const status = await window.electronAPI.getPythonStatus();
      const settings = getSettings();
      const response = await fetch(`${status.url}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: content,
          session_id: sessionId,
          model: selectedModel.provider,
          model_name: selectedModel.value || settings.modelName,
          api_key: settings.apiKey || undefined,
          api_url: settings.apiUrl,
        }),
      });

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop()!;

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = JSON.parse(line.slice(6));

          switch (data.type) {
            case "content":
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId ? { ...m, content: m.content + data.text } : m
                )
              );
              break;
            case "tool_start":
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? {
                        ...m,
                        toolCalls: [
                          ...(m.toolCalls || []),
                          { name: data.name, args: data.args, status: "running" as const },
                        ],
                      }
                    : m
                )
              );
              break;
            case "tool_result":
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? {
                        ...m,
                        toolCalls: m.toolCalls?.map((tc) =>
                          tc.name === data.name ? { ...tc, result: data.output, status: "done" as const } : tc
                        ),
                      }
                    : m
                )
              );
              break;
          }
        }
      }
    } catch (err) {
      console.error("Chat error:", err);
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, sessionId, selectedModel]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto px-4 py-6 max-w-3xl mx-auto w-full">
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center space-y-3">
              <h1 className="text-3xl font-light tracking-tight text-neutral-100">OmniAgent</h1>
              <p className="text-neutral-500 text-sm">全能 AI 助手，有什么可以帮你？</p>
              <p className="text-xs text-neutral-600">拖拽文件到窗口让 Agent 分析</p>
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className="mb-6">
            <div className={`flex w-full ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "bg-emerald-600/20 text-emerald-50 border border-emerald-500/20"
                    : "bg-neutral-900 text-neutral-200 border border-neutral-800"
                }`}
              >
                {msg.content || <span className="text-neutral-500 italic">思考中...</span>}
              </div>
            </div>
            {msg.toolCalls?.map((tc, i) => <ToolCall key={i} info={tc} />)}
          </div>
        ))}

        {isLoading && messages[messages.length - 1]?.content === "" && (
          <div className="flex items-center gap-2 text-neutral-500">
            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
            <span className="text-sm">思考中...</span>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-neutral-800 p-4 max-w-3xl mx-auto w-full">
        <div className="flex items-end gap-2 bg-neutral-900 rounded-2xl border border-neutral-800 px-4 py-3 focus-within:border-emerald-500/40 transition-colors">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
            placeholder="输入消息... (Ctrl+Shift+A 全局唤出)"
            rows={1}
            className="flex-1 bg-transparent text-sm text-neutral-200 placeholder-neutral-600 outline-none resize-none leading-relaxed"
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || isLoading}
            className="flex-shrink-0 w-9 h-9 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:bg-neutral-800 disabled:text-neutral-600 text-white flex items-center justify-center transition-all"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>

        {/* 模型选择 */}
        <div className="flex items-center gap-2 mt-2">
          <div className="relative" ref={modelRef}>
            <button
              onClick={() => setModelOpen(!modelOpen)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 transition-colors border border-transparent hover:border-neutral-700"
            >
              <Cpu className="w-3 h-3" />
              <span>{selectedModel.label}</span>
              <ChevronDown className={`w-3 h-3 transition-transform ${modelOpen ? "rotate-180" : ""}`} />
            </button>

            {modelOpen && (
              <div className="absolute bottom-full left-0 mb-1 w-56 bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl overflow-hidden z-50 animate-fade-in">
                <div className="max-h-60 overflow-y-auto py-1">
                  {MODEL_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => {
                        setSelectedModel(opt);
                        localStorage.setItem("chat_model", JSON.stringify(opt));
                        setModelOpen(false);
                      }}
                      className={`w-full text-left px-3 py-2 text-xs transition-colors ${
                        selectedModel.value === opt.value
                          ? "bg-emerald-600/10 text-emerald-400"
                          : "text-neutral-300 hover:bg-neutral-800"
                      }`}
                    >
                      <div className="font-medium">{opt.label}</div>
                      <div className="text-neutral-500 text-[10px] mt-0.5">
                        {opt.provider === "openai" ? "OpenAI" : opt.provider === "claude" ? "Anthropic" : opt.provider === "local" ? "本地" : "自定义"}
                        {opt.value && ` · ${opt.value}`}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <span className="text-[10px] text-neutral-600">
            {selectedModel.provider === "custom" ? "自定义 API" : selectedModel.provider === "local" ? "本地运行" : "云端 API"}
          </span>
        </div>
      </div>
    </div>
  );
}
