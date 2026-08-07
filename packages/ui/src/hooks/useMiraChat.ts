import { useState, useCallback, useRef, useEffect } from "react";
import { getProviderById, loadSettings as getSettings } from "../sidebar/provider-data";
import { createMiraMessage } from "../chat/mira-runtime";
import type { MiraMessage, MiraPart } from "../chat/mira-runtime";
import type { AgentEvent, ToolResult } from "../services/agent.service";
import type { ModelOption } from "../chat/ModelSelector";
import type { AgentMode } from "../chat/types";
import { handleStreamEvent, setAgentService, clearContentBuffers } from "./stream-events";

type AgentServiceShape = typeof import("../services/agent.service").AgentService

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
  /** 当前流的 onEvent 清理函数（暂停时调用以停止 SSE 监听） */
  const streamCleanupRef = useRef<(() => void) | null>(null);
  const timingRef = useRef<{
    streamStartTime: number;
    firstTokenTime?: number;
    tokenCount: number;
    chunkCount: number;
    toolCallCount: number;
  } | null>(null);
  const agentServiceRef = useRef<AgentServiceShape | null>(null);

  useEffect(() => {
    import("../services/agent.service").then((mod) => {
      setAgentService(mod.AgentService);
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
          .filter((msg) => msg.role !== "tool")
          .map((msg) => ({
            // 使用数据库稳定 id，保证 retry/edit 指向一致
            id: `msg-${msg.id}`,
            dbId: msg.id,
            role: msg.role as "user" | "assistant",
            parts: parseStoredMessageContent(msg.content),
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

        // 有 API Key → 走 LLM 流式对话
        if (apiKey) {
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
            mode: agentMode,
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
                sessionId: config.sessionID,
                setPermissionReq,
                setQuestionReq,
                setLiveTiming,
                timingRef,
              });
              if (event.type === "finish") {
                cleanup();
                if (streamCleanupRef.current === cleanup) streamCleanupRef.current = null;
              }
            }
          );
          streamCleanupRef.current = cleanup;
          return;
        }

        // 无 API Key → 先尝试关键词路由（本地工具能力），路由不到再提示配置
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
              ? { ...m, parts: [{ type: "text", text: "⚠️ 未配置 API Key。请点击右上角 ⚙️ 设置，配置 Provider 的 API Key 后启用 AI 对话，或使用 🔧 工具面板执行本地工具。" }] }
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
      let userDbId: number | undefined;
      let assistantDbId: number | undefined;
      setMessages((prev) => {
        const idx = prev.findIndex(m => m.id === assistantMsgId);
        if (idx > 0 && prev[idx - 1]?.role === "user") {
          const userPart = prev[idx - 1].parts.find(p => p.type === "text");
          userContent = userPart?.text || "";
          userDbId = prev[idx - 1].dbId;
          assistantDbId = prev[idx].dbId;
          return prev.filter((_, i) => i !== idx - 1 && i !== idx);
        }
        return prev;
      });
      // 清理 DB 中旧的 user/assistant 消息，避免重试后重复累积
      if (userContent && sessionId) {
        if (userDbId !== undefined) {
          window.electronAPI.ts.deleteMessage(sessionId, userDbId).catch(() => {});
        }
        if (assistantDbId !== undefined) {
          window.electronAPI.ts.deleteMessage(sessionId, assistantDbId).catch(() => {});
        }
        await sendMessage(userContent);
      }
    },
    [sendMessage, sessionId]
  );

  const stopStream = useCallback(() => {
    // 停止 SSE 事件监听（防止暂停后 finish/error 事件继续更新已停消息）
    if (streamCleanupRef.current) {
      streamCleanupRef.current();
      streamCleanupRef.current = null;
    }
    // 清理 loading 超时定时器
    if (loadingTimeoutRef.current) {
      clearTimeout(loadingTimeoutRef.current);
      loadingTimeoutRef.current = null;
    }
    // 清理流式缓冲与计时
    clearContentBuffers();
    setIsRunning(false);
    setLiveTiming(null);
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

/**
 * 解析历史消息的存储内容为渲染 parts。
 * agent.ts 将含工具调用的 assistant 消息存为 JSON 字符串：
 *   {"text":"...","tool_calls":[{"id","name","args"}]}
 * 此处还原为 text + tool-call parts，避免历史记录显示 JSON 乱码。
 */
function parseStoredMessageContent(content: string): MiraPart[] {
  if (!content) return [];
  const trimmed = content.trim();
  // 尝试解析 JSON 结构（含工具调用的历史消息）
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const parts: MiraPart[] = [];
        if (typeof parsed.text === "string" && parsed.text) {
          parts.push({ type: "text", text: parsed.text });
        }
        if (Array.isArray(parsed.tool_calls)) {
          for (const tc of parsed.tool_calls) {
            if (tc && typeof tc.id === "string" && typeof tc.name === "string") {
              parts.push({
                type: "tool-call",
                toolCallId: tc.id,
                toolName: tc.name,
                args: (tc.args as Record<string, unknown>) || {},
                status: "done",
                result: "",
              });
            }
          }
        }
        if (parts.length > 0) return parts;
      }
    } catch { /* 不是 JSON 则按纯文本处理 */ }
  }
  return [{ type: "text", text: content }];
}
