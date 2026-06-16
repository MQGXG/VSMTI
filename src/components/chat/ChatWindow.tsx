import { useState, useRef, useEffect, useCallback } from "react";
import { getProviderById, getSettings } from "@/components/sidebar/SettingsDialog";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { ToolCallView } from "./ToolCallView";
import { ModelSelector, loadModelChoice, loadModeChoice } from "./ModelSelector";
import type { ModelOption } from "./ModelSelector";
import { ChatInput } from "./ChatInput";
import type { Message, AgentMode } from "./types";
import { routeToolMessage } from "./tool-router";
import { FileUp, X, Sparkles, Copy, Check, Pencil, RefreshCw, Terminal, Globe, Code, Search, MessageSquare, AlertCircle, ChevronRight, Square } from "lucide-react";
import { PermissionDialog } from "./PermissionDialog";
import { QuestionDialog } from "./QuestionDialog";
import type { ToolResult } from "@/types/electron";

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

      <div className="flex-1 overflow-y-auto px-6 py-6 w-full" style={{ maxWidth: '960px', margin: '0 auto' }}>
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center max-w-md">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-accent-500/20 to-accent-400/10 flex items-center justify-center mx-auto mb-6">
                <Sparkles className="w-8 h-8 text-accent-400" />
              </div>
              <h1 className="text-2xl font-semibold tracking-tight mb-2" style={{ color: 'var(--text-primary)' }}>Mira</h1>
              <p className="text-sm mb-8" style={{ color: 'var(--text-secondary)' }}>{!sessionId ? '工具模式 · 选择会话开始' : '全能 AI 助手，有什么可以帮你？'}</p>

              {sessionId && (
                <div className="grid grid-cols-2 gap-2 mb-6">
                  {[
                    { icon: MessageSquare, label: '直接提问', desc: '日常问答、写作、分析' },
                    { icon: FileUp, label: '拖拽文件', desc: '拖入文件自动分析' },
                    { icon: Globe, label: '网络搜索', desc: '获取实时信息' },
                    { icon: Terminal, label: '执行命令', desc: '运行终端命令' },
                  ].map(({ icon: Icon, label, desc }) => (
                    <div key={label} className="flex items-start gap-3 p-3 rounded-xl"
                      style={{ background: 'var(--surface-secondary)', border: '1px solid var(--border-light)' }}>
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                        style={{ background: 'var(--surface-tertiary)' }}>
                        <Icon className="w-4 h-4" style={{ color: 'var(--accent-start)' }} />
                      </div>
                      <div className="text-left">
                        <p className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{label}</p>
                        <p className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>{desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-center justify-center gap-3 text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                <span className="flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 rounded font-mono" style={{ background: 'var(--surface-tertiary)', border: '1px solid var(--border)' }}>Enter</kbd> 发送
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 rounded font-mono" style={{ background: 'var(--surface-tertiary)', border: '1px solid var(--border)' }}>Shift+Enter</kbd> 换行
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 rounded font-mono" style={{ background: 'var(--surface-tertiary)', border: '1px solid var(--border)' }}>/</kbd> 命令
                </span>
              </div>
            </div>
          </div>
        )}

          {messages.map((msg, idx) => {
          const isEditingThis = editingMsgId === msg.id;
          const isUser = msg.role === "user";
          return (
          <div key={msg.id} className="mb-5 animate-fade-in-up">
            <div className={`flex w-full gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
              {/* 头像 */}
              <div className="shrink-0">
                {isUser ? (
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
                    style={{ background: 'var(--surface-tertiary)', color: 'var(--text-secondary)' }}>
                    U
                  </div>
                ) : (
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-cyan-500 flex items-center justify-center shadow-sm">
                    <Sparkles className="w-3.5 h-3.5 text-white" />
                  </div>
                )}
              </div>
              {/* 消息主体 */}
              <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} max-w-[calc(100%-50px)]`}>
                {isEditingThis ? (
                  <div className="space-y-2">
                    <textarea
                      ref={editInputRef}
                      value={editingContent}
                      onChange={(e) => setEditingContent(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); saveAndResend(); } if (e.key === "Escape") cancelEditing(); }}
                      className="w-full bg-transparent text-sm outline-none resize-none leading-relaxed"
                      style={{ color: 'var(--text-primary)' }}
                      rows={Math.max(2, editingContent.split("\n").length)}
                    />
                    <div className="flex items-center gap-2 justify-end">
                      <button onClick={cancelEditing} className="px-2.5 py-1 rounded-md text-[10px] btn-ghost">取消</button>
                      <button onClick={saveAndResend} className="px-2.5 py-1 rounded-md text-[10px] btn-primary">保存并发送</button>
                    </div>
                  </div>
                ) : (
                  msg.isToolCall ? (
                    <div className="flex items-center gap-2 py-0.5">
                      <span className="text-[11px] font-mono" style={{ color: 'var(--text-tertiary)' }}>{msg.content}</span>
                    </div>
                  ) : msg.content ? (
                    msg.role === "assistant" ? (
                      <MarkdownRenderer content={msg.content} />
                    ) : (
                      <span className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--text-primary)' }}>{msg.content}</span>
                    )
                  ) : (
                    <span className="italic" style={{ color: 'var(--text-tertiary)' }}>思考中...</span>
                  )
                )}
              </div>
              {msg.toolCalls?.map((tc, i) => <ToolCallView key={i} info={tc} />)}
              {!isEditingThis && msg.content && (
              <div className={`flex gap-1 mt-1 ${isUser ? 'justify-end' : 'justify-start'}`}>
                <button onClick={() => handleCopyMessage(msg.id, msg.content)}
                  className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] btn-ghost"
                  title="复制">
                  {copiedMsgId === msg.id
                    ? <><Check className="w-3 h-3 text-emerald-500" /><span className="text-emerald-500">已复制</span></>
                    : <><Copy className="w-3 h-3" /><span>复制</span></>
                  }
                </button>
                {isUser && (
                  <>
                    <button onClick={() => startEditing(msg.id, msg.content)}
                      className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] btn-ghost" title="编辑">
                      <Pencil className="w-3 h-3" /><span>编辑</span>
                    </button>
                    <button onClick={() => handleRetry(msg.id, msg.content)}
                      className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] btn-ghost" title="重发">
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

      <div className="p-3 sm:p-4 w-full" style={{ maxWidth: '960px', margin: '0 auto', borderTop: '1px solid var(--border-light)' }}>
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
          disabled={!sessionId}
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
