import { useState } from "react";
import { Loader2, CheckCircle2, XCircle, ChevronDown, Search, Code, FileText, Image, Globe } from "lucide-react";
import type { ToolCallInfo } from "./types";

const toolIcons: Record<string, typeof Code> = {
  web_search: Search,
  run_code: Code,
  read_file: FileText,
  write_file: FileText,
  data_analysis: Code,
  image_generate: Image,
  browse_web: Globe,
};

function getSettings(): Record<string, any> {
  try { return JSON.parse(localStorage.getItem("settings") || "{}") }
  catch { return {} }
}

function isShellTool(name: string): boolean {
  return name === "bash" || name === "terminal" || name === "run_code"
}

function isEditTool(name: string): boolean {
  return name === "write_file" || name === "edit_file" || name === "patch"
}

interface Props {
  info: ToolCallInfo;
}

export function ToolCallView({ info }: Props) {
  const settings = getSettings()
  const defaultExpanded = (isShellTool(info.name) && settings.expandShellTools) ||
    (isEditTool(info.name) && settings.expandEditTools)
  const [expanded, setExpanded] = useState(defaultExpanded);
  const Icon = toolIcons[info.name] || Code;
  const isStreamingArgs = info.status === "running" && info.argsText !== undefined;

  return (
    <div className="ml-8 mt-2 glass rounded-xl border border-glass-border overflow-hidden animate-fade-in-up">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-neutral-400 hover:text-neutral-200 transition-colors"
      >
        {info.status === "running" ? (
          <Loader2 className="w-4 h-4 animate-spin text-amber-500" />
        ) : info.status === "done" ? (
          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
        ) : (
          <XCircle className="w-4 h-4 text-red-500" />
        )}
        <Icon className="w-4 h-4" />
        <span className="font-mono text-xs">{info.name}</span>
        {isStreamingArgs && (
          <span className="text-[10px] text-amber-500 animate-pulse">接收参数...</span>
        )}
        <ChevronDown className={`w-3 h-3 ml-auto transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>
      {expanded && (
        <div className="px-3 pb-3 space-y-2 border-t border-glass-border pt-2">
          <div className="bg-surface-950/50 rounded-lg p-3 text-xs">
            <div className="text-neutral-500 mb-1">参数：</div>
            {isStreamingArgs ? (
              <pre className="text-neutral-300 overflow-x-auto font-mono">
                {info.argsText}
                <span className="inline-block w-2 h-4 bg-accent-400/50 ml-0.5 animate-pulse" />
              </pre>
            ) : (
              <pre className="text-neutral-300 overflow-x-auto">{JSON.stringify(info.args, null, 2)}</pre>
            )}
          </div>
          {info.result && (
            <div className="bg-surface-950/50 rounded-lg p-3 text-xs">
              <div className="text-neutral-500 mb-1">结果：</div>
              <pre className="text-neutral-300 overflow-x-auto max-h-48 overflow-y-auto">{info.result}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
