import { useState, useEffect } from "react";
import { Terminal, ChevronDown, ChevronRight } from "lucide-react";
import { getFoldConfig, expandToolOutput } from "./tool-fold";

interface Props {
  result: string;
  args: Record<string, unknown>;
}

export function ToolShellView({ result, args }: Props) {
  const command = (args.command as string) || "";
  const config = getFoldConfig("bash");
  const [expanded, setExpanded] = useState(config.defaultExpanded);
  const { preview, hasMore, totalLines } = expandToolOutput(result, "bash");

  return (
    <div className="glass rounded-xl border border-glass-border overflow-hidden animate-fade-in-up">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-neutral-400 hover:text-neutral-200 transition-colors"
      >
        <Terminal className="w-3.5 h-3.5 text-amber-500" />
        <code className="text-amber-300 truncate font-mono">{command || "shell"}</code>
        <span className="text-[10px] text-neutral-600 ml-auto">{totalLines} lines</span>
        {expanded ? <ChevronDown className="w-3 h-3 ml-1" /> : <ChevronRight className="w-3 h-3 ml-1" />}
      </button>

      {expanded && (
        <div className="border-t border-glass-border">
          <pre className="px-3 py-2 text-xs font-mono text-neutral-300 overflow-x-auto max-h-96 overflow-y-auto leading-relaxed whitespace-pre-wrap">
            {result}
          </pre>
        </div>
      )}

      {!expanded && (
        <div className="border-t border-glass-border">
          <pre className="px-3 py-2 text-xs font-mono text-neutral-400 overflow-x-auto whitespace-pre-wrap line-clamp-3">
            {preview}
          </pre>
          {hasMore && (
            <div className="px-3 pb-2 text-[10px] text-neutral-600">
              ... {totalLines} lines total
            </div>
          )}
        </div>
      )}
    </div>
  );
}
