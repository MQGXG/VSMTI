import { useState, useCallback, useRef, useEffect } from "react";
import { getProviderById, loadSettings as getSettings } from "../sidebar/provider-data";
import { createMiraMessage } from "../chat/mira-runtime";
import type { MiraMessage } from "../chat/mira-runtime";
import type { AgentEvent, ToolResult } from "../services/agent.service";
import type { ModelOption } from "../chat/ModelSelector";
import type { AgentMode } from "../chat/types";
import { handleStreamEvent, setAgentService } from "./stream-events";

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
            id: crypto.randomUUID(),
            dbId: msg.id,
            role: msg.role as "user" | "assistant",
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
