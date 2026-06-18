import { useState } from "react";
import { ChevronRight, ChevronDown, Brain } from "lucide-react";

interface Props {
  text: string;
}

export function ThinkingBlock({ text }: Props) {
  const [collapsed, setCollapsed] = useState(true);

  if (!text) return null;

  return (
    <div className="mb-3 rounded-lg border overflow-hidden"
      style={{ borderColor: 'var(--border)', background: 'var(--surface-secondary)' }}>
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center gap-2 w-full px-3 py-2 text-xs text-neutral-400 hover:text-neutral-300 transition-colors duration-200"
      >
        {collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        <Brain className="w-3 h-3" style={{ color: '#A371F7' }} />
        <span>思考过程</span>
        <span className="text-[10px] text-neutral-600 ml-auto">
          {text.split(/\s+/).filter(Boolean).length} tokens
        </span>
      </button>
      {!collapsed && (
        <div className="px-3 pb-3 text-xs text-neutral-500 italic whitespace-pre-wrap leading-relaxed">
          {text}
        </div>
      )}
    </div>
  );
}
