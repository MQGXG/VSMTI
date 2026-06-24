import { useState, useCallback, useRef, useEffect } from "react";
import { getProviderById, getSettings } from "../sidebar/SettingsDialog";
import type { MiraMessage } from "../chat/mira-runtime";
import {
  createMiraMessage,
  updateMiraMessageContent,
  addToolCallToMessage,
  updateToolCallInMessage,
} from "../chat/mira-runtime";
import type { AgentEvent, ToolResult } from "../types/electron";
import type { ModelOption } from "../chat/ModelSelector";
import type { AgentMode } from "../chat/types";

interface UseMiraChatOptions {
  sessionId: string;
  selectedModel: ModelOption;
  agentMode: AgentMode;
  goalCondition?: string | null;
}

interface UseMiraChatReturn {
  messages: MiraMessage[];
  isRunning: boolean;
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
}: UseMiraChatOptions): UseMiraChatReturn {
  const [messages, setMessages] = useState<MiraMessage[]>([]);
  const [isRunning, setIsRunning] = useState(false);
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
      const tsMsgs = await window.electronAPI.ts.getSessionMessages(sessionId);
      if (tsMsgs && tsMsgs.length > 0) {
        const formattedMessages: MiraMessage[] = tsMsgs
          .filter((msg: any) => msg.role !== "tool")
          .map((msg: any) => ({
          id: crypto.randomUUID(),
          dbId: msg.id,
          role: msg.role,
          content: typeof msg.content === "string" ? msg.content : String(msg.content || ""),
          createdAt: msg.timestamp ? new Date(msg.timestamp) : undefined,
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
      if (ch) window.electronAPI.agent.stopStream(ch);
    };
  }, []);

  const sendMessage = useCallback(
    async (content: string) => {
      if (!content || isRunning) return;

      // 如果有 goal 条件，注入到消息中
      const effectiveContent = goalCondition
        ? `[Goal: ${goalCondition}]\n\n${content}`
        : content;

      const userMsg = createMiraMessage("user", effectiveContent);
      const assistantId = crypto.randomUUID();
      const assistantMsg = createMiraMessage("assistant", "", assistantId);

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

        if (apiKey || provider) {
          const workspace =
            window.electronAPI.platform === "win32" ? "C:\\" : "/";
          const config = {
            sessionID: sessionId || getOfflineSessionId(),
            workspace,
            model: selectedModel.value,
            apiKey,
            apiUrl,
            provider: selectedModel.provider,
            headers: provider?.headers || {},
            options: {
              ...(provider?.options || {}),
              shell: getSettings().terminalShell || "default",
            },
          };

          const channel = await window.electronAPI.agent.startStream(
            sessionId || getOfflineSessionId(),
            effectiveContent,
            config
          );
          currentChannelRef.current = channel;

          timingRef.current = {
            streamStartTime: Date.now(),
            tokenCount: 0,
            chunkCount: 0,
            toolCallCount: 0,
          };

          const cleanup = window.electronAPI.agent.onEvent(
            channel,
            (event: AgentEvent) => {
              if (event.type === "content") {
                const t = timingRef.current;
                if (t) {
                  if (!t.firstTokenTime) t.firstTokenTime = Date.now();
                  t.tokenCount += event.text.split(/\s+/).filter(Boolean).length;
                  t.chunkCount++;
                }
                setMessages((prev) => {
                  const last = prev[prev.length - 1];
                  if (last?.role === "assistant" && last.id === assistantId) {
                    return [
                      ...prev.slice(0, -1),
                      updateMiraMessageContent(last, last.content + event.text),
                    ];
                  }
                  return [
                    ...prev,
                    createMiraMessage("assistant", event.text, assistantId),
                  ];
                });
              } else if (event.type === "tool_start") {
                const t = timingRef.current;
                if (t) t.toolCallCount++;
                setMessages((prev) => {
                  const last = prev[prev.length - 1];
                  if (last?.role === "assistant" && last.id === assistantId) {
                    const toolCall = {
                      toolCallId: event.id,
                      name: event.name,
                      args: event.args,
                      status: "running" as const,
                    };
                    return [
                      ...prev.slice(0, -1),
                      addToolCallToMessage(last, toolCall),
                    ];
                  }
                  const newMsg = createMiraMessage("assistant", "", assistantId);
                  const toolCall = {
                    toolCallId: event.id,
                    name: event.name,
                    args: event.args,
                    status: "running" as const,
                  };
                  return [...prev, addToolCallToMessage(newMsg, toolCall)];
                });
              } else if (event.type === "thinking") {
                setMessages((prev) => {
                  const last = prev[prev.length - 1];
                  if (last?.role === "assistant" && last.id === assistantId) {
                    return [
                      ...prev.slice(0, -1),
                      {
                        ...last,
                        thinking: (last.thinking || "") + event.text,
                      },
                    ];
                  }
                  return prev;
                });
              } else if (event.type === "tool_result") {
                setMessages((prev) => {
                  const last = prev[prev.length - 1];
                  if (last?.role === "assistant" && last.id === assistantId) {
                    const resultContent = event.result.success
                      ? `✅ **${event.name}** 执行成功\n\n${event.result.output || ""}`
                      : `❌ **${event.name}** 执行失败\n\n${event.result.error || "未知错误"}`;
                    return [
                      ...prev.slice(0, -1),
                      {
                        ...last,
                        content: last.content
                          ? last.content + "\n\n" + resultContent
                          : resultContent,
                        toolCalls: last.toolCalls?.map((tc) =>
                          tc.toolCallId === event.id
                            ? {
                                ...tc,
                                status: event.result.success
                                  ? ("done" as const)
                                  : ("error" as const),
                                result:
                                  event.result.output ||
                                  event.result.error ||
                                  "",
                              }
                            : tc
                        ),
                      },
                    ];
                  }
                  return prev;
                });
              } else if (event.type === "permission_request") {
                const s = getSettings();
                if (s.autoAcceptPermissions) {
                  window.electronAPI.agent.replyPermission(
                    channel,
                    event.id,
                    "allow"
                  );
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
                const cleanMsg = event.message
                  .replace(/\[TOOL_ERROR\]\s*/g, "")
                  .replace(/\s*\{.*\}/s, "")
                  .trim();
                setMessages((prev) => [
                  ...prev,
                  createMiraMessage(
                    "assistant",
                    `⚠️ ${cleanMsg || event.message}`
                  ),
                ]);
              } else if (event.type === "finish") {
                const t = timingRef.current;
                if (t) {
                  const now = Date.now();
                  const totalTime = now - t.streamStartTime;
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
                            tokenCount: t.tokenCount,
                            tokensPerSecond: totalTime > 0
                              ? Math.round((t.tokenCount / totalTime) * 1000 * 10) / 10
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
                }
                setIsRunning(false);
                cleanup();
                currentChannelRef.current = null;
                window.electronAPI.agent.stopStream(channel);
              }
            }
          );
          return;
        }

        // 无 API Key → 关键词路由
        const tools = await window.electronAPI.agent
          .listTools()
          .catch(() => []);
        if (tools.length > 0) {
          const { routeToolMessage } = await import("../chat/tool-router");
          const toolRoute = routeToolMessage(content, tools);
          if (toolRoute) {
            const result = await window.electronAPI.agent.executeTool(
              toolRoute.name,
              toolRoute.args
            );
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? updateMiraMessageContent(
                      m,
                      result.success
                        ? `✅ **${toolRoute.name}** 执行成功\n\n${result.output}`
                        : `❌ **${toolRoute.name}** 执行失败\n\n${result.error || "未知错误"}`
                    )
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
              ? updateMiraMessageContent(
                  m,
                  "未识别到工具命令。请使用 🔧 工具面板手动执行，或在设置中配置 API Key 启用 AI 对话。"
                )
              : m
          )
        );
      } catch (err: any) {
        console.error("Chat error:", err);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? updateMiraMessageContent(
                  m,
                  `⚠️ 发送失败：${err?.message || String(err)}`
                )
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
          userContent = prev[idx - 1].content;
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
    if (ch) {
      window.electronAPI.agent.stopStream(ch);
      currentChannelRef.current = null;
    }
  }, []);

  const handlePermission = useCallback(
    async (approved: boolean | "always") => {
      const req = permissionReq;
      if (!req) return;
      setPermissionReq(null);
      if (req.channel) {
        await window.electronAPI.agent.replyPermission(
          req.channel,
          req.request_id,
          approved === "always" ? "always" : approved ? "allow" : "deny"
        );
      }
    },
    [permissionReq]
  );

  const handleQuestionAnswer = useCallback((_answer: string) => {
    setQuestionReq(null);
  }, []);

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
