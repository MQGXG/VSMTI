import { useState } from "react";
import { Check, Copy } from "lucide-react";

interface CodeBlockProps {
  code: string;
  language?: string;
}

export function CodeBlock({ code, language }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  return (
    <div className="relative group my-3 rounded-xl overflow-hidden" style={{ background: "var(--code-bg)", border: "1px solid var(--border)" }}>
      <div className="flex items-center justify-between px-4 py-2" style={{ borderBottom: "1px solid var(--border-light)" }}>
        <span className="text-[11px] font-mono font-medium" style={{ color: "var(--text-tertiary)" }}>
          {language || "code"}
        </span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 text-[11px] transition-all duration-150 px-2 py-1 rounded-md hover:bg-black/5 dark:hover:bg-white/5"
          style={{ color: copied ? "var(--accent)" : "var(--text-tertiary)" }}
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5" />
              <span>已复制</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span>复制</span>
            </>
          )}
        </button>
      </div>
      <pre className="overflow-x-auto p-4 text-sm leading-relaxed">
        <code className="font-mono text-[13px] whitespace-pre" style={{ color: "var(--text-primary)" }}>
          {code}
        </code>
      </pre>
    </div>
  );
}
