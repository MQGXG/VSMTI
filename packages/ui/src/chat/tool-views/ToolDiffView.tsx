import { useState } from "react";
import { CodeBlock } from "../CodeBlock";
import { getFoldConfig } from "./tool-fold";

interface Props {
  result: string;
  args: Record<string, unknown>;
  name: string;
}

export function ToolDiffView({ result, args, name }: Props) {
  const config = getFoldConfig(name);
  const [expanded, setExpanded] = useState(config.defaultExpanded);

  const filePath = (args.path as string) || "";

  // write_file: args.content 就是写入的完整内容
  if (name === "write_file" && args.content) {
    const ext = filePath.split(".").pop() || "";
    return (
      <div className="glass rounded-xl border border-glass-border overflow-hidden animate-fade-in-up">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-glass-border bg-emerald-500/10">
          <span className="text-xs font-mono text-emerald-400 truncate">{filePath}</span>
          <span className="text-[10px] text-emerald-600 ml-auto">{typeof args.content === "string" ? `${args.content.length} bytes` : ""}</span>
        </div>
        <CodeBlock language={ext || "text"} code={String(args.content)} />
      </div>
    );
  }

  // edit_file: 从 result 或 args 提取 diff
  const oldStr = (args.oldString as string) || "";
  const newStr = (args.newString as string) || "";
  const resultLines = result.split("\n");
  const summary = resultLines[0] || "";

  // 构造 unified diff
  const oldLines = oldStr.split("\n");
  const newLines = newStr.split("\n");
  const diffContent = buildUnifiedDiff(filePath, oldLines, newLines);

  return (
    <div className="glass rounded-xl border border-glass-border overflow-hidden animate-fade-in-up">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-neutral-400 hover:text-neutral-200 transition-colors"
      >
        <span className="font-mono text-accent-400 truncate">{filePath}</span>
        <span className="truncate text-neutral-500 ml-2">{summary}</span>
      </button>
      {expanded && diffContent && (
        <div className="border-t border-glass-border overflow-x-auto">
          <table className="w-full text-xs font-mono">
            <tbody>
              {diffContent.map((line, i) => (
                <tr key={i} className={
                  line.type === "add" ? "bg-emerald-500/10" :
                  line.type === "del" ? "bg-red-500/10" : ""
                }>
                  <td className="w-8 text-right text-neutral-600 select-none border-r border-glass-border px-1">{line.oldNum || ""}</td>
                  <td className="w-8 text-right text-neutral-600 select-none border-r border-glass-border px-1">{line.newNum || ""}</td>
                  <td className={`px-3 py-0.5 ${
                    line.type === "add" ? "text-emerald-300" :
                    line.type === "del" ? "text-red-300" :
                    "text-neutral-400"
                  }`}>
                    {line.type === "add" ? "+" : line.type === "del" ? "-" : " "}{line.text}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

interface DiffLine {
  type: "add" | "del" | "ctx";
  text: string;
  oldNum?: string;
  newNum?: string;
}

function buildUnifiedDiff(filename: string, oldLines: string[], newLines: string[]): DiffLine[] {
  const result: DiffLine[] = [];

  // 简单 LCS 匹配（非完整 diff 算法，但足以显示编辑内容）
  let oi = 0, ni = 0;
  while (oi < oldLines.length || ni < newLines.length) {
    if (oi < oldLines.length && ni < newLines.length && oldLines[oi] === newLines[ni]) {
      result.push({ type: "ctx", text: oldLines[oi], oldNum: String(oi + 1), newNum: String(ni + 1) });
      oi++; ni++;
    } else if (oi < oldLines.length && (ni >= newLines.length || oldLines[oi] !== newLines[ni])) {
      result.push({ type: "del", text: oldLines[oi], oldNum: String(oi + 1) });
      oi++;
    } else if (ni < newLines.length) {
      result.push({ type: "add", text: newLines[ni], newNum: String(ni + 1) });
      ni++;
    }
  }

  return result;
}
