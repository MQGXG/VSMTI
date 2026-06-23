import { useState } from "react";
import { Loader2, ChevronDown, ChevronRight, CheckCircle2, XCircle, Terminal, FileText, Globe, Wrench } from "lucide-react";
import type { ToolCallInfo } from "./types";

interface Props {
  info: ToolCallInfo;
}

const TOOL_ICONS: Record<string, typeof Wrench> = {
  read_file: FileText,
  write_file: FileText,
  edit_file: FileText,
  list_files: FileText,
  bash: Terminal,
  code_exec: Terminal,
  web_search: Globe,
  web_browse: Globe,
  grep: Wrench,
  glob: Wrench,
};

export function ToolCallView({ info }: Props) {
  const [expanded, setExpanded] = useState(false);
  const Icon = TOOL_ICONS[info.name] || Wrench;

  if (info.status === "running" && !info.result) {
    return (
      <div className="tool-call-item flex items-center gap-2 px-3 py-2 rounded-lg text-xs" style={{ background: "var(--surface-secondary)", border: "1px solid var(--border-light)" }}>
        <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: "var(--accent)" }} />
        <Icon className="w-3.5 h-3.5" style={{ color: "var(--text-tertiary)" }} />
        <span className="font-mono font-medium" style={{ color: "var(--text-primary)" }}>{info.name}</span>
        <span className="text-[10px] ml-auto" style={{ color: "var(--accent)" }}>执行中</span>
      </div>
    );
  }

  if (!info.result) {
    return null;
  }

  const isSuccess = info.status === "done";

  return (
    <div className="tool-call-item rounded-lg overflow-hidden" style={{ border: "1px solid var(--border-light)" }}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors hover:bg-black/3 dark:hover:bg-white/3"
        style={{ background: "var(--surface-secondary)" }}
      >
        {isSuccess ? (
          <CheckCircle2 className="w-3.5 h-3.5" style={{ color: "var(--success)" }} />
        ) : (
          <XCircle className="w-3.5 h-3.5" style={{ color: "var(--error)" }} />
        )}
        <Icon className="w-3.5 h-3.5" style={{ color: "var(--text-tertiary)" }} />
        <span className="font-mono font-medium" style={{ color: "var(--text-primary)" }}>{info.name}</span>
        {expanded ? (
          <ChevronDown className="w-3 h-3 ml-auto" style={{ color: "var(--text-tertiary)" }} />
        ) : (
          <ChevronRight className="w-3 h-3 ml-auto" style={{ color: "var(--text-tertiary)" }} />
        )}
      </button>

      {expanded && (
        <div className="border-t" style={{ borderColor: "var(--border-light)" }}>
          <pre className="px-3 py-2 text-xs font-mono overflow-x-auto max-h-64 overflow-y-auto whitespace-pre-wrap custom-scrollbar"
            style={{ color: "var(--text-secondary)", background: "var(--code-bg)" }}>
            {info.result}
          </pre>
        </div>
      )}
    </div>
  );
}
