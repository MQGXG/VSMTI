import { useState, useCallback, useRef, useEffect } from "react";
import { getProviderById, loadSettings as getSettings } from "../sidebar/provider-data";
import {
  createMiraMessage,
  appendText,
  appendThinking,
  addToolCall,
  updateToolCall,
  addCompaction,
  addDiffSummary,
} from "../chat/mira-runtime";
import type { MiraMessage } from "../chat/mira-runtime";
import type { AgentEvent, ToolResult } from "../services/agent.service";
import type { ModelOption } from "../chat/ModelSelector";
import type { AgentMode } from "../chat/types";

interface UseMiraChatOptions {
  sessionId: string;
  selectedModel: ModelOption;
  agentMode: AgentMode;
  goalCondition?: string | null;
  onSessionChange?: (sessionId: string) => void;
}

interface UseMiraChatReturn {
  messages: MiraMessage[];
  isRunning: boolean;
  liveTiming: {
    streamStartTime: number;
    firstTokenTime?: number;
    tokenCount: number;
    chunkCount: number;
    toolCallCount: number;
  } | null;
  permissionReq: {
    tool_name: string;
    args: Record<string, unknown>;
    reason: string;
    request_id: string;
    channel?: string;
  } | null;
  questionReq: {
    question: string;
    options: string[];
    request_id: string;
  } | null;
  sendMessage: (content: string) => Promise<void>;
  retryMessage: (assistantMsgId: string) => Promise<void>;
  stopStream: () => void;
  handlePermission: (approved: boolean | "always") => Promise<void>;
  handleQuestionAnswer: (answer: string) => void;
  handleToolResult: (toolName: string, result: ToolResult) => void;
  loadHistory: () => Promise<void>;
  setMessages: React.Dispatch<React.SetStateAction<MiraMessage[]>>;
}

interface StreamEventContext {
  setMessages: React.Dispatch<React.SetStateAction<MiraMessage[]>>;
  setIsRunning: React.Dispatch<React.SetStateAction<boolean>>;
  clearCurrentChannel: () => void;
  setPermissionReq: React.Dispatch<React.SetStateAction<{
    tool_name: string;
    args: Record<string, unknown>;
    reason: string;
    request_id: string;
    channel?: string;
  } | null>>;
  setQuestionReq: React.Dispatch<React.SetStateAction<{
    question: string;
    options: string[];
    request_id: string;
  } | null>>;
  setLiveTiming: React.Dispatch<React.SetStateAction<{
    streamStartTime: number;
    firstTokenTime?: number;
    tokenCount: number;
    chunkCount: number;
    toolCallCount: number;
  } | null>>;
  timingRef: React.MutableRefObject<{
    streamStartTime: number;
    firstTokenTime?: number;
    tokenCount: number;
    chunkCount: number;
    toolCallCount: number;
  } | null>;
}

/** 基于 requestAnimationFrame 的文本缓冲刷新 */
function createContentBuffer(
  assistantId: string,
  ctx: StreamEventContext
): { append: (text: string) => void; flush: () => void } {
  let buffer = "";
  let rafId: number | null = null;

  function flush() {
    rafId = null;
    if (!buffer) return;
    const text = buffer;
    buffer = "";
    const { setMessages } = ctx;
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last?.role === "assistant" && last.id === assistantId) {
        return [...prev.slice(0, -1), appendText(last, text)];
      }
      return [...prev, createMiraMessage("assistant", text, assistantId)];
    });
  }

  return {
    append(text: string) {
      buffer += text;
      if (!rafId) rafId = requestAnimationFrame(flush);
    },
    flush() {
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      flush();
    },
  };
}

const contentBuffers = new Map<string, ReturnType<typeof createContentBuffer>>();

