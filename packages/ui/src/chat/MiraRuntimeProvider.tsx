import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  useExternalStoreRuntime,
  AssistantRuntimeProvider,
  createMessageQueue,
  WebSpeechSynthesisAdapter,
  WebSpeechDictationAdapter,
  type ThreadMessageLike,
  type AppendMessage,
} from "@assistant-ui/react";
import { useMiraChat } from "../hooks/useMiraChat";
import { convertMessage, type MiraMessage } from "./mira-runtime";
import type { ModelOption } from "./ModelSelector";
import type { AgentMode } from "./types";
import { fileAttachmentAdapter } from "../lib/attachment-adapter";

export interface MiraRuntimeContext {
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
  handlePermission: (approved: boolean | "always") => Promise<void>;
  handleQuestionAnswer: (answer: string) => void;
  handleToolResult: (toolName: string, result: any) => void;
  stopStream: () => void;
  sendMessage: (content: string) => Promise<void>;
  retryMessage: (assistantMsgId: string) => Promise<void>;
  setMessages: React.Dispatch<React.SetStateAction<MiraMessage[]>>;
}

interface Props {
  sessionId: string;
  selectedModel: ModelOption;
  agentMode: AgentMode;
  goalCondition?: string | null;
  onSessionChange?: (sessionId: string) => void;
  children: ReactNode | ((ctx: MiraRuntimeContext) => ReactNode);
}

export function MiraRuntimeProvider({
  sessionId,
  selectedModel,
  agentMode,
  goalCondition,
  onSessionChange,
  children,
}: Props) {
  const chat = useMiraChat({
    sessionId,
    selectedModel,
    agentMode,
    goalCondition,
    onSessionChange,
  });

  /** 发送队列 — 运行时允许排队发消息 */
  const [queue] = useState(() =>
    createMessageQueue({
      async run(message: AppendMessage) {
        if (message.content[0]?.type !== "text") return;
        let input = message.content[0].text;
        const quote = (message.metadata as { custom?: { quote?: { text: string; messageId: string } } })?.custom?.quote;
        if (quote?.text) {
          input = `[引用: "${quote.text}"]\n\n${input}`;
        }
        const attachmentText = message.content
          .filter(p => p.type !== "text")
          .map(p => p.type === "image" ? `[图片附件]` : `[附件]`)
          .join("\n");
        if (attachmentText) {
          input = `${input}\n\n${attachmentText}`;
        }
        await chat.sendMessage(input);
      },
    }),
  )

  // 同步运行状态到队列
  const prevRunning = useRef(chat.isRunning)
  useEffect(() => {
    if (!prevRunning.current && chat.isRunning) {
      queue.notifyBusy()
    } else if (prevRunning.current && !chat.isRunning) {
      queue.notifyIdle()
    }
    prevRunning.current = chat.isRunning
  }, [chat.isRunning, queue])

  const onNew = useCallback(
    async (message: AppendMessage) => {
      if (message.content[0]?.type !== "text") return;
      let input = message.content[0].text;
      const quote = (message.metadata as { custom?: { quote?: { text: string; messageId: string } } })?.custom?.quote;
      if (quote?.text) {
        input = `[引用: "${quote.text}"]\n\n${input}`;
      }
      const attachmentText = message.content
        .filter(p => p.type !== "text")
        .map(p => p.type === "image" ? `[图片附件]` : `[附件]`)
        .join("\n");
      if (attachmentText) {
        input = `${input}\n\n${attachmentText}`;
      }
      await chat.sendMessage(input);
    },
    [chat.sendMessage]
  );

  const onCancel = useCallback(async () => {
    chat.stopStream();
  }, [chat.stopStream]);

  /** 编辑消息后重新发送 */
  const onEdit = useCallback(
    async (message: AppendMessage) => {
      if (message.content[0]?.type !== "text") return;
      // 找到被编辑的消息位置，截断其后所有消息
      const input = message.content[0].text;
      const parentId = message.parentId;
      if (parentId) {
        chat.setMessages((prev) => {
          const idx = prev.findIndex(m => m.id === parentId);
          if (idx >= 0) return prev.slice(0, idx + 1);
          return prev;
        });
      }
      await chat.sendMessage(input);
    },
    [chat.sendMessage]
  );

  /** 重新生成最后一条助手回复 */
  const onReload = useCallback(
    async (parentId: string | null) => {
      if (!parentId) return;
      // 找到 user 消息，重发
      chat.setMessages((prev) => {
        const idx = prev.findIndex(m => m.id === parentId);
        if (idx >= 0) {
          const userMsg = prev[idx];
          const userText = userMsg.parts.find(p => p.type === "text")?.text;
          if (userText) {
            // 删除 user 和之后的 assistant 消息
            return prev.slice(0, idx);
          }
        }
        return prev;
      });
      // 从原始消息重发
      const userMsg = chat.messages.find(m => m.id === parentId);
      if (userMsg) {
        const text = userMsg.parts.find(p => p.type === "text")?.text;
        if (text) await chat.sendMessage(text);
      }
    },
    [chat.sendMessage]
  );

  const convertedMessages = useMemo(() => {
    return chat.messages.map((msg) => convertMessage(msg));
  }, [chat.messages]);

  const roles = new Set(["user", "assistant"]);

  const convertThreadMessage = useCallback(
    (message: any, idx: number): ThreadMessageLike => {
      const role = roles.has(message.role) ? message.role : "assistant";
      return {
        role,
        content: Array.isArray(message.content) ? message.content : [{ type: "text" as const, text: String(message.content || "") }],
        id: message.id,
        createdAt: message.createdAt,
      };
    },
    []
  );

  const suggestions = useMemo(() => chat.messages.length === 0 ? [
    { prompt: "帮我写一段代码" },
    { prompt: "分析这份数据" },
    { prompt: "搜索一下最新AI新闻" },
    { prompt: "解释这个技术概念" },
  ] : undefined, [chat.messages.length]);

  const runtime = useExternalStoreRuntime<ThreadMessageLike>({
    isRunning: chat.isRunning,
    messages: convertedMessages,
    onNew,
    onCancel,
    onEdit,
    onReload,
    setMessages: chat.setMessages as any,
    convertMessage: convertThreadMessage,
    suggestions,
    queue: queue.adapter,
    adapters: {
      attachments: fileAttachmentAdapter,
      speech: new WebSpeechSynthesisAdapter(),
      dictation: new WebSpeechDictationAdapter(),
    },
  });

  const context: MiraRuntimeContext = {
    messages: chat.messages,
    isRunning: chat.isRunning,
    liveTiming: chat.liveTiming,
    permissionReq: chat.permissionReq,
    questionReq: chat.questionReq,
    handlePermission: chat.handlePermission,
    handleQuestionAnswer: chat.handleQuestionAnswer,
    handleToolResult: chat.handleToolResult,
    stopStream: chat.stopStream,
    sendMessage: chat.sendMessage,
    retryMessage: chat.retryMessage,
    setMessages: chat.setMessages,
  };

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      {typeof children === "function" ? children(context) : children}
    </AssistantRuntimeProvider>
  );
}
