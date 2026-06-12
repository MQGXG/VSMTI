import { Loader2, Send } from "lucide-react";

interface Props {
  input: string;
  isLoading: boolean;
  disabled?: boolean;
  onInput: (value: string) => void;
  onSend: () => void;
}

export function ChatInput({ input, isLoading, disabled, onInput, onSend }: Props) {
  return (
    <div className={`flex items-end gap-2 rounded-2xl border px-4 py-3 transition-colors ${
      disabled
        ? "bg-neutral-800/50 border-neutral-800 opacity-60"
        : "bg-gray-100 dark:bg-neutral-900 border-gray-200 dark:border-neutral-800 focus-within:border-emerald-500/40"
    }`}>
      <textarea
        value={input}
        onChange={(e) => onInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onSend();
          }
        }}
        placeholder={disabled ? "请先选择一个项目..." : "输入消息... (Ctrl+Shift+A 全局唤出)"}
        rows={1}
        disabled={disabled}
        className="flex-1 bg-transparent text-sm text-gray-900 dark:text-neutral-200 placeholder-gray-400 dark:placeholder-neutral-600 outline-none resize-none leading-relaxed disabled:cursor-not-allowed"
      />
      <button
        onClick={onSend}
        disabled={!input.trim() || isLoading || disabled}
        className="flex-shrink-0 w-9 h-9 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-200 dark:disabled:bg-neutral-800 disabled:text-gray-400 dark:disabled:text-neutral-600 text-white flex items-center justify-center transition-all"
      >
        {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
      </button>
    </div>
  );
}
