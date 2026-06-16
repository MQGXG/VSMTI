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
    <div className="relative group my-4 rounded-xl overflow-hidden" style={{ background: '#0D1117', border: '1px solid #1A2E35' }}>
      {/* 语言标签和复制按钮 */}
      <div className="flex items-center justify-between px-4 py-2.5" style={{ background: '#0F1A20', borderBottom: '1px solid #1A2E35' }}>
        <span className="text-[11px] font-mono font-medium" style={{ color: '#5C8D8A' }}>
          {language || "code"}
        </span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 text-[11px] transition-all duration-200 px-2 py-1 rounded-lg hover:bg-neutral-700/50"
          style={{ color: copied ? '#00D9C0' : '#5C8D8A' }}
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
      {/* 代码内容 */}
      <pre className="overflow-x-auto p-4 text-sm leading-relaxed">
        <code className="font-mono text-[13px] whitespace-pre" style={{ color: '#E8F4F0' }}>
          {code}
        </code>
      </pre>
    </div>
  );
}
