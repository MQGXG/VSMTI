import { useEffect, useRef, useState } from "react";
import mermaid from "mermaid";

function getMermaidTheme() {
  const isDark = document.documentElement.classList.contains("dark");
  return {
    theme: (isDark ? "dark" : "default") as "dark" | "default",
    themeVariables: isDark
      ? {
          background: "#12141c",
          primaryColor: "#1e2130",
          primaryTextColor: "#e5e7eb",
          primaryBorderColor: "#374151",
          lineColor: "#6b7280",
          secondaryColor: "#161922",
          tertiaryColor: "#1a1d2b",
          fontSize: "14px",
        }
      : {
          background: "#f9fafb",
          primaryColor: "#e5e7eb",
          primaryTextColor: "#111827",
          primaryBorderColor: "#d1d5db",
          lineColor: "#6b7280",
          secondaryColor: "#f3f4f6",
          tertiaryColor: "#e5e7eb",
          fontSize: "14px",
        },
  };
}

mermaid.initialize({
  startOnLoad: false,
  ...getMermaidTheme(),
  flowchart: { useMaxWidth: true, htmlLabels: true },
  sequence: { useMaxWidth: true },
  gantt: { useMaxWidth: true },
});

interface Props {
  code: string;
}

export function MermaidBlock({ code }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const id = `mermaid-${crypto.randomUUID().slice(0, 8)}`;

    async function render() {
      try {
        setLoading(true);
        setError(null);
        const { svg } = await mermaid.render(id, code);
        if (!cancelled && containerRef.current) {
          containerRef.current.innerHTML = svg;
        }
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message || "渲染失败");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    render();
    return () => { cancelled = true; };
  }, [code]);

  if (error) {
    return (
      <div className="my-4 rounded-xl overflow-hidden code-block">
        <div className="flex items-center justify-between px-4 py-2.5" style={{ background: 'var(--surface-secondary)', borderBottom: '1px solid var(--border)' }}>
          <span className="text-[11px] font-mono font-medium" style={{ color: 'var(--text-secondary)' }}>mermaid</span>
        </div>
        <div className="p-4 text-xs text-red-400 whitespace-pre-wrap font-mono">{error}</div>
      </div>
    );
  }

  return (
    <div className="my-4 rounded-xl overflow-hidden code-block">
      <div className="flex items-center justify-between px-4 py-2.5" style={{ background: 'var(--surface-secondary)', borderBottom: '1px solid var(--border)' }}>
        <span className="text-[11px] font-mono font-medium" style={{ color: 'var(--text-secondary)' }}>mermaid</span>
      </div>
      <div ref={containerRef} className="p-4 flex justify-center overflow-x-auto">
        {loading && <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>渲染中...</span>}
      </div>
    </div>
  );
}
