import { useState } from "react";
import { getFoldConfig, expandToolOutput } from "./tool-fold";
import { cn } from "../../lib/utils";

interface Props {
  result: string;
  args: Record<string, unknown>;
}

export function ToolReadView({ result, args }: Props) {
  const filePath = (args.path as string) || "";
  const config = getFoldConfig("read_file");
  const [expanded, setExpanded] = useState(config.defaultExpanded);
  const { preview, hasMore, totalLines } = expandToolOutput(result, "read_file");

  const isDirectory = result.startsWith("📁");
  if (isDirectory) {
    return <DirectoryView result={result} />;
  }

  const lines = result.split("\n");
  const contentStart = lines.findIndex((l) => l.startsWith("---") || l.startsWith("==="));
  const content = contentStart >= 0 ? lines.slice(contentStart + 1).join("\n") : result;
  const header = contentStart >= 0 ? lines.slice(0, contentStart).join("\n") : lines[0] || "";

  return (
    <div className="glass rounded-xl border border-glass-border overflow-hidden animate-fade-in-up">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 border-b border-glass-border bg-surface-900/50 text-xs"
      >
        <span className="font-mono text-accent-400 truncate">{filePath}</span>
        <span className="text-[10px] text-neutral-500">{header.replace(filePath, "").trim()}</span>
      </button>
      <div className={cn(expanded ? "" : "max-h-48 overflow-hidden relative")}>
        <pre
          className="p-4 text-sm font-mono overflow-x-auto whitespace-pre-wrap leading-relaxed"
          style={{ color: 'var(--text-primary)', background: 'var(--code-bg)' }}
        >
          {expanded ? content : preview}
        </pre>
        {!expanded && hasMore && (
          <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-neutral-900/80 to-transparent pt-8 pb-2 flex justify-center">
            <button
              onClick={(e) => { e.stopPropagation(); setExpanded(true); }}
              className={cn(
                "px-3 py-1 rounded-lg text-[10px] transition-colors",
                "hover:bg-accent-500/30"
              )}
              style={{ background: 'rgba(0, 217, 192, 0.2)', color: 'var(--accent)' }}
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
