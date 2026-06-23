import { useState } from "react";
import { ChevronRight, ChevronDown, Sparkles } from "lucide-react";

interface Props {
  text: string;
}

export function ThinkingBlock({ text }: Props) {
  const [collapsed, setCollapsed] = useState(true);

  if (!text) return null;

  return (
    <div className="mb-3 rounded-lg overflow-hidden" style={{ border: "1px solid var(--border-light)" }}>
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center gap-2 w-full px-3 py-2 text-xs transition-colors duration-150 hover:bg-black/3 dark:hover:bg-white/3"
        style={{ background: "var(--surface-secondary)" }}
      >
        {collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        <Sparkles className="w-3 h-3" style={{ color: "var(--accent)" }} />
        <span style={{ color: "var(--text-secondary)" }}>思考过程</span>
        <span className="text-[10px] ml-auto" style={{ color: "var(--text-tertiary)" }}>
          {text.split(/\s+/).filter(Boolean).length} tokens
        </span>
      </button>
      {!collapsed && (
        <div className="px-3 pb-3 text-xs whitespace-pre-wrap leading-relaxed" style={{ color: "var(--text-tertiary)" }}>
          {text}
        </div>
      )}
    </div>
  );
}
