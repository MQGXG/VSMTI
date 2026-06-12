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

interface Props {
  info: ToolCallInfo;
}

export function ToolCallView({ info }: Props) {
  const [expanded, setExpanded] = useState(false);
  const Icon = toolIcons[info.name] || Code;
  const isStreamingArgs = info.status === "running" && info.argsText !== undefined;

  return (
    <div className="ml-4 mt-2 border-l-2 border-neutral-700 pl-4">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-sm text-neutral-400 hover:text-neutral-200 transition-colors"
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
        <ChevronDown className={`w-3 h-3 transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>
      {expanded && (
        <div className="mt-2 space-y-2">
          <div className="bg-neutral-900 rounded-md p-3 text-xs">
            <div className="text-neutral-500 mb-1">参数：</div>
            {isStreamingArgs ? (
              <pre className="text-neutral-300 overflow-x-auto font-mono">
                {info.argsText}
                <span className="inline-block w-2 h-4 bg-amber-500/50 ml-0.5 animate-pulse" />
              </pre>
            ) : (
              <pre className="text-neutral-300 overflow-x-auto">{JSON.stringify(info.args, null, 2)}</pre>
            )}
          </div>
          {info.result && (
            <div className="bg-neutral-900 rounded-md p-3 text-xs">
              <div className="text-neutral-500 mb-1">结果：</div>
              <pre className="text-neutral-300 overflow-x-auto max-h-48 overflow-y-auto">{info.result}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
