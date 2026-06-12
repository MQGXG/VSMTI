import { useState, useRef, useEffect, useCallback } from "react";
import { getProviderById } from "@/components/sidebar/SettingsDialog";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { ToolCallView } from "./ToolCallView";
import { ModelSelector, loadModelChoice, loadModeChoice } from "./ModelSelector";
import type { ModelOption } from "./ModelSelector";
import { ChatInput } from "./ChatInput";
import { useChatStream } from "./useChatStream";
import type { Message, AgentMode } from "./types";
import { FileUp, X, GitBranch } from "lucide-react";
import { PermissionDialog } from "./PermissionDialog";

interface Props {
  sessionId: string;
  onSessionChange?: (id: string) => void;
}

export function ChatWindow({ sessionId }: Props) {
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
  const loadingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const dragCounter = useRef(0);
  const { streamChat } = useChatStream();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // 加载会话历史消息
  useEffect(() => {
    const loadHistory = async () => {
      try {
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

  // 拖拽事件处理
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

      // 自动发送消息让 Agent 分析文件（带上路径）
      const fileDetails = uploaded.map((f) => `"${f.name}" (路径: ${f.path})`).join("、");
      const message = `我刚刚上传了文件：${fileDetails}。请用 read_file 读取这些文件并分析内容。`;
      
      // 使用 setTimeout 确保状态更新后再发送
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
      setMessages((prev) => prev.map((m) => m.id === assistantId
        ? { ...m, content: m.content || "\n\n⚠️ 请求超时，请重试。", toolCalls: m.toolCalls || [] }
        : m
      ));
    }, 120000);

    try {
      const status = await window.electronAPI.getPythonStatus();
      if (status.status !== "running") {
        throw new Error(`后端状态异常: ${status.status} — ${status.error || ""}`);
      }
      const provider = await getProviderById(selectedModel.provider);

      await streamChat(status.url, {
        message: content,
        session_id: sessionId,
        model: selectedModel.provider,
        model_name: selectedModel.value,
        api_key: provider?.apiKey || undefined,
        api_url: provider?.apiUrl || "",
        mode: agentMode,
      }, {
        assistantId,
        onContent: (text) => {
          setMessages((prev) => prev.map((m) => m.id === assistantId ? { ...m, content: m.content + text } : m));
        },
        onToolStart: (_id, name, args) => {
          setMessages((prev) => prev.map((m) => m.id === assistantId ? {
            ...m, toolCalls: [...(m.toolCalls || []), { name, args, argsText: "", status: "running" as const }],
          } : m));
        },
        onToolDelta: (id, delta) => {
          setMessages((prev) => prev.map((m) => m.id === assistantId ? {
            ...m, toolCalls: m.toolCalls?.map((tc) => (tc.name === id || tc.name === id) ? { ...tc, argsText: (tc.argsText || "") + delta } : tc),
          } : m));
        },
        onToolResult: (name, output, success) => {
          setMessages((prev) => prev.map((m) => m.id === assistantId ? {
            ...m, toolCalls: m.toolCalls?.map((tc) => tc.name === name ? { ...tc, result: output, status: success ? "done" : "error" } : tc),
          } : m));
        },
        onToolError: (name, error) => {
          setMessages((prev) => prev.map((m) => m.id === assistantId ? {
            ...m, toolCalls: m.toolCalls?.map((tc) => tc.name === name ? { ...tc, result: error, status: "error" } : tc),
          } : m));
        },
        onPermissionRequest: (req) => {
          setPermissionReq(req);
        },
        onError: (message) => console.error("SSE error:", message),
        onFinish: () => {
          if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
          setIsLoading(false);
        },
      });
    } catch (err: any) {
      console.error("Chat error:", err);
      setMessages((prev) => prev.map((m) => m.id === assistantId
        ? { ...m, content: `\n\n⚠️ 发送失败：${err?.message || String(err)}`, toolCalls: [] }
        : m
      ));
    } finally {
      if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
      setIsLoading(false);
    }
  }, [input, isLoading, sessionId, selectedModel, agentMode, streamChat]);

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

  return (
    <div className="flex flex-col h-full relative">
      {/* 拖拽遮罩 */}
      {isDragging && (
        <div className="absolute inset-0 z-50 bg-emerald-500/10 border-2 border-dashed border-emerald-500/50 rounded-lg flex items-center justify-center backdrop-blur-sm">
          <div className="text-center space-y-2">
            <FileUp className="w-12 h-12 text-emerald-500 dark:text-emerald-400 mx-auto" />
            <p className="text-emerald-700 dark:text-emerald-300 text-lg font-medium">释放以上传文件</p>
            <p className="text-emerald-600/60 dark:text-emerald-400/60 text-sm">支持任意文本文件</p>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 py-6 max-w-3xl mx-auto w-full">
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center space-y-3">
              <h1 className="text-3xl font-light tracking-tight text-gray-900 dark:text-neutral-100">OmniAgent</h1>
              <p className="text-gray-500 dark:text-neutral-500 text-sm">全能 AI 助手，有什么可以帮你？</p>
              <p className="text-xs text-gray-400 dark:text-neutral-600">拖拽文件到窗口让 Agent 分析</p>
            </div>
          </div>
        )}

        {messages.map((msg, idx) => (
          <div key={msg.id} className="group mb-6 relative">
            <div className={`flex w-full ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
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
                  <span className="text-gray-400 dark:text-neutral-500 italic">思考中...</span>
                )}
              </div>
            </div>
            {msg.toolCalls?.map((tc, i) => <ToolCallView key={i} info={tc} />)}

            {/* 分叉按钮：从该消息处分叉出新会话 */}
            {msg.role === "assistant" && msg.content && (
              <div className="absolute -left-8 top-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => handleFork(msg.dbId)}
                  className="p-1 rounded hover:bg-gray-200 dark:hover:bg-neutral-700 text-gray-400 hover:text-emerald-500 transition-all"
                  title="从此处分叉新会话"
                >
                  <GitBranch className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        ))}

        {isLoading && messages[messages.length - 1]?.content === "" && (
          <div className="flex items-center gap-2 text-gray-500 dark:text-neutral-500">
            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
            <span className="text-sm">思考中...</span>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* 权限审批弹窗 */}
      {permissionReq && (
        <PermissionDialog
          toolName={permissionReq.tool_name}
          args={permissionReq.args}
          reason={permissionReq.reason}
          onAllow={() => handlePermission(true)}
          onDeny={() => handlePermission(false)}
        />
      )}

      <div className="border-t border-gray-200 dark:border-neutral-800 p-4 max-w-3xl mx-auto w-full">
        {/* 已上传文件 */}
        {uploadedFiles.length > 0 && (
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            {uploadedFiles.map((file, index) => (
              <div
                key={index}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-50 dark:bg-emerald-600/10 border border-emerald-200 dark:border-emerald-500/20 text-xs text-emerald-700 dark:text-emerald-400"
              >
                <FileUp className="w-3 h-3" />
                <span className="max-w-[150px] truncate">{file.name}</span>
                <button
                  onClick={() => removeUploadedFile(index)}
                  className="p-0.5 rounded hover:bg-emerald-100 dark:hover:bg-emerald-500/20 transition-colors"
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
          onInput={setInput}
          onSend={sendMessage}
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