function handleStreamEvent(
  event: AgentEvent,
  channel: string,
  assistantId: string,
  ctx: StreamEventContext
): void {
  const { setMessages, setIsRunning, clearCurrentChannel, setPermissionReq, setQuestionReq, setLiveTiming, timingRef } = ctx;

  if (event.type === "content") {
    const t = timingRef.current;
    if (t) {
      if (!t.firstTokenTime) t.firstTokenTime = Date.now();
      t.tokenCount += event.text.split(/\s+/).filter(Boolean).length;
      t.chunkCount++;
      setLiveTiming({ ...t });
    }
    let buf = contentBuffers.get(channel);
    if (!buf) {
      buf = createContentBuffer(assistantId, ctx);
      contentBuffers.set(channel, buf);
    }
    buf.append(event.text);
  } else if (event.type === "tool_start") {
    contentBuffers.get(channel)?.flush();
    const t = timingRef.current;
    if (t) {
      t.toolCallCount++;
      setLiveTiming({ ...t });
    }
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last?.role === "assistant" && last.id === assistantId) {
        return [...prev.slice(0, -1), addToolCall(last, event.id, event.name, event.args)];
      }
      const newMsg = createMiraMessage("assistant", [], assistantId);
      return [...prev, addToolCall(newMsg, event.id, event.name, event.args)];
    });
  } else if (event.type === "thinking") {
    contentBuffers.get(channel)?.flush();
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last?.role === "assistant" && last.id === assistantId) {
        return [...prev.slice(0, -1), appendThinking(last, event.text)];
      }
      return prev;
    });
  } else if (event.type === "tool_result") {
    contentBuffers.get(channel)?.flush();
    const status = event.result.success ? "done" as const : "error" as const;
    const resultText = event.result.output || event.result.error || "";
    const snapshotId = (event.result as any).metadata?.snapshotId as string | undefined;
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last?.role === "assistant" && last.id === assistantId) {
        return [...prev.slice(0, -1), updateToolCall(last, event.id, status, resultText, snapshotId)];
      }
      return prev;
    });
  } else if (event.type === "permission_request") {
    const s = getSettings();
    if (s.autoAcceptPermissions) {
      AgentService.replyPermission(channel, event.id, "allow");
    } else {
      setPermissionReq({
        tool_name: event.action,
        args: event.toolCall?.input || {},
        reason: `需要权限执行操作: ${event.action}`,
        request_id: event.id,
        channel,
      });
    }
  } else if (event.type === "question") {
    setQuestionReq({
      question: event.question,
      options: event.options || [],
      request_id: event.id,
    });
  } else if (event.type === "error") {
    const raw = event.message || "";
    const cleanMsg = raw
      .replace(/\[TOOL_ERROR\]\s*/g, "")
      .replace(/\s*\{.*\}/s, "")
      .trim();
    const lower = raw.toLowerCase();
    let hint = "";
    if (lower.includes("401")) hint = "API Key 无效，请在设置中检查";
    else if (lower.includes("400") && (lower.includes("api key") || lower.includes("apikey") || lower.includes("token"))) hint = "API Key 格式错误，请在设置中重新配置";
    else if (lower.includes("400") || lower.includes("bad request")) hint = "请求参数错误，检查模型名/Provider 配置是否正确";
    else if (lower.includes("429")) hint = "请求过于频繁，请稍后重试";
    else if (lower.includes("500") || lower.includes("502") || lower.includes("503")) hint = "服务端暂时不可用，请稍后重试";
    setMessages((prev) => [
      ...prev,
      createMiraMessage("assistant", `⚠️ ${cleanMsg || raw}${hint ? `\n\n💡 ${hint}` : ""}`),
    ]);
    contentBuffers.get(channel)?.flush();
    contentBuffers.delete(channel);
    setLiveTiming(null);
    setIsRunning(false);
    clearCurrentChannel();
  } else if (event.type === "retry") {
    contentBuffers.get(channel)?.flush();
    const attempt = event.attempt as number;
    const errMsg = event.error as string;
    ctx.setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last?.role === "assistant" && last.id === assistantId) {
        const retryMark = `🔄 重试 #${attempt}: ${errMsg.length > 60 ? errMsg.slice(0, 60) + "..." : errMsg}`;
        return [
          ...prev.slice(0, -1),
          { ...last, parts: [...last.parts, { type: "text" as const, text: retryMark }], retryCount: attempt },
        ];
      }
      return prev;
    });
  } else if (event.type === "finish") {
    // 第一条消息完成后自动生成会话标题
    if (channel && !channel.startsWith("offline-")) {
      ctx.setMessages((prev) => {
        const isFirstTurn = prev.length <= 2;
        if (isFirstTurn) {
          const userText = prev.find((m: any) => m.role === "user")?.parts?.[0]?.text || "";
          if (userText) {
            const title = userText.replace(/[\n\r]/g, " ").trim().slice(0, 50);
            import("../services/session.service").then(({ SessionService }) => {
              SessionService.update(channel, { title }).catch(() => {});
            }).catch(() => {});
          }
        }
        return prev;
      });
    }

    const t = timingRef.current;
    const usage = event.usage as { promptTokens?: number; completionTokens?: number; totalTokens?: number } | undefined;
    if (t) {
      const now = Date.now();
      const totalTime = now - t.streamStartTime;
      // 真实 token 数（来自 LLM API），如果存在则覆盖估算值
      const realTokenCount = usage?.totalTokens || t.tokenCount;
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant" && last.id === assistantId) {
          return [
            ...prev.slice(0, -1),
            {
              ...last,
              timing: {
                streamStartTime: t.streamStartTime,
                firstTokenTime: t.firstTokenTime,
                totalStreamTime: totalTime,
                tokenCount: realTokenCount,
                promptTokens: usage?.promptTokens,
                completionTokens: usage?.completionTokens,
                tokensPerSecond: totalTime > 0
                  ? Math.round((realTokenCount / totalTime) * 1000 * 10) / 10
                  : undefined,
                totalChunks: t.chunkCount,
                toolCallCount: t.toolCallCount,
              },
            },
          ];
        }
        return prev;
      });
      timingRef.current = null;
      setLiveTiming(null);
    }
    contentBuffers.get(channel)?.flush();
    contentBuffers.delete(channel);
    setIsRunning(false);
    clearCurrentChannel();
    AgentService.stopStream(channel);
  } else if (event.type === "context_rebuild") {
    contentBuffers.get(channel)?.flush();
    ctx.setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last?.role === "assistant") {
        return [...prev.slice(0, -1), addCompaction(last, event.reason as string, event.tokensBefore as number, event.tokensAfter as number)];
      }
      return prev;
    });
  }
}

