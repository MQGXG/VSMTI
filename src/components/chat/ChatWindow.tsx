import { useState, useRef, useEffect, useCallback } from "react";
import { getProviderById } from "@/components/sidebar/SettingsDialog";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { ToolCallView } from "./ToolCallView";
import { ModelSelector, loadModelChoice, loadModeChoice } from "./ModelSelector";
import type { ModelOption } from "./ModelSelector";
import { ChatInput } from "./ChatInput";
import { useChatStream } from "./useChatStream";
import type { Message, AgentMode } from "./types";
import { FileUp, X, GitBranch, Sparkles, Wrench } from "lucide-react";
import { PermissionDialog } from "./PermissionDialog";
import { QuestionDialog } from "./QuestionDialog";
import type { ToolResult } from "@/types/electron";

/** 前端工具路由 — 关键词匹配用户输入到 TypeScript 工具 */
function routeToolMessage(input: string, tools: Array<{ name: string; description: string; parameters: Record<string, unknown> }>): { name: string; args: Record<string, unknown> } | null {
  const lower = input.toLowerCase().trim();
  for (const t of tools) {
    if (lower.startsWith("read ") || lower.startsWith("open ") || lower.startsWith("show ") || lower.startsWith("cat ")) {
      if (t.name === "read_file") {
        const path = lower.replace(/^(read|open|show|cat)\s+/i, "").trim();
        return { name: "read_file", args: { path } };
      }
    }
    if (lower.startsWith("search ") || lower.startsWith("find ") || lower.startsWith("查找") || lower.startsWith("搜索")) {
      if (t.name === "web_search") {
        const query = lower.replace(/^(search|find|查找|搜索)\s+/i, "").trim();
        return { name: "web_search", args: { query } };
      }
    }
    if (lower.startsWith("ls ") || lower.startsWith("list ") || lower.startsWith("dir ") || lower === "ls" || lower === "list" || lower === "dir") {
      if (t.name === "list_files") return { name: "list_files", args: {} };
    }
    if (lower.includes("grep ") || lower.startsWith("grep") || lower.startsWith("查找内容") || lower.startsWith("搜索内容")) {
      if (t.name === "grep") {
        const pattern = lower.replace(/^grep\s+/i, "").trim().split(/\s+/)[0];
        return { name: "grep", args: { pattern } };
      }
    }
    if (lower.startsWith("run ") || lower.startsWith("运行") || lower.startsWith("执行")) {
      if (t.name === "run_code") {
        const code = input.replace(/^(run|运行|执行)\s+/i, "").trim();
        return { name: "run_code", args: { code } };
      }
    }
  }
  return null;
}

interface Props {
  sessionId: string;
  onSessionChange?: (id: string) => void;
}

