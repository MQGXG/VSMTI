import { useState, useRef, useEffect, useCallback } from "react";
import { getProviderById, getSettings } from "@/components/sidebar/SettingsDialog";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { ToolCallView } from "./ToolCallView";
import { ModelSelector, loadModelChoice, loadModeChoice } from "./ModelSelector";
import type { ModelOption } from "./ModelSelector";
import { ChatInput } from "./ChatInput";
import type { Message, AgentMode } from "./types";
import { routeToolMessage } from "./tool-router";
import { FileUp, X, Sparkles, Copy, Check, Pencil, RefreshCw, Terminal, Globe, Code, Search, MessageSquare, AlertCircle, ChevronRight, Square, FileText, Image, Clock, FolderOpen, BarChart3, Calendar } from "lucide-react";
import { PermissionDialog } from "./PermissionDialog";
import { QuestionDialog } from "./QuestionDialog";
import type { ToolResult } from "@/types/electron";

interface Props {
  sessionId: string;
  onSessionChange?: (id: string) => void;
}

const features = [
  { icon: FolderOpen, label: '文件管理', color: '#00D9C0' },
  { icon: Code, label: '代码开发', color: '#00A8E8' },
  { icon: Globe, label: '网页搜索', color: '#A371F7' },
  { icon: BarChart3, label: '数据分析', color: '#FFB800' },
  { icon: Image, label: '图像生成', color: '#FF7A45' },
  { icon: Clock, label: '定时任务', color: '#FF4757' },
  { icon: Calendar, label: '项目管理', color: '#3FB950' },
];

