import { useState } from "react";
import { ChevronDown, ChevronRight, Loader2, CheckCircle2, XCircle } from "lucide-react";
import type { ToolCallInfo } from "../types";

interface Props {
  info: ToolCallInfo;
}

export function ToolGenericView({ info }: Props) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="ml-8 mt-2 glass rounded-xl border border-glass-border overflow-hidden animate-fade-in-up">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-neutral-400 hover:text-neutral-200 transition-colors"
      >
        {info.status === "running" ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-500" />
        ) : info.status === "done" ? (
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
        ) : (
          <XCircle className="w-3.5 h-3.5 text-red-500" />
        )}
        <span className="font-mono">{info.name}</span>
        {expanded ? <ChevronDown className="w-3 h-3 ml-auto" /> : <ChevronRight className="w-3 h-3 ml-auto" />}
      </button>

      {expanded && info.result && (
        <div className="border-t border-glass-border">
          <pre className="px-3 py-2 text-xs font-mono text-neutral-400 overflow-x-auto max-h-48 overflow-y-auto whitespace-pre-wrap">
            {info.result}
          </pre>
        </div>
      )}
    </div>
  );
}
