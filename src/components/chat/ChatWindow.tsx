import { useState, useRef, useEffect, useCallback } from "react";
import { getProviderById, getSettings } from "@/components/sidebar/SettingsDialog";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { ToolCallView } from "./ToolCallView";
import { ModelSelector, loadModelChoice, loadModeChoice } from "./ModelSelector";
import type { ModelOption } from "./ModelSelector";
import { ChatInput } from "./ChatInput";
import { useChatStream } from "./useChatStream";
import type { Message, AgentMode } from "./types";
import { FileUp, X, GitBranch, Sparkles, Wrench, Copy, Check, Pencil, RefreshCw } from "lucide-react";
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
    channel?: string;
  } | null>(null);
  const [questionReq, setQuestionReq] = useState<{
    question: string;
    options: string[];
    request_id: string;
  } | null>(null);
  const [backendRunning, setBackendRunning] = useState(false);
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState("");
  const loadingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const editInputRef = useRef<HTMLTextAreaElement>(null);
  const dragCounter = useRef(0);
  const { streamChat } = useChatStream();
  const currentChannelRef = useRef<string | null>(null);
  const offlineSessionIdRef = useRef<string | null>(null);
  function getOfflineSessionId(): string {
    if (offlineSessionIdRef.current) return offlineSessionIdRef.current;
    const stored = localStorage.getItem('offlineSessionId');
    if (stored) {
      offlineSessionIdRef.current = stored;
      return stored;
    }
    const id = `offline-${crypto.randomUUID()}`;
    localStorage.setItem('offlineSessionId', id);
    offlineSessionIdRef.current = id;
    return id;
  }

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
      setMessages([]);
      return;
    }
    const loadHistory = async () => {
      try {
        // Path A: Python 在线 → 从 Python API 加载
        const status = await window.electronAPI.getPythonStatus();
        if (status.status === "running") {
          const res = await fetch(`${status.url}/api/sessions/${encodeURIComponent(sessionId)}/messages`);
          if (res.ok) {
            const data = await res.json();
            const formattedMessages: Message[] = (data.messages || []).map((msg: any) => ({
              id: crypto.randomUUID(),
              dbId: msg.id,
              role: msg.role,
              content: msg.content,
            }));
            setMessages(formattedMessages);
            return;
          }
        }

        // Path B: TS Core 离线 → 从本地 session store 加载
        const tsMsgs = await window.electronAPI.ts.getSessionMessages(sessionId);
        if (tsMsgs && tsMsgs.length > 0) {
          const formattedMessages: Message[] = tsMsgs.map((msg: any) => ({
            id: crypto.randomUUID(),
            dbId: msg.id,
            role: msg.role,
            content: msg.content,
          }));
          setMessages(formattedMessages);
        } else {
          setMessages([]);
        }
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

      if (status.status === "running") {
        // Path A: Python 后端在线 → 上传文件到后端
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
      } else {
        // Path B: 后端离线 → 直接用 Electron 本地路径
        const localFiles: Array<{ name: string; path: string }> = [];
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          // Electron 中拖拽文件可以获取到完整路径
          const filePath = (file as any).path || file.name;
          localFiles.push({ name: file.name, path: filePath });
        }

        setUploadedFiles((prev) => [...prev, ...localFiles]);

        const fileDetails = localFiles.map((f) => `"${f.name}" (路径: ${f.path})`).join("、");
        const message = `我刚刚添加了文件：${fileDetails}。请使用 read_file 读取这些文件并分析内容。`;

        setTimeout(() => {
          setInput(message);
        }, 100);
      }
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

  const sendMessage = useCallback(async (directContent?: string) => {
    const content = (directContent ?? input).trim();
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

      // Path 2: TS Agent Core（实时流式，支持权限确认）
      // 即使 renderer 无 API Key，主进程也会从文件/环境变量配置中 fallback
      if (apiKey || provider) {
        const workspace = window.electronAPI.platform === "win32" ? "C:\\" : "/";
        const config = {
          sessionID: sessionId || getOfflineSessionId(),
          workspace,
          model: selectedModel.value,
          apiKey,
          apiUrl,
          provider: selectedModel.provider,
          headers: provider?.headers || {},
          options: { ...(provider?.options || {}), shell: getSettings().terminalShell || "default" },
        };

        const channel = await window.electronAPI.agent.startStream(sessionId || getOfflineSessionId(), content, config);
        console.log("[ChatWindow] channel started:", channel);
        currentChannelRef.current = channel;
        const cleanup = window.electronAPI.agent.onEvent(channel, (event: any) => {
          console.log("[ChatWindow] event:", event.type, event);
          if (event.type === "content") {
            setMessages((prev) => {
              const last = prev[prev.length - 1];
              if (last?.role === "assistant") {
                return [...prev.slice(0, -1), { ...last, content: last.content + event.text }];
              }
              return [...prev, { id: crypto.randomUUID(), role: "assistant", content: event.text }];
            });
          } else if (event.type === "tool_start") {
            setMessages((prev) => [...prev, {
              id: crypto.randomUUID(),
              role: "assistant",
              content: `🔧 Using tool **${event.name}** with ${JSON.stringify(event.args)}`,
              isToolCall: true,
            }]);
          } else if (event.type === "tool_result") {
            setMessages((prev) => [...prev, {
              id: crypto.randomUUID(),
              role: "assistant",
              content: event.result.success
                ? `✅ Result: ${event.result.output?.slice(0, 500) || ""}`
                : `❌ Error: ${event.result.error}`,
              isToolCall: true,
            }]);
          } else if (event.type === "permission_request") {
            const s = getSettings();
            if (s.autoAcceptPermissions) {
              // 自动接受
              window.electronAPI.agent.replyPermission(channel, event.id, "allow");
            } else {
              setPermissionReq({
                tool_name: event.action,
                args: event.toolCall?.input || {},
                reason: `需要权限执行操作: ${event.action}`,
                request_id: event.id,
                channel,
              });
            }
          } else if (event.type === "error") {
            setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "assistant", content: `Error: ${event.message}` }]);
          } else if (event.type === "finish") {
            setIsLoading(false);
            cleanup();
            currentChannelRef.current = null;
            window.electronAPI.agent.stopStream(channel);
          }
        });
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

  const startEditing = useCallback((msgId: string, content: string) => {
    setEditingMsgId(msgId);
    setEditingContent(content);
    setTimeout(() => editInputRef.current?.focus(), 50);
  }, []);

  const cancelEditing = useCallback(() => {
    setEditingMsgId(null);
    setEditingContent("");
  }, []);

  const saveAndResend = useCallback(() => {
    const trimmed = editingContent.trim();
    if (!trimmed || !editingMsgId) return;
    setMessages((prev) => prev.map((m) => m.id === editingMsgId ? { ...m, content: trimmed } : m));
    setEditingMsgId(null);
    sendMessage(trimmed);
  }, [editingContent, editingMsgId, sendMessage]);

  const handleRetry = useCallback((_msgId: string, content: string) => {
    sendMessage(content);
  }, [sendMessage]);

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

  const handlePermission = useCallback(async (approved: boolean | "always") => {
    const req = permissionReq;
    if (!req) return;
    setPermissionReq(null);
    try {
      if (req.channel) {
        // TS Agent Core 实时流式通道
        await window.electronAPI.agent.replyPermission(
          req.channel,
          req.request_id,
          approved === "always" ? "always" : approved ? "allow" : "deny",
        );
        return;
      }
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

  const handleCopyMessage = useCallback(async (msgId: string, content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedMsgId(msgId);
      setTimeout(() => setCopiedMsgId(null), 2000);
    } catch { /* ignore */ }
  }, []);

  const handleStop = useCallback(() => {
    setIsLoading(false);
    const ch = currentChannelRef.current;
    if (ch) window.electronAPI.agent.stopStream(ch);
  }, []);

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

      <div className="flex-1 overflow-y-auto px-4 py-6 max-w-3xl mx-auto w-full lg:px-6">
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center space-y-5">
              <div className="flex items-center justify-center gap-2">
                <Sparkles className="w-6 h-6 text-accent-400" />
                <h1 className="text-3xl font-light tracking-tight gradient-text">OmniAgent</h1>
              </div>
              {!backendRunning ? (
                <div className="space-y-3">
                  <p className="text-neutral-500 text-sm">Core 模式 · TypeScript Agent Core 驱动</p>
                  <div className="flex flex-wrap items-center justify-center gap-2 text-xs">
                    <span className="px-2.5 py-1 rounded-md bg-white/5 text-neutral-400">配置文件 API Key</span>
                    <span className="px-2.5 py-1 rounded-md bg-white/5 text-neutral-400">或环境变量</span>
                    <span className="px-2.5 py-1 rounded-md bg-white/5 text-neutral-400">即可对话</span>
                  </div>
                  <div className="pt-2 flex flex-wrap items-center justify-center gap-3 text-[10px] text-neutral-600">
                    <span className="flex items-center gap-1"><kbd className="px-1.5 py-0.5 rounded bg-white/5 font-mono">Ctrl+Shift+A</kbd> 全局唤出</span>
                    <span className="flex items-center gap-1"><kbd className="px-1.5 py-0.5 rounded bg-white/5 font-mono">/</kbd> 命令菜单</span>
                    <span className="flex items-center gap-1"><kbd className="px-1.5 py-0.5 rounded bg-white/5 font-mono">拖拽文件</kbd> 上传分析</span>
                  </div>
                </div>
              ) : !sessionId ? (
                <div className="space-y-3">
                  <p className="text-neutral-500 text-sm">工具模式 · 直接执行操作</p>
                  <div className="flex items-center justify-center gap-2 text-xs">
                    <span className="px-2.5 py-1 rounded-md bg-white/5 text-neutral-400">读取文件</span>
                    <span className="px-2.5 py-1 rounded-md bg-white/5 text-neutral-400">搜索网络</span>
                    <span className="px-2.5 py-1 rounded-md bg-white/5 text-neutral-400">运行代码</span>
                    <span className="px-2.5 py-1 rounded-md bg-white/5 text-neutral-400">搜索内容</span>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-neutral-500 text-sm">全能 AI 助手，有什么可以帮你？</p>
                  <div className="flex items-center justify-center gap-2 text-xs">
                    <span className="px-2.5 py-1 rounded-md bg-white/5 text-neutral-400">直接输入提问</span>
                    <span className="px-2.5 py-1 rounded-md bg-white/5 text-neutral-400">拖拽文件分析</span>
                    <span className="px-2.5 py-1 rounded-md bg-white/5 text-neutral-400">切换 Agent 模式</span>
                  </div>
                  <div className="pt-1 flex items-center justify-center gap-3 text-[10px] text-neutral-600">
                    <span className="flex items-center gap-1"><kbd className="px-1.5 py-0.5 rounded bg-white/5 font-mono">Enter</kbd> 发送</span>
                    <span className="flex items-center gap-1"><kbd className="px-1.5 py-0.5 rounded bg-white/5 font-mono">Shift+Enter</kbd> 换行</span>
                    <span className="flex items-center gap-1"><kbd className="px-1.5 py-0.5 rounded bg-white/5 font-mono">/</kbd> 命令</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

          {messages.map((msg, idx) => {
          const isEditingThis = editingMsgId === msg.id;
          return (
          <div key={msg.id} className="group mb-6 relative animate-fade-in-up message-group">
            <div className={`flex w-full ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`message-bubble max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed select-text ${
                msg.role === "user"
                  ? "message-user"
                  : "message-assistant"
              }`}>
                {isEditingThis ? (
                  <div className="space-y-2">
                    <textarea
                      ref={editInputRef}
                      value={editingContent}
                      onChange={(e) => setEditingContent(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); saveAndResend(); } if (e.key === "Escape") cancelEditing(); }}
                      className="w-full bg-transparent text-sm text-gray-900 dark:text-neutral-200 outline-none resize-none leading-relaxed"
                      rows={Math.max(2, editingContent.split("\n").length)}
                    />
                    <div className="flex items-center gap-2 justify-end">
                      <button onClick={cancelEditing} className="px-2.5 py-1 rounded-md text-[10px] text-neutral-400 hover:text-neutral-200 hover:bg-white/10 transition-colors">取消</button>
                      <button onClick={saveAndResend} className="px-2.5 py-1 rounded-md text-[10px] btn-gradient text-white">保存并发送</button>
                    </div>
                  </div>
                ) : (
                  msg.content ? (
                    msg.role === "assistant" ? (
                      <MarkdownRenderer content={msg.content} />
                    ) : (
                      <span className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</span>
                    )
                  ) : (
                    <span className="text-neutral-500 italic">思考中...</span>
                  )
                )}
              </div>
            </div>
            {msg.toolCalls?.map((tc, i) => <ToolCallView key={i} info={tc} />)}

            {!isEditingThis && (msg.role === "assistant" || msg.role === "user") && msg.content && (
              <div className={`message-actions absolute ${msg.role === "user" ? "-left-10" : "-right-10"} top-2 flex gap-1`}>
                <button
                  onClick={() => handleCopyMessage(msg.id, msg.content)}
                  className="p-1.5 rounded-lg hover:bg-white/10 text-neutral-500 hover:text-accent-400 transition-all"
                  title="复制消息"
                >
                  {copiedMsgId === msg.id ? (
                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
                {msg.role === "user" && (
                  <>
                    <button
                      onClick={() => startEditing(msg.id, msg.content)}
                      className="p-1.5 rounded-lg hover:bg-white/10 text-neutral-500 hover:text-accent-400 transition-all"
                      title="编辑消息"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleRetry(msg.id, msg.content)}
                      className="p-1.5 rounded-lg hover:bg-white/10 text-neutral-500 hover:text-emerald-400 transition-all"
                      title="重新发送"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                  </>
                )}
                {msg.role === "assistant" && (
                  <button
                    onClick={() => handleFork(msg.dbId)}
                    className="p-1.5 rounded-lg hover:bg-white/10 text-neutral-500 hover:text-emerald-400 transition-all"
                    title="从此处分叉新会话"
                  >
                    <GitBranch className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}

        {isLoading && (() => {
          const settings = getSettings();
          return (
            <div className="flex items-center gap-3 px-1">
              <button onClick={async () => {
                setIsLoading(false);
                const ch = currentChannelRef.current;
                if (ch) window.electronAPI.agent.stopStream(ch);
              }} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors">
                停止
              </button>
              {settings.showProgressBar ? (
                <div className="flex-1">
                  <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-accent-500 to-accent-300 rounded-full animate-[progress_2s_ease-in-out_infinite]" style={{width:'40%'}} />
                  </div>
                  <p className="text-xs text-neutral-600 mt-1">Agent 正在工作...</p>
                </div>
              ) : (
                <div className="flex items-center gap-3 text-neutral-500">
                  <div className="flex items-center gap-1">
                    <span className="w-2 h-2 bg-accent-400 rounded-full animate-bounce-dot" style={{ animationDelay: "0s" }} />
                    <span className="w-2 h-2 bg-accent-400 rounded-full animate-bounce-dot" style={{ animationDelay: "0.2s" }} />
                    <span className="w-2 h-2 bg-accent-400 rounded-full animate-bounce-dot" style={{ animationDelay: "0.4s" }} />
                  </div>
                  <span className="text-sm">思考中...</span>
                </div>
              )}
            </div>
          );
        })()}
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
          onAlways={permissionReq.channel ? () => handlePermission("always") : undefined}
        />
      )}

      <div className="border-t border-glass-border p-3 sm:p-4 max-w-3xl mx-auto w-full">
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
          disabled={backendRunning && !sessionId}
          onInput={setInput}
          onSend={sendMessage}
          onStop={handleStop}
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