export function ChatWindow({ sessionId, onSessionChange }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState<ModelOption>(loadModelChoice);
  const [agentMode, setAgentMode] = useState<AgentMode>(loadModeChoice);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<Array<{ name: string; path: string }>>([]);
  const [permissionReq, setPermissionReq] = useState<{
    tool_name: string;
    args: Record<string, unknown>;
    reason: string;
    request_id: string;
  } | null>(null);
  const [questionReq, setQuestionReq] = useState<{
    question: string;
    options: string[];
    request_id: string;
  } | null>(null);
  const [backendRunning, setBackendRunning] = useState(false);
  const loadingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const dragCounter = useRef(0);
  const { streamChat } = useChatStream();

  useEffect(() => {
    const checkStatus = async () => {
      try {
        const status = await window.electronAPI.getPythonStatus();
        setBackendRunning(status.status === "running");
      } catch {
        setBackendRunning(false);
      }
    };
    checkStatus();
    const timer = setInterval(checkStatus, 5000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!sessionId) {
      if (backendRunning) setMessages([]);
      return;
    }
    const loadHistory = async () => {
      try {
        if (!backendRunning) return;
        const status = await window.electronAPI.getPythonStatus();
        if (status.status !== "running") return;
        const res = await fetch(`${status.url}/api/sessions/${encodeURIComponent(sessionId)}/messages`);
        if (!res.ok) {
          setMessages([]);
          return;
        }
        const data = await res.json();
        const historyMessages = data.messages || [];
        const formattedMessages: Message[] = historyMessages.map((msg: any) => ({
          id: crypto.randomUUID(),
          dbId: msg.id,
          role: msg.role,
          content: msg.content,
        }));
        setMessages(formattedMessages);
      } catch {
        setMessages([]);
      }
    };
    loadHistory();
    setUploadedFiles([]);
  }, [sessionId]);

  const handleDragEnter = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer?.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(async (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounter.current = 0;

    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) return;

    try {
      const status = await window.electronAPI.getPythonStatus();
      if (status.status !== "running") {
        throw new Error("Python 后端未启动");
      }

      const uploaded: Array<{ name: string; path: string }> = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const formData = new FormData();
        formData.append("file", file);

        const response = await fetch(`${status.url}/api/files/upload`, {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          throw new Error(`上传失败: ${file.name}`);
        }

        const data = await response.json();
        uploaded.push({ name: file.name, path: data.path || data.filename });
      }

      setUploadedFiles((prev) => [...prev, ...uploaded]);

      const fileDetails = uploaded.map((f) => `"${f.name}" (路径: ${f.path})`).join("、");
      const message = `我刚刚上传了文件：${fileDetails}。请用 read_file 读取这些文件并分析内容。`;

      setTimeout(() => {
        setInput(message);
      }, 100);
    } catch (err: any) {
      console.error("文件上传失败:", err);
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: `⚠️ 文件上传失败：${err?.message || String(err)}`,
        },
      ]);
    }
  }, []);

  useEffect(() => {
    const dropZone = document.body;
    dropZone.addEventListener("dragenter", handleDragEnter);
    dropZone.addEventListener("dragleave", handleDragLeave);
    dropZone.addEventListener("dragover", handleDragOver);
    dropZone.addEventListener("drop", handleDrop);

    return () => {
      dropZone.removeEventListener("dragenter", handleDragEnter);
      dropZone.removeEventListener("dragleave", handleDragLeave);
      dropZone.removeEventListener("dragover", handleDragOver);
      dropZone.removeEventListener("drop", handleDrop);
    };
  }, [handleDragEnter, handleDragLeave, handleDragOver, handleDrop]);

  const sendMessage = useCallback(async () => {
    const content = input.trim();
    if (!content || isLoading) return;
    setInput("");

    const userMsg: Message = { id: crypto.randomUUID(), role: "user", content };
    const assistantId = crypto.randomUUID();
    setMessages((prev) => [...prev, userMsg, { id: assistantId, role: "assistant", content: "", toolCalls: [] }]);
    setIsLoading(true);
    if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
    loadingTimeoutRef.current = setTimeout(() => {
      setIsLoading(false);
    }, 120000);

    try {
      const provider = await getProviderById(selectedModel.provider);
      const apiKey = provider?.apiKey || "";
      const apiUrl = provider?.apiUrl || "";

      // Path 1: Python 后端在线 → 使用完整后端 Agent（支持所有 Provider + 工具 + 持久化）
      const status = await window.electronAPI.getPythonStatus();
      if (status.status === "running") {
        const body = {
          message: content,
          session_id: sessionId,
          model: selectedModel.provider,
          model_name: selectedModel.value,
          api_key: apiKey,
          api_url: apiUrl,
          mode: agentMode,
        };

        await streamChat(status.url, body, {
          onContent: (text) => {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, content: m.content + text } : m
              )
            );
          },
          onToolStart: (_id, name, args) => {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? {
                      ...m,
                      toolCalls: m.toolCalls?.some((tc) => tc.name === name)
                        ? m.toolCalls.map((tc) =>
                            tc.name === name ? { ...tc, args, argsText: JSON.stringify(args) } : tc
                          )
                        : [...(m.toolCalls || []), { name, args, argsText: "", status: "running" as const }],
                    }
                  : m
              )
            );
          },
          onToolDelta: (id, delta) => {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? {
                      ...m,
                      toolCalls: m.toolCalls?.map((tc) =>
                        tc.name === id || (m.toolCalls?.length ?? 0) > 0
                          ? { ...tc, argsText: (tc.argsText || "") + delta }
                          : tc
                      ),
                    }
                  : m
              )
            );
          },
          onToolResult: (name, output, success) => {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? {
                      ...m,
                      toolCalls: m.toolCalls?.map((tc) =>
                        tc.name === name
                          ? { ...tc, result: output, status: (success ? "done" : "error") as "done" | "error" }
                          : tc
                      ),
                    }
                  : m
              )
            );
          },
          onToolError: (name, error) => {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? {
                      ...m,
                      toolCalls: m.toolCalls?.map((tc) =>
                        tc.name === name ? { ...tc, result: error, status: "error" as const } : tc
                      ),
                    }
                  : m
              )
            );
          },
          onPermissionRequest: (req) => setPermissionReq(req),
          onQuestion: (q) => setQuestionReq(q),
          onError: (msg) => {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? { ...m, content: m.content + `\n\n⚠️ ${msg}` }
                  : m
              )
            );
          },
          onFinish: () => {
            setIsLoading(false);
          },
        });
        return;
      }

      // Path 2: 有 API Key → TS Agent Core + LLM Function Calling
      if (apiKey) {
        const workspace = window.electronAPI.platform === "win32" ? "C:\\" : "/";
        const config = {
          sessionID: sessionId || `offline-${crypto.randomUUID()}`,
          workspace,
          model: selectedModel.value,
          apiKey,
          apiUrl,
          provider: selectedModel.provider,
          headers: provider?.headers || {},
          options: provider?.options || {},
        };
        const history = messages
          .filter((m) => m.role === "user" || m.role === "assistant")
          .map((m) => ({ role: m.role, content: m.content }));
        const events = await window.electronAPI.agent.chat(config, content, history);
        for (const evt of events) {
          if (evt.type === "content" && evt.text) {
            setMessages((prev) => prev.map((m) => m.id === assistantId ? { ...m, content: m.content + evt.text! } : m));
          } else if (evt.type === "tool_start" && evt.name) {
            setMessages((prev) => prev.map((m) => m.id === assistantId ? {
              ...m, toolCalls: [...(m.toolCalls || []), { name: evt.name!, args: evt.args || {}, argsText: "", status: "running" as const }],
            } : m));
          } else if (evt.type === "tool_result" && evt.name && evt.output) {
            setMessages((prev) => prev.map((m) => m.id === assistantId ? {
              ...m, toolCalls: m.toolCalls?.map((tc) => tc.name === evt.name ? { ...tc, result: evt.output!, status: "done" as const } : tc),
            } : m));
          } else if (evt.type === "error" && evt.message) {
            setMessages((prev) => prev.map((m) => m.id === assistantId ? { ...m, content: m.content + `\n\n⚠️ ${evt.message}` } : m));
          }
        }
        setIsLoading(false);
        return;
      }

      // Path 3: 无 API Key → 关键词路由 → 直调 TypeScript 工具
      const tools = await window.electronAPI.agent.listTools().catch(() => []);
      if (tools.length > 0) {
        const toolRoute = routeToolMessage(content, tools);
        if (toolRoute) {
          const result = await window.electronAPI.agent.executeTool(toolRoute.name, toolRoute.args);
          setMessages((prev) => prev.map((m) => m.id === assistantId ? {
            ...m,
            content: result.success
              ? `✅ **${toolRoute.name}** 执行成功\n\n${result.output}`
              : `❌ **${toolRoute.name}** 执行失败\n\n${result.error || "未知错误"}`,
          } : m));
          setIsLoading(false);
          return;
        }
      }

      // Path 4: 都匹配不到
      setMessages((prev) => prev.map((m) => m.id === assistantId ? {
        ...m,
        content: "未识别到工具命令。请使用 🔧 工具面板手动执行，或在设置中配置 API Key 启用 AI 对话。",
      } : m));
    } catch (err: any) {
      console.error("Chat error:", err);
      setMessages((prev) => prev.map((m) => m.id === assistantId
        ? { ...m, content: `⚠️ 发送失败：${err?.message || String(err)}`, toolCalls: [] }
        : m
      ));
    } finally {
      if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
      setIsLoading(false);
    }
  }, [input, isLoading, sessionId, selectedModel, agentMode, messages, streamChat]);

  const handleQuestionAnswer = useCallback(async (answer: string) => {
    const req = questionReq;
    if (!req) return;
    setQuestionReq(null);
    try {
      const status = await window.electronAPI.getPythonStatus();
      if (status.status === "running") {
        await fetch(`${status.url}/api/question/respond`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ request_id: req.request_id, answer }),
        });
      }
    } catch (err) {
      console.error("Question response failed:", err);
    }
  }, [questionReq]);

  const handlePermission = useCallback(async (approved: boolean) => {
    const req = permissionReq;
    if (!req) return;
    setPermissionReq(null);
    try {
      const status = await window.electronAPI.getPythonStatus();
      if (status.status === "running") {
        await fetch(`${status.url}/api/permission/respond`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ request_id: req.request_id, approved }),
        });
      }
    } catch (err) {
      console.error("Permission response failed:", err);
    }
  }, [permissionReq]);

  const handleFork = useCallback(async (forkAtMessageId: number | undefined) => {
    try {
      const status = await window.electronAPI.getPythonStatus();
      if (status.status !== "running") return;

      const res = await fetch(`${status.url}/api/sessions/${encodeURIComponent(sessionId)}/fork`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, fork_at_message_id: forkAtMessageId ?? null }),
      });
      if (!res.ok) throw new Error("分叉失败");
      const data = await res.json();
      if (data.session && onSessionChange) {
        onSessionChange(data.session.session_id);
      }
    } catch (err) {
      console.error("Fork error:", err);
    }
  }, [sessionId, onSessionChange]);

  const removeUploadedFile = (index: number) => {
    setUploadedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleToolResult = useCallback((toolName: string, result: ToolResult) => {
    const icon = toolName === "read_file" ? "📄" : toolName === "web_search" ? "🔍" : toolName === "write_file" ? "✏️" : "🔧"
    const header = `${icon} **${toolName}**`
    const content = result.success
      ? `${header}\n\n${result.output}`
      : `${header}\n\n⚠️ ${result.error || "执行失败"}`
    const msg: Message = {
      id: crypto.randomUUID(),
      role: "assistant",
      content,
    }
    setMessages((prev) => [...prev, msg])
  }, [])

  return (
    <div className="flex flex-col h-full relative">
      {isDragging && (
        <div className="absolute inset-0 z-50 glass-heavy border-2 border-dashed border-accent-400/50 rounded-lg flex items-center justify-center animate-fade-in-up">
          <div className="text-center space-y-2">
            <FileUp className="w-12 h-12 text-accent-400 mx-auto" />
            <p className="text-accent-300 text-lg font-medium">释放以上传文件</p>
            <p className="text-accent-400/60 text-sm">支持任意文本文件</p>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 py-6 max-w-3xl mx-auto w-full">
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center space-y-3">
              <div className="flex items-center justify-center gap-2">
                <Sparkles className="w-6 h-6 text-accent-400" />
                <h1 className="text-3xl font-light tracking-tight gradient-text">OmniAgent</h1>
              </div>
              {!backendRunning ? (
                <>
                  <p className="text-neutral-500 text-sm">离线模式：配置 API Key 后即可 AI 对话</p>
                  <p className="text-xs text-neutral-600">当前使用 TypeScript Agent，工具面板也可直接使用</p>
                </>
              ) : !sessionId ? (
                <>
                  <p className="text-neutral-500 text-sm">点击下方 🔧 按钮直接使用工具</p>
                  <p className="text-xs text-neutral-600">无需 Python 后端，读文件、搜网络、查内容</p>
                </>
              ) : (
                <>
                  <p className="text-neutral-500 text-sm">全能 AI 助手，有什么可以帮你？</p>
                  <p className="text-xs text-neutral-600">拖拽文件到窗口让 Agent 分析 · 也可用 🔧 工具面板</p>
                </>
              )}
            </div>
          </div>
        )}

        {messages.map((msg, idx) => (
          <div key={msg.id} className="group mb-6 relative animate-fade-in-up">
            <div className={`flex w-full ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed select-text ${
                msg.role === "user"
                  ? "message-user"
                  : "message-assistant"
              }`}>
                {msg.content ? (
                  msg.role === "assistant" ? (
                    <MarkdownRenderer content={msg.content} />
                  ) : (
                    <span className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</span>
                  )
                ) : (
                  <span className="text-neutral-500 italic">思考中...</span>
                )}
              </div>
            </div>
            {msg.toolCalls?.map((tc, i) => <ToolCallView key={i} info={tc} />)}

            {msg.role === "assistant" && msg.content && (
              <div className="absolute -left-8 top-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => handleFork(msg.dbId)}
                  className="p-1 rounded hover:bg-white/10 text-neutral-500 hover:text-emerald-400 transition-all"
                  title="从此处分叉新会话"
                >
                  <GitBranch className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        ))}

        {isLoading && messages[messages.length - 1]?.content === "" && (
          <div className="flex items-center gap-3 text-neutral-500 px-1">
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 bg-accent-400 rounded-full animate-bounce-dot" style={{ animationDelay: "0s" }} />
              <span className="w-2 h-2 bg-accent-400 rounded-full animate-bounce-dot" style={{ animationDelay: "0.2s" }} />
              <span className="w-2 h-2 bg-accent-400 rounded-full animate-bounce-dot" style={{ animationDelay: "0.4s" }} />
            </div>
            <span className="text-sm">思考中...</span>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {questionReq && (
        <QuestionDialog
          question={questionReq.question}
          options={questionReq.options}
          onSubmit={handleQuestionAnswer}
        />
      )}

      {permissionReq && (
        <PermissionDialog
          toolName={permissionReq.tool_name}
          args={permissionReq.args}
          reason={permissionReq.reason}
          onAllow={() => handlePermission(true)}
          onDeny={() => handlePermission(false)}
        />
      )}

      <div className="border-t border-glass-border p-4 max-w-3xl mx-auto w-full">
        {uploadedFiles.length > 0 && (
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            {uploadedFiles.map((file, index) => (
              <div
                key={index}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-md glass-light text-xs text-accent-400"
              >
                <FileUp className="w-3 h-3" />
                <span className="max-w-[150px] truncate">{file.name}</span>
                <button
                  onClick={() => removeUploadedFile(index)}
                  className="p-0.5 rounded hover:bg-white/10 transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        <ChatInput
          input={input}
          isLoading={isLoading}
          disabled={isLoading || (backendRunning && !sessionId)}
          onInput={setInput}
          onSend={sendMessage}
          onToolResult={handleToolResult}
        />
        <ModelSelector
          selectedModel={selectedModel}
          onModelChange={setSelectedModel}
          agentMode={agentMode}
          onModeChange={setAgentMode}
        />
      </div>
    </div>
  );
}