const quickActions = [
  { icon: Code, label: '分析代码', prompt: '请帮我分析这段代码' },
  { icon: Image, label: '生成图片', prompt: '帮我生成一张图片' },
  { icon: Search, label: '网页搜索', prompt: '帮我搜索' },
  { icon: FileText, label: '读取文件', prompt: '请读取这个文件' },
];

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
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState("");
  const loadingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const editInputRef = useRef<HTMLTextAreaElement>(null);
  const dragCounter = useRef(0);
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
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!sessionId) {
      setMessages([]);
      return;
    }
    const loadHistory = async () => {
      try {
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
      const localFiles: Array<{ name: string; path: string }> = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const filePath = (file as any).path || file.name;
        localFiles.push({ name: file.name, path: filePath });
      }

      setUploadedFiles((prev) => [...prev, ...localFiles]);

      const fileDetails = localFiles.map((f) => `"${f.name}" (路径: ${f.path})`).join("、");
      const message = `我刚刚添加了文件：${fileDetails}。请使用 read_file 读取这些文件并分析内容。`;

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

      // TS Agent Core（实时流式，支持权限确认）
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
              content: `⚡ ${event.name}`,
              isToolCall: true,
            }]);
          } else if (event.type === "tool_result") {
            const snippet = (event.result.output || event.result.error || "").slice(0, 300)
            const label = event.result.success ? "✓ 完成" : "✗ 失败"
            setMessages((prev) => [...prev, {
              id: crypto.randomUUID(),
              role: "assistant",
              content: `${label} | ${event.name}\n\`\`\`\n${snippet}\n\`\`\``,
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
            const cleanMsg = event.message.replace(/\[TOOL_ERROR\]\s*/g, "").replace(/\s*\{.*\}/s, "").trim()
            setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "assistant", content: `⚠️ ${cleanMsg || event.message}` }]);
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
  }, [input, isLoading, sessionId, selectedModel, agentMode]);

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

  const handleQuestionAnswer = useCallback(async (_answer: string) => {
    setQuestionReq(null);
  }, []);

  const handlePermission = useCallback(async (approved: boolean | "always") => {
    const req = permissionReq;
    if (!req) return;
    setPermissionReq(null);
    if (req.channel) {
      await window.electronAPI.agent.replyPermission(
        req.channel,
        req.request_id,
        approved === "always" ? "always" : approved ? "allow" : "deny",
      );
    }
  }, [permissionReq]);

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
    const header = `**${toolName}**`
    const content = result.success
      ? `${header}\n\n${result.output}`
      : `${header}\n\n${result.error || "执行失败"}`
    const msg: Message = {
      id: crypto.randomUUID(),
      role: "assistant",
      content,
    }
    setMessages((prev) => [...prev, msg])
  }, [])

  return (
    <div className="flex flex-col h-full relative" style={{ background: '#0A0F14' }}>
      {/* 拖拽上传覆盖层 */}
      {isDragging && (
        <div className="absolute inset-0 z-50 glass-heavy border-2 border-dashed border-primary-500/50 rounded-2xl flex items-center justify-center animate-fade-in-up">
          <div className="text-center space-y-3">
            <div className="w-16 h-16 rounded-2xl bg-primary-500/10 flex items-center justify-center mx-auto">
              <FileUp className="w-8 h-8 text-primary-400" />
            </div>
            <p className="text-primary-300 text-lg font-semibold">释放以上传文件</p>
            <p className="text-primary-400/60 text-sm">支持任意文本文件</p>
          </div>
        </div>
      )}

      {/* 消息区域 */}
      <div className="flex-1 overflow-y-auto px-6 py-6 w-full custom-scrollbar" style={{ maxWidth: '960px', margin: '0 auto' }}>
        {/* 空会话状态 - 品牌区 */}
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center max-w-2xl">
              {/* 品牌名 */}
              <div className="mb-6">
                <h1 className="text-brand font-bold brand-glow tracking-tight mb-3">Mira</h1>
                <p className="text-body text-neutral-500">{!sessionId ? '工具模式 · 选择会话开始' : '你的 AI 桌面助手'}</p>
              </div>

              {/* 功能标签滚动区 */}
              {sessionId && (
                <>
                  <div className="flex items-center justify-center gap-3 mb-8 overflow-x-auto pb-2 px-4">
                    {features.map(({ icon: Icon, label, color }) => (
                      <div key={label} className="chip flex items-center gap-2 px-4 py-2 rounded-button whitespace-nowrap cursor-default">
                        <Icon className="w-4 h-4" style={{ color }} />
                        <span className="text-xs font-medium">{label}</span>
                      </div>
                    ))}
                  </div>

                  {/* 问候语气泡 */}
                  <div className="flex items-start gap-4 mb-8 max-w-lg mx-auto">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center shrink-0 shadow-lg shadow-primary-500/20">
                      <Sparkles className="w-5 h-5 text-white" />
                    </div>
                    <div className="message-assistant px-5 py-4 text-left">
                      <p className="text-body text-neutral-200">你好！我是 Mira，你的 AI 桌面助手。我可以帮你处理文件、编写代码、搜索信息、分析数据等。有什么我可以帮你的吗？</p>
                    </div>
                  </div>
                </>
              )}

              {/* 快捷操作区 */}
              {sessionId && (
                <div className="grid grid-cols-2 gap-3 mb-8 max-w-lg mx-auto">
                  {quickActions.map(({ icon: Icon, label, prompt }) => (
                    <button
                      key={label}
                      onClick={() => { setInput(prompt); }}
                      className="flex items-center gap-3 p-4 rounded-card transition-all duration-200 hover:scale-[1.02] hover:shadow-card-hover text-left group"
                      style={{ background: '#0F1A20', border: '1px solid #1A2E35' }}
                    >
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors"
                        style={{ background: 'rgba(0, 217, 192, 0.1)' }}>
                        <Icon className="w-5 h-5 text-primary-400 group-hover:text-primary-300 transition-colors" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-neutral-200 group-hover:text-neutral-100 transition-colors">{label}</p>
                        <p className="text-[11px] text-neutral-500 mt-0.5">点击快速开始</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {/* 快捷键提示 */}
              <div className="flex items-center justify-center gap-4 text-caption text-neutral-600">
                <span className="flex items-center gap-1.5">
                  <kbd className="px-2 py-0.5 rounded-md font-mono text-[10px]" style={{ background: '#1A2E35', color: '#5C8D8A', border: '1px solid #2A4A50' }}>Enter</kbd> 发送
                </span>
                <span className="flex items-center gap-1.5">
                  <kbd className="px-2 py-0.5 rounded-md font-mono text-[10px]" style={{ background: '#1A2E35', color: '#5C8D8A', border: '1px solid #2A4A50' }}>Shift+Enter</kbd> 换行
                </span>
                <span className="flex items-center gap-1.5">
                  <kbd className="px-2 py-0.5 rounded-md font-mono text-[10px]" style={{ background: '#1A2E35', color: '#5C8D8A', border: '1px solid #2A4A50' }}>/</kbd> 命令
                </span>
              </div>
            </div>
          </div>
        )}

        {/* 消息列表 */}
        {messages.map((msg, idx) => {
          const isEditingThis = editingMsgId === msg.id;
          const isUser = msg.role === "user";
          return (
            <div key={msg.id} className="mb-5 animate-fade-in-up">
              <div className={`flex w-full gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
                {/* 头像 */}
                <div className="shrink-0">
                  {isUser ? (
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
                      style={{ background: 'linear-gradient(135deg, #00B4A0, #0088A8)', color: '#ffffff' }}>
                      U
                    </div>
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center shadow-lg shadow-primary-500/20">
                      <Sparkles className="w-4 h-4 text-white" />
                    </div>
                  )}
                </div>
                {/* 消息主体 */}
                <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} max-w-[calc(100%-60px)]`}>
                  {isEditingThis ? (
                    <div className="space-y-2">
                      <textarea
                        ref={editInputRef}
                        value={editingContent}
                        onChange={(e) => setEditingContent(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); saveAndResend(); } if (e.key === "Escape") cancelEditing(); }}
                        className="w-full bg-transparent text-sm outline-none resize-none leading-relaxed input-field px-4 py-3"
                        rows={Math.max(2, editingContent.split("\n").length)}
                      />
                      <div className="flex items-center gap-2 justify-end">
                        <button onClick={cancelEditing} className="px-3 py-1.5 rounded-lg text-xs btn-ghost">取消</button>
                        <button onClick={saveAndResend} className="px-3 py-1.5 rounded-lg text-xs btn-primary">保存并发送</button>
                      </div>
                    </div>
                  ) : (
                    msg.isToolCall ? (
                      <div className="flex items-center gap-2 py-1 px-3 rounded-lg" style={{ background: 'rgba(0, 217, 192, 0.05)' }}>
                        <span className="text-caption font-mono text-primary-400">{msg.content}</span>
                      </div>
                    ) : msg.content ? (
                      msg.role === "assistant" ? (
                        <div className="message-assistant px-5 py-4">
                          <MarkdownRenderer content={msg.content} />
                        </div>
                      ) : (
                        <div className="message-user px-5 py-4">
                          <span className="text-body text-white whitespace-pre-wrap">{msg.content}</span>
                        </div>
                      )
                    ) : (
                      <span className="italic text-caption text-neutral-600">思考中...</span>
                    )
                  )}
                </div>
                {msg.toolCalls?.map((tc, i) => <ToolCallView key={i} info={tc} />)}
                {!isEditingThis && msg.content && (
                  <div className={`flex gap-1 mt-1 ${isUser ? 'justify-end' : 'justify-start'}`}>
                    <button onClick={() => handleCopyMessage(msg.id, msg.content)}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] btn-ghost transition-all duration-200"
                      title="复制">
                      {copiedMsgId === msg.id
                        ? <><Check className="w-3 h-3 text-success" /><span className="text-success">已复制</span></>
                        : <><Copy className="w-3 h-3" /><span>复制</span></>
                      }
                    </button>
                    {isUser && (
                      <>
                        <button onClick={() => startEditing(msg.id, msg.content)}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] btn-ghost transition-all duration-200" title="编辑">
                          <Pencil className="w-3 h-3" /><span>编辑</span>
                        </button>
                        <button onClick={() => handleRetry(msg.id, msg.content)}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] btn-ghost transition-all duration-200" title="重发">
                          <RefreshCw className="w-3 h-3" /><span>重发</span>
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* 加载状态 */}
        {isLoading && (() => {
          const settings = getSettings();
          return (
            <div className="flex items-center gap-3 px-1 animate-fade-in-up">
              <button onClick={async () => {
                setIsLoading(false);
                const ch = currentChannelRef.current;
                if (ch) window.electronAPI.agent.stopStream(ch);
              }} className="px-4 py-2 rounded-xl text-xs font-medium bg-error/10 text-error hover:bg-error/20 transition-colors">
                停止
              </button>
              {settings.showProgressBar ? (
                <div className="flex-1">
                  <div className="w-full h-1.5 bg-neutral-800 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-primary-500 to-accent-500 rounded-full animate-[progress_2s_ease-in-out_infinite]" style={{width:'40%'}} />
                  </div>
                  <p className="text-xs text-neutral-500 mt-2">Agent 正在工作...</p>
                </div>
              ) : (
                <div className="flex items-center gap-3 px-4 py-3 rounded-xl" style={{ background: '#0F1A20' }}>
                  <div className="flex items-center gap-1.5">
                    <span className="loading-dot" style={{ animationDelay: "0s" }} />
                    <span className="loading-dot" style={{ animationDelay: "0.2s" }} />
                    <span className="loading-dot" style={{ animationDelay: "0.4s" }} />
                  </div>
                  <span className="text-sm text-neutral-400">思考中...</span>
                </div>
              )}
            </div>
          );
        })()}
        <div ref={bottomRef} />
      </div>

      {/* 问答弹窗 */}
      {questionReq && (
        <QuestionDialog
          question={questionReq.question}
          options={questionReq.options}
          onSubmit={handleQuestionAnswer}
        />
      )}

      {/* 权限确认弹窗 */}
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

      {/* 输入区域 */}
      <div className="p-4 w-full" style={{ maxWidth: '960px', margin: '0 auto', borderTop: '1px solid #15252A' }}>
        {/* 文件附件显示 */}
        {uploadedFiles.length > 0 && (
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            {uploadedFiles.map((file, index) => (
              <div
                key={index}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-button text-xs text-primary-400 transition-all duration-200"
                style={{ background: 'rgba(0, 217, 192, 0.1)', border: '1px solid rgba(0, 217, 192, 0.2)' }}
              >
                <FileUp className="w-3 h-3" />
                <span className="max-w-[150px] truncate">{file.name}</span>
                <button
                  onClick={() => removeUploadedFile(index)}
                  className="p-0.5 rounded-lg hover:bg-error/10 hover:text-error transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* 输入框 */}
        <ChatInput
          input={input}
          isLoading={isLoading}
          disabled={!sessionId}
          onInput={setInput}
          onSend={sendMessage}
          onStop={handleStop}
          onToolResult={handleToolResult}
        />

        {/* 模型选择器 */}
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
