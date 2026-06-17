import { useCallback, useMemo, type ReactNode } from "react";
import {
  useExternalStoreRuntime,
  AssistantRuntimeProvider,
  type ThreadMessageLike,
  type AppendMessage,
} from "@assistant-ui/react";
import { useMiraChat } from "@/hooks/useMiraChat";
import { convertMessage, type MiraMessage } from "./mira-runtime";
import type { ModelOption } from "./ModelSelector";
import type { AgentMode } from "./types";

interface MiraRuntimeContext {
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
  handlePermission: (approved: boolean | "always") => Promise<void>;
  handleQuestionAnswer: (answer: string) => void;
  handleToolResult: (toolName: string, result: any) => void;
  stopStream: () => void;
  sendMessage: (content: string) => Promise<void>;
  retryMessage: (assistantMsgId: string) => Promise<void>;
}

interface Props {
  sessionId: string;
  selectedModel: ModelOption;
  agentMode: AgentMode;
  goalCondition?: string | null;
  children: ReactNode | ((ctx: MiraRuntimeContext) => ReactNode);
}

export function MiraRuntimeProvider({
  sessionId,
  selectedModel,
  agentMode,
  goalCondition,
  children,
}: Props) {
  const chat = useMiraChat({
    sessionId,
    selectedModel,
    agentMode,
    goalCondition,
  });

  const onNew = useCallback(
    async (message: AppendMessage) => {
      if (message.content[0]?.type !== "text") {
        throw new Error("Only text messages are supported");
      }
      let input = message.content[0].text;
      const quote = (message.metadata as { custom?: { quote?: { text: string; messageId: string } } })?.custom?.quote;
      if (quote?.text) {
        input = `[引用: "${quote.text}"]\n\n${input}`;
      }
      await chat.sendMessage(input);
    },
    [chat.sendMessage]
  );

  const onCancel = useCallback(async () => {
    chat.stopStream();
  }, [chat.stopStream]);

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

  const runtime = useExternalStoreRuntime<ThreadMessageLike>({
    isRunning: chat.isRunning,
    messages: convertedMessages,
    onNew,
    onCancel,
    convertMessage: convertThreadMessage,
  });

  const context: MiraRuntimeContext = {
    messages: chat.messages,
    isRunning: chat.isRunning,
    permissionReq: chat.permissionReq,
    questionReq: chat.questionReq,
    handlePermission: chat.handlePermission,
    handleQuestionAnswer: chat.handleQuestionAnswer,
    handleToolResult: chat.handleToolResult,
    stopStream: chat.stopStream,
    sendMessage: chat.sendMessage,
    retryMessage: chat.retryMessage,
  };

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      {typeof children === "function" ? children(context) : children}
    </AssistantRuntimeProvider>
  );
}
