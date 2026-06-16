import { useState } from "react";
import { CodeBlock } from "../CodeBlock";
import { getFoldConfig, expandToolOutput } from "./tool-fold";

interface Props {
  result: string;
  args: Record<string, unknown>;
}

export function ToolReadView({ result, args }: Props) {
  const filePath = (args.path as string) || "";
  const config = getFoldConfig("read_file");
  const [expanded, setExpanded] = useState(config.defaultExpanded);
  const { preview, hasMore, totalLines } = expandToolOutput(result, "read_file");

  // 检测是否为目录列表
  const isDirectory = result.startsWith("📁");

  if (isDirectory) {
    return <DirectoryView result={result} />;
  }

  // 文件内容
  const lines = result.split("\n");
  const contentStart = lines.findIndex((l) => l.startsWith("---") || l.startsWith("==="));
  const content = contentStart >= 0 ? lines.slice(contentStart + 1).join("\n") : result;
  const header = contentStart >= 0 ? lines.slice(0, contentStart).join("\n") : lines[0] || "";

  const ext = filePath.split(".").pop() || "";
  const langMap: Record<string, string> = {
    ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript",
    py: "python", rs: "rust", go: "go", java: "java", rb: "ruby",
    json: "json", yaml: "yaml", yml: "yaml", md: "markdown",
    css: "css", scss: "scss", html: "html", xml: "xml",
    sql: "sql", sh: "bash", bash: "bash", ps1: "powershell",
  };

  return (
    <div className="glass rounded-xl border border-glass-border overflow-hidden animate-fade-in-up">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 border-b border-glass-border bg-surface-900/50 text-xs"
      >
        <span className="font-mono text-accent-400 truncate">{filePath}</span>
        <span className="text-[10px] text-neutral-500">{header.replace(filePath, "").trim()}</span>
      </button>
      <div className={expanded ? "" : "max-h-48 overflow-hidden relative"}>
        <CodeBlock language={langMap[ext] || ext || "text"} code={expanded ? content : preview} />
        {!expanded && hasMore && (
          <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-surface-950 via-surface-950/80 to-transparent pt-8 pb-2 flex justify-center">
            <button
              onClick={(e) => { e.stopPropagation(); setExpanded(true); }}
              className="px-3 py-1 rounded-lg text-[10px] bg-accent-500/20 text-accent-400 hover:bg-accent-500/30"
            >
              展开全部 ({totalLines} lines)
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function DirectoryView({ result }: { result: string }) {
  const lines = result.split("\n");
  const header = lines[0] || "";
  const contentLines = lines.slice(2).filter((l) => !l.startsWith("子目录") && !l.startsWith("..."));
  const footer = lines.filter((l) => l.startsWith("子目录") || l.startsWith("..."));

  return (
    <div className="glass rounded-xl border border-glass-border overflow-hidden animate-fade-in-up">
      <div className="px-3 py-2 border-b border-glass-border bg-surface-900/50 text-xs text-neutral-400">
        {header}
      </div>
      <div className="px-3 py-2 space-y-0.5 text-xs font-mono">
        {contentLines.map((line, i) => (
          <div key={i} className="text-neutral-300">{line}</div>
        ))}
      </div>
      {footer.length > 0 && (
        <div className="px-3 py-1.5 border-t border-glass-border text-[10px] text-neutral-500">
          {footer.map((l, i) => <div key={i}>{l}</div>)}
        </div>
      )}
    </div>
  );
}
