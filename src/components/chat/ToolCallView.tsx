import { Loader2 } from "lucide-react";
import type { ToolCallInfo } from "./types";
import { ToolReadView } from "./tool-views/ToolReadView";
import { ToolDiffView } from "./tool-views/ToolDiffView";
import { ToolShellView } from "./tool-views/ToolShellView";
import { ToolSearchView } from "./tool-views/ToolSearchView";
import { ToolGenericView } from "./tool-views/ToolGenericView";

interface Props {
  info: ToolCallInfo;
}

const readTools = new Set(["read_file"]);
const editTools = new Set(["edit_file", "write_file"]);
const shellTools = new Set(["bash", "code_exec"]);
const searchTools = new Set(["web_search", "web_browse"]);

export function ToolCallView({ info }: Props) {
  if (info.status === "running" && !info.result) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
        <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: '#FFB800' }} />
        <span className="font-mono">{info.name}</span>
        <span className="animate-pulse" style={{ color: '#FFB800' }}>执行中...</span>
      </div>
    );
  }

  if (!info.result) {
    return null;
  }

  if (readTools.has(info.name)) {
    return <ToolReadView result={info.result} args={info.args} />;
  }

  if (editTools.has(info.name)) {
    return <ToolDiffView result={info.result} args={info.args} name={info.name} />;
  }

  if (shellTools.has(info.name)) {
    return <ToolShellView result={info.result} args={info.args} />;
  }

  if (searchTools.has(info.name)) {
    return <ToolSearchView result={info.result} args={info.args} />;
  }

  return <ToolGenericView info={info} />;
}
