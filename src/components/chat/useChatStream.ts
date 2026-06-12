import { useCallback } from "react";
import type { Message } from "./types";

interface PermissionRequest {
  tool_name: string;
  args: Record<string, unknown>;
  reason: string;
  request_id: string;
}

interface QuestionEvent {
  question: string;
  options: string[];
  request_id: string;
}

interface ChatStreamOptions {
  assistantId: string;
  onContent: (text: string) => void;
  onToolStart: (id: string, name: string, args: Record<string, unknown>) => void;
  onToolDelta: (id: string, delta: string) => void;
  onToolResult: (name: string, output: string, success: boolean) => void;
  onToolError: (name: string, error: string) => void;
  onPermissionRequest?: (req: PermissionRequest) => void;
  onQuestion?: (q: QuestionEvent) => void;
  onError: (message: string) => void;
  onFinish: () => void;
}

export function useChatStream() {
  const streamChat = useCallback(async (
    url: string,
    body: Record<string, unknown>,
    opts: ChatStreamOptions,
  ) => {
    const response = await fetch(`${url}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      let detail = `HTTP ${response.status}`;
      try {
        const data = await response.json();
        detail = data.detail || JSON.stringify(data);
      } catch {
        // ignore
      }
      throw new Error(`请求失败: ${detail}`);
    }

    if (!response.body) {
      throw new Error("响应体为空");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop()!;

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          
          try {
            const data = JSON.parse(line.slice(6));

            switch (data.type) {
              case "content":
                opts.onContent(data.text);
                break;
              case "tool_start": {
                const tcName = data.name || data.id;
                opts.onToolStart(tcName, tcName, data.args || {});
                break;
              }
              case "tool_delta": {
                const tcId = data.id || data.name;
                opts.onToolDelta(tcId, data.arguments_delta || "");
                break;
              }
              case "tool_result":
                opts.onToolResult(data.name, data.output, data.success !== false);
                break;
              case "tool_error":
                opts.onToolError(data.name, data.error);
                break;
              case "permission_request":
                if (opts.onPermissionRequest) {
                  opts.onPermissionRequest({
                    tool_name: data.tool_name,
                    args: data.args || {},
                    reason: data.reason,
                    request_id: data.request_id,
                  });
                }
                break;
              case "question":
                if (opts.onQuestion) {
                  opts.onQuestion({
                    question: data.question,
                    options: data.options || [],
                    request_id: data.request_id,
                  });
                }
                break;
              case "error":
                opts.onError(data.message);
                break;
              case "finish":
              case "done":
                opts.onFinish();
                break;
            }
          } catch (parseErr) {
            console.error("[SSE] 解析事件失败:", line, parseErr);
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }, []);

  return { streamChat };
}