// 延迟导入避免循环依赖
let AgentService: any;

export function useMiraChat({
  sessionId,
  selectedModel,
  agentMode,
  goalCondition,
  onSessionChange,
}: UseMiraChatOptions): UseMiraChatReturn {
  const [messages, setMessages] = useState<MiraMessage[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [liveTiming, setLiveTiming] = useState<{
    streamStartTime: number;
    firstTokenTime?: number;
    tokenCount: number;
    chunkCount: number;
    toolCallCount: number;
  } | null>(null);
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

  const currentChannelRef = useRef<string | null>(null);
  const loadingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const offlineSessionIdRef = useRef<string | null>(null);
  const timingRef = useRef<{
    streamStartTime: number;
    firstTokenTime?: number;
    tokenCount: number;
    chunkCount: number;
    toolCallCount: number;
  } | null>(null);
  const agentServiceRef = useRef<any>(null);

  useEffect(() => {
    import("../services/agent.service").then((mod) => {
      AgentService = mod.AgentService;
      agentServiceRef.current = mod.AgentService;
    });
  }, []);

  function getOfflineSessionId(): string {
    if (offlineSessionIdRef.current) return offlineSessionIdRef.current;
    const stored = localStorage.getItem("offlineSessionId");
    if (stored) {
      offlineSessionIdRef.current = stored;
      return stored;
    }
    const id = `offline-${crypto.randomUUID()}`;
    localStorage.setItem("offlineSessionId", id);
    offlineSessionIdRef.current = id;
    return id;
  }

  const loadHistory = useCallback(async () => {
    if (!sessionId) {
      setMessages([]);
      return;
    }
    try {
      const { SessionService } = await import("../services/session.service");
      const tsMsgs = await SessionService.getMessages(sessionId);
      if (tsMsgs && tsMsgs.length > 0) {
        const formattedMessages: MiraMessage[] = tsMsgs
          .filter((msg: any) => msg.role !== "tool")
          .map((msg: any) => ({
            id: crypto.randomUUID(),
            dbId: msg.id,
            role: msg.role,
            parts: typeof msg.content === "string" && msg.content
              ? [{ type: "text" as const, text: msg.content }]
              : [],
            createdAt: msg.timestamp ? new Date(msg.timestamp) : undefined,
            retryCount: msg.retryCount || 0,
          }));
        setMessages(formattedMessages);
      } else {
        setMessages([]);
      }
    } catch {
      setMessages([]);
    }
  }, [sessionId]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    return () => {
      if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
      const ch = currentChannelRef.current;
      if (ch && agentServiceRef.current) agentServiceRef.current.stopStream(ch);
    };
  }, []);

  const sendMessage = useCallback(
    async (content: string) => {
      if (!content || isRunning) return;

      const svc = agentServiceRef.current;
      if (!svc) return;

      const effectiveContent = goalCondition
        ? `[Goal: ${goalCondition}]\n\n${content}`
        : content;

      const userMsg = createMiraMessage("user", effectiveContent);
      const assistantId = crypto.randomUUID();
      const assistantMsg = createMiraMessage("assistant", [], assistantId);

      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setIsRunning(true);

      if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
      loadingTimeoutRef.current = setTimeout(() => {
        setIsRunning(false);
      }, 120000);

      try {
        const provider = await getProviderById(selectedModel.provider);
        const apiKey = provider?.apiKey || "";
        const apiUrl = provider?.apiUrl || "";

        if (!apiKey) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, parts: [{ type: "text", text: "⚠️ 未配置 API Key。请点击右上角 ⚙️ 设置，配置 Provider 的 API Key 后重试。" }] }
                : m
            )
          );
          setIsRunning(false);
          return;
        }

        if (apiKey || provider) {
          const workspace =
            window.electronAPI.platform === "win32" ? "C:\\" : "/";
          const settings = getSettings();
          const config = {
            sessionID: sessionId || getOfflineSessionId(),
            workspace,
            model: selectedModel.value,
            apiKey,
            apiUrl,
            provider: selectedModel.provider,
            headers: provider?.headers || {},
            maxMode: settings.maxMode || false,
            maxModeCandidates: 3,
            autoAcceptPermissions: settings.autoAcceptPermissions || false,
            options: {
              ...(provider?.options || {}),
              shell: settings.terminalShell || "default",
            },
          };

          const actualSessionId = sessionId || getOfflineSessionId();

          if (!sessionId) {
            try {
              const projects = await window.electronAPI.ts.listProjects();
              const projectId = projects?.[0]?.project_id;
              if (projectId) {
                const session = await window.electronAPI.ts.createSession(projectId, effectiveContent.slice(0, 50));
                if (session?.session_id) {
                  config.sessionID = session.session_id;
                  if (onSessionChange) onSessionChange(session.session_id);
                }
              }
            } catch { /* 静默 */ }
          }

          const channel = await svc.startStream(
            config.sessionID,
            effectiveContent,
            config
          );
          currentChannelRef.current = channel;
          if (onSessionChange && !sessionId) onSessionChange(config.sessionID);

          timingRef.current = {
            streamStartTime: Date.now(),
            tokenCount: 0,
            chunkCount: 0,
            toolCallCount: 0,
          };
          const timingData = timingRef.current;
          setLiveTiming(timingData);

          const cleanup = svc.onEvent(
            channel,
            (event: AgentEvent) => {
              handleStreamEvent(event, channel, assistantId, {
                setMessages,
                setIsRunning,
                clearCurrentChannel: () => { currentChannelRef.current = null; },
                setPermissionReq,
                setQuestionReq,
                setLiveTiming,
                timingRef,
              });
              if (event.type === "finish") {
                cleanup();
              }
            }
          );
          return;
        }

        // 无 API Key → 关键词路由
        const tools = await svc.listTools().catch(() => []);
        if (tools.length > 0) {
          const { routeToolMessage } = await import("../chat/tool-router");
          const toolRoute = routeToolMessage(content, tools);
          if (toolRoute) {
            const result = await svc.executeTool(toolRoute.name, toolRoute.args);
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? {
                      ...m,
                      parts: [{
                        type: "text",
                        text: result.success
                          ? `✅ **${toolRoute.name}** 执行成功\n\n${result.output}`
                          : `❌ **${toolRoute.name}** 执行失败\n\n${result.error || "未知错误"}`,
                      }],
                    }
                  : m
              )
            );
            setIsRunning(false);
            return;
          }
        }

        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  parts: [{ type: "text", text: "未识别到工具命令。请使用 🔧 工具面板手动执行，或在设置中配置 API Key 启用 AI 对话。" }],
                }
              : m
          )
        );
      } catch (err: any) {
        console.error("Chat error:", err);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  parts: [{ type: "text", text: `⚠️ 发送失败：${err?.message || String(err)}` }],
                }
              : m
          )
        );
      } finally {
        if (loadingTimeoutRef.current) clearTimeout(loadingTimeoutRef.current);
        setIsRunning(false);
      }
    },
    [isRunning, sessionId, selectedModel, agentMode, goalCondition]
  );

  const retryMessage = useCallback(
    async (assistantMsgId: string) => {
      let userContent = "";
      setMessages((prev) => {
        const idx = prev.findIndex(m => m.id === assistantMsgId);
        if (idx > 0 && prev[idx - 1]?.role === "user") {
          const userPart = prev[idx - 1].parts.find(p => p.type === "text");
          userContent = userPart?.text || "";
          return prev.filter((_, i) => i !== idx - 1 && i !== idx);
        }
        return prev;
      });
      if (userContent) {
        await sendMessage(userContent);
      }
    },
    [sendMessage]
  );

  const stopStream = useCallback(() => {
    setIsRunning(false);
    const ch = currentChannelRef.current;
    if (ch && agentServiceRef.current) {
      agentServiceRef.current.stopStream(ch);
      currentChannelRef.current = null;
    }
  }, []);

  const handlePermission = useCallback(
    async (approved: boolean | "always") => {
      const req = permissionReq;
      if (!req) return;
      setPermissionReq(null);
      if (req.channel && agentServiceRef.current) {
        await agentServiceRef.current.replyPermission(
          req.channel,
          req.request_id,
          approved === "always" ? "always" : approved ? "allow" : "deny"
        );
      }
    },
    [permissionReq]
  );

  const handleQuestionAnswer = useCallback(async (answer: string) => {
    const req = questionReq;
    if (!req) return;
    const id = req.request_id;
    setQuestionReq(null);
    if (id && agentServiceRef.current) {
      try {
        await agentServiceRef.current.answerQuestion(id, answer);
      } catch (err) {
        console.error("Failed to answer question:", err);
      }
    }
  }, [questionReq]);

  const handleToolResult = useCallback(
    (toolName: string, result: ToolResult) => {
      const header = `**${toolName}**`;
      const content = result.success
        ? `${header}\n\n${result.output}`
        : `${header}\n\n${result.error || "执行失败"}`;
      const msg = createMiraMessage("assistant", content);
      setMessages((prev) => [...prev, msg]);
    },
    []
  );

  return {
    messages,
    isRunning,
    liveTiming,
    permissionReq,
    questionReq,
    sendMessage,
    retryMessage,
    stopStream,
    handlePermission,
    handleQuestionAnswer,
    handleToolResult,
    loadHistory,
    setMessages,
  };
}
