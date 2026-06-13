import { Loader2, Send } from "lucide-react";
import { ToolPalette } from "./ToolPalette";
import type { ToolResult } from "@/types/electron";

interface Props {
  input: string;
  isLoading: boolean;
  disabled?: boolean;
  onInput: (value: string) => void;
  onSend: () => void;
  onToolResult?: (toolName: string, result: ToolResult) => void;
}

export function ChatInput({ input, isLoading, disabled, onInput, onSend, onToolResult }: Props) {
  return (
    <div className="space-y-2">
      {/* 工具面板行（始终可用，不需要会话） */}
      <div className="flex items-center gap-1">
        {onToolResult && <ToolPalette onResult={onToolResult} inputHint={input} />}
      </div>

      <div
        className={`relative flex items-end gap-2 rounded-2xl px-4 py-3 transition-all duration-200 ${
          disabled
            ? "glass opacity-60"
            : "glass-heavy focus-within:border-accent-500/30 focus-within:shadow-[0_0_20px_rgba(99,102,241,0.08)]"
        }`}
      >
        <textarea
          value={input}
          onChange={(e) => onInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (!disabled) onSend();
            }
          }}
          placeholder={disabled ? "AI 对话需连接后端，工具面板可直接使用" : "输入消息... (Shift+Enter 换行)"}
          rows={1}
          disabled={disabled}
          className="flex-1 bg-transparent text-sm text-gray-900 dark:text-neutral-200 placeholder-neutral-500 outline-none resize-none leading-relaxed disabled:cursor-not-allowed"
        />

        <button
          onClick={onSend}
          disabled={!input.trim() || isLoading || disabled}
          className="flex-shrink-0 w-9 h-9 rounded-xl btn-gradient text-white flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed disabled:transform-none"
        >
          {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}
